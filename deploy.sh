#!/usr/bin/env bash
set -euo pipefail

# Re-exec ourselves after pulling so we always run the latest script content.
# (If we `git pull` in place, bash loses its read position in this file and the
# run gets truncated — that's why the apply step could be skipped.)
if [[ -z "${DEPLOY_PULLED:-}" ]]; then
  export DEPLOY_PULLED=1
  git pull --ff-only
  exec "$0" "$@"
fi

terraform init -input=false

TFVARS="terraform.tfvars"

# Read any existing api_key so we can offer to keep it.
EXISTING=""
if [[ -f "$TFVARS" ]]; then
  EXISTING=$(grep -E '^[[:space:]]*api_key[[:space:]]*=' "$TFVARS" \
    | head -1 | sed -E 's/.*=[[:space:]]*"([^"]*)".*/\1/')
fi

if [[ -n "$EXISTING" ]]; then
  echo "==========================================================="
  echo "API key management"
  echo "Current API key: ${EXISTING:0:8}... (${#EXISTING} chars)"
  if [[ -t 0 ]]; then
    read -r -p "Rotate API key? (y/N) " ROTATE
  else
    echo "Non-interactive run detected: keeping the existing API key."
    echo "(Run ./deploy.sh from an interactive shell to be prompted to rotate.)"
    ROTATE=""
  fi
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
