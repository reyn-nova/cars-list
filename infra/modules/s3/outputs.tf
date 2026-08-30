output "bucket_name" {
  description = "Name of the S3 bucket"
  value       = aws_s3_bucket.app.id
}

output "bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = aws_s3_bucket.app.arn
}

output "bucket_domain" {
  description = "Domain name of the S3 bucket"
  value       = aws_s3_bucket.app.bucket_domain_name
}
