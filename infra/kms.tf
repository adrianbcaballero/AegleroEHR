# Per-concern KMS keys keep IAM scoping clean and rotation independent.
# Each key is ~$1/month; total ~$4/month for the four below.

# Without an explicit policy, AWS attaches a default policy granting the
# account root full key use. That's the same thing we set below — but
# Checkov (CKV2_AWS_64) and several auditors want to see the policy declared
# explicitly so it's reviewable in source rather than inferred from defaults.
locals {
  kms_root_only_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "EnableRootPermissions"
      Effect    = "Allow"
      Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
      Action    = "kms:*"
      Resource  = "*"
    }]
  })
}

# ── RDS encryption-at-rest ──
resource "aws_kms_key" "rds" {
  description             = "Encrypts RDS storage and snapshots"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  policy                  = local.kms_root_only_policy
}

resource "aws_kms_alias" "rds" {
  name          = "alias/aeglero-emr-rds"
  target_key_id = aws_kms_key.rds.key_id
}

# ── Secrets Manager encryption ──
resource "aws_kms_key" "secrets" {
  description             = "Encrypts Secrets Manager entries (DB password, Flask SECRET_KEY)"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  policy                  = local.kms_root_only_policy
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/aeglero-emr-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}

# ── CloudWatch Logs encryption ──
# Logs requires an explicit grant in the key policy — service principal needs
# kms:Decrypt to read encrypted log streams. The condition restricts use to
# log groups in this account/region only.
resource "aws_kms_key" "logs" {
  description             = "Encrypts CloudWatch Logs (VPC flow, app logs, audit)"
  enable_key_rotation     = true
  deletion_window_in_days = 7

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnableRootPermissions"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "AllowCloudWatchLogs"
        Effect    = "Allow"
        Principal = { Service = "logs.${data.aws_region.current.name}.amazonaws.com" }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*",
        ]
        Resource = "*"
        Condition = {
          ArnEquals = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:*"
          }
        }
      },
    ]
  })
}

resource "aws_kms_alias" "logs" {
  name          = "alias/aeglero-emr-logs"
  target_key_id = aws_kms_key.logs.key_id
}

# ── S3 encryption (frontend bundle, ALB logs, CloudFront logs — Phase 3e) ──
resource "aws_kms_key" "s3" {
  description             = "Encrypts S3 buckets (frontend, access logs)"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  policy                  = local.kms_root_only_policy
}

resource "aws_kms_alias" "s3" {
  name          = "alias/aeglero-emr-s3"
  target_key_id = aws_kms_key.s3.key_id
}
