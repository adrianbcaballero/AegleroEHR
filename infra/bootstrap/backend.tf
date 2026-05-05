terraform {
  backend "s3" {
    bucket         = "aeglero-emr-tfstate"
    key            = "bootstrap/terraform.tfstate"
    region         = "us-east-2"
    profile        = "aeglero"
    dynamodb_table = "aeglero-emr-tflock"
    encrypt        = true
    kms_key_id     = "arn:aws:kms:us-east-2:300724397697:key/156e7609-f1a8-415e-ade0-6b32d3526911"
  }
}
