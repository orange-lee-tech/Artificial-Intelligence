# PACS 执行能力与模型职责路由设计
# PACS Execution Capability and Model Responsibility Routing Design

**版本 / Version:** 0.1.0  
**状态 / Status:** DESIGN — NOT DEPLOYED / 设计中 — 尚未部署  
**适用范围 / Scope:** PACS 核心架构与 Mac mini M4 上的 DeepSeek Harness 协同运行环境  
**依据 / Basis:** PACS Constitution、Capability Contract、C01–C12、W01–W05、DeepSeek Harness 部署档案

> **重要状态说明：** 本文件定义目标架构、职责边界、路由规则和验收标准。它不表示本地模型、推理运行时、Harness 插件或网络桥接已经安装、启用或通过测试。  
> **Status notice:** This document defines the target architecture, responsibility boundaries, routing rules, and acceptance criteria. It does not mean that a local model, inference runtime, Harness plugin, or network bridge has been installed, enabled, or tested.

## 1. 目标与设计结论｜Purpose and Design Decision

PACS 的目标不是部署一个能够独立完成所有工作的本地模型，而是让确定性工具、本地小模型、云端大模型和人类所有者各自承担适合自己的职责，并通过统一任务契约协同完成真实工作。  
PACS is not intended to deploy one local model that performs every task. Its goal is to assign deterministic tools, a local small model, a cloud large model, and the human owner to the responsibilities each handles best, coordinating them through a shared task contract.

本设计明确采用**云端模型可主动委派本地推理**的协同模式：云端模型在判断某个子任务适合本地处理时，发出对本地推理工具的调用请求；本机 DeepSeek Harness 接收该请求，在 Mac mini 上调用本地模型，并将经过校验的结果返回云端模型。  
This design explicitly supports **cloud-initiated delegation to local inference**: when the cloud model determines that a subtask is suitable for local processing, it issues a call to a local-inference tool; the local DeepSeek Harness receives the request, invokes the model on the Mac mini, validates the result, and returns it to the cloud model.

该机制不是让云端服务直接访问 Mac mini 的 localhost。云端模型发出的是工具调用意图，实际网络访问和本地推理由运行在 Mac mini 上的 Harness / 工具适配器执行。默认不向公网暴露本地推理端口。  
This does not mean that the cloud service directly accesses localhost on the Mac mini. The cloud model emits a tool-call request; the Harness and tool adapter running on the Mac mini perform the actual local request and inference. The local inference port is not exposed to the public internet by default.

**成本原则：** 云端委派本地模型不自动等于节省 API 费用。只有当本地模型实际替代了原本需要云端处理的输入、输出或中间推理工作，并且云端调用开销低于被替代成本时，才产生净节省。对于无需高级推理的常规任务，后续可评估本地优先路由，避免启动云端 API。  
**Cost principle:** Delegating to a local model does not automatically reduce API fees. Net savings occur only when local inference replaces work that would otherwise consume cloud input, output, or intermediate reasoning tokens, and the remaining cloud overhead is lower than the avoided cost. For routine tasks that do not require advanced reasoning, local-first routing can later be evaluated to avoid invoking the cloud API at all.

## 2. 执行主体与职责边界｜Execution Actors and Responsibility Boundaries

| 执行主体 / Actor | 主要职责 / Primary responsibility | 不应承担的职责 / Should not own |
|---|---|---|
| 本地工具与工作流 / Local tools and workflows | 文件、Shell、Git、搜索、解析、格式转换、测试、数据库和状态存储等确定性操作。 / Deterministic operations such as files, shell, Git, search, parsing, format conversion, tests, databases, and state storage. | 不替代复杂语义判断或战略决策。 / Do not replace complex semantic judgment or strategic decisions. |
| 本地小模型 / Local small model | 有界任务的理解、分类、提取、摘要、轻量推理、结构化结果和候选路由建议。 / Understanding, classification, extraction, summarization, lightweight reasoning, structured results, and candidate routing for bounded tasks. | 不拥有系统权限，不直接执行任意 Shell、文件写入或外部副作用。 / Does not own system permissions or directly execute arbitrary shell commands, file writes, or external side effects. |
| 云端大模型 / Cloud large model | 复杂问题建模、规划、跨领域推理、复杂分析、专业内容生成，以及决定何时委派本地子任务。 / Complex problem modeling, planning, cross-domain reasoning, complex analysis, professional content generation, and deciding when to delegate local subtasks. | 不绕过本地 Harness 的工具权限、审批和风险策略。 / Does not bypass local Harness tool permissions, approvals, or risk policies. |
| DeepSeek Harness（本地主控） / DeepSeek Harness (local coordinator) | 管理会话、云端 API、工具调用、模型桥接、上下文、权限、执行循环和结果回传。 / Manages sessions, cloud API calls, tool invocation, model bridging, context, permissions, execution loops, and result delivery. | 不把模型输出视为权限授权或执行成功证明。 / Does not treat model output as authorization or proof of successful execution. |
| 规则与权限控制 / Policy and permission controls | Schema 校验、工具白名单、风险等级、重试限制、审批门槛和审计记录。 / Schema validation, tool allowlists, risk levels, retry limits, approval gates, and audit records. | 不由模型自行修改或豁免。 / Cannot be modified or waived by a model acting on its own. |
| 人类所有者 / Human owner | 定义目标、优先级、资源、权限、重大取舍和最终验收。 / Defines goals, priorities, resources, permissions, major trade-offs, and final acceptance. | 不将最终责任自动转移给模型。 / Does not transfer final accountability to a model. |

**关键边界：模型负责判断和生成建议；Harness 与工具负责受控执行；规则负责约束；人类负责授权和最终验收。**  
**Key boundary: Models judge and propose; the Harness and tools execute within controlled permissions; policies constrain; the human authorizes and accepts.**

