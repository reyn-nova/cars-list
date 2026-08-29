import { describe, it, expect } from "vitest";
import { isPrivateIp } from "../src/ssrf";

describe("isPrivateIp", () => {
  it("flags private/loopback/link-local ranges", () => {
    expect(isPrivateIp("10.0.0.5")).toBe(true);
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
  });

  it("allows public ranges", () => {
    expect(isPrivateIp("93.184.216.34")).toBe(false);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
  });
});
