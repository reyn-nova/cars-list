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
  const region = process.env.AWS_REGION || "us-east-1";
  if (region === "us-east-1") {
    return `https://${bucket}.s3.amazonaws.com/${key}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

// Public-read access to uploaded objects relies on a bucket policy that
// allows s3:GetObject for "*" (see aws/main.tf). We deliberately do NOT set
// an object-level ACL, because buckets created with "Bucket owner enforced"
// object ownership (the AWS default) reject ACLs and would fail the upload.
export function s3KeyFromUrl(photoUrl: string): string {
  try {
    return new URL(photoUrl).pathname.replace(/^\/+/, "");
  } catch {
    return "";
  }
}
