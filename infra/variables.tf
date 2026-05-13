variable "aws_region" {
  description = "Primary AWS region for everything except CloudFront's ACM cert."
  type        = string
  default     = "us-east-2"
}

variable "aws_profile" {
  description = "AWS CLI profile (must be the Aeglero account)."
  type        = string
  default     = "aeglero"
}

variable "environment" {
  description = "Deployment environment (prod, staging, etc.)."
  type        = string
  default     = "prod"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC. /16 gives plenty of room for subnets across AZs."
  type        = string
  default     = "10.0.0.0/16"
}

variable "azs" {
  description = "Availability zones to span. 2 AZs minimum for RDS Multi-AZ."
  type        = list(string)
  default     = ["us-east-2a", "us-east-2b"]
}

variable "db_username" {
  description = "Postgres master username. Default is fine; the password is generated and stored in Secrets Manager."
  type        = string
  default     = "aeglero_admin"
}

variable "log_retention_days" {
  description = "Days to retain CloudWatch Logs (audit, flow logs, app logs). HIPAA needs at least 6 months; 1 year is safe default."
  type        = number
  default     = 365
}

variable "rds_deletion_protection" {
  description = "Prevent accidental deletion of the database. Production: true. Iteration testing: set to false in tfvars."
  type        = bool
  default     = true
}

variable "rds_skip_final_snapshot" {
  description = "Skip the final snapshot on `terraform destroy`. Production: false (so you have a recovery snapshot). Iteration testing: set to true."
  type        = bool
  default     = false
}

# ── Cost-vs-compliance toggles ──
# Pattern: variable defaults reflect production-tuned values. `terraform.tfvars`
# overrides each one back to dev mode for daily/testing use. `prod.tfvars` flips
# them all on for the full HIPAA-aligned deployment. Run dev daily, run prod
# when you actually need the security posture.

variable "rds_multi_az" {
  description = "Enable RDS Multi-AZ standby for automatic failover. Adds ~$0.40/day."
  type        = bool
  default     = true
}

variable "enable_cloudtrail" {
  description = "Account-wide CloudTrail trail with KMS-encrypted, object-locked S3 bucket. HIPAA-aligned admin audit trail. Cost: pennies/day."
  type        = bool
  default     = true
}

variable "enable_waf" {
  description = "AWS WAF on CloudFront with managed rule groups (common, known-bad inputs, SQLi). Adds ~$0.50/day."
  type        = bool
  default     = true
}

variable "enable_guardduty" {
  description = "GuardDuty threat detection across CloudTrail, VPC Flow Logs, DNS logs. Free 30-day trial, then ~$1-3/day."
  type        = bool
  default     = true
}

variable "enable_alb_access_logs" {
  description = "ALB writes access logs to S3 for after-the-fact request analysis. Cost: pennies/day."
  type        = bool
  default     = true
}

variable "enable_cloudfront_access_logs" {
  description = "CloudFront writes edge access logs to S3. Cost: pennies/day."
  type        = bool
  default     = true
}

variable "cloudtrail_retention_days" {
  description = "How many days to retain CloudTrail logs under S3 Object Lock governance mode. HIPAA minimum is 6 years (2190 days); 7 years (2555) is conservative default. Set lower in dev if you ever enable CloudTrail there."
  type        = number
  default     = 2555
}

# ── DNS / domain ──
variable "hosted_zone_id" {
  description = "Route 53 hosted zone ID for the domain."
  type        = string
  default     = "Z00306291IHBJJ42FD782"
}

variable "domain_name" {
  description = "Apex domain. Wildcard cert covers all subdomains under this."
  type        = string
  default     = "aeglero.com"
}

# ── ECS task sizing ──
variable "ecs_task_cpu" {
  description = "Fargate CPU units (256 = 0.25 vCPU)."
  type        = number
  default     = 256
}

variable "ecs_task_memory" {
  description = "Fargate memory in MiB (512 = 0.5 GiB). Must pair with valid CPU/memory combination per Fargate docs."
  type        = number
  default     = 512
}

variable "ecs_image_tag" {
  description = "Docker image tag in ECR for the backend. Defaults to 'latest'."
  type        = string
  default     = "latest"
}

variable "ecs_desired_count" {
  description = "Number of ECS tasks to keep running. Set to 0 before pushing your first image, then 1 after."
  type        = number
  default     = 0
}

# ── App config ──
variable "cors_origins" {
  description = "Comma-separated list of allowed CORS origins. For one tenant: 'https://democlinic.aeglero.com'. Add more as you onboard tenants."
  type        = string
  default     = "https://democlinic.aeglero.com"
}
