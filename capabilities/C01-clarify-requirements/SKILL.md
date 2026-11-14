---
name: pacs-clarify-requirements
description: "Clarifies ambiguous requests into scoped tasks with deliverables, constraints, and acceptance criteria."
metadata:
  pacs_id: C01
  version: 0.1.0
  status: READY
  priority: P0
  minimum_autonomy: A0
---

# C01｜需求澄清

## Purpose
将用户表达和初步想法转化为准确任务定义，明确目标、范围、约束、交付物和验收标准。

## Trigger
目标模糊、多目标冲突、执行路径存在不同解释，或任务涉及多系统、多人、复杂交付和外部影响时调用。

## Exclusions
简单且意图明确的问答；用户已提供完整需求和验收标准时，不重复盘问。

## Inputs
原始请求、已知上下文、文件或项目状态、时间/成本/格式约束。

## Procedure
1. 判断任务类型：解释、研究、决策、创作、执行或混合。
2. 提取最终目标，不把用户提出的手段误认为唯一目标。
3. 区分必需条件、偏好条件和可选条件。
4. 识别范围边界、不可做事项、依赖和风险。
5. 形成交付物清单和可检查验收标准。
6. 判断缺失信息是否会改变正确性。
7. 只有一个关键问题时优先只问一个；可合理推进时记录假设并继续。

## Output
Task brief、Deliverables、Acceptance criteria、Open questions、Assumptions。

## Failure handling
用户意图相互矛盾时，指出冲突并提供解释；不得自行选择可能造成重大后果的解释。

## Acceptance
第三方仅凭任务定义即可理解要做什么、不能做什么以及如何判断完成。
