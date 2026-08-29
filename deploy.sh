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

# Read a terraform var: prefer the TF_VAR_<name> env var, else an existing
# value in terraform.tfvars. (Terraform does NOT read .env — only tfvars,
# -var, or TF_VAR_* env vars.)
get_var() {
  local name="$1" envname="TF_VAR_$1" val=""
  if [[ -n "${!envname:-}" ]]; then
    val="${!envname}"
  elif [[ -f "$TFVARS" ]]; then
    val=$(grep -E "^[[:space:]]*$name[[:space:]]*=" "$TFVARS" 2>/dev/null \
      | head -1 | sed -E 's/.*=[[:space:]]*"([^"]*)".*/\1/' || true)
  fi
  echo "$val"
}

# --- API key (with rotate prompt) ---
EXISTING=$(get_var api_key)
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

# --- S3 / AWS vars (forwarded through to the container) ---
S3_BUCKET=$(get_var s3_bucket)
AWS_ACCESS_KEY=$(get_var aws_access_key)
AWS_SECRET_KEY=$(get_var aws_secret_key)
AWS_REGION=$(get_var aws_region)

# Persist all known vars to terraform.tfvars (gitignored) so redeploys keep them.
{
  echo "api_key = \"$API_KEY\""
  [[ -n "$S3_BUCKET" ]] && echo "s3_bucket = \"$S3_BUCKET\""
  [[ -n "$AWS_ACCESS_KEY" ]] && echo "aws_access_key = \"$AWS_ACCESS_KEY\""
  [[ -n "$AWS_SECRET_KEY" ]] && echo "aws_secret_key = \"$AWS_SECRET_KEY\""
  [[ -n "$AWS_REGION" ]] && echo "aws_region = \"$AWS_REGION\""
} > "$TFVARS"

# Build the -var arguments.
APPLY_VARS="-var=\"api_key=$API_KEY\""
[[ -n "$S3_BUCKET" ]] && APPLY_VARS="$APPLY_VARS -var=\"s3_bucket=$S3_BUCKET\""
[[ -n "$AWS_ACCESS_KEY" ]] && APPLY_VARS="$APPLY_VARS -var=\"aws_access_key=$AWS_ACCESS_KEY\""
[[ -n "$AWS_SECRET_KEY" ]] && APPLY_VARS="$APPLY_VARS -var=\"aws_secret_key=$AWS_SECRET_KEY\""
[[ -n "$AWS_REGION" ]] && APPLY_VARS="$APPLY_VARS -var=\"aws_region=$AWS_REGION\""

eval "terraform apply -replace=docker_image.app -auto-approve $APPLY_VARS"

echo "==========================================================="
echo "API_KEY for this deployment:"
echo "  ${API_KEY}"
echo ""
echo "Send it as:  Authorization: Bearer ${API_KEY}"
echo "==========================================================="
