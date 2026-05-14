# Aeglero EMR Infrastructure

Terraform that builds the AWS infrastructure for the Aeglero EMR application: VPC, RDS Postgres, ECS Fargate, ALB, CloudFront, S3, KMS, Secrets Manager, plus optional compliance tooling (CloudTrail, WAF, GuardDuty, access logs) controlled by feature flags.

## Two deployment profiles

The same Terraform code supports two modes, switched at apply time.

### Dev mode

Daily-use posture. Cheap. Single-AZ RDS, no CloudTrail/WAF/GuardDuty/access logs. Auto-loaded via `terraform.tfvars`.

```bash
cd infra
terraform apply
```

### Production mode

Full HIPAA-aligned posture. Multi-AZ RDS, CloudTrail with KMS-encrypted object-locked S3, AWS WAF with managed rule groups, GuardDuty, and ALB/CloudFront access logs.

```bash
cd infra
terraform apply -var-file=prod.tfvars
```

`prod.tfvars` overrides every dev flag back to production values, so the mode you get is determined entirely by which `.tfvars` file is in effect.

## First-time setup

Before either profile works, the bootstrap module needs to have been applied once to create the remote state backend (S3 + DynamoDB + KMS). See [`bootstrap/README.md`](bootstrap/README.md). After that's done, you never touch bootstrap again.

## What each profile includes

| Resource | Dev | Prod |
|---|---|---|
| VPC, subnets, NAT, security groups | ✓ | ✓ |
| KMS keys (4 customer-managed, rotated annually) | ✓ | ✓ |
| Secrets Manager (DB password, Flask SECRET_KEY, DATABASE_URL) | ✓ | ✓ |
| RDS Postgres | Single-AZ | Multi-AZ |
| ECR repo + ECS Fargate cluster + ALB | ✓ | ✓ |
| Frontend S3 + CloudFront + wildcard DNS | ✓ | ✓ |
| CloudTrail (KMS-encrypted, object-locked) | — | ✓ |
| AWS WAF on CloudFront | — | ✓ |
| GuardDuty | — | ✓ |
| ALB + CloudFront access logs to S3 | — | ✓ |

Every flag is independently toggleable. If you wanted, for instance, CloudTrail without the rest, edit `terraform.tfvars` and flip just that flag.

## Variable reference

All toggles live in `variables.tf`. Defaults reflect production-tuned values; `terraform.tfvars` overrides them down to dev mode for daily use. The key flags:

| Variable | Dev | Prod |
|---|---|---|
| `rds_multi_az` | false | true |
| `enable_cloudtrail` | false | true |
| `enable_waf` | false | true |
| `enable_guardduty` | false | true |
| `enable_alb_access_logs` | false | true |
| `enable_cloudfront_access_logs` | false | true |

## Deploying from scratch

Five steps end to end, ~25-30 min total. Steps 1 and 2 dominate the wall clock (RDS and CloudFront propagation).

Examples below use the dev account values from a real deploy — substitute your own where they appear (`<account>`, `<distribution-id>`, etc.) or read them from `terraform output` after step 1.

### 0. Prep

Make sure the right AWS profile is active. The terraform code assumes account `300724397697` in `us-east-2`.

```bash
export AWS_PROFILE=aeglero          # bash
# or
$env:AWS_PROFILE = "aeglero"         # PowerShell

aws sts get-caller-identity          # confirm the account/region
```

### 1. terraform apply

```bash
cd infra
terraform init                       # safe to re-run; pulls provider updates
terraform plan                       # sanity check before apply
terraform apply
```

Dev mode plans ~76 resources. Total apply time: ~10-15 min, dominated by RDS (~9 min) and CloudFront (~5 min) running in parallel after the VPC and IAM finish.

### 2. Build and push the backend image to ECR

```bash
# bash — pipe stdin works
aws ecr get-login-password --region us-east-2 \
  | docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-2.amazonaws.com
```

```powershell
# PowerShell — the stdin pipe mangles the token, pass it as an argument
$pw = aws ecr get-login-password --region us-east-2
docker login --username AWS --password $pw <account>.dkr.ecr.us-east-2.amazonaws.com
```

Then (identical in both shells):

```bash
docker build -t aeglero-emr-backend ./backend
docker tag aeglero-emr-backend:latest <account>.dkr.ecr.us-east-2.amazonaws.com/aeglero-emr-backend:latest
docker push <account>.dkr.ecr.us-east-2.amazonaws.com/aeglero-emr-backend:latest
```

If the ECS service tried to launch before the image was pushed, it has backed off. Kick it:

```bash
aws ecs update-service --cluster aeglero-emr --service aeglero-emr-backend --force-new-deployment
```

Within ~2 min the service should show `runningCount: 1`:

