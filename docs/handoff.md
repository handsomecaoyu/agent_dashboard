# 项目交接

## 产品和边界

Agent Dashboard 是本地个人任务看板和 MCP 服务。任务有 `todo`、`in_progress`、`done`、`decision` 四态；时间线区分计划与实际，缺失时间不应捏造。结构化决策需要选项、用户选择及明确的恢复状态。Agent 停止不等于任务完成。没有账号或公网认证，不应直接暴露到网络；尚无原生应用安装包。

## 源码与文档

- `src/server`：HTTP、SQLite、MCP 与 seed；`src/shared`：共享类型；`src/web`：界面。
- `docs/architecture.md`、`docs/api-contract.md` 是架构和接口说明，变更实现时同步维护；`docs/development-log.md` 记录实际进度和验证。
- `docs/getting-started.md`、`docs/integrations.md`、`docs/testing.md` 面向使用和验收；`examples/` 提供客户端配置模板，`integrations/skills/agent-dashboard/` 是仓库内工作流资料，不会自动安装个人 skill。
- `fixtures/development-tasks.json` 为可选的本项目开发计划；默认空库，`npm run seed` 才导入。它的初始状态不是实际进度。

## 运行与数据

从仓库根目录 `npm install`、`npm run build`、`npm start`。默认监听 `127.0.0.1:4317`，HTTP MCP 为 `/mcp`；stdio 入口 `dist/server/mcp.js` 桥接同一运行中的服务。使用 `PORT`、`DATA_DIR` 调整端口和数据目录，stdio 也可使用 loopback `DASHBOARD_URL`。数据库默认在用户应用数据目录，见入门指南；不要将真实数据库提交到仓库或在测试中使用。

当前开发自用数据使用 Windows `%TEMP%\agent-dashboard-live\dashboard.sqlite`，运行服务时 `DATA_DIR` 指向其所在目录，并非默认用户数据目录。临时目录可能被系统清理；需要保留时应停止相关进程，备份并迁移整个目录至持久位置，再设置 `DATA_DIR` 为新位置并验证。若继续使用当前副本，重启时应设置 `DATA_DIR` 为原目录。

## 待后续验证与维护

- 检查开发记录中的最终构建、类型检查、自动测试及浏览器验收结果；SDK 客户端协议测试不等于真实宿主客户端测试。
- 在已安装的 Codex、Claude Code 中分别验收所选传输，记录版本和结果；当前环境未验证这两个宿主。
- 在 macOS、Linux 和 Node 最低声明版本 22.13 上实机验证；现有 Windows 环境为 Node 22.15.0 / npm 10.9.2。
- 测试独立目录的备份和恢复，核实服务和客户端指向同一数据。
- 保持接口、示例、skill 与真实实现同步；不要虚构 parent 字段或以进程停止推断业务完成。

远端持久化及确切交付状态以开发记录和 GitHub 仓库为准；不要修改 Git 权限或绕过仓库保护。
