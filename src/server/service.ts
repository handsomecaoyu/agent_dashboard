import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const text = z.string().trim().max(10000);
const required = text.min(1);
const nullable = text.nullable();
const actor = text.max(200).optional();
const date = z
  .string()
  .datetime({ offset: true })
  .refine((value) => Number.isFinite(Date.parse(value)), "Invalid datetime")
  .nullable();
const data = z
  .record(z.string(), z.unknown())
  .refine((v) => JSON.stringify(v).length <= 20000, "data too large");
const taskFields = {
  title: required.max(200),
  description: text,
  priority: z.enum(["low", "medium", "high"]),
  assignee: text.max(200),
  summary: nullable,
  nextStep: nullable,
  sessionRef: nullable,
  plannedStart: date,
  plannedEnd: date,
};
export const schemas = {
  create: z
    .object({
      ...taskFields,
      description: taskFields.description.optional(),
      priority: taskFields.priority.optional(),
      assignee: taskFields.assignee.optional(),
      summary: nullable.optional(),
      nextStep: nullable.optional(),
      sessionRef: nullable.optional(),
      plannedStart: date.optional(),
      plannedEnd: date.optional(),
      actor,
    })
    .strict(),
  update: z
    .object({
      ...Object.fromEntries(
        Object.entries(taskFields).map(([k, v]) => [k, v.optional()]),
      ),
      status: z.enum(["todo", "in_progress"]).optional(),
      actor,
    })
    .strict(),
  event: z
    .object({
      type: z.enum(["checkpoint", "artifact"]),
      content: required,
      data: data.optional(),
      actor,
    })
    .strict(),
  artifact: z
    .object({ content: required, data: data.optional(), actor })
    .strict(),
  complete: z.object({ content: text.optional(), actor }).strict(),
  decision: z
    .object({
      question: required,
      options: z
        .array(
          z
            .object({
              id: required.max(200),
              label: required.max(500),
              description: text.optional(),
            })
            .strict(),
        )
        .min(2)
        .max(30),
      recommendation: z.string().nullable().optional(),
      actor,
    })
    .strict(),
  resolve: z
    .object({
      answer: required.max(200),
      resumeStatus: z.enum(["todo", "in_progress"]),
      actor,
    })
    .strict(),
  tasksFilter: z
    .object({
      status: z.enum(["todo", "in_progress", "done", "decision"]).optional(),
      search: text.optional(),
      assignee: text.optional(),
    })
    .strict(),
  decisionsFilter: z
    .object({
      taskId: z.string().optional(),
      status: z.enum(["pending", "resolved"]).optional(),
    })
    .strict(),
};
function parse(schema: z.ZodTypeAny, value: unknown): any {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  return r.data;
}
function ensureDates(t: any) {
  if (
    t.plannedStart &&
    t.plannedEnd &&
    Date.parse(t.plannedStart) > Date.parse(t.plannedEnd)
  )
    throw new ApiError(
      400,
      "VALIDATION_ERROR",
      "plannedStart must not be after plannedEnd",
    );
}
const id = () => randomUUID();
const now = () => new Date().toISOString();
export class Service {
  db: DatabaseSync;
  listeners = new Set<() => void>();
  private inTransaction = false;
  constructor(file: string) {
    mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, task_id TEXT NOT NULL REFERENCES tasks(id), created_at TEXT NOT NULL, value TEXT NOT NULL);",
    );
  }
  close() {
    this.db.close();
  }
  private transact<T>(fn: () => T): T {
    if (this.inTransaction) return fn();
    this.db.exec("BEGIN IMMEDIATE");
    this.inTransaction = true;
    let result: T;
    try {
      result = fn();
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    } finally {
      this.inTransaction = false;
    }
    for (const f of this.listeners) {
      try {
        f();
      } catch {}
    }
    return result;
  }
  private saveTask(t: any) {
    this.db
      .prepare(
        "INSERT INTO tasks(id,value) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      )
      .run(t.id, JSON.stringify(t));
  }
  private saveDecision(d: any) {
    this.db
      .prepare(
        "INSERT INTO decisions(id,task_id,value) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      )
      .run(d.id, d.taskId, JSON.stringify(d));
  }
  private event(
    taskId: string,
    type: string,
    content: string,
    actorValue: string | null,
    dataValue: object,
    time = now(),
  ) {
    const e = {
      id: id(),
      taskId,
      type,
      actor: actorValue,
      content,
      data: dataValue,
      createdAt: time,
    };
    this.db
      .prepare(
        "INSERT INTO events(id,task_id,created_at,value) VALUES (?,?,?,?)",
      )
      .run(e.id, taskId, time, JSON.stringify(e));
    return e;
  }
  getTask(taskId: string): any {
    const row = this.db
      .prepare("SELECT value FROM tasks WHERE id=?")
      .get(taskId) as any;
    if (!row) throw new ApiError(404, "NOT_FOUND", "Task not found");
    return JSON.parse(row.value);
  }
  listTasks(filter: unknown = {}): any[] {
    const f = parse(schemas.tasksFilter, filter);
    let tasks = (this.db.prepare("SELECT value FROM tasks").all() as any[]).map(
      (x) => JSON.parse(x.value),
    );
    if (f.status) tasks = tasks.filter((t) => t.status === f.status);
    if (f.assignee) tasks = tasks.filter((t) => t.assignee === f.assignee);
    if (f.search) {
      const q = f.search.toLowerCase();
      tasks = tasks.filter((t) =>
        `${t.title} ${t.description}`.toLowerCase().includes(q),
      );
    }
    return tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  createTask(input: unknown) {
    const v = parse(schemas.create, input);
    return this.transact(() => {
      const time = now();
      const t = {
        id: id(),
        title: v.title,
        description: v.description ?? "",
        status: "todo",
        priority: v.priority ?? "medium",
        assignee: v.assignee ?? "",
        summary: v.summary ?? null,
        nextStep: v.nextStep ?? null,
        sessionRef: v.sessionRef ?? null,
        plannedStart: v.plannedStart ?? null,
        plannedEnd: v.plannedEnd ?? null,
        startedAt: null,
        completedAt: null,
        createdAt: time,
        updatedAt: time,
      };
      ensureDates(t);
      this.saveTask(t);
      this.event(
        t.id,
        "created",
        "Task created",
        v.actor ?? null,
        { fromStatus: null, toStatus: "todo" },
        time,
      );
      return t;
    });
  }
  updateTask(taskId: string, input: unknown) {
    const v = parse(schemas.update, input);
    return this.transact(() => {
      const t = this.getTask(taskId),
        from = t.status;
      if (from === "decision" && v.status && v.status !== from)
        throw new ApiError(
          409,
          "CONFLICT",
          "Resolve the pending decision first",
        );
      const { actor: who, ...changes } = v;
      Object.assign(t, changes);
      ensureDates(t);
      const time = now();
      if (t.status === "in_progress" && !t.startedAt) t.startedAt = time;
      if (from === "done" && t.status !== "done") t.completedAt = null;
      t.updatedAt = time;
      this.saveTask(t);
      this.event(
        taskId,
        "updated",
        "Task updated",
        who ?? null,
        from !== t.status ? { fromStatus: from, toStatus: t.status } : {},
        time,
      );
      return t;
    });
  }
  addEvent(taskId: string, input: unknown) {
    const v = parse(schemas.event, input);
    return this.transact(() => {
      const t = this.getTask(taskId),
        time = now();
      if (v.type === "checkpoint" && v.data?.nextStep !== undefined) {
        if (typeof v.data.nextStep !== "string" && v.data.nextStep !== null)
          throw new ApiError(
            400,
            "VALIDATION_ERROR",
            "nextStep must be a string or null",
          );
        t.nextStep = v.data.nextStep;
      }
      t.updatedAt = time;
      this.saveTask(t);
      return this.event(
        taskId,
        v.type,
        v.content,
        v.actor ?? null,
        v.data ?? {},
        time,
      );
    });
  }
  addArtifact(taskId: string, input: unknown) {
    return this.addEvent(taskId, {
      ...parse(schemas.artifact, input),
      type: "artifact",
    });
  }
  complete(taskId: string, input: unknown) {
    const v = parse(schemas.complete, input);
    return this.transact(() => {
      const t = this.getTask(taskId);
      if (t.status === "done")
        throw new ApiError(409, "CONFLICT", "Task is already complete");
      if (this.listDecisions({ taskId, status: "pending" }).length)
        throw new ApiError(409, "CONFLICT", "Resolve pending decisions first");
      const from = t.status,
        time = now();
      t.status = "done";
      t.completedAt = time;
      t.updatedAt = time;
      this.saveTask(t);
      this.event(
        taskId,
        "completed",
        v.content || "Task completed",
        v.actor ?? null,
        { fromStatus: from, toStatus: "done" },
        time,
      );
      return t;
    });
  }
  requestDecision(taskId: string, input: unknown) {
    const v = parse(schemas.decision, input);
    const ids = v.options.map((x: any) => x.id);
    if (
      new Set(ids).size !== ids.length ||
      (v.recommendation && !ids.includes(v.recommendation))
    )
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        "Options must have unique IDs and recommendation must match an option",
      );
    return this.transact(() => {
      const t = this.getTask(taskId);
      if (t.status === "done" || t.status === "decision")
        throw new ApiError(
          409,
          "CONFLICT",
          "Task must be active and have no pending decision",
        );
      const time = now(),
        from = t.status;
      const d = {
        id: id(),
        taskId,
        question: v.question,
        options: v.options,
        recommendation: v.recommendation ?? null,
        status: "pending",
        answer: null,
        createdAt: time,
        resolvedAt: null,
      };
      t.status = "decision";
      t.updatedAt = time;
      this.saveDecision(d);
      this.saveTask(t);
      this.event(
        taskId,
        "decision_requested",
        v.question,
        v.actor ?? null,
        { decisionId: d.id, fromStatus: from, toStatus: "decision" },
        time,
      );
      return d;
    });
  }
  resolveDecision(decisionId: string, input: unknown) {
    const v = parse(schemas.resolve, input);
    return this.transact(() => {
      const row = this.db
        .prepare("SELECT value FROM decisions WHERE id=?")
        .get(decisionId) as any;
      if (!row) throw new ApiError(404, "NOT_FOUND", "Decision not found");
      const d = JSON.parse(row.value);
      if (d.status !== "pending")
        throw new ApiError(409, "CONFLICT", "Decision is already resolved");
      if (!d.options.some((x: any) => x.id === v.answer))
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          "Answer must match an option",
        );
      const t = this.getTask(d.taskId),
        time = now();
      d.status = "resolved";
      d.answer = v.answer;
      d.resolvedAt = time;
      t.status = v.resumeStatus;
      if (t.status === "in_progress" && !t.startedAt) t.startedAt = time;
      t.updatedAt = time;
      this.saveDecision(d);
      this.saveTask(t);
      this.event(
        t.id,
        "decision_resolved",
        d.question,
        v.actor ?? null,
        {
          decisionId: d.id,
          answer: v.answer,
          fromStatus: "decision",
          toStatus: t.status,
        },
        time,
      );
      return d;
    });
  }
  listDecisions(input: unknown = {}): any[] {
    const f = parse(schemas.decisionsFilter, input);
    return (
      this.db
        .prepare("SELECT value FROM decisions ORDER BY rowid")
        .all() as any[]
    )
      .map((x) => JSON.parse(x.value))
      .filter(
        (d) =>
          (!f.taskId || d.taskId === f.taskId) &&
          (!f.status || d.status === f.status),
      );
  }
  seedTask(fingerprint: string, input: unknown): boolean {
    return this.transact(() => {
      if (
        this.db
          .prepare("SELECT fingerprint FROM seed_items WHERE fingerprint=?")
          .get(fingerprint)
      )
        return false;
      const task = this.createTask(input);
      this.db
        .prepare("INSERT INTO seed_items(fingerprint,task_id) VALUES (?,?)")
        .run(fingerprint, task.id);
      return true;
    });
  }
  listEvents(taskId?: string): any[] {
    if (taskId) this.getTask(taskId);
    const rows = taskId
      ? this.db
          .prepare(
            "SELECT value FROM events WHERE task_id=? ORDER BY created_at,seq",
          )
          .all(taskId)
      : this.db
          .prepare("SELECT value FROM events ORDER BY created_at,seq")
          .all();
    return (rows as any[]).map((x) => JSON.parse(x.value));
  }
}
