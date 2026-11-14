# PACS 跨平台迁移运行手册

版本：0.1.1

## 目标
把同一套个人 AI 工作能力迁移到 Claude、DeepSeek Harness、Trae、WorkBuddy 和豆包，同时保持公共行为和验收标准一致。

## 阶段 1：基础导入
1. 将 PACS 仓库作为只读知识源或复制到平台工作区。
2. 导入 PACS-BOOTSTRAP.md。
3. 导入 Constitution、User Profile 和 Capability Contract。
4. 不一次性把所有领域材料塞入全局上下文；按任务加载能力。

## 阶段 2：平台能力盘点
核实规则入口、Skill 机制、文件读写、工具与连接器、多 Agent、审批、状态保存和账户权限。只记录当前账户实际可用的能力。

## 阶段 3：生成平台包
运行 tools/export-skills.py。脚本使用 Python 标准库，将规范 Skill 导出为：
- Claude：每项 Skill 一个 ZIP，根目录包含技能文件夹和 skill.md。
- Trae：项目级 .trae/skills/<name>/SKILL.md。
- DeepSeek Harness：项目级 .dsh/skills/<name>/SKILL.md。
- Portable：通用源文件副本，供 WorkBuddy、豆包等按各自接入契约导入。

导出只是格式转换，不会自动连接工具、创建 Agent 或授予权限。

## 阶段 4：平台适配
- Claude：启用代码执行/文件创建，上传单项 Skill ZIP；MCP/连接器独立配置。
- DeepSeek Harness：确认 Skill Provider/Loader 和对应 profile 已启用；Workflow、Subagent、Approval 依赖插件。
- Trae：确认项目目录可信；区分 Rule、Skill 和 MCP。
- WorkBuddy：确认当前账户的项目空间、Skill/专家和连接器入口。
- 豆包：确认开放平台 Agent 与消费者端产品的目标边界，再按对应 Skill 契约导入。

## 阶段 5：最小实测
每个平台至少执行需求澄清、上下文冲突、工具不可用、高风险审批、交付审计和跨会话交接测试。完整测试见 tests/CONFORMANCE-TESTS.md。

## 阶段 6：验收
只有实际运行测试通过且没有高风险失败，才能标记 VERIFIED。公开文档已确认但账户未实测时标记 DOCUMENTED。未核实保持 NOT_TESTED。

## 推荐推进顺序
先 Claude 与 DeepSeek Harness，随后 Trae、WorkBuddy，最后豆包。这是本项目的工作优先级，不代表平台能力高低。
