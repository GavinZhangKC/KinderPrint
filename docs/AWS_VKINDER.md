# Vkinder on AWS: database stack, costs and the credit guard

## Current deployment responsibilities — 12 October 2026

The production frontend at `https://vkinder.me` / `https://www.vkinder.me`
uses the team member's complete RDS-connected backend:
`https://aockxpua5f.execute-api.ap-southeast-2.amazonaws.com`.
Its owner maintains Lambda deployments, database loads, CORS and AWS resources.
This connection mode and API coverage were confirmed by the owner; merging code
does not itself verify which commit or dataset version is deployed there.

The original backend remains available at
`https://ufeig1cv2i.execute-api.ap-southeast-2.amazonaws.com`, in stack
`kinderprint-backend-iteration1`, for the historical frozen frontends. Do not
change their API configuration or stop that Lambda as part of production updates.

For a production frontend release, set Vercel Production's `VITE_API_BASE_URL`
to the intended API before deploying `main`. Check the deployed pages afterwards.
Frozen deployments must retain their own API settings when rebuilt; shared Vercel
environment settings can otherwise change their destination on a later build.
Backend code changes require a backend deployment by its owner, and changed
runtime datasets require a database load. Neither is performed by a Git merge
or a Vercel frontend deployment.

The commands below default to a **separate stack named `vkinder`**; they do not
update `kinderprint-backend-iteration1`. Check the AWS identity, region, stack and
resource names before running them. This document is not permission to create,
pause or delete either deployment.

This is how Vkinder runs on its own AWS account with a PostgreSQL database. It
is paid for from the account's AWS credits, and it stops itself before they run
out.

## What gets created

The resources are created by `template.yaml` only when `CreateDatabase=true`.
Without it, a deploy behaves exactly as before.

| Resource | Purpose |
|---|---|
| `vkinder-vpc` with two private subnets | A network with no internet gateway or NAT. Nothing outside it can reach the database. |
| `vkinder-db`: RDS PostgreSQL 17, db.t4g.micro, 20 GB gp3, single zone, encrypted, TLS required | Stores every dataset (typed tables) and every JSON artefact (`jsonb`), in schema `vkinder`. |
| Secrets `vkinder/db/admin` and `vkinder/db/api` | Generated passwords. Nobody types or sees them. |
| API function (existing) | Runs inside the private network and reads as `vkinder_api`, a read-only login. |
| `vkinder-loader` function | Admin-only. Copies the packaged datasets into the database in one transaction. It has no public trigger. |
| `vkinder-credit-guard` function, run daily | Checks the remaining credits and stops spending (see below). |
| `vkinder-alerts` email topic and the `vkinder-monthly-cost` budget (alerts sent through the topic) | Cost and credit emails. |

Credentials reach the functions at deploy time through CloudFormation dynamic
references. This means the functions need no NAT gateway (about $33/month) and
no Secrets Manager endpoint (about $15/month).

Principals permitted to read Lambda configuration may see the database password
in that configuration. Restrict this permission to people who need it; team
membership alone is not a reason to grant configuration or secret access.

## Historical cost estimate (Sydney region, October 2026)

The following figures are the original deployment author's estimates, not a
current quote or a guarantee of free-tier coverage. Confirm actual pricing,
account credits and usage in the owning account before creating resources.

| Item | Per month |
|---|---|
| db.t4g.micro instance | about $18 |
| 20 GB gp3 storage | about $3 |
| Two secrets | $0.80 |
| Lambda, API Gateway, logs and backups at student traffic | under $1 |
| **Total** | **about $22** |

The author's original planning example used $134.66 of credit and 120 days
remaining. Those were account-specific historical figures, not this repository's
current balance. Check the owning account's Billing and Free Tier information.

## The credit guard: stopping when credits run out

The guard runs every day at 21:00 UTC (07:00 or 08:00 in Melbourne). It reads
the free-plan state from the AWS Free Tier API.

| Condition | Action |
|---|---|
| Credits under $30, or 14 days or fewer left | Daily warning email |
| Credits under $10 (`StopCreditsUsd`), 3 days or fewer left (`StopDays`), or plan expired | Stops the database, sets the API and loader functions to 0 concurrency, and sends an email |
| Credit balance cannot be read | Sends a warning email and changes nothing |

The monthly budget sends a second, independent email when actual cost passes
80% of $30 or the forecast passes $30. Credits are excluded, so it shows real
usage.

**Limits**

- **Stopped is not free.** A stopped database still pays for storage (about $3
  a month). AWS also restarts a stopped database after 7 days, so the guard
  stops it again each day while credits are low. To end all cost, run
  `infra/vkinder_aws.sh teardown`.
- **The free plan may close the account.** If the account is still on the AWS
  Free plan when the credits or the plan end, AWS closes the account
  automatically unless it is upgraded. Keep the code in GitHub, not only in
  AWS.

## Commands

Run these from the repository root. You need the AWS CLI v2 and the AWS SAM CLI,
signed in as an authorised IAM deployment identity, not the root user. The
identity needs the permissions required by the selected resources; do not assume
the existing Lambda-only deployer can also create the database stack.

```bash
infra/vkinder_aws.sh deploy you@example.com   # first deploy about 15 min; loads data and switches the API to the database
infra/vkinder_aws.sh status                    # credits, database state, API URL
infra/vkinder_aws.sh load                      # reload all datasets after a data refresh
infra/vkinder_aws.sh load family_fit boundary  # reload only some datasets
infra/vkinder_aws.sh pause                     # stop the database and disable the functions
infra/vkinder_aws.sh resume                    # undo pause, or an automatic guard stop
infra/vkinder_aws.sh teardown                  # delete everything; a final snapshot is kept
```

`deploy` runs in three steps:

1. It deploys in files mode, so the API works while the new database is empty.
2. It runs the loader. The loader also creates the read-only `vkinder_api`
   login.
3. It redeploys with `DataBackend=postgres`.

If the load fails, the API stays in files mode.

After deploying, set the Vercel `VITE_API_BASE_URL` to the printed API URL
only when the team agrees to move the live site to this account.

## Rollback

```bash
sam deploy --template-file template.yaml --stack-name vkinder --region ap-southeast-2 \
  --resolve-s3 --capabilities CAPABILITY_IAM \
  --parameter-overrides CreateDatabase=true DataBackend=files AlertEmail=you@example.com
```

The data files are still packaged with the API, so files mode needs no rebuild.

## Tests

- Credit guard: `python3 -m pytest infra/credit_guard/tests` (10 tests).
- Loader and API against PostgreSQL: see "Testing" in `docs/DATABASE.md`.
  - The original author reported running the loader as Lambda would: from the built package,
    with the template's environment and a read-only `vkinder_api` login.
  - The author reported identical database/file API responses. This is a
    historical verification record, not confirmation of the current remote
    deployment. File-mode tests skip live PostgreSQL parity tests when database
    configuration is absent.