## 3. 目标协同架构｜Target Collaboration Architecture

### 3.1 云端发起、本地执行、结果回传｜Cloud-Initiated, Locally Executed, Result Returned

用户请求首先进入 Mac mini 上的 DeepSeek Harness。Harness 根据当前配置调用云端模型；云端模型可以在自己的推理过程中发出 local_model_infer 工具调用。Harness 收到该工具调用后，调用本机推理适配器和本地模型，并将结果作为工具结果返回云端会话。  
A user request first enters DeepSeek Harness on the Mac mini. The Harness calls the configured cloud model; during its reasoning process, the cloud model may issue a local_model_infer tool call. The Harness receives that call, invokes the local inference adapter and model, then returns the result as a tool result to the cloud conversation.

执行顺序如下：  
The execution sequence is:

1. 用户提交任务；Harness 建立任务上下文、权限范围和可用工具清单。 / The user submits a task; the Harness establishes task context, permission scope, and the available tool list.
2. 云端模型分析任务，并判断是否存在适合本地模型处理的有界子任务。 / The cloud model analyzes the task and determines whether a bounded subtask is suitable for local inference.
3. 云端模型发出 local_model_infer 工具调用请求。 / The cloud model issues a local_model_infer tool call.
4. 本地 Harness 校验参数、任务风险、数据范围和调用次数。 / The local Harness validates parameters, task risk, data scope, and call count.
5. 本地适配器通过 loopback 接口调用本地模型运行时。 / The local adapter calls the local model runtime through a loopback interface.
6. 本地模型返回结果；适配器检查结构、长度、必需字段和引用有效性。 / The local model returns a result; the adapter checks structure, length, required fields, and reference validity.
7. Harness 将校验后的工具结果回传云端模型，由云端模型继续推理或形成最终答复。 / The Harness returns the validated tool result to the cloud model, which continues reasoning or produces the final response.
8. Harness 保存必要的任务状态、工具事件和验收证据。 / The Harness persists the necessary task state, tool events, and acceptance evidence.

**逻辑拓扑 / Logical topology**

用户 / User  
↓  
DeepSeek Harness（Mac mini，本地主控 / local coordinator）  
├── 云端大模型 API / Cloud large-model API  
│　└── local_model_infer 工具调用 / tool call  
│　　　↓  
├── 本地工具桥接 / Local tool bridge  
│　└── 本地推理适配器（默认仅 loopback / loopback only by default）  
│　　　↓  
│　　本地模型运行时与单一选定模型 / Local inference runtime and one selected model  
│　　　↑  
│　　结构化结果与校验状态 / Structured result and validation status  
│　　　↑  
│　云端会话接收工具结果 / Cloud conversation receives tool result  
├── 确定性工具 / Deterministic tools  
│　└── 文件、Shell、Git、搜索、文档处理、测试 / Files, shell, Git, search, document processing, tests  
└── 权限、状态与证据 / Permissions, state, and evidence

### 3.2 两种路由模式｜Two Routing Modes

| 模式 / Mode | 工作方式 / How it works | 定位 / Role |
|---|---|---|
| 云端主动委派本地 / Cloud-initiated local delegation | 云端模型发出 local_model_infer 调用；本地 Harness 执行并回传。 / The cloud model calls local_model_infer; the local Harness executes and returns the result. | 本设计的首要目标；保留云端复杂推理能力，同时把适合的子任务交给本地模型。 / Primary target of this design; retains cloud reasoning while delegating suitable subtasks locally. |
| 本地优先路由 / Local-first routing | 本地规则或小模型先处理已验证的常规任务；只有超出能力边界时才调用云端。 / Local rules or the small model handle validated routine tasks first; cloud is invoked only when the task exceeds local capability. | 后续成本优化方向；须在云端委派链路和本地模型质量验证后再评估。 / A later cost-optimization option; evaluate only after validating cloud delegation and local model quality. |

**不得混淆：** 云端主动委派可以减少特定子任务的云端工作量，但每次云端 API 会话仍可能产生费用。本地优先路由才有机会完全避免一部分常规任务的云端调用。两种模式可以共存，但不应在第一阶段同时引入复杂路由。  
**Do not conflate the modes:** Cloud-initiated delegation can reduce cloud work for selected subtasks, but the cloud API session may still incur fees. Local-first routing can avoid cloud calls entirely for some routine tasks. Both modes may coexist, but they should not be introduced as a complex combined router in the first phase.


**模型适配与路由补充 / Adapter and router clarification:** 详细的 Model Adapter 与 Adaptive Router 契约见 [PACS Model Adapter & Adaptive Router Specification](deployments/deepseek-harness-mac-mini-m4/MODEL-ADAPTER-AND-ADAPTIVE-ROUTER-SPEC.md)。必须区分云端发起的 MCP 本地委派与首次付费请求之前的 local-first 路由；后者需要经审计确认的 pre-provider 入口，或由 PACS 任务入口实现。MCP 工具注册本身不等于 local-first。

### 3.3 网络与连接原则｜Network and Connectivity Principles

- 本地推理服务默认绑定 127.0.0.1 或等效 loopback 地址，只允许本机 Harness / 适配器访问。 / The local inference service binds to 127.0.0.1 or an equivalent loopback address by default and is accessible only to the local Harness / adapter.
- 第一阶段不开放公网端口、不配置路由器端口转发、不建立未经审查的反向隧道。 / Do not expose a public port, configure router port forwarding, or establish an unreviewed reverse tunnel in the first phase.
- 云端 API 的工具调用由本地 Harness 客户端接收和执行；不要求云端供应商主动连接用户设备。 / Tool calls from the cloud API are received and executed by the local Harness client; the cloud provider does not need to initiate a connection to the user's device.
- 若未来确实需要云端服务直接访问本地推理端点，必须另行设计身份认证、TLS/mTLS、访问控制、速率限制、重放防护、日志和撤销机制，并单独审批。 / If direct cloud-service access to a local inference endpoint is ever required, authentication, TLS/mTLS, access control, rate limiting, replay protection, logging, and revocation must be designed and approved separately.

