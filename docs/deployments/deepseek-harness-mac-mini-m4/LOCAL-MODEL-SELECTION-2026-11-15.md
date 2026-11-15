# 本地模型运行时与模型选型记录
# Local Model Runtime and Model Selection Record

**记录日期 / Recorded:** 2026-11-15  
**版本 / Version:** 0.1.0  
**状态 / Status:** RECOMMENDED — NOT INSTALLED / 已形成推荐 — 尚未安装  
**目标主机 / Target host:** Mac mini M4, Apple Silicon, 16 GiB unified memory  
**Harness / Host baseline:** DeepSeek Harness Desktop 0.2.2-rc.3, macOS 26.2（均为既有部署档案记录，尚未在本次研究中重新读取设备实时状态） / Both are recorded in the existing deployment dossier and were not re-read from the live host during this research.

> **状态边界：** 本文件记录公开资料研究后的首选方案，不代表 Ollama 或模型已安装，也不代表推理性能、实际内存占用、模型质量或 Harness 端到端调用已经通过验收。  
> **Status boundary:** This document records the preferred option based on public-source research. It does not mean Ollama or the model has been installed, nor that inference performance, actual memory use, model quality, or end-to-end Harness invocation has passed acceptance.

## 1. 结论摘要｜Decision Summary

首阶段推荐采用以下单一组合：  
The first phase recommends one stack:

| 层 / Layer | 推荐 / Recommendation | 状态 / Status |
|---|---|---|
| 云端主模型 / Cloud primary model | 保留当前 DeepSeek 云端 API，不更换主模型。 / Keep the current DeepSeek cloud API as the primary model. | EXISTING |
| 本地推理运行时 / Local inference runtime | Ollama macOS 应用及本地 API。 / Ollama macOS application and local API. | RECOMMENDED |
| 本地模型 / Local model | Qwen3.5-4B，Ollama 精确量化标签 `qwen3.5:4b-q4_K_M`。 / Qwen3.5-4B with the exact Ollama quantization tag `qwen3.5:4b-q4_K_M`. | FIRST CANDIDATE |
| Harness 桥接 / Harness bridge | DeepSeek Harness 0.2.2-rc.3 的 MCP Client，优先采用 stdio 传输。 / MCP Client in DeepSeek Harness 0.2.2-rc.3, preferring stdio transport. | DOCUMENTED; NOT CONFIGURED |
| 桥接实现 / Bridge implementation | 一个职责受限的本机 Node.js MCP Server，只调用 Ollama 本地 API。 / One narrowly scoped local Node.js MCP server that calls only the local Ollama API. | PLANNED |
| 模型职责 / Model responsibility | 本地模型是受限推理工作节点，不直接执行文件写入、Shell 或外部副作用。 / The local model is a restricted inference worker, not a direct executor of file writes, shell commands, or external side effects. | DESIGN |

**推荐理由：** Ollama 在 macOS / Apple M 系列上提供原生应用与 CPU/GPU 支持；其本地 API 提供 JSON Schema 结构化输出、工具调用和模型驻留时间控制。对于本项目，结构化输出和模型生命周期管理比让本地模型自己拥有工具执行能力更重要。  
**Rationale:** Ollama provides a native macOS application and CPU/GPU support on Apple M-series devices. Its local API supports JSON-Schema structured outputs, tool calling, and model-residency controls. For this project, structured output and lifecycle management matter more than granting the local model its own tool-execution authority.

## 2. 运行时比较｜Runtime Comparison

