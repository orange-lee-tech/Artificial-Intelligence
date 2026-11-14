---
name: pacs-evidence-audit-acceptance
description: "Independently audits deliverables against acceptance criteria using verifiable evidence and explicit test status."
metadata:
  pacs_id: C07
  version: 0.1.0
  status: READY
  priority: P0
  minimum_autonomy: A0
---

# C07｜证据审计与验收

## Purpose
独立检查结果是否真实、完整、安全并满足用户定义的验收标准。

## Procedure
1. 重新读取原始目标和验收标准。
2. 检查实际交付物，不只检查执行者总结。
3. 对关键事实回到原始来源、日志、差异、测试或运行环境。
4. 将每项标准标记 PASS / PARTIAL / FAIL / NOT_TESTED。
5. 检查遗漏、虚构、过时内容、越权和副作用。
6. 区分静态检查、单元、集成、端到端、生产和真实设备验证。
7. 列出限制、剩余风险和未覆盖场景。
8. 证据充分才标记 VERIFIED；人类接受后标记 ACCEPTED。

## Output
验收矩阵、证据位置、问题清单、风险、最终状态和建议。

## Acceptance
结论与证据一致；未测试项目明确标记；不把部分通过包装成全部通过。
