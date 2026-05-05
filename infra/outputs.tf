# ── Network ──
output "vpc_id" {
  description = "VPC ID — referenced by ECS, RDS, ALB later."
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs (ALB, NAT)."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs (ECS Fargate)."
  value       = aws_subnet.private[*].id
}

output "isolated_subnet_ids" {
  description = "Isolated subnet IDs (RDS — no internet route)."
  value       = aws_subnet.isolated[*].id
}

output "alb_security_group_id" {
  value = aws_security_group.alb.id
}

output "ecs_security_group_id" {
  value = aws_security_group.ecs.id
}

output "rds_security_group_id" {
  value = aws_security_group.rds.id
}

# ── KMS ──
output "kms_key_rds_arn" {
  value = aws_kms_key.rds.arn
}

output "kms_key_secrets_arn" {
  value = aws_kms_key.secrets.arn
}

output "kms_key_logs_arn" {
  value = aws_kms_key.logs.arn
}

output "kms_key_s3_arn" {
  value = aws_kms_key.s3.arn
}

# ── Secrets ──
output "secret_arn_db_master" {
  description = "Secrets Manager ARN for the RDS master credentials. Used by RDS module and ECS task definition."
  value       = aws_secretsmanager_secret.db_master.arn
}

output "secret_arn_flask_secret_key" {
  description = "Secrets Manager ARN for the Flask SECRET_KEY."
  value       = aws_secretsmanager_secret.flask_secret_key.arn
}

# ── RDS ──
output "rds_endpoint" {
  description = "RDS connection endpoint (host:port). What ECS uses for DATABASE_URL."
  value       = aws_db_instance.main.endpoint
}

output "rds_address" {
  description = "RDS hostname only (no port). For DNS resolution checks."
  value       = aws_db_instance.main.address
}

output "rds_port" {
  value = aws_db_instance.main.port
}

output "rds_db_name" {
  value = aws_db_instance.main.db_name
}

# ── ECR ──
output "ecr_repository_url" {
  description = "ECR repository URL for the backend. Tag your local image with this and push."
  value       = aws_ecr_repository.backend.repository_url
}

# ── ALB ──
output "alb_dns_name" {
  description = "ALB hostname. CloudFront in Phase 3e will point at this. NOT user-facing."
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB hosted zone ID — used for Route 53 alias records pointing at the ALB."
  value       = aws_lb.main.zone_id
}

output "alb_arn" {
  value = aws_lb.main.arn
}

# ── ECS ──
output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  value = aws_ecs_service.backend.name
}

output "ecs_task_definition_family" {
  value = aws_ecs_task_definition.backend.family
}

# ── Frontend / CloudFront ──
output "frontend_bucket_name" {
  description = "S3 bucket holding the frontend bundle. Sync `frontend/out/` here."
  value       = aws_s3_bucket.frontend.id
}

output "cloudfront_distribution_id" {
  description = "EMR CloudFront distribution ID. Pass to `aws cloudfront create-invalidation` after deploying."
  value       = aws_cloudfront_distribution.main.id
}

output "cloudfront_domain" {
  description = "Auto-generated CloudFront hostname. Users hit *.aeglero.com instead — this is for debugging."
  value       = aws_cloudfront_distribution.main.domain_name
}
