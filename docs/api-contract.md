# API 契约 v1（待实施）

本契约用于并行实施；如实现发现问题，应协调调用方并同步修订，不能把本文当成已经运行的服务。

## 数据

`Task`：`id`, `title`, `description`, `status`, `priority`, `assignee`, `summary`, `nextStep`, `sessionRef`, `plannedStart`, `plannedEnd`, `startedAt`, `completedAt`, `createdAt`, `updatedAt`。状态为 `todo | in_progress | done | decision`，优先级为 `low | medium | high`。`summary`、`nextStep`、`sessionRef` 可以为 `null`；时间使用 ISO 8601 字符串，未提供的计划/实际时间为 `null`。ID 为字符串。

`TaskEvent`：`id`, `taskId`, `type`, `actor`, `content`, `data`, `createdAt`；类型为 `created | updated | checkpoint | decision_requested | decision_resolved | completed | artifact`。`actor` 是可空的操作者标识，`data` 是 JSON 对象。每次状态改变的事件在 `data` 中保存 `fromStatus` 与 `toStatus`；checkpoint 的 `data` 可包含 `stage`、`nextStep`。事件按真实发生顺序保存，创建事件保存初始状态，故可重建状态时间段；尚无结束时间的段保持开放。

`Decision`：`id`, `taskId`, `question`, `options`、`recommendation`, `status`, `answer`, `createdAt`, `resolvedAt`。`options` 是 `{id, label, description?}` 数组；`recommendation` 与 `answer` 为选项 ID 或 `null`，状态为 `pending | resolved`，未解决的 `resolvedAt` 为 `null`。选择答案必须对应选项 ID；决策独立存储，不要求界面解析事件文本。

## HTTP

| 方法与路径 | 用途 |
| --- | --- |
| `GET /api/tasks` | 任务列表；可选 `status`、`search`、`assignee` 查询参数 |
| `POST /api/tasks` | 创建任务 |
| `GET /api/tasks/:id` | 单个任务 |
| `PATCH /api/tasks/:id` | 更新允许修改的字段 |
| `GET /api/tasks/:id/events` | 任务事件 |
| `POST /api/tasks/:id/events` | 追加 checkpoint 或 artifact，不接受决策事件 |
| `GET /api/tasks/:id/decisions` | 读取任务决策 |
| `GET /api/decisions` | 全局决策列表；可选 `taskId`、`status`（`pending` 或 `resolved`）查询参数，未指定时返回全部 |
| `POST /api/tasks/:id/decisions` | 创建结构化决策并进入待决策 |
| `POST /api/decisions/:id/resolve` | 提交选项 ID 和显式恢复状态 |
| `POST /api/tasks/:id/complete` | 明确完成任务 |
| `POST /api/tasks/:id/artifacts` | 记录成果 |
| `GET /api/events` | 全局事件时间线 |
| `GET /api/stream` | SSE 变更通知；客户端重新拉取数据 |

成功返回 JSON 对象或数组；`GET /api/tasks/:id` 返回 Task，事件和决策单独读取。错误为 `{ "error": { "code": "...", "message": "..." } }`，使用适当 HTTP 状态；MCP 错误保留相同 code 和 message。创建、状态转换及决策操作与其事件在同一事务内提交。服务负责校验字段，不允许客户端覆盖 ID 或创建时间；并发修改由统一事务或乐观版本控制处理。

请求体约定（`actor` 可选）：

- 创建任务：`{title, description?, priority?, assignee?, plannedStart?, plannedEnd?, summary?, nextStep?, sessionRef?, actor?}`；PATCH 使用这些可修改字段和可选 `status`，状态仅允许 `todo` 或 `in_progress`。完成与决策必须走专用接口。
- checkpoint：`{type:'checkpoint', content, data?:{stage?, nextStep?}, actor?}`；通用事件接口也接受 artifact，但不接受决策事件。
- 创建决策：`{question, options:[{id,label,description?}], recommendation?, actor?}`。解决决策：`{answer, resumeStatus, actor?}`，`answer` 是选项 ID，`resumeStatus` 只能为 `todo` 或 `in_progress`；完成须另行明确操作。
- 完成：`{content?, actor?}`。成果：`{content, actor?, data?}`，内容可为链接或路径文本，服务不读取该文件。

事件按 `createdAt` 及内部递增顺序排列。变更接口返回产生或修改的实体，列表返回数组。日期及可空字段可明确传入 null。

## MCP

拟提供 `list_tasks`、`get_task`、`create_task`、`update_task`、`complete_task`、`add_checkpoint`、`request_decision`、`resolve_decision`、`list_decisions`、`add_artifact`、`list_events`。`list_tasks` 支持可选 `status`、`search`、`assignee`；`list_decisions` 支持可选 `taskId` 和 `status`，未指定时返回全部。官方 SDK 负责工具定义、参数校验和协议；stdio 的 stdout 只输出协议数据。工具与 HTTP 调用共享业务逻辑。

请求决策进入 `decision`；解决决策须显式指定恢复状态。仅明确完成时进入 `done` 并记录 `completedAt`；重新打开须清除该时间。Agent 停止或工具连接关闭不得自动完成任务。
