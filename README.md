# PACS｜个人 AI 能力系统

**Personal AI Capability System**：模型无关、平台无关、可迁移、可组合、可验证的个人 AI 能力资产库。

> 核心目标：迁移能力，而不是迁移一篇长提示词。

PACS 将长期验证的 AI 协作方法拆解为治理原则、统一能力契约、原子能力、复合工作流和平台适配层。首批目标平台：Claude、DeepSeek Harness、Trae、WorkBuddy、豆包。

## 快速入口

| 资产 | 用途 |
|---|---|
| [系统总览](docs/00-PACS-OVERVIEW.md) | 定位、概念与使用方式 |
| [宪章](docs/01-CONSTITUTION.md) | 权责、原则、风险与治理 |
| [能力契约](docs/02-CAPABILITY-CONTRACT.md) | 能力模块统一接口 |
| [个人 AI 使用画像](docs/03-USER-PROFILE.md) | 可迁移的协作偏好与场景 |
| [架构说明](docs/04-ARCHITECTURE.md) | 能力、工作流、Agent、Harness、Adapter 关系 |
| [能力目录](catalog/capabilities.yaml) | C01–C12 能力索引 |
| [工作流目录](catalog/workflows.yaml) | W01–W05 工作流索引 |
| [平台适配指南](adapters/PLATFORM-ADAPTER-GUIDE.md) | 平台机制映射 |
| [平台矩阵](adapters/PLATFORM-MATRIX.md) | 平台验证状态 |
| [迁移运行手册](docs/MIGRATION-RUNBOOK.md) | 迁移执行步骤 |
| [一致性测试](tests/CONFORMANCE-TESTS.md) | 跨平台行为验收 |
| [Skill 导出脚本](tools/export-skills.py) | 生成 Claude、Trae、DeepSeek Harness 的初始导入包 |
| [项目状态模板](templates/PROJECT-STATE.md) | 跨会话、跨模型交接 |

## 系统分层

1. Constitution：治理原则。
2. Capability Contract：能力接口。
3. Capabilities：单一职责的原子能力。
4. Workflows：按依赖组合能力。
5. Adapters：映射平台差异。
6. Harness / Runtime：模型、Agent、工具和执行环境。
7. Human Owner：目标定义、授权、重大决策和最终验收。

## 最短使用方式

- 新任务：C01 澄清目标，C02 获取上下文。
- 复杂任务：C03 建模，C04 编排。
- 工具执行：C05 路由，C06 监督与恢复。
- 交付前：C07 审计验收。
- 长期任务：C08 持久化与交接。
- 敏感或高影响操作：遵循 C09 和宪章审批规则。

## 版本与成熟度

当前 PACS：0.1.1。能力状态：DRAFT、READY、VALIDATED、DEPRECATED。成熟度：V（实践依据）、S（书面规范）、X（跨平台实测）、A（仍需抽象或补测）。

公开文档确认不等于账户级导入成功；所有平台实测状态必须由证据支持。首版跨平台测试尚未完成。
