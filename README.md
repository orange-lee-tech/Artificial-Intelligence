# PACS｜个人 AI 能力系统

**Personal AI Capability System**：模型无关、平台无关、可迁移、可组合、可验证的个人 AI 能力资产库。

> 核心目标：迁移能力，而不是迁移一篇长提示词。

PACS 将长期验证的 AI 协作方法拆解为治理原则、统一能力契约、原子能力、复合工作流和平台适配层。首批目标平台：Claude、DeepSeek Harness、Trae、WorkBuddy、豆包。

## 快速入口

| 资产 | 用途 |
|---|---|
| [系统总览](docs/00-PACS-OVERVIEW.md) | 定位、概念与使用方式 |
| [Constitution](docs/01-CONSTITUTION.md) | 权责、原则、风险与治理 |
| [Capability Contract](docs/02-CAPABILITY-CONTRACT.md) | 能力模块统一接口 |
| [个人 AI 使用画像](docs/03-USER-PROFILE.md) | 可迁移的协作偏好与场景 |
| [架构说明](docs/04-ARCHITECTURE.md) | 能力、工作流、Agent、Harness、Adapter 关系 |
| [能力目录](catalog/capabilities.yaml) | C01–C12 能力索引 |
| [工作流目录](catalog/workflows.yaml) | W01–W05 工作流索引 |
| [平台适配指南](adapters/PLATFORM-ADAPTER-GUIDE.md) | 映射到不同 AI 平台 |
| [平台矩阵](adapters/PLATFORM-MATRIX.md) | 记录平台能力验证状态 |
| [一致性测试](tests/CONFORMANCE-TESTS.md) | 验证平台是否遵守 PACS |
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

不要求简单任务机械走完所有步骤；风险越高、周期越长、工具越多，流程越完整。

## 状态与成熟度

能力状态：DRAFT、READY、VALIDATED、DEPRECATED。  
成熟度：V（有实践依据）、S（有书面规范）、X（跨平台实测）、A（仍需抽象或补测）。

文档完成不等于跨平台验证完成。平台兼容状态必须由测试证据支持。

## 版本原则

- 主分支保留审查后的稳定资产。
- 能力变更更新版本、变更记录和测试。
- 平台专属内容放在 Adapter，不污染核心规范。
- 重要操作记录授权、结果和证据。
- 不为自动化而自动化。

当前版本：PACS 0.1.0｜Foundation package｜跨平台实测尚未完成。
