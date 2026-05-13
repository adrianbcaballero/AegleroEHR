# Aeglero EMR Infrastructure

Terraform that builds the AWS infrastructure for the Aeglero EMR application: VPC, RDS Postgres, ECS Fargate, ALB, CloudFront, S3, KMS, Secrets Manager, plus optional compliance tooling (CloudTrail, WAF, GuardDuty, access logs) controlled by feature flags.

## Two deployment profiles

The same Terraform code supports two modes, switched at apply time.

### Dev mode (~$2-3/day)

Daily-use posture. Cheap. Single-AZ RDS, no CloudTrail/WAF/GuardDuty/access logs. Auto-loaded via `terraform.tfvars`.

```bash
cd infra
terraform apply
```

### Production mode (~$5-7/day)

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

| Variable | Dev | Prod | Daily cost when on |
|---|---|---|---|
| `rds_multi_az` | false | true | ~$0.40 |
| `enable_cloudtrail` | false | true | pennies |
| `enable_waf` | false | true | ~$0.50 |
| `enable_guardduty` | false | true | ~$1-3 (after 30-day trial) |
| `enable_alb_access_logs` | false | true | pennies |
| `enable_cloudfront_access_logs` | false | true | pennies |

## After applying

Three one-time steps are needed after either profile finishes deploying:

1. **Build and push the backend Docker image** to ECR (`docker build`, `docker tag`, `docker push`)
2. **Build and sync the frontend bundle** to the frontend S3 bucket (`pnpm build` + `aws s3 sync`)
3. **Seed the first tenant + admin user** via `aws ecs execute-command` into a running container

Full commands for each step are in the [project root README](../README.md).

## Tearing down

```bash
cd infra
terraform destroy
```

Add `-var-file=prod.tfvars` if you applied prod mode. Cleanup tail: ~$1 over 7 days for KMS keys finishing their pending-deletion windows. The bootstrap module stays running (~$1-2/month) so the next deploy is one `terraform apply` away.

## Scanner suppressions

Every `# checkov:skip=...` or `# trivy:ignore:...` comment in this folder is documented (with removal criteria) in [`../docs/iac-scan-exceptions.md`](../docs/iac-scan-exceptions.md).

## Caveats

- **Default values in `variables.tf` are production-tuned.** If you delete `terraform.tfvars` and run a bare `terraform apply`, you'll get the production stack. Always make sure that file is in place when you want dev mode.
- **Switching profiles on a running deployment** will trigger creates/destroys (Multi-AZ flip rebuilds RDS, WAF flip removes the Web ACL, etc.). Cleanest path is destroy then re-apply in the new mode.
- **GuardDuty's 30-day free trial** starts the first time you enable it on the account, not on each redeploy. Plan accordingly if you enable it briefly for testing.
- **CloudTrail's S3 bucket has Object Lock in Governance mode**, 7-year retention by default. Tearing down via `terraform destroy` requires manual `--bypass-governance-retention` flags if you want the bucket gone within the retention window.
