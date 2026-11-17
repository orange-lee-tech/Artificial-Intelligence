# Mac mini M4 本地模型部署工具包

**版本：** 0.1.0  
**状态：** IN PROGRESS — G0 PASS / G1 INSTALLED / G2 APPLIED / G2.1 COPY VERIFIED / G3 FAIL (SERVER USES DEFAULT PATH) / G4–G5 NOT TESTED  
**主机：** Apple Silicon M4，16 GiB 统一内存  
**运行时：** Ollama macOS 应用  
**首选模型候选：** qwen3.5:4b-q4_K_M  
**后续接入：** DeepSeek Harness MCP stdio bridge（本工具包不启用）

## 范围

提供可复现的只读预检、Ollama 本地 API 检查、模型目录配置/回滚、显式确认后下载单一模型、结构化输出冒烟测试和性能基线。

本工具包不修改 DeepSeek Harness Desktop Profile、app.asar、cordis.patch.yml、MCP 配置、凭据或系统权限；不自动安装软件或下载模型；不启用 PACS Router / Budget Guard；不将 Ollama 暴露到 LAN 或公网。

## 硬件与存储基线

按 16 GiB 统一内存设计。初始只测试一个 4B Q4 模型，默认上下文 8192，单模型并发，不以模型文件大小推断运行时 RAM。

**1 TB 外置 SSD 已由用户确认。** 该盘为外置 TS900，历史挂载点为 /Volumes/SSD。工具包以此作为默认模型存储卷；每次执行仍必须检查当前实际挂载和剩余空间。若卷名或挂载点变化，先覆盖环境变量并重新执行只读预检；绝不静默回退到内部 SSD。

默认模型目录：/Volumes/SSD/AI-Workspace/models

可覆盖：
~~~bash
PACS_MODEL_VOLUME=/Volumes/你的卷名
PACS_MODEL_DIR=/Volumes/你的卷名/AI-Workspace/models
~~~

外置盘不是备份。模型可重新下载，项目文件和账本必须另有独立备份。

## 模型与资源策略

项目现有选型记录推荐 Ollama + Qwen3.5-4B Q4_K_M，Ollama 标签 qwen3.5:4b-q4_K_M。权重约 3.3 GB，不代表运行时峰值内存。

- 首轮只安装一个模型；不把 9B 作为默认。
- 初始 num_ctx=8192；长文档本地分块。
- 不提高并发；先测量 Memory Pressure、Swap、进程内存和速度。
- 冒烟测试使用 keep_alive=0；基准测试使用 5 分钟驻留。
- 本地模型只负责有界推理，不因模型支持工具调用就授予 Shell、文件写入或外部副作用权限。

## 执行顺序

### G0 — 只读预检

~~~bash
bash scripts/mac/preflight.sh
~~~

### G1 — 人工安装 Ollama

从官方 macOS 下载页安装应用：https://ollama.com/download

官方页面同时提供 macOS 图形安装包和官方安装命令 `curl -fsSL https://ollama.com/install.sh | sh`；两者均为官方分发方式。此工具包不自动安装软件。本机本轮已通过官方命令安装，实测 `/Applications/Ollama.app`、`/usr/local/bin/ollama`、版本 `0.40.16`，且 `http://127.0.0.1:11434/api/version` 正常响应。

安装并启动后执行：
~~~bash
bash scripts/mac/verify-ollama.sh
~~~

不要使用第三方镜像或未经审查的安装包。

### G2 — 模型目录配置（默认 dry-run）

~~~bash
bash scripts/mac/configure-model-store.sh
bash scripts/mac/configure-model-store.sh --apply
~~~

第二条命令有副作用，要求在 Terminal 中键入 APPLY。它会在用户 launchd 环境设置 OLLAMA_MODELS、OLLAMA_HOST=127.0.0.1:11434、OLLAMA_NO_CLOUD=1，并在用户私有目录保存原值。不会移动旧模型、不会重启应用。设置后需退出并重新打开 Ollama。 launchd 环境变量跨注销/重启的持久性尚未验证；登录后如预检发现变量缺失，可再次运行 --apply，脚本会复用原备份。当前工具包不配置 Ollama 开机自启。