## 4. 统一路由原则｜Shared Routing Rules

1. **工具优先处理确定性工作。** 文件查找、格式转换、计算、测试、Git 操作和状态写入应由对应工具执行，不调用模型重复完成。 / **Tools handle deterministic work first.** File search, format conversion, calculations, tests, Git operations, and state writes should use their dedicated tools rather than duplicating the work with a model.
2. **本地模型处理有界、可验证、可回退的任务。** 任务应有明确输入、输出格式、范围和失败处理。 / **The local model handles bounded, verifiable, recoverable tasks.** Each task must have explicit inputs, output format, scope, and failure handling.
3. **云端模型处理复杂认知任务。** 包括新颖问题、跨领域推理、复杂因果分析、重大方案比较和高质量综合。 / **The cloud model handles complex cognitive tasks.** These include novel problems, cross-domain reasoning, complex causal analysis, major option comparisons, and high-quality synthesis.
4. **高风险操作由规则和人类控制。** 模型可以识别风险、提出方案，但不得自行授权 A3 操作。 / **Rules and humans control high-risk actions.** Models may identify risks and propose actions but cannot authorize A3 operations.
5. **路由失败必须可解释。** 输出说明选择了哪个执行者、原因、成本/质量取舍及升级原因。 / **Routing failures must be explainable.** The system records the selected executor, rationale, cost/quality trade-off, and escalation reason.
6. **优先复用现有工具。** 不因引入本地模型而重复建设文件管理、任务看板、记忆、搜索或自动化插件。 / **Reuse existing tools first.** Do not duplicate file management, task boards, memory, search, or automation plugins merely because a local model is introduced.

## 5. 十二项原子能力职责矩阵｜Responsibility Matrix for the 12 Atomic Capabilities

表中“工具/规则”指确定性工具、工作流或权限控制；“本地模型”指 Mac mini 上唯一计划选定的小模型；“云端模型”指 DeepSeek 等云端高级模型。主责可以组合，不代表每项能力都必须调用模型。  
In this table, “Tools / rules” means deterministic tools, workflows, or permission controls; “Local model” means the single small model planned for the Mac mini; “Cloud model” means a cloud-based advanced model such as DeepSeek. Responsibilities may be combined; not every capability requires a model call.

