variable "aws_region" {
  description = "Primary AWS region. The main Terraform stack reuses this as its default."
  type        = string
  default     = "us-east-2"
}

variable "aws_profile" {
  description = "AWS CLI profile to use for this deployment."
  type        = string
  default     = "aeglero"
}

variable "state_bucket_name" {
  description = "S3 bucket holding Terraform state. Must be globally unique."
  type        = string
  default     = "aeglero-emr-tfstate"
}

variable "lock_table_name" {
  description = "DynamoDB table used for state locking."
  type        = string
  default     = "aeglero-emr-tflock"
}
