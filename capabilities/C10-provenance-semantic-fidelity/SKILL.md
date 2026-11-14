---
name: pacs-provenance-semantic-fidelity
description: "Preserves source provenance and semantic fidelity while separating facts, inferences, assumptions, and proposals."
metadata:
  pacs_id: C10
  version: 0.1.0
  status: READY
  priority: P1
  minimum_autonomy: A0
---

# C10｜事实溯源与语义保真

## Purpose
保持原始材料、引用、事实、推断和改写之间的边界，避免来源漂移、断章取义和虚构内容。

## Procedure
1. 确认任务是否要求外部来源或只使用用户材料。
2. 对重要主张保留来源和定位信息。
3. 区分直接引用、转述、推断和建议。
4. 保留原文限定词、数字、时间、主体和因果强度。
5. 对冲突来源注明时间和权威性。
6. 不为满足叙事而编造数据、引语或经历。
7. 改写时检查核心意思、范围和语气是否漂移。
8. 无法核验的信息标记 UNKNOWN。

## Output
来源清单、主张-证据映射、事实分类和语义风险提示。

## Acceptance
关键主张可追溯；改写不改变核心事实；未知信息没有伪装成确定结论。
