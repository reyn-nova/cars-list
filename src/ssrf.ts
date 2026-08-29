import dns from "node:dns";
import { HttpError } from "./errors";

export function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip === "::" || ip === "0.0.0.0") return true;
  // IPv4-mapped IPv6
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  // Unique/local IPv6 ranges
  if (
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("fe8") ||
    ip.startsWith("fe9") ||
    ip.startsWith("fea") ||
    ip.startsWith("feb")
  ) {
    return true;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  return false;
}

// Guards against SSRF: the server must not be tricked into fetching internal
// services (e.g. 169.254.169.254, localhost) on behalf of a caller.
export async function assertPublicUrl(raw: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, "Only http(s) URLs are allowed");
  }
  const { address } = await dns.promises.lookup(url.hostname);
  if (isPrivateIp(address)) {
    throw new HttpError(400, "URL resolves to a disallowed (private) address");
  }
}
