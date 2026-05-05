variable "aws_region" {
  description = "Primary AWS region. Bootstrap resources are regional, but the rest of the EMR Terraform will use this same region as default."
  type        = string
  default     = "us-east-2"
}

variable "aws_profile" {
  description = "AWS CLI profile (must be the Aeglero account)."
  type        = string
  default     = "aeglero"
}

variable "state_bucket_name" {
  description = "S3 bucket holding all Terraform state for the EMR. Must be globally unique."
  type        = string
  default     = "aeglero-emr-tfstate"
}

variable "lock_table_name" {
  description = "DynamoDB table used for state locking. Prevents two terraform applies running simultaneously."
  type        = string
  default     = "aeglero-emr-tflock"
}
