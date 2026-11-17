# Phase 2｜云端消费守卫、任务调度与微信通信
# Phase 2 | Cloud Spend Guard, Task Scheduling, and WeChat Communications

**状态 / Status:** SPECIFIED — NOT DEPLOYED / 规格已确定 — 尚未部署  
**更新 / Updated:** 2026-11-17  
**适用范围 / Scope:** DeepSeek Harness on Mac mini, PACS capabilities and adapters

> 这是可公开的工程规格，不是主机运行时报告；不得在此提交凭据、微信发送者 ID、真实个人数据或未脱敏的本地日志。  
> This is a public engineering specification, not a host runtime report. Never commit credentials, WeChat sender identifiers, real personal data, or unredacted local logs.

## 1. 现有 PACS 的边界 / PACS integration boundaries

保持现有 PACS 治理、能力、工作流和平台适配架构。此阶段为 DeepSeek Harness 提供独立预算守卫与通知网关，不重建 C01–C12 / W01–W05。  
Preserve the existing PACS governance, capabilities, workflows, and adapters. This phase adds independent spend and notification gateways without rebuilding C01–C12 / W01–W05.

与 [执行与模型路由设计](../../05-EXECUTION-CAPABILITY-AND-MODEL-ROUTING.md) 并存：现有文件中的云端委派本地推理是一种模式；本阶段的 adaptive 策略还支持无需先访问云端的本地优先任务入口。  
This complements the [execution and model routing design](../../05-EXECUTION-CAPABILITY-AND-MODEL-ROUTING.md): cloud-initiated local delegation remains one mode; adaptive routing must also support local-first tasks without an initial paid cloud request.

## 2. 已批准的预算 / Approved budget policy

| 时段 / Period | 本地时间 / Local time | 基础额度 / Base cap |
| --- | --- | ---: |
| 夜间 / Night | 00:00–07:00 | ¥0.50 |
| 上午 / Morning | 07:00–12:00 | ¥0.50 |
| 下午 / Afternoon | 12:00–18:00 | ¥1.00 |
| 晚间 / Evening | 18:00–24:00 | ¥0.50 |

- **每日硬上限 / Daily hard cap:** ¥2.00 (200 fen)
- **单次云端调用硬上限 / Per cloud request hard cap:** ¥0.20 (20 fen)
- **预算结转 / Rollover:** 同日只向后结转，跨日清零 / forward within the same day only
- **审批策略 / Approval strategy:** SKIP 可独立跳过的待审批步骤，不能自动批准高风险操作 / skip independent approval-gated steps without authorizing high-risk actions
- **模型策略 / Model routing:** adaptive, local-first where sufficient; remote calls only after spend admission

基础额度合计 ¥2.50，**不构成 ¥2.50 的每日消费授权**；每日 ¥2.00 始终优先。  
The base caps sum to ¥2.50; this **does not authorize ¥2.50/day**. The ¥2.00 daily hard cap always takes precedence.

推荐确定性算法（每个本地自然日）/ Recommended deterministic allowance (per local calendar day):

