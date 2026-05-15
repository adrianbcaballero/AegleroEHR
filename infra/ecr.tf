# ── ECR repository for the backend image ──
# Tag mutability stays MUTABLE because the deploy workflow uses a floating
# `:latest` tag. Migrating to SHA-tagged images would require updating the
# task definition with the new image URI on each deploy.
# trivy:ignore:AVD-AWS-0031 -- See docs/iac-scan-exceptions.md.
resource "aws_ecr_repository" "backend" {
  # checkov:skip=CKV_AWS_51: Mutable tags required by :latest deploy workflow.
  # checkov:skip=CKV_AWS_136: AWS-owned encryption sufficient for non-PHI application code.
  name                 = "aeglero-emr-backend"
  image_tag_mutability = "MUTABLE"

  # Allow `terraform destroy` to delete the repo with images still present.
  force_delete = true

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

# Retain the last 20 images; expire older ones.
resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 20 images; expire older"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 20
        }
        action = { type = "expire" }
      }
    ]
  })
}
