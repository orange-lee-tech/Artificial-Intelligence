# 部署与验证日志｜Deployment and Verification Log

**设备代号｜Device:** Mac mini M4 (AI controller)  
**日志起始｜Log started:** 2026-11-14  
**约定｜Convention:** FACT / USER_REPORTED / INFERENCE / PROPOSAL / UNKNOWN; NOT_STARTED / PARTIAL / VERIFIED

## 2026-11-14：初始安装与配置｜Initial Installation and Configuration

### 已观察记录｜Reported Evidence

1. **FACT — 用户提供的终端输出 / Supplied terminal output:** Apple Silicon ARM64, macOS 26.2, 16 GiB memory. Internal system disk approximately 228 GiB with 146 GiB available. Existing Node.js v22.22.3 and npm 10.9.8.  
   The host baseline is documented; no system packages were changed during this record-keeping action.
2. **FACT — 用户提供的 Docker 检查 / Supplied Docker check:** Docker CLI v29.7.1 and Compose v5.4.0 available, active context desktop-linux; daemon socket unavailable during inspection.  
   Docker Engine health remains unresolved and is not a blocker for the selected native desktop deployment.
3. **FACT — 用户提供的 Gatekeeper 输出 / Supplied Gatekeeper result:** DeepSeek Harness.app exists in /Applications. The macOS assessment returned accepted; source Notarized Developer ID; publisher Hangzhou DeepSeek Artificial Intelligence Co., Ltd.  
   This confirms app presence and macOS trust assessment, not application-level task correctness.
4. **USER_REPORTED — API 配置 / API setup:** Official DeepSeek API configured in the Harness application; user obtained a normal Chinese conversational response.  
   Selected provider/model identity and live API traces were not independently inspected.
5. **USER_REPORTED — 工具描述 / Tool description:** The Harness model listed file, shell, web, subagent, scheduling, and Office-related capabilities. It explicitly reported that it executed no commands and modified no files during that test.  
   This establishes that the model can describe tools; actual tool invocation and permission behavior remain NOT_TESTED.

## 2026-11-14：工具调用烟雾测试｜Agent Tool Smoke Test

### 测试条件与结果｜Test Setup and Outcome

**结论：核心读写与 Shell 工具基础验收通过（基于用户提供的 Harness 执行报告和 macOS 终端复核）。** 未由本仓库维护者或远程工具直接运行主机命令。  
**Result:** Baseline file-read, file-write, and shell execution checks passed based on user-supplied Harness output and a separate macOS terminal verification; no host command was run by the repository maintainer or remote assistant.

| 检查 / Check | 结果 / Outcome | 证据 / Evidence |
| --- | --- | --- |
| 输入文件读取 / Input file read | PASS | Harness reports `read` after path discovery; expected test line matched |
| 工作目录检测 / Shell `pwd` | PASS (user-reported tool invocation) | Harness reported the workspace root as `~/AIWorkspace` |
| 文件创建 / File creation | PASS | Harness reported `write` of `harness-smoke-test/output.txt` |
| 文件回读 / File read-back | PASS | Harness `read` returned `HARNESS_TOOL_TEST_OK` |
| 终端交叉验证 / Independent terminal check | PASS (user-provided output) | macOS `cat` printed `HARNESS_TOOL_TEST_OK` |

### 重要发现｜Workspace Root Mismatch

**FACT — 用户提供的工具记录 / User-supplied tool trace:** Harness 当前工作区为 `~/AIWorkspace`，而测试文件位于子目录 `harness-smoke-test`。首次按工作区根目录读取 `input.txt` 失败（not found），随后通过文件搜索定位后成功读取。  
**FACT — User-supplied tool trace:** The active workspace root was `~/AIWorkspace`, while files lived under `harness-smoke-test`. Reading `input.txt` directly from the root initially failed; path discovery located the test file and the subsequent read succeeded.

