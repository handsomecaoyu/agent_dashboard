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
    const decisionTool = listed.tools.find(
      (t) => t.name === "request_decision",
    );
    assert.ok(decisionTool);
    assert.ok(decisionTool.inputSchema.properties?.question);
    assert.ok(decisionTool.inputSchema.required?.includes("question"));
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
        args:
          process.env.MCP_TEST_DIST === "1"
            ? ["dist/server/mcp.js"]
            : ["--import", "tsx", "src/server/mcp.ts"],
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
    const stdioTools = await stdio.listTools();
    assert.ok(
      stdioTools.tools
        .find((t) => t.name === "create_task")
        ?.inputSchema.required?.includes("title"),
    );
    const requested: any = await http.callTool({
      name: "request_decision",
      arguments: {
        taskId: task.id,
        question: "Choose",
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
      },
    });
    assert.ok(!requested.isError);
    const decision = JSON.parse(requested.content[0].text);
    const rejected: any = await stdio.callTool({
      name: "resolve_decision",
      arguments: {
        decisionId: decision.id,
        answer: "missing",
        resumeStatus: "todo",
      },
    });
    assert.equal(rejected.isError, true);
    assert.equal(
      JSON.parse(rejected.content[0].text).error.code,
      "VALIDATION_ERROR",
    );
    const resolved: any = await stdio.callTool({
      name: "resolve_decision",
      arguments: {
        decisionId: decision.id,
        answer: "a",
        resumeStatus: "in_progress",
      },
    });
    assert.ok(!resolved.isError);
    assert.equal(JSON.parse(resolved.content[0].text).status, "resolved");
    const lookup: any = await http.callTool({
      name: "get_task",
      arguments: { taskId: task.id },
    });
    assert.equal(JSON.parse(lookup.content[0].text).status, "in_progress");
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
