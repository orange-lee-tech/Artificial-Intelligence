# PACS｜个人 AI 能力系统
# PACS | Personal AI Capability System

**PACS（Personal AI Capability System）是一套模型无关、平台无关、可迁移、可组合、可验证的个人 AI 能力资产体系。**
**PACS (Personal AI Capability System) is a model- and platform-agnostic collection of portable, composable, and verifiable AI capabilities.**

> 核心理念：迁移能力，而不是迁移一篇长提示词。
> Core principle: Transfer capabilities, not a giant prompt.

PACS 将经过真实协作验证的工作方法拆解为治理原则、统一能力契约、原子能力、复合工作流和平台适配层，使不同模型与 AI Harness 能够复用同一套工作逻辑。
PACS decomposes practices validated through real collaboration into governance principles, a shared capability contract, atomic capabilities, composable workflows, and platform adapters—allowing different models and AI harnesses to reuse the same operating logic.

## 项目目标｜Project Goals

- **能力迁移：** 将个人 AI 使用经验抽象为可移植的能力模块，而不是依赖某个模型的专属提示词。  
  **Capability portability:** Turn personal AI practices into portable modules instead of relying on prompts tied to a particular model.
- **模块组合：** 通过统一接口组合原子能力，形成适用于软件工程、研究、教育、内容生产和决策支持的工作流。  
  **Composable modules:** Combine atomic capabilities through shared interfaces to build workflows for software engineering, research, education, content production, and decision support.
- **平台适配：** 将公共能力与平台差异分离，避免为每个平台重复建设一套方法论。  
  **Platform adaptation:** Separate shared capabilities from platform-specific details, avoiding the need to rebuild the methodology for every platform.
- **可靠执行：** 强调证据、权限、验收、状态持久化和人类最终控制。  
  **Reliable execution:** Prioritize evidence, permissions, acceptance criteria, persistent state, and human control.

## 核心架构｜Core Architecture

PACS 由七个相互配合的层次组成：
PACS consists of seven cooperating layers:

1. **Constitution｜治理宪章：** 规定人机权责、证据标准、风险边界和授权原则。  
   **Constitution:** Defines human–AI responsibilities, evidence standards, risk boundaries, and authorization principles.
2. **Capability Contract｜能力契约：** 统一能力模块的元数据、输入、输出、执行和验收规范。  
   **Capability Contract:** Standardizes capability metadata, inputs, outputs, execution procedures, and acceptance criteria.
3. **Capabilities｜原子能力：** 提供单一职责、可独立调用和测试的能力模块。  
   **Capabilities:** Provide single-purpose modules that can be invoked and tested independently.
4. **Workflows｜复合工作流：** 按依赖关系组合多个能力，完成端到端任务。  
   **Workflows:** Compose capabilities according to their dependencies to complete end-to-end tasks.
5. **Adapters｜平台适配层：** 将公共能力映射到不同模型、Harness 和工具环境。  
   **Adapters:** Map shared capabilities to different models, harnesses, and tool environments.
6. **Harness / Runtime｜执行环境：** 提供模型、Agent、工具、上下文和运行机制。  
   **Harness / Runtime:** Provides models, agents, tools, context, and execution mechanisms.
7. **Human Owner｜人类所有者：** 负责目标、优先级、授权、重大决策和最终验收。  
   **Human Owner:** Retains responsibility for goals, priorities, authorization, major decisions, and final acceptance.

## 能力目录｜Capability Catalog

当前版本包含 12 项原子能力（C01–C12）和 5 条复合工作流（W01–W05）。
The current release contains 12 atomic capabilities (C01–C12) and 5 composable workflows (W01–W05).

**十二项原子能力｜The 12 Atomic Capabilities**

- **C01 需求澄清：** 将请求转化为明确的目标、范围和验收标准。  
  **C01 Requirements Clarification:** Converts requests into explicit goals, scope, and acceptance criteria.
- **C02 上下文获取：** 获取并核对完成任务所需的项目背景和证据。  
  **C02 Context Acquisition:** Retrieves and reconciles the project context and evidence needed for a task.
- **C03 问题建模：** 识别系统边界、依赖、约束、因果关系和未知项。  
  **C03 Problem Modeling:** Identifies system boundaries, dependencies, constraints, causal relationships, and unknowns.
- **C04 任务拆解与编排：** 将目标拆成可执行、可检查和可恢复的任务。  
  **C04 Task Orchestration:** Breaks goals into executable, verifiable, and recoverable tasks.
- **C05 工具选择与委派：** 为任务选择合适的模型、Agent、工具和审计角色。  
  **C05 Tool Routing and Delegation:** Selects suitable models, agents, tools, and reviewers for a task.
- **C06 执行监督与恢复：** 跟踪执行状态，处理失败、重试和恢复。  
  **C06 Execution Control and Recovery:** Tracks execution state and handles failures, retries, and recovery.
