# PACS Model Adapter & Adaptive Router Specification
# PACS 模型适配层与自适应路由规格

**Version:** 0.1.0  
**Status:** SPECIFIED — NOT IMPLEMENTED / 规格已确定 — 尚未实现  
**Updated:** 2026-11-17  
**Scope:** PACS on DeepSeek Harness Desktop, Mac mini M4  
**Related:** [Phase 2 workstation specification](PHASE2-CLOUD-WORKSTATION-SPEC.md), [execution and model routing design](../../../05-EXECUTION-CAPABILITY-AND-MODEL-ROUTING.md), [local model selection](LOCAL-MODEL-SELECTION-2026-11-15.md)

> This is an engineering specification, not evidence of installation, runtime integration, or successful routing. Do not infer that a provider extension point is available until the targeted DSH source audit is complete.
>
> 本文件是工程规格，不代表已安装、已集成或已通过运行时验收。DSH Provider 扩展点须经专项源码审计确认后才能采用。

## 1. Decision summary / 决策摘要

PACS adopts a **single routing policy with multiple model adapters**. DeepSeek Harness remains the local agent host and tool-execution authority. The project does not clone Claude Code, install DeepClaude, or introduce a second autonomous agent framework.

- **Cloud adapter:** preserve the existing DeepSeek provider and its credential-reference path. Do not replace the configured provider/model or assume the model is \`deepseek-chat\`; the prior audit reported \`deepseek-official / deepseek-flash / low\`, which must be re-read from the live host before implementation.
- **Local adapter:** first integrate the selected Ollama model through the existing DSH MCP client and a narrowly scoped stdio bridge. A native DSH provider adapter is an alternative only if the provider-extension audit proves it can be added without patching \`app.asar\` or bypassing the budget and permission layers.
- **Adaptive Router:** make a deterministic routing decision before the first paid cloud request for local-first tasks. A cloud model calling an MCP local-inference tool is a separate, cloud-initiated delegation mode; it does not avoid the cost of the initial cloud request.
- **One policy owner:** the router must not duplicate the Budget Guard, tool policy, task queue, or existing Kanban. It consumes their contracts.
- **Fail closed:** local failure must not silently trigger a paid cloud fallback. A cloud fallback requires an explicit route policy and a successful Budget Guard reservation.

PACS adopts the useful architectural lesson from model-agnostic coding agents—separate the agent/tool orchestration from the inference backend—without copying leaked or third-party source code.

## 2. Target architecture / 目标架构

\`\`\`text
User / WeChat / scheduled task
             |
             v
       Task ingress
             |
             v
  Task contract + policy checks
             |
             v
    Adaptive Router (one)
       /       |        \\
      /        |         \\
     v         v          v
Deterministic  Local      Cloud route
tools          adapter   (Budget Guard first)
               |             |
               v             v
        MCP stdio bridge   Existing DSH
               |           DeepSeek provider
               v             |
        Ollama loopback       |
               |              |
               +---- validated result ----+
                              |
                              v
                  Task state / evidence
                              |
                              v
                   Existing DSH tools
                  and human acceptance
\`\`\`

The diagram describes logical boundaries. It does not prescribe a new network service where an existing DSH extension point can safely provide the same boundary.

### 2.1 Two distinct local-routing modes / 两种本地路由模式

| Mode | Decision point | Cost implication | MVP status |
|---|---|---|---|
| Local-first | Before any cloud model request | Can avoid a cloud request entirely for eligible tasks | Target, pending ingress-hook audit |
| Cloud-initiated local delegation | Inside an existing cloud conversation via MCP tool call | Initial cloud request has already incurred or reserved cost | Supported design path; runtime still needs testing |

**Critical constraint:** registering \`mcp__local_model__infer\` alone does not implement local-first routing. If DSH has no safe pre-provider task-ingress hook, implement local-first dispatch at the PACS task-ingress/scheduler boundary. Do not claim that a post-request MCP tool saves the initial cloud tokens.

## 3. Component contracts / 组件契约

### 3.1 Shared task envelope / 统一任务封套

Every route receives a bounded, versioned task envelope containing:

- \`task_id\`: stable unique identifier and idempotency key.
- \`task_type\`: an approved task category, such as classify, extract, summarize, compare, or draft.
- \`input_text\` or \`source_refs\`: exactly one input mode. Bulk local material uses workspace-relative references read by a local bridge from a read-only allowlist; do not send full source content to the cloud first.
- \`data_classification\`: public, internal, confidential, or restricted, using the project's approved classification policy.
- \`required_capabilities\`: structured output, context requirement, tool-call formatting, language, or other validated capabilities.
- \`quality_profile\`: versioned task-specific acceptance criteria.
- \`freshness_requirement\`: whether current external information is required.
- \`side_effect_class\`: read-only, reversible write, external side effect, or high-impact action.
- \`deadline_ms\` and \`max_attempts\`: bounded runtime and retry budget.
- \`cloud_fallback\`: explicit allow/deny policy; default deny until Budget Guard is fully enforced.
- \`budget_reservation_ref\`: present for any cloud call; never a model-supplied approval.

Reject malformed, oversized, out-of-scope, or unauthorized envelopes before model invocation.

### 3.2 Model Adapter contract / 模型适配器契约

The adapter abstraction is a PACS contract, not an assumption about a particular DSH internal API. It should normalize:

1. provider/model identity and a versioned capability profile;
2. request construction from the shared task envelope;
3. streaming and non-streaming response events;
4. structured output and tool-call representation, where supported;
5. usage, latency, timeout, cancellation, and error classification;
6. health/readiness and model availability;
7. cost estimation and admission metadata for billable adapters.

Adapters must not own user permissions, decide approvals, execute arbitrary tools, or modify routing policy. They must not expose credentials to model prompts or logs.

### 3.3 Initial adapter set / 首批适配器

**A. Existing DeepSeek Cloud Adapter**

- Wrap or reuse the current DSH DeepSeek provider; do not create a second credential store or bypass \`~/.dsh/.credentials.yaml\` reference resolution.
- Preserve the live provider, model, thinking/reasoning level, retry, replay, streaming, tool-call, and usage semantics discovered in the host audit.
- Every billable request must pass the shared Budget Guard before egress. Unknown price, unknown maximum cost, missing reservation, or uncovered egress means deny.
- Do not hardcode a model name from an old report. Read the actual active profile configuration at implementation time.

**B. Ollama Local Adapter**

- First implementation boundary: one local MCP stdio server with one raw tool named \`infer\`, exposed by DSH as \`mcp__local_model__infer\`.
- The bridge calls only the Ollama API on loopback, initially \`http://127.0.0.1:11434\`.
- Initial model candidate: \`qwen3.5:4b-q4_K_M\`, subject to host preflight and the existing model acceptance tests.
- No arbitrary shell, file writes, web access, Git operations, credential access, or direct external side effects.
- Support schema validation, bounded input/output, timeout, cancellation, call limits, and explicit \`SUCCESS / PARTIAL / FAILED / ESCALATE\` results.
- Use \`source_refs\` only with a canonicalized read-only directory allowlist; reject path traversal and symlink escape.

A direct DSH provider implementation for Ollama may be considered only after the provider audit demonstrates a stable, supported extension point and proves equivalent permission, budget, streaming, and metering behavior. Do not implement both MCP and native-provider paths in parallel for the MVP.

## 4. Adaptive Router policy / 自适应路由策略

The router is deterministic and policy-driven. A model may suggest a task category, but it cannot approve its own route, budget, permissions, or fallback.

### 4.1 Route choices

| Route | When selected | Execution |
|---|---|---|
| \`TOOL_ONLY\` | Deterministic work such as file conversion, arithmetic, schema checks, Git status, or database reads | Use the existing deterministic tool; no model call |
| \`LOCAL_FIRST\` | Task type has passed local quality tests; input is bounded; freshness and reasoning requirements fit the local capability profile | Invoke Ollama locally before any cloud request |
| \`CLOUD_DIRECT\` | Task requires current external facts, complex reasoning, or a capability not validated locally | Obtain Budget Guard reservation, then use the existing DeepSeek provider |
| \`CLOUD_WITH_LOCAL_DELEGATION\` | A cloud conversation benefits from a bounded local subtask | Cloud request first; then the cloud model may call the local MCP tool. Do not count this as avoiding the initial cloud request |
| \`HUMAN_REQUIRED\` / \`BLOCKED\` | Ambiguous authorization, high-impact action, restricted data, or unavailable safe route | Pause or block; explain the reason |

### 4.2 Admission rules

1. Deterministic tools take precedence over models for deterministic operations.
2. Local-first is allowed only for task types with a versioned test set and a passing quality threshold.
3. Local-first routing occurs before any paid cloud request.
4. If local inference fails, returns invalid schema, times out, or exceeds resource limits, do not silently call the cloud. Queue, return \`ESCALATE\`, or request an explicitly permitted cloud fallback.
5. Any cloud fallback must pass the same Budget Guard and the ¥0.20 per-request and ¥2.00 daily hard caps.
6. Unknown price, unknown route, unverified egress, or missing reservation fails closed.
7. Restricted/confidential data follows the data policy; do not send it to cloud solely because the local model failed.
8. High-impact or external side effects remain governed by existing approval policy. \`approval=skip\` does not grant authority to perform them.
9. Model-reported confidence is advisory only; route decisions use capability test results, deterministic policy, and task metadata.
10. Bound calls, retries, context, output size, and wall-clock time. Never allow recursive delegation loops.

### 4.3 Capability registry

Maintain a small versioned registry keyed by task type and adapter/model version. Each entry records:

- eligible task types and prohibited task types;
- tested language, context, structured-output, and tool-call capabilities;
- quality threshold and test-set revision;
- maximum input/output size, timeout, and concurrency;
- data-classification eligibility;
- last validation date and evidence reference.

A model update, quantization change, prompt-template change, or runtime change invalidates the affected capability result until regression tests pass.

## 5. Budget, telemetry, and security / 预算、遥测与安全

- All billable cloud adapters and auxiliary paid egress share the existing ¥2.00/day ledger and ¥0.20/request cap. The router cannot bypass the Budget Guard.
- Local Ollama inference is recorded separately as local compute; do not label it “free” in total-cost reporting. Record runtime, duration, resource use, and maintenance overhead.
- Cloud-initiated local delegation still records the parent cloud request and its spend.
- Route telemetry records task ID, selected route, reason code, adapter/model version, policy version, latency, retries, input/output usage, estimated/settled cost, validation outcome, and escalation reason. Redact source content and secrets.
- Local model output and tool output are untrusted data. Neither may change policy, permissions, allowlists, budget limits, or approval state.
- Local inference service stays on loopback. No public port, LAN bind, router forwarding, or unreviewed tunnel.
- Credentials remain in the existing credential manager; no PAT, API key, or WeChat credential in repository files, prompts, test fixtures, or logs.

## 6. Provider extension audit gate / Provider 扩展点审计门

Before implementing a native DSH provider or a pre-cloud router hook, complete [the targeted provider-extension audit handoff](PROVIDER-EXTENSION-AUDIT-HANDOFF.md).

The audit must determine, with source paths and line numbers:

- how providers are discovered, registered, configured, and selected;
- the exact request/response/stream contract and tool-call semantics;
- whether a plugin can safely intercept or route before the first provider request;
- how retries, replay, prepared calls, subagents, and headless/Desktop profiles behave;
- where usage metering and Budget Guard can cover every billable egress;
- whether the MCP stdio path is sufficient for the first local adapter;
- whether a pre-cloud task-ingress hook exists. If not, identify the smallest PACS-owned ingress point without patching \`app.asar\`.

**No provider implementation choice is considered verified until this gate is complete.** The audit is read-only except for isolated mock tests explicitly described in the handoff. No production profile changes, package installation, model download, or service restart is authorized by this document.

## 7. Rollout and acceptance gates / 实施与验收门槛

| Gate | Work | Exit criteria |
|---|---|---|
| A0 — Source audit | Inspect provider, agent-loop, MCP, credential, usage-meter, and profile hooks | Evidence-backed recommendation; unknowns remain marked PARTIAL/NOT_TESTED |
| A1 — Adapter contract | Freeze task envelope, adapter result, capability profile, and error contract | Schema tests pass; no runtime integration claimed |
| A2 — Local adapter | Build the Ollama MCP stdio bridge in an isolated workspace using a mock first | Protocol, schema, timeout, cancellation, path allowlist, and failure tests pass |
| A3 — Local runtime | Host preflight, install one runtime/model only after separate authorization | Health, digest, memory, latency, stability, and model quality evidence |
| A4 — Router | Implement deterministic local-first dispatch at a verified pre-cloud ingress point | Eligible tasks avoid cloud request; ineligible tasks reserve budget before cloud |
| A5 — Safety and recovery | Test fallback denial, budget failure, malformed output, restart, and concurrent requests | No silent cloud fallback, no egress bypass, recoverable state |
| A6 — Controlled rollout | Enable only validated task types and monitor actual cost/quality | Same-task baseline proves acceptable quality and net cloud savings |

No gate is passed by documentation alone. Each runtime gate requires logs, test inputs, expected/actual outputs, and host/version evidence.

## 8. Required tests / 必测用例

| ID | Test | Required outcome |
|---|---|---|
| MR01 | Deterministic tool routing | A deterministic task uses its tool and makes no model request |
| MR02 | Local-first admission | An eligible task invokes local inference before any cloud request |
| MR03 | Local capability rejection | An unvalidated task type is not sent to the local model |
| MR04 | Local failure | Timeout/runtime failure/schema failure does not silently trigger cloud |
| MR05 | Explicit cloud fallback | Fallback is denied without policy permission and a valid Budget Guard reservation |
| MR06 | Per-request and daily cap | Cloud route cannot exceed ¥0.20/request or ¥2.00/day |
| MR07 | Cloud-initiated delegation | MCP local delegation works while accounting for the parent cloud request |
| MR08 | Stream and tool-call conformance | Adapter preserves supported streaming events, tool calls, stop/error semantics |
| MR09 | Credential isolation | No credential value appears in model input, output, logs, or repository |
| MR10 | Data boundary | Local source references cannot escape the read-only allowlist |
| MR11 | Retry, cancellation, and concurrency | Bounded retries; cancellation propagates; reservations remain atomic |
| MR12 | Desktop/headless parity | Each execution profile is tested or explicitly marked BLOCKED |
| MR13 | Egress coverage | Search, files, subagents, MCP, retries, and provider calls cannot bypass spend admission |
| MR14 | Route auditability | Every decision records route, reason, policy version, and evidence without source-content leakage |

## 9. Non-goals / 本阶段不做

- Do not clone Claude Code, use leaked source code, or install DeepClaude as a replacement Harness.
- Do not replace the existing DeepSeek primary model or change its active provider/model.
- Do not install multiple local runtimes or multiple local models.
- Do not grant the local model arbitrary host permissions.
- Do not implement a second Kanban, task manager, memory system, or overlapping router.
- Do not claim cloud cost savings from cloud-initiated delegation alone.
- Do not deploy production changes until the source audit, isolated tests, and explicit deployment approval are complete.

## 10. Decision record / 决策记录

The architectural lesson adopted from Claude Code-compatible model wrappers is **separation of agent orchestration from model inference**, not reuse of leaked code. PACS keeps DeepSeek Harness as the agent host, uses one adapter contract for model backends, and places one deterministic Adaptive Router before paid cloud calls. The initial local integration remains a restricted Ollama MCP stdio bridge unless the DSH provider audit proves a safer, simpler native extension.

本项目借鉴的是 Agent 编排与模型推理解耦，不复制泄露代码。PACS 保留 DeepSeek Harness 作为 Agent 主控，统一模型适配契约，并在付费云端调用之前设置唯一的确定性自适应路由器。首个本地接入仍采用受限 Ollama MCP stdio Bridge；只有 DSH Provider 审计证明原生扩展更安全、更简单时，才考虑替代方案。
