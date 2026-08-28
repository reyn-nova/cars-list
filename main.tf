terraform {
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

provider "docker" {}

variable "gcs_bucket" {
  description = "GCS bucket for car photos (optional; leave empty to disable uploads in-container)"
  default     = ""
}

resource "docker_network" "cars_net" {
  name = "cars-net"
}

resource "docker_volume" "db_data" {
  name = "cars_db_data"

  lifecycle {
    prevent_destroy = true
  }
}

resource "docker_image" "db" {
  name         = "postgres:15"
  keep_locally = true
}

resource "docker_image" "app" {
  name = "cars-list:latest"
  build {
    context = "."
  }
}

resource "docker_container" "db" {
  name    = "cars-db"
  image   = docker_image.db.image_id
  restart = "unless-stopped"

  env = [
    "POSTGRES_USER=postgres",
    "POSTGRES_PASSWORD=postgres",
    "POSTGRES_DB=cars",
  ]

  ports {
    internal = 5432
    external = 5432
  }

  healthcheck {
    test         = ["CMD-SHELL", "pg_isready -U postgres"]
    interval     = "5s"
    timeout      = "5s"
    retries      = 5
  }

  remove_volumes = false

  networks_advanced {
    name = docker_network.cars_net.name
  }

  volumes {
    volume_name    = docker_volume.db_data.name
    container_path = "/var/lib/postgresql/data"
  }
}

resource "docker_container" "app" {
  name    = "cars-app"
  image   = docker_image.app.image_id
  restart = "unless-stopped"

  depends_on = [docker_container.db]

  env = [
    "PORT=3000",
    "PG_HOST=cars-db",
    "PG_PORT=5432",
    "PG_USER=postgres",
    "PG_PASSWORD=postgres",
    "PG_DATABASE=cars",
    "GCS_BUCKET=${var.gcs_bucket}",
  ]

  networks_advanced {
    name = docker_network.cars_net.name
  }

  ports {
    internal = 3000
    external = 3000
  }
}
