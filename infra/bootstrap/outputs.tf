output "state_bucket_name" {
  description = "S3 bucket for the main Terraform module to use as backend."
  value       = aws_s3_bucket.tfstate.id
}

output "lock_table_name" {
  description = "DynamoDB lock table name for backend config."
  value       = aws_dynamodb_table.tflock.id
}

output "kms_key_arn" {
  description = "KMS key ARN — referenced by the backend config so state writes are encrypted with this key."
  value       = aws_kms_key.tfstate.arn
}

# Drop the contents of this output into the next module's backend config
# (e.g. infra/main.tf) once the bootstrap is applied.
output "backend_config_snippet" {
  description = "Paste this into the next Terraform module to configure its remote backend."
  value       = <<-EOT
    terraform {
      backend "s3" {
        bucket         = "${aws_s3_bucket.tfstate.id}"
        key            = "emr/terraform.tfstate"
        region         = "${var.aws_region}"
        profile        = "${var.aws_profile}"
        dynamodb_table = "${aws_dynamodb_table.tflock.id}"
        encrypt        = true
        kms_key_id     = "${aws_kms_key.tfstate.arn}"
      }
    }
  EOT
}
