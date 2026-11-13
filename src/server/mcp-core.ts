import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { schemas, ApiError, Service } from "./service.js";

type Invoke = (name: string, args: any) => Promise<any>;
const key = z.string().min(1).max(200);
const definitions: Record<
  string,
  { shape: z.ZodRawShape; description: string }
> = {
  list_tasks: {
    shape: schemas.tasksFilter.shape,
    description: "List and filter tasks",
  },
  get_task: { shape: { taskId: key }, description: "Get a task" },
  create_task: { shape: schemas.create.shape, description: "Create a task" },
  update_task: {
    shape: { taskId: key, ...schemas.update.shape },
    description: "Update a task",
  },
  complete_task: {
    shape: { taskId: key, ...schemas.complete.shape },
    description: "Explicitly complete a task",
  },
  add_checkpoint: {
    shape: {
      taskId: key,
      content: z.string(),
      data: schemas.event.shape.data,
      actor: schemas.event.shape.actor,
    },
    description: "Record progress or a checkpoint",
  },
  request_decision: {
    shape: { taskId: key, ...schemas.decision.shape },
    description: "Request a structured decision",
  },
  resolve_decision: {
    shape: { decisionId: key, ...schemas.resolve.shape },
    description: "Resolve a decision and resume",
  },
  list_decisions: {
    shape: schemas.decisionsFilter.shape,
    description: "List structured decisions",
  },
  add_artifact: {
    shape: { taskId: key, ...schemas.artifact.shape },
    description: "Record an artifact link or path",
  },
  list_events: {
    shape: { taskId: key.optional() },
    description: "List task or global events",
  },
};
export function localInvoke(service: Service): Invoke {
  return async (name, args) => {
    const { taskId, decisionId, ...rest } = args;
    switch (name) {
      case "list_tasks":
        return service.listTasks(args);
      case "get_task":
        return service.getTask(taskId);
      case "create_task":
        return service.createTask(args);
      case "update_task":
        return service.updateTask(taskId, rest);
      case "complete_task":
        return service.complete(taskId, rest);
      case "add_checkpoint":
        return service.addEvent(taskId, { ...rest, type: "checkpoint" });
      case "request_decision":
        return service.requestDecision(taskId, rest);
      case "resolve_decision":
        return service.resolveDecision(decisionId, rest);
      case "list_decisions":
        return service.listDecisions(args);
      case "add_artifact":
        return service.addArtifact(taskId, rest);
      case "list_events":
        return service.listEvents(taskId);
      default:
        throw new ApiError(404, "NOT_FOUND", "Unknown tool");
    }
  };
}
export function makeMcp(invoke: Invoke) {
  const server = new McpServer({ name: "agent-dashboard", version: "0.1.0" });
  const run = async (name: string, args: unknown) => {
    try {
      const definition = definitions[name];
      if (!definition) throw new ApiError(404, "NOT_FOUND", "Unknown tool");
      const parsed = z
        .object(definition.shape)
        .strict()
        .safeParse(args ?? {});
      if (!parsed.success)
        throw new ApiError(
          400,
          "VALIDATION_ERROR",
          parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        );
      const value = await invoke(name, parsed.data);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(value) }],
      };
    } catch (error) {
      const e =
        error instanceof ApiError
          ? error
          : new ApiError(500, "INTERNAL_ERROR", "Internal server error");
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: { code: e.code, message: e.message },
            }),
          },
        ],
      };
    }
  };
  for (const [name, def] of Object.entries(definitions))
    server.registerTool(
      name,
      { description: def.description, inputSchema: def.shape },
      async (args) => run(name, args),
    );
  // SDK handles the protocol and exposes tool schemas. Validate calls here so
  // SDK-level validation failures share the API's structured error envelope.
  server.server.setRequestHandler(CallToolRequestSchema, (request) =>
    run(request.params.name, request.params.arguments),
  );
  return server;
}
export function httpInvoke(base: string): Invoke {
  return async (name, args) => {
    const { taskId, decisionId, ...rest } = args;
    let method = "GET",
      path = "",
      body: any;
    const query = (o: any) => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(o))
        if (v !== undefined) p.set(k, String(v));
      const s = p.toString();
      return s ? "?" + s : "";
    };
    switch (name) {
      case "list_tasks":
        path = "/api/tasks" + query(args);
        break;
      case "get_task":
        path = "/api/tasks/" + encodeURIComponent(taskId);
        break;
      case "create_task":
        path = "/api/tasks";
        method = "POST";
        body = args;
        break;
      case "update_task":
        path = "/api/tasks/" + encodeURIComponent(taskId);
        method = "PATCH";
        body = rest;
        break;
      case "complete_task":
        path = "/api/tasks/" + encodeURIComponent(taskId) + "/complete";
        method = "POST";
        body = rest;
        break;
      case "add_checkpoint":
        path = "/api/tasks/" + encodeURIComponent(taskId) + "/events";
        method = "POST";
        body = { ...rest, type: "checkpoint" };
        break;
      case "request_decision":
        path = "/api/tasks/" + encodeURIComponent(taskId) + "/decisions";
        method = "POST";
        body = rest;
        break;
      case "resolve_decision":
        path = "/api/decisions/" + encodeURIComponent(decisionId) + "/resolve";
        method = "POST";
        body = rest;
        break;
      case "list_decisions":
        path = "/api/decisions" + query(args);
        break;
      case "add_artifact":
        path = "/api/tasks/" + encodeURIComponent(taskId) + "/artifacts";
        method = "POST";
        body = rest;
        break;
      case "list_events":
        path = taskId
          ? "/api/tasks/" + encodeURIComponent(taskId) + "/events"
          : "/api/events";
        break;
      default:
        throw new ApiError(404, "NOT_FOUND", "Unknown tool");
    }
    let response: Response;
    try {
      response = await fetch(base + path, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new ApiError(
        503,
        "SERVICE_UNAVAILABLE",
        "Dashboard server unavailable; start it first",
      );
    }
    const value = (await response.json()) as any;
    if (!response.ok)
      throw new ApiError(
        response.status,
        value.error?.code ?? "HTTP_ERROR",
        value.error?.message ?? "Request failed",
      );
    return value;
  };
}
