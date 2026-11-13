# 安装与使用

## 环境

项目声明需要 Node.js 22.13 或更新版本及 npm；最低版本尚未实机验证。当前 Windows 环境为 Node 22.15.0 / npm 10.9.2；macOS、Linux 尚待实机验证。先运行 `node --version` 和 `npm --version` 检查版本。

在项目根目录安装、构建并运行：

```sh
npm install
npm run build
npm start
```

这些命令适用于 Windows PowerShell、macOS 和 Linux 的常用 shell。浏览器访问 <http://127.0.0.1:4317>；保持服务终端开启，Ctrl+C 停止。首次启动默认为空看板，不自动生成虚构业务数据。

## 开发模式

```sh
npm run dev
```

开发模式同时运行后端和 Vite；以终端显示的 Vite 地址打开界面。修改代码后可运行 `npm run typecheck`、`npm test` 和 `npm run build`。生产模式使用构建结果和单个本地服务。

## 自选导入开发计划

在项目根目录运行 `npm run seed` 可显式导入 `fixtures/development-tasks.json` 中本项目的开发计划。它是计划快照，初始状态不代表实际开发进度；查看 [开发记录](development-log.md) 了解实际状态。默认不会运行该命令；相同内容通过指纹避免重复导入，修改条目内容后可能产生新任务。

## 数据与备份

数据库文件名为 `dashboard.sqlite`。默认目录：

| 系统 | 目录 |
| --- | --- |
| Windows | `%LOCALAPPDATA%\AgentDashboard`；未设置时为用户目录下 `AppData\Local\AgentDashboard` |
| macOS | `~/Library/Application Support/AgentDashboard` |
| Linux | `$XDG_DATA_HOME/agent-dashboard`；未设置时为 `~/.local/share/agent-dashboard` |

可在启动前设置 `DATA_DIR`。例如，Windows PowerShell：

```powershell
$env:DATA_DIR = "<本地数据目录的绝对路径>"
npm start
```

macOS / Linux shell：

```sh
export DATA_DIR="<本地数据目录的绝对路径>"
npm start
```

运行 `npm run seed` 时使用相同的 `DATA_DIR`。该变量仅影响设置它的进程及其子进程。请避免将活动中的 SQLite 文件放入云同步目录。停止服务和所有相关进程后，复制整个数据目录到安全位置作为备份；恢复时先停止所有相关进程，再将备份恢复到所选数据目录，启动后检查任务。不要在数据库仍有写入时只复制主数据库文件：SQLite 可能还有 WAL 等关联文件。测试应使用独立临时目录，绝不指向真实数据。

服务绑定本机 `127.0.0.1`；环境变量 `PORT` 可覆盖默认的 `4317`。例如 PowerShell 使用 `$env:PORT = '4318'`，macOS / Linux 使用 `export PORT=4318`，然后启动服务并在浏览器、MCP 配置中使用同一端口。stdio 桥接默认读取 `PORT`，也可通过 `DASHBOARD_URL` 指向 loopback HTTP 地址；客户端进程须继承相应环境变量。

## 排查

- 页面打不开：确认服务启动成功、访问正确端口；端口占用时先检查占用进程，不要盲目结束其他应用。
- 页面为空：确认使用同一个 `DATA_DIR`，默认空库属于正常情况。检查浏览器控制台及服务终端错误。
- MCP 不可用：确认服务运行、地址一致、客户端允许并启用该工具；stdio 使用构建后的绝对路径。详见[接入指南](integrations.md)。
- 数据库无法写入：检查目标目录权限和磁盘空间；先备份再排查，避免多个不兼容进程直接操作同一数据库。

不要把此无账号的本地服务直接暴露到公网。当前未提供原生应用安装包；跨平台和真实宿主客户端验证状态见[测试说明](testing.md)。
