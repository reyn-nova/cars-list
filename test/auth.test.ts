import { describe, it, expect, vi, afterEach } from "vitest";
import { requireApiKey } from "../src/auth";
import { HttpError } from "../src/errors";

function makeRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
}

describe("requireApiKey", () => {
  const original = process.env.API_KEY;

  afterEach(() => {
    process.env.API_KEY = original;
  });

  it("rejects when API_KEY is not configured", () => {
    delete process.env.API_KEY;
    const next = vi.fn();
    requireApiKey({ header: () => "" } as any, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(HttpError));
    expect((next.mock.calls[0][0] as HttpError).status).toBe(503);
  });

  it("rejects a missing key", () => {
    process.env.API_KEY = "secret";
    const next = vi.fn();
    requireApiKey({ header: () => "" } as any, makeRes(), next);
    expect((next.mock.calls[0][0] as HttpError).status).toBe(401);
  });

  it("accepts a Bearer key", () => {
    process.env.API_KEY = "secret";
    const next = vi.fn();
    requireApiKey(
      { header: (h: string) => (h === "authorization" ? "Bearer secret" : "") } as any,
      makeRes(),
      next
    );
    expect(next).toHaveBeenCalledWith();
  });

  it("accepts an X-API-Key header", () => {
    process.env.API_KEY = "secret";
    const next = vi.fn();
    requireApiKey(
      { header: (h: string) => (h === "x-api-key" ? "secret" : "") } as any,
      makeRes(),
      next
    );
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects a wrong key", () => {
    process.env.API_KEY = "secret";
    const next = vi.fn();
    requireApiKey(
      { header: () => "Bearer wrong" } as any,
      makeRes(),
      next
    );
    expect((next.mock.calls[0][0] as HttpError).status).toBe(401);
  });
});
