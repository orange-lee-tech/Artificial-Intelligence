# 平台适配指南｜Platform Adapter Guide

版本：0.1.1

## 1. 目标
将 PACS 公共能力映射到具体平台，而不是为每个平台重新发明方法论。

## 2. 适配器必须完成
1. 核实平台规则、项目上下文和 Skill 的承载机制。
2. 核实文件读取/写入、工具、连接器、MCP、API、CLI 的真实范围。
3. 核实多 Agent、子任务、并行、状态和审批机制。
4. 将 PACS 输入输出契约映射到平台实际格式。
5. 为平台建立安装/导出映射和测试记录。
6. 运行 tests/CONFORMANCE-TESTS.md 并记录结果。

## 3. 适配原则
- 先保留语义，再适配语法。
- 平台专属配置只能放在 Adapter。
- 不假设平台支持某项功能；须经官方文档或实际界面核实。
- 不支持时标记 UNSUPPORTED，并提供人工或外部工具替代方案。
- 不把长篇系统提示词当作唯一迁移手段。
- 同一能力在不同平台共享 PACS ID、职责、输入、输出和验收标准。
- 平台实际账户、版本和地区可能影响功能；公共文档存在不等于当前账户可用。

## 4. 公共 Skill 格式
PACS 源 Skill 采用 SKILL.md + YAML frontmatter，必需字段为 name、description；PACS 专有字段放入 metadata。平台要求大小写、目录或 ZIP 结构不同时由导出器处理。

## 5. 当前平台映射
- Claude：按 Skill 文件夹打包 ZIP；Claude Code / claude.ai 的导入方式分别核实。
- DeepSeek Harness：复制为项目级 .dsh/skills/<skill-name>/SKILL.md 或用户级 Skills 目录。
- Trae：复制为项目级 .trae/skills/<skill-name>/SKILL.md 或全局 Skills 目录。
- WorkBuddy：通过实际可用的项目空间、Skill/专家机制导入；连接器独立配置。
- 豆包：以豆包开放平台 Skill 接入文档为依据；先确认目标是开放平台 Agent 还是消费者端豆包。

## 6. 最小 Adapter 结构
每个平台至少维护 PLATFORM.md、mapping.yaml、test-results.md；当工具已实际接入后再维护 tool-registry.yaml。平台限制和证据应在 PLATFORM.md 或 known-limitations.md 记录。

## 7. 版本策略
平台升级后只更新对应 Adapter 和测试结果；除非能力语义变化，否则不修改公共 Capability。