**判断 / Assessment:** 这是工作区选择与相对路径的使用差异，不是 DeepSeek API 失败。正式项目需明确工作区根目录和相对路径约定，避免跨项目误操作。  
**Assessment:** This is a workspace-root/relative-path mismatch, not an API failure. Define explicit project roots and relative paths to avoid cross-project actions.

### 证据界限与后续任务｜Evidence Limits and Follow-up

- 对模型声称调用了 `bash`, `read`, `glob`, `write` 的详细工具轨迹尚未独立读取；macOS 侧对输出文件的核验已由用户提供。  
  Individual tool-event telemetry was not independently inspected; the user supplied a separate terminal read of the output file.
- 尚未检查 Harness Desktop 的实际版本、真实审批设置、macOS 系统授权、自动化控制或备份恢复能力。  
  Desktop version, actual approval settings, macOS system permissions, native automation, and restore capability remain unverified.
- 后续先核查审批策略与工作区管理，再做有限、可逆的 macOS 自动化测试。  
  Next audit the approval policy and workspace management, then conduct a narrow, reversible native macOS automation test.

## 2026-11-14：版本、权限与插件发现｜Version, Permissions and Plugin Discovery

**USER_REPORTED — 设置截图 / User-provided settings screenshots:** 桌面版版本为 `0.2.2-rc.3`；默认 Agent 为 Standard；通用设置的新会话权限为“工作区内修改”；更新渠道显示“开发版”。插件列表中 Computer Use 和自定义插件索引均列为随附的实验性项目，截图显示它们尚未启用。  
**USER_REPORTED — Settings screenshots:** Desktop version is `0.2.2-rc.3`; default agent preset is Standard; new sessions default to Workspace Write; update channel shows Nightly/Development. Computer Use and Custom Plugin Index are bundled experimental items and appeared disabled.

**FACT — 官方发布与分发 / Official release and distribution:** 官方 `deepseek-ai/deepseek-harness` 发布 `dsh-v0.2.2-rc.3` 于 2026-11-13，属于预发布版本，官方该 Release 未提供 `.dmg` 附件；DeepSeek 官方网站提供桌面安装包。先前用户的 Gatekeeper 公证验证结果支持继续使用当前安装，无需为切换下载渠道而重装。  
**FACT — Official release and distribution:** The official `dsh-v0.2.2-rc.3` release was published on 2026-11-13 as a prerelease and had no `.dmg` release attachment; DeepSeek distributes the Desktop installer through its website. The user's prior Gatekeeper notarization check supports retaining the current installation rather than reinstalling merely to change the download channel.

**ASSESSMENT — 权限验证 / Permissions:** 以上通用默认权限不自动决定已有会话的权限。模型此前关于沙箱和批准的文字不构成独立配置审计；待检查当前会话权限和系统授权。  
**ASSESSMENT — Permissions:** A global default does not retroactively control existing sessions. The model's earlier assertions about sandbox and approvals are not an independent permissions audit; actual session and OS grants remain to be inspected.

**PROPOSAL — 插件策略 / Plugin strategy:** 先使用官方内置 Computer Use 与 MCP Manager，逐个进行可逆测试；Kanban、ModLens、Hindsight 和 Market 按版本、依赖与安全性审核后再决定安装。详见 [插件评估](PLUGIN-REVIEW-2026-11-14.md)。  
**PROPOSAL — Plugin strategy:** Validate bundled Computer Use and MCP Manager first with narrow, reversible tests. Assess Kanban, ModLens, Hindsight, and Market for exact-version compatibility, dependencies, and safety before installation; see [plugin review](PLUGIN-REVIEW-2026-11-14.md).

**NOT_TESTED:** 本次未安装或启用任何插件，未复核更新渠道变更，未取得 Mac 原生 Computer Use 的实际执行轨迹。  
**NOT_TESTED:** No plugin was installed or enabled in this record-keeping step; update-channel changes and macOS Computer Use execution were not tested.

## 2026-11-14：Computer Use（Finder）受控验收｜Bounded Native GUI Test

