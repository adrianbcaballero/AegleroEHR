# ── ECR repository for the Flask backend image ──
# Tag mutability is intentionally MUTABLE while the deploy workflow pushes a
# floating `:latest` tag that the ECS task definition references. Flipping to
# IMMUTABLE requires migrating the deploy to SHA-tagged images (one tag per
# build, task def updated with the new image URI on each deploy). Tracked as a
# follow-up — the operational change is non-trivial and unrelated to the rest
# of this security pass.
# trivy:ignore:AVD-AWS-0031 -- Required by current :latest-tag deploy workflow; migrate to SHA tags then remove suppression.
resource "aws_ecr_repository" "backend" {
  # checkov:skip=CKV_AWS_51: Mutable tags required by :latest deploy workflow — see comment above.
  # checkov:skip=CKV_AWS_136: Application container images contain no PHI; AWS-owned encryption is sufficient under the BAA and saves the per-key KMS cost.
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
