# ── S3 bucket for the Next.js static export ──
# Private bucket; only the EMR CloudFront distribution can read it via OAC.
resource "aws_s3_bucket" "frontend" {
  # checkov:skip=CKV_AWS_18: Frontend bundle is non-sensitive build output (JS/CSS/HTML); CloudFront access logs cover request-level audit.
  # checkov:skip=CKV_AWS_144: Frontend bundle is regenerable from source (`pnpm build`); CRR adds no value.
  # checkov:skip=CKV2_AWS_61: Bucket holds the current frontend build only — re-synced on every deploy, no lifecycle needed.
  # checkov:skip=CKV2_AWS_62: No downstream consumer for frontend-bucket events.
  bucket = "aeglero-emr-frontend"

  # force_destroy = true so iteration `terraform destroy` works even with
  # objects in the bucket. Flip to false before production.
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  rule {
    bucket_key_enabled = true

    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.s3.arn
    }
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Bucket policy — only this distribution can read.
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipalReadOnly"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.main.arn
          }
        }
      }
    ]
  })
}
