# ── Engine version ──
# Postgres minor versions get retired periodically. Rather than pin a specific
# version that AWS may deprecate, this data source picks the most recent
# version we list that is still supported in this region.
data "aws_rds_engine_version" "postgres" {
  engine             = "postgres"
  preferred_versions = ["16.10", "16.9", "16.8", "16.7", "16.6", "16.5"]
}

# ── DB subnet group ──
# RDS uses these subnets for itself and the Multi-AZ standby. Isolated subnets
# have no internet route, so the database is genuinely unreachable from outside.
resource "aws_db_subnet_group" "main" {
  name       = "aeglero-emr-db-subnet-group"
  subnet_ids = aws_subnet.isolated[*].id

  tags = {
    Name = "aeglero-emr-db-subnet-group"
  }
}

# ── Parameter group ──
# rds.force_ssl = 1 forces every connection to use TLS. This complements the
# storage-at-rest KMS encryption — both data-in-flight and data-at-rest covered.
resource "aws_db_parameter_group" "postgres16" {
  name        = "aeglero-emr-postgres16"
  family      = "postgres16"
  description = "Aeglero EMR Postgres 16 parameters"

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  # Log slow queries (>1s) for performance debugging without flooding logs.
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }
}

# ── IAM role for Enhanced Monitoring ──
resource "aws_iam_role" "rds_monitoring" {
  name = "aeglero-emr-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ── CloudWatch log group for Postgres logs ──
# Pre-creating the log group lets us control encryption + retention. Without
# this, RDS creates the log group with default settings (no KMS, indefinite
# retention).
resource "aws_cloudwatch_log_group" "rds_postgresql" {
  name              = "/aws/rds/instance/aeglero-emr-db/postgresql"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.logs.arn
}

# ── RDS Postgres instance ──
resource "aws_db_instance" "main" {
  identifier     = "aeglero-emr-db"
  engine         = "postgres"
  engine_version = data.aws_rds_engine_version.postgres.version
  instance_class = "db.t4g.micro"

  # Storage
  allocated_storage     = 20
  max_allocated_storage = 100  # auto-scales up to this if you fill the disk
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.rds.arn

  # Auth & DB
  db_name  = "aeglero_emr"
  username = var.db_username
  password = jsondecode(aws_secretsmanager_secret_version.db_master.secret_string)["password"]

  # HA — Multi-AZ standby for failover. Controlled by var.rds_multi_az so dev
  # mode can save ~$0.40/day by running single-AZ. Prod always Multi-AZ.
  multi_az = var.rds_multi_az

  # Network — isolated subnets, RDS SG, no public access
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  port                   = 5432

  # Backups — 7-day retention is the minimum for HIPAA-aligned RPO; PITR is
  # automatic when retention > 0.
  backup_retention_period   = 7
  backup_window             = "03:00-04:00"          # UTC
  maintenance_window        = "sun:04:00-sun:05:00"  # UTC, after backup window
  copy_tags_to_snapshot     = true
  delete_automated_backups  = true

  # Logs
  enabled_cloudwatch_logs_exports = ["postgresql"]

  # Monitoring
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn

  performance_insights_enabled          = true
  performance_insights_kms_key_id       = aws_kms_key.rds.arn
  performance_insights_retention_period = 7  # 7 days = free tier

  # Lifecycle — both controlled by variables so testing can flip them off
  deletion_protection       = var.rds_deletion_protection
  skip_final_snapshot       = var.rds_skip_final_snapshot
  final_snapshot_identifier = var.rds_skip_final_snapshot ? null : "aeglero-emr-db-final-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  apply_immediately          = false
  auto_minor_version_upgrade = true

  parameter_group_name = aws_db_parameter_group.postgres16.name

  ca_cert_identifier = "rds-ca-rsa2048-g1"

  tags = {
    Name = "aeglero-emr-db"
  }

  lifecycle {
    # AWS auto-upgrades minor versions during the maintenance window. Don't
    # let Terraform try to "fix" the version on every apply.
    ignore_changes = [engine_version, final_snapshot_identifier]
  }

  depends_on = [aws_cloudwatch_log_group.rds_postgresql]
}