| 维度 / Dimension | Ollama | MLX-LM | llama.cpp |
|---|---|---|---|
| Apple Silicon / Metal | 支持 Apple M 系列 CPU/GPU。 / Supports Apple M-series CPU/GPU. | 基于 Apple MLX，面向 Apple Silicon。 / Built on Apple MLX for Apple Silicon. | macOS 默认可启用 Metal。 / Metal is enabled by default on macOS builds. |
| 本地服务接口 / Local API | 本地 REST API；另有 OpenAI 兼容接口。 / Local REST API plus OpenAI-compatible endpoints. | OpenAI 风格的本地 HTTP Chat API。 / OpenAI-style local HTTP chat API. | OpenAI 兼容 Chat Completions、Responses 和 Embeddings。 / OpenAI-compatible Chat Completions, Responses, and Embeddings. |
| JSON Schema 输出 / JSON-Schema output | 官方 API 文档明确支持 `format` JSON Schema。 / Official API docs explicitly support JSON Schema through `format`. | 当前公开 Server 请求字段文档未列出 JSON Schema 约束字段。 / The current published Server request-field reference does not list a JSON-Schema constraint field. |
| 工具调用 / Tool calling | API 支持 `tools`，但实际能力取决于模型与模板。 / API supports `tools`, subject to model and template compatibility. | Server 文档未将工具调用列为稳定请求字段；模型/解析器组合需专项测试。 / Tool calling is not listed as a stable request field in the Server docs; model/parser combinations need dedicated testing. | Server 文档提供 Function Calling / Tool Use，支持多种原生与通用处理器。 / Server docs provide function calling/tool use with native and generic handlers. |
| 生命周期 / Lifecycle | `keep_alive` 可控制驻留；可显式卸载。 / `keep_alive` controls residency and supports explicit unloading. | 通过服务进程启停管理；需自行设计驻留策略。 / Manage residency through server-process lifecycle; additional policy is needed. | 通过服务参数和进程管理；控制粒度较高。 / Manage through server arguments and process supervision; highly configurable. |
| 部署复杂度 / Deployment complexity | 低；桌面应用与模型管理集成。 / Low; desktop app and model management are integrated. | 中；需管理 Python/MLX 环境与模型格式兼容。 / Medium; manage Python/MLX environment and model-format compatibility. | 中至高；需选择 GGUF、量化、构建参数和模板。 / Medium to high; choose GGUF, quantization, build options, and templates. |
| 本阶段判断 / Phase-one assessment | **首选：集成和验收路径最直接。** / **Preferred: most direct integration and acceptance path.** | 性能对照候选；若 Ollama 实测速度或内存不理想，再评估。 / Performance comparison candidate; revisit if Ollama's measured speed or memory use is unsatisfactory. | 后备方案；当需要更细粒度控制或 Ollama 兼容性不足时评估。 / Fallback when finer control is needed or Ollama compatibility is insufficient. |

### 2.1 Ollama｜首选运行时

- 官方 macOS 文档要求 macOS Sonoma 14 或更新版本；Apple M 系列支持 CPU 和 GPU。既有部署档案记录的 macOS 26.2 满足版本条件，但仍需在本机核对实际安装与运行状态。  
  Official macOS documentation requires macOS Sonoma 14 or newer and supports CPU/GPU on Apple M-series devices. The recorded macOS 26.2 meets the OS-version requirement, but actual installation and runtime status still need host-side verification.
- 本地聊天 API 为 `http://127.0.0.1:11434/api/chat`（部署时须确认服务只监听 loopback；不得设置成公网或局域网可访问地址）。  
  The local chat API is `http://127.0.0.1:11434/api/chat` (verify at deployment that it listens only on loopback; do not expose it to the public internet or LAN).
- `format` 接受 JSON Schema；`keep_alive` 默认 5 分钟，设为 0 可卸载模型。  
  `format` accepts JSON Schema; `keep_alive` defaults to five minutes and can be set to 0 to unload a model.
- 第一阶段使用 Ollama 原生 API，不把 DeepSeek Harness 的主模型提供商改为 Ollama。  
  Use Ollama's native API in phase one; do not change the primary model provider in DeepSeek Harness to Ollama.

### 2.2 MLX-LM｜性能对照候选

MLX-LM 是 Apple Silicon 原生方向，提供绑定本机 localhost 的 HTTP Chat Server。但其官方 Server 文档明确提示安全检查较基础，且当前文档列出的请求字段不包括 JSON Schema 约束参数。  
MLX-LM is the native Apple-Silicon option and provides a local HTTP chat server bound to localhost. However, its official Server documentation warns that security checks are basic, and the documented request fields do not include a JSON-Schema constraint parameter.

因此它不是首阶段默认方案。若 Ollama 的实测吞吐、首 Token 延迟或内存占用不满足要求，再对兼容的 MLX 模型格式进行独立性能测试；不同时安装两套运行时。  
It is therefore not the default for phase one. If Ollama fails measured throughput, time-to-first-token, or memory targets, test a compatible MLX model format separately; do not install both runtimes concurrently.

### 2.3 llama.cpp｜可控性后备方案

llama.cpp 的 macOS 构建支持 Metal；官方 Server 文档列出 OpenAI 兼容接口、Schema 约束 JSON 输出和 Function Calling。其代价是需要更细致地管理 GGUF 模型、量化、Chat Template 和 Server 参数。  
llama.cpp supports Metal on macOS; its official Server documentation lists OpenAI-compatible APIs, schema-constrained JSON output, and function calling. Its trade-off is more manual management of GGUF models, quantization, chat templates, and server arguments.

