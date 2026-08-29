import "reflect-metadata";
import "dotenv/config";
import { S3Client } from "@aws-sdk/client-s3";

let client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!client) {
    client = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
  }
  return client;
}

export function getPublicUrl(bucket: string, key: string): string {
  return `https://${bucket}.s3.amazonaws.com/${key}`;
}
