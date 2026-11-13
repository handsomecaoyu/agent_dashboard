import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Status = "todo" | "in_progress" | "decision" | "done";
type Task = {
  id: string;
  title: string;
  description: string;
  status: Status;
  priority: "low" | "medium" | "high";
  assignee: string;
  summary: string | null;
  nextStep: string | null;
  sessionRef: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
type Event = {
  id: string;
  taskId: string;
  type: string;
  actor: string | null;
  content: string;
  data: Record<string, unknown>;
  createdAt: string;
};
type Decision = {
  id: string;
  taskId: string;
  question: string;
  options: { id: string; label: string; description?: string }[];
  recommendation: string | null;
  status: "pending" | "resolved";
  answer: string | null;
  createdAt: string;
  resolvedAt: string | null;
};
const statuses: Status[] = ["todo", "in_progress", "decision", "done"];
const labels: Record<Status, string> = {
  todo: "待做",
  in_progress: "进行中",
  decision: "待决策",
  done: "已完成",
};
const priority = { low: "低", medium: "中", high: "高" };
const fmt = (s: string | null | undefined, time = false) =>
  s
    ? new Date(s).toLocaleString(
        "zh-CN",
        time
          ? {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            }
          : { year: "numeric", month: "short", day: "numeric" },
      )
    : "未设置";
const dateInput = (s: string | null) => {
  if (!s) return "";
  const d = new Date(s);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};
const iso = (s: string) => (s ? new Date(s + "T00:00:00").toISOString() : null);
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const r = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.error?.message || `请求失败 (${r.status})`);
  return body as T;
}
const send = (path: string, body: unknown, method = "POST") =>
  api(path, { method, body: JSON.stringify(body) });