**USER_REPORTED — Harness 工具执行记录 / User-provided Harness tool report:** macOS 的 CUA `getCapabilities()` 报告辅助功能和屏幕录制权限均可用，桌面已解锁；`getState()` 成功枚举正在运行的应用。  
**USER_REPORTED — Harness tool report:** CUA `getCapabilities()` indicated macOS Accessibility and Screen Recording permissions available, with an unlocked session; `getState()` enumerated active applications.

**测试过程与失效恢复 / Test sequence and recovery:** Finder 起初没有可解析的标准窗口；`app.activate()` 与 `app.show()` 报告 `NATIVE_ERROR` / `-25201`。同一工具对 TextEdit 和 Chrome 激活成功。随后用 Shell `open -a Finder` 打开非敏感工作区目录，CUA 才枚举出屏幕上可见的标准 Finder 窗口；先激活 TextEdit，再切换 Finder，`foregroundChanged:true`；AX 树和窗口截图报告也与标准 Finder 窗口一致。  
**Test sequence and recovery:** Finder initially had no resolvable standard window; `app.activate()` and `app.show()` returned `NATIVE_ERROR` / `-25201`. Comparable activation of TextEdit and Chrome succeeded. A shell `open -a Finder` opened a non-sensitive workspace, after which CUA detected a visible standard Finder window; switching TextEdit to Finder yielded `foregroundChanged:true`, supported by a reported AX standard-window tree and screenshot.

**判断与限制 / Assessment and limits:** 本次证据支持“缺少 Finder 标准窗口是触发错误的重要因素”，不能仅据此推断所有 `-25201` 都由同一根因导致。用户提供的是 Harness 执行报告，未在本对话中提供可独立读取的原始 CUA 日志或截图。  
**Assessment and limits:** The absent Finder standard window is a plausible contributing cause of this incident, but not a proven universal explanation for `-25201`. The evidence is a user-supplied Harness report; raw CUA tool logs and screenshot were not independently inspected in this conversation.

**补充发现 / Additional finding:** 使用 `osascript` 向 System Events 查询前台应用时遇到 `-10004` 权限拒绝；未因此新增 macOS 自动化权限。本次 Finder 前台切换仍通过 CUA 成功。  
**Additional finding:** An `osascript` query through System Events returned `-10004` permission denial. No new macOS Automation permission was granted; Finder foreground activation still succeeded through CUA.

**范围与副作用 / Scope and side effects:** 仅创建并保留一个指向测试工作区的 Finder 窗口；未报告文件删除、移动、重命名、上传或系统设置修改。打开窗口使用 Shell，不属于纯 CUA 调用。  
**Scope and side effects:** Only a Finder window targeting the test workspace was opened and left visible. No file deletions, moves, renames, uploads, or system settings changes were reported. Window creation used the shell, so the workflow was not exclusively CUA.

**状态 / Status:** 有界 Finder CUA 测试 **PASS（用户报告）**；完整 macOS GUI 自动化能力 **PARTIAL / NOT FULLY TESTED**。  
**Status:** Bounded Finder CUA test **PASS (user-reported)**; broad macOS GUI automation remains **PARTIAL / NOT FULLY TESTED**.

### 设计决策｜Architecture Decisions

- **DECISION — 主 Harness 原生部署 / Native primary runtime:** Prefer the official macOS Desktop application over a Dockerized principal agent; future ancillary services may use Docker.  
  原生运行有利于 macOS 工具接入，但不保证自动获得系统级权限。 / Native runtime facilitates macOS tool access but does not automatically grant OS permissions.
- **PROPOSAL — 存储分层 / Storage tiers:** Internal SSD for controller, configuration, current work, and active indexes; external 1 TB SSD for heavy assets, archived projects, model files, and other bulk data.  
  迁移前核对卷格式、挂载点、性能与备份；暂不移动运行时目录。 / Before migration, verify volume format, mount stability, performance, and backup; do not move runtime directories yet.
