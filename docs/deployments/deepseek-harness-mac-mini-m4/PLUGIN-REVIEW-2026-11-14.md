# 五款插件与发布渠道评估｜Plugin and Distribution Review

**核查日期｜Reviewed:** 2026-11-14  
**Harness 版本｜Target:** Desktop 0.2.2-rc.3  
**评估性质｜Assessment:** DOCUMENTED / NOT_TESTED — research and source inspection, not installation or operational acceptance.

## 安装来源｜Installer Provenance

- DeepSeek 官方下载页提供原生 macOS 桌面应用；官方 GitHub 提供源码、Release、标签和技术文档。当前安装由用户此前的 macOS Gatekeeper 检查显示 `accepted` 和 `Notarized Developer ID`。  
  DeepSeek's official site distributes the native macOS app; the official GitHub repository publishes source, release tags, and documentation. The user's earlier Gatekeeper check showed accepted and notarized Developer ID.
- 截图中的 `0.2.2-rc.3` 对应 2026-11-13 的官方 GitHub 预发布标签 `dsh-v0.2.2-rc.3`；该 Release 没有附带 `.dmg` 资产。版本匹配不等于二进制可重现性证明。  
  Desktop `0.2.2-rc.3` matches the upstream prerelease tag from 2026-11-13, which carries no attached `.dmg` binary asset. Version agreement is not a byte-for-byte reproducibility proof.
- “正式版”与“开发版”是更新渠道，分别映射 stable 与 nightly；stable 也可能分发 RC 或 alpha，不能仅凭渠道名宣称生产就绪。  
  Stable and Nightly are update channels, not guarantees of production readiness; Stable may also serve an alpha or RC release.

## 插件候选｜Plugin Candidates

| 插件 / Plugin | 实际来源 / Source | 能力 / Capability | 初步建议 / Recommendation | 状态 / Status |
| --- | --- | --- | --- | --- |
| DSH Computer Use | Official bundled `dsh-cua-bundle` | Mac GUI control through PTC; Accessibility + Screen Recording | First controlled evaluation; no separate download / 先进行受控测试，无需额外安装 | BUNDLED, DISABLED |
| DSH-Kanban | `alpacachen/dsh-kanban` (`@alpacachen/dsh-kanban` 1.11.3) | Workspace-scoped collaborative task board | Candidate after native controls / 第二批候选 | Exact DSH 0.2.2-rc.3 compatibility declared; NOT_INSTALLED |
| ModLens | `liustack/modlens` (`@liustack/modlens` 3.27.3 at inspection) | Adds visual evidence/OCR to text models | Candidate only after selecting a trusted vision endpoint / 选定可信视觉提供商后再接入 | NOT_INSTALLED / NOT_TESTED |
| Hindsight | `Ryu6Zero/dsh-hindsight` as one bridge to Hindsight backend | Cross-session retrieval/remember tools | Defer until dedicated backend, access and backup design / 后端、权限与备份确定后再部署 | NOT_INSTALLED / NOT_TESTED |
| DSH Market | `dsh-market/dsh-market` (`dshmarket`) | Community discovery, updates, plugin diagnostics and configuration exports | Optional: built-in Custom Plugin Index already offers discovery / 可选，官方已提供索引发现能力 | NOT_INSTALLED / NOT_TESTED |

## 工程与安全约束｜Engineering and Security Constraints

- 第三方插件不能仅根据名称或 GitHub star 数认为可信。需要核对实际包名、发布版本、`engines`/peer 兼容性、代码来源、构建脚本及持久化数据。  
  A plugin name or star count is not a security review. Check exact package, version, engines/peer compatibility, source, lifecycle scripts, and persistent data.
- **Desktop 安装路径**：优先使用桌面应用的「插件 → 添加插件」，不要机械执行 `dsh plugin --profile web add ...`；Web profile 与 Desktop profile 不相同。  
  **Desktop installation path:** use the Desktop Plugin UI instead of copying `dsh plugin --profile web add ...`; the profiles differ.
