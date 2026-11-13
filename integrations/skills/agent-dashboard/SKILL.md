---
name: agent-dashboard
description: 使用 Agent Dashboard MCP 记录多阶段工作、检查点、需要用户决定的问题和最终成果；适用于用户要求在看板中跟踪任务或团队约定使用该看板时。
---

# Agent Dashboard 工作流

使用已配置的 Agent Dashboard MCP 工具；不可用时如实告知用户并继续能独立完成的工作，不要假称记录成功。不要为一次简单操作无故创建任务。

1. 先调用 `list_tasks` 查找相关任务；存在时用 `get_task` 查看，避免重复。没有合适任务时用 `create_task` 创建，保存返回的 task ID。将它传给参与同一工作的子 Agent；不要虚构父子任务关系。
2. 开始实际工作时用 `update_task` 设置 `in_progress`。每个有意义的阶段完成后调用 `add_checkpoint`，并用 `update_task` 更新 `summary`（已完成的事实）与 `nextStep`（可执行的下一步）。只记录真实结果和已验证事实。
3. 必须由用户选择时用 `request_decision` 提供明确问题、选项及适当的建议；不要代替用户选择。每个任务只能有一个待解决决策。收到决定后用 `resolve_decision` 记录所选选项及恢复状态；这不会自动唤醒暂停的会话，主 Agent 应在下一轮读取决策再继续。
4. 用 `add_artifact` 记录可核实的成果链接或路径；不要记录密钥。交付前检查成果和适当的测试，将结果与未解决问题写入摘要。只有任务确实完成时才调用 `complete_task`；会话停止、交接或工具断开不代表完成。
5. 新会话先读任务、事件与未解决的决定，再继续；不要根据陈旧摘要推测已完成。

工具参数以当前服务公布的 schema 和仓库 `docs/api-contract.md` 为准。遇到写入错误不要声称已更新；避免重试非幂等创建操作，先查询是否已保存。
