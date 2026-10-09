#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { z } from "zod";

const run = promisify(execFile);
const CONTAINER = "zap-mcp";
const IMAGE = process.env.ZAP_IMAGE ?? "zaproxy/zap-stable";

let apiKey = "";
let port = 8080;

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });

// Recover state if the MCP server restarted while the ZAP container kept running.
async function attach() {
  if (apiKey) return;
  const { stdout } = await run("docker", ["inspect", CONTAINER, "--format", "{{json .Args}}|{{json .HostConfig.PortBindings}}"]).catch(() => {
    throw new Error("ZAP is not running. Call zap_start first.");
  });
  const [args, ports] = stdout.trim().split("|");
  const key = (JSON.parse(args) as string[]).find((a) => a.startsWith("api.key="));
  if (!key) throw new Error("Could not recover ZAP API key. Call zap_start again.");
  apiKey = key.slice("api.key=".length);
  port = Number(Object.values(JSON.parse(ports) as Record<string, { HostPort: string }[]>)[0]?.[0]?.HostPort ?? 8080);
}

async function zap(path: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams({ ...params, apikey: apiKey });
  const res = await fetch(`http://127.0.0.1:${port}${path}?${qs}`);
  if (!res.ok) throw new Error(`ZAP ${path}: HTTP ${res.status}`);
  return res.json() as Promise<any>;
}

const server = new McpServer({ name: "zap-mcp", version: "0.1.0" });

server.tool(
  "zap_start",
  "Start ZAP in Docker as an intercepting proxy. Route the agent's browser through the returned proxy URL; ZAP passively scans everything it sees. Safe by default: no active scanning.",
  { port: z.number().int().default(8080).describe("Host port for the proxy and API") },
  async ({ port: p }) => {
    port = p;
    apiKey = randomBytes(16).toString("hex");
    await run("docker", ["rm", "-f", CONTAINER]).catch(() => {});
    await run("docker", [
      "run", "-d", "--name", CONTAINER, "-p", `127.0.0.1:${port}:8080`,
      IMAGE, "zap.sh", "-daemon", "-host", "0.0.0.0", "-port", "8080",
      "-config", `api.key=${apiKey}`,
      "-config", "api.addrs.addr.name=.*", "-config", "api.addrs.addr.regex=true",
    ]);
    for (let i = 0; i < 60; i++) {
      try { await zap("/JSON/core/view/version/"); break; }
      catch { await new Promise((r) => setTimeout(r, 2000)); if (i === 59) throw new Error("ZAP did not become ready in 2 minutes"); }
    }
    return text(
      `ZAP is running. Proxy: http://127.0.0.1:${port}\n` +
      `Browse the target through it, e.g. agent-browser --proxy http://127.0.0.1:${port} (ignore HTTPS cert errors).\n` +
      `Note: ZAP runs in Docker, so a target on your machine must be addressed as host.docker.internal, not localhost.\n` +
      `Then call zap_get_alerts.`
    );
  }
);

server.tool(
  "zap_get_alerts",
  "Get the alerts ZAP found so far from traffic that went through the proxy, grouped by risk.",
  {
    baseurl: z.string().optional().describe("Only alerts for URLs under this prefix"),
    min_risk: z.enum(["Informational", "Low", "Medium", "High"]).default("Low"),
  },
  async ({ baseurl, min_risk }) => {
    await attach();
    const order = ["Informational", "Low", "Medium", "High"];
    const data = await zap("/JSON/core/view/alerts/", baseurl ? { baseurl } : {});
    const alerts = (data.alerts as any[]).filter((a) => order.indexOf(a.risk) >= order.indexOf(min_risk));
    if (!alerts.length) return text("No alerts at or above that risk yet. Browse more pages through the proxy.");
    alerts.sort((a, b) => order.indexOf(b.risk) - order.indexOf(a.risk));
    const groups = new Map<string, any[]>();
    for (const a of alerts) groups.set(`${a.risk}/${a.confidence} ${a.alert}`, [...(groups.get(`${a.risk}/${a.confidence} ${a.alert}`) ?? []), a]);
    const out = [...groups].map(([k, g]) => {
      const urls = [...new Set(g.map((a) => a.url + (a.param ? ` (param: ${a.param})` : "")))];
      const ev = g.find((a) => a.evidence)?.evidence;
      return `[${k}] x${g.length}\n  urls: ${urls.slice(0, 5).join(", ")}${urls.length > 5 ? ` +${urls.length - 5} more` : ""}${ev ? `\n  evidence: ${String(ev).slice(0, 200)}` : ""}\n  fix: ${String(g[0].solution).slice(0, 300)}`;
    });
    return text(`${alerts.length} alerts, ${groups.size} distinct\n\n${out.join("\n\n")}`);
  }
);

server.tool("zap_stop", "Stop and remove the ZAP container.", {}, async () => {
  await run("docker", ["rm", "-f", CONTAINER]).catch(() => {});
  return text("ZAP stopped.");
});

// The triage skill is also served as an MCP prompt, so any client gets it, not just Claude Code.
const skill = readFileSync(new URL("../skills/zap-triage/SKILL.md", import.meta.url), "utf8").replace(/^---[\s\S]*?---\n/, "");
server.prompt(
  "zap_triage_report",
  "Triage ZAP alerts with the OWASP Risk Rating Methodology and write a security report.",
  { focus: z.string().optional().describe("Optional: what to emphasise, e.g. the checkout flow") },
  ({ focus }) => ({
    messages: [{ role: "user" as const, content: { type: "text" as const, text: `${skill}${focus ? `\n\nFocus: ${focus}` : ""}\n\nNow call zap_get_alerts and produce the report.` } }],
  })
);

await server.connect(new StdioServerTransport());
