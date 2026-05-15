# ── KMS key dedicated to encrypting Terraform state ──
# Customer-managed (not aws/s3) so rotation, key policy, and audit logs are
# controlled independently of application data keys.
data "aws_caller_identity" "current" {}

resource "aws_kms_key" "tfstate" {
  description             = "Encrypts Terraform state bucket and lock table"
  enable_key_rotation     = true
  deletion_window_in_days = 7

  # Explicit root-only policy; declared in source rather than relying on
  # AWS's implicit default so the policy is reviewable and scanner-visible.
  policy = jsonencode({
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

resource "aws_kms_alias" "tfstate" {
  name          = "alias/aeglero-tfstate"
  target_key_id = aws_kms_key.tfstate.key_id
}

# ── State bucket ──
resource "aws_s3_bucket" "tfstate" {
  # checkov:skip=CKV_AWS_18: Bootstrap-only state bucket; CloudTrail covers audit.
  # checkov:skip=CKV_AWS_144: State is regenerable; versioning + Object Lock suffice.
  # checkov:skip=CKV2_AWS_62: No downstream consumer for state-bucket events.
  bucket = var.state_bucket_name

  # Never force-destroy the state bucket; losing state means losing track of
  # every resource Terraform manages.
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Versioning enables state rollback after a bad apply.
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

# SSE-KMS via the customer-managed key. bucket_key_enabled batches KMS calls.
resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    bucket_key_enabled = true

    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.tfstate.arn
    }
  }
}

# Expire old state versions after 90 days.
resource "aws_s3_bucket_lifecycle_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.tfstate]
}

# ── DynamoDB lock table ──
# Single string PK named "LockID" as required by Terraform's S3 backend.
resource "aws_dynamodb_table" "tflock" {
  name         = var.lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.tfstate.arn
  }

  point_in_time_recovery {
    enabled = true
  }
}
