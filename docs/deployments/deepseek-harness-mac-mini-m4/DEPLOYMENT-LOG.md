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

### 设计决策｜Architecture Decisions

- **DECISION — 主 Harness 原生部署 / Native primary runtime:** Prefer the official macOS Desktop application over a Dockerized principal agent; future ancillary services may use Docker.  
  原生运行有利于 macOS 工具接入，但不保证自动获得系统级权限。 / Native runtime facilitates macOS tool access but does not automatically grant OS permissions.
- **PROPOSAL — 存储分层 / Storage tiers:** Internal SSD for controller, configuration, current work, and active indexes; external 1 TB SSD for heavy assets, archived projects, model files, and other bulk data.  
  迁移前核对卷格式、挂载点、性能与备份；暂不移动运行时目录。 / Before migration, verify volume format, mount stability, performance, and backup; do not move runtime directories yet.
- **DECISION — 系统保全 / Preserve services:** Leave existing Node.js, Docker/Colima, and unrelated background services unchanged during Harness acceptance.  
  不因部署顺便调整其他服务。 / Avoid unrelated environment changes.

### 仍需验证｜Outstanding Acceptance Work

- [ ] 记录应用「关于 DeepSeek Harness」中显示的实际版本 / Record the installed Desktop version.
- [ ] 复核 API 提供商与模型身份，完成一条可复现的短对话 / Check selected provider and model; run one reproducible short prompt.
- [x] 创建专用无敏感数据的测试工作区；由 Agent 实际读取与新建文件，并从 macOS 侧核验（用户提供交叉验证输出） / Verify read/write against a disposable workspace (user-supplied terminal cross-check).
- [x] 执行无副作用的 shell 查询（用户提供 `pwd` 的 Harness 执行报告；完整工具事件轨迹未独立审阅） / Harmless shell command reported by the user (`pwd`); raw tool-event telemetry not independently reviewed.
- [ ] 单独检查权限与审批策略；模型对策略的描述不构成配置审计 / Audit permissions and approval settings independently of model claims.
- [ ] 核对 1 TB SSD 的格式、卷名、挂载稳定性及备份方案后再决定正式工作区位置 / Verify external SSD format, mount reliability, and backup before selecting permanent workspace locations.
- [ ] 后续逐步接入可用的 Office Skill、MCP 和远程计算节点，分别验收 / Introduce Office skills, MCP, and remote workers incrementally and test each integration.

### 未执行与限制｜Not Executed and Limitations

未在用户 Mac mini 上远程执行命令、写文件、迁移数据、安装插件或调整系统权限。本次 GitHub 文档记录不是本机部署动作。  
No remote commands, file writes, data migration, plugin installation, or permission changes were performed on the user's Mac mini. Publishing this log is not a deployment action on the host.

官方 Harness 仍属于开发者预览软件，实际生产适用性与恢复流程尚未验收。不得把聊天回复、工具清单或 GitHub 提交等同于端到端运行验证。  
Harness remains a developer-preview system. Production suitability and recovery are unverified; a conversational reply, tool list, or GitHub commit must not be presented as end-to-end operational acceptance.

### 参考资料｜References

- [DeepSeek Harness official repository](https://github.com/deepseek-ai/deepseek-harness)
- [DeepSeek Harness safety notice](https://github.com/deepseek-ai/deepseek-harness/blob/master/SAFETY.zh.md)
- [PACS repository working agreement](../../REPOSITORY-WORKING-AGREEMENT.md)
- [PACS constitution](../../01-CONSTITUTION.md)