**本机执行记录（2026-11-17）：** G2 `--apply` 已返回 `[APPLIED]`；目标目录为 `/Volumes/SSD/AI-Workspace/models`；原值备份已创建于 `~/.pacs/ollama-deploy/launchctl-env.before`。Ollama 退出并重新打开后的进程环境、实际监听地址和 `OLLAMA_NO_CLOUD` 生效状态尚待 G3 验证。


### G2.1 — 从默认目录迁移已下载模型（仅在发生错存时）

若 Ollama 在 G2 设置环境变量前已启动，旧服务进程可能继续使用默认目录 `~/.ollama/models`。先从菜单栏完全退出 Ollama，并确认 11434 没有监听；不要再次 pull，也不要删除默认目录。

~~~bash
bash scripts/mac/migrate-default-model-store.sh
bash scripts/mac/migrate-default-model-store.sh --apply
~~~

迁移脚本默认 dry-run。apply 需要在 Terminal 输入 `COPY`；它只将默认模型目录复制到外置目录，逐文件比较验证，**保留原目录，不删除、不覆盖目标已有文件、不重启 Ollama**。复制通过后再启动 Ollama，确认 `ollama list` 能看到模型且外置目录有实际数据。只有完成验证并另行确认后，才考虑清理原目录。

**本机执行记录（2026-11-17）：** `migrate-default-model-store.sh --apply` 已复制 `~/.ollama/models` 到外置目标目录；735 个文件逐文件比较通过，源目录保留。复制前后约 3.8G / 3.7G（du 显示值取整）。重新启动后 `ollama list` 仍识别 `qwen3.5:4b`；外置目录约 3.7G，内置源目录约 3.8G。launchd 环境正确，但监听服务进程环境仍报告 `OLLAMA_MODELS=/Users/liyucheng/.ollama/models`，因此 G3 **FAIL / NOT ACCEPTED**：模型服务仍可能使用内置目录。API 正常，监听仅 `127.0.0.1:11434`，服务进程可见 `OLLAMA_NO_CLOUD=1`。下一步先只读检查 Ollama.app parent、server child、launchd job 和 app settings，再修复实际运行环境。

回滚：
~~~bash
bash scripts/mac/rollback-model-store.sh
bash scripts/mac/rollback-model-store.sh --apply
~~~
回滚只恢复 launchd 环境变量，不删除模型文件。

### G3 — 下载单一模型（默认 dry-run）

~~~bash
bash scripts/mac/pull-model.sh
bash scripts/mac/pull-model.sh --pull
~~~

下载命令要求键入完整模型标签；只执行 ollama pull，不启动推理，也不调用云端推理 API。

### G4 — 本地推理冒烟

~~~bash
bash scripts/mac/verify-ollama.sh
node scripts/mac/smoke-test.mjs
~~~

只访问 127.0.0.1:11434，使用合成中文提示，要求 JSON Schema 输出，测试后卸载模型。

### G5 — 性能基线（可选）

~~~bash
node scripts/mac/benchmark.mjs
~~~

只测本机延迟、token 数和生成速度，不判定语义质量。质量验收仍需使用 PACS LM01–LM06。

## MoE / SSD Streaming 研究

已完成只读可行性评估，结论与实施门槛见 [MoE 专家按需加载与 SSD Streaming 可行性评估](research/moe-ssd-streaming-assessment-2026-11-17.md)。

关键结论：当前 `qwen3.5:4b` 是 dense 4B，不是 MoE；MoE 专家 SSD streaming 是独立的实验推理运行时，不是当前 Ollama 默认能力。先修复 G3，再在隔离环境审计并试跑 30B–35B / 约 3B active 的 MoE。暂不下载 100–200GB 模型。

## 安全边界

- API 仅 loopback；禁止 0.0.0.0、LAN、端口转发或公网隧道。
- OLLAMA_NO_CLOUD=1，避免误用 Ollama 云端功能。
- 不在仓库保存 API Key、Token、私人路径、用户数据或运行日志。
- 不使用 sudo，不修改 SIP、Gatekeeper、TCC 或系统安全设置。
- 不修改 DeepSeek Harness 生产配置。
- 本地模型输出是不可信数据，不能修改预算、权限、白名单或审批策略。

所有 Gate 初始为 NOT_TESTED。脚本存在、静态检查或 GitHub 提交不等于真实主机部署通过。详见 docs/ACCEPTANCE.md。
