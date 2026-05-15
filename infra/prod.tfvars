# Production mode — full HIPAA-aligned posture. Apply with:
#   terraform apply -var-file=prod.tfvars
# When specified, this file overrides terraform.tfvars (dev defaults).
# Operational pre-flight requirements (BAA execution, security review, risk
# analysis, designated officers) are documented in docs/.

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

# CloudTrail retention. 2555 days = 7 years.
cloudtrail_retention_days = 2555