- **C07 证据审计与验收：** 根据验收标准独立检查交付物和执行证据。  
  **C07 Evidence Audit and Acceptance:** Independently checks deliverables and execution evidence against acceptance criteria.
- **C08 状态持久化与交接：** 保存项目状态、决策、风险和交接信息。  
  **C08 State Persistence and Handoff:** Preserves project state, decisions, risks, and handoff information.
- **C09 权限与风险治理：** 执行最小权限原则，并管控高影响操作。  
  **C09 Permission and Risk Governance:** Enforces least privilege and controls high-impact operations.
- **C10 事实溯源与语义保真：** 区分事实、推断、假设和建议，保持来源可追溯。  
  **C10 Provenance and Semantic Fidelity:** Separates facts, inferences, assumptions, and proposals while preserving traceability.
- **C11 交付物质量控制：** 检查文档、幻灯片、代码等成果的完整性和可用性。  
  **C11 Artifact Quality Control:** Checks the completeness and usability of documents, slides, code, and other deliverables.
- **C12 能力抽象与维护：** 从经过验证的工作中提取、测试、版本化和维护能力。  
  **C12 Capability Mining and Maintenance:** Extracts, tests, versions, and maintains capabilities from validated work.

**五条复合工作流｜The Five Composite Workflows**

- **W01 软件产品交付：** 需求、架构、施工、测试、发布与交接。  
  **W01 Software Delivery:** Requirements, architecture, implementation, testing, release, and handoff.
- **W02 研究与报告：** 研究问题、证据收集、交叉验证和报告交付。  
  **W02 Research and Reporting:** Research questions, evidence gathering, cross-validation, and report delivery.
- **W03 内容生产：** 叙事设计、素材组织、制作和质量验收。  
  **W03 Content Production:** Narrative design, asset organization, production, and quality acceptance.
- **W04 决策支持：** 选项比较、关键假设、反方观点、风险和验证动作。  
  **W04 Decision Support:** Option comparison, key assumptions, counterarguments, risks, and validation actions.
- **W05 教育与训练：** 学习诊断、阶段计划、训练留痕和效果评估。  
  **W05 Education and Training:** Learning diagnosis, staged plans, training records, and outcome evaluation.

## 平台适配｜Platform Adapters

首批目标平台为 Claude、DeepSeek Harness、Trae、WorkBuddy 和豆包。
The initial target platforms are Claude, DeepSeek Harness, Trae, WorkBuddy, and Doubao.

平台适配器负责处理各平台的 Skill 格式、规则入口、工具接入、权限机制和状态管理差异；公共能力的语义和验收标准保持一致。
Platform adapters handle differences in Skill formats, rule entry points, tool integrations, permission models, and state management while keeping shared capability semantics and acceptance criteria consistent.

平台状态采用以下定义：
Platform status uses the following definitions:

- **DOCUMENTED：** 已核对公开官方资料，但不代表当前账户已成功导入。  
  **DOCUMENTED:** Public official documentation has been reviewed; this does not mean import has succeeded in the current account.
- **NOT_TESTED：** 尚未在目标账户和实际运行环境中完成测试。  
  **NOT_TESTED:** Testing has not yet been completed in the target account and runtime environment.
- **VERIFIED：** 已完成实际一致性测试，并有证据支持。  
  **VERIFIED:** Practical conformance tests have passed and supporting evidence is available.
- **PARTIAL / UNSUPPORTED：** 部分可用，或已确认不支持。  
  **PARTIAL / UNSUPPORTED:** Partially supported, or confirmed to be unsupported.

公开文档确认不等于账户级功能可用；任何平台都不会在缺少实际证据时被标记为 VERIFIED。
Documentation does not guarantee account-level availability; no platform is marked VERIFIED without practical evidence.

## 快速开始｜Quick Start

克隆仓库并进入项目目录：
Clone the repository and enter the project directory:

```bash
git clone https://github.com/orange-lee-tech/Artificial-Intelligence.git
cd Artificial-Intelligence
```

生成平台 Skill 导出包：
Generate platform-specific Skill packages:

```bash
python tools/export-skills.py
```

导出脚本会生成 Claude ZIP 包、Trae 项目级 Skill 目录、DeepSeek Harness 项目级 Skill 目录，以及通用 Skill 副本。
The exporter generates Claude ZIP packages, project-level Skill directories for Trae and DeepSeek Harness, and portable copies of the canonical Skills.

**注意：** 导出只负责文件格式转换，不会自动安装平台、启用插件、连接工具或授予权限。
**Note:** Exporting only transforms file layouts. It does not install platforms, enable plugins, connect tools, or grant permissions.

## 快速入口｜Key Resources

- [系统总览｜System Overview](docs/00-PACS-OVERVIEW.md)：了解 PACS 的目标、概念和使用方式。  
  Learn about PACS goals, concepts, and usage.