| 能力 / Capability | 工具与规则 / Tools and rules | 本地模型 / Local model | 云端模型 / Cloud model | 人类 / Human |
|---|---|---|---|---|
| C01 需求澄清 / Requirements clarification | 任务字段、约束和验收模板。 / Task fields, constraints, and acceptance templates. | 提取目标、范围、约束；识别一个关键缺口。 / Extract goals, scope, constraints; identify one critical gap. | 多义目标、冲突需求和复杂利益相关方分析。 / Resolve ambiguous goals, conflicting requirements, and complex stakeholder issues. | 确认重大范围与优先级。 / Confirm major scope and priorities. |
| C02 上下文获取 / Context acquisition | 文件、Git、搜索、连接器和来源索引。 / Files, Git, search, connectors, and source indexes. | 生成检索线索、分类资料、摘要和去重。 / Generate retrieval cues, classify material, summarize, and deduplicate. | 解决跨来源冲突、复杂背景综合和关键证据判断。 / Reconcile cross-source conflicts and synthesize complex context and evidence. | 提供缺失的私有背景并裁定权威来源。 / Supply missing private context and identify authoritative sources. |
| C03 问题建模 / Problem modeling | 数据提取、图表和结构化记录工具。 / Data extraction, charting, and structured-record tools. | 对边界清楚的问题建立简单对象、依赖和流程模型。 / Build simple object, dependency, and process models for well-bounded problems. | 复杂系统、因果关系、架构权衡和多变量问题。 / Handle complex systems, causal relationships, architecture trade-offs, and multi-variable problems. | 确认业务目标和不可接受结果。 / Confirm business goals and unacceptable outcomes. |
| C04 任务拆解与编排 / Task orchestration | 工作流引擎、任务状态机、依赖和检查点。 / Workflow engine, task state machine, dependencies, and checkpoints. | 从现有 W01–W05 中选择流程并填充常规任务步骤。 / Select from W01–W05 and populate routine task steps. | 设计新流程、复杂并行计划和跨系统依赖。 / Design new workflows, complex parallel plans, and cross-system dependencies. | 批准重大资源与范围变化。 / Approve major resource or scope changes. |
| C05 工具选择与委派 / Tool routing and delegation | 工具注册表、白名单、权限和参数校验。 / Tool registry, allowlists, permissions, and parameter validation. | 在允许范围内选择工具、生成结构化调用参数。 / Select tools within the allowlist and generate structured call parameters. | 复杂多工具策略、跨系统委派和异常路由。 / Handle complex multi-tool strategies, cross-system delegation, and exceptional routing. | 批准超出既定授权的操作。 / Approve actions outside existing authorization. |
| C06 执行监督与恢复 / Execution control and recovery | 状态记录、超时、幂等检查、重试和回滚机制。 / State records, timeouts, idempotency checks, retries, and rollback mechanisms. | 分类常见错误，提出受限且可恢复的下一步。 / Classify common failures and propose bounded, recoverable next steps. | 诊断未知故障、复杂部分失败和跨组件恢复。 / Diagnose unknown failures, complex partial failures, and cross-component recovery. | 批准不可逆恢复、生产变更和高影响操作。 / Approve irreversible recovery, production changes, and high-impact actions. |
| C07 证据审计与验收 / Evidence audit and acceptance | 测试、差异、日志、Schema 和验收清单。 / Tests, diffs, logs, schemas, and acceptance checklists. | 检查字段完整性、证据对应关系和常见遗漏。 / Check field completeness, evidence mapping, and common omissions. | 对复杂交付进行独立审查、反方检查和结论强度评估。 / Independently review complex deliverables, counterarguments, and conclusion strength. | 最终接受交付物；未授权模型代替验收。 / Accept the final deliverable; do not delegate acceptance to a model. |
| C08 状态持久化与交接 / State persistence and handoff | 文件、数据库、Git 和版本化状态存储。 / Files, databases, Git, and versioned state storage. | 生成简洁状态摘要、决策记录和交接草稿。 / Generate concise state summaries, decision records, and handoff drafts. | 跨项目、长周期复杂状态综合。 / Synthesize complex long-running state across projects. | 确认关键决策和权威状态。 / Confirm key decisions and authoritative state. |
| C09 权限与风险治理 / Permission and risk governance | 确定性规则、最小权限、审批门槛和审计日志。 / Deterministic rules, least privilege, approval gates, and audit logs. | 识别风险类别并解释规则。 / Identify risk categories and explain policies. | 辅助分析复杂风险与取舍，但不能豁免规则。 / Assist with complex risk analysis and trade-offs, but cannot waive policies. | 对 A3 操作作出明确批准并承担最终责任。 / Explicitly approve A3 actions and retain final accountability. |
| C10 事实溯源与语义保真 / Provenance and semantic fidelity | 保存来源 URL、文件定位、时间和版本。 / Preserve source URLs, file locations, timestamps, and versions. | 将主张映射到已有来源，识别缺失引用和措辞漂移。 / Map claims to available sources and identify missing citations or semantic drift. | 处理复杂冲突、语义细节和多来源证据权衡。 / Handle complex conflicts, semantic nuance, and multi-source evidence trade-offs. | 确认私有材料的来源与使用边界。 / Confirm provenance and use boundaries for private material. |
| C11 交付物质量控制 / Artifact quality control | 文件格式、链接、Schema、构建和自动检查。 / File formats, links, schemas, builds, and automated checks. | 基础结构、语言、格式和完整性检查。 / Check basic structure, language, formatting, and completeness. | 高质量叙事、复杂代码审查和跨领域专业质量判断。 / Handle high-quality narrative, complex code review, and cross-domain quality judgment. | 对外发布前最终审核。 / Perform final review before external publication. |
| C12 能力抽象与维护 / Capability mining and maintenance | 任务日志、重复模式统计、版本和测试记录。 / Task logs, recurring-pattern statistics, versions, and test records. | 提示可能重复的模式和候选能力。 / Suggest recurring patterns and candidate capabilities. | 设计能力边界、接口、失败路径和测试方案。 / Design capability boundaries, interfaces, failure paths, and test plans. | 决定是否新增、合并、修改或淘汰能力。 / Decide whether to add, merge, revise, or retire a capability. |

## 6. 五条复合工作流路由矩阵｜Routing Matrix for the Five Composite Workflows

| 工作流 / Workflow | 工具箱主要工作 / Main tool work | 本地模型适合承担 / Suitable local-model work | 云端模型主要承担 / Main cloud-model work |
|---|---|---|---|
| W01 软件产品交付 / Software delivery | 仓库读取、代码操作、构建、测试、差异、部署证据和回滚记录。 / Repository access, code operations, builds, tests, diffs, deployment evidence, and rollback records. | 需求字段提取、任务分类、简单日志归类、测试结果摘要和状态更新草稿。 / Requirement extraction, task classification, simple log categorization, test summaries, and state-update drafts. | 架构设计、复杂编码方案、疑难故障、跨组件分析和技术取舍。 / Architecture design, complex implementation plans, difficult debugging, cross-component analysis, and technical trade-offs. |
| W02 研究与报告 / Research and reporting | 搜索、网页/文件读取、数据采集、表格处理和引用定位。 / Search, web/file retrieval, data collection, spreadsheet processing, and citation location. | 大批量资料分类、去重、摘要、实体/字段提取和研究材料初步整理。 / Bulk classification, deduplication, summarization, entity/field extraction, and initial research organization. | 研究框架、交叉证据解释、因果判断、反方观点和综合结论。 / Research framing, cross-evidence interpretation, causal judgment, counterarguments, and synthesis. |
| W03 内容生产 / Content production | 文档、幻灯片、图像和视频制作工具；格式与文件检查。 / Document, slide, image, and video production tools; format and file checks. | 素材分类、提纲初稿、格式整理、短文本改写和基础质量检查。 / Asset classification, outline drafts, formatting, short-form rewriting, and basic quality checks. | 核心叙事、复杂表达、专业内容、长文结构和高质量创意判断。 / Core narrative, complex expression, professional content, long-form structure, and high-quality creative judgment. |
| W04 决策支持 / Decision support | 数据收集、计算、情景表、敏感性分析和决策记录。 / Data collection, calculations, scenario tables, sensitivity analysis, and decision logs. | 选项提取、比较维度整理、事实字段归纳和常规情景摘要。 / Extract options, organize comparison dimensions, summarize factual fields, and produce routine scenario summaries. | 关键假设、最强反方观点、复杂风险、机会成本和策略权衡。 / Analyze key assumptions, strongest counterarguments, complex risks, opportunity costs, and strategic trade-offs. |
| W05 教育与训练 / Education and training | 学习记录、题目管理、计分、进度和阶段评估数据。 / Learning records, question management, scoring, progress, and assessment data. | 规则明确的练习生成、基础答题反馈、错题分类和进度摘要。 / Generate rule-based exercises, provide basic answer feedback, classify errors, and summarize progress. | 学习诊断、个性化课程设计、复杂概念讲解和训练策略调整。 / Learning diagnosis, personalized curriculum design, complex concept explanation, and training strategy adjustment. |