\`\`\`text
accrued_cap_fen = sum(base_cap_fen for periods started by request admission time)
committed_fen = settled_billable_fen + active_reservations_fen
available_fen = max(0, min(200, accrued_cap_fen) - committed_fen)
admit only if conservatively bounded_request_cost_fen <= min(20, available_fen)
\`\`\`

累计授信自动实现未用时段额度向后结转，但禁止借用未来时段额度。保留每次请求所属日期的预留记录，即使请求跨越午夜，也不得因重置而消失。  
Cumulative accrual implements forward rollover without borrowing future-period funds. Preserve the reservation's originating accounting day, including for requests crossing midnight.

费用计算以**分（整数）**保存，向上取整计费保护金额；价格与汇率版本化。不能证明请求最坏费用界限、无法获得价格或无法保证覆盖全部收费出口时，必须拒绝新的收费调用。  
Store spend in integer fen and round protective reservations upward; version price and FX inputs. Fail closed if the worst-case request cost cannot be bounded, prices are unavailable, or chargeable egress is not fully covered.

所有模型推理、收费 Web 搜索、收费工具调用及收费文件服务，共享 ¥2.00 每日额度。只有有证据证明免费的管理/心跳/遥测可归类为 non-billable；未知费用按收费未知处理，不按免费处理。  
Paid model inference, web search, tool calls, and file services share the ¥2.00 daily cap. Only proven-free management/heartbeat/telemetry is non-billable. Unknown cost is not free.

实际账单与内部预留可能不同；保守预留本身不能保证服务商账单绝不超额，除非每个外发请求都支持可执行的费用上界。建议服务商侧另设消费限额。  
Provider invoices may differ from internal reservations. A hard guarantee requires enforceable per-request cost bounds at every egress; add provider-side spend limits as defense in depth.

## 3. 审计前置条件 / Audit prerequisites

已报告的静态默认路由为 \`deepseek-official / deepseek-flash / low\`，不默认等同于 \`deepseek-chat\`。  
The reported static default route is \`deepseek-official / deepseek-flash / low\`; do not equate it with \`deepseek-chat\`.

要求先复核 \`@electron/asar\` 可靠提取结果、实际 provider 出口、Web search 独立调用、subagents、MCP 工具出网、credentials refs 解析和 Desktop/headless profile 差异。未经验证的入口不能标记已拦截。  
First verify reliable \`@electron/asar\` extraction, provider egress, independent web search egress, subagents, MCP tool traffic, credential refs, and Desktop/headless profile differences. Unverified exits are not guarded exits.

生产配置、\`app.asar\` 与现有受保护 patch 在本阶段不得无授权修改；不重启主模型，不假设本地推理服务已安装。  
Do not edit production configuration, \`app.asar\`, or protected patches without authorization. Do not restart the primary model or assume local inference is installed.

## 4. 微信通信网关 / WeChat communication gateway

**能力 / Mode:** 双向通知、只读状态查询、受控任务提交 / outbound notifications, read-only status, and permission-checked task submission.

**通知 / Notification cadence:** P0/P1 即时发送；完成通知合并；普通进度批量汇总；心跳只记录。/ P0/P1 immediate; aggregate completions; summarize routine progress; record heartbeats without spam.

**文件 / Delivery:** 支持附件及有身份验证、短时效的 HTTPS 下载链接；不把本机文件路径当成可下载 URL。/ Support attachments and authenticated expiring HTTPS download links; a local file path is not a downloadable URL.

所有模型和任务只调用同一个消息接口，实际微信凭据仅由受控连接服务持有。白名单身份认证、命令白名单、速率限制、去重和持久化重试必须在网关实现。  
All models and tasks use one message interface; only the controlled connector holds WeChat credentials. The gateway enforces sender allowlists, allowed commands, rate limits, deduplication, and durable retry.

简单命令 \`/status\`, \`/tasks\`, \`/budget\`, \`/summary\`, \`/help\` 使用确定性查询及模板，不应为了状态汇报消耗模型 Token。  
Simple commands use deterministic database reads and templates, rather than consuming inference tokens to report status.

## 5. 本地任务与审批 / Local tasks and approvals

任务应持久化目标、依赖、当前步骤、生成文件、重试次数、阻塞原因和验收证据。模型声明完成不等于文件验收通过。  
Persist objectives, dependencies, current step, files, retry counts, blockers, and acceptance evidence. A model's completion claim is not artifact acceptance.

SKIP 表示跳过需额外审批的可选步骤、继续独立步骤；不能借此执行付款、对外发送、重要删除或安全设置修改。  
SKIP means bypass optional approval-dependent steps and continue independent work; it never authorizes payment, external communication, important deletion, or security-setting changes.

## 6. Model Adapter 与 Adaptive Router / 模型适配层与自适应路由

详细规格见 [Model Adapter & Adaptive Router](MODEL-ADAPTER-AND-ADAPTIVE-ROUTER-SPEC.md)；针对现有 DSH Provider 和云端前路由入口的专项审计任务见 [Provider Extension Audit Handoff](PROVIDER-EXTENSION-AUDIT-HANDOFF.md)。  
See the [Model Adapter & Adaptive Router specification](MODEL-ADAPTER-AND-ADAPTIVE-ROUTER-SPEC.md) and the [targeted Provider Extension Audit Handoff](PROVIDER-EXTENSION-AUDIT-HANDOFF.md).

本阶段采用**一个确定性路由策略、多个模型适配器**。保留现有 DeepSeek Provider；本地首个适配器优先通过受限 MCP stdio Bridge 调用 Ollama。只有源码审计证明 DSH 存在稳定、安全且不需修改 app.asar 的 Provider 扩展点，才考虑原生 Provider Adapter。  
Use **one deterministic routing policy and multiple model adapters**. Preserve the existing DeepSeek provider; the first local adapter uses a restricted MCP stdio bridge to Ollama. Consider a native DSH provider adapter only if source audit proves a stable, safe extension point that does not require editing app.asar.

必须区分两种模式：

1. **Local-first：** 在首次付费云端请求前，由任务入口根据已验收能力和策略选择本地模型。若 DSH 没有安全的 pre-provider hook，则在 PACS 任务入口/调度层实现，不得把云端发起的 MCP 调用冒充为 local-first。
2. **Cloud-initiated delegation：** 云端会话发起 MCP 本地推理调用。它可减少特定子任务的云端处理量，但初始云端请求已经发生，不能宣称避免了该请求的费用。

本地模型故障、超时或输出不合规时，禁止静默回退云端。任何云端回退必须显式允许，并先通过同一 Budget Guard 预留；未知费用或未覆盖的出口一律 fail closed。模型不得批准自己的路由、预算、权限或审批。

The router must distinguish local-first dispatch before any paid request from cloud-initiated MCP delegation. Local failure never silently falls back to cloud; any explicitly permitted cloud fallback must first pass the shared Budget Guard. A model cannot approve its own route, budget, permissions, or approvals.

## 7. 实施顺序与验收 / Implementation order and acceptance

1. 复核实际出网和权限路径，保留 \`PASS / PARTIAL / NOT_TESTED / BLOCKED\` 证据。 / Verify actual egress and permissions with evidence.
2. 用模拟请求实现并测试 spend guard、事务预留和账本；优先零收费测试。 / Implement and test guard, transactional reservations, and ledger with mock requests.
3. 完成 [Provider Extension Audit](PROVIDER-EXTENSION-AUDIT-HANDOFF.md)，确认 Provider 注册、流式契约、重试/重放、usage meter、pre-cloud hook 与 Desktop/headless 差异；不得先假设扩展点存在。 / Audit provider registration, streaming, retries/replay, usage meter, pre-cloud hook, and profile differences.
4. 固定 Model Adapter 契约；在隔离目录用 mock 测试本地 MCP stdio Bridge，不接生产配置。 / Freeze the adapter contract and test the local MCP stdio bridge with mocks in isolation.
5. 审计并实现唯一 Adaptive Router；local-first 必须在首次云端请求之前发生；云端主动委派作为独立模式。 / Audit and implement one Adaptive Router; local-first must happen before the first cloud request.
6. 接入可恢复任务队列；验证超时、取消、重启恢复和无静默云端回退。 / Integrate a recoverable task queue and test timeout, cancellation, restart recovery, and no silent cloud fallback.
7. 审计现有微信机器人，复用真实连接；验证发送者和附件能力。 / Audit the existing WeChat connector and verify sender identity and attachments.
8. 接入模板，完成端到端验收后再部署。 / Integrate templates and deploy only after end-to-end acceptance.

验收用例参见 [Phase 2 tests](../../../tests/PHASE2-ACCEPTANCE.md)，预算配置示例参见 [policy example](../../../templates/CLOUD-SPEND-POLICY.example.json)。这些文件是设计资产，**未声明部署或实际功能 PASS**。  
See [Phase 2 tests](../../../tests/PHASE2-ACCEPTANCE.md) and [policy example](../../../templates/CLOUD-SPEND-POLICY.example.json). These are design assets and **do not claim deployed or runtime PASS**.
