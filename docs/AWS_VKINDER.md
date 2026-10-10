# Vkinder on AWS: database stack, costs and the credit guard

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
| `vkinder-alerts` email topic and the `vkinder-monthly` budget | Cost and credit emails. |

Credentials reach the functions at deploy time through CloudFormation dynamic
references. This means the functions need no NAT gateway (about $33/month) and
no Secrets Manager endpoint (about $15/month).

Anyone with Lambda read access in the account can see the database password in
the function configuration. Give account access only to the team.

## Cost (estimate, Sydney region)

| Item | Per month |
|---|---|
| db.t4g.micro instance | about $18 |
| 20 GB gp3 storage | about $3 |
| Two secrets | $0.80 |
| Lambda, API Gateway, logs and backups at student traffic | under $1 |
| **Total** | **about $22** |

With $134.66 of credit and 120 days left (October 2026), four months costs
about $90, which leaves headroom. Check the real figure in Billing, under Bills,
after the first few days.

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
signed in as an IAM admin user, not the root user.

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
  - The loader was also run as the Lambda would run it: from the built package,
    with the template's environment and a read-only `vkinder_api` login.
  - The API then served identical responses from the database and from the
    files.
