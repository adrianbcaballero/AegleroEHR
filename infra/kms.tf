# Per-concern KMS keys keep IAM scoping and rotation independent.

# Explicit root-only key policy. Declared in source rather than relying on
# AWS's implicit default so that the policy is reviewable and scanner-visible.
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
      {
        # SNS encrypts CloudTrail delivery-notification messages with this key
        # (see aws_sns_topic.cloudtrail in cloudtrail.tf).
        Sid       = "AllowSNSForCloudTrailNotifications"
        Effect    = "Allow"
        Principal = { Service = "sns.amazonaws.com" }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey*",
        ]
        Resource = "*"
      },
    ]
  })
}

resource "aws_kms_alias" "logs" {
  name          = "alias/aeglero-emr-logs"
  target_key_id = aws_kms_key.logs.key_id
}

# ── S3 encryption (frontend bundle, ALB logs, CloudFront logs) ──
# CloudFront's OAC needs kms:Decrypt on this key to read encrypted objects
# from the frontend bucket; without it CloudFront can fetch the S3 object but
# can't decrypt → 403 AccessDenied surfaced to the browser.
resource "aws_kms_key" "s3" {
  description             = "Encrypts S3 buckets (frontend, access logs)"
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
        Sid       = "AllowCloudFrontOACDecrypt"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "kms:Decrypt"
        Resource  = "*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
          }
        }
      },
    ]
  })
}

resource "aws_kms_alias" "s3" {
  name          = "alias/aeglero-emr-s3"
  target_key_id = aws_kms_key.s3.key_id
}
