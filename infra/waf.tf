# AWS WAF on CloudFront. All resources are conditional on var.enable_waf.
#
# CloudFront-scoped WAF MUST live in us-east-1 (CloudFront's hard requirement,
# same as its ACM cert). Hence the aws.us_east_1 provider alias on each
# resource here.
#
# Rule priorities are arbitrary but must be unique within the Web ACL.
# Lower numbers evaluate first.

resource "aws_wafv2_web_acl" "cloudfront" {
  # checkov:skip=CKV2_AWS_31: WAF logging requires Kinesis Firehose or an S3 logging destination + parser; deferred until the WAF posture is stable and we want full request-level audit.
  count    = var.enable_waf ? 1 : 0
  provider = aws.us_east_1

  name        = "aeglero-emr-cloudfront-acl"
  description = "WAF protection for CloudFront EMR distribution"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # ── Rule 1: AWS Common Rule Set (OWASP top-10 style) ──
  rule {
    name     = "AWSCommonRules"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSCommonRules"
      sampled_requests_enabled   = true
    }
  }

  # ── Rule 2: Known bad inputs (CVEs, malicious patterns) ──
  rule {
    name     = "AWSKnownBadInputs"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSKnownBadInputs"
      sampled_requests_enabled   = true
    }
  }

  # ── Rule 3: SQL injection patterns ──
  rule {
    name     = "AWSSQLi"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSSQLi"
      sampled_requests_enabled   = true
    }
  }

  # ── Rule 4: Per-IP rate limit ──
  # Blocks any single IP making more than 2000 requests in a 5-minute window.
  # Generous threshold; legitimate users won't hit it.
  rule {
    name     = "RateLimitPerIP"
    priority = 10

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 2000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitPerIP"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "aeglero-emr-cloudfront-acl"
    sampled_requests_enabled   = true
  }
}