```bash
aws ecs describe-services --cluster aeglero-emr --services aeglero-emr-backend --query 'services[0].{Running:runningCount,Desired:desiredCount,Pending:pendingCount}'
```

### 3. Build and sync the frontend bundle

```bash
cd ../frontend
pnpm install --frozen-lockfile
pnpm build                           # produces ./out
aws s3 sync ./out/ s3://aeglero-emr-frontend/ --delete
aws cloudfront create-invalidation --distribution-id <distribution-id> --paths "/*"
```

On PowerShell, replace `pnpm` with `pnpm.cmd` (PowerShell's execution policy blocks the `.ps1` wrapper out of the box). Everything else is identical.

The invalidation is mandatory — without it CloudFront edges keep serving the old bundle for up to 24 hours.

### 4. Seed the first tenant + admin user

The seed script (`backend/scripts/_private/seed_demo.py`) is gitignored and is not baked into the container image. Upload it temporarily to S3 and have the container fetch it via a presigned URL — that sidesteps the 32KB Windows command-line limit that base64-encoding the script directly would hit.

From the repo root:

```bash
# bash
aws s3 cp backend/scripts/_private/seed_demo.py s3://aeglero-emr-frontend/_tmp/seed_demo.py
URL=$(aws s3 presign s3://aeglero-emr-frontend/_tmp/seed_demo.py --expires-in 3600)
TASK=$(aws ecs list-tasks --cluster aeglero-emr --service-name aeglero-emr-backend --query 'taskArns[0]' --output text)
aws ecs execute-command --cluster aeglero-emr --task $TASK --container backend --interactive --command "/bin/bash"
```

```powershell
# PowerShell — same commands, different variable capture syntax
aws s3 cp backend\scripts\_private\seed_demo.py s3://aeglero-emr-frontend/_tmp/seed_demo.py
$URL = aws s3 presign s3://aeglero-emr-frontend/_tmp/seed_demo.py --expires-in 3600
$TASK = aws ecs list-tasks --cluster aeglero-emr --service-name aeglero-emr-backend --query 'taskArns[0]' --output text
aws ecs execute-command --cluster aeglero-emr --task $TASK --container backend --interactive --command "/bin/bash"
```

If the URL doesn't auto-fill into the next step's `<paste-URL-here>`, run `echo $URL` (bash) or `$URL` (PowerShell) to print it for copy-paste.

Inside the container (the prompt looks like `root@ip-10-0-10-x:/app#`), paste:

```bash
# Download the script to /tmp using stdlib urllib (no extra deps needed)
python -c "import urllib.request; open('/tmp/seed_demo.py','wb').write(urllib.request.urlopen('<paste-URL-here>').read())"

# Run it — PYTHONPATH=/app so it can `from app import create_app`
PYTHONPATH=/app python /tmp/seed_demo.py

exit
```

Whatever credentials the script prints (tenant slug, admin email + password) are your first login. Write them down.

Clean up:

```bash
aws s3 rm s3://aeglero-emr-frontend/_tmp/seed_demo.py
```

### 5. Smoke test

```bash
curl https://democlinic.aeglero.com/
```

Should return 200 with HTML. The `/healthz` endpoint is backend-only and isn't reachable from the browser path — CloudFront routes only `/api/*` to the ALB, and the ALB ingress is locked to CloudFront edges, so direct curl from your laptop won't reach it. To exercise the backend through CloudFront, hit any `/api/...` endpoint.

Open `https://democlinic.aeglero.com` in a browser and log in with the seeded credentials.

## Redeploying after a code change

After step 5 the stack is up. To ship a new build:

**Backend changes** — repeat step 2 (push a new image) then force a deploy:

```bash
docker build -t aeglero-emr-backend ./backend
docker tag aeglero-emr-backend:latest <account>.dkr.ecr.us-east-2.amazonaws.com/aeglero-emr-backend:latest
docker push <account>.dkr.ecr.us-east-2.amazonaws.com/aeglero-emr-backend:latest
aws ecs update-service --cluster aeglero-emr --service aeglero-emr-backend --force-new-deployment
```

**Frontend changes** — repeat step 3 (replace `pnpm` with `pnpm.cmd` on PowerShell):

```bash
cd frontend
pnpm build
aws s3 sync ./out/ s3://aeglero-emr-frontend/ --delete
aws cloudfront create-invalidation --distribution-id <distribution-id> --paths "/*"
```

Don't forget the invalidation. Frontend syncs without one will look like nothing changed because CloudFront serves the cached files at the edge.

**Infra changes** — `terraform plan` to review, then `terraform apply`.

## Tearing down

```bash
cd infra
terraform destroy
```

Add `-var-file=prod.tfvars` if you applied prod mode. There's a small cleanup tail over 7 days for KMS keys finishing their pending-deletion windows. The bootstrap module stays running so the next deploy is one `terraform apply` away.

## Scanner suppressions

Every `# checkov:skip=...` or `# trivy:ignore:...` comment in this folder is documented (with removal criteria) in [`../docs/iac-scan-exceptions.md`](../docs/iac-scan-exceptions.md).

## Common gotchas

These are real things this deploy hit the first time through. Documented so the next person doesn't have to debug from zero.

### Terraform apply: secret already scheduled for deletion

```
InvalidRequestException: You can't create this secret because a secret with this name is already scheduled for deletion.
```

Secrets from an earlier `terraform destroy` are still in their AWS recovery window. Force-delete them, then re-run `terraform apply`:

```bash
aws secretsmanager delete-secret --secret-id aeglero-emr/db-master-password --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id aeglero-emr/flask-secret-key   --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id aeglero-emr/database-url        --force-delete-without-recovery
```

Future destroys won't hit this — `recovery_window_in_days = 0` is set on all three secrets so they're deleted immediately.

### Docker login fails with `400 Bad Request` on PowerShell

PowerShell's stdin piping appends a CRLF that the registry rejects. Two fixes:

1. **Pass the password as an argument instead of via stdin** (the ECR token is a 12-hour credential, so the "insecure on command line" warning is fine to ignore):
   ```powershell
   $pw = aws ecr get-login-password --region us-east-2
   docker login --username AWS --password $pw <account>.dkr.ecr.us-east-2.amazonaws.com
   ```
2. **If you still get 400** after that, Docker Desktop's credential helper is intercepting the login. Remove `"credsStore": "desktop"` from `%USERPROFILE%\.docker\config.json` and retry. Restore the line after if you want Docker Desktop managing other registry credentials again.

### ECS service shows `runningCount: 0` and `pendingCount: 0`

The service is in deployment back-off after repeated failures. `aws ecs describe-services ... --query 'services[0].events[0:10]'` shows why. Common upstream causes:

- **`CannotPullContainerError: ... not found`** — image wasn't in ECR when the service tried. Push it (step 2) and then force a new deployment.
- **`ResourceInitializationError: unable to pull secrets ... AWSCURRENT not found`** — secret has no version yet. `database_url` depends on the RDS endpoint and RDS takes ~9 min to come up, so the first ~9 min of the apply this happens. Resolves itself once RDS finishes and the secret version is written.

After either is fixed:

```bash
aws ecs update-service --cluster aeglero-emr --service aeglero-emr-backend --force-new-deployment
```

### Container starts but gunicorn fails with `FileNotFoundError: No usable temporary directory found`

The `readonlyRootFilesystem` task definition setting (CKV_AWS_336) doesn't work on Fargate with this Dockerfile's non-root `app` user: the mounted tmpfs comes up root-owned and uid 1000 can't write to it. Currently shipped with `readonlyRootFilesystem = false` for this reason — see the inline comment in [ecs.tf](ecs.tf) and [`../docs/iac-scan-exceptions.md`](../docs/iac-scan-exceptions.md) for the gap. Don't flip it back on without a working entrypoint shim to chown the tmpfs.

### `pnpm.ps1 cannot be loaded because running scripts is disabled`

PowerShell execution policy blocks the pnpm wrapper script. Two fixes:

1. Use the `.cmd` wrapper (no policy change): `pnpm.cmd install --frozen-lockfile`
2. Allow local scripts user-wide once:
   ```powershell
   Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
   ```

### Seed script: `cannot import name 'create_app' from 'app'`

The script lives in `/tmp/` inside the container, so Python doesn't see the `/app/app.py` module. Run with the path set:

```bash
PYTHONPATH=/app python /tmp/seed_demo.py
```

### Browsing the site returns `AccessDenied` XML from S3

CloudFront is forwarding the request correctly but can't decrypt the S3 object. The S3 KMS key policy must grant CloudFront's OAC `kms:Decrypt` (with the distribution ARN in a `SourceArn` condition). That grant lives in [kms.tf](kms.tf) — if you change the policy and accidentally drop it, you'll get this 403 XML in the browser.

## Caveats

- **Default values in `variables.tf` are production-tuned.** If you delete `terraform.tfvars` and run a bare `terraform apply`, you'll get the production stack. Always make sure that file is in place when you want dev mode.
- **Switching profiles on a running deployment** will trigger creates/destroys (Multi-AZ flip rebuilds RDS, WAF flip removes the Web ACL, etc.). Cleanest path is destroy then re-apply in the new mode.
- **GuardDuty's 30-day free trial** starts the first time you enable it on the account, not on each redeploy. Plan accordingly if you enable it briefly for testing.
- **CloudTrail's S3 bucket has Object Lock in Governance mode**, 7-year retention by default. Tearing down via `terraform destroy` requires manual `--bypass-governance-retention` flags if you want the bucket gone within the retention window.
