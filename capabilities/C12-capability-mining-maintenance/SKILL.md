---
name: pacs-capability-mining-maintenance
description: "Extracts reusable capabilities from validated work, then tests, versions, consolidates, or retires them."
metadata:
  pacs_id: C12
  version: 0.1.0
  status: READY
  priority: P1
  minimum_autonomy: A1
---

# C12｜能力抽象与维护

## Purpose
从重复且经过验证的真实任务中提取可复用能力，持续测试、版本化和淘汰低价值模块。

## Procedure
1. 识别重复任务、稳定决策规则和可复用步骤。
2. 区分通用能力、领域知识、项目特例和平台差异。
3. 判断封装价值：复用频率、风险、节省成本和维护负担。
4. 按 Capability Contract 定义触发、输入、输出、步骤和验收。
5. 提取正向、反向、边界和失败测试。
6. 先在真实任务试运行，再提高成熟度标记。
7. 记录版本、依赖、变更原因和兼容性。
8. 合并重复模块；淘汰低价值或过时能力。

## Output
能力提案、Skill 文件、测试记录、版本变更和弃用说明。

## Acceptance
模块职责明确、可独立测试、可组合，并有真实任务证据支持其价值。
