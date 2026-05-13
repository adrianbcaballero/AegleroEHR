# ── VPC ──
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "aeglero-emr-vpc"
  }
}

# ── Internet Gateway ──
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "aeglero-emr-igw"
  }
}

# ── Subnets ──
# Three tiers for defense in depth:
#   Public    — ALB, NAT (attached to internet)
#   Private   — ECS Fargate (outbound via NAT)
#   Isolated  — RDS (no internet route at all, even for outbound)

resource "aws_subnet" "public" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index}.0/24"
  availability_zone = var.azs[count.index]

  # We don't auto-assign public IPs to instances — only the ALB/NAT have them.
  map_public_ip_on_launch = false

  tags = {
    Name = "aeglero-emr-public-${var.azs[count.index]}"
    Tier = "public"
  }
}

resource "aws_subnet" "private" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = var.azs[count.index]

  tags = {
    Name = "aeglero-emr-private-${var.azs[count.index]}"
    Tier = "private"
  }
}

resource "aws_subnet" "isolated" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 20}.0/24"
  availability_zone = var.azs[count.index]

  tags = {
    Name = "aeglero-emr-isolated-${var.azs[count.index]}"
    Tier = "isolated"
  }
}

# ── NAT Gateway (single-AZ for cost) ──
# One NAT in one AZ = ~$32/mo. Two NATs (one per AZ) = ~$64/mo for true HA.
# An AZ outage taking down the NAT means tasks in that AZ's private subnet
# can't make outbound calls; ECS would self-heal in the surviving AZ.
# Future optimization: replace with VPC endpoints for ECR/Secrets/KMS/S3 to
# drop NAT costs entirely. Ship single-NAT now, optimize when traffic warrants.
resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "aeglero-emr-nat-eip"
  }
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name = "aeglero-emr-nat"
  }

  depends_on = [aws_internet_gateway.main]
}

# ── Route tables ──
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "aeglero-emr-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.main.id
  }

  tags = {
    Name = "aeglero-emr-private-rt"
  }
}

resource "aws_route_table_association" "private" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# Isolated route table has NO default route — RDS literally cannot reach
# the internet even if its security group allowed all egress.
resource "aws_route_table" "isolated" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "aeglero-emr-isolated-rt"
  }
}

resource "aws_route_table_association" "isolated" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.isolated[count.index].id
  route_table_id = aws_route_table.isolated.id
}

# AWS-managed prefix list of CloudFront origin-facing IP ranges. Auto-updated
# by AWS when CloudFront edges shift IPs. Referenced by the ALB SG so the only
# thing that can reach the ALB is CloudFront itself.
data "aws_ec2_managed_prefix_list" "cloudfront" {
  name = "com.amazonaws.global.cloudfront.origin-facing"
}

# ── Security Groups ──
# name_prefix + create_before_destroy lets Terraform handle replacements
# cleanly when an immutable field (like description) changes. Without these,
# a description edit triggers "destroy then create" which deadlocks because
# the old SG is still attached to the ALB.
resource "aws_security_group" "alb" {
  name_prefix = "aeglero-emr-alb-"
  description = "ALB for EMR backend - reachable only from CloudFront edges"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "HTTPS from CloudFront edges only"
    from_port       = 443
    to_port         = 443
    protocol        = "tcp"
    prefix_list_ids = [data.aws_ec2_managed_prefix_list.cloudfront.id]
  }

  # No HTTP (port 80) rule — CloudFront handles HTTP→HTTPS redirects at the
  # edge with viewer_protocol_policy = "redirect-to-https". No HTTP traffic
  # ever reaches the ALB. Each prefix-list reference counts as ~55 toward the
  # default SG rule quota of 60, so adding a second rule blew past the limit.

  # ALB only ever talks to ECS tasks living in this VPC. Scoping egress to the
  # VPC CIDR eliminates the "unrestricted egress" finding without changing
  # behavior — the ALB has no legitimate need to reach the internet.
  egress {
    description = "Forward to ECS tasks (VPC only)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = [var.vpc_cidr]
  }

  tags = {
    Name = "aeglero-emr-alb-sg"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_security_group" "ecs" {
  name        = "aeglero-emr-ecs-sg"
  description = "ECS Fargate tasks running the EMR backend"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "App port (5000) from ALB only"
    from_port       = 5000
    to_port         = 5000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Egress rules are defined as standalone aws_security_group_rule resources
  # below (HTTPS to AWS endpoints + Postgres to RDS). Inline egress is omitted
  # to avoid the cycle that would form between ecs and rds SG declarations,
  # and Terraform doesn't allow mixing inline and standalone rules on one SG.

  tags = {
    Name = "aeglero-emr-ecs-sg"
  }
}

resource "aws_security_group" "rds" {
  name        = "aeglero-emr-rds-sg"
  description = "RDS Postgres - only reachable from ECS"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Postgres (5432) from ECS only"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  # No egress rules — RDS is a server, it doesn't initiate connections.
  # SGs are stateful so query responses still flow back to ECS. The isolated
  # route table has no internet path either, so this is defense-in-depth.

  tags = {
    Name = "aeglero-emr-rds-sg"
  }
}

# ECS tasks need 443 outbound to reach ECR, Secrets Manager, KMS, CloudWatch
# Logs, and SSM (for ECS exec). All of these are public AWS endpoints reached
# via NAT — there's no narrower CIDR short of provisioning VPC endpoints for
# each service (deferred until cost/scale warrants it).
# trivy:ignore:AVD-AWS-0104 -- HTTPS-only egress to AWS service endpoints via NAT; tighter scoping requires VPC endpoints.
resource "aws_security_group_rule" "ecs_https_egress" {
  type              = "egress"
  description       = "HTTPS to AWS service endpoints (ECR, Secrets, KMS, Logs, SSM)"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.ecs.id
}

# ECS → RDS Postgres egress, declared standalone to avoid a cycle between the
# ECS and RDS SG resource declarations.
resource "aws_security_group_rule" "ecs_to_rds" {
  type                     = "egress"
  description              = "Postgres to RDS"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.ecs.id
  source_security_group_id = aws_security_group.rds.id
}

# ── VPC Flow Logs to CloudWatch ──
# Captures all packet metadata (allow + deny) for HIPAA-relevant network audit.
resource "aws_cloudwatch_log_group" "vpc_flow" {
  name              = "/aws/vpc/aeglero-emr/flow-logs"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.logs.arn
}

resource "aws_iam_role" "vpc_flow" {
  name = "aeglero-emr-vpc-flow-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "vpc-flow-logs.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy" "vpc_flow" {
  name = "vpc-flow-cloudwatch"
  role = aws_iam_role.vpc_flow.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams",
        "logs:DescribeLogGroups",
      ]
      Resource = "${aws_cloudwatch_log_group.vpc_flow.arn}:*"
    }]
  })
}

resource "aws_flow_log" "main" {
  iam_role_arn    = aws_iam_role.vpc_flow.arn
  log_destination = aws_cloudwatch_log_group.vpc_flow.arn
  traffic_type    = "ALL"
  vpc_id          = aws_vpc.main.id
}
