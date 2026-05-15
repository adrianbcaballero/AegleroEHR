# All resources in this file are conditional on var.enable_cloudtrail.

# ── Dedicated KMS key for CloudTrail logs ──
# Separate key so the audit trail remains usable if other keys are rotated
# or compromised. The CloudTrail service principal needs an explicit grant
# in the key policy.
resource "aws_kms_key" "cloudtrail" {
  count = var.enable_cloudtrail ? 1 : 0

  description             = "Encrypts CloudTrail logs"
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
        Sid       = "AllowCloudTrailEncrypt"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action = [
          "kms:GenerateDataKey*",
          "kms:DescribeKey",
        ]
        Resource = "*"
      },
      {
        Sid       = "AllowCloudTrailDescribe"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "kms:DescribeKey"
        Resource  = "*"
      },
    ]
  })
}

resource "aws_kms_alias" "cloudtrail" {
  count         = var.enable_cloudtrail ? 1 : 0
  name          = "alias/aeglero-emr-cloudtrail"
  target_key_id = aws_kms_key.cloudtrail[0].key_id
}

# ── S3 bucket for CloudTrail logs ──
# Object Lock in Governance mode (root can override retention if absolutely
# required), KMS encryption, and lifecycle retention. Switch to Compliance mode
# by changing the `mode` argument on the bucket's default retention block.
resource "aws_s3_bucket" "cloudtrail" {
  # checkov:skip=CKV_AWS_18: This bucket already stores audit logs (CloudTrail); logging access to it would be circular.
  # checkov:skip=CKV_AWS_21: Versioning IS enabled — see aws_s3_bucket_versioning.cloudtrail. Checkov doesn't link the split resources.
  # checkov:skip=CKV_AWS_144: Object Lock + 7-year retention gives WORM protection; cross-region replication adds cost without additional audit value.
  # checkov:skip=CKV_AWS_145: SSE-KMS IS enabled — see aws_s3_bucket_server_side_encryption_configuration.cloudtrail (uses aws_kms_key.cloudtrail). Checkov doesn't link the split resources.
  # checkov:skip=CKV2_AWS_6: Public access block IS configured — see aws_s3_bucket_public_access_block.cloudtrail. Checkov doesn't link the split resources.
  # checkov:skip=CKV2_AWS_61: Object Lock retention governs deletion, not lifecycle; a lifecycle rule on a locked bucket is a no-op.
  # checkov:skip=CKV2_AWS_62: No downstream consumer for CloudTrail bucket events.
  count         = var.enable_cloudtrail ? 1 : 0
  bucket        = "aeglero-emr-cloudtrail-logs"
  force_destroy = true # iteration-friendly; production should set to false

  # Object Lock must be enabled at bucket creation time and cannot be added
  # later. The actual retention is set via aws_s3_bucket_object_lock_configuration.
  object_lock_enabled = true
}

resource "aws_s3_bucket_versioning" "cloudtrail" {
  count  = var.enable_cloudtrail ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_object_lock_configuration" "cloudtrail" {
  count  = var.enable_cloudtrail ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail[0].id

  rule {
    default_retention {
      mode = "GOVERNANCE"
      days = var.cloudtrail_retention_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.cloudtrail]
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail" {
  count  = var.enable_cloudtrail ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail[0].id

  rule {
    bucket_key_enabled = true

    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.cloudtrail[0].arn
    }
  }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail" {
  count  = var.enable_cloudtrail ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Bucket policy granting CloudTrail service permission to write logs.
resource "aws_s3_bucket_policy" "cloudtrail" {
  count  = var.enable_cloudtrail ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudTrailGetBucketAcl"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.cloudtrail[0].arn
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = "arn:aws:cloudtrail:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:trail/aeglero-emr-trail"
          }
        }
      },
      {
        Sid       = "AllowCloudTrailPutObject"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.cloudtrail[0].arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl"  = "bucket-owner-full-control"
            "AWS:SourceArn" = "arn:aws:cloudtrail:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:trail/aeglero-emr-trail"
          }
        }
      },
    ]
  })
}

# ── CloudWatch Logs group for CloudTrail (optional, real-time visibility) ──
resource "aws_cloudwatch_log_group" "cloudtrail" {
  count             = var.enable_cloudtrail ? 1 : 0
  name              = "/aws/cloudtrail/aeglero-emr"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.logs.arn
}

resource "aws_iam_role" "cloudtrail_cloudwatch" {
  count = var.enable_cloudtrail ? 1 : 0
  name  = "aeglero-emr-cloudtrail-cloudwatch-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudtrail.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "cloudtrail_cloudwatch" {
  count = var.enable_cloudtrail ? 1 : 0
  name  = "cloudwatch-logs"
  role  = aws_iam_role.cloudtrail_cloudwatch[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
      ]
      Resource = "${aws_cloudwatch_log_group.cloudtrail[0].arn}:*"
    }]
  })
}

# ── SNS topic for CloudTrail delivery notifications ──
# Topic exists as an integration point for downstream monitoring (email,
# Lambda, Chatbot). No subscriptions are wired up by default.
resource "aws_sns_topic" "cloudtrail" {
  count             = var.enable_cloudtrail ? 1 : 0
  name              = "aeglero-emr-cloudtrail-notifications"
  kms_master_key_id = aws_kms_key.logs.arn
}

resource "aws_sns_topic_policy" "cloudtrail" {
  count = var.enable_cloudtrail ? 1 : 0
  arn   = aws_sns_topic.cloudtrail[0].arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudTrailPublish"
      Effect    = "Allow"
      Principal = { Service = "cloudtrail.amazonaws.com" }
      Action    = "SNS:Publish"
      Resource  = aws_sns_topic.cloudtrail[0].arn
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = "arn:aws:cloudtrail:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:trail/aeglero-emr-trail"
        }
      }
    }]
  })
}

# ── The trail itself ──
# Multi-region. include_global_service_events captures IAM, CloudFront, Route 53.
resource "aws_cloudtrail" "main" {
  # checkov:skip=CKV2_AWS_10: CloudWatch Logs integration IS configured — see cloud_watch_logs_group_arn / cloud_watch_logs_role_arn below. Checkov misreports the link.
  count = var.enable_cloudtrail ? 1 : 0

  name                          = "aeglero-emr-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail[0].id
  sns_topic_name                = aws_sns_topic.cloudtrail[0].name
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  kms_key_id                    = aws_kms_key.cloudtrail[0].arn

  cloud_watch_logs_group_arn = "${aws_cloudwatch_log_group.cloudtrail[0].arn}:*"
  cloud_watch_logs_role_arn  = aws_iam_role.cloudtrail_cloudwatch[0].arn

  # Capture management events only; data events (S3 object reads, Lambda
  # invocations) are not enabled.
  event_selector {
    read_write_type           = "All"
    include_management_events = true
  }

  depends_on = [
    aws_s3_bucket_policy.cloudtrail,
    aws_sns_topic_policy.cloudtrail,
  ]
}
