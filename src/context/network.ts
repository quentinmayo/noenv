import os from "node:os";
import type { NetworkRule } from "../types.js";

export function localIPv4(): string | undefined {
  const ifaces = os.networkInterfaces();
  for (const list of Object.values(ifaces)) {
    for (const ni of list ?? []) {
      if (ni.family === "IPv4" && !ni.internal) return ni.address;
    }
  }
  return undefined;
}

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const x = Number(p);
    if (!Number.isInteger(x) || x < 0 || x > 255) return null;
    n = (n << 8) | x;
  }
  return n >>> 0;
}

/** IPv4 CIDR membership test, e.g. cidrContains("192.168.1.0/24", "192.168.1.25"). */
export function cidrContains(cidr: string, ip: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  if (!range) return false;
  const bits = Number.parseInt(bitsStr ?? "32", 10);
  const a = ipToInt(range);
  const b = ipToInt(ip);
  if (a === null || b === null) return false;
  if (bits <= 0) return true;
  const mask = bits >= 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

/** First enabled network rule whose CIDR contains `ip`. */
export function matchNetwork(rules: NetworkRule[], ip: string | undefined): NetworkRule | undefined {
  if (!ip) return undefined;
  return rules.find((r) => r.enabled && r.cidr && cidrContains(r.cidr, ip));
}
