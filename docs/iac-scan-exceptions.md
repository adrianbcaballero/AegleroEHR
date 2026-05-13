# IaC Scan Exceptions

The CI pipeline runs three IaC scanners against `infra/`:

- **Trivy** filesystem scan (dependency CVEs)
- **Trivy** config scan (Terraform misconfigurations, severity HIGH/CRITICAL)
- **Checkov** Terraform scan (broad correctness + compliance checks)

This document explains every finding that is currently suppressed, why, and what would need to change to remove the suppression. Each suppression also lives inline next to the resource (`# trivy:ignore:...` or `# checkov:skip=...`) so a code reader sees the justification at the point of use, but this file is the single place an auditor or reviewer can read all of them at once.

A suppression is acceptable here if one of the following is true:

1. The flag is gated on a `var.enable_*` toggle and the resource only exists in production mode (the scanner sees the literal value, not the toggle).
2. The flag conflicts with an architectural constraint that the finding doesn't model (e.g. CloudFront log delivery only supports SSE-S3).
3. The finding requires a service AWS doesn't currently bill cost-effectively at our scale and we've made a documented deferral.
4. The flag would require an application-side change tracked as a follow-up.

Every entry below has a "Remove this suppression when…" line so it's clear what would flip it back on.

## Trivy IaC suppressions

### AVD-AWS-0053 — `aws_lb.main` is internet-facing (HIGH)

**Finding:** ALB has `internal = false`.

**Why suppressed:** The ALB is the origin for the CloudFront distribution. CloudFront's edge nodes reach it over the public internet using its public DNS name and the wildcard ACM cert. Lockdown happens at the SG layer: `aws_security_group.alb` only allows ingress 443 from the AWS-managed `com.amazonaws.global.cloudfront.origin-facing` prefix list. Direct traffic from any other source is dropped at the SG.

**Remove this suppression when:** The architecture moves to an internal-facing ALB fronted by a regional CloudFront VPC origin, or we migrate to API Gateway.

### AVD-AWS-0031 — `aws_ecr_repository.backend` tag mutability is MUTABLE (HIGH)

**Finding:** ECR allows the same tag to point to different image digests over time.

**Why suppressed:** The current deploy workflow pushes a floating `:latest` tag that the ECS task definition references by tag. IMMUTABLE would reject the second push of `:latest`, breaking deploys. Best practice is to tag each build with the commit SHA and update the task definition to reference that SHA on every deploy.

**Remove this suppression when:** The deploy pipeline is migrated to SHA-tagged images and the task definition is updated programmatically per build.

### AVD-AWS-0104 — `aws_security_group_rule.ecs_https_egress` unrestricted egress (CRITICAL)

**Finding:** ECS SG egress allows `0.0.0.0/0`.

**Why suppressed:** ECS tasks need outbound HTTPS to AWS service endpoints — ECR (image pull), Secrets Manager (DB password and SECRET_KEY), KMS (decryption), CloudWatch Logs (app logs), SSM (ECS exec). These endpoints don't live in our VPC by default and aren't represented by a narrow CIDR. The rule is restricted to TCP/443, which is the meaningful tightening; the destination IP cannot be narrower without provisioning VPC endpoints for each service.

**Remove this suppression when:** VPC endpoints are added for ECR (API + DKR), Secrets Manager, KMS, CloudWatch Logs, and SSM, and this egress rule is replaced with endpoint-specific destinations.

## Checkov suppressions

Grouped by the kind of suppression.

### Toggled by dev/prod mode

These flags are real production controls; they're intentionally off in dev mode (`terraform.tfvars`) to save cost. Each is driven by a variable that `prod.tfvars` flips back on.

| Check | Resource | Variable | Why off in dev |
|---|---|---|---|
| CKV_AWS_150 | `aws_lb.main` deletion protection | `var.alb_deletion_protection` | Iteration speed — `terraform destroy` must work in dev. |
| CKV_AWS_157 | `aws_db_instance.main` Multi-AZ | `var.rds_multi_az` | Single-AZ saves ~$0.40/day. |
| CKV_AWS_293 | `aws_db_instance.main` deletion protection | `var.rds_deletion_protection` | Same as ALB — teardowns must work. |
| CKV2_AWS_3 | `aws_guardduty_detector.main` | `var.enable_guardduty` | GuardDuty bills ~$1-3/day after the 30-day trial; off in dev. Checkov can't see the `count` guard. |

**Remove these suppressions when:** Production is the only mode, or the variables are removed.

### Architecture constraints that scanners can't model

These findings conflict with an AWS service limitation or our design intent.

