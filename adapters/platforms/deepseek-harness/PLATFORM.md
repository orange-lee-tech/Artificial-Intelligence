# DeepSeek Harness Adapter Profile

状态：NOT_TESTED  
项目优先级：第一批  
定位：重点验证 Harness 层的任务编排、工具路由、运行循环、状态和权限控制。

## 适配目标
将 PACS Capability Contract 映射到 Harness 的任务输入、Agent 角色、工具注册、执行循环和结果输出。

## 必须核实
- Harness 的运行入口和配置文件结构。
- Agent / 子任务 / 工具调用的真实接口。
- 文件、Shell、浏览器、API 和 Git 的权限边界。
- 任务状态、日志、重试和中断恢复机制。
- 人工审批与高风险动作的阻断方式。

## 映射要求
优先映射 C04、C05、C06、C07、C08、C09，并验证 Task/Result Envelope。

## 验收
执行 T05、T06、T07、T08、T09、T10；检查工具调用日志与最终状态是否一致。

本文件不预设具体 Harness 实现、插件或工具已经可用。
