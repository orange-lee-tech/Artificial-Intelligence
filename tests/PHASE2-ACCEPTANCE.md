# 第二阶段验收矩阵｜Phase 2 Acceptance Matrix

**状态 / Status:** TEST PLAN — NOT EXECUTED / 测试计划 — 尚未执行  
**适用 / Scope:** Cloud Spend Guard, Adaptive Router, Task Scheduler, WeChat gateway

测试必须使用模拟收费服务和隔离状态库，除非另有明确生产测试授权。对外发信与生产写入不得作为默认测试动作。  
Use a mock billing provider and an isolated state database. No real paid tests, external communications, or production writes without explicit authorization.

| ID | 测试 / Test | 必须观察到 / Required outcome |
| --- | --- | --- |
| B01 | 00:00–07:00 夜间 ¥0.50 / Night cap | 已预留加已结算不超过 50 分 / Reserved plus settled <= 50 fen |
| B02 | 上午预算结转 / Morning carryforward | 夜间未用额度只向后累加 / Unused night allowance accrues forward only |
| B03 | 下午基额 ¥1.00 / Afternoon base | 未使用预算可结转，累计不可越过每日 200 分 / Rollover but never more than daily 200 fen |
| B04 | 晚间基额与每日截断 / Evening base and daily clipping | 名义时段额度合计 250 分，日内累计仍最多 200 分 / 250-fen nominal periods clipped at 200-fen day cap |
| B05 | 单次最大 20 分 / Request cap | 预计最坏费用 21 分必拒绝 / Worst-case cost 21 fen denied |
| B06 | 并发 2 Agent / Concurrency | 原子预留无超额 / Atomic reservations prevent overspend |
| B07 | API 超时与未知账单 / Timeout and unknown bill | 不释放未知费用的预留 / Do not release uncertain reservations |
| B08 | 服务重启与崩溃恢复 / Crash recovery | 所有未决预留可恢复 / Pending reservations survive restart |
| B09 | 跨越午夜 / Midnight crossing | 旧请求预留归属原日，零点不自动释放 / Prior-day request reservations persist |
| B10 | 价目表/汇率未知 / Unknown price or FX | fail closed / 拒绝新收费请求 |
| B11 | 搜索/收费工具 / Search and paid tools | 统一计入日预算 / Shared daily ledger |
| B12 | 仅免费遥测 / Proven free telemetry | 独立 non-billable 记录 / Separate non-billable ledger |
| B13 | Subagent/MCP/重试 / Subagents, MCP, retry | 不能绕过统一闸门 / No uncontrolled paid egress |
| B14 | Desktop/headless / 桌面与无头模式 | 两条路径均实测覆盖或标 BLOCKED / Both verified or clearly blocked |
| M01 | 本地优先 / Local-first | 无必要的云端首轮调用 / No unnecessary initial cloud call |
| M02 | 本地模型缺失 / Local runtime absent | 等待或阻塞，不能偷用收费云端 / Queue/block without unapproved cloud fallback |
| T01 | 审批 SKIP / Skip approvals | 跳过可选项，阻塞依赖项 / Skip optional steps and block dependent ones |
| T02 | 断点续跑 / Resume | 重启后保留进度与产物 / Preserve checkpoints and artifacts |
| W01 | 微信发送者白名单 / Sender allowlist | 非授权身份无法下达任务 / Unauthorized senders cannot submit tasks |
| W02 | 微信主动通知 / Proactive notification | 有实际送达证据 / Verified delivery evidence |
| W03 | 状态查询零 LLM / Template status reply | 简单指令不产生模型调用 / Simple queries avoid inference |
| W04 | 断线重试和去重 / Outbox recovery | 持久化、重试、去重 / Durable retries and deduplication |
| W05 | 附件和链接 / File delivery | 文件真实可访问；短效认证链接 / Real attachment or expiring authenticated URL |
| W06 | 消息源身份标记 / Origin labeling | 模型与系统来源可审计 / Source identity is auditable |

## 验收证据 / Evidence requirements

每项记录版本、配置（脱敏）、测试输入、预期与实际、命令或调用记录、异常与最终状态。只允许 `PASS / PARTIAL / NOT_TESTED / BLOCKED / FAIL`，没有日志或实测结果时不得标 PASS。  
Record version, redacted config, inputs, expected and actual outcomes, call logs, errors, and final status. Use only `PASS / PARTIAL / NOT_TESTED / BLOCKED / FAIL`; absent runtime evidence is not PASS.

## 静态配置检查 / Static policy checks

- 基础额度为 50/50/100/50 分，日限额 200 分，单次 20 分。/ 50/50/100/50 fen; daily 200 fen; per-request 20 fen.
- 配置中的时区只是示例值，应通过目标 Mac 实际系统时区确定后才部署。/ Example timezone must be replaced with verified host timezone.
- JSON Schema 校验只能证明配置结构合规，无法证明动态预算、并发、出口覆盖或实际计费正确。/ JSON Schema alone cannot prove dynamic budgeting, concurrency, egress coverage, or billing accuracy.
- 在全部收费出口可验证之前，声明 `BLOCKED`，不得声称已建立全局硬锁。/ Until all paid egress is verifiably controlled, mark the hard lock `BLOCKED`.
