# Agent Dashboard

在本机记录 Agent 工作的任务看板：保留待办、进行中、已完成和待决策四种业务状态，查看任务和全局时间线、检查点、结构化决策及成果。通过 MCP 与 Codex、Claude Code 等原有工作流配合；网页和 MCP 共用本地 SQLite 数据。

## 快速开始

项目声明需要 Node.js 22.13 或更新版本和 npm；当前 Windows 环境为 Node 22.15.0 / npm 10.9.2，其他平台和最低版本尚待实机验证。

```sh
npm install
npm run build
npm start
```

浏览器访问 <http://127.0.0.1:4317>。服务在当前终端运行，按 Ctrl+C 停止。默认数据为空；如需导入本项目真实开发计划，可显式运行 `npm run seed`，详情见[入门指南](docs/getting-started.md)。

## 文档

- [安装、运行、备份与故障处理](docs/getting-started.md)
- [Codex / Claude Code 接入与 Agent 工作流](docs/integrations.md)
- [验证和测试](docs/testing.md)
- [架构说明](docs/architecture.md)、[API 契约](docs/api-contract.md)
- [开发记录](docs/development-log.md)、[后续交接](docs/handoff.md)

这是一款本地个人工具，不提供账号或公网访问认证，也尚未打包原生桌面应用。MCP 不会接管已有会话或自动唤醒 Agent；停止 Agent 不等于业务任务完成。
