# Production mode — full HIPAA-aligned posture. Apply with:
#   terraform apply -var-file=prod.tfvars
#
# When this file is specified, it overrides terraform.tfvars (which holds dev
# defaults). Expected daily cost ~$5-7 once GuardDuty's 30-day free trial ends.
#
# ⚠ Before applying this in a real production scenario, make sure:
#   - AWS Support has approved your account for production CloudFront use
#   - You've reviewed and signed the BAA via AWS Artifact
#   - The application has been independently security-reviewed
#   - You have a designated Security Officer and Privacy Officer
#   - A current HIPAA Risk Analysis is on file (see docs/risk-analysis.md)

# ── HA + safety ──
rds_multi_az            = true
rds_deletion_protection = true
rds_skip_final_snapshot = false

# ── App ──
ecs_desired_count = 1

# ── Full security stack ──
enable_cloudtrail             = true
enable_waf                    = true
enable_guardduty              = true
enable_alb_access_logs        = true
enable_cloudfront_access_logs = true

# CloudTrail retention. 2555 days = 7 years (HIPAA-conservative).
# Set lower if storage cost becomes a concern; HIPAA minimum is 6 years.
cloudtrail_retention_days = 2555
