#!/usr/bin/env bash
# Vkinder AWS helper: deploy the API with its private PostgreSQL database, load
# the data, and pause, resume or remove everything.
#
# Run from the repository root on a machine with the AWS CLI v2 and AWS SAM CLI,
# signed in as an IAM admin user (not the root user):
#
#   infra/vkinder_aws.sh deploy you@example.com   # create or update, load data, switch API to the database
#   infra/vkinder_aws.sh load [dataset ...]        # reload all datasets, or only the ones named
#   infra/vkinder_aws.sh status                    # credits left, database state, API address
#   infra/vkinder_aws.sh pause                     # stop the database and disable the functions
#   infra/vkinder_aws.sh resume                    # undo pause (or an automatic credit-guard stop)
#   infra/vkinder_aws.sh teardown                  # delete the whole stack
#
# Settings: AWS_PROFILE (optional), VKINDER_REGION (default ap-southeast-2),
# VKINDER_STACK (default vkinder). See docs/AWS_VKINDER.md.

set -euo pipefail

REGION="${VKINDER_REGION:-ap-southeast-2}"
STACK="${VKINDER_STACK:-vkinder}"
DB_ID="vkinder-db"
LOADER="vkinder-loader"
ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

say() { printf '\n== %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
aws_r() { aws --region "$REGION" "$@"; }

output() {
    aws_r cloudformation describe-stacks --stack-name "$STACK" \
        --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text 2>/dev/null || true
}

api_function() {
    aws_r cloudformation describe-stack-resource --stack-name "$STACK" \
        --logical-resource-id KinderPrintApiFunction \
        --query StackResourceDetail.PhysicalResourceId --output text
}

check_tools() {
    command -v aws >/dev/null || die "install the AWS CLI v2 first"
    command -v sam >/dev/null || die "install the AWS SAM CLI first"
    local arn
    arn=$(aws sts get-caller-identity --query Arn --output text) || die "AWS CLI is not signed in"
    printf 'Signed in as %s (region %s, stack %s)\n' "$arn" "$REGION" "$STACK"
    case "$arn" in
        *:root) printf '%s\n' "Warning: these are root-user keys. Create an IAM admin user and use its keys instead." >&2 ;;
    esac
}

sam_deploy() {
    local backend="$1" email="$2"
    sam deploy --template-file template.yaml --stack-name "$STACK" --region "$REGION" \
        --resolve-s3 --capabilities CAPABILITY_IAM --no-confirm-changeset --no-fail-on-empty-changeset \
        --tags Project=Vkinder \
        --parameter-overrides CreateDatabase=true DataBackend="$backend" AlertEmail="$email"
}

run_loader() {
    local payload='{}' result
    if [ "$#" -gt 0 ]; then
        payload=$(printf '"%s",' "$@")
        payload="{\"only\": [${payload%,}]}"
    fi
    result=$(mktemp)
    say "Loading datasets into the database (a few minutes)"
    aws_r lambda invoke --function-name "$LOADER" --cli-binary-format raw-in-base64-out \
        --cli-read-timeout 960 --payload "$payload" "$result" >/dev/null
    local code=0
    python3 - "$result" <<'PY' || code=1
import json, sys
body = json.load(open(sys.argv[1]))
print(body.get("output", "")[-3000:])
if body.get("errors"):
    print(body["errors"][-3000:], file=sys.stderr)
sys.exit(0 if body.get("status") == "loaded" else 1)
PY
    rm -f "$result"
    return $code
}

smoke_test() {
    local url
    url=$(output ApiUrl)
    say "Checking the API at $url"
    curl --silent --show-error --fail --max-time 30 "$url/api/health/data" >/dev/null \
        && printf 'API answered from the database.\n' \
        || printf 'The API did not answer yet; a cold start can take a few seconds. Try: curl %s/api/health/data\n' "$url"
}

cmd="${1:-help}"
shift || true
case "$cmd" in
    deploy)
        email="${1:-${VKINDER_ALERT_EMAIL:-}}"
        [ -n "$email" ] || die "give an email for cost alerts: infra/vkinder_aws.sh deploy you@example.com"
        check_tools
        say "Packaging the API"
        ./backend/prepare_lambda_package.sh
        say "Deploying (first run creates the database: about 10-15 minutes)"
        # Files mode first, so the API keeps working while the empty database is loaded.
        sam_deploy files "$email"
        run_loader
        say "Switching the API to the database"
        sam_deploy postgres "$email"
        smoke_test
        say "Done. Confirm the subscription email from AWS Notifications so cost alerts reach you."
        printf 'API URL (for VITE_API_BASE_URL): %s\n' "$(output ApiUrl)"
        ;;
    load)
        check_tools
        run_loader "$@"
        ;;
    status)
        say "Credits"
        aws freetier get-account-plan-state --region us-east-1 \
            --query '{plan:accountPlanType,status:accountPlanStatus,credits:accountPlanRemainingCredits.amount,expires:accountPlanExpirationDate}' \
            --output table 2>/dev/null || printf 'Could not read credits (see Billing > Credits in the console).\n'
        say "Database"
        aws_r rds describe-db-instances --db-instance-identifier "$DB_ID" \
            --query 'DBInstances[0].{status:DBInstanceStatus,class:DBInstanceClass,storageGB:AllocatedStorage,version:EngineVersion}' \
            --output table 2>/dev/null || printf 'No database (stack not deployed or removed).\n'
        say "API"
        printf '%s\n' "$(output ApiUrl)"
        ;;
    pause)
        check_tools
        if aws_r rds stop-db-instance --db-instance-identifier "$DB_ID" >/dev/null; then
            printf 'Database stopping.\n'
        else
            printf 'Database was not running.\n'
        fi
        for fn in "$(api_function)" "$LOADER"; do
            aws_r lambda put-function-concurrency --function-name "$fn" --reserved-concurrent-executions 0 >/dev/null
            printf 'Function %s disabled.\n' "$fn"
        done
        printf 'Note: AWS restarts a stopped database after 7 days; the daily credit guard does not re-stop it\n'
        printf 'unless credits are low, so run pause again within 7 days or use teardown.\n'
        ;;
    resume)
        check_tools
        if aws_r rds start-db-instance --db-instance-identifier "$DB_ID" >/dev/null; then
            printf 'Database starting (a few minutes).\n'
        else
            printf 'Database is already running.\n'
        fi
        for fn in "$(api_function)" "$LOADER"; do
            aws_r lambda delete-function-concurrency --function-name "$fn" || true
            printf 'Function %s enabled.\n' "$fn"
        done
        ;;
    teardown)
        check_tools
        printf 'This deletes the Vkinder API, database, network and alerts in %s.\n' "$REGION"
        printf 'A final database snapshot is kept (pennies per month); its name is printed below.\n'
        read -r -p "Type DELETE to continue: " answer
        [ "$answer" = "DELETE" ] || die "cancelled"
        sam delete --stack-name "$STACK" --region "$REGION" --no-prompts
        aws_r rds describe-db-snapshots --snapshot-type manual \
            --query "DBSnapshots[?DBInstanceIdentifier=='$DB_ID'].DBSnapshotIdentifier" --output text
        printf 'To remove the snapshot too: aws rds delete-db-snapshot --region %s --db-snapshot-identifier <name>\n' "$REGION"
        ;;
    *)
        sed -n '2,16p' "$0"
        ;;
esac