- **ModLens**：图像经选定视觉服务处理；不要默认启用可复用本机 CLI 登录与可能绕过权限审批的引擎。先确认数据出境、配额、费用及隐私预期。  
  **ModLens:** images may be handled by an external vision service. Avoid enabling local CLI credential reuse or permissive subprocess paths by default; confirm data handling, quotas, cost, and privacy.
- **Hindsight**：插件是后端桥接层，不能代替独立记忆服务；本机 Docker daemon 最近一次检查不可用，部署前应先解决运行环境与持久化。记忆不应代替 PACS 仓库的可审计事实来源。  
  **Hindsight:** a bridge plugin is not the memory backend. The Docker daemon was unavailable in the last observed check; plan runtime and persistence first. Memory is not a replacement for the auditable PACS repository.
- **Kanban**：卡片存储在工作区的 `.dsh-kanban.json`，图片存储在 Harness 附件区；迁移时必须备份两处。  
  **Kanban:** cards persist in the workspace's `.dsh-kanban.json`, while image objects live in the DSH attachment store; backup must cover both.
- **Computer Use**：仅在授权后的 PTC 会话中验收低风险 GUI 操作。开启功能不等于自动授予 macOS 系统权限。  
  **Computer Use:** test reversible GUI tasks in explicitly authorized PTC sessions. Enabling the bundle does not automatically grant OS permissions.

## 建议实施次序｜Proposed Rollout

1. 官方 Computer Use（PTC）受控验证 / Controlled native Computer Use test.
2. GitHub MCP 与 PACS 项目级 Skills（独立审计） / Independently audit GitHub MCP and PACS skills.
3. DSH-Kanban（需要可视化项目管理时） / DSH-Kanban when a visual shared board is useful.
4. ModLens（选定可信视觉后端后） / ModLens after selecting an approved vision endpoint.
5. Hindsight（明确持久记忆需要后） / Hindsight after memory requirements and retention policy.
6. DSH Market（确需增强管理时） / Market only if advanced management is necessary.

## 参考资料｜References

