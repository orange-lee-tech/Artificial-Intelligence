# 平台适配指南｜Platform Adapter Guide

版本：0.1.0

## 1. 目标
将 PACS 公共能力映射到具体平台，而不是为每个平台重新发明一套方法论。

## 2. 适配器必须完成
1. 找到平台承载全局规则的位置。
2. 找到可复用 Skill 的承载机制；若无原生机制，使用 Markdown 文件或可调用模板。
3. 确认平台如何加载项目上下文和文件。
4. 确认工具、连接器、MCP、API、CLI 的真实可用范围。
5. 确认是否支持多 Agent、子任务、并行和人工审批。
6. 确认状态保存、会话恢复和跨项目复用机制。
7. 将 PACS 输入输出契约映射到平台实际格式。
8. 运行一致性测试并记录结果。

## 3. 适配原则
- 先保留语义，再适配语法。
- 平台专属配置只能放在 Adapter。
- 不假设平台支持某项功能；须经文档或实际界面核实。
- 不支持时标记 UNSUPPORTED，并提供人工或外部工具替代方案。
- 不把长篇系统提示词当作唯一迁移手段。
- 同一能力在不同平台共享 ID、职责、输入、输出和验收标准。

## 4. 最小 Adapter 结构
PLATFORM.md、mapping.yaml、tool-registry.yaml、test-results.md、known-limitations.md。

## 5. 映射字段
capability_id、platform_mechanism、configuration、invocation、context_loading、tool_access、permission_model、persistence、limitations、test_status、evidence。

## 6. 版本策略
平台升级后只更新对应 Adapter 和测试结果；除非能力语义变化，否则不修改公共 Capability。