## 7. 本地小模型能力要求｜Local Small-Model Requirements

本地模型的选择必须由上述真实工作负载反推，不预先指定参数规模、品牌或量化等级。至少评估以下五项核心能力：  
Local-model selection must be derived from the real workloads above. Do not preselect a parameter size, brand, or quantization level. Evaluate at least these five core capabilities:

| 核心能力 / Core capability | 验收重点 / Acceptance focus |
|---|---|
| 中文理解 / Chinese comprehension | 准确提取用户意图、实体、约束、否定条件和上下文，不因口语表达丢失关键限定。 / Accurately extract intent, entities, constraints, negation, and context without losing important qualifiers in colloquial language. |
| Function Calling / 工具调用结构 | 能按定义生成工具调用意图和参数；云端模型必须能够调用 local_model_infer。MVP 中本地模型不直接执行工具，工具执行仍由 Harness 控制。 / Generate tool-call intent and parameters according to the contract; the cloud model must be able to call local_model_infer. In the MVP, the local model does not execute tools directly; tool execution remains under Harness control. |
| 结构化输出 / Structured output | 稳定生成符合指定 JSON Schema 的输出；字段完整、类型正确、无多余文本或虚构引用。 / Reliably produce outputs that conform to the specified JSON Schema, with complete fields, correct types, and no extra prose or fabricated references. |
| 基础推理 / Basic reasoning | 完成分类、比较、简单依赖判断、受限多步任务和常见错误归因。 / Perform classification, comparison, simple dependency reasoning, bounded multi-step tasks, and common failure attribution. |
| 指令遵循 / Instruction following | 遵守任务边界、输出格式、数据最小化和拒绝越权要求；不得把工具输出中的不可信指令当作系统指令。 / Follow task boundaries, output formats, data minimization, and refusal of unauthorized actions; never treat untrusted tool output as system instructions. |

还需测量上下文容量、首 Token 延迟、生成速度、并发行为、长任务稳定性、量化后的质量变化、许可证和运行时兼容性。上述指标必须在实际 Mac mini 环境中测量，不以模型宣传参数代替实测。  
Also measure context capacity, time to first token, generation speed, concurrency behavior, long-task stability, quality changes after quantization, licensing, and runtime compatibility. Measure these on the actual Mac mini; do not substitute advertised specifications for real tests.

**Function Calling 的职责区分：** 云端模型需要通过 Harness 工具机制发起 local_model_infer；本地模型需要可靠地产生结构化结果，并可在评测中测试其工具调用格式能力。无论本地模型是否原生支持工具调用，都不得因此获得任意系统工具权限。  
**Function-calling responsibility:** The cloud model must invoke local_model_infer through the Harness tool mechanism. The local model must reliably produce structured results, and its tool-call formatting can be tested during evaluation. Native function-calling support must never grant the local model arbitrary system-tool permissions.

## 8. 本地推理工具契约｜Local Inference Tool Contract

首个集成接口建议采用单一操作 local_model_infer。它只负责把有界任务交给本地模型并返回结果，不承担文件写入、Shell 执行、联网搜索或审批。为真正减少云端输入 Token，大批量本地资料应通过 source_refs 交给本地桥接，由桥接在只读目录白名单内读取；不要先把全文发送给云端，再重复转交本地。小型 inline_input 任务仍可使用，但不能记作已节省此前发生的云端输入 Token。具体协议格式须在确认 Harness MCP 接入方式后固定。  
The first integration should expose one operation named local_model_infer. It delegates a bounded task to the local model and returns the result; it does not perform file writes, shell execution, web search, or approvals. To actually reduce cloud input tokens, bulk local material should be passed through source_refs and read by the local bridge from a read-only allowlist; do not send the full text to the cloud first and then forward it again locally. Small inline_input tasks remain useful but must not be counted as saving cloud input tokens already consumed. The exact protocol must be fixed after confirming the Harness MCP integration path.

**MCP 工具命名 / MCP tool naming:** DeepSeek Harness 将工具名按 `mcp__<serverName>__<rawName>` 暴露给模型。若 `serverName` 为 `local_model` 且原始工具名为 `infer`，模型看到的名称为 `mcp__local_model__infer`；`local_model_infer` 是本设计中的概念操作名称。  
DeepSeek Harness exposes MCP tools as `mcp__<serverName>__<rawName>`. With `serverName=local_model` and raw tool name `infer`, the model-facing name is `mcp__local_model__infer`; `local_model_infer` is the conceptual operation name in this design.

**建议输入字段 / Proposed input fields**

- task_id：唯一任务标识。 / Unique task identifier.
- task_type：分类、提取、摘要、比较或其他已批准的任务类型。 / Classification, extraction, summarization, comparison, or another approved task type.
- instruction：本次子任务的明确指令。 / Explicit instruction for the subtask.
- input_text / source_refs：二选一。小型任务可传最小文本；大批量本地资料应只传工作区相对引用，由本地 MCP 桥接按只读 allowlist 读取并分块送入本地模型。 / Choose one: small tasks may pass minimal inline text; bulk local material should pass workspace-relative references, which the local MCP bridge reads from a read-only allowlist and chunks for local inference.
- output_schema：期望返回的 JSON Schema 或固定结构。 / Expected JSON Schema or fixed structure.
- constraints：长度、范围、语言和禁止事项。 / Length, scope, language, and prohibited actions.
- timeout_ms：本次调用的超时限制。 / Timeout limit for the call.

