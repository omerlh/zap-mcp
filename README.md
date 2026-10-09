# zap-mcp

A tiny MCP server that lets an AI agent do security testing with [ZAP](https://www.zaproxy.org).

Three tools. That's the whole thing:

| Tool | What it does |
|---|---|
| `zap_start` | Starts ZAP in Docker as an intercepting proxy and returns the proxy URL |
| `zap_get_alerts` | Returns what ZAP found in the traffic so far, grouped by alert, sorted by risk |
| `zap_stop` | Removes the container |

The idea: the agent drives a browser *through* ZAP, like a human tester exploring the app. ZAP passively scans every request and response on the way. The agent then reads the alerts and triages them. No active attack is ever launched, so it is safe by default.

## Setup

Requirements: Node 20+, Docker.

```bash
git clone <this repo> && cd zap-mcp
npm install && npm run build
claude mcp add zap -- node "$PWD/dist/index.js"
```

For Cursor, add the same command under `mcpServers` in `.cursor/mcp.json`.

## Example: test OWASP Juice Shop with Claude Code

Start the deliberately vulnerable target:

```bash
docker run -d --name juice -p 127.0.0.1:3000:3000 bkimminich/juice-shop
```

Then ask Claude Code:

> Start ZAP. Explore the Juice Shop at http://host.docker.internal:3000 through the ZAP proxy: browse the shop, search for products, register and log in. Then get the alerts and triage them: what is real, what is noise, and what would you fix first?

`host.docker.internal` matters: ZAP runs in Docker, so `localhost` would point at ZAP's own container.

Claude calls `zap_start`, browses through the proxy (for example with `agent-browser --proxy http://127.0.0.1:8080`), calls `zap_get_alerts`, and answers with a triage.

### What it found (6 requests, curl through the proxy)

```
10 alerts, 3 distinct

[Medium/Medium Cross-Domain Misconfiguration] x6
  urls: .../, .../api/Challenges, .../ftp, .../robots.txt +2 more
  evidence: Access-Control-Allow-Origin: *

[Medium/High Content Security Policy (CSP) Header Not Set] x2
  urls: .../, .../ftp

[Low/Low Timestamp Disclosure - Unix] x2
  urls: .../
```

That was six plain requests with curl. An agent that actually uses the app (login, basket, search forms) reaches far more of it.

## Notes

- Only point it at apps you are allowed to test.
- Alerts are grouped by name so an agent's context isn't flooded with one entry per URL.
- `ZAP_IMAGE` overrides the image (default `zaproxy/zap-stable`).
- The API key is random per run, and the proxy listens on `127.0.0.1` only.

## Roadmap

- `zap_spider`, to crawl a target
- Active scan, behind an explicit opt-in