- **DECISION — 系统保全 / Preserve services:** Leave existing Node.js, Docker/Colima, and unrelated background services unchanged during Harness acceptance.  
  不因部署顺便调整其他服务。 / Avoid unrelated environment changes.

### 仍需验证｜Outstanding Acceptance Work

- [x] 记录桌面端设置截图显示的版本 `0.2.2-rc.3` / Record Desktop version `0.2.2-rc.3` from the user-supplied settings screenshot.
- [ ] 复核 API 提供商与模型身份，完成一条可复现的短对话 / Check selected provider and model; run one reproducible short prompt.
- [x] 创建专用无敏感数据的测试工作区；由 Agent 实际读取与新建文件，并从 macOS 侧核验（用户提供交叉验证输出） / Verify read/write against a disposable workspace (user-supplied terminal cross-check).
- [x] 执行无副作用的 shell 查询（用户提供 `pwd` 的 Harness 执行报告；完整工具事件轨迹未独立审阅） / Harmless shell command reported by the user (`pwd`); raw tool-event telemetry not independently reviewed.
- [ ] 单独审计当前会话审批策略与系统授权；虽然 CUA 报告辅助功能与录屏权限正常、Finder 受控操作通过，但更广泛的权限策略仍需验收 / Audit current-session approvals and OS grants; CUA reported Accessibility/Screen Recording available and bounded Finder activation passed, but broader permissions remain unverified.
- [ ] 核对 1 TB SSD 的格式、卷名、挂载稳定性及备份方案后再决定正式工作区位置 / Verify external SSD format, mount reliability, and backup before selecting permanent workspace locations.
- [ ] 后续逐步接入可用的 Office Skill、MCP 和远程计算节点，分别验收 / Introduce Office skills, MCP, and remote workers incrementally and test each integration.

### 未执行与限制｜Not Executed and Limitations

未在用户 Mac mini 上远程执行命令、写文件、迁移数据、安装插件或调整系统权限。本次 GitHub 文档记录不是本机部署动作。  
No remote commands, file writes, data migration, plugin installation, or permission changes were performed on the user's Mac mini. Publishing this log is not a deployment action on the host.

官方 Harness 仍属于开发者预览软件，实际生产适用性与恢复流程尚未验收。不得把聊天回复、工具清单或 GitHub 提交等同于端到端运行验证。  
Harness remains a developer-preview system. Production suitability and recovery are unverified; a conversational reply, tool list, or GitHub commit must not be presented as end-to-end operational acceptance.

### 2026-11-14：批量插件部署计划｜Planned Plugin Batch

**PLANNED / NOT INSTALLED** — 用户要求改成集中批量安装，再统一验收。根据 0.2.2-rc.3 Desktop profile 的官方安装约束，拟选定四个固定版本：Kanban 1.11.3、Better Sidebar 0.32.1、Skill Center 0.4.1、DSH Market 1.73.19。  
**PLANNED / NOT INSTALLED** — The user prefers a coordinated batch and single validation round. Four exact package versions are proposed for the Desktop profile; this conversation has not executed those installation commands on the Mac.

安装前需退出 Desktop、校验随附 CLI 的版本并制作私有配置备份；安装过程任一失败即停止，不使用强制兼容豁免。完整候选对比、安装顺序与验收标准见 [插件评估](PLUGIN-REVIEW-2026-11-14.md)。  
Before installation, quit Desktop, verify the bundled CLI version, and create a private backup. Stop on error without compatibility bypass. Details are in [plugin review](PLUGIN-REVIEW-2026-11-14.md).

### 2026-11-15：本地模型运行时与模型选型研究｜Local Model Runtime and Model Selection Research

