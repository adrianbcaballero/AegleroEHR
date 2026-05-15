# ── Hosted zone reference (already exists) ──
data "aws_route53_zone" "primary" {
  zone_id      = var.hosted_zone_id
  private_zone = false
}

# ── ACM cert for the ALB ──
# Wildcard cert covers every tenant subdomain. DNS-validated against the
# Route 53 zone in this account. CloudFront uses a separate us-east-1 cert.
resource "aws_acm_certificate" "alb" {
  # checkov:skip=CKV2_AWS_71: Wildcard required for the multi-tenant subdomain model.
  domain_name       = "*.${var.domain_name}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "alb_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.alb.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id         = data.aws_route53_zone.primary.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "alb" {
  certificate_arn         = aws_acm_certificate.alb.arn
  validation_record_fqdns = [for r in aws_route53_record.alb_cert_validation : r.fqdn]
}

# ── Application Load Balancer ──
# Internet-facing so the CloudFront distribution can reach it as an origin.
# Ingress is restricted at the security-group layer to the AWS-managed
# CloudFront origin-facing prefix list.
# trivy:ignore:AVD-AWS-0053 -- See docs/iac-scan-exceptions.md.
resource "aws_lb" "main" {
  # checkov:skip=CKV_AWS_150: Deletion protection toggled via var.alb_deletion_protection.
  # checkov:skip=CKV2_AWS_28: WAF runs at the CloudFront edge; see waf.tf.
  name               = "aeglero-emr-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  idle_timeout = 60

  # Reject malformed HTTP at the LB before forwarding.
  drop_invalid_header_fields = true

  enable_deletion_protection = false
  enable_http2               = true

  # Access logs to S3, gated on var.enable_alb_access_logs.
  dynamic "access_logs" {
    for_each = var.enable_alb_access_logs ? [1] : []
    content {
      bucket  = aws_s3_bucket.access_logs[0].bucket
      prefix  = "alb"
      enabled = true
    }
  }

  depends_on = [aws_s3_bucket_policy.access_logs]
}

# ── Target group ──
# Targets ECS tasks on port 5000. Fargate's awsvpc mode requires target_type = "ip".
resource "aws_lb_target_group" "backend" {
  name        = "aeglero-emr-backend-tg"
  port        = 5000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/healthz"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
    matcher             = "200"
  }

  # Stateless app; sessions are cookie-based.
  stickiness {
    enabled = false
    type    = "lb_cookie"
  }

  deregistration_delay = 30
}

# ── HTTPS listener ──
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.alb.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}

# No HTTP listener — CloudFront performs HTTP→HTTPS redirects at the edge.
# A port-80 ingress rule would also exceed the per-SG rule quota due to the
# CloudFront prefix-list footprint.
