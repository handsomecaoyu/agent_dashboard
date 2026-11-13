# 接入 Codex 与 Claude Code

Agent Dashboard 提供 MCP 工具供原有客户端主动调用。配置 MCP 不会接管已经存在的桌面会话，也不会在后台持续唤醒 Agent。请先按[入门指南](getting-started.md)构建并启动服务；一个看板和多个客户端应指向同一数据目录。连接仅用于本机，服务没有账户系统或面向公网的认证，请勿直接暴露到网络。

## HTTP：推荐先尝试

在运行 `npm start` 的机器上，默认 MCP 地址为 `http://127.0.0.1:4317/mcp`。在另一终端注册：

```sh
codex mcp add agent-dashboard --url http://127.0.0.1:4317/mcp
codex mcp list
```

Claude Code：

```sh
claude mcp add --transport http agent-dashboard http://127.0.0.1:4317/mcp
claude mcp get agent-dashboard
```

配置被写入并不等于连接成功。查看客户端状态并在新会话中要求列出任务；若失败，先确认本地服务正在运行以及端口正确。Claude Code 可在会话中用 `/mcp` 检查状态。客户端的配置范围、审批和刷新行为以各自版本为准。

## stdio：客户端启动桥接进程

stdio 进程通过本机 HTTP 服务访问同一数据，因此仍须先运行 `npm start`。先执行 `npm run build`。将下面的占位路径替换为构建后 `dist/server/mcp.js` 的绝对路径；包含空格时保留引号。

```sh
codex mcp add agent-dashboard-stdio -- node "<项目绝对路径>/dist/server/mcp.js"
claude mcp add --transport stdio agent-dashboard-stdio -- node "<项目绝对路径>/dist/server/mcp.js"
```

客户端配置样例见 [examples](../examples/)。不要同时为同一个会话启用两种传输，避免工具重复。stdio 的标准输出留给 MCP 协议；诊断信息写入标准错误。自定义端口时桥接进程可设置 `PORT` 或 `DASHBOARD_URL`，并须与服务地址一致；具体配置见入门指南。

## 工作流程

1. 先 `list_tasks`，必要时 `create_task`，保存返回的任务 ID，并在协作者之间传递；目前没有父子任务字段。
2. `update_task` 设为 `in_progress`；每一阶段用 `add_checkpoint` 记录证据，并更新 `summary` 和 `nextStep`。
3. 必须由用户决定时，调用 `request_decision`，提供选项与建议。每个任务同时只能有一个未解决的决策。用户选择后调用 `resolve_decision` 并明确恢复状态；恢复状态不会自动唤醒暂停的 Codex 或 Claude 会话，主 Agent 需在下一轮读取决策后继续。
4. 用 `add_artifact` 记录成果；验证交付后才调用 `complete_task`。停止 Agent、交接或断线不代表完成。

`sessionRef` 只是手动记录的会话引用；任务列表不会自动发现或显示宿主会话。项目内的 [工作流 skill](../integrations/skills/agent-dashboard/SKILL.md) 可按客户端支持的方式自行使用；仓库不会自动安装到个人技能库。具体参数及返回值以服务公布的工具 schema 和 [API 契约](api-contract.md) 为准。

官方配置参考：[Codex MCP](https://developers.openai.com/codex/mcp)、[Claude Code MCP](https://code.claude.com/docs/en/mcp)。本项目当前环境未验证真实 Codex 或 Claude Code 客户端；SDK 协议测试不能替代客户端验收。
