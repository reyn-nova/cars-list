#!/usr/bin/env bash
set -euo pipefail

git pull --ff-only
terraform init -input=false
terraform apply -replace=docker_image.app -auto-approve
