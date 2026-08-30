# cars-list Infrastructure

## Architecture Overview

This project uses a unified architecture across dev, staging, and production:

- **Docker Compose** runs on an EC2 instance with all services in containers
- **PostgreSQL** runs as a Docker container in every environment (not RDS)
- **Docker named volumes** provide persistent storage for Postgres data on the EC2 root volume
- **S3 bucket** per environment for photo storage (real AWS S3 in staging/production)
- **MinIO** for local development only (S3 emulation)
- **Automated backups** via a sidecar container running pg_dump on a schedule

## Directory Structure

```
cars-list/
├── docker-compose.yml          # Identical across all environments
├── Dockerfile                  # ARM64-compatible (node:24-alpine)
├── scripts/
│   ├── backup.sh               # pg_dump + upload to S3
│   └── restore.sh              # Download + restore from S3
├── infra/
│   ├── modules/
│   │   ├── ec2-app-db/         # EC2 instance (root volume only)
│   │   ├── s3/                 # S3 bucket
│   │   └── networking/         # VPC, subnet, security group
│   └── environments/
│       ├── dev/                # Isolated Terraform state
│       ├── staging/            # Isolated Terraform state
│       └── production/         # Isolated Terraform state
├── .github/workflows/
│   ├── ci.yml                  # Tests on PRs
│   ├── deploy-staging.yml      # Auto-deploy on merge to main
│   └── deploy-production.yml   # Manual approval / tag
└── src/
    └── s3.ts                   # S3/MinIO client (endpoint-aware)
```

## Environment Variables

All connection info comes from environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PG_HOST` | Postgres host | `db` (Docker service) |
| `PG_PORT` | Postgres port | `5432` |
| `PG_USER` | Postgres user | `postgres` |
| `PG_PASSWORD` | Postgres password | (required) |
| `PG_DATABASE` | Postgres database | `cars` |
| `S3_BUCKET` | S3 bucket name | `cars-list` |
| `S3_ENDPOINT` | S3 SDK endpoint URL (empty for real AWS) | (empty) |
| `S3_PUBLIC_ENDPOINT` | Public-facing S3 URL for browsers (falls back to S3_ENDPOINT) | (empty) |
| `AWS_ACCESS_KEY_ID` | AWS access key | (required for local dev; use IAM role in deployed envs) |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | (required for local dev; use IAM role in deployed envs) |
| `AWS_REGION` | AWS region | `ap-southeast-3` |
| `API_KEY` | Application API key | (optional) |
| `NODE_ENV` | Environment | `development` |
| `APP_PORT` | Host port mapping for the app | `3000` |
| `BACKUP_RETENTION_DAYS` | Days to keep backups | `7` |

## Local Development

```bash
# Copy env file and configure
cp .env.example .env
# Edit .env with your values

# Start all services (app, postgres, minio)
docker compose up -d

# Run migrations
docker compose --profile tools run --rm migrate

# Run tests
docker compose run --rm app sh -c "npm test"

# Access the API
curl http://localhost:3000/health

# Access MinIO console
open http://localhost:9001  # minioadmin / minioadmin
```

## Deployment

### Prerequisites

1. Terraform state backend (S3 with native locking):
```bash
aws s3 mb s3://cars-list-terraform-state --region ap-southeast-3
```

2. SSH key pair for EC2 access (place at `~/.ssh/cars-list-{env}`)

### Deploy to Staging

Automated on merge to `main` branch via GitHub Actions.

Required GitHub secrets: `STAGING_SSH_KEY`, `STAGING_DB_PASSWORD`, `STAGING_API_KEY`
Required GitHub vars: `STAGING_EC2_IP`, `STAGING_S3_BUCKET`, `AWS_REGION`

### Deploy to Production

Manual trigger via GitHub Actions workflow dispatch or push a version tag:
```bash
git tag v1.0.0
git push origin v1.0.0
```

Required GitHub secrets: `PRODUCTION_SSH_KEY`, `PROD_DB_PASSWORD`, `PROD_API_KEY`
Required GitHub vars: `PRODUCTION_EC2_IP`, `PROD_S3_BUCKET`, `AWS_REGION`

### Manual Deploy

Create a `.env.{env}` file from `.env.example` with your environment values (e.g., `.env.staging`), then:

```bash
./deploy.sh dev       # Deploy to dev
./deploy.sh staging   # Deploy to staging
./deploy.sh production # Deploy to production
```

## Backup & Restore

### Automated Backups

The backup sidecar container runs pg_dump every 6 hours:
- Backups stored in `s3://<bucket>/backups/`
- Retention: 7 days (configurable via `BACKUP_RETENTION_DAYS`)
- Format: gzipped SQL dumps

### Manual Backup

```bash
docker compose run --rm backup /usr/local/bin/backup.sh
```

### Restore from Backup

```bash
# List available backups (AWS)
aws s3 ls s3://<bucket>/backups/

# List available backups (MinIO)
aws s3 ls s3://<bucket>/backups/ --endpoint-url http://localhost:9000

# Restore a specific backup
docker compose run --rm backup ./scripts/restore.sh backups/cars_20260830_120000.sql.gz
```

### Restore to a Different Database

```bash
PGDATABASE=cars_restored docker compose run --rm backup ./scripts/restore.sh backups/cars_20260830_120000.sql.gz
```

## Infrastructure Notes

### t4g.micro Instance

The EC2 t4g.micro (2 vCPU, 1 GB RAM, ARM64/Graviton) is a cost-minimal choice suitable for low to moderate traffic. The same instance type is used across all environments for consistency.

**Warning:** T4g instances use burstable performance. If sustained CPU load exhausts T-series burst credits, the instance will be throttled. Production workloads with sustained high CPU should be resized to a non-burstable instance type (e.g., `t4g.small` or `m7g.large`).

### ARM64 Compatibility

All Docker images are ARM64-compatible:
- `node:24-alpine` publishes arm64 natively
- `postgres:18` publishes arm64 natively
- `minio/minio` publishes arm64 natively

**Native npm dependencies:** If your project uses native addons (e.g., `bcrypt`, `sharp`, `node-sass`), they must be rebuilt for ARM64. Check `npm ls` for native modules and ensure `npm install` runs on the ARM64 target or use `--platform=linux/arm64` with Docker buildx.

### Security

- Secrets are injected via environment variables at deploy time
- EBS root volume is encrypted at rest
- IMDSv2 is enforced on EC2 instances (prevents SSRF-based credential theft)
- S3 bucket policies use bucket-owner-enforced object ownership
- Security group restricts access to ports 3000 (app) and 22 (SSH)
- Postgres port 5432 is mapped to the host inside Docker but is only accessible within the Docker network by other containers