## 3. 模型比较与首选｜Model Comparison and First Candidate

### 3.1 首选模型｜First Candidate

**Ollama tag：** `qwen3.5:4b-q4_K_M`  
**模型：** Qwen3.5-4B  
**量化：** Q4_K_M  
**模型文件大小：** Ollama Registry 当前列出约 3.3 GB（这是磁盘文件大小，不是运行时峰值内存）。  
**Model file size:** The current Ollama Registry lists approximately 3.3 GB (disk size, not peak runtime memory).

Qwen 官方模型卡列出的 4B 版本基准包括 C-Eval 85.1、IFEval 89.8、BFCL-V4 50.3、TAU2-Bench 79.9；许可证为 Apache 2.0。模型卡还描述了 Agentic / Tool Calling 能力。以上是模型发布方报告的结果，不是本项目的独立测试。  
The Qwen model card reports C-Eval 85.1, IFEval 89.8, BFCL-V4 50.3, and TAU2-Bench 79.9 for the 4B version; the license is Apache 2.0. The card also describes agentic/tool-calling capabilities. These are publisher-reported results, not independent tests for this project.

**与 PACS 的匹配：** 中文理解、短文本分类、字段提取、摘要、简单比较和结构化输出是首阶段重点。模型自身的 Tool Calling 仅作为可评测能力，不授予本地文件、Shell 或其他工具权限。  
**PACS fit:** Chinese comprehension, short-text classification, field extraction, summarization, simple comparison, and structured output are the first-phase priorities. The model's own tool-calling capability is only an evaluation dimension and does not grant local file, shell, or other tool permissions.

### 3.2 9B 备选｜9B Alternative

`qwen3.5:9b-q4_K_M` 的 Registry 文件大小约 6.6 GB。Qwen 官方模型卡列出的 9B 结果在 C-Eval（88.2）、IFEval（91.5）和 BFCL-V4（66.1）高于 4B，但 9B 权重、KV Cache、运行时、Harness、macOS 和其他应用会共同争用 16 GiB 统一内存。  
The Registry lists approximately 6.6 GB for `qwen3.5:9b-q4_K_M`. Qwen's reported 9B results for C-Eval (88.2), IFEval (91.5), and BFCL-V4 (66.1) are higher than 4B, but 9B weights, KV cache, runtime, Harness, macOS, and other apps all compete for the same 16 GiB unified memory.

**判断：** 9B 不是在 16GB 上绝对不可运行，而是不适合作为未经测量就直接部署的首选。只有 4B 在质量测试中明确不足、且本机资源测量证明有足够余量时，才单独测试 9B。  
**Assessment:** 9B is not categorically impossible on 16GB, but it should not be deployed first without measurement. Test it only if 4B clearly fails quality requirements and host measurements show adequate headroom.

### 3.3 为什么不直接使用更大的上下文｜Why Not Use the Maximum Context

Qwen3.5 模型卡列出的原生上下文长度为 262,144 tokens，并在复杂任务场景建议保留较长上下文；Ollama Registry 也显示该系列支持 256K。但本地工作节点的目标是处理有界子任务，不是替代云端大模型处理整本资料。  
The Qwen3.5 model card lists a native context length of 262,144 tokens and recommends longer context for complex tasks; the Ollama Registry also lists 256K support. However, the local worker is intended for bounded subtasks, not to replace the cloud model in processing entire corpora.

首轮建议从 8K–16K 的任务输入上限开始，通过分块处理大型资料；实际 `num_ctx`、KV Cache 和吞吐必须在设备上测量后再调整。不要把 256K 的模型规格误认为 16GB 设备可以经济地运行 256K 上下文。  
Start with an 8K–16K task-input cap and chunk large sources. Adjust actual `num_ctx`, KV cache, and throughput only after host measurements. Do not mistake the model's 256K specification for an economical 256K context on a 16GB device.

## 4. 对云端成本真正有影响的数据路径｜The Data Path That Actually Reduces Cloud Cost

**关键原则：云端主动委派本身不会自动节省 Token。** 如果完整原文已经进入云端模型上下文，再把同一份原文放进本地工具参数，云端输入 Token 已经发生，不能被追回。  
**Key principle: cloud-initiated delegation does not automatically save tokens.** If the full source text has already entered the cloud model's context, passing the same text again as a local tool argument cannot recover the cloud input tokens already consumed.