function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    list: (
      <>
        <path d="M9 6h12M9 12h12M9 18h12" />
        <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="3" />
      </>
    ),
    timeline: (
      <>
        <path d="M4 5v14M4 8h10M8 12h12M4 16h9" />
        <circle cx="14" cy="8" r="1" />
        <circle cx="20" cy="12" r="1" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m16 16 4 4" />
      </>
    ),
    close: <path d="M6 6l12 12M18 6 6 18" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    edit: (
      <>
        <path d="m4 20 4-.8L19 8l-3-3L5 16zM14 7l3 3" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
function Dot({ status }: { status: Status }) {
  return <span className={"dot " + status} />;
}
function segments(task: Task, events: Event[]) {
  const changes = events.filter(
    (e) =>
      e.taskId === task.id &&
      (e.type === "created" || typeof e.data?.toStatus === "string"),
  );
  return changes.map((e, i) => ({
    status: (e.data?.toStatus || e.data?.status || "todo") as Status,
    start: e.createdAt,
    end: changes[i + 1]?.createdAt || null,
  }));
}
function MiniTimeline({ task, events }: { task: Task; events: Event[] }) {
  const seg = segments(task, events);
  const begin = seg.length ? new Date(seg[0].start).getTime() : 0;
  const finish = task.completedAt
    ? new Date(task.completedAt).getTime()
    : Date.now();
  const duration = Math.max(finish - begin, 1);
  return (
    <div className="mini-wrap">
      <div className="mini-label">
        <span>状态时间线</span>
        <span>{seg.length ? `${seg.length} 个阶段` : "暂无记录"}</span>
      </div>
      <div className="mini-track">
        {seg.length ? (
          seg.map((s, i) => {
            const start = new Date(s.start).getTime(),
              end = s.end ? new Date(s.end).getTime() : finish;
            return (
              <span
                key={i}
                className={"mini-segment " + s.status}
                style={{
                  flex: `${Math.max((end - start) / duration, 0.015)} 1 0`,
                }}
                title={`${labels[s.status] || s.status} · ${fmt(s.start, true)}${s.end ? " - " + fmt(s.end, true) : s.status === "done" ? " · 已完成" : " · 持续中"}`}
              />
            );
          })
        ) : (
          <span className="mini-empty" />
        )}
      </div>
      {seg.length > 0 && (
        <div className="mini-label mini-scale">
          <span>{fmt(seg[0].start)}</span>
          <span>{task.completedAt ? fmt(task.completedAt) : "至今"}</span>
        </div>
      )}
    </div>
  );
}
function App() {
  const [tasks, setTasks] = useState<Task[]>([]),
    [events, setEvents] = useState<Event[]>([]),
    [decisions, setDecisions] = useState<Decision[]>([]);
  const [view, setView] = useState<"board" | "list" | "timeline">("board");
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null),
    [editing, setEditing] = useState<Task | "new" | null>(null);
  const [busy, setBusy] = useState(false),
    [connected, setConnected] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const [t, e, d] = await Promise.all([
        api<Task[]>("/tasks"),
        api<Event[]>("/events"),
        api<Decision[]>("/decisions"),
      ]);
      setTasks(t);
      setEvents(e);
      setDecisions(d);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法连接服务");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const es = new EventSource("/api/stream");
    es.addEventListener("change", () => void refresh());
    es.onopen = () => {
      setConnected(true);
      void refresh();
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [refresh]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editing) setEditing(null);
        else setSelected(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);
  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (filter === "all" || t.status === filter) &&
          [t.title, t.description, t.assignee, t.sessionRef || ""].some((x) =>
            x.toLowerCase().includes(query.toLowerCase()),
          ),
      ),
    [tasks, filter, query],
  );
  const task = tasks.find((t) => t.id === selected);
  async function action(fn: () => Promise<unknown>, message = "已保存") {
    setBusy(true);
    try {
      await fn();
      await refresh();
      setNotice(message);
      window.setTimeout(() => setNotice(""), 3000);
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "操作失败";
      setError(message);
      setNotice("操作失败：" + message);
      window.setTimeout(() => setNotice(""), 6000);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus(t: Task, status: string) {
    if (status === "done") {
      await action(() => send(`/tasks/${t.id}/complete`, {}), "任务已完成");
      return;
    }
    if (status === "decision") {
      setSelected(t.id);
      return;
    }
    await action(
      () => send(`/tasks/${t.id}`, { status }, "PATCH"),
      "状态已更新",
    );
  }
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <span />
          </div>
          <div>
            <strong>Agent 工作看板</strong>
            <small>WORKSPACE</small>
          </div>
        </div>
        <div className="side-label">工作空间</div>
        <button className="side-item active" onClick={() => setView("board")}>
          <Icon name="grid" />
          所有任务 <span>{tasks.length}</span>
        </button>
        <div className="side-spacer" />
        <div className="side-note">
          <span className="connection" />
          本地工作空间<small>你的任务数据保存在本机</small>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            工作空间 <span>/</span> <strong>所有任务</strong>
          </div>
          <div className="top-right">
            <span className="live">
              <i style={{ background: connected ? "#50b68a" : "#d49b54" }} />
              {connected ? "实时同步" : "连接中断，正在重连"}
            </span>
            <button className="primary" onClick={() => setEditing("new")}>
              <Icon name="plus" />
              新建任务
            </button>
          </div>
        </header>
        <div className="content">
          <div className="heading">
            <div>
              <div className="eyebrow">WORKSPACE / TASKS</div>
              <h1>
                所有任务 <span>{tasks.length}</span>
              </h1>
              <p>让每一项工作，都有清晰的进展。</p>
            </div>
          </div>
          <div className="toolbar">
            <div className="tabs" role="tablist">
              {(
                [
                  ["board", "看板", "grid"],
                  ["list", "列表", "list"],
                  ["timeline", "时间线", "timeline"],
                ] as const
              ).map(([v, label, icon]) => (
                <button
                  role="tab"
                  aria-selected={view === v}
                  className={view === v ? "selected" : ""}
                  onClick={() => setView(v)}
                  key={v}
                >
                  <Icon name={icon} />
                  {label}
                </button>
              ))}
            </div>
            <div className="tools">
              <label className="search">
                <Icon name="search" />
                <input
                  placeholder="搜索任务..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <select
                aria-label="筛选状态"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">所有状态</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {labels[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button
                onClick={() => {
                  setError("");
                  void refresh();
                }}
              >
                重试
              </button>
            </div>
          )}
          {loading ? (
            <div className="empty large">正在加载任务…</div>
          ) : view === "board" ? (
            <div className="board">
              {statuses.map((s) => (
                <section className="column" key={s}>
                  <div className="column-head">
                    <Dot status={s} />
                    <strong>{labels[s]}</strong>
                    <span>{filtered.filter((t) => t.status === s).length}</span>
                    <button title="新建任务" onClick={() => setEditing("new")}>
                      <Icon name="plus" />
                    </button>
                  </div>
                  <div className="cards">
                    {filtered
                      .filter((t) => t.status === s)
                      .map((t) => (
                        <button
                          className="task-card"
                          key={t.id}
                          onClick={() => setSelected(t.id)}
                        >
                          <div className="card-top">
                            <span className="task-id">{t.id.slice(0, 8)}</span>
                            <span className={"priority " + t.priority}>
                              <i /> {priority[t.priority]}优先级
                            </span>
                          </div>
                          <h3>{t.title}</h3>
                          {t.description && <p>{t.description}</p>}
                          <MiniTimeline task={t} events={events} />
                          <div className="card-bottom">
                            <span>
                              {t.assignee ? (
                                <>
                                  <span className="avatar">
                                    {t.assignee.slice(0, 1).toUpperCase()}
                                  </span>
                                  {t.assignee}
                                </>
                              ) : (
                                "未分配"
                              )}
                            </span>
                            <span>
                              <Icon name="clock" size={13} />
                              {t.plannedEnd ? fmt(t.plannedEnd) : "未排期"}
                            </span>
                          </div>
                        </button>
                      ))}
                    {!filtered.some((t) => t.status === s) && (
                      <div className="column-empty">暂无任务</div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          ) : view === "list" ? (
            <div className="list-panel">
              {filtered.length ? (
                <>
                  <div className="list-header">
                    <span>任务</span>
                    <span>状态</span>
                    <span>负责人</span>
                    <span>计划结束</span>
                    <span>优先级</span>
                  </div>
                  {filtered.map((t) => (
                    <button
                      className="list-row"
                      key={t.id}
                      onClick={() => setSelected(t.id)}
                    >
                      <span>
                        <strong>{t.title}</strong>
                        <small>{t.id.slice(0, 8)}</small>
                      </span>
                      <span>
                        <Dot status={t.status} />
                        {labels[t.status]}
                      </span>
                      <span>{t.assignee || "未分配"}</span>
                      <span>{t.plannedEnd ? fmt(t.plannedEnd) : "未排期"}</span>
                      <span>{priority[t.priority]}</span>
                    </button>
                  ))}
                </>
              ) : (
                <div className="empty large">没有符合条件的任务</div>
              )}
            </div>
          ) : (
            <Timeline tasks={filtered} />
          )}
          {!loading && !tasks.length && (
            <div className="blank-hint">
              <div className="blank-icon">
                <Icon name="grid" size={21} />
              </div>
              <strong>从第一项任务开始</strong>
              <p>创建任务后，在这里追踪进展、记录决策和成果。</p>
              <button onClick={() => setEditing("new")}>
                <Icon name="plus" /> 创建任务
              </button>
            </div>
          )}
        </div>
      </main>
      {task && (
        <Drawer
          task={task}
          events={events.filter((e) => e.taskId === task.id)}
          decisions={decisions.filter((d) => d.taskId === task.id)}
          close={() => setSelected(null)}
          edit={() => setEditing(task)}
          action={action}
          busy={busy}
          changeStatus={changeStatus}
        />
      )}
      {editing && (
        <TaskForm
          initial={editing === "new" ? null : editing}
          close={() => setEditing(null)}
          save={async (data) => {
            const ok = await action(
              () =>
                editing === "new"
                  ? send("/tasks", data)
                  : send(`/tasks/${editing.id}`, data, "PATCH"),
              editing === "new" ? "任务已创建" : "任务已更新",
            );
            if (ok) setEditing(null);
          }}
          busy={busy}
        />
      )}{" "}
      {notice && <div className="toast">{notice}</div>}
    </div>
  );
}
function Timeline({ tasks }: { tasks: Task[] }) {
  const dates = tasks
    .flatMap((t) => [t.plannedStart, t.plannedEnd, t.startedAt, t.completedAt])
    .filter(Boolean)
    .map((x) => new Date(x!).getTime());
  const now = Date.now();
  const min = dates.length ? Math.min(...dates) : now,
    max = dates.length
      ? Math.max(
          ...dates,
          ...(tasks.some((t) => t.startedAt && !t.completedAt) ? [now] : []),
        )
      : now;
  const pad = dates.length ? Math.max((max - min) * 0.08, 60000) : 86400000;
  const left = min - pad,
    right = max + pad,
    range = right - left;
  const tick = (value: number) =>
    new Date(value).toLocaleString(
      "zh-CN",
      range < 172800000
        ? {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          }
        : { year: "numeric", month: "short", day: "numeric" },
    );
  function bar(start: string | null, end: string | null, actual = false) {
    if (!start && !end) return null;
    const a = start ? new Date(start).getTime() : new Date(end!).getTime();
    const b = end ? new Date(end).getTime() : actual ? now : a;
    return (
      <span
        className={
          "gantt-bar " +
          (actual ? "actual" : "plan") +
          (actual && !end ? " open" : "")
        }
        style={{
          left: `${Math.max(0, ((a - left) / range) * 100)}%`,
          width: `${Math.max(0.8, ((b - a) / range) * 100)}%`,
        }}
        title={`${start ? fmt(start, true) : "开始未设置"} → ${end ? fmt(end, true) : actual ? "持续中" : "结束未设置"}`}
      />
    );
  }
  return (
    <div className="timeline-panel">
      <div className="timeline-top">
        <div>
          <strong>全局时间线</strong>
          <p>计划与实际分开展示；未设置的日期不会推算。</p>
        </div>
        <div className="legend">
          <span>
            <i className="plan" />
            计划
          </span>
          <span>
            <i className="actual" />
            实际
          </span>
        </div>
      </div>
      {tasks.length ? (
        <>
          <div className="gantt-scale">
            <span>任务</span>
            <div>
              <span>{tick(left)}</span>
              <span>{tick((left + right) / 2)}</span>
              <span>{tick(right)}</span>
            </div>
          </div>
          {tasks.map((t) => (
            <div className="gantt-row" key={t.id}>
              <div className="gantt-name">
                <strong>{t.title}</strong>
                <small>
                  {!t.plannedStart && !t.plannedEnd
                    ? "未排期"
                    : `${t.plannedStart ? fmt(t.plannedStart) : "开始未设置"} — ${t.plannedEnd ? fmt(t.plannedEnd) : "结束未设置"}`}
                </small>
              </div>
              <div className="gantt-chart">
                <div className="gridlines" />
                <div className="bar-lane">
                  {bar(t.plannedStart, t.plannedEnd)}
                </div>
                <div className="bar-lane">
                  {bar(t.startedAt, t.completedAt, true)}
                </div>
                {!t.startedAt && (
                  <span className="no-actual">
                    {t.completedAt ? "未记录开始 · 已完成" : "实际未开始"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </>
      ) : (
        <div className="empty large">暂无任务可展示</div>
      )}
    </div>
  );
}
function TaskForm({
  initial,
  close,
  save,
  busy,
}: {
  initial: Task | null;
  close: () => void;
  save: (data: unknown) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState(initial?.title || ""),
    [description, setDescription] = useState(initial?.description || ""),
    [assignee, setAssignee] = useState(initial?.assignee || ""),
    [pri, setPri] = useState(initial?.priority || "medium"),
    [start, setStart] = useState(dateInput(initial?.plannedStart || null)),
    [end, setEnd] = useState(dateInput(initial?.plannedEnd || null)),
    [summary, setSummary] = useState(initial?.summary || ""),
    [nextStep, setNextStep] = useState(initial?.nextStep || ""),
    [sessionRef, setSessionRef] = useState(initial?.sessionRef || "");
  return (
    <div className="overlay modal-overlay" onMouseDown={close}>
      <form
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          save({
            title,
            description,
            assignee,
            priority: pri,
            plannedStart: iso(start),
            plannedEnd: iso(end),
            summary: summary || null,
            nextStep: nextStep || null,
            sessionRef: sessionRef || null,
          });
        }}
      >
        <div className="modal-head">
          <div>
            <div className="eyebrow">TASK DETAILS</div>
            <h2>{initial ? "编辑任务" : "新建任务"}</h2>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭"
            onClick={close}
          >
            <Icon name="close" />
          </button>
        </div>
        <label className="field">
          任务名称{" "}
          <input
            autoFocus
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="需要完成什么？"
          />
        </label>
        <label className="field">
          描述{" "}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="添加背景、目标或上下文"
            rows={3}
          />
        </label>
        <div className="field-grid">
          <label className="field">
            负责人{" "}
            <input
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder="未分配"
            />
          </label>
          <label className="field">
            优先级{" "}
            <select
              value={pri}
              onChange={(e) => setPri(e.target.value as Task["priority"])}
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </label>
          <label className="field">
            计划开始{" "}
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label className="field">
            计划结束{" "}
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          会话引用{" "}
          <input
            value={sessionRef}
            onChange={(e) => setSessionRef(e.target.value)}
            placeholder="可选，例如会话 ID"
          />
        </label>
        <label className="field">
          摘要{" "}
          <textarea
            rows={2}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </label>
        <label className="field">
          下一步{" "}
          <textarea
            rows={2}
            value={nextStep}
            onChange={(e) => setNextStep(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={close}>
            取消
          </button>
          <button disabled={busy} className="primary">
            {initial ? "保存更改" : "创建任务"}
          </button>
        </div>
      </form>
    </div>
  );
}
function Drawer({
  task,
  events,
  decisions,
  close,
  edit,
  action,
  busy,
  changeStatus,
}: {
  task: Task;
  events: Event[];
  decisions: Decision[];
  close: () => void;
  edit: () => void;
  action: (fn: () => Promise<unknown>, message?: string) => Promise<boolean>;
  busy: boolean;
  changeStatus: (task: Task, status: string) => void;
}) {
  const [checkpoint, setCheckpoint] = useState(""),
    [stage, setStage] = useState(""),
    [artifact, setArtifact] = useState(""),
    [question, setQuestion] = useState(""),
    [options, setOptions] = useState(""),
    [recommendation, setRecommendation] = useState(""),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [resume, setResume] = useState<"todo" | "in_progress">("in_progress");
  const [expanded, setExpanded] = useState("");
  const pending = decisions.filter((d) => d.status === "pending");
  const seg = segments(task, events);
  return (
    <div className="overlay drawer-overlay" onMouseDown={close}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="任务详情"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="drawer-top">
          <span>任务 / {task.id.slice(0, 8)}</span>
          <div>
            <button className="icon-btn" aria-label="编辑任务" onClick={edit}>
              <Icon name="edit" />
            </button>
            <button
              autoFocus
              className="icon-btn"
              aria-label="关闭"
              onClick={close}
            >
              <Icon name="close" />
            </button>
          </div>
        </div>
        <div className="drawer-body">
          <div className="detail-title">
            <h2>{task.title}</h2>
            <button className="secondary" onClick={edit}>
              <Icon name="edit" />
              编辑
            </button>
          </div>
          <p className="description">{task.description || "暂无描述"}</p>
          <div className="properties">
            <div>
              <span>状态</span>
              <select
                aria-label="修改任务状态"
                value={task.status}
                disabled={busy || pending.length > 0}
                onChange={(e) => changeStatus(task, e.target.value)}
              >
                {statuses
                  .filter((s) => s !== "decision" || task.status === "decision")
                  .map((s) => (
                    <option value={s} key={s}>
                      {labels[s]}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <span>优先级</span>
              <strong>{priority[task.priority]}</strong>
            </div>
            <div>
              <span>负责人</span>
              <strong>{task.assignee || "未分配"}</strong>
            </div>
            <div>
              <span>会话引用</span>
              <strong className="break">{task.sessionRef || "未设置"}</strong>
            </div>
          </div>
          {pending.length > 0 && (
            <div className="decision-callout">
              <strong>需要你的决策</strong>
              <p>选择一个选项并指定恢复状态，继续推进任务。</p>
            </div>
          )}
          <section className="detail-section">
            <div className="section-title">
              <h3>阶段与时间</h3>
              <span>基于真实记录</span>
            </div>
            <div className="date-grid">
              <div>
                <small>计划时间</small>
                <strong>
                  {task.plannedStart ? fmt(task.plannedStart) : "未设置"} →{" "}
                  {task.plannedEnd ? fmt(task.plannedEnd) : "未设置"}
                </strong>
              </div>
              <div>
                <small>实际时间</small>
                <strong>
                  {task.startedAt ? fmt(task.startedAt, true) : "未开始"} →{" "}
                  {task.completedAt
                    ? fmt(task.completedAt, true)
                    : task.startedAt
                      ? "持续中"
                      : "未完成"}
                </strong>
              </div>
            </div>
            <MiniTimeline task={task} events={events} />
            <div className="stage-list">
              {seg.length ? (
                seg.map((s, i) => (
                  <div key={i}>
                    <Dot status={s.status} />
                    <strong>{labels[s.status] || s.status}</strong>
                    <span>
                      {fmt(s.start, true)} —{" "}
                      {s.end
                        ? fmt(s.end, true)
                        : s.status === "done"
                          ? "已完成"
                          : "持续中"}
                    </span>
                  </div>
                ))
              ) : (
                <p className="muted">暂无状态记录</p>
              )}
            </div>
          </section>
          <section className="detail-section">
            <div className="section-title">
              <h3>工作摘要</h3>
            </div>
            <div className="text-block">
              <small>摘要</small>
              <p>{task.summary || "暂无摘要"}</p>
              <small>下一步</small>
              <p>{task.nextStep || "暂无下一步"}</p>
            </div>
          </section>
          <section className="detail-section">
            <div className="section-title">
              <h3>
                决策 <span>{decisions.length}</span>
              </h3>
              <button
                className="text-button"
                disabled={task.status === "done" || pending.length > 0}
                title={
                  task.status === "done"
                    ? "请先重新打开任务"
                    : pending.length
                      ? "请先解决现有决策"
                      : ""
                }
                onClick={() =>
                  setExpanded(expanded === "decision" ? "" : "decision")
                }
              >
                + 请求决策
              </button>
            </div>
            {decisions.map((d) => (
              <div className="decision-box" key={d.id}>
                <div className="decision-head">
                  <strong>{d.question}</strong>
                  <span
                    className={d.status === "pending" ? "tag pending" : "tag"}
                  >
                    {d.status === "pending" ? "待决策" : "已解决"}
                  </span>
                </div>
                <div className="options">
                  {d.options.map((o) => (
                    <label key={o.id} className="option">
                      <input
                        type="radio"
                        name={"decision-" + d.id}
                        checked={(answers[d.id] || d.answer) === o.id}
                        disabled={d.status === "resolved"}
                        onChange={() =>
                          setAnswers({ ...answers, [d.id]: o.id })
                        }
                      />
                      <span>
                        {o.label}
                        {o.id === d.recommendation && <em>推荐</em>}
                        {o.description && <small>{o.description}</small>}
                      </span>
                    </label>
                  ))}
                </div>
                {d.status === "pending" && (
                  <div className="resolve">
                    <label>
                      恢复至{" "}
                      <select
                        value={resume}
                        onChange={(e) =>
                          setResume(e.target.value as "todo" | "in_progress")
                        }
                      >
                        <option value="in_progress">进行中</option>
                        <option value="todo">待做</option>
                      </select>
                    </label>
                    <button
                      className="primary"
                      disabled={!answers[d.id] || busy}
                      onClick={() =>
                        void action(
                          () =>
                            send(`/decisions/${d.id}/resolve`, {
                              answer: answers[d.id],
                              resumeStatus: resume,
                            }),
                          "决策已提交",
                        )
                      }
                    >
                      提交答案
                    </button>
                  </div>
                )}
              </div>
            ))}
            {expanded === "decision" && (
              <form
                className="inline-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const opts = options
                    .split("\n")
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((label, i) => ({ id: `option-${i + 1}`, label }));
                  const rec = Number(recommendation);
                  if (opts.length < 2) return;
                  const ok = await action(
                    () =>
                      send(`/tasks/${task.id}/decisions`, {
                        question,
                        options: opts,
                        ...(rec > 0 && rec <= opts.length
                          ? { recommendation: opts[rec - 1].id }
                          : {}),
                      }),
                    "决策请求已创建",
                  );
                  if (ok) {
                    setQuestion("");
                    setOptions("");
                    setExpanded("");
                  }
                }}
              >
                <label className="field">
                  问题
                  <input
                    required
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="需要决定什么？"
                  />
                </label>
                <label className="field">
                  选项（每行一个，至少两个）
                  <textarea
                    required
                    rows={3}
                    value={options}
                    onChange={(e) => setOptions(e.target.value)}
                  />
                </label>
                <label className="field">
                  推荐选项序号（可选）
                  <input
                    type="number"
                    min="1"
                    value={recommendation}
                    onChange={(e) => setRecommendation(e.target.value)}
                  />
                </label>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    options.split("\n").filter((s) => s.trim()).length < 2
                  }
                >
                  创建决策
                </button>
              </form>
            )}
            {!decisions.length && expanded !== "decision" && (
              <p className="muted">暂无决策记录</p>
            )}
          </section>
          <section className="detail-section">
            <div className="section-title">
              <h3>
                活动记录 <span>{events.length}</span>
              </h3>
              <div>
                <button
                  className="text-button"
                  onClick={() =>
                    setExpanded(expanded === "checkpoint" ? "" : "checkpoint")
                  }
                >
                  + 记录进展
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    setExpanded(expanded === "artifact" ? "" : "artifact")
                  }
                >
                  + 添加成果
                </button>
              </div>
            </div>
            {expanded === "checkpoint" && (
              <form
                className="inline-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await action(
                    () =>
                      send(`/tasks/${task.id}/events`, {
                        type: "checkpoint",
                        content: checkpoint,
                        data: { ...(stage ? { stage } : {}) },
                      }),
                    "进展已记录",
                  );
                  if (ok) {
                    setCheckpoint("");
                    setStage("");
                    setExpanded("");
                  }
                }}
              >
                <label className="field">
                  阶段（可选）
                  <input
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                    placeholder="例如：接口联调"
                  />
                </label>
                <label className="field">
                  进展内容
                  <textarea
                    required
                    value={checkpoint}
                    onChange={(e) => setCheckpoint(e.target.value)}
                    rows={3}
                  />
                </label>
                <button className="primary" disabled={busy}>
                  记录进展
                </button>
              </form>
            )}
            {expanded === "artifact" && (
              <form
                className="inline-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await action(
                    () =>
                      send(`/tasks/${task.id}/artifacts`, {
                        content: artifact,
                      }),
                    "成果已记录",
                  );
                  if (ok) {
                    setArtifact("");
                    setExpanded("");
                  }
                }}
              >
                <label className="field">
                  成果链接或路径
                  <input
                    required
                    value={artifact}
                    onChange={(e) => setArtifact(e.target.value)}
                    placeholder="输入链接、路径或说明"
                  />
                </label>
                <button className="primary" disabled={busy}>
                  添加成果
                </button>
              </form>
            )}
            <div className="activity">
              {[...events].reverse().map((e) => (
                <div className="activity-item" key={e.id}>
                  <span className="activity-dot" />
                  <div>
                    <strong>
                      {(
                        {
                          created: "创建任务",
                          updated: "更新任务",
                          checkpoint: "记录进展",
                          decision_requested: "请求决策",
                          decision_resolved: "决策已解决",
                          completed: "完成任务",
                          artifact: "添加成果",
                        } as Record<string, string>
                      )[e.type] || e.type}
                    </strong>
                    <small>
                      {fmt(e.createdAt, true)}
                      {e.actor ? " · " + e.actor : ""}
                    </small>
                    {e.content && <p>{e.content}</p>}
                    {typeof e.data?.stage === "string" && (
                      <p>阶段：{e.data.stage}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
