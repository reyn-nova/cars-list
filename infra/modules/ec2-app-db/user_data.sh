#!/bin/bash
set -e

# System updates and Docker installation
dnf update -y
dnf install -y docker git curl

# Install Docker Compose plugin
dnf install -y docker-compose-plugin

systemctl enable docker
systemctl start docker

# Add ec2-user to docker group
usermod -aG docker ec2-user

# Set up application directory
mkdir -p /home/ec2-user/cars-list
chown ec2-user:ec2-user /home/ec2-user/cars-list

# Create .env with injected values
cat > /home/ec2-user/cars-list/.env << EOF
NODE_ENV=production
PORT=3000
PG_HOST=db
PG_PORT=5432
PG_USER=${db_user}
PG_PASSWORD=${db_password}
PG_DATABASE=${db_name}
API_KEY=${api_key}
S3_BUCKET=${s3_bucket}
S3_ENDPOINT=
S3_PUBLIC_ENDPOINT=
AWS_REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region)
EOF

chown ec2-user:ec2-user /home/ec2-user/cars-list/.env

# Create cron job for automated backups (every 6 hours)
cat > /etc/cron.d/pgbackup << 'CRON'
0 */6 * * * ec2-user cd /home/ec2-user/cars-list && docker compose exec -T backup /usr/local/bin/backup.sh >> /var/log/pgbackup.log 2>&1
CRON
chmod 0644 /etc/cron.d/pgbackup

# Run docker compose on first boot
cd /home/ec2-user/cars-list
docker compose up -d || echo "Waiting for user to copy docker-compose.yml..."
