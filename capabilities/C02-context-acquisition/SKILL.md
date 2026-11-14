---
name: pacs-context-acquisition
description: "Retrieves and reconciles the minimum reliable project context, prior decisions, and evidence needed for a task."
metadata:
  pacs_id: C02
  version: 0.1.0
  status: READY
  priority: P0
  minimum_autonomy: A0
---

# C02｜上下文获取

## Purpose
从当前对话、项目文件、版本库、连接器和权威来源获取完成任务所需的最小充分上下文。

## Trigger
任务提及既有项目、历史决策、先前文件、仓库，或依赖当前代码、配置、数据和外部事实时调用。

## Procedure
1. 列出需要确认的事实类别，不无差别搜索所有资料。
2. 优先检查当前会话文件和已知权威来源。
3. 历史项目资产使用正确的文件或连接器检索路径。
4. 区分当前状态、历史记录、用户回忆和模型推断。
5. 记录来源、版本/时间和适用范围。
6. 对冲突信息保留冲突，判断新旧、权威性和证据质量。
7. 只把与当前任务有关的上下文带入执行。

## Output
Context brief：已确认事实、来源、当前状态、关键决策、未知项和冲突项。

## Exclusions
不因个性化而检索无关个人信息；不以项目记忆替代当前系统检查。

## Acceptance
影响方案的关键事实均可追溯；未核实内容标记为推断或未知。
