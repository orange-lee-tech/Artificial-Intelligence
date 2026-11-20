# 本地模型部署验收清单

所有状态初始为 NOT_TESTED。脚本存在或 GitHub 提交成功不代表主机验收通过。

| Gate | 验收项 | 必须证据 | 初始状态 |
|---|---|---|---|
| G0 | 主机预检 | macOS、arm64、内存、内置盘、外置卷挂载和可写状态 | NOT_TESTED |
| G1 | Ollama 安装 | 官方应用路径、版本、CLI 版本 | NOT_TESTED |
| G2 | 模型目录 | launchd OLLAMA_MODELS、目录属主/可写、断盘策略 | NOT_TESTED |
| G3 | 本地安全 | API 仅 loopback、OLLAMA_NO_CLOUD=1、无 wildcard listener | NOT_TESTED |
| G4 | 模型下载 | 精确 tag、digest、存储位置、下载完成 | NOT_TESTED |
| G5 | 推理冒烟 | /api/chat 响应、JSON Schema、usage/duration | NOT_TESTED |
| G6 | 资源压力 | Memory Pressure、Swap、进程内存、加载/卸载 | NOT_TESTED |
| G7 | 任务质量 | LM01–LM06 输入、输出、人工评分和修正 | NOT_TESTED |
| G8 | 长期稳定性 | 多小时任务、异常停止、外置盘断开恢复 | NOT_TESTED |
| G9 | Harness 桥接 | stdio 握手、工具发现、超时、取消、结果回传 | NOT_TESTED |

## 通过条件

- G0：确认 Apple Silicon 和实际内存/磁盘容量。
- G1：仅安装官方 Ollama macOS 应用。
- G2：模型目录确实在目标卷；不移动已有模型或运行时目录。
- G3：不监听 0.0.0.0、LAN 或公网；本地云功能禁用。
- G4：只安装 qwen3.5:4b-q4_K_M，并记录模型 digest。
- G5：结构化输出有效，冒烟测试后模型卸载。
- G6：没有持续不可接受的内存压力或 swap 增长。
- G7：质量由代表性任务和人工评分决定，不以速度或模型自述代替。
- G8：重启与外置盘断开恢复经过实测。
- G9：只在独立验证后进入 DSH MCP Manager 配置评审。

## 失败处理

- 持续内存压力、swap 增长或 GUI 卡顿时停止 benchmark，并卸载模型。
- 外置卷未挂载时禁止静默回退到内部盘下载。
- 下载中断先检查 ollama list 和磁盘空间，不清理整个模型目录。
- 本地失败不得静默回退云端。
- 本工具包不宣称全局 Budget Guard 已完成。
