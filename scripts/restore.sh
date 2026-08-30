#!/bin/bash
set -eo pipefail

BUCKET="${S3_BUCKET:?S3_BUCKET is required}"
KEY="${1:?Usage: restore.sh <backup-key>}"
DEST_DB="${PGDATABASE:-cars}"

TMPFILE=$(mktemp /tmp/restore_XXXXXX.sql.gz)
trap 'rm -f "${TMPFILE}"' EXIT

echo "Restoring from s3://${BUCKET}/${KEY} to database ${DEST_DB}..."

if [ -n "${S3_ENDPOINT}" ]; then
  aws s3 cp "s3://${BUCKET}/${KEY}" "${TMPFILE}" --endpoint-url "${S3_ENDPOINT}" --region "${AWS_REGION:-ap-southeast-3}"
else
  aws s3 cp "s3://${BUCKET}/${KEY}" "${TMPFILE}" --region "${AWS_REGION:-ap-southeast-3}"
fi

if [ ! -s "${TMPFILE}" ]; then
  echo "Error: downloaded backup file is empty or missing."
  exit 1
fi

gunzip -c "${TMPFILE}" | psql -U "${PGUSER:-postgres}" -h "${PGHOST:-localhost}" -p "${PGPORT:-5432}" "${DEST_DB}"

echo "Restore complete."
