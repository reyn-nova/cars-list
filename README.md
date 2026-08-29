# Cars List API

A minimal REST API to manage a list of cars, built with **Express.js** and **TypeScript**, using **TypeORM** with PostgreSQL.

## Features

- `GET /cars` — list all cars, with optional `?name=` case-insensitive search and `?limit=` / `?offset=` pagination (limit capped at 100)
- `POST /cars` — add one or more cars (array, min 1; `name` and `type` required per car)
- `DELETE /cars` — delete one or more cars by `id` (array, min 1)
- `GET /health` — health check (used by container healthchecks)
- Swagger docs at `/api-docs`

## Local development

Requires Node.js and a PostgreSQL database.

```bash
cp .env.example .env   # adjust credentials
npm install
npm run dev           # http://localhost:3000
```

## Running with Docker

### Option A — Directly on your machine (macOS)

```bash
docker compose up --build
```

> If your Docker uses the standalone v1 binary, use `docker-compose up --build` instead.

This starts Postgres (`db`) and the app (`app`). The API is available at `http://localhost:3000` and Swagger docs at `http://localhost:3000/api-docs`.

### Option B — Ubuntu via Multipass on macOS

```bash
# On macOS: create an Ubuntu VM and mount the project
multipass launch 22.04 --name cars-vm
multipass mount /Users/nova/Desktop/cars-list cars-vm:/home/ubuntu/cars-list
multipass shell cars-vm

# Inside the VM
sudo apt update && sudo apt install -y docker.io docker-compose
cd /home/ubuntu/cars-list
sudo docker-compose up --build
```

Then get the VM IP and call the API:

```bash
multipass info cars-vm   # note the IPv4 address
curl http://<VM_IP>:3000/cars
```

Notes:
- `.env` is gitignored; the Compose file sets `PG_*` for you, so no `.env` is needed in Docker.
- `synchronize: true` auto-creates the `cars` table on first run.
- Stop: `docker compose down` (or `docker-compose down`). Wipe the DB too: `docker compose down -v`.

## Running with Terraform

This project can also be provisioned with Terraform using the **Docker provider** (no cloud account required). It replaces `docker-compose.yml` with `main.tf`.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed and running
- [Terraform](https://developer.hashicorp.com/terraform/downloads) CLI installed

### Usage

```bash
terraform init      # download the docker provider (needs internet, once)
terraform apply     # build the app image and start db + app containers
```

The API is available at `http://localhost:3000` and Swagger docs at `http://localhost:3000/api-docs`.

Inspect the plan before applying:

```bash
terraform plan
```

Tear everything down:

```bash
terraform destroy
```

### Deploying to a server

On a server with Docker + Terraform installed, pull and apply in one step:

```bash
./deploy.sh   # git pull && terraform init && terraform apply
```

Notes:
- Container env vars (ports, Postgres credentials) live in `main.tf`, not `.env`. `.env` is only used for local `npm run dev`.
- `terraform.tfstate` and `.terraform/` are gitignored; keep state on the server that runs `apply`.

## API examples

```bash
# Add cars
curl -X POST http://localhost:3000/cars -H "Content-Type: application/json" \
  -d '[{"name": "Ocelot Pariah", "type": "Sports"}, {"name": "Pegassi Zentorno", "type": "Super"}]'

# List cars
curl http://localhost:3000/cars

# Search
curl "http://localhost:3000/cars?name=tesla"

# Delete by id
curl -X DELETE http://localhost:3000/cars -H "Content-Type: application/json" -d '[1, 2]'

# Upload a photo for car #1 (stored in S3, URL saved on the car)
curl -X POST http://localhost:3000/cars/1/photo -F "photo=@/path/to/image.jpg"

# Or pass an image URL and let the server fetch + store it in S3
curl -X POST http://localhost:3000/cars/1/photo-url -H "Content-Type: application/json" \
  -d '{"url":"https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=400"}'
```
Both endpoints enforce a 512 KB max and replace any existing photo.

# Delete a car's photo (removes the S3 object and clears photoUrl)
curl -X DELETE http://localhost:3000/cars/1/photo
```

The photo endpoint uploads the file to the S3 bucket set by `S3_BUCKET` and stores the
public URL in `car.photoUrl`. Requires AWS credentials available to the app
(`aws configure` / `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` for local dev, or an IAM role in containers).

> **Public-read access:** objects rely on a bucket policy that allows `s3:GetObject`
> for everyone (see `aws/main.tf`). The code does **not** set an object ACL, because
> buckets with the AWS default "Bucket owner enforced" object ownership reject ACLs and
> would fail the upload. Provision your bucket with `aws/main.tf` (or apply an equivalent
> public-read bucket policy) so the returned URLs actually resolve.

> **SSRF protection:** the `photo-url` endpoint only fetches URLs that resolve to a
> public IP and are `http(s)`; internal/metadata addresses (`127.0.0.1`, `169.254.169.254`,
> `192.168.x`, etc.) are rejected.

> **Schema & migrations:** in production (`NODE_ENV=production`, set by the Docker/Terraform
> configs) the schema is managed by TypeORM migrations (`src/migration`) and `synchronize`
> is disabled so it can never auto-mutate the DB. Local `npm run dev` keeps `synchronize: true`
> for convenience.

## Terraform on AWS (S3)

`aws/main.tf` provisions an S3 bucket (public-read objects) for car photos — a free-tier-friendly
way to test Terraform's AWS provider. Requires AWS credentials configured locally.

```bash
cd aws
terraform init
terraform apply
```
