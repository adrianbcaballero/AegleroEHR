# GuardDuty threat detection. Detects credential abuse, malicious-IP
# communication, anomalous API patterns, DNS exfiltration, and VPC flow
# anomalies. Billing scales with CloudTrail, VPC Flow Logs, and DNS volume.
resource "aws_guardduty_detector" "main" {
  # checkov:skip=CKV2_AWS_3: Gated on var.enable_guardduty; resource only exists when the toggle is on.
  count = var.enable_guardduty ? 1 : 0

  enable                       = true
  finding_publishing_frequency = "FIFTEEN_MINUTES"
}
