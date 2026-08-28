import "reflect-metadata";
import "dotenv/config";
import { Storage } from "@google-cloud/storage";

let client: Storage | null = null;

export function getStorageClient(): Storage {
  if (!client) {
    client = new Storage();
  }
  return client;
}

export function getPublicUrl(bucket: string, file: string): string {
  return `https://storage.googleapis.com/${bucket}/${file}`;
}