真正的成本优化路径是：  
The actual cost-optimization path is:

1. 云端模型接收用户任务和必要的文件索引/元数据，而不是整批原始文件。 / The cloud model receives the user task and necessary file indexes/metadata, not the entire raw corpus.
2. 云端模型调用本地 MCP 工具，传入任务类型、指令、工作区相对路径或本地资源 ID（`source_refs`）。 / The cloud model calls the local MCP tool with task type, instruction, workspace-relative paths, or local resource IDs (`source_refs`).
3. 本地 MCP Server 只在预先配置的只读目录白名单内读取源文件，执行路径规范化、符号链接检查、文件大小和类型限制。 / The local MCP server reads only within a preconfigured read-only directory allowlist and enforces path normalization, symlink checks, file-size limits, and file-type limits.
4. 本地桥接把资料分块交给 Ollama / Qwen3.5-4B，要求返回符合 JSON Schema 的字段、摘要或分类结果。 / The local bridge chunks the material and sends it to Ollama / Qwen3.5-4B, requesting fields, summaries, or classifications that conform to a JSON Schema.
5. 桥接校验结构并仅返回云端完成下一步所必需的精简结果和来源引用。 / The bridge validates the structure and returns only the compact result and source references needed by the cloud model for its next step.

小型 `inline_input` 仍可用于短文本任务，但必须在成本记录中标记为“内联输入”；它适合减少复杂任务委派开销，不应被误记为替代了已经发送到云端的大段文本。  
Small `inline_input` payloads remain useful for short-text tasks, but must be marked as inline input in cost records. They reduce delegation overhead for bounded tasks; they must not be counted as replacing large text that was already sent to the cloud.

**权限边界：** 本地 MCP Server 的文件读取能力应仅限一个或多个明确的只读工作区根目录。禁止任意绝对路径、目录遍历、任意 Shell、写入、删除、上传和网络转发。公开仓库只记录接口与规则，不记录真实私人目录、Token 或客户文件。  
**Permission boundary:** The local MCP server's read access must be limited to explicitly configured read-only workspace roots. Deny arbitrary absolute paths, path traversal, arbitrary shell, writes, deletion, uploads, and network forwarding. The public repository records interfaces and rules only, never private directory paths, tokens, or customer files.

对于不允许把任何原始数据或敏感结果发回云端的任务，应使用本地闭环工作流，不应把“本地推理”误称为“端到端数据不出本机”。  
For tasks where neither raw data nor sensitive results may be sent to the cloud, use a fully local workflow. Do not equate local inference with an end-to-end guarantee that no data leaves the machine.

## 5. DeepSeek Harness 接入方式｜DeepSeek Harness Integration

已按 DeepSeek Harness `dsh-v0.2.2-rc.3` 标签下的 MCP Client 文档核对：该版本支持 `stdio` 和 `streamable-http`；stdio 用于本机程序，配置字段包括 `command`、`args`、`env`、`cwd`。MCP 工具会注册到 Harness 工具列表，并由 Harness 工具执行层执行权限检查、记录结果和处理取消。  
The MCP Client documentation under the DeepSeek Harness `dsh-v0.2.2-rc.3` tag confirms support for `stdio` and `streamable-http`. Stdio is intended for local programs and accepts `command`, `args`, `env`, and `cwd`. MCP tools register in the Harness tool list and are subject to Harness tool-execution permission checks, result recording, and cancellation.

**首选 stdio，而不是新增 MCP HTTP 服务端口。** Harness 启动一个受限本机 Node.js MCP 进程；该进程只向 Ollama loopback API 发请求。这样无需将 MCP Server 暴露到 LAN 或公网。  
**Prefer stdio rather than adding an MCP HTTP server port.** The Harness starts one restricted local Node.js MCP process; that process calls only the Ollama loopback API. This avoids exposing an MCP server to the LAN or public internet.

建议的逻辑命名：`serverName: local_model`，MCP 原始工具名 `infer`，Harness 向模型公开的命名为 `mcp__local_model__infer`。此前架构文件中的 `local_model_infer` 是该操作的概念名称。  
Suggested logical naming: `serverName: local_model`, MCP raw tool name `infer`, and the model-facing Harness name `mcp__local_model__infer`. The `local_model_infer` name in the architecture document is the conceptual operation name.

本地模型不需要自己调用 MCP。云端模型调用 MCP 工具；本地桥接把输入送入 Ollama；本地模型只返回推理结果。此设计减少本地模型工具调用格式不稳定对主链路的影响。  
The local model does not need to call MCP itself. The cloud model calls the MCP tool; the local bridge sends input to Ollama; the local model returns inference results only. This avoids making the primary path depend on the local model's tool-call formatting.

