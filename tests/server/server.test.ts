import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Service } from "../../src/server/service.js";
import { createApp } from "../../src/server/http.js";

test("HTTP persistence, state transactions, decisions, security and SSE", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-dashboard-test-"));
  const path = join(dir, "data.sqlite");
  let service = new Service(path);
  const server = createApp(service);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  async function call(path: string, method = "GET", body?: any) {
    const res = await fetch(base + path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, value: (await res.json()) as any };
  }
  try {
    const stream = await fetch(base + "/api/stream");
    assert.equal(stream.status, 200);
    assert(stream.body);
    const reader = stream.body.getReader();
    await reader.read();
    const created = await call("/api/tasks", "POST", { title: "持久化任务" });
    assert.equal(created.status, 201);
    const id = created.value.id;
    const notification = await reader.read();
    assert.match(new TextDecoder().decode(notification.value), /event: change/);
    assert.equal(
      (
        await call("/api/tasks/" + id, "PATCH", {
          status: "in_progress",
          plannedStart: "2026-12-01T00:00:00Z",
          plannedEnd: "2026-11-01T00:00:00Z",
        })
      ).status,
      400,
    );
    assert.equal((await call("/api/tasks/" + id)).value.status, "todo");
    assert.equal(
      (
        await call("/api/tasks/" + id, "PATCH", {
          plannedStart: "2026-01-01T00:00:00+99:00",
        })
      ).status,
      400,
    );
    const active = await call("/api/tasks/" + id, "PATCH", {
      status: "in_progress",
    });
    assert.ok(active.value.startedAt);
    const d = await call("/api/tasks/" + id + "/decisions", "POST", {
      question: "选择",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      recommendation: "a",
    });
    assert.equal(d.status, 201);
    assert.equal(
      (await call("/api/tasks/" + id, "PATCH", { status: "todo" })).status,
      409,
    );
    assert.equal(
      (
        await call("/api/tasks/" + id + "/decisions", "POST", {
          question: "Again?",
          options: [
            { id: "a", label: "A" },
            { id: "b", label: "B" },
          ],
        })
      ).status,
      409,
    );
    assert.equal(
      (await call("/api/tasks/" + id + "/complete", "POST", {})).status,
      409,
    );
    assert.equal(
      (
        await call("/api/decisions/" + d.value.id + "/resolve", "POST", {
          answer: "z",
          resumeStatus: "todo",
        })
      ).status,
      400,
    );
    assert.equal((await call("/api/tasks/" + id)).value.status, "decision");
    const [one, two] = await Promise.all([
      call("/api/decisions/" + d.value.id + "/resolve", "POST", {
        answer: "a",
        resumeStatus: "in_progress",
      }),
      call("/api/decisions/" + d.value.id + "/resolve", "POST", {
        answer: "b",
        resumeStatus: "todo",
      }),
    ]);
    assert.deepEqual([one.status, two.status].sort(), [200, 409]);
    assert.equal(
      (await call("/api/tasks/" + id + "/complete", "POST", {})).value.status,
      "done",
    );
    const events = (await call("/api/tasks/" + id + "/events")).value;
    assert.deepEqual(
      events
        .filter((x: any) => x.data.toStatus)
        .map((x: any) => x.data.toStatus),
      [
        "todo",
        "in_progress",
        "decision",
        one.status === 200 ? "in_progress" : "todo",
        "done",
      ],
    );
    assert.equal(
      events.filter((x: any) => x.type === "decision_resolved").length,
      1,
    );
    assert.equal((await call("/api/tasks/missing/events")).status, 404);
    const blocked = await fetch(base + "/api/tasks", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: '{"title":"evil"}',
    });
    assert.equal(blocked.status, 403);
    await reader.cancel();
    for (let i = 0; i < 50 && service.listeners.size; i++)
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(service.listeners.size, 0);
    await new Promise<void>((r) => server.close(() => r()));
    service.close();
    service = new Service(path);
    assert.equal(service.getTask(id).status, "done");
    assert.equal(service.listDecisions({ status: "resolved" }).length, 1);
    assert.equal(service.listEvents(id).length, 5);
  } finally {
    if (server.listening)
      await new Promise<void>((r) => server.close(() => r()));
    service.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("separate server process restart preserves persisted tasks", async () => {
  const { spawn } = await import("node:child_process");
  const { createServer } = await import("node:net");
  const dir = await mkdtemp(join(tmpdir(), "dashboard-restart-"));
  const probe = createServer();
  await new Promise<void>((r) => probe.listen(0, "127.0.0.1", r));
  const addr = probe.address();
  assert(addr && typeof addr !== "string");
  const port = addr.port;
  await new Promise<void>((r) => probe.close(() => r()));
  const base = `http://127.0.0.1:${port}`;
  let child: ReturnType<typeof spawn> | undefined;
  async function start() {
    child = spawn(
      process.execPath,
      ["--import", "tsx", "src/server/index.ts"],
      {
        cwd: process.cwd(),
        env: { ...process.env, PORT: String(port), DATA_DIR: dir },
        stdio: "ignore",
      },
    );
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null)
        throw new Error(`server exited: ${child.exitCode}`);
      try {
        if ((await fetch(base + "/api/tasks")).ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("server failed to start");
  }
  async function stop() {
    if (!child) return;
    const p = child;
    child = undefined;
    if (p.exitCode !== null) return;
    await new Promise<void>((r) => {
      p.once("exit", () => r());
      p.kill();
    });
  }
  try {
    await start();
    const response = await fetch(base + "/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Survives restart" }),
    });
    const task = (await response.json()) as any;
    assert.equal(response.status, 201);
    await stop();
    await start();
    const read = await fetch(base + "/api/tasks/" + task.id);
    assert.equal(((await read.json()) as any).title, "Survives restart");
  } finally {
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});
