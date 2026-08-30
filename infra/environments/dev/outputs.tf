output "ec2_public_ip" {
  value = module.ec2_app_db.ec2_public_ip
}

output "s3_bucket_name" {
  value = module.s3.bucket_name
}

output "s3_bucket_domain" {
  value = module.s3.bucket_domain
}