**建议输出字段 / Proposed output fields**

- task_id：回传原任务标识。 / Original task identifier.
- status：SUCCESS、PARTIAL、FAILED 或 ESCALATE。 / SUCCESS, PARTIAL, FAILED, or ESCALATE.
- result：结构化任务结果。 / Structured task result.
- evidence_refs：输入中真实存在且可核验的来源引用。 / Verifiable source references that actually exist in the input.
- limitations：已知限制和未完成部分。 / Known limitations and incomplete work.
- escalation_reason：需要转交云端或人工处理的原因。 / Reason for escalation to the cloud or a human.

本地适配器必须执行 JSON / Schema 校验、超时控制、最大调用次数限制和错误分类。模型自报的 confidence 只能作为辅助信号，不能单独决定高风险任务是否通过。  
The local adapter must enforce JSON/schema validation, timeouts, maximum call counts, and failure classification. Model-reported confidence is only a supporting signal and cannot independently determine whether a high-risk task passes.

本地模型输出默认视为不可信数据。它不能修改权限、改变工具白名单、批准 A3 操作、覆盖项目状态或自行触发外部副作用。需要写入时，必须由 Harness 按既有权限策略调用对应工具。  
Local-model output is untrusted data by default. It cannot change permissions, alter tool allowlists, approve A3 actions, overwrite project state, or trigger external side effects on its own. Any write must be performed by the Harness through the corresponding tool under existing permission policies.

## 9. 路由、升级与失败处理｜Routing, Escalation, and Failure Handling

**适合本地模型的条件 / Local-model eligibility**

- 任务边界明确、输入范围有限、输出格式固定。 / The task is bounded, input scope is limited, and output format is fixed.
- 已有对应测试样例，且本地模型在该任务类型上达到验收门槛。 / Test cases exist and the local model has met the acceptance threshold for that task type.
- 不需要最新外部事实、复杂跨领域判断或高风险决策。 / The task does not require current external facts, complex cross-domain judgment, or high-risk decisions.
- 失败后可安全停止、重试一次或升级，不会产生不可逆副作用。 / Failure can safely stop, retry once, or escalate without irreversible side effects.

**必须升级云端或人工的条件 / Mandatory cloud or human escalation**

- 需求存在重大歧义、相互冲突或需要重新定义问题。 / The request has material ambiguity, conflicting requirements, or requires problem reframing.
- 涉及复杂架构、跨领域推理、重大商业判断或无法由现有测试覆盖的新任务。 / The task involves complex architecture, cross-domain reasoning, major business judgment, or a novel case not covered by existing tests.
- 本地输出 Schema 校验失败、证据引用不存在、结果自相矛盾或重复失败。 / Local output fails schema validation, cites nonexistent evidence, contradicts itself, or repeatedly fails.
- 涉及删除、覆盖、对外发送、付款、生产发布、权限变更或敏感数据等 A3 操作。 / The task involves A3 actions such as deletion, overwrite, external sending, payment, production release, permission changes, or sensitive data.
- 本地模型运行时不可用、资源压力过高或结果质量低于既定阈值。 / The local runtime is unavailable, resource pressure is excessive, or output quality is below the defined threshold.

升级不代表自动重试所有步骤。Harness 必须保留已完成结果、失败原因和调用证据，避免重复执行有副作用的操作。  
Escalation does not mean automatically retrying every step. The Harness must preserve completed results, failure reasons, and call evidence to avoid repeating side-effecting operations.

## 10. 成本核算与效果判断｜Cost Accounting and Evaluation

每类代表性任务都应先建立云端单独执行的基线，再与混合模式进行同任务、同输入、同质量门槛的比较。  
For each representative task type, establish a cloud-only baseline and compare it with the hybrid mode using the same task, same input, and same quality threshold.

建议记录：云端输入 Token、云端输出 Token、云端 API 费用、本地推理耗时、Harness 编排耗时、失败/重试次数、人工修正时间、最终质量和完成率。  
Record cloud input tokens, cloud output tokens, cloud API cost, local inference time, Harness orchestration time, failure/retry count, human correction time, final quality, and completion rate.

**净节省计算 / Net savings calculation**

净节省金额 = 云端基线费用 − 混合模式实际云端费用。  
Net savings = cloud-only baseline cost − actual cloud cost in hybrid mode.

净节省率 =（云端基线费用 − 混合模式实际云端费用）÷ 云端基线费用。  
Net savings rate = (cloud-only baseline cost − actual hybrid cloud cost) ÷ cloud-only baseline cost.

本地电力、设备占用和维护成本可单独记录；不能把减少 Token、减少 API 调用次数或本地推理免费当作净节省的充分证据。必须同时检查任务质量和人工返工成本。  
Local electricity, device occupancy, and maintenance costs may be tracked separately. Reduced tokens, fewer API calls, or the absence of a per-call local inference fee are not sufficient proof of net savings. Task quality and human rework must also be checked.

如果混合模式的总云端费用没有下降，或质量、延迟、稳定性明显变差，则缩小本地委派范围或关闭对应路由，不为了使用本地模型而强行委派。  
If hybrid mode does not reduce cloud cost, or materially degrades quality, latency, or stability, narrow the delegation scope or disable that route. Do not delegate merely to justify using a local model.

## 11. Mac mini M4 资源与部署约束｜Mac mini M4 Resource and Deployment Constraints

当前部署档案记录 Mac mini M4 为 Apple Silicon、16 GiB 统一内存；外置 1 TB SSD 的格式、卷名和稳定性尚未完成检查。以上是现有记录，不代表当前实时资源状态。  
The current deployment dossier records an Apple Silicon Mac mini M4 with 16 GiB unified memory. The external 1 TB SSD's format, volume name, and reliability have not yet been checked. These are recorded facts, not a statement of current live resource status.

