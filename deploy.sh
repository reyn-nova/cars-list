#!/usr/bin/env bash
set -euo pipefail

git pull --ff-only
terraform init -input=false

TFVARS="terraform.tfvars"

# Read any existing api_key so we can offer to keep it.
EXISTING=""
if [[ -f "$TFVARS" ]]; then
  EXISTING=$(grep -E '^[[:space:]]*api_key[[:space:]]*=' "$TFVARS" \
    | head -1 | sed -E 's/.*=[[:space:]]*"([^"]*)".*/\1/')
fi

if [[ -n "$EXISTING" ]]; then
  echo "Current API key: ${EXISTING:0:8}... (${#EXISTING} chars)"
  read -r -p "Rotate API key? (y/N) " ROTATE
  if [[ "$ROTATE" =~ ^[Yy]$ ]]; then
    API_KEY=$(openssl rand -hex 32)
    echo "Generated a NEW API key."
  else
    API_KEY="$EXISTING"
    echo "Keeping the existing API key."
  fi
else
  API_KEY=$(openssl rand -hex 32)
  echo "No existing API key found; generated a new one."
fi

# Persist the chosen key to terraform.tfvars (gitignored) so future runs can keep it.
TMP=$(mktemp)
if [[ -f "$TFVARS" ]]; then
  grep -vE '^[[:space:]]*api_key[[:space:]]*=' "$TFVARS" > "$TMP"
fi
echo "api_key = \"$API_KEY\"" >> "$TMP"
mv "$TMP" "$TFVARS"

terraform apply -replace=docker_image.app -auto-approve -var="api_key=${API_KEY}"

echo "==========================================================="
echo "API_KEY for this deployment:"
echo "  ${API_KEY}"
echo ""
echo "Send it as:  Authorization: Bearer ${API_KEY}"
echo "==========================================================="
