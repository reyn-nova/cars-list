import dns from "node:dns";
import { Agent, fetch as undiciFetch } from "undici";
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

// Quick pre-check: reject non-http(s) and hostnames that resolve to ANY
// private address. Gives a clean 400 without opening a connection.
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
  const addresses = await dns.promises.lookup(url.hostname, { all: true });
  if (addresses.some((a) => isPrivateIp(a.address))) {
    throw new HttpError(400, "URL resolves to a disallowed (private) address");
  }
}

// Custom DNS lookup used by the actual TCP connection. Re-resolves and rejects
// private addresses at connect time, which closes the DNS-rebinding TOCTOU gap
// (the address used for the real socket is the one we validate, not an earlier
// resolution) and applies to every redirect hop followed by fetch.
function secureLookup(
  hostname: string,
  options: { all?: boolean },
  callback: (err: NodeJS.ErrnoException | null, address?: unknown, family?: number) => void
): void {
  dns.lookup(hostname, { all: true }, (err, addresses) => {
    if (err) {
      callback(err);
      return;
    }
    if (addresses.some((a) => isPrivateIp(a.address))) {
      callback(new Error("Resolved to a disallowed (private) address"));
      return;
    }
    if (options?.all) {
      callback(null, addresses as unknown as string, 0);
      return;
    }
    const chosen = addresses[0];
    callback(null, chosen.address, chosen.family);
  });
}

const secureAgent = new Agent({
  connect: {
    lookup: secureLookup as never,
    timeout: 10_000,
  },
});

// Hardened fetch for the photo-url endpoint: only http(s), and the socket is
// only ever opened to a validated public IP (re-checked per redirect).
export async function safeFetch(
  url: string,
  init: { signal?: AbortSignal; redirect?: "follow" | "manual" | "error" } = {}
) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new HttpError(400, "Invalid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new HttpError(400, "Only http(s) URLs are allowed");
  }
  return undiciFetch(url, {
    signal: init.signal,
    redirect: init.redirect ?? "follow",
    dispatcher: secureAgent,
  });
}
