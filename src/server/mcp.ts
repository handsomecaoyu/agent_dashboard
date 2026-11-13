import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { makeMcp, httpInvoke } from "./mcp-core.js";
const port = Number(process.env.PORT || 4317);
const base = process.env.DASHBOARD_URL || `http://127.0.0.1:${port}`;
const url = new URL(base);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
  url.protocol !== "http:"
)
  throw new Error("DASHBOARD_URL must use loopback HTTP");
const server = makeMcp(httpInvoke(base.replace(/\/$/, "")));
await server.connect(new StdioServerTransport());
