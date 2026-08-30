import "reflect-metadata";
import { S3Client } from "@aws-sdk/client-s3";

let client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!client) {
    const opts: Record<string, unknown> = {
      region: process.env.AWS_REGION || "ap-southeast-3",
    };
    if (process.env.S3_ENDPOINT) {
      opts.endpoint = process.env.S3_ENDPOINT;
      opts.forcePathStyle = true;
    }
    client = new S3Client(opts);
  }
  return client;
}

export function getPublicUrl(bucket: string, key: string): string {
  if (process.env.S3_PUBLIC_ENDPOINT) {
    return `${process.env.S3_PUBLIC_ENDPOINT}/${bucket}/${key}`;
  }
  if (process.env.S3_ENDPOINT) {
    return `${process.env.S3_ENDPOINT}/${bucket}/${key}`;
  }
  const region = process.env.AWS_REGION || "ap-southeast-3";
  if (region === "us-east-1") {
    return `https://${bucket}.s3.amazonaws.com/${key}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

export function s3KeyFromUrl(photoUrl: string): string {
  try {
    return new URL(photoUrl).pathname.replace(/^\/+/, "");
  } catch {
    return "";
  }
}
