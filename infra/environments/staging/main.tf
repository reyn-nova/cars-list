terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket  = "cars-list-terraform-state"
    key     = "staging/terraform.tfstate"
    region  = "ap-southeast-3"
    encrypt = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = "staging"
      Project     = "cars-list"
      ManagedBy   = "terraform"
    }
  }
}