## 6. 资源预算与运行策略｜Resource Budget and Runtime Policy

既有部署记录显示上次检查时内置盘约有 146 GiB 可用；外置 1 TB SSD 的格式、卷名和稳定性仍未核实。  
The existing deployment record showed approximately 146 GiB free on the internal drive at the last inspection; the external 1 TB SSD's format, volume name, and reliability remain unverified.

- Qwen3.5-4B Q4_K_M 约 3.3 GB 的模型文件可先考虑保留在默认本地模型存储位置；不为该模型提前迁移外置 SSD。 / The approximately 3.3 GB Qwen3.5-4B Q4_K_M file can initially remain in the default local model store; do not migrate the external SSD for this model in advance.
- 实际内存包含权重、KV Cache、运行时、macOS、Harness、浏览器和其他后台程序；模型文件大小不等于运行时 RAM。 / Actual memory use includes weights, KV cache, runtime, macOS, Harness, browser, and background processes; model-file size is not runtime RAM.
- 首轮只安装一个模型；不并行常驻多个模型。 / Install only one model in the first phase; do not keep multiple models resident.
- 首轮任务输入上限建议 8K–16K；长资料通过本地分块处理。 / Start with an 8K–16K task-input cap; process long sources in local chunks.
- Ollama 默认 `keep_alive` 为 5 分钟；先按默认值测量调用间隔和内存压力，再决定是否缩短或设为 0 卸载。 / Ollama's default `keep_alive` is five minutes; measure call intervals and memory pressure before shortening it or setting it to 0.
- 不使用 Docker 作为主推理运行环境；不替换现有 Node.js 22，不调整无关系统服务。 / Do not use Docker as the primary inference runtime; do not replace existing Node.js 22 or modify unrelated system services.

## 7. 实施与验收顺序｜Implementation and Acceptance Sequence

| 阶段 / Phase | 动作 / Action | 验收 / Acceptance |
|---|---|---|
| S0 本机预检 / Host preflight | 确认 Ollama 是否已安装、当前版本、模型目录、可用内存、磁盘空间和外置盘状态。 / Check whether Ollama is installed, its version, model directory, available memory, disk space, and external-drive state. | 形成实际主机状态记录；不覆盖现有配置。 / Record actual host state without overwriting existing configuration. |
| S1 安装运行时 / Runtime installation | 安装官方 Ollama macOS 应用；保持本地 API loopback。 / Install the official Ollama macOS app; keep its local API on loopback. | 应用可启动、CLI 可用、API 健康检查通过。 / App starts, CLI works, and API health check passes. |
| S2 拉取单一模型 / Pull one model | 拉取 `qwen3.5:4b-q4_K_M`，记录完整模型 digest。 / Pull `qwen3.5:4b-q4_K_M` and record its full model digest. | 模型可加载；记录首次加载时间和内存峰值。 / Model loads; record cold-load time and peak memory. |
| S3 本地质量测试 / Local quality tests | 执行 LM01–LM06：中文提取、结构化输出、指令遵循、摘要、错误处理和边界测试。 / Run LM01–LM06: Chinese extraction, structured output, instruction following, summarization, failure handling, and boundary tests. | 达到预设质量门槛；记录原始输入、输出和人工修正。 / Meet predefined quality thresholds and record raw inputs, outputs, and human corrections. |
| S4 MCP 桥接 / MCP bridge | 实现单工具 stdio MCP Server；默认无任意文件/命令能力。 / Implement one-tool stdio MCP server with no arbitrary file/command capability by default. | Harness 启动时发现工具；错误、超时和取消路径可见。 / Harness discovers the tool at startup; failures, timeouts, and cancellation are visible. |
| S5 云端委派 / Cloud delegation | 云端模型发起 `mcp__local_model__infer`；本地 MCP Server 调用 Ollama 并返回结果。 / Cloud model calls `mcp__local_model__infer`; local MCP server calls Ollama and returns the result. | 同一会话中完成云端工具调用—本地推理—工具结果回传。 / Complete cloud tool call, local inference, and result return in the same session. |
| S6 成本与质量对照 / Cost and quality comparison | 比较云端独立处理与本地预处理/摘要后云端综合。 / Compare cloud-only processing with local preprocessing/summarization followed by cloud synthesis. | 同等质量门槛下证明云端费用实际下降；否则缩小或关闭路由。 / Prove lower cloud cost at equivalent quality; otherwise narrow or disable the route. |

