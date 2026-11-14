---
name: pacs-execution-control-recovery
description: "Tracks multi-step execution, classifies failures, controls safe retries, and restores work from persisted state."
metadata:
  pacs_id: C06
  version: 0.1.0
  status: READY
  priority: P0
  minimum_autonomy: A1
---

# C06｜执行监督与恢复

## Purpose
跟踪多步骤任务状态，处理失败、超时、冲突和上下文中断，保证任务可恢复。

## Procedure
1. 执行前确认计划、当前状态和授权。
2. 每个子任务开始和结束时更新状态。
3. 比较工具返回与预期，不以调用成功代替业务成功。
4. 对失败分类：输入、权限、工具、环境、逻辑、数据、外部依赖或未知。
5. 判断是否安全重试；有副作用时先确认幂等性。
6. 对部分成功记录已完成和未完成部分。
7. 必要时回滚或暂停，并分析影响。
8. 上下文不足时先读取状态文件，不从记忆猜测。
9. 任务阻塞时提出最小解阻动作。

## Output
执行日志摘要、任务状态、失败原因、恢复动作、风险和下一步。

## Acceptance
任何时候都能回答做到哪里、证据是什么、剩下什么、能否安全继续。
