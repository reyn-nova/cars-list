#!/bin/bash
set -e

ENV="${1:?Usage: deploy.sh <environment> (dev|staging|production)}"
ENV_DIR="infra/environments/${ENV}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "${SCRIPT_DIR}/${ENV_DIR}" ]; then
  echo "Error: environment directory ${ENV_DIR} does not exist."
  exit 1
fi

if [ ! -f "${SCRIPT_DIR}/.env.${ENV}" ]; then
  echo "Error: .env.${ENV} file not found. Create it from .env.example with your ${ENV} values."
  exit 1
fi

echo "==> Deploying to ${ENV}..."

# 1. Terraform apply
echo "==> Running Terraform apply for ${ENV}..."
cd "${SCRIPT_DIR}/${ENV_DIR}"
terraform init -reconfigure
terraform apply -auto-approve
cd "${SCRIPT_DIR}"

# 2. Get the EC2 public IP from Terraform output
EC2_IP=$(cd "${SCRIPT_DIR}/${ENV_DIR}" && terraform output -raw ec2_public_ip)
SSH_KEY="${HOME}/.ssh/cars-list-${ENV}"

if [ ! -f "${SSH_KEY}" ]; then
  echo "Warning: SSH key ${SSH_KEY} not found. Set up SSH access first."
  exit 1
fi

echo "==> Deploying to EC2 at ${EC2_IP}..."

# 3. Create remote directories
ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no ec2-user@"${EC2_IP}" "mkdir -p ~/cars-list/{scripts,src}"

# 4. Copy files
scp -i "${SSH_KEY}" -o StrictHostKeyChecking=no \
  docker-compose.yml Dockerfile package.json package-lock.json tsconfig.json \
  ec2-user@"${EC2_IP}":~/cars-list/

scp -i "${SSH_KEY}" -o StrictHostKeyChecking=no -r scripts/ \
  ec2-user@"${EC2_IP}":~/cars-list/

scp -i "${SSH_KEY}" -o StrictHostKeyChecking=no -r src/ \
  ec2-user@"${EC2_IP}":~/cars-list/

scp -i "${SSH_KEY}" -o StrictHostKeyChecking=no "${SCRIPT_DIR}/.env.${ENV}" \
  ec2-user@"${EC2_IP}":~/cars-list/.env

# 5. Deploy and run
ssh -i "${SSH_KEY}" -o StrictHostKeyChecking=no ec2-user@"${EC2_IP}" << 'REMOTE'
cd ~/cars-list
if docker compose build app && docker compose up -d --remove-orphans; then
  if docker compose --profile tools run --rm migrate; then
    echo "Migrations completed successfully."
  else
    echo "ERROR: Migrations failed!" >&2
    exit 1
  fi
else
  echo "ERROR: Build or deploy failed!" >&2
  exit 1
fi
REMOTE

echo "==> Deploy complete. App running at http://${EC2_IP}:3000"
