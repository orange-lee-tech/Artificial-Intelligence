# Claude Adapter Profile

状态：DOCUMENTED｜当前账户实测：NOT_TESTED  
项目优先级：第一批

## 官方机制
Claude 支持可复用 Skills。官方说明：自定义 Skill 是包含指令、资源和可选脚本的文件夹；Claude.ai 可通过 ZIP 上传自定义 Skill；使用 Skills 需要启用 Code execution and file creation。创建 Skill 的官方文档要求 YAML frontmatter 中有 name 和 description，建议 Skill 聚焦单一可重复任务，并通过示例测试触发准确性。

## PACS 映射
- Constitution：放入可持续加载的个人/项目规则入口。
- User Profile：作为稳定协作偏好资料。
- C01–C12：每项能力独立打包为 Skill，不合并成万能提示词。
- Workflows：作为项目级流程说明，必要时由多个 Skills 组合。
- MCP / Connectors：负责外部数据与工具接入；Skill 负责说明如何使用工具。

## 导入方式
1. 每项 Skill 单独打包为 ZIP，ZIP 根目录包含技能文件夹。
2. claude.ai：在 Customize > Skills 上传；先检查 Code execution and file creation 是否启用。
3. Claude Code：采用文件系统 Skill 机制；具体安装路径和当前版本要求以官方文档为准。
4. 导入后执行一致性测试，不因上传成功而标记 VERIFIED。

## 元数据兼容
PACS Skill 使用 name、description 和 metadata。导出器将规范化文件名；claude.ai ZIP 导出将 SKILL.md 转换为官方示例所用的 skill.md 文件名。

## 已知限制
- Skills 功能依赖代码执行/文件创建设置和账户配置。
- claude.ai 上传与 Claude Code 文件系统加载是不同入口。
- 当前用户账户尚未实际导入和测试。

## 官方来源
- https://support.claude.com/en/articles/12512180-use-skills-in-claude
- https://support.claude.com/en/articles/12512198-creating-custom-skills
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