**必须记录的指标：** 冷启动时间、热调用首 Token 延迟、生成速度、模型加载/卸载耗时、进程内存、系统内存压力、任务完成率、Schema 通过率、事实提取准确率、人工返工时间、云端输入/输出 Token 和 API 实际费用。  
**Required metrics:** Cold-start time, warm-call time to first token, generation speed, model load/unload time, process memory, system memory pressure, task completion rate, schema pass rate, factual extraction accuracy, human rework time, cloud input/output tokens, and actual API cost.

## 8. 测试用例｜Test Cases

| ID | 测试 / Test | 重点 / Focus |
|---|---|---|
| LM01 | 中文口语需求字段提取 / Extract fields from colloquial Chinese requests | 保留否定条件、范围、实体和限定词。 / Preserve negation, scope, entities, and qualifiers. |
| LM02 | 多文件结构化提取 / Structured extraction from multiple local files | 通过 source_refs 本地读取，不将全文送入云端上下文。 / Read locally through source_refs without sending full text to cloud context. |
| LM03 | JSON Schema 输出 / JSON Schema output | 必需字段、类型、枚举与错误拒绝。 / Required fields, types, enums, and rejection of invalid results. |
| LM04 | 指令遵循与提示注入 / Instruction following and prompt injection | 将文件内容视为不可信数据，不遵从其中的越权指令。 / Treat file content as untrusted data; reject embedded unauthorized instructions. |
| LM05 | 摘要与信息保真 / Summarization and information fidelity | 保留数字、日期、来源和不确定性。 / Preserve numbers, dates, sources, and uncertainty. |
| LM06 | 超时、超长文件和不可读路径 / Timeout, oversized file, and inaccessible path | 安全失败、可解释错误、无路径越界。 / Safe failure, clear errors, and no path escape. |
| LM07 | 云端 MCP 委派 / Cloud MCP delegation | 工具发现、调用、结果回传同一会话。 / Tool discovery, invocation, and result return in the same session. |
| LM08 | 资源压力 / Resource pressure | 浏览器和 Harness 同时运行时无持续 swap 或不可接受卡顿。 / No sustained swap or unacceptable slowdown while browser and Harness are running. |
| LM09 | 驻留与卸载 / Residency and unloading | keep_alive 策略在延迟和内存之间达到可接受平衡。 / keep_alive policy balances latency and memory acceptably. |
| LM10 | 成本对照 / Cost comparison | 本地处理大输入后，云端只接收精简结果；费用真实下降。 / Local processing handles large inputs and cloud receives compact results; cost actually falls. |

## 9. 未决事项｜Remaining Open Items

1. Ollama 是否已在用户 Mac mini 安装；当前版本与服务绑定地址。 / Whether Ollama is already installed, its version, and its bind address.
2. 当前真实内存压力、模型加载峰值和稳定吞吐。 / Actual memory pressure, model-load peak, and sustained throughput.
3. Qwen3.5-4B 的中文任务质量和 JSON Schema 遵循率。 / Qwen3.5-4B quality on Chinese tasks and JSON-Schema compliance.
4. DeepSeek Harness 云端模型在当前账户与会话中是否能稳定发起 MCP 工具调用。 / Whether the cloud model in the current Harness account/session reliably initiates MCP calls.
5. 只读本地资料目录的授权范围与路径白名单。 / Authorized read-only local source roots and path allowlists.
6. 代表性任务集、云端费用基线和可接受的人工返工成本。 / Representative task set, cloud-cost baseline, and acceptable human rework cost.

## 10. 参考资料｜References

- [Ollama macOS requirements and installation](https://github.com/ollama/ollama/blob/main/docs/macos.mdx)
- [Ollama API — chat, structured outputs, tool calling, keep_alive](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [Ollama Qwen3.5 model and tags](https://ollama.com/library/qwen3.5)
- [Qwen3.5-4B official model card and benchmarks](https://huggingface.co/Qwen/Qwen3.5-4B)
- [MLX-LM HTTP Server documentation](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/SERVER.md)
- [llama.cpp Metal build documentation](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md)
- [llama.cpp HTTP Server documentation](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- [DeepSeek Harness MCP Client at dsh-v0.2.2-rc.3](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/packages/mcp/mcp-client/README.md)
- [DeepSeek Harness MCP subsystem at dsh-v0.2.2-rc.3](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/docs/subsystems/mcp.md)