因此，本设计不预先指定模型参数规模、量化等级、推理框架或权重存储路径。必须先测量 Harness、macOS 和常驻工具的内存占用，再为单一候选模型预留足够运行余量。  
Accordingly, this design does not preselect model parameter size, quantization, inference framework, or model-weight storage path. Measure the memory used by Harness, macOS, and resident tools first, then reserve adequate headroom for one candidate model.

**首阶段只评估并部署一个本地模型。** 不同时安装多个模型，不为不同小任务频繁切换模型，不引入多个重叠的模型路由器。模型常驻或空闲卸载策略，应依据实际调用频率、内存压力和加载/卸载耗时决定；不得在没有测量的情况下反复加载和卸载。  
**Evaluate and deploy only one local model in the first phase.** Do not install multiple models concurrently, frequently switch models for small tasks, or introduce overlapping model routers. Decide whether to keep the model resident or unload it after idle periods based on measured call frequency, memory pressure, and load/unload time; do not repeatedly load and unload without evidence.

外置 SSD 未完成检查前，不迁移模型权重或 Harness 运行目录。保留现有 Node.js、Docker/Colima 和其他系统服务；本项目不以部署模型为由重建或替换无关环境。  
Do not move model weights or Harness runtime directories before the external SSD has been checked. Preserve existing Node.js, Docker/Colima, and other system services; do not rebuild or replace unrelated environments merely to deploy a model.

## 12. 分阶段实施与验收门槛｜Phased Implementation and Acceptance Gates

| 阶段 / Phase | 工作内容 / Work | 完成标准 / Exit criteria |
|---|---|---|
| P0 设计确认 / Design confirmation | 确认本文件中的拓扑、职责矩阵、权限边界和成本目标。 / Confirm the topology, responsibility matrix, permission boundaries, and cost objectives in this document. | 设计边界明确；没有模型安装或系统变更。 / Design boundaries are explicit; no model installation or system change. |
| P1 工作负载基线 / Workload baseline | 选取覆盖 C01–C12 与 W01–W05 的代表性任务，记录当前云端成本、质量和耗时。 / Select representative tasks across C01–C12 and W01–W05; record current cloud cost, quality, and latency. | 形成可重复的基线任务集和记录模板。 / A reproducible baseline task set and recording template exist. |
| P2 模型评测 / Model evaluation | 对少量候选模型进行中文理解、Function Calling 格式、JSON、推理、指令遵循和资源测试。 / Test a small candidate set for Chinese comprehension, function-calling format, JSON, reasoning, instruction following, and resource use. | 选出一个满足任务门槛且在 16 GiB 环境中有足够余量的候选模型。 / Select one model that meets task thresholds and leaves sufficient headroom on the 16 GiB host. |
| P3 本地运行时 / Local runtime | 选定一种运行时，部署单一模型，并通过 loopback 暴露受限推理接口。 / Select one runtime, deploy one model, and expose a restricted inference interface over loopback. | 启停、健康检查、稳定性、资源占用和卸载/恢复行为均有记录。 / Startup, shutdown, health checks, stability, resource use, and unload/recovery behavior are recorded. |
| P4 Harness 桥接 / Harness bridge | 注册 local_model_infer 工具，让云端模型能够发起调用；Harness 在本机执行并回传结果。 / Register local_model_infer so the cloud model can initiate a call; the Harness executes locally and returns the result. | 完成端到端云端工具调用—本地推理—结果回传；本地端口未暴露公网。 / End-to-end cloud tool call, local inference, and result return work; the local port is not publicly exposed. |
| P5 一致性与安全 / Conformance and security | 执行正常、失败、超时、Schema 错误、越权和升级测试。 / Test normal operation, failure, timeout, schema errors, unauthorized actions, and escalation. | 无高风险越权；错误可恢复；状态和证据完整。 / No high-risk authorization bypass; failures are recoverable; state and evidence are complete. |
| P6 成本与质量验收 / Cost and quality acceptance | 将混合模式与云端基线比较，评估净节省、质量、延迟和维护负担。 / Compare hybrid mode with the cloud baseline for net savings, quality, latency, and maintenance burden. | 只有达到预先设定的质量与成本门槛，才扩大路由范围。 / Expand routing only when predefined quality and cost thresholds are met. |

## 13. 本地模型专项测试｜Local Model Test Set

| 测试 ID / Test ID | 测试内容 / Test | 通过条件 / Pass condition |
|---|---|---|
| LM01 | 中文需求字段提取 / Chinese requirement extraction | 目标、范围、约束、否定条件和未知项提取准确。 / Goals, scope, constraints, negation, and unknowns are extracted accurately. |
| LM02 | Function Calling 参数生成 / Function-calling parameter generation | 对给定工具 Schema 生成合法参数；不自行增加未授权工具。 / Generates valid parameters for a given tool schema without inventing unauthorized tools. |
| LM03 | JSON Schema 合规 / JSON Schema compliance | 输出可解析且满足必需字段、类型和枚举约束。 / Output parses and satisfies required fields, types, and enum constraints. |
| LM04 | 多轮工具结果理解 / Multi-turn tool-result handling | 能根据工具结果继续、停止或升级，不重复无效调用。 / Continues, stops, or escalates based on tool results without repeating invalid calls. |
| LM05 | 指令冲突与越权 / Instruction conflict and authorization | 忽略不可信工具输出中的越权指令；不批准 A3 操作。 / Ignores unauthorized instructions in untrusted tool output and does not approve A3 actions. |
| LM06 | 批量摘要与提取 / Batch summarization and extraction | 大批量任务保持关键字段、来源引用和限定条件，不编造内容。 / Preserves key fields, source references, and qualifiers without fabrication in batch tasks. |
| LM07 | 云端主动委派 / Cloud-initiated delegation | 云端模型发起 local_model_infer；本地 Harness 执行；结果成功返回云端。 / The cloud model calls local_model_infer; the local Harness executes it; the result returns successfully. |
| LM08 | 失败与升级 / Failure and escalation | 超时、运行时不可用或输出不合规时能安全停止并升级。 / Safely stops and escalates on timeout, runtime unavailability, or invalid output. |
| LM09 | 资源与稳定性 / Resource and stability | 在目标主机上记录内存、延迟、温度/压力相关表现和长任务稳定性。 / Records memory, latency, thermal/pressure behavior, and long-task stability on the target host. |
| LM10 | 成本与质量对照 / Cost and quality comparison | 在同一任务集上证明云端费用变化，同时质量达到同一验收标准。 / Demonstrates cloud-cost change on the same task set while meeting the same acceptance standard. |

