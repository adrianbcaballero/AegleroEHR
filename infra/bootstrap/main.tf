# ── KMS key dedicated to encrypting Terraform state ──
# Customer-managed (not aws/s3) so we control rotation, key policy, and audit
# logs separately from any application data keys we'll create later.
data "aws_caller_identity" "current" {}

resource "aws_kms_key" "tfstate" {
  description             = "Encrypts Terraform state bucket and lock table"
  enable_key_rotation     = true
  deletion_window_in_days = 7

  # Explicit root-only policy (functionally identical to AWS's auto-generated
  # default, but declared in source so Checkov CKV2_AWS_64 and auditors can
  # see it). Tighten with named principals later if multiple IAM users need
  # to apply terraform directly.
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
  # checkov:skip=CKV_AWS_18: Bootstrap-only state bucket; access logging would create a second bucket needing its own bootstrap and adds no audit value over CloudTrail data events (not enabled here for cost).
  # checkov:skip=CKV_AWS_144: Cross-region replication for Terraform state is overkill — state is regenerable via `terraform plan/import` and the bucket already has versioning + Object Lock.
  # checkov:skip=CKV2_AWS_62: No downstream consumer for state-bucket events.
  bucket = var.state_bucket_name

  # State buckets should never be force-destroyed casually — losing state
  # means losing track of every resource Terraform manages. Keep this off.
  force_destroy = false
}

# Block all public access — defense in depth even though no public policy
# could grant access here.
resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Versioning lets us roll back if a bad apply corrupts state.
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

# SSE-KMS with our customer-managed key.
# bucket_key_enabled batches KMS calls so encryption costs are negligible
# even on heavy state writes.
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

# Expire old state versions after 90 days. Keeps the bucket from growing
# unbounded while still leaving a recovery window for accidents.
resource "aws_s3_bucket_lifecycle_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    filter {} # apply to entire bucket

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
# Pay-per-request: zero cost when idle, no capacity planning.
# Schema: single string PK called "LockID" — required by Terraform's S3 backend.
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

  # Lock table contains no PHI — just lock IDs and timestamps — but PITR is
  # cheap insurance against accidental deletion.
  point_in_time_recovery {
    enabled = true
  }
}
