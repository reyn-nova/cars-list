import type { Request, Response, NextFunction } from "express";
import { HttpError } from "./errors";

// Shared-secret API key auth. The key is read from API_KEY (env). Clients send
// it as `Authorization: Bearer <key>` or via the `X-API-Key` header. Read-only
// routes (GET /cars, /health) are intentionally left open.
export function requireApiKey(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  const expected = process.env.API_KEY;
  if (!expected) {
    return next(new HttpError(503, "Server misconfigured: API_KEY is not set"));
  }

  const header = req.header("authorization") || req.header("x-api-key") || "";
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : header.trim();

  if (!key || key !== expected) {
    return next(new HttpError(401, "Invalid or missing API key"));
  }
  next();
}
