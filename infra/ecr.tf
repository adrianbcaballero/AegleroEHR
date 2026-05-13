# ── ECR repository for the Flask backend image ──
resource "aws_ecr_repository" "backend" {
  name                 = "aeglero-emr-backend"
  image_tag_mutability = "MUTABLE"

  # Allows `terraform destroy` to delete the repo even if it still has images.
  # Without this, destroy fails with "RepositoryNotEmptyException" any time
  # there's a previously-pushed image. Images are rebuilt on every deploy
  # anyway, so there's no operational reason to gate destroy on image presence.
  force_delete = true

  # Auto-scan on push surfaces CVEs in OS packages and Python deps.
  # Free for basic scanning; results visible in ECR console.
  image_scanning_configuration {
    scan_on_push = true
  }

  # AWS-owned key encryption (free, AES-256). Backend images are application
  # code, not PHI — AWS-owned keys are sufficient under the BAA. Upgrade to
  # customer-managed KMS later if compliance review demands it.
  encryption_configuration {
    encryption_type = "AES256"
  }
}

# Keep at most 20 images; older ones expire.
# Stops ECR storage bloat from years of CI builds.
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
