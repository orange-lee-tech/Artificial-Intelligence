# PACS 架构说明

## 1. 逻辑架构

Human Owner → Task Envelope → Workflow → Capability / Skill → Agent + Harness → Tools / External Systems → Evidence + Result Envelope → State Store / Handoff。

Constitution 横向约束所有层；Capability Contract 约束能力接口；Adapter 负责平台差异。

## 2. 分层职责

- Governance：宪章、权限、自主等级、数据保护、事实标准和变更控制。
- Contract：统一任务输入、能力元数据、结果输出和验收标准。
- Capability：可独立调用的原子职责。
- Workflow：能力之间的顺序、条件分支、并行关系、失败路径和人工检查点。
- Adapter：映射平台提示入口、文件结构、工具接口、运行循环、记忆和权限机制。
- Runtime：模型、Agent、Harness、MCP、API、CLI、浏览器、Git 和本地系统。
- State Store：项目状态、决策、证据索引、任务结果、能力版本和交接文档。

## 3. 任务生命周期

INTAKE → CONTEXT → MODEL → PLAN → ROUTE → EXECUTE → VERIFY → PERSIST

任务状态：NEW、READY、RUNNING、BLOCKED、REVIEW_REQUIRED、COMPLETED、VERIFIED、ACCEPTED、ARCHIVED。

工程证据标签：CODE、LOCAL_TEST、CI、PROD、DEVICE。它们不是任务状态，必须附证据来源、时间和范围，不能相互推断。

## 4. 执行拓扑

### 单 Agent
目标明确、工具少、风险低时，一个 Agent 顺序调用多个能力。

### Planner + Executor + Auditor
复杂交付采用规划、执行、独立审计角色。资源有限时可由同一模型分阶段承担，但审计必须重新检查证据，而非复述执行过程。

### Human-in-the-loop
涉及外部副作用、生产发布、付款、敏感数据或不可逆操作时，人类批准必须成为执行前流程节点。

## 5. 并发与写入

- 每个任务批次明确主写入者。
- 多 Agent 可并行只读研究；共享文件写入必须串行或分支隔离。
- 合并前检查差异、冲突、测试和授权。
- 重要变更保留回滚路径。
- 避免多个 Agent 同时维护同一份当前状态。

## 6. 记忆与上下文

- Session Context：当前任务临时上下文。
- Project Context：项目目标、约束、架构和状态。
- User Profile：稳定协作偏好。
- Capability Assets：可复用技能与流程。
- Evidence Store：来源、日志、测试、文件和决策证据。

只将稳定且有后续价值的信息提升为长期资产。优先记录结论、约束、决策、来源和状态，不复制无差别聊天全文。

## 7. 迁移策略

1. 导入 Constitution 和 User Profile。
2. 导入 Capability Contract 与能力目录。
3. 导入必要的原子 Skills。
4. 根据目标平台创建 Adapter。
5. 运行一致性测试。
6. 记录通过、部分通过、不支持和未测试能力。
7. 再导入领域工作流和项目上下文。

成功标准是不同平台保持相同目标理解、边界、证据纪律、输出契约和验收逻辑，而不是 UI 或提示词完全相同。
