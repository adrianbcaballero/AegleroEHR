terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

# Default provider — us-east-2 for everything except CloudFront's ACM cert.
provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  default_tags {
    tags = {
      Project     = "aeglero-emr"
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}

# us-east-1 alias — only used later for the CloudFront ACM cert (Phase 3e).
provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = var.aws_profile

  default_tags {
    tags = {
      Project     = "aeglero-emr"
      ManagedBy   = "terraform"
      Environment = var.environment
    }
  }
}

# Account ID and region — referenced by KMS policies and IAM ARNs.
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
