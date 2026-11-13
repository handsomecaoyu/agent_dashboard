# 测试与验收

2026-11-13 依赖审计：Vite 由 6.3.5 更新为 6.4.6，Zod 由 3.25.76 更新为 4.6.7 后，`npm audit` 返回零漏洞；Windows Node 22.15 上 typecheck、3 项自动测试和构建通过。审计结果反映当次数据库状态，不代替持续更新。

在项目根目录运行：

```sh
npm run typecheck
npm test
npm run build
```

自动测试应使用隔离的临时数据库，不能连接或清空用户真实数据。协议测试使用 MCP SDK 客户端时，能验证协议握手和工具调用，但不能证明 Codex 或 Claude Code 已安装、已授权或能在真实会话中调用。

## 生产服务综合验收

`tests/acceptance/production.mjs` 会创建任务和决策并改变状态，**不要对真实数据运行**。每次使用新的空目录，否则旧验收任务可能影响筛选断言。先构建；在一个 PowerShell 终端启动隔离服务：

```powershell
npm run build
$env:DATA_DIR = Join-Path $env:TEMP ("agent-dashboard-qa-" + [guid]::NewGuid())
$env:PORT = '4398'
npm start
```

保持服务运行，在项目根目录的另一个 PowerShell 终端运行：

```powershell
$env:PORT = '4398'
node tests/acceptance/production.mjs
```

macOS / Linux 第一个终端可用以下命令创建全新隔离目录并启动：

```sh
npm run build
export DATA_DIR="$(mktemp -d)"
export PORT=4398
npm start
```

第二个终端在项目根目录执行 `PORT=4398 node tests/acceptance/production.mjs`。脚本检查生产首页及资源、SDK 的 HTTP 和构建后 stdio、筛选、日期校验、决策冲突及事件顺序；它本身不验证服务重启或浏览器交互。完成后停止隔离服务，确认目录后自行清理验收数据。

## 人工验收

1. 构建并运行服务，在浏览器创建任务；检查四种状态、筛选、任务详情、全局及任务时间线。没有时间的数据不得被显示成虚构日期。
2. 执行 checkpoint、请求决策、选择选项并恢复任务；检查状态、事件与摘要。确认同一任务不能同时存在两个 pending 决策。恢复状态不会唤醒暂停的客户端会话；下一轮需主动读取决策。完成任务后重启服务，检查数据持久化。
3. 分别在实际安装的 Codex 和 Claude Code 中配置 HTTP 或 stdio；检查工具列表，再以非敏感测试任务执行创建、检查点、决策和完成。记录客户端版本、系统、命令和结果。不要把服务端测试称为客户端验收。
4. 在 Windows、macOS、Linux 分别验证安装、构建、服务、浏览器、路径和备份恢复；未运行的平台明确标记为未验证。

测试失败时记录具体命令、版本、错误与未覆盖范围。`docs/development-log.md` 保存实际验证结果；不要把计划或模拟结果记为通过。

目前 Windows 上类型检查、构建和 3 项自动测试通过；隔离生产服务综合验收通过，种子首次导入 5 条、再次导入 0 条，独立子进程重启后已完成状态保留。浏览器已回归 UTC+8 下日期保存往返，以及 390×844 下单列看板、详情抽屉、任务表单入口和时间线横向滚动。真实 Codex、Claude Code 宿主及 macOS、Linux 实机仍待验收。三系统 CI 配置不等于已运行通过，具体最终测试记录见开发日志。

## GitHub Actions verification

For code commit `d822350c3aa19f598e1a0cd40b4b5f75c1f7d8a3`, [CI run 43449873249](https://github.com/handsomecaoyu/agent_dashboard/actions/runs/43449873249) passed npm ci, typecheck, tests, and build on Ubuntu, Windows, and macOS. These are headless CI checks; they do not establish interactive UI behavior on non-Windows hosts. The Windows host UI was checked separately as described above.

