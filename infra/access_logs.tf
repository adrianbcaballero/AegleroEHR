# Shared S3 bucket for ALB and CloudFront access logs. Created only when at
# least one of the two log-emitting features is enabled.

locals {
  any_access_logs_enabled = var.enable_alb_access_logs || var.enable_cloudfront_access_logs
}

resource "aws_s3_bucket" "access_logs" {
  # checkov:skip=CKV_AWS_18: This bucket is itself the access-log target.
  # checkov:skip=CKV_AWS_144: Cross-region replication not used; see docs/iac-scan-exceptions.md.
  # checkov:skip=CKV_AWS_145: CloudFront standard logging requires SSE-S3, not SSE-KMS.
  # checkov:skip=CKV2_AWS_61: Lifecycle defined in aws_s3_bucket_lifecycle_configuration.access_logs.
  # checkov:skip=CKV2_AWS_62: No downstream consumer for bucket events.
  count         = local.any_access_logs_enabled ? 1 : 0
  bucket        = "aeglero-emr-access-logs"
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "access_logs" {
  count  = local.any_access_logs_enabled ? 1 : 0
  bucket = aws_s3_bucket.access_logs[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

# CloudFront standard logging does not support SSE-KMS for its log destination,
# so this bucket uses AES256 (SSE-S3). ALB tolerates either algorithm.
resource "aws_s3_bucket_server_side_encryption_configuration" "access_logs" {
  # checkov:skip=CKV_AWS_145: CloudFront standard logging requires SSE-S3.
  count  = local.any_access_logs_enabled ? 1 : 0
  bucket = aws_s3_bucket.access_logs[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "access_logs" {
  count  = local.any_access_logs_enabled ? 1 : 0
  bucket = aws_s3_bucket.access_logs[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CloudFront standard log delivery requires ACL-enabled ownership
# (BucketOwnerPreferred or ObjectWriter). The log-delivery-write ACL below
# grants the AWS log-delivery canonical user write access. ALB uses the
# bucket-policy path instead and tolerates either ownership mode.
resource "aws_s3_bucket_ownership_controls" "access_logs" {
  # checkov:skip=CKV2_AWS_65: CloudFront standard log delivery requires ACL-enabled ownership.
  count  = local.any_access_logs_enabled ? 1 : 0
  bucket = aws_s3_bucket.access_logs[0].id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

# ACL required for CloudFront standard log delivery only. ALB uses the
# bucket-policy path and does not require this ACL.
resource "aws_s3_bucket_acl" "access_logs_cloudfront" {
  count  = var.enable_cloudfront_access_logs ? 1 : 0
  bucket = aws_s3_bucket.access_logs[0].id
  acl    = "log-delivery-write"

  depends_on = [aws_s3_bucket_ownership_controls.access_logs]
}

# Expire access log files after 90 days. CloudTrail handles long-retention
# audit retention separately.
resource "aws_s3_bucket_lifecycle_configuration" "access_logs" {
  count  = local.any_access_logs_enabled ? 1 : 0
  bucket = aws_s3_bucket.access_logs[0].id

  rule {
    id     = "expire-access-logs"
    status = "Enabled"

    filter {}

    expiration {
      days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.access_logs]
}

# ALB log delivery uses a bucket policy granting the regional ELB account and
# the AWS log-delivery service principal. CloudFront uses the ACL path above,
# so this policy is gated specifically on the ALB flag.
resource "aws_s3_bucket_policy" "access_logs" {
  count  = var.enable_alb_access_logs ? 1 : 0
  bucket = aws_s3_bucket.access_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowALBLogDelivery"
        Effect = "Allow"
        Principal = {
          # Region-specific ELB account ID (us-east-2). Lookup table:
          # https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-access-logs.html
          AWS = "arn:aws:iam::033677994240:root"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.access_logs[0].arn}/alb/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
      },
      {
        Sid       = "AllowALBLogDeliveryAccessLogService"
        Effect    = "Allow"
        Principal = { Service = "delivery.logs.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.access_logs[0].arn}/alb/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl" = "bucket-owner-full-control"
          }
        }
      },
      {
        Sid       = "AllowALBLogDeliveryAclCheck"
        Effect    = "Allow"
        Principal = { Service = "delivery.logs.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.access_logs[0].arn
      },
    ]
  })
}
