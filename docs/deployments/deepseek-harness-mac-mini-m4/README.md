# DeepSeek Harness on Mac mini M4｜部署档案
# DeepSeek Harness on Mac mini M4 | Deployment Dossier

**记录日期｜Recorded:** 2026-11-14  
**平台｜Platform:** macOS / Apple Silicon (M4)  
**架构｜Architecture:** DeepSeek Harness Desktop (native) + official DeepSeek API (cloud-first)  
**总体状态｜Overall status:** PARTIAL — installation, conversation, file/shell and a bounded Finder Computer Use test evidenced; system automation coverage and recovery remain pending

## 目标与范围｜Purpose and Scope

将 Mac mini M4 建设为可维护、可迁移的 AI 主控节点。该目录记录已证实的部署事实、设计决策、待完成验证与后续交接，不包含运行时秘密或本机数据副本。  
Establish the Mac mini M4 as a maintainable, portable AI coordination node. This directory records supported deployment facts, decisions, pending checks, and handoff information without publishing runtime secrets or local data.

本项目遵循仓库的 PACS 事实与验收规则。文档记录不等于系统测试通过；用户提供的运行结果与独立工具验证须分别标注。  
This project follows PACS evidence and acceptance rules. Documentation is not operational acceptance; user-reported results and independently verified tool execution are distinguished.

## 已知系统基线｜Known Environment Baseline

| 项目 / Item | 已知状态 / Known state | 证据级别 / Evidence |
| --- | --- | --- |
| 主机 / Host | Mac mini M4, ARM64, 16 GiB memory, macOS 26.2 | 用户终端输出 / User-provided terminal output |
| 内置存储 / Internal storage | Approximately 228 GiB total; approximately 146 GiB available at inspection | 用户终端输出 / User-provided terminal output |
| 外置存储 / External storage | 1 TB SSD connected; format, volume name, and reliability not yet checked | 用户说明 / User report |
| Node.js | v22.22.3; npm 10.9.8; existing installation retained | 用户终端输出 / User-provided terminal output |
| Docker | CLI 29.7.1, Compose 5.4.0, context desktop-linux; Docker daemon not reachable during check | 用户终端输出 / User-provided terminal output |
| Harness Desktop | Installed under /Applications; accepted by macOS Gatekeeper; notarized Developer ID | 用户终端输出 / User-provided terminal output |
| DeepSeek API | API configuration completed; conversational reply received | 用户报告 / User report |
| Harness version | 0.2.2-rc.3 / 截图显示版本 | 用户 UI 截图 / User-supplied UI screenshot |
| File and shell tools | Basic read/write and `pwd` smoke tests passed / 基础读写和 `pwd` 测试通过 | Harness report + user-supplied terminal cross-check | 
| Native automation | Finder foreground activation passed in a bounded CUA test / Finder 前台激活的 CUA 有界测试通过 | User-provided Harness tool execution report; not independently replayed |

## 部署决策｜Deployment Decisions

1. **原生主控 / Native controller:** 采用 DeepSeek Harness Desktop 作为主智能体运行时，以保留 macOS 文件、命令行和后续原生自动化能力；Docker 不作为主 Harness 运行环境。  
   Use DeepSeek Harness Desktop as the principal agent runtime to preserve macOS filesystem, shell, and future native automation capabilities; do not containerize the primary Harness.
2. **保留现有环境 / Preserve existing environment:** 不替换现有 Node.js 22，不因本项目修复或重建 Docker/Colima。  
   Do not replace existing Node.js 22 or rebuild Docker/Colima solely for this deployment.
3. **按职责分层存储 / Role-based storage:** 内置盘优先承载主控应用、活跃项目、配置与轻量状态；外置 SSD 倾向于承载历史资料、媒体、大型模型和可重新生成的重型资产。工作区的最终位置须依据实际读写量和 SSD 稳定性决定。  
   Prefer the internal disk for the controller, active projects, configuration, and lightweight state; use the external SSD for archives, media, large models, and reproducible heavy assets. Final workspace placement depends on access patterns and SSD reliability.
4. **可迁移设计 / Portable design:** 将应用、项目、运行状态、秘密和备份分别管理，记录恢复步骤；不将单块外置 SSD 视为备份。  
   Manage application, projects, runtime state, secrets, and backups separately and document restoration; a single external SSD is not a backup.
5. **权限治理 / Permission governance:** 最终可按需接入强大的宿主机能力，但权限、审批规则与高风险动作必须单独验收，不以模型自述代替证明。  
   Host automation may eventually require broad capabilities, but permissions, approval policies, and high-impact actions require explicit validation rather than reliance on model self-report.

## 验收门槛｜Acceptance Gates

| 门槛 / Gate | 状态 / Status | 证据要求 / Evidence required |
| --- | --- | --- |
| A. 安装与系统签名 / Install and notarization | VERIFIED via supplied terminal output | App path, Gatekeeper accepted, notarized Developer ID |
| B. API 模型实际响应 / Live model response | PARTIAL (user-reported) | Confirm selected DeepSeek API provider and record reproducible test |
| C. 工作区读写 / Workspace read-write | PASS — user-supplied evidence | Harness reports read/write/read-back; macOS `cat` confirmed output |
| D. Shell 工具执行 / Shell execution | PASS — user-reported tool use | `pwd` returned workspace root; raw tool telemetry not independently reviewed |
| E. macOS 原生自动化 / macOS automation | PARTIAL — bounded Finder CUA test passed (user-reported) | Accessibility/screen capture capabilities reported; Finder activation observed after creating a workspace window; wider automation not tested |
| F. 备份恢复 / Backup and restore | NOT_TESTED | Recover a non-secret test workspace from backup |
| G. 扩展节点 / Remote worker integration | NOT_STARTED | Test authenticated, narrowly scoped communication with the F117 worker |

## 文档索引｜Document Index

- [DEPLOYMENT-LOG.md](DEPLOYMENT-LOG.md) — 按日期记录事实、决策、待办和验证证据 / Dated evidence, decisions, follow-up tasks, and acceptance notes.
- [PLUGIN-REVIEW-2026-11-14.md](PLUGIN-REVIEW-2026-11-14.md) — 五款候选插件评估及下载渠道核对 / Five candidate plugins and official distribution-channel review.

## 公开仓库约束｜Public Repository Boundaries

本仓库为公开仓库。禁止提交 API Key、Tokens、完整的运行时配置、私人目录清单、网络暴露地址、客户数据及未经审查的原始日志。敏感状态应留在本机并通过独立备份机制保护。  
This is a public repository. Do not commit API keys, tokens, full runtime configurations, private directory inventories, exposed network addresses, customer data, or unreviewed raw logs. Keep sensitive state locally under a separate backup policy.
