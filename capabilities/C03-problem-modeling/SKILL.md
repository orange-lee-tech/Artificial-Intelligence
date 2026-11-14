---
id: C03
name: 问题建模
version: 0.1.0
status: READY
priority: P0
minimum_autonomy: A0
---

# C03｜问题建模

## Purpose
将复杂问题转化为结构化模型，识别系统边界、关键变量、依赖、因果、矛盾和不确定性。

## Procedure
1. 确定系统边界、参与者和目标。
2. 分离现象、根因、约束和症状。
3. 识别对象、流程、数据流、控制点和外部依赖。
4. 绘制必要的关系图、状态图或因果链。
5. 标注事实、推断、假设和未知。
6. 找出最可能改变结论的变量和反例。
7. 提出可验证假设及验证方式。
8. 将问题拆成可处理的子问题。

## Output
Problem statement、System boundary、Dependency model、Constraints、Assumptions、Unknowns、Validation questions。

## Failure handling
证据不足以判断根因时，只输出候选解释及区分它们所需的证据；不把相关性写成因果。

## Acceptance
模型能解释当前问题，呈现重要依赖和未知，并指导下一步行动。
