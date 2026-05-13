# ── Hosted zone reference (already exists) ──
data "aws_route53_zone" "primary" {
  zone_id      = var.hosted_zone_id
  private_zone = false
}

# ── ACM cert for the ALB ──
# Wildcard covers every tenant subdomain (democlinic.aeglero.com,
# clinic2.aeglero.com, etc). DNS-validated since the zone lives in this account.
# This cert is the REGIONAL one for the ALB. CloudFront in Phase 3e gets its
# own cert in us-east-1 (CloudFront's hard requirement).
resource "aws_acm_certificate" "alb" {
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
resource "aws_lb" "main" {
  name               = "aeglero-emr-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id

  # idle_timeout default 60s. Bump if we have long-running uploads later.
  idle_timeout = 60

  # Drop invalid HTTP requests at the LB instead of forwarding garbage to ECS.
  drop_invalid_header_fields = true

  enable_deletion_protection = false  # keep iteration friendly
  enable_http2               = true

  # Access logs to S3 — only enabled when var.enable_alb_access_logs is true.
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
# Points at the ECS tasks on port 5000. Health check on /healthz (the endpoint
# we already added to the Flask app). Multi-AZ since the targets span both
# private subnets via the ECS service network configuration.
resource "aws_lb_target_group" "backend" {
  name        = "aeglero-emr-backend-tg"
  port        = 5000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"  # Fargate uses awsvpc mode → targets are IPs, not instance IDs

  health_check {
    path                = "/healthz"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    interval            = 15
    timeout             = 5
    matcher             = "200"
  }

  # Stickiness off — stateless app; sessions live in cookies/DB, not memory.
  stickiness {
    enabled = false
    type    = "lb_cookie"
  }

  deregistration_delay = 30  # let in-flight requests finish before draining
}

# ── HTTPS listener ──
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"  # TLS 1.2+ only
  certificate_arn   = aws_acm_certificate_validation.alb.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}

# NOTE: No ALB HTTP listener — CloudFront's `viewer_protocol_policy =
# "redirect-to-https"` handles the HTTP-to-HTTPS redirect at the edge before
# any traffic reaches this ALB. Adding a port-80 listener here would also
# require a port-80 ingress rule on the SG referencing the CloudFront prefix
# list, which doubles the effective rule count and trips the per-SG quota.
