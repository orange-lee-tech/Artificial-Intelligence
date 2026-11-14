# Trae Adapter Profile

状态：DOCUMENTED｜当前账户实测：NOT_TESTED  
项目优先级：第二批

## 官方机制
TRAE 官方文档将 Skill 定义为 SKILL.md 文件，可包含指令、脚本和资源，并按任务相关性动态加载。官方明确区分 Rule（规则进入上下文）、Skill（按需加载专业流程）和 MCP Server（提供可调用工具）。

官方文档列出项目级技能目录 .trae/skills/，以及全局目录：Windows %userprofile%/.trae-cn/skills，macOS/Linux ~/.trae-cn/skills。项目技能仅从可信目录加载。

## PACS 映射
- Constitution 与 User Profile：使用全局规则或全局 Skill 承载稳定协作规范。
- 项目特定规则：使用项目 Rule。
- C01–C12：独立放入项目或全局 Skills。
- MCP：单独配置工具连接，不把工具连接写成 Skill。
- W01：优先作为项目级工程工作流，与仓库规则共同加载。

## 导入方式
1. 使用 PACS 导出器生成 .trae/skills/<skill-name>/SKILL.md。
2. 项目专属能力放入项目技能目录；跨项目通用能力可放入全局目录。
3. 确认工作区目录已被设为可信。
4. 分别验证 Skill 触发、MCP 工具权限和项目规则生效情况。

## 已知限制
- 项目技能目录信任设置会影响发现。
- Rule、Skill 和 MCP 的职责不可混用。
- 当前用户账户、版本和工具连接尚未实测。

## 官方来源
- https://docs.trae.cn/ide_skills
