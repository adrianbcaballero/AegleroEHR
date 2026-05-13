# GuardDuty threat detection. Single resource — AWS handles the rest.
# Detects:
#   - AWS credentials accessed from unexpected IPs / countries
#   - EC2/ECS tasks communicating with known C2 / cryptomining / malware IPs
#   - Anomalous API call patterns (large IAM enumerations, etc.)
#   - DNS exfiltration patterns
#   - VPC Flow Log anomalies
#
# First 30 days are free. After that, billing scales with CloudTrail event
# volume, VPC Flow Logs volume, and DNS query volume — typically ~$1-3/day
# for a small environment, more if traffic grows.
resource "aws_guardduty_detector" "main" {
  # checkov:skip=CKV2_AWS_3: GuardDuty is gated on var.enable_guardduty (off in dev); the resource only exists when the toggle is on. Checkov can't see the count guard.
  count = var.enable_guardduty ? 1 : 0

  enable                       = true
  finding_publishing_frequency = "FIFTEEN_MINUTES" # FIFTEEN_MINUTES, ONE_HOUR, SIX_HOURS
}
