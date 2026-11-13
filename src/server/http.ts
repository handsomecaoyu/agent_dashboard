import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Service, ApiError } from "./service.js";
import { localInvoke, makeMcp } from "./mcp-core.js";
export function dataDirectory() {
  return (
    process.env.DATA_DIR ||
    (process.platform === "win32"
      ? join(
          process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
          "AgentDashboard",
        )
      : process.platform === "darwin"
        ? join(homedir(), "Library", "Application Support", "AgentDashboard")
        : join(
            process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
            "agent-dashboard",
          ))
  );
}
const webDir = resolve(
  fileURLToPath(new URL("../../dist/web/", import.meta.url)),
);
function send(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers["content-type"] || ""))
    throw new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Content-Type must be application/json",
    );
  let total = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const b = Buffer.from(chunk);
    total += b.length;
    if (total > 65536)
      throw new ApiError(
        413,
        "PAYLOAD_TOO_LARGE",
        "Request body exceeds 64 KiB",
      );
    chunks.push(b);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Invalid JSON");
  }
}
function safeHost(host: string | undefined) {
  if (!host) return false;
  try {
    const u = new URL("http://" + host);
    return (
      ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}
function safeOrigin(origin: string | undefined) {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return (
      ["http:", "https:"].includes(u.protocol) &&
      ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) &&
      !u.username &&
      !u.password
    );
  } catch {
    return false;
  }
}
export function createApp(service: Service) {
  return createServer(async (req, res) => {
    try {
      if (!safeHost(req.headers.host) || !safeOrigin(req.headers.origin))
        throw new ApiError(403, "FORBIDDEN", "Host or Origin is not allowed");
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      const path = url.pathname;
      const method = req.method || "GET";
      if (path === "/mcp") {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        const mcp = makeMcp(localInvoke(service));
        res.on("close", () => {
          void transport.close();
          void mcp.close();
        });
        await mcp.connect(transport);
        await transport.handleRequest(req, res);
        return;
      }
      if (method === "GET" && path === "/api/stream") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        res.write(": connected\n\n");
        const notify = () => res.write("event: change\ndata: {}\n\n");
        service.listeners.add(notify);
        const timer = setInterval(() => res.write(": heartbeat\n\n"), 25000);
        req.on("close", () => {
          clearInterval(timer);
          service.listeners.delete(notify);
        });
        return;
      }
      if (path.startsWith("/api/")) {
        const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
        let result: any;
        let status = 200;
        if (parts.length === 2 && parts[1] === "tasks") {
          if (method === "GET")
            result = service.listTasks(Object.fromEntries(url.searchParams));
          else if (method === "POST") {
            result = service.createTask(await body(req));
            status = 201;
          }
        } else if (
          parts.length === 2 &&
          parts[1] === "events" &&
          method === "GET"
        )
          result = service.listEvents();
        else if (
          parts.length === 2 &&
          parts[1] === "decisions" &&
          method === "GET"
        )
          result = service.listDecisions(Object.fromEntries(url.searchParams));
        else if (parts[1] === "tasks" && parts[2]) {
          const taskId = parts[2];
          if (parts.length === 3) {
            if (method === "GET") result = service.getTask(taskId);
            else if (method === "PATCH")
              result = service.updateTask(taskId, await body(req));
          } else if (parts.length === 4) {
            switch (parts[3]) {
              case "events":
                if (method === "GET") result = service.listEvents(taskId);
                else if (method === "POST") {
                  result = service.addEvent(taskId, await body(req));
                  status = 201;
                }
                break;
              case "decisions":
                if (method === "GET") {
                  service.getTask(taskId);
                  result = service.listDecisions({ taskId });
                } else if (method === "POST") {
                  result = service.requestDecision(taskId, await body(req));
                  status = 201;
                }
                break;
              case "complete":
                if (method === "POST")
                  result = service.complete(taskId, await body(req));
                break;
              case "artifacts":
                if (method === "POST") {
                  result = service.addArtifact(taskId, await body(req));
                  status = 201;
                }
                break;
            }
          }
        } else if (
          parts[1] === "decisions" &&
          parts[2] &&
          parts[3] === "resolve" &&
          parts.length === 4 &&
          method === "POST"
        )
          result = service.resolveDecision(parts[2], await body(req));
        if (result === undefined)
          throw new ApiError(404, "NOT_FOUND", "Endpoint not found");
        send(res, status, result);
        return;
      }
      if (method !== "GET" && method !== "HEAD")
        throw new ApiError(404, "NOT_FOUND", "Endpoint not found");
      const relative =
        decodeURIComponent(path).replace(/^\/+/, "") || "index.html";
      let file = resolve(webDir, relative);
      if (file !== webDir && !file.startsWith(webDir + sep))
        throw new ApiError(403, "FORBIDDEN", "Invalid path");
      let content: Buffer;
      try {
        content = await readFile(file);
      } catch {
        if (extname(relative))
          throw new ApiError(404, "NOT_FOUND", "File not found");
        file = join(webDir, "index.html");
        try {
          content = await readFile(file);
        } catch {
          throw new ApiError(404, "NOT_FOUND", "Web build not found");
        }
      }
      const mime: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".ico": "image/x-icon",
      };
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(method === "HEAD" ? undefined : content);
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      const e =
        error instanceof ApiError
          ? error
          : new ApiError(500, "INTERNAL_ERROR", "Internal server error");
      if (!(error instanceof ApiError)) console.error(error);
      send(res, e.status, { error: { code: e.code, message: e.message } });
    }
  });
}
