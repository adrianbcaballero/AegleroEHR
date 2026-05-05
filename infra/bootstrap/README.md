# Bootstrap Module

Creates the foundation that every other Terraform module in this repo depends on:

- **S3 bucket** holding remote state for all EMR Terraform (versioned, KMS-encrypted, public access blocked, 90-day lifecycle on old versions)
- **DynamoDB lock table** preventing two `terraform apply` runs from racing
- **KMS key** dedicated to encrypting the state bucket and lock table

This module is a one-time apply. After the bootstrap is in place, every other module uses it as a remote backend.

## What it costs

| Resource | Cost |
|---|---|
| KMS key (1) | $1/month |
| DynamoDB table (PAY_PER_REQUEST) | ~$0 idle |
| S3 storage (state file ~100 KB) | ~$0 |
| **Total** | **~$1/month** |

## One-time apply procedure

You only do this **once**, ever, on a fresh AWS account. After this it's done.

```powershell
$env:AWS_PROFILE = "aeglero"
aws sts get-caller-identity   # confirm Aeglero account ID

cd infra/bootstrap
terraform init                # local state for this first apply
terraform apply               # review plan, yes
```

You should see ~6 resources created in under 60 seconds. Capture the outputs — you'll paste `backend_config_snippet` into the next module's backend config.

## Migrating bootstrap state into the new bucket (recommended)

Right after the first apply, migrate the bootstrap module's own state file from local disk into the bucket it just created. This keeps every Terraform state in one place.

1. Add a `backend.tf` file in this directory:

   ```hcl
   terraform {
     backend "s3" {
       bucket         = "aeglero-emr-tfstate"
       key            = "bootstrap/terraform.tfstate"
       region         = "us-east-2"
       profile        = "aeglero"
       dynamodb_table = "aeglero-emr-tflock"
       encrypt        = true
     }
   }
   ```

2. Run the migration:

   ```powershell
   terraform init -migrate-state
   ```

   Terraform will detect the new backend, ask if you want to copy your local state to it. Say yes.

3. Verify the local `terraform.tfstate` has been emptied (or delete it). Future `terraform apply` runs in this directory will read/write state from the bucket and acquire locks via DynamoDB.

## When you'd come back here

Almost never. Reasons to re-apply this module:

- Adjusting the lifecycle rule (e.g., longer retention)
- Rotating the KMS key (auto-rotation handles this — you don't need Terraform)
- Tightening the KMS key policy (e.g., when adding more IAM users)
- Adding a new backend bucket for a different environment (staging, dev)

Otherwise this is "set and forget."

## What NOT to do

- Don't `terraform destroy` this module unless you're tearing down the entire EMR. The KMS key has a 7-day deletion waiting period and the state bucket holds the only record of what's deployed.
- Don't change `state_bucket_name` after applying — bucket names can't be changed, and renaming forces destroy + recreate, which would delete all your state.
- Don't disable versioning on the state bucket. It's the only way to roll back from a bad apply.
