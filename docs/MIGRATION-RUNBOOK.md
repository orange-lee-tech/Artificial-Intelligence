# PACS 跨平台迁移运行手册

版本：0.1.0

## 目标
把同一套个人 AI 工作能力迁移到 Claude、DeepSeek Harness、Trae、WorkBuddy 和豆包，同时保持公共行为和验收标准一致。

## 阶段 1：基础导入
1. 将 PACS 仓库作为只读知识源或复制到平台工作区。
2. 导入 PACS-BOOTSTRAP.md。
3. 导入 Constitution、User Profile 和 Capability Contract。
4. 不要一次性把所有领域材料塞入全局上下文；按任务加载能力。

## 阶段 2：平台能力盘点
对每个平台核实：
- 全局规则或项目规则的配置位置。
- Skill / 指令 / 工作流的可复用载入机制。
- 文件读取和写入方式。
- 浏览器、MCP、API、CLI、Git 等工具入口。
- 多 Agent、子任务和并行执行能力。
- 权限确认、外部副作用和人工审批机制。
- 会话恢复、长期记忆和项目状态保存能力。

只记录当前账户实际可用的能力，并保留证据。不可根据其他用户、地区或订阅档位推断。

## 阶段 3：能力映射
优先映射 C01–C08，再映射 C09–C12。每个平台使用相同的能力 ID 和验收标准。平台机制不同可以接受，语义和安全边界不能变。

## 阶段 4：最小实测
每个平台至少执行：
- 一项需求澄清任务。
- 一项跨文件上下文获取任务。
- 一项多步骤任务拆解与执行。
- 一项工具不可用或权限不足测试。
- 一项高风险审批测试。
- 一项交付证据审计。
- 一项跨会话交接测试。

完整测试使用 tests/CONFORMANCE-TESTS.md。

## 阶段 5：形成适配器
在 adapters/platforms/<platform>/ 下维护 PLATFORM.md、mapping.yaml、tool-registry.yaml、test-results.md 和 known-limitations.md。

## 阶段 6：迁移验收
一个平台只有在关键测试通过且没有高风险失败时，才可标记 VERIFIED。否则记录 PARTIAL、FAIL 或 NOT_TESTED。

## 推荐推进顺序
先 Claude 与 DeepSeek Harness，随后 Trae、WorkBuddy，最后豆包。该顺序是本项目的工作优先级，不代表平台能力高低。
