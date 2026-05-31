import { useState, useCallback } from "react";

// ─── Core Subnet Logic ────────────────────────────────────────────────────────
function cidrToMask(prefix) {
  const mask = [];
  for (let i = 0; i < 4; i++) {
    const bits = Math.min(8, Math.max(0, prefix - i * 8));
    mask.push(256 - Math.pow(2, 8 - bits));
  }
  return mask.join(".");
}

function calcSubnet(ip, prefix) {
  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((o) => isNaN(o) || o < 0 || o > 255))
    return null;
  const maskOctets = cidrToMask(prefix)
    .split(".")
    .map(Number);
  const networkOctets = octets.map((o, i) => o & maskOctets[i]);
  const broadcastOctets = networkOctets.map(
    (o, i) => o | (255 - maskOctets[i])
  );
  const firstHost = [...networkOctets];
  firstHost[3] += 1;
  const lastHost = [...broadcastOctets];
  lastHost[3] -= 1;
  const hosts = Math.pow(2, 32 - prefix) - 2;
  const networks = Math.pow(2, prefix);

  let ipClass = "A";
  const first = octets[0];
  if (first >= 128 && first <= 191) ipClass = "B";
  else if (first >= 192 && first <= 223) ipClass = "C";
  else if (first >= 224 && first <= 239) ipClass = "D (Multicast)";
  else if (first >= 240) ipClass = "E (Reserved)";

  return {
    network: networkOctets.join("."),
    broadcast: broadcastOctets.join("."),
    firstHost: firstHost.join("."),
    lastHost: lastHost.join("."),
    subnetMask: cidrToMask(prefix),
    hosts: Math.max(0, hosts),
    networks,
    networkBits: prefix,
    hostBits: 32 - prefix,
    ipClass,
    wildcardMask: maskOctets.map((o) => 255 - o).join("."),
  };
}

// ─── VLSM Logic ───────────────────────────────────────────────────────────────
function vlsmCalc(baseIp, basePrefix, subnets) {
  const sorted = [...subnets].sort((a, b) => b.hosts - a.hosts);
  const results = [];
  let currentIpInt = ipToInt(baseIp);

  for (const sub of sorted) {
    const needed = sub.hosts + 2;
    let prefix = 32;
    while (Math.pow(2, 32 - prefix) < needed && prefix > 0) prefix--;
    const blockSize = Math.pow(2, 32 - prefix);
    const network = intToIp(currentIpInt);
    const broadcast = intToIp(currentIpInt + blockSize - 1);
    const firstHost = intToIp(currentIpInt + 1);
    const lastHost = intToIp(currentIpInt + blockSize - 2);
    results.push({
      name: sub.name,
      network,
      prefix,
      broadcast,
      firstHost,
      lastHost,
      mask: cidrToMask(prefix),
      usableHosts: blockSize - 2,
    });
    currentIpInt += blockSize;
  }
  return results;
}

function ipToInt(ip) {
  return ip
    .split(".")
    .reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}
function intToIp(int) {
  return [
    (int >>> 24) & 255,
    (int >>> 16) & 255,
    (int >>> 8) & 255,
    int & 255,
  ].join(".");
}

// ─── UI Components ────────────────────────────────────────────────────────────
const TABS = [
  { id: "subnet", label: "Subnetting", icon: "◈" },
  { id: "vlsm", label: "VLSM", icon: "⬡" },
  { id: "ipclass", label: "IP Class", icon: "⬟" },
  { id: "base", label: "Base Converter", icon: "⟁" },
];

function Badge({ children, color = "#00e5ff" }) {
  return (
    <span
      style={{
        background: color + "18",
        border: `1px solid ${color}44`,
        color,
        borderRadius: 6,
        padding: "2px 10px",
        fontSize: 12,
        fontFamily: "'Fira Mono', monospace",
        letterSpacing: 1,
      }}
    >
      {children}
    </span>
  );
}