- [宪章｜Constitution](docs/01-CONSTITUTION.md)：了解人机权责、风险边界和治理原则。  
  Review human–AI responsibilities, risk boundaries, and governance principles.
- [能力契约｜Capability Contract](docs/02-CAPABILITY-CONTRACT.md)：了解统一能力接口和模块规范。  
  Understand the shared capability interface and module specification.
- [个人 AI 使用画像｜User Profile](docs/03-USER-PROFILE.md)：了解需要迁移的协作习惯和工作场景。  
  Review the collaboration preferences and work scenarios to be transferred.
- [架构说明｜Architecture](docs/04-ARCHITECTURE.md)：了解能力、工作流、Agent、Harness 和工具之间的关系。  
  Understand how capabilities, workflows, agents, harnesses, and tools fit together.
- [能力目录｜Capability Catalog](catalog/capabilities.yaml)：查看 C01–C12 的能力索引。  
  Browse the C01–C12 capability index.
- [工作流目录｜Workflow Catalog](catalog/workflows.yaml)：查看 W01–W05 的工作流索引。  
  Browse the W01–W05 workflow index.
- [平台适配指南｜Platform Adapter Guide](adapters/PLATFORM-ADAPTER-GUIDE.md)：了解不同平台的适配原则。  
  Learn the principles for adapting PACS to different platforms.
- [平台矩阵｜Platform Matrix](adapters/PLATFORM-MATRIX.md)：查看平台适配和验证状态。  
  Check platform adaptation and validation status.
- [迁移运行手册｜Migration Runbook](docs/MIGRATION-RUNBOOK.md)：按步骤执行跨平台迁移。  
  Follow the step-by-step cross-platform migration process.
- [一致性测试｜Conformance Tests](tests/CONFORMANCE-TESTS.md)：验证不同平台是否遵守 PACS 的共同规范。  
  Verify whether different platforms follow the shared PACS contract.
- [Skill 导出脚本｜Skill Exporter](tools/export-skills.py)：生成初始平台导入包。  
  Generate initial platform import packages.
- [项目状态模板｜Project State Template](templates/PROJECT-STATE.md)：跨会话、跨模型和跨人员交接项目。  
  Handoff projects across sessions, models, and people.
- [AI 协作行为规范｜AI Collaboration Principles](docs/AI-COLLABORATION-PRINCIPLES.md)：查看适用于 ChatGPT 个性化指令及跨模型协作的基础行为规范。  
  Review the reusable behavioral baseline for ChatGPT personalization and cross-model AI collaboration.
- [仓库协作约定｜Repository Working Agreement](docs/REPOSITORY-WORKING-AGREEMENT.md)：查看 main 分支直接施工规则。  
  Review the direct-to-main repository workflow.

## 治理与质量｜Governance and Quality

PACS 强调证据优先、最小权限、明确授权、独立验收和状态持久化。主动执行不等于无限授权；工具调用成功不等于任务完成；代码提交不等于生产验收。
PACS emphasizes evidence-first work, least privilege, explicit authorization, independent acceptance, and persistent state. Proactive execution is not unlimited authorization; a successful tool call does not mean a task is complete; and a code commit does not mean production acceptance.

复杂任务应区分 CODE、LOCAL_TEST、CI、PROD 和 DEVICE 等验证层级，并记录每个结论对应的证据。
Complex tasks should distinguish verification levels such as CODE, LOCAL_TEST, CI, PROD, and DEVICE, and record the evidence supporting each conclusion.

## 版本与成熟度｜Version and Maturity

当前版本：**PACS 0.1.1**。
Current version: **PACS 0.1.1**.

能力状态包括 DRAFT、READY、VALIDATED 和 DEPRECATED；成熟度标记包括 V（实践依据）、S（书面规范）、X（跨平台实测）和 A（仍需抽象或补测）。
Capability states include DRAFT, READY, VALIDATED, and DEPRECATED; maturity markers include V (practice-backed), S (specified), X (cross-platform tested), and A (abstraction or further testing required).

本版本已建立核心能力资产和平台适配框架，但五个平台的账户级导入与一致性测试仍需逐一完成。
This release establishes the core capability assets and platform adapter framework, while account-level imports and conformance tests remain to be completed for each of the five platforms.

## 仓库协作｜Repository Collaboration

本仓库默认直接在 `main` 分支修改，不创建新的功能分支或临时分支。每次修改前必须读取最新文件和分支状态，修改后审查差异、执行必要检查，再提交。
This repository uses `main` as the default working branch. Do not create new feature or temporary branches. Before each change, inspect the latest files and branch state; after editing, review the diff, run the necessary checks, and then commit.

如遇到分支保护、权限不足或并发修改冲突，应停止并说明阻塞原因，不得通过强制推送或绕过保护规则解决。
If branch protection, insufficient permissions, or concurrent changes block a direct update, stop and report the blocker. Do not bypass protections or use force pushes to work around them.
