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

# Default provider. CloudFront's ACM cert uses the us_east_1 alias below.
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

# us-east-1 alias for the CloudFront ACM cert (CloudFront requires us-east-1).
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
