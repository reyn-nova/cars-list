locals {
  env  = "production"
  name = "cars-list-${local.env}"
  tags = {
    Environment = local.env
    Project     = "cars-list"
  }
}

module "networking" {
  source = "../../modules/networking"

  name              = local.name
  allowed_ssh_cidr  = var.allowed_ssh_cidr
  tags              = local.tags
}

module "s3" {
  source = "../../modules/s3"

  name = "${local.name}-storage"
  tags = local.tags
}

module "ec2_app_db" {
  source = "../../modules/ec2-app-db"

  name              = local.name
  subnet_id         = module.networking.subnet_id
  security_group_id = module.networking.security_group_id
  db_name           = "cars"
  db_user           = "postgres"
  db_password       = var.db_password
  api_key           = var.api_key
  s3_bucket         = module.s3.bucket_name
  s3_bucket_arn     = module.s3.bucket_arn
  tags              = local.tags
}
