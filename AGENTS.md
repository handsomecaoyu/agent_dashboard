# 项目协作约定

- 主 Agent 负责明确要求、协调和验收；实施优先由 subagent 完成，优先使用 gpt-6.1-terra，必要时使用 gpt-6.1-sol。gpt-6-astra 当前负责执行环境和 Git 故障排查。
- 持续记录任务、阶段、决策与验证结果；只记录真实发生的时间与状态，不把 Agent 停止等同于任务完成。
- 业务状态与 Agent 运行状态分开。用户继续在原客户端工作；MCP 不会自动接管其他会话。
- 保持跨平台、本地优先，保护用户已有文件和数据。不得修改 ACL、强推或绕过权限。
- 接口见 `docs/api-contract.md`，架构与进度见 `docs/architecture.md`、`docs/development-log.md` 和 `docs/handoff.md`。接口变更须同步更新实现、调用方和文档。
