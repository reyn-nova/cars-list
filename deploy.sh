#!/usr/bin/env bash
set -euo pipefail

git pull
terraform init -input=false
terraform apply -auto-approve