| Check | Resource | Why suppressed |
|---|---|---|
| CKV2_AWS_71 | `aws_acm_certificate.alb`, `aws_acm_certificate.cloudfront` | Wildcard `*.aeglero.com` is required for the multi-tenant subdomain model — every tenant gets its own subdomain (`democlinic.aeglero.com`, etc.). |
| CKV_AWS_145 | `aws_s3_bucket.access_logs` | CloudFront standard log delivery only supports SSE-S3 (AES256). SSE-KMS breaks delivery. The bucket holds only access logs (no PHI), so AES256 is acceptable. |
| CKV2_AWS_65 | `aws_s3_bucket_ownership_controls.access_logs` | CloudFront standard log delivery requires ACL-enabled ownership (`BucketOwnerPreferred`). `BucketOwnerEnforced` would disable ACLs entirely and break delivery. |
| CKV_AWS_310 | `aws_cloudfront_distribution.main` | Origin failover requires a second regional ALB stack. Single-origin is intentional for the current footprint. |
| CKV_AWS_374 | `aws_cloudfront_distribution.main` | Geo restriction is a deny-list feature. Tenant base is US-only; we'd revisit when international tenants arrive. |
| CKV2_AWS_28 | `aws_lb.main` | The WAF is attached to the CloudFront distribution (`waf.tf`), which sits in front of this ALB. Attaching a regional WAF to the ALB would duplicate rules and double cost. |
| CKV2_AWS_47 | `aws_cloudfront_distribution.main` | The WAF already includes `AWSManagedRulesKnownBadInputsRuleSet`, which covers Log4j. CKV2_AWS_47 asks for a different (older) rule group with the same coverage. |
| CKV2_AWS_61 | `aws_s3_bucket.cloudtrail` | The CloudTrail bucket uses S3 Object Lock with 7-year retention. A lifecycle rule on a locked bucket is a no-op. |
| CKV2_AWS_61 | `aws_s3_bucket.access_logs` | Lifecycle is defined in the standalone `aws_s3_bucket_lifecycle_configuration` resource (90-day expiration); Checkov doesn't link them. |
| CKV2_AWS_61 | `aws_s3_bucket.frontend` | Holds the current frontend build only — re-synced on every deploy, nothing to expire. |

**Remove these suppressions when:** AWS lifts the underlying service limitation, or the architectural decision changes.

### Deferred follow-ups

Real improvements that the current posture trades off against cost or app-side complexity. Each one has a clear "what it would take" so the deferral is auditable.

| Check | Resource | What's missing | What it would take |
|---|---|---|---|
| CKV_AWS_51 | `aws_ecr_repository.backend` | Immutable tags | Migrate deploy pipeline to per-SHA tags + task-def update per build. |
| CKV_AWS_136 | `aws_ecr_repository.backend` | KMS encryption | Container images contain application code, not PHI — AWS-owned key is BAA-acceptable. Switch to a customer-managed key if a compliance review demands it. |
| CKV_AWS_161 | `aws_db_instance.main` | RDS IAM authentication | App currently authenticates via the Secrets Manager-managed password. Switching requires SDK changes in the Flask app to mint per-connection IAM auth tokens. |
| CKV_AWS_18 | All 4 S3 buckets | Bucket access logging | Adds another bucket per logged bucket; we get request-level audit from CloudFront access logs (when enabled) and from CloudTrail S3 data events (off here for cost). |
| CKV_AWS_144 | All 4 S3 buckets | Cross-region replication | Adds storage cost in a second region; no regulatory requirement for it. CloudTrail bucket already has Object Lock; state bucket has versioning. |
| CKV2_AWS_57 | All 3 Secrets Manager secrets | Automatic rotation | Requires a Lambda rotator. SECRET_KEY rotation would invalidate every active session mid-request (needs a session-bleed window). DATABASE_URL is derived from db_master and rotates with it. |
| CKV2_AWS_62 | All 4 S3 buckets | Event notifications | No downstream consumer (no SNS topic, no Lambda) for any of these buckets. Adding empty notifications is noise. |
| CKV2_AWS_31 | `aws_wafv2_web_acl.cloudfront` | WAF logging configuration | Requires either Kinesis Firehose to S3 or direct S3 logging + a parser. Deferred until the WAF rule set is stable enough that full request-level audit is worth the cost. |

**Remove these suppressions when:** The corresponding follow-up work lands.

## How to add or remove a suppression

1. **Add the inline comment.** Checkov reads `# checkov:skip=CKV_X: reason` from inside the resource block (not above it). Trivy reads `# trivy:ignore:AVD-AWS-XXXX -- reason` from a comment line directly above the resource or attribute.
2. **Add the row here.** Put it in the right table above with the same justification.
3. **Re-run the scan locally** (`checkov --directory infra/ --framework terraform --soft-fail-on LOW,MEDIUM` and `trivy config infra/`) to confirm the count goes down by exactly one.

To remove a suppression, do the inverse: delete the inline comment, delete the row, run the scan, and address whatever finding it produces.
