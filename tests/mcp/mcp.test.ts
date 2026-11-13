import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Service } from "../../src/server/service.js";
import { createApp } from "../../src/server/http.js";

test("official MCP clients initialize, list and call through HTTP and stdio", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dashboard-mcp-"));
  const service = new Service(join(dir, "data.sqlite"));
  const server = createApp(service);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  assert(addr && typeof addr !== "string");
  const base = `http://127.0.0.1:${addr.port}`;
  const http = new Client({ name: "test-http", version: "1.0.0" });
  const stdio = new Client({ name: "test-stdio", version: "1.0.0" });
  try {
    await http.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp")),
    );
    const listed = await http.listTools();
    assert.ok(listed.tools.some((t) => t.name === "request_decision"));
    const create: any = await http.callTool({
      name: "create_task",
      arguments: { title: "MCP task" },
    });
    assert.ok(!create.isError);
    const task = JSON.parse(create.content[0].text);
    assert.equal(task.title, "MCP task");
    await stdio.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ["--import", "tsx", "src/server/mcp.ts"],
        cwd: process.cwd(),
        env: { ...process.env, PORT: String(addr.port) } as Record<
          string,
          string
        >,
        stderr: "pipe",
      }),
    );
    const invalid: any = await http.callTool({
      name: "create_task",
      arguments: { title: "" },
    });
    assert.equal(invalid.isError, true);
    assert.equal(
      JSON.parse(invalid.content[0].text).error.code,
      "VALIDATION_ERROR",
    );
    const list: any = await stdio.callTool({
      name: "list_tasks",
      arguments: {},
    });
    assert.ok(!list.isError);
    assert.equal(JSON.parse(list.content[0].text)[0].id, task.id);
    const failed: any = await stdio.callTool({
      name: "get_task",
      arguments: { taskId: "missing" },
    });
    assert.equal(failed.isError, true);
    assert.equal(JSON.parse(failed.content[0].text).error.code, "NOT_FOUND");
  } finally {
    await stdio.close();
    await http.close();
    await new Promise<void>((r) => server.close(() => r()));
    service.close();
    await rm(dir, { recursive: true, force: true });
  }
});