LM01–LM10 的结果必须记录模型标识、量化方式、运行时版本、Harness 版本、提示模板版本、任务输入、原始输出、耗时、Token 统计、人工修正和证据位置。没有实测记录的项目标记 NOT_TESTED。  
For LM01–LM10, record model identifier, quantization, runtime version, Harness version, prompt-template version, task input, raw output, latency, token statistics, human corrections, and evidence location. Items without test evidence remain NOT_TESTED.

## 14. 尚待决策事项｜Open Decisions

本阶段已形成基于公开资料的研究建议，但在本机预检、安装和专项测试前均保持 RECOMMENDED / NOT_TESTED，不等同于最终部署决策。  
This phase has produced research-based recommendations from public documentation, but all remain RECOMMENDED / NOT_TESTED until host preflight, installation, and dedicated tests are complete; they are not final deployment decisions.

1. **运行时建议 / Runtime recommendation:** 首选 Ollama；MLX-LM 作为性能对照，llama.cpp 作为可控性后备。 / Prefer Ollama; use MLX-LM for performance comparison and llama.cpp as a control-oriented fallback.
2. **模型建议 / Model recommendation:** 首选候选为 `qwen3.5:4b-q4_K_M`；`qwen3.5:9b-q4_K_M` 仅作为资源余量允许时的后续对照。 / First candidate is `qwen3.5:4b-q4_K_M`; test `qwen3.5:9b-q4_K_M` later only if resource headroom allows.
3. **Harness 桥接建议 / Harness bridge recommendation:** DeepSeek Harness 0.2.2-rc.3 的 MCP Client 已在该版本标签文档中确认支持 stdio 和 streamable-http；首选 stdio 本地进程。 / The MCP Client in the 0.2.2-rc.3 tag is documented to support stdio and streamable-http; prefer a local stdio process.
4. **云端链路 / Cloud path:** 仍需在当前账户、模型和会话中实测云端模型发起工具调用并接收同一会话的结果。 / Still test cloud tool invocation and same-session result receipt in the actual account, model, and session.
5. **成本与质量 / Cost and quality:** 建立代表性任务集、云端费用基线和净节省门槛；大批量本地资料必须通过 source_refs 在本地读取，不能先把全文送入云端。 / Establish representative tasks, cloud-cost baselines, and net-savings thresholds; bulk local sources must be read locally through source_refs rather than sent to the cloud first.
6. **存储 / Storage:** 外置 SSD 格式、挂载稳定性和备份未核实；首个约 3.3 GB 模型可先留在内部盘默认模型目录。 / External SSD format, mount reliability, and backup remain unverified; the first ~3.3 GB model can remain in the default internal model directory.
7. **驻留策略 / Residency:** Ollama `keep_alive` 默认 5 分钟；需结合实际调用频率和内存压力决定是否缩短或卸载。 / Ollama's default `keep_alive` is five minutes; adjust only after measuring call frequency and memory pressure.

## 15. 架构决策摘要｜Architecture Decision Summary

- 保留 DeepSeek Harness 作为 Mac mini 上的本地主控运行环境。 / Keep DeepSeek Harness as the local coordinator on the Mac mini.
- 云端大模型可以通过 Harness 工具桥接主动委派本地模型；本地 Harness 执行推理并回传结果。 / The cloud model can actively delegate to the local model through a Harness tool bridge; the local Harness executes inference and returns the result.
- 本地模型首阶段只部署一个，作为受限推理工作节点，不直接拥有系统工具权限。 / Deploy only one local model in the first phase as a restricted inference worker, without direct system-tool permissions.
- 确定性操作继续由现有工具箱和工作流完成，不重复造轮子。 / Deterministic operations remain with the existing toolbox and workflows; do not duplicate functionality.
- 云端模型保留复杂推理、综合判断和高级内容任务。 / The cloud model retains complex reasoning, synthesis, and advanced content tasks.
- 成本节省必须通过同任务基线、实际 API 费用和质量验收证明。 / Cost savings must be demonstrated through same-task baselines, actual API costs, and quality acceptance.
- 任何本地部署、运行时变更和系统权限调整都必须在设计确认后单独执行并验收。 / Any local deployment, runtime change, or system-permission adjustment must be performed and accepted separately after design confirmation.

**本设计的成功标准不是“本地模型成功运行”，而是 PACS 在不增加冗余组件、不降低结果质量、不削弱权限治理的前提下，能够把适合的工作交给本地模型，并以证据证明协同模式带来了实际收益。**  
**Success is not merely getting a local model to run. Success means PACS can delegate suitable work locally, with evidence that the collaboration produces real benefits without redundant components, degraded quality, or weakened permission governance.**
