# PACS Capability Contract｜能力模块统一契约

版本：0.1.1

## 1. 目的
确保能力可被不同模型和 Harness 理解、调用、组合、测试和替换。能力语义不依赖平台专属语法。

## 2. 跨平台 Skill 元数据
每个可执行 Skill 的 SKILL.md 必须采用跨平台公共元数据：
- name：稳定的 kebab-case 英文标识。
- description：清楚说明职责和触发场景，建议不超过 200 个字符。
- metadata：PACS 扩展信息，包括 pacs_id、version、status、priority、minimum_autonomy。

将 PACS 专有字段放入 metadata，避免与平台保留字段冲突。不同平台若要求文件名大小写、ZIP 根目录或其他格式，由 Adapter 转换，不修改公共能力语义。

每个能力同时在 catalog/capabilities.yaml 登记稳定 ID、中文名称、优先级和源文件路径。

## 3. 必需能力元数据
id、name、version、status、maturity、purpose、triggers、exclusions、inputs、outputs、procedure、dependencies、permissions、failure_modes、acceptance、tests。

## 4. 标准任务输入
参照 schemas/task-envelope.schema.json。核心字段：task_id、goal、context、constraints、inputs、expected_output、acceptance_criteria、risk_level、autonomy_level、tools_allowed、approval_required。

若信息不足，判断缺失信息是否改变正确性。只有一个关键缺口时优先问一个直接问题；可合理推进时记录假设并继续。

## 5. 标准执行流程
1. VALIDATE：检查输入和权限。
2. INTERPRET：确认目标、边界和成功条件。
3. EXECUTE：按能力步骤执行。
4. VERIFY：检查输出是否达标。
5. REPORT：输出结果、证据、假设、风险和未解决事项。

简单能力可合并步骤，但不得省略必要的权限检查和结果核验。

## 6. 标准输出
参照 schemas/result-envelope.schema.json。至少包含 status、summary、artifacts、evidence、assumptions、risks、unresolved、next_actions。

不得把不存在的文件、未运行的测试、未访问的页面或未执行的工具调用写入 artifacts/evidence。

## 7. 能力边界
能力只对自己的职责负责。发现相邻问题可提出建议或调用其他能力，不得悄悄扩大范围。不得由同一执行过程无独立检查地同时完成复杂实施和自我验收。

## 8. 权限
实际执行等级取任务授权与能力要求中更严格的一方。A3 操作必须获得当前任务的人类明确批准。

## 9. 失败处理
缺信息：提问或标记假设。工具不可用：说明限制，不得假装成功。结果冲突：保留证据并降低结论确定性。执行失败：记录已完成、失败点、影响和恢复建议。超出授权：停止写操作。质量不达标：不得标记 VERIFIED。

## 10. 版本与兼容
PATCH 修正不改变接口语义；MINOR 向后兼容增加可选能力或字段；MAJOR 改变必需字段、语义或边界。平台专属字段放入 Adapter 扩展命名空间。

## 11. 最小合格标准
每项能力必须能回答：何时调用、需要什么输入、如何执行、允许什么工具和权限、产出什么、如何证明成功、失败怎么办、如何交接。缺少任一项，不应标记 READY。
