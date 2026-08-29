terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  # region is taken from the AWS_REGION environment variable (not hardcoded here)
  # credentials are picked up from AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
  # or ~/.aws/credentials — no hard-coded secrets here.
}

variable "bucket_name" {
  description = "S3 bucket name (supplied at apply time via -var or TF_VAR_bucket_name, not hardcoded)"
  default     = ""
}

resource "aws_s3_bucket" "cars_bucket" {
  bucket = var.bucket_name # must be globally unique
}

# Allow public objects (so photo URLs returned by the API work)
resource "aws_s3_bucket_public_access_block" "cars_bucket_pab" {
  bucket                  = aws_s3_bucket.cars_bucket.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "public_read" {
  bucket = aws_s3_bucket.cars_bucket.id
  depends_on = [aws_s3_bucket_public_access_block.cars_bucket_pab]
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicRead"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.cars_bucket.arn}/*"
    }]
  })
}

output "bucket_name" {
  value = aws_s3_bucket.cars_bucket.id
}

output "public_url_base" {
  value = "https://${aws_s3_bucket.cars_bucket.id}.s3.amazonaws.com"
}