**状态｜Status: RECOMMENDED / NOT INSTALLED / NOT TESTED.** 本阶段根据官方公开文档和模型卡完成技术选型研究。首选建议为 Ollama + `qwen3.5:4b-q4_K_M`，Harness 通过本地 stdio MCP Server 调用本机 Ollama API；云端 DeepSeek API 继续作为主模型。  
**Status: RECOMMENDED / NOT INSTALLED / NOT TESTED.** This phase completed runtime/model research using official public documentation and model cards. The recommended first stack is Ollama + `qwen3.5:4b-q4_K_M`, called through a local stdio MCP server; the DeepSeek cloud API remains the primary model.

**关键核验｜Key verification:**

- DeepSeek Harness `dsh-v0.2.2-rc.3` 标签文档确认 MCP Client 支持 stdio 和 streamable-http；本地 stdio 进程可由 Harness 启动，并注册为模型可调用工具。 / The `dsh-v0.2.2-rc.3` tag documents MCP Client support for stdio and streamable-http; a local stdio process can be started by Harness and registered as a model-callable tool.
- Ollama 官方 macOS 文档支持 Apple M 系列 CPU/GPU；API 文档支持 JSON Schema 结构化输出、工具调用和 `keep_alive` 驻留控制。 / Ollama's official macOS docs support Apple M-series CPU/GPU; its API docs support JSON-Schema structured output, tool calling, and `keep_alive` residency control.
- Ollama Registry 当前列出 `qwen3.5:4b-q4_K_M` 约 3.3 GB；该值为模型文件大小，不是峰值运行内存。 / The current Ollama Registry lists `qwen3.5:4b-q4_K_M` at approximately 3.3 GB; this is file size, not peak runtime memory.
- Qwen 官方模型卡报告 Qwen3.5-4B 的 C-Eval 85.1、IFEval 89.8；这些是发布方基准，尚非本机实测。 / Qwen's official card reports C-Eval 85.1 and IFEval 89.8 for Qwen3.5-4B; these are publisher benchmarks, not host test results.

**重要成本发现｜Important cost finding:** 如果完整原文已经进入云端上下文，再转交本地模型不会减少已经发生的云端输入 Token。为实现真实节省，大批量本地资料必须通过 source_refs 交给本地 MCP Server，由它在只读路径白名单内读取并分块处理；云端只接收精简结果。  
If full source text has already entered the cloud context, forwarding it locally does not reduce the cloud input tokens already consumed. To achieve real savings, bulk local material must be passed as source_refs to the local MCP server, which reads and chunks it within a read-only path allowlist; the cloud receives only compact results.

**资源判断｜Resource assessment:** 16 GiB 主机首轮只测试 4B Q4_K_M，不直接部署 9B。首轮输入上限建议 8K–16K，实际上下文、KV Cache、内存压力、延迟和模型质量须在本机测量。模型先留在内部盘默认位置；外置 SSD 未核实前不迁移。  
On the 16 GiB host, test only the 4B Q4_K_M model first, not 9B. Start with an 8K–16K input cap; measure actual context, KV cache, memory pressure, latency, and quality on the host. Keep the model in the default internal location until the external SSD is verified.

**未执行｜Not executed:** 本次未访问 Mac mini 终端，未安装 Ollama、未下载模型、未修改 Harness 配置、未创建 MCP Server，也未执行本机性能或质量测试。  
No Mac mini terminal was accessed; Ollama was not installed, no model was downloaded, Harness configuration was not changed, no MCP server was created, and no local performance or quality tests were run.

详细研究、比较、来源及后续验收顺序见 [本地模型选型记录](LOCAL-MODEL-SELECTION-2026-11-15.md)。  
See [Local Model Selection Record](LOCAL-MODEL-SELECTION-2026-11-15.md) for detailed research, comparisons, sources, and acceptance steps.

## 参考资料｜References

- [DeepSeek Harness official repository](https://github.com/deepseek-ai/deepseek-harness)
- [DeepSeek Harness safety notice](https://github.com/deepseek-ai/deepseek-harness/blob/master/SAFETY.zh.md)
- [PACS repository working agreement](../../REPOSITORY-WORKING-AGREEMENT.md)
- [PACS constitution](../../01-CONSTITUTION.md)
