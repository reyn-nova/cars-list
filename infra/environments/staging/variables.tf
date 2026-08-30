variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-southeast-3"
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

variable "allowed_ssh_cidr" {
  description = "CIDR block allowed to SSH into the EC2 instance"
  type        = string
  default     = "0.0.0.0/0"
}
