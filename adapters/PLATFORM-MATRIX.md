# 目标平台适配矩阵

状态定义：NOT_TESTED（当前账户未实测）、DOCUMENTED（官方资料已核对）、VERIFIED（实际一致性测试通过）、PARTIAL、UNSUPPORTED。

**DOCUMENTED 只表示公开官方资料描述了该机制，不代表当前账户已开通或已成功导入。**

| 平台 | 官方文档确认的机制 | PACS 适配策略 | 账户实测 |
|---|---|---|---|
| Claude | 自定义 Skills；文件夹含 YAML frontmatter；claude.ai 可 ZIP 上传；需启用代码执行/文件创建 | 每项 Skill 单独 ZIP；MCP/连接器作为工具层单独配置 | NOT_TESTED |
| DeepSeek Harness | 开源插件架构；Skill Provider/Loader；Subagent、Workflow、工具和审批插件 | 导出至 .dsh/skills/<name>/SKILL.md；Workflow 由 Harness workflow 能力编排 | NOT_TESTED |
| Trae | SKILL.md；全局/项目 Skill；动态按需加载；Rules 与 MCP 分工不同 | 导出至 .trae/skills/<name>/SKILL.md；规则与工具配置分层 | NOT_TESTED |
| WorkBuddy | 工作台任务规划执行；本地授权目录文件操作；项目空间、多 Agent、专家/Skill、连接器 | 项目空间承载上下文；Skill/专家承载方法；连接器承载工具访问 | NOT_TESTED |
| 豆包 | 豆包开放平台有 Skill 接入指南；Skill 与连接器职责区分 | 按开放平台 Skill 契约适配；确认消费者端与开放平台功能边界 | NOT_TESTED |

## 官方来源
- Claude Skills: https://support.claude.com/en/articles/12512180-use-skills-in-claude
- Claude custom Skills: https://support.claude.com/en/articles/12512198-creating-custom-skills
- DeepSeek Harness: https://github.com/deepseek-ai/deepseek-harness
- DeepSeek Harness skill provider: https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/skill
- Trae Skill docs: https://docs.trae.cn/ide_skills
- WorkBuddy product docs: https://cloud.tencent.com/document/product/1831/134384
- WorkBuddy product overview: https://cloud.tencent.com/product/workbuddy
- Doubao Open Platform Skill guide: https://open.doubao.com/document

## 注意
DeepSeek Harness 当前公开仓库标注为 Developer Preview，存在兼容性破坏变更风险。豆包资料来源是开放平台 Skill 接入指南，不自动代表普通消费者端豆包具备相同的 Skill 管理能力。所有账户级能力仍待实测。
