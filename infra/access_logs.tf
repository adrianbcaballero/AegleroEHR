# Shared S3 bucket for ALB and CloudFront access logs. Created only when at
# least one of the two log-emitting features is enabled, so dev mode skips
# the bucket entirely.

locals {
  any_access_logs_enabled = var.enable_alb_access_logs || var.enable_cloudfront_access_logs
}

resource "aws_s3_bucket" "access_logs" {
  count         = local.any_access_logs_enabled ? 1 : 0
  bucket        = "aeglero-emr-access-logs"
  force_destroy = true # iteration-friendly; flip to false before going to production-on-real-data
}

resource "aws_s3_bucket_versioning" "access_logs" {
  count  = local.any_access_logs_enabled ? 1 : 0
  bucket = aws_s3_bucket.access_logs[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

# CloudFront access logs are written by the CloudFront service. CloudFront does
# NOT support SSE-KMS for its log destination (a long-standing limitation), so
# the bucket uses AES256 (SSE-S3) instead. ALB tolerates either.
resource "aws_s3_bucket_server_side_encryption_configuration" "access_logs" {
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

# CloudFront's legacy log delivery requires the bucket to have ACLs enabled
# (BucketOwnerPreferred or ObjectWriter). The "log-delivery-write" canned ACL
# below grants AWS's awslogsdelivery canonical user write permission, which
# is what CloudFront standard logging uses. ALB uses a bucket policy instead,
# so the two mechanisms coexist without interference.
resource "aws_s3_bucket_ownership_controls" "access_logs" {
  count  = local.any_access_logs_enabled ? 1 : 0
  bucket = aws_s3_bucket.access_logs[0].id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

# Only needed when CloudFront access logs are enabled. The canned ACL grants
# the AWS Log Delivery canonical user write access to the bucket. ALB logging
# doesn't need this; it uses the bucket policy path.
resource "aws_s3_bucket_acl" "access_logs_cloudfront" {
  count  = var.enable_cloudfront_access_logs ? 1 : 0
  bucket = aws_s3_bucket.access_logs[0].id
  acl    = "log-delivery-write"

  depends_on = [aws_s3_bucket_ownership_controls.access_logs]
}

# Expire access log files after 90 days. They're operational, not regulatory —
# CloudTrail handles the long-retention audit case separately.
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

# ALB needs an explicit ACL grant on the bucket to write its access logs.
# The "logdelivery" canonical user is the legacy way; the modern way uses a
# bucket policy granting the AWS Logs service principal. We use the latter.
# CloudFront access logs use an ACL (above), not a bucket policy, so this
# resource is gated on the ALB flag specifically.
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
          # us-east-2 ELB account ID. Region-specific; lookup table at
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