function ResultRow({ label, value, mono = true }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 0",
        borderBottom: "1px solid #ffffff0a",
      }}
    >
      <span style={{ color: "#6b7897", fontSize: 13, letterSpacing: 0.5 }}>
        {label}
      </span>
      <span
        style={{
          color: "#e2e8f0",
          fontFamily: mono ? "'Fira Mono', monospace" : "inherit",
          fontSize: 13,
          background: "#ffffff08",
          padding: "3px 10px",
          borderRadius: 6,
          border: "1px solid #ffffff10",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function IPInput({ value, onChange, placeholder = "e.g. 192.168.1.0" }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        background: "#0d1117",
        border: "1px solid #30363d",
        borderRadius: 8,
        padding: "11px 16px",
        color: "#e2e8f0",
        fontFamily: "'Fira Mono', monospace",
        fontSize: 14,
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
        transition: "border-color 0.2s",
      }}
      onFocus={(e) => (e.target.style.borderColor = "#00e5ff55")}
      onBlur={(e) => (e.target.style.borderColor = "#30363d")}
    />
  );
}

// ─── Subnetting Tab ───────────────────────────────────────────────────────────
function SubnettingTab() {
  const [ip, setIp] = useState("192.168.1.0");
  const [prefix, setPrefix] = useState(24);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const calculate = () => {
    const r = calcSubnet(ip, prefix);
    if (!r) {
      setError("Invalid IP address.");
      setResult(null);
    } else {
      setError("");
      setResult(r);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Label>IP Address / Prefix</Label>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <IPInput value={ip} onChange={setIp} />
          </div>
          <span style={{ color: "#6b7897", fontFamily: "Fira Mono", fontSize: 18 }}>/</span>
          <input
            type="number"
            min={0}
            max={32}
            value={prefix}
            onChange={(e) => setPrefix(Number(e.target.value))}
            style={{
              width: 64,
              background: "#0d1117",
              border: "1px solid #30363d",
              borderRadius: 8,
              padding: "11px 10px",
              color: "#00e5ff",
              fontFamily: "'Fira Mono', monospace",
              fontSize: 15,
              textAlign: "center",
              outline: "none",
            }}
          />
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <Label>Prefix Length: <span style={{ color: "#00e5ff" }}>{prefix}</span></Label>
        <div style={{ position: "relative", padding: "8px 0" }}>
          <input
            type="range"
            min={0}
            max={32}
            value={prefix}
            onChange={(e) => setPrefix(Number(e.target.value))}
            style={{ width: "100%", accentColor: "#00e5ff", cursor: "pointer" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            {[0, 8, 16, 24, 32].map((n) => (
              <span key={n} style={{ color: "#6b7897", fontSize: 11, fontFamily: "Fira Mono" }}>{n}</span>
            ))}
          </div>
        </div>
      </div>

      <CalcButton onClick={calculate} />

      {error && <ErrorMsg>{error}</ErrorMsg>}

      {result && (
        <div style={{ marginTop: 20, animation: "fadeIn 0.3s ease" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <StatCard label="Network Bits" value={result.networkBits} color="#00e5ff" />
            <StatCard label="Host Bits" value={result.hostBits} color="#f59e0b" />
            <StatCard label="Usable Hosts" value={result.hosts.toLocaleString()} color="#10b981" />
            <StatCard label="IP Class" value={result.ipClass} color="#a78bfa" />
          </div>

          <SectionCard title="Network Details">
            <ResultRow label="Network Address" value={result.network} />
            <ResultRow label="Subnet Mask" value={result.subnetMask} />
            <ResultRow label="Wildcard Mask" value={result.wildcardMask} />
            <ResultRow label="Broadcast" value={result.broadcast} />
            <ResultRow label="First Host" value={result.firstHost} />
            <ResultRow label="Last Host" value={result.lastHost} />
            <ResultRow label="CIDR Notation" value={`${result.network}/${result.networkBits}`} />
          </SectionCard>
        </div>
      )}
    </div>
  );
}

// ─── VLSM Tab ─────────────────────────────────────────────────────────────────
function VLSMTab() {
  const [baseIp, setBaseIp] = useState("10.0.0.0");
  const [basePrefix, setBasePrefix] = useState(16);
  const [subnets, setSubnets] = useState([
    { name: "LAN A", hosts: 50 },
    { name: "LAN B", hosts: 25 },
    { name: "LAN C", hosts: 10 },
  ]);
  const [results, setResults] = useState([]);

  const addSubnet = () =>
    setSubnets([...subnets, { name: `LAN ${String.fromCharCode(65 + subnets.length)}`, hosts: 10 }]);
  const removeSubnet = (i) => setSubnets(subnets.filter((_, idx) => idx !== i));
  const updateSubnet = (i, field, val) => {
    const s = [...subnets];
    s[i] = { ...s[i], [field]: field === "hosts" ? parseInt(val) || 0 : val };
    setSubnets(s);
  };

  const calculate = () => setResults(vlsmCalc(baseIp, basePrefix, subnets));

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <Label>Base Network</Label>
          <IPInput value={baseIp} onChange={setBaseIp} />
        </div>
        <div style={{ width: 72 }}>
          <Label>Prefix</Label>
          <input
            type="number"
            min={1}
            max={30}
            value={basePrefix}
            onChange={(e) => setBasePrefix(Number(e.target.value))}
            style={{
              width: "100%",
              background: "#0d1117",
              border: "1px solid #30363d",
              borderRadius: 8,
              padding: "11px 8px",
              color: "#00e5ff",
              fontFamily: "Fira Mono",
              fontSize: 15,
              textAlign: "center",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      <Label>Subnets Required</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
        {subnets.map((s, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={s.name}
              onChange={(e) => updateSubnet(i, "name", e.target.value)}
              style={{
                flex: 1,
                background: "#0d1117",
                border: "1px solid #30363d",
                borderRadius: 8,
                padding: "9px 12px",
                color: "#e2e8f0",
                fontSize: 13,
                outline: "none",
              }}
            />
            <input
              type="number"
              value={s.hosts}
              onChange={(e) => updateSubnet(i, "hosts", e.target.value)}
              placeholder="Hosts"
              style={{
                width: 80,
                background: "#0d1117",
                border: "1px solid #30363d",
                borderRadius: 8,
                padding: "9px 8px",
                color: "#f59e0b",
                fontFamily: "Fira Mono",
                fontSize: 13,
                textAlign: "center",
                outline: "none",
              }}
            />
            <button
              onClick={() => removeSubnet(i)}
              style={{
                background: "#ff444420",
                border: "1px solid #ff444440",
                color: "#ff4444",
                borderRadius: 8,
                padding: "9px 12px",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addSubnet}
        style={{
          background: "transparent",
          border: "1px dashed #30363d",
          color: "#6b7897",
          borderRadius: 8,
          padding: "9px 16px",
          cursor: "pointer",
          width: "100%",
          marginBottom: 16,
          fontSize: 13,
        }}
      >
        + Add Subnet
      </button>

      <CalcButton onClick={calculate} />

      {results.length > 0 && (
        <div style={{ marginTop: 20 }}>
          {results.map((r, i) => (
            <div
              key={i}
              style={{
                background: "#161b22",
                border: "1px solid #21262d",
                borderRadius: 10,
                padding: 14,
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: "#e2e8f0", fontWeight: 600 }}>{r.name}</span>
                <Badge color="#10b981">/{r.prefix}</Badge>
              </div>
              <ResultRow label="Network" value={`${r.network}/${r.prefix}`} />
              <ResultRow label="Subnet Mask" value={r.mask} />
              <ResultRow label="Usable Hosts" value={r.usableHosts} />
              <ResultRow label="Range" value={`${r.firstHost} – ${r.lastHost}`} />
              <ResultRow label="Broadcast" value={r.broadcast} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── IP Class Tab ─────────────────────────────────────────────────────────────
function IPClassTab() {
  const [ip, setIp] = useState("");
  const [info, setInfo] = useState(null);

  const detect = () => {
    const octets = ip.split(".").map(Number);
    if (octets.length !== 4 || octets.some((o) => isNaN(o) || o < 0 || o > 255)) {
      setInfo({ error: true });
      return;
    }
    const first = octets[0];
    let cls, range, defaultMask, desc;
    if (first >= 1 && first <= 126) {
      cls = "A"; range = "1.0.0.0 – 126.255.255.255"; defaultMask = "255.0.0.0"; desc = "Large networks — 16M hosts";
    } else if (first === 127) {
      cls = "Loopback"; range = "127.0.0.1"; defaultMask = "255.0.0.0"; desc = "Reserved for localhost";
    } else if (first >= 128 && first <= 191) {
      cls = "B"; range = "128.0.0.0 – 191.255.255.255"; defaultMask = "255.255.0.0"; desc = "Medium networks — 65K hosts";
    } else if (first >= 192 && first <= 223) {
      cls = "C"; range = "192.0.0.0 – 223.255.255.255"; defaultMask = "255.255.255.0"; desc = "Small networks — 254 hosts";
    } else if (first >= 224 && first <= 239) {
      cls = "D"; range = "224.0.0.0 – 239.255.255.255"; defaultMask = "N/A"; desc = "Multicast — not unicast";
    } else {
      cls = "E"; range = "240.0.0.0 – 255.255.255.255"; defaultMask = "N/A"; desc = "Experimental / Reserved";
    }

    const isPrivate =
      (first === 10) ||
      (first === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (first === 192 && octets[1] === 168);

    setInfo({ cls, range, defaultMask, desc, isPrivate, ip });
  };

  const classColors = { A: "#00e5ff", B: "#10b981", C: "#f59e0b", D: "#a78bfa", E: "#ef4444", Loopback: "#6b7897" };

  return (
    <div>
      <Label>IP Address</Label>
      <IPInput value={ip} onChange={setIp} />
      <div style={{ height: 12 }} />
      <CalcButton onClick={detect} label="DETECT" />

      {info && !info.error && (
        <div style={{ marginTop: 20, animation: "fadeIn 0.3s ease" }}>
          <div
            style={{
              textAlign: "center",
              padding: "24px 16px",
              background: `${classColors[info.cls]}10`,
              border: `1px solid ${classColors[info.cls]}30`,
              borderRadius: 12,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 11, color: "#6b7897", letterSpacing: 2, marginBottom: 8 }}>CLASS</div>
            <div style={{ fontSize: 64, fontFamily: "Fira Mono", color: classColors[info.cls], lineHeight: 1 }}>
              {info.cls}
            </div>
            <div style={{ color: "#6b7897", fontSize: 13, marginTop: 8 }}>{info.desc}</div>
            <div style={{ marginTop: 12 }}>
              <Badge color={info.isPrivate ? "#10b981" : "#f59e0b"}>
                {info.isPrivate ? "Private" : "Public"} Address
              </Badge>
            </div>
          </div>
          <SectionCard title="Details">
            <ResultRow label="IP Address" value={info.ip} />
            <ResultRow label="Address Range" value={info.range} />
            <ResultRow label="Default Mask" value={info.defaultMask} />
          </SectionCard>
        </div>
      )}
      {info?.error && <ErrorMsg>Invalid IP address format.</ErrorMsg>}
    </div>
  );
}

// ─── Base Converter Tab ───────────────────────────────────────────────────────
function BaseConverterTab() {
  const [input, setInput] = useState("192");
  const [fromBase, setFromBase] = useState("decimal");

  const convert = () => {
    let decimal;
    try {
      if (fromBase === "decimal") decimal = parseInt(input, 10);
      else if (fromBase === "binary") decimal = parseInt(input, 2);
      else if (fromBase === "hex") decimal = parseInt(input, 16);
      else if (fromBase === "octal") decimal = parseInt(input, 8);
      if (isNaN(decimal) || decimal < 0 || decimal > 4294967295) return null;
    } catch { return null; }

    return {
      decimal: decimal.toString(10),
      binary: decimal.toString(2).padStart(8, "0"),
      hex: decimal.toString(16).toUpperCase(),
      octal: decimal.toString(8),
    };
  };

  const result = convert();

  return (
    <div>
      <Label>Value</Label>
      <IPInput value={input} onChange={setInput} placeholder="Enter a number" />
      <div style={{ height: 12 }} />
      <Label>From Base</Label>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {["decimal", "binary", "hex", "octal"].map((b) => (
          <button
            key={b}
            onClick={() => setFromBase(b)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: `1px solid ${fromBase === b ? "#00e5ff" : "#30363d"}`,
              background: fromBase === b ? "#00e5ff18" : "transparent",
              color: fromBase === b ? "#00e5ff" : "#6b7897",
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "Fira Mono",
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            {b}
          </button>
        ))}
      </div>

      {result && (
        <SectionCard title="Conversions">
          <ResultRow label="Decimal (Base 10)" value={result.decimal} />
          <ResultRow label="Binary (Base 2)" value={result.binary} />
          <ResultRow label="Hexadecimal (Base 16)" value={result.hex} />
          <ResultRow label="Octal (Base 8)" value={result.octal} />
        </SectionCard>
      )}
      {!result && input && <ErrorMsg>Invalid value for selected base.</ErrorMsg>}
    </div>
  );
}

// ─── Shared UI ────────────────────────────────────────────────────────────────
function Label({ children }) {
  return (
    <div style={{ color: "#8b9dc3", fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, fontFamily: "Fira Mono" }}>
      {children}
    </div>
  );
}

function CalcButton({ onClick, label = "CALCULATE" }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        padding: "14px",
        background: "linear-gradient(135deg, #00e5ff, #0080ff)",
        border: "none",
        borderRadius: 10,
        color: "#000",
        fontFamily: "Fira Mono",
        fontWeight: 700,
        fontSize: 14,
        letterSpacing: 2,
        cursor: "pointer",
        transition: "opacity 0.2s, transform 0.1s",
        marginBottom: 4,
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {label}
    </button>
  );
}

function ErrorMsg({ children }) {
  return (
    <div style={{ color: "#ef4444", background: "#ef444412", border: "1px solid #ef444430", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginTop: 12 }}>
      {children}
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div style={{ background: "#161b22", border: "1px solid #21262d", borderRadius: 10, padding: "4px 16px 4px", marginBottom: 12 }}>
      <div style={{ color: "#6b7897", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", padding: "12px 0 8px", borderBottom: "1px solid #ffffff08" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: "#161b22", border: `1px solid ${color}25`, borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ color: "#6b7897", fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      <div style={{ color, fontFamily: "Fira Mono", fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState("subnet");

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0d1117",
        color: "#e2e8f0",
        fontFamily: "'Inter', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Mono:wght@400;500;700&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        input[type=range] { -webkit-appearance: none; height: 4px; background: #21262d; border-radius: 2px; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; background: #00e5ff; border-radius: 50%; cursor: pointer; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 2px; }
      `}</style>

      {/* Header */}
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          padding: "24px 20px 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div
            style={{
              width: 36,
              height: 36,
              background: "linear-gradient(135deg, #00e5ff, #0080ff)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
            }}
          >
            ◈
          </div>
          <div>
            <div style={{ fontFamily: "Fira Mono", fontWeight: 700, fontSize: 15, letterSpacing: 2, textTransform: "uppercase" }}>
              Subnetting Calc
            </div>
            <div style={{ color: "#6b7897", fontSize: 11, letterSpacing: 1 }}>Network Tools</div>
          </div>
        </div>

        {/* Tab Bar */}
        <div
          style={{
            display: "flex",
            background: "#161b22",
            border: "1px solid #21262d",
            borderRadius: 10,
            padding: 4,
            marginBottom: 24,
            gap: 2,
          }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                flex: 1,
                padding: "8px 4px",
                border: "none",
                borderRadius: 7,
                background: activeTab === t.id ? "#21262d" : "transparent",
                color: activeTab === t.id ? "#00e5ff" : "#6b7897",
                cursor: "pointer",
                fontSize: 11,
                fontFamily: "Fira Mono",
                transition: "all 0.2s",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 2,
              }}
            >
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span style={{ letterSpacing: 0.5, whiteSpace: "nowrap" }}>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div style={{ paddingBottom: 40 }}>
          {activeTab === "subnet" && <SubnettingTab />}
          {activeTab === "vlsm" && <VLSMTab />}
          {activeTab === "ipclass" && <IPClassTab />}
          {activeTab === "base" && <BaseConverterTab />}
        </div>
      </div>
    </div>
  );
}
