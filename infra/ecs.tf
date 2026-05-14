# ── CloudWatch log group for app logs ──
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/aws/ecs/aeglero-emr-backend"
  retention_in_days = var.log_retention_days
  kms_key_id        = aws_kms_key.logs.arn
}

# ── Task execution role ──
# This role is used by the ECS agent (not the app itself) to:
#   - pull the image from ECR
#   - write logs to CloudWatch
#   - fetch secrets from Secrets Manager and decrypt them with KMS
resource "aws_iam_role" "task_execution" {
  name = "aeglero-emr-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# AWS-managed policy: ECR pull, CloudWatch Logs write
resource "aws_iam_role_policy_attachment" "task_execution_managed" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Custom policy: scoped Secrets Manager + KMS access for our 3 secrets only
resource "aws_iam_role_policy" "task_execution_secrets" {
  name = "secrets-and-kms"
  role = aws_iam_role.task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadSecrets"
        Effect = "Allow"
        Action = ["secretsmanager:GetSecretValue"]
        Resource = [
          aws_secretsmanager_secret.db_master.arn,
          aws_secretsmanager_secret.flask_secret_key.arn,
          aws_secretsmanager_secret.database_url.arn,
        ]
      },
      {
        Sid    = "DecryptSecrets"
        Effect = "Allow"
        Action = ["kms:Decrypt"]
        Resource = aws_kms_key.secrets.arn
      },
    ]
  })
}

# ── Task role ──
# This is the IAM identity the running app assumes. The Flask app currently
# doesn't make AWS API calls (DB connection uses creds from env vars).
# SSM permissions below enable `aws ecs execute-command` so we can shell into
# a running container to seed the first tenant + admin user.
resource "aws_iam_role" "task" {
  name = "aeglero-emr-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ecs-tasks.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Allows the task to participate in ECS exec sessions. Required by
# `enable_execute_command = true` on the service.
resource "aws_iam_role_policy" "task_ecs_exec" {
  name = "ecs-exec"
  role = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "ssmmessages:CreateControlChannel",
        "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel",
        "ssmmessages:OpenDataChannel",
      ]
      Resource = "*"
    }]
  })
}

# ── ECS Cluster ──
resource "aws_ecs_cluster" "main" {
  name = "aeglero-emr"

  setting {
    name  = "containerInsights"
    value = "enabled"  # CloudWatch Container Insights — adds ~$5/mo but valuable
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
    base              = 1
  }
}

# ── Task Definition ──
resource "aws_ecs_task_definition" "backend" {
  family                   = "aeglero-emr-backend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.ecs_task_cpu
  memory                   = var.ecs_task_memory
  execution_role_arn       = aws_iam_role.task_execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = "backend"
      image     = "${aws_ecr_repository.backend.repository_url}:${var.ecs_image_tag}"
      essential = true

      # Root filesystem read-only is intended but currently broken on this stack:
      # the Fargate-mounted /tmp ephemeral volume comes up root-owned and the
      # non-root `app` user (uid 1000) can't write to it, so gunicorn fails at
      # worker spawn (tempfile.mkstemp → ENOENT). Re-enable after either:
      #   (a) chowning the volume in an entrypoint shim that starts as root, or
      #   (b) running the container as root (defeats the purpose), or
      #   (c) switching to a different temp dir baked into the image with
      #       correct ownership and setting TMPDIR + gunicorn worker-tmp-dir.
      readonlyRootFilesystem = false

      portMappings = [
        {
          containerPort = 5000
          hostPort      = 5000
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "FLASK_DEBUG",            value = "false" },
        { name = "TRUSTED_PROXY_COUNT",    value = "1" },           # behind ALB
        { name = "CORS_ORIGINS",           value = var.cors_origins },
        # Suppress .pyc writes — root FS is read-only, so trying to cache
        # bytecode at runtime would error rather than just being slow.
        { name = "PYTHONDONTWRITEBYTECODE", value = "1" },
      ]

      mountPoints = [
        {
          sourceVolume  = "tmp"
          containerPath = "/tmp"
          readOnly      = false
        }
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.database_url.arn },
        { name = "SECRET_KEY",   valueFrom = aws_secretsmanager_secret.flask_secret_key.arn },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "backend"
        }
      }

      # No container-level healthCheck — the ALB target group health check on
      # /healthz is the source of truth. A container-level check would need
      # curl or wget in the python:3.12-slim base image, neither of which are
      # installed by default.
    }
  ])

  # tmpfs volume backing /tmp inside the container. Fargate supports empty
  # `host {}` volumes; the runtime gives the task an ephemeral writable area
  # for it without ever touching the host filesystem.
  volume {
    name = "tmp"
  }

  # Note: previously had `ignore_changes = [container_definitions]` here as a
  # guard against image-tag drift breaking plans. Removed for now so we can
  # iterate on the task def. Add it back once the deploy pipeline is stable
  # and you don't want every Terraform plan to show a no-op container_def
  # diff because of resolved-tag SHA changes.
}

# ── ECS Service ──
resource "aws_ecs_service" "backend" {
  name             = "aeglero-emr-backend"
  cluster          = aws_ecs_cluster.main.id
  task_definition  = aws_ecs_task_definition.backend.arn
  desired_count    = var.ecs_desired_count
  launch_type      = "FARGATE"
  platform_version = "LATEST"

  # Allows `aws ecs execute-command` to open a shell into a running task.
  # Used for one-off ops like seeding the first tenant + admin user.
  enable_execute_command = true

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false  # outbound goes via NAT
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 5000
  }

  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  # Wait for the ALB listener and target group to exist before the service
  # starts trying to register tasks.
  depends_on = [aws_lb_listener.https]

  lifecycle {
    # ignore desired_count so manual scale-up via the AWS console / CLI doesn't
    # get reverted on every Terraform apply. task_definition removed from the
    # ignore list so we can roll out task-def changes through Terraform.
    ignore_changes = [desired_count]
  }
}
