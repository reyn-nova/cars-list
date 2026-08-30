#!/bin/bash
set -eo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="/tmp/${PGDATABASE}_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup of ${PGDATABASE}..."

pg_dump -U "${PGUSER}" -h "${PGHOST}" -p "${PGPORT}" "${PGDATABASE}" | gzip > "${DUMP_FILE}"

if [ -n "${S3_ENDPOINT}" ]; then
  aws s3 cp "${DUMP_FILE}" "s3://${S3_BUCKET}/backups/${PGDATABASE}_${TIMESTAMP}.sql.gz" \
    --endpoint-url "${S3_ENDPOINT}" --region "${AWS_REGION}"
else
  aws s3 cp "${DUMP_FILE}" "s3://${S3_BUCKET}/backups/${PGDATABASE}_${TIMESTAMP}.sql.gz" \
    --region "${AWS_REGION}"
fi

rm -f "${DUMP_FILE}"
echo "[$(date)] Backup completed: backups/${PGDATABASE}_${TIMESTAMP}.sql.gz"

if [ "${BACKUP_RETENTION_DAYS}" -gt 0 ] 2>/dev/null; then
  CUTOFF=$(date -d "-${BACKUP_RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || date -v-"${BACKUP_RETENTION_DAYS}"d +%Y%m%d)
  echo "[$(date)] Cleaning backups older than ${BACKUP_RETENTION_DAYS} days (before ${CUTOFF})..."

  if [ -n "${S3_ENDPOINT}" ]; then
    BACKUPS=$(aws s3 ls "s3://${S3_BUCKET}/backups/" --endpoint-url "${S3_ENDPOINT}" --region "${AWS_REGION}" | awk '{print $NF}')
  else
    BACKUPS=$(aws s3 ls "s3://${S3_BUCKET}/backups/" --region "${AWS_REGION}" | awk '{print $NF}')
  fi

  for f in ${BACKUPS}; do
    FILE_DATE=$(echo "$f" | grep -oE '[0-9]{8}' | head -1)
    if [ -n "${FILE_DATE}" ] && [ "${FILE_DATE}" -lt "${CUTOFF}" ]; then
      echo "  Deleting old backup: $f"
      if [ -n "${S3_ENDPOINT}" ]; then
        aws s3 rm "s3://${S3_BUCKET}/backups/${f}" --endpoint-url "${S3_ENDPOINT}" --region "${AWS_REGION}" || true
      else
        aws s3 rm "s3://${S3_BUCKET}/backups/${f}" --region "${AWS_REGION}" || true
      fi
    fi
  done
fi