- [Official DeepSeek Desktop download](https://www.deepseek.com/download/)
- [Official Harness release 0.2.2-rc.3](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.2-rc.3)
- [Official Computer Use](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/packages/experimental/cua-bundle/README.zh.md)
- [Official plugin indexes](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/docs/user/guide/plugin-market.zh.md)
- [DSH Market](https://github.com/dsh-market/dsh-market)
- [ModLens](https://github.com/liustack/modlens)
- [Hindsight bridge](https://github.com/Ryu6Zero/dsh-hindsight)
- [DSH-Kanban](https://github.com/alpacachen/dsh-kanban)

## 2026-11-14 补充：批量安装与新版候选评估｜Batch Installation and Additional Candidates

**状态｜Status: PLANNED — NOT INSTALLED.** 2026-11-14 用户希望将可兼容的扩展集中安装并统一验收。以下仅为经公开源码与官方流程核对后的安装计划，不代表已在 Mac mini 上执行。  
**Status: PLANNED — NOT INSTALLED.** The user requested a coordinated installation wave followed by one acceptance round. This records the planned operation, not a completed local installation.

### 第一批安装锁定清单｜Batch A: Exact Package Set

| 顺序 / Order | Spec | 用途 / Purpose |
| --- | --- | --- |
| 1 | `@alpacachen/dsh-kanban@1.11.3` | 工作区任务看板 / Workspace task board |
| 2 | `dsh-better-sidebar@0.32.1` | 文件、Git、侧边终端 / Files, Git and side panels |
| 3 | `dsh-skill-center@0.4.1` | Skills 发现、管理与审查 / Skill discovery and review |
| 4 | `dshmarket@1.73.19` | 插件发现和诊断 / Plugin discovery and diagnostics |

**执行路径 / Execution path:** 官方 Desktop 随附 CLI 在退出应用后操作 `desktop` profile；或在应用中按官方限制一个 spec 一次连续安装。不得误将 `dsh plugin --profile web add` 作用于不使用的 Web profile。  
**Execution:** Use the Desktop-bundled CLI against the initialized `desktop` profile with the application fully quit, or use the app UI serial installer. Do not install into an unrelated Web profile.

**前置检查 / Preconditions:** 核对 Desktop CLI 的 `0.2.2-rc.3`、存在已初始化 `~/.dsh/profiles/desktop/package.json`、先对 `~/.dsh` 做本机权限受限备份。包管理报错立即停止；不授权版本豁免、不全局跳过安装脚本审查。  
**Preconditions:** Verify matching Desktop CLI, initialized Desktop profile, and a private backup of DSH home. Abort on error; do not bypass version incompatibility or globally disable install-script checks.

**统一验收 / Unified acceptance:** 新安装插件显示 active/正确版本；Kanban 测试卡持久化；Better Sidebar 可打开文件和 Git 视图；Skill Center 能列举技能；Market 页面正常；回归文件、Shell、Computer Use 已测基础能力。  
**Unified acceptance:** Confirm active states and exact versions, a persistent test board card, functioning sidebar, skill inventory, market view, and regressions for file/shell/Computer Use baseline.

### 其他名称核对｜Other Candidate Names

- `Billion Context`：已定位到 `billion-context-dsh`；它影响 DSH 会话压缩与存储路径，应另行审计并做长会话恢复测试。 / Changes compaction behavior; separate acceptance required.
- `DSH Client UI`：是多种 UI 包的共享前缀，不是可靠的唯一包标识。 / Prefix family, not one unambiguous package.
- `DSH Client UI Test Board`：尚未确认具体包，可能为 Task Board 的语音识别误差；Kanban 已覆盖第一批任务看板用途。 / Exact package unverified; may be Task Board.
- `DSH Client UI Git Graph`：存在 `@linxin666/dsh-client-ui-git-graph`，但 Better Sidebar 已有只读 Git 图谱；避免重叠。 / Real package; postpone because of UI overlap.
- `DSH Client UI Skill Explorer`：存在 `@linxin666/dsh-client-ui-skill-explorer`，与 Skill Center 的部分能力重叠。 / Real package; postpone overlap.
- `DSH Pet`：存在 `dsh-pet`，属于非关键桌面装饰；作者当前说明明确实测版本以 0.2.2-rc.1 为主。 / Optional; developer-tested version differs from installed host.
- `DSH Remote Web UI`：有多个不同实现，可能代理 DSH 访问并引入外部认证入口；已有 Tailscale，先规划私有网络访问。 / Multiple incompatible implementations; review authentication and network exposure first.
- `DSH SSH`：发现 `@dsh-ssh/dsh-ssh`，可将 Shell 与文件工具路由到远端；待 F117 主机认证和工作区边界确定后评估。 / Real remote tool-routing plugin; defer until remote-worker plan.
- `MemSearch`：优先研究 Zilliz 的 `@zilliz/memsearch-dsh`；需要 `memsearch[onnx]`、Python/uv、首次 embedding 下载与独立配置，数据含 `.memsearch` Markdown；不要与 Hindsight 同时启用自动记忆。 / Zilliz plugin needs Python/uv and embedding setup; do not concurrently enable two automatic memory systems.

### 参考｜References

- [Official Desktop CLI](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/apps/desktop/README.zh.md)
- [Official plugin manager UI limitations](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/packages/client/ui-plugin-manager/README.zh.md)
- [Billion Context](https://github.com/ranxianglei/billion-context-dsh)
- [Better Sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)
- [Skill Center](https://github.com/tuoLuoSuan/dsh-skill-center)
- [DSH Pet](https://github.com/PC2005-cloud/dsh-pet)
- [DSH SSH](https://github.com/dsh-ssh/dsh-ssh)
- [Zilliz MemSearch DSH installation](https://zilliztech.github.io/memsearch/platforms/dsh/installation/)
