# DeepSeek Harness Adapter Profile

状态：DOCUMENTED｜当前安装实测：NOT_TESTED  
项目优先级：第一批

## 官方机制
DeepSeek Harness 是 DeepSeek AI 开源的 Agent Harness，采用 everything-is-a-plugin 架构。公开文档提供 Skill Provider/Registry/Loader、Subagent、Workflow、工具、MCP 和人类审批等能力。项目 README 当前标记为 Developer Preview，明确提示可能出现兼容性破坏变更。

Skill 文件系统 Provider 支持目录形式 <name>/SKILL.md 或平铺 <name>.md。项目级默认扫描 .dsh/skills 与 .agents/skills；用户级扫描 Harness/Agents 用户目录。YAML frontmatter 必须包含 name 和 description；技能主体按需加载。

## PACS 映射
- C01–C12：通过 Skill Provider 导入为独立 Skill。
- W01–W05：保持 PACS Workflow 文件作为规范；复杂并行编排可由 workflow 工具脚本与 subagent 执行。
- C05/C06：映射 Harness 工具注册、运行循环、任务日志和后台任务。
- C09：映射 approval / permission policy，必须 fail-closed。
- C08：结合 Session 持久化和仓库状态文件。

## 导入方式
1. 将 PACS 导出到项目根目录下的 .dsh/skills/<skill-name>/SKILL.md。
2. 或复制到当前 Harness 用户 Skills 目录。
3. 确认 Skill Provider 和 model-facing skill loader 已在所用 profile 中启用。
4. 对多 Agent Workflow，另行配置对应插件和工具；单纯复制 Markdown 不会自动启用所有 Harness 插件。
5. 运行一致性测试，并记录 Harness 版本、profile、插件配置。

## 已知限制
- 当前为 Developer Preview，升级可能造成兼容性破坏。
- Skill 文件存在不等于 profile 已挂载 Skill Provider/Loader。
- Workflow、Subagent、Approval 等能力依赖对应插件和配置。
- 当前用户本机安装与账户权限尚未实测。

## 官方来源
- https://github.com/deepseek-ai/deepseek-harness
- https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/skill
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/workflow.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/interaction/user-approval/README.md
