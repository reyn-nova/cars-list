import { describe, it, expect } from "vitest";
import { s3KeyFromUrl } from "../src/s3";

describe("s3KeyFromUrl", () => {
  it("extracts the key from a standard S3 URL", () => {
    expect(s3KeyFromUrl("https://bucket.s3.amazonaws.com/cars/1-123.jpg")).toBe(
      "cars/1-123.jpg"
    );
  });

  it("strips leading slashes", () => {
    expect(s3KeyFromUrl("https://bucket.s3.us-east-1.amazonaws.com//cars/x")).toBe(
      "cars/x"
    );
  });

  it("returns empty string for invalid url", () => {
    expect(s3KeyFromUrl("not-a-url")).toBe("");
  });
});
