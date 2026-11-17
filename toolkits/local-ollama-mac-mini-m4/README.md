# Mac mini M4 本地模型部署工具包

**版本：** 0.1.0  
**状态：** IN PROGRESS — G0 PASS / G1 INSTALLED / G2 APPLIED / G2.1 COPY VERIFIED / G3 FUNCTIONAL PASS / G4 BASELINE CAPTURED (DSH CO-RESIDENCY NOT TESTED) / G5 NOT TESTED  
**主机：** Apple Silicon M4，16 GiB 统一内存  
**运行时：** Ollama macOS 应用  
**已部署基线模型：** qwen3.5:4b（本机 API 元数据报告 NVFP4 / MLX）  
**后续接入：** DeepSeek Harness MCP stdio bridge（本工具包不启用）

**最新验收更新（2026-11-17）：** G3 已按功能验收 PASS：Ollama 子进程使用 `/Volumes/SSD/AI-Workspace/models`，`OLLAMA_NO_CLOUD=1`，Qwen3.5-4B 已完成实际推理。内置模型副本保留。G4 已采集冷加载、真正驻留热推理及 Runner VM Map：热推理 `load_duration=0.0049s`、`eval_count=946`、`eval_duration=34.0299s`、约 `27.80 tokens/s`；Runner `Physical footprint (peak)=4.3 GiB`，其中 IOAccelerator graphics resident 3.8 GiB。热推理后系统 free 37%、Swap 1490.62 MB（未增加）。这些数据是本配置的实测基线，不能按参数量线性外推 MoE；DSH 与模型共驻留的资源安全对照尚未测试。下一步转 G5：TS900 非破坏性顺序读写测试。完整记录见 [4B Runtime Baseline](reports/4b-runtime-baseline-2026-11-17.md)。

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

**本机执行记录（2026-11-17）：** `migrate-default-model-store.sh --apply` 已复制 `~/.ollama/models` 到外置目标目录；735 个文件逐文件比较通过，源目录保留。外置目录约 3.7G，内置源目录约 3.8G。最新只读进程检查：Ollama.app PID 14156 / PPID 1，环境中的 `OLLAMA_MODELS=/Volumes/SSD/AI-Workspace/models`；子进程 `ollama serve` PID 14157 / PPID 14156，环境中的 `OLLAMA_MODELS=/Users/liyucheng/.ollama/models`。两者均有 `OLLAMA_NO_CLOUD=1`，服务绑定 `127.0.0.1:11434`。`launchctl list` 可见 `com.ollama.ollama` 与 Electron application job；`~/Library/LaunchAgents` 和 `/Library/LaunchAgents` 未发现 Ollama plist。故 G3 **FAIL / NOT ACCEPTED**：父子进程环境不一致，实际模型文件访问路径尚未通过打开文件/日志验证，根因未知。不要删除内置副本、不要重复 pull。下一步只读检查 server open files、Ollama 日志、`~/.ollama/server.json`、应用启动配置；查明子进程环境来源后再做一次受控修复。

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

关键结论：当前 `qwen3.5:4b` 是 Dense 4B，不含 MoE 专家路由；保留它作为轻量任务模型、故障回退和性能对照，不卸载。35B-A3B 的稀疏激活由模型内部 Router 每 token 选择专家；SSD Streaming Runtime 负责按需读取专家权重并维护有界缓存；PACS Task Router 再决定整项任务调用 4B、MoE 或云端。三层不能混为一谈。先修复 G3，再审计兼容 SSD Streaming 的运行时和 checkpoint。当前公开 `serve-mlx` 文档列出的已测试模型包含 Qwen3.6-35B-A3B-8bit、Qwen3-30B-A3B-4bit、Gemma 4；不能据此宣称 Qwen3.5-35B-A3B 已通过该运行时验证。先用明确列入支持清单的 checkpoint 做隔离 pilot，或先补做 Qwen3.5 兼容性验证。暂不下载 100–200GB 模型。


## 当前决策（2026-11-17）

- **保留 Qwen3.5-4B。** 不卸载、不删除内置模型副本；模型文件放在外置 SSD，运行时按任务加载。16GB 统一内存下不得假设 4B 与 MoE 可以同时驻留。
- **单模型执行槽。** 首轮将 Ollama 4B 与实验 MoE runtime 视为互斥工作负载：一个任务批次完成后卸载/停止当前模型，再切换另一模型；并发=1，避免两个模型争抢统一内存。
- **MoE 三层机制。** (1) token-level MoE Router 选择当前 token 的 top-k experts；(2) SSD Streaming Runtime 仅把选中的专家权重读入有界内存缓存，trunk/shared weights 与 KV cache 仍占统一内存；(3) PACS Task Router 按任务难度选择 4B / MoE / cloud。
- **16GB 硬约束。** 模型权重在 SSD 不代表零内存；必须为 macOS、DSH、runtime、非专家 trunk、专家缓存、KV cache 和临时 buffer 留余量。初始采用单请求、短上下文、运行时自动/保守 cache，记录 Memory Pressure、swap、RSS 和 tokens/s；任何持续 swap thrash / memory pressure yellow-red 即停止。
- **当前不下载 35B。** 先修复 Ollama G3。之后只在隔离目录审计运行时与模型架构的精确兼容性。`serve-mlx` 是 pre-release 单用户 server，公开清单中的 tested checkpoints 与 Qwen3.5-35B-A3B 不能自动等同；不允许仅按“35B-A3B”名称推断兼容。

## 安全边界

- API 仅 loopback；禁止 0.0.0.0、LAN、端口转发或公网隧道。
- OLLAMA_NO_CLOUD=1，避免误用 Ollama 云端功能。
- 不在仓库保存 API Key、Token、私人路径、用户数据或运行日志。
- 不使用 sudo，不修改 SIP、Gatekeeper、TCC 或系统安全设置。
- 不修改 DeepSeek Harness 生产配置。
- 本地模型输出是不可信数据，不能修改预算、权限、白名单或审批策略。

所有 Gate 初始为 NOT_TESTED。脚本存在、静态检查或 GitHub 提交不等于真实主机部署通过。详见 docs/ACCEPTANCE.md。
