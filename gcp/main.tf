terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = "cars-list-gcp" # <-- replace with your GCP project id
  region  = "us-west1"
}

resource "google_storage_bucket" "cars_bucket" {
  name                        = "cars-list-bucket-unique123" # must be globally unique
  location                    = "US"
  uniform_bucket_level_access = true

  # Free-tier friendly: auto-delete old objects so storage stays tiny
  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }
}
