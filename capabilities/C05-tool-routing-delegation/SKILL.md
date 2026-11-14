---
name: pacs-tool-routing-delegation
description: "Routes tasks to suitable models, agents, tools, and reviewers within explicit permission boundaries."
metadata:
  pacs_id: C05
  version: 0.1.0
  status: READY
  priority: P0
  minimum_autonomy: A0
---

# C05｜工具选择与委派

## Purpose
根据任务性质、证据要求、权限和成本，选择合适模型、Agent、Harness、连接器、API、CLI 或人工执行者。

## Routing dimensions
任务类型、数据位置、工具真实能力、读写权限、风险等级、可验证性、成本和上下文需求。

## Procedure
1. 判断是否真的需要工具。
2. 确认工具可用、已连接且权限足够。
3. 选择满足要求的最小工具集合。
4. 指定主执行者和必要的独立审计者。
5. 为委派单元提供任务、上下文、边界、交付物和验收标准。
6. 并行任务不得竞争写入同一资源。
7. 外部副作用和高影响操作设置批准门槛。
8. 工具不可用时说明限制，不虚构访问能力。

## Output
Routing plan：执行者、工具、权限、调用顺序、并行关系、审计者和替代路径。

## Acceptance
每个工具都有明确用途；权限不超出需要；委派结果可独立验收。
