variable "name" {
  description = "Name prefix for the EC2 instance"
  type        = string
}

variable "subnet_id" {
  description = "Subnet ID to launch the instance in"
  type        = string
}

variable "security_group_id" {
  description = "Security group ID to attach"
  type        = string
}

variable "ami_id" {
  description = "AMI ID (defaults to latest Amazon Linux 2023 ARM64)"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default     = {}
}

variable "db_name" {
  description = "Postgres database name"
  type        = string
}

variable "db_user" {
  description = "Postgres user"
  type        = string
  default     = "postgres"
}

variable "db_password" {
  description = "Postgres password"
  type        = string
  sensitive   = true
}

variable "api_key" {
  description = "Application API key"
  type        = string
  sensitive   = true
  default     = ""
}

variable "s3_bucket" {
  description = "S3 bucket name for app storage"
  type        = string
}

variable "s3_bucket_arn" {
  description = "ARN of the S3 bucket for IAM policy"
  type        = string
}
