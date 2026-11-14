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
