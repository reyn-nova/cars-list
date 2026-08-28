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

# Make objects publicly readable so photo URLs returned by the API work
resource "google_storage_bucket_iam_member" "public_read" {
  bucket = google_storage_bucket.cars_bucket.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

output "bucket_name" {
  value = google_storage_bucket.cars_bucket.name
}

output "public_url_base" {
  value = "https://storage.googleapis.com/${google_storage_bucket.cars_bucket.name}"
}
