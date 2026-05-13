# ── ACM cert for CloudFront ──
# CloudFront *requires* its cert in us-east-1, regardless of where the rest of
# the infrastructure lives. Hence the us_east_1 provider alias.
resource "aws_acm_certificate" "cloudfront" {
  # checkov:skip=CKV2_AWS_71: Wildcard required for the multi-tenant subdomain model.
  provider = aws.us_east_1

  domain_name       = "*.${var.domain_name}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cloudfront_cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cloudfront.domain_validation_options : dvo.domain_name => {
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

resource "aws_acm_certificate_validation" "cloudfront" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.cloudfront.arn
  validation_record_fqdns = [for r in aws_route53_record.cloudfront_cert_validation : r.fqdn]
}

# ── OAC for the S3 origin ──
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "aeglero-emr-frontend-oac"
  description                       = "OAC for the EMR frontend S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ── Security headers policy ──
# Browsers honor these on every response CloudFront serves. We don't manage a
# CSP here because the Next.js app pulls in inline scripts/styles for hydration
# and adding a CSP without auditing every page risks breaking the UI; revisit
# once the frontend has a build-time CSP plugin or per-route nonces.
resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "aeglero-emr-security-headers"
  comment = "HSTS, X-Content-Type-Options, frame deny, referrer policy"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 63072000  # 2 years
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    xss_protection {
      mode_block = true
      protection = true
      override   = true
    }
  }
}

# ── CloudFront Function for clean URL resolution ──
resource "aws_cloudfront_function" "rewrite" {
  name    = "aeglero-emr-rewrite"
  runtime = "cloudfront-js-2.0"
  comment = "Resolve clean URLs against Next.js static-export trailingSlash output"
  publish = true
  code    = file("${path.module}/cloudfront-rewrite.js")
}

# ── CloudFront Distribution ──
resource "aws_cloudfront_distribution" "main" {
  # checkov:skip=CKV_AWS_310: Single-origin design — failover requires a second regional ALB, deferred until we run active-active.
  # checkov:skip=CKV_AWS_374: US-only clinic base; geo restriction is a deny-list feature we'd revisit when international tenants arrive.
  # checkov:skip=CKV2_AWS_47: AWSManagedRulesKnownBadInputsRuleSet (attached in waf.tf) already covers Log4j; CKV2_AWS_47 wants a duplicate rule group.
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Aeglero EMR — multi-tenant"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"  # NA + EU edges only

  aliases = ["*.${var.domain_name}"]

  # Conditional WAF attachment. WAF ACL ARN comes from waf.tf, which itself is
  # only created when var.enable_waf is true.
  web_acl_id = var.enable_waf ? aws_wafv2_web_acl.cloudfront[0].arn : null

  # Conditional access logs to S3. CloudFront's logging is non-KMS (AES256
  # only), so the bucket in access_logs.tf is configured for that.
  dynamic "logging_config" {
    for_each = var.enable_cloudfront_access_logs ? [1] : []
    content {
      bucket          = aws_s3_bucket.access_logs[0].bucket_domain_name
      include_cookies = false
      prefix          = "cloudfront/"
    }
  }

  # ── Origin 1: S3 frontend bundle ──
  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # ── Origin 2: ALB backend (custom origin) ──
  # Origin domain is api.aeglero.com (Route 53 record below). This makes the
  # `*.aeglero.com` cert match during the CloudFront→ALB TLS handshake.
  origin {
    domain_name = "api.${var.domain_name}"
    origin_id   = "alb-backend"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_keepalive_timeout = 60
      origin_read_timeout      = 30
    }
  }

  # ── Default behavior: serve from S3, cache aggressively ──
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    # AWS managed CachingOptimized — sensible defaults for static sites.
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.rewrite.arn
    }
  }

  # ── /api/* → ALB, no cache, forward everything ──
  # AllViewer origin request policy forwards Host, cookies, query strings, all
  # headers. That's how the backend's get_slug_from_host() sees the user's
  # actual subdomain (e.g. democlinic.aeglero.com) instead of api.aeglero.com.
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "alb-backend"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    # AWS managed CachingDisabled — never cache API responses
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"

    # AWS managed AllViewer — forward every viewer header (esp. Host) to ALB
    origin_request_policy_id   = "216adef6-5c7f-47e4-b989-5492eafa07d3"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  }

  # 403/404 from S3 → Next.js 404 page
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404/index.html"
    error_caching_min_ttl = 60
  }

  custom_error_response {
    error_code            = 404
    response_code         = 404
    response_page_path    = "/404/index.html"
    error_caching_min_ttl = 60
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.cloudfront.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# ── DNS records ──

# api.aeglero.com → ALB. CloudFront uses this as origin so the *.aeglero.com
# cert matches during the TLS handshake. This record is publicly resolvable,
# but the ALB security group restricts ingress to CloudFront IPs only, so a
# direct connection from any non-CloudFront source is blocked at the SG.
resource "aws_route53_record" "api_alb" {
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = "api.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_lb.main.dns_name
    zone_id                = aws_lb.main.zone_id
    evaluate_target_health = false
  }
}

# Wildcard A-alias for tenant subdomains → CloudFront. More-specific records
# (aeglero.com, www.aeglero.com from the marketing CF, api.aeglero.com → ALB)
# take precedence, so this catches everything else: democlinic.aeglero.com,
# clinic2.aeglero.com, etc.
resource "aws_route53_record" "wildcard" {
  zone_id = data.aws_route53_zone.primary.zone_id
  name    = "*.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.main.domain_name
    zone_id                = aws_cloudfront_distribution.main.hosted_zone_id
    evaluate_target_health = false
  }
}
