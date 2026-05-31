/**
 * @file subnet.test.js
 * Unit tests for core subnetting logic — Vitest
 */
import { describe, it, expect } from "vitest";

// ─── Helpers (mirrored from app) ─────────────────────────────────────────────
function cidrToMask(prefix) {
  return Array.from({ length: 4 }, (_, i) => {
    const bits = Math.min(8, Math.max(0, prefix - i * 8));
    return 256 - Math.pow(2, 8 - bits);
  }).join(".");
}

function calcSubnet(ip, prefix) {
  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((o) => isNaN(o) || o < 0 || o > 255))
    return null;
  const maskOctets = cidrToMask(prefix).split(".").map(Number);
  const network = octets.map((o, i) => o & maskOctets[i]);
  const broadcast = network.map((o, i) => o | (255 - maskOctets[i]));
  return {
    network: network.join("."),
    broadcast: broadcast.join("."),
    hosts: Math.max(0, Math.pow(2, 32 - prefix) - 2),
    subnetMask: cidrToMask(prefix),
    networkBits: prefix,
    hostBits: 32 - prefix,
  };
}

function ipToInt(ip) {
  return ip.split(".").reduce((acc, o) => (acc << 8) + parseInt(o), 0) >>> 0;
}

const getVlsmPrefix = (hosts) => {
  let p = 32;
  while (Math.pow(2, 32 - p) < hosts + 2) p--;
  return p;
};

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("cidrToMask()", () => {
  it("/24 → 255.255.255.0",   () => expect(cidrToMask(24)).toBe("255.255.255.0"));
  it("/16 → 255.255.0.0",     () => expect(cidrToMask(16)).toBe("255.255.0.0"));
  it("/8  → 255.0.0.0",       () => expect(cidrToMask(8)).toBe("255.0.0.0"));
  it("/32 → 255.255.255.255", () => expect(cidrToMask(32)).toBe("255.255.255.255"));
  it("/0  → 0.0.0.0",         () => expect(cidrToMask(0)).toBe("0.0.0.0"));
  it("/20 → 255.255.240.0",   () => expect(cidrToMask(20)).toBe("255.255.240.0"));
});

describe("calcSubnet()", () => {
  it("returns null for out-of-range octet",  () => expect(calcSubnet("999.0.0.1", 24)).toBeNull());
  it("returns null for letters in IP",       () => expect(calcSubnet("abc.def.ghi.jkl", 24)).toBeNull());
  it("returns null for incomplete IP",       () => expect(calcSubnet("192.168.1", 24)).toBeNull());

  it("network address — 192.168.1.50/24",   () => expect(calcSubnet("192.168.1.50", 24).network).toBe("192.168.1.0"));
  it("broadcast — 192.168.1.0/24",          () => expect(calcSubnet("192.168.1.0", 24).broadcast).toBe("192.168.1.255"));
  it("254 usable hosts for /24",            () => expect(calcSubnet("192.168.1.0", 24).hosts).toBe(254));
  it("65534 usable hosts for /16",          () => expect(calcSubnet("10.0.0.0", 16).hosts).toBe(65534));
  it("0 usable hosts for /32",              () => expect(calcSubnet("10.0.0.1", 32).hosts).toBe(0));
  it("subnet mask for /20",                 () => expect(calcSubnet("172.16.0.0", 20).subnetMask).toBe("255.255.240.0"));
  it("network bits = 8, host bits = 24 for /8", () => {
    const r = calcSubnet("10.0.0.0", 8);
    expect(r.networkBits).toBe(8);
    expect(r.hostBits).toBe(24);
  });
  it("network for 10.10.50.200/20 → 10.10.48.0", () => {
    expect(calcSubnet("10.10.50.200", 20).network).toBe("10.10.48.0");
  });
});

describe("ipToInt()", () => {
  it("192.168.1.1 → 3232235777",  () => expect(ipToInt("192.168.1.1")).toBe(3232235777));
  it("0.0.0.0 → 0",               () => expect(ipToInt("0.0.0.0")).toBe(0));
  it("255.255.255.255 → 4294967295", () => expect(ipToInt("255.255.255.255")).toBe(4294967295));
  it("10.0.0.1 → 167772161",      () => expect(ipToInt("10.0.0.1")).toBe(167772161));
});

describe("VLSM prefix sizing", () => {
  it("2 hosts   → /30", () => expect(getVlsmPrefix(2)).toBe(30));
  it("6 hosts   → /29", () => expect(getVlsmPrefix(6)).toBe(29));
  it("14 hosts  → /28", () => expect(getVlsmPrefix(14)).toBe(28));
  it("100 hosts → /25", () => expect(getVlsmPrefix(100)).toBe(25));
  it("500 hosts → /23", () => expect(getVlsmPrefix(500)).toBe(23));
  it("1000 hosts → /22",() => expect(getVlsmPrefix(1000)).toBe(22));
});
