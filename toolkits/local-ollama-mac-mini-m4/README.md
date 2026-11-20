# Mac mini M4 本地模型部署工具包

**版本：** 0.1.0  
**状态：** IN PROGRESS — G0 PASS / G1 INSTALLED / G2 APPLIED / G2.1 COPY VERIFIED / G3 FUNCTIONAL PASS / G4 BASELINE CAPTURED (DSH CO-RESIDENCY NOT TESTED) / G5 NON-ZERO-DATA BASELINE CAPTURED (SINGLE RUN; SUSTAINED TEST NOT DONE) / G6.1 RUNTIME SOURCE AUDIT COMPLETE (NO INSTALL; CHECKPOINT AND 16GB PILOT PENDING)  
**主机：** Apple Silicon M4，16 GiB 统一内存  
**运行时：** Ollama macOS 应用  
**已部署基线模型：** qwen3.5:4b（本机 API 元数据报告 NVFP4 / MLX）  
**后续接入：** DeepSeek Harness MCP stdio bridge（本工具包不启用）

**最新验收更新（2026-11-17）：** G3 已按功能验收 PASS：Ollama 子进程使用 `/Volumes/SSD/AI-Workspace/models`，`OLLAMA_NO_CLOUD=1`，Qwen3.5-4B 已完成实际推理。内置模型副本保留。G4 已采集冷加载、真正驻留热推理及 Runner VM Map：热推理 `load_duration=0.0049s`、`eval_count=946`、`eval_duration=34.0299s`、约 `27.80 tokens/s`；Runner `Physical footprint (peak)=4.3 GiB`，其中 IOAccelerator graphics resident 3.8 GiB。热推理后系统 free 37%、Swap 1490.62 MB（未增加）。这些数据是本配置的实测基线，不能按参数量线性外推 MoE；DSH 与模型共驻留的资源安全对照尚未测试。下一步转 G5：TS900 非破坏性顺序读写测试。完整记录见 [4B Runtime Baseline](reports/4b-runtime-baseline-2026-11-17.md)。

**G5 TS900 基准（2026-11-17）：** 外置 USB/APFS SSD 完成 24GiB 非零高熵数据复测：随机源上限 633.4MiB/s；顺序写入+sync 408.9MiB/s；`F_NOCACHE` 顺序读取 834.7MiB/s；4KiB 随机读取 5492.1 IOPS（P95 0.288ms）；64KiB 随机读取 2983.6 IOPS（P95 0.451ms）；`st_blocks` 分配比例 1.0003；测试文件已自动清理，可用空间恢复 946GiB。首轮 `/dev/zero` 结果仅保留为历史 provisional 数据，不作为基线。当前 G5 状态为单轮有效基线已采集；重复/持续负载、温度和 SMART 健康状态尚未验证。该数据足以进入 G6 的 SSD Expert Streaming Runtime 只读兼容性审计，不足以单独证明 MoE 端到端性能。详见 [TS900 SSD Benchmark](reports/ts900-ssd-benchmark-2026-11-17.md) 与 [benchmark-ts900.sh](scripts/mac/benchmark-ts900.sh)。

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

## G6 — Runtime 兼容性审查（2026-11-17）

**当前状态：G6.1 SOURCE AUDIT COMPLETE；G6 总体仍 IN PROGRESS。** 本阶段只读审查了 streamlx、serve-mlx 和 llama.cpp MoE disk-paging PoC 的源码、依赖、许可证、模型适配、专家读取、缓存、预取及内存保护路径。没有安装 Runtime，没有下载模型，没有修改 Ollama / DSH 生产配置。

第一轮结论：
- **streamlx：** 当前最值得深入的性能候选。它用 Safetensors byte-range index、合并读取、并发 `pread/preadv`，将专家数据直接写入预分配的 MLX pool storage，并有逐层 LRU、下一层预取和可选 MTP pipeline。注意：逐层 top-k 最低 slot 数可能使实际 pool bytes 超过 `--budget-gib`；`--memory-gib` 是可选的请求期池大小治理，不是完整的 macOS Memory Pressure / Swap watchdog。第一轮 16GB 试验不得启用 MTP/draft。
- **serve-mlx：** 当前最值得借鉴的内存安全参考。它显式预算 working set、shell、KV、scratch 和 safety margin；压力持续时依次禁用预取、驱逐、缩小缓存、拒绝继续执行。源码包含 `qwen3_5_moe` adapter，但小型合成模型测试不能代替真实大 checkpoint 验证。
- **llama.cpp PoC：** 作为原生 Metal 参考，采用 Metal Shared Memory slot pool、CPU sidecar、`pread` 和 `MTLSharedEvent`。它属于独立 fork/PR，不是上游正式功能。

当前暂定后续审查优先级：streamlx 性能路径 P0；serve-mlx 内存安全与正确性参考 P0；llama.cpp 原生 Metal 路线 P1。该排序不代表已经选定最终 Runtime。

**下一步：** G6.2 精确 checkpoint / tensor layout / quantization 兼容性审查；G6.3 计算目标模型的 per-layer top-k 最低专家槽位和 16GiB 内存包络；G6.4 设计 TS900 runtime-level 合并读取与 I/O/Metal overlap 测试。以上均不要求先下载完整大模型。

streamlx 还有一个需注意的默认行为：`STREAMLX_KEEPALIVE` 默认开启，会在 I/O 等待时提交 GPU keepalive 工作；首轮正确性/内存基线应先设置 `STREAMLX_KEEPALIVE=0`，稳定后再进行开关 A/B 测试。 详细报告：[G6 Runtime Compatibility Audit](research/g6-runtime-compatibility-audit-2026-11-17.md)。

## G6.2 — 模型选型与 16GB MoE 试验策略（2026-11-17）

**能力目标 P0：Qwen3.5-122B-A10B（122B 总参数 / 10B active）。** 这符合 8–10B active 的研究偏好，但尚未在本机运行；标准 MLX 4-bit checkpoint 约 69.6GB，streamlx 家族匹配较明确，16GB 内存包络和实际吞吐未测试。

**下一项本地 MoE pilot 候选：Kimi Linear 48B-A3B。** 48B 总参数 / 3B active，MLX 4-bit checkpoint 27.6GB；27 层中首层 dense、26 层 MoE，每层 top-8/256 routed experts + 1 shared expert；20 KDA linear-attention + 7 MLA 层。MLX-LM v0.32.1 的 KimiSparseMoE 使用 stacked `switch_mlp`，与 streamlx 通用 wrapper 结构匹配（不是 streamlx 明确列出的端到端验证模型）；2026-11-18 精确 header audit 得到最低 top-8 expert pool 0.771240 GiB。非 routed 张量为1.063068GiB；KDA/MLA状态源代码核算约0.073GiB/4K。仍需测量运行时 shell、转换 scratch 和整机内存峰值。

**比较候选 P1：Mistral Small 4。** 119B 总参数 / 6.5B active，36 层、128 routed experts、top-4 + 1 shared expert，expert intermediate 2048；4-bit MLX checkpoint 约 67.8GB，Apache-2.0。它没有被 Qwen 在能力上淘汰：Mistral 统一 instruct、reasoning、coding/agent 与图像输入，并支持 reasoning_effort。Qwen 是 P0 的原因是更符合 8–10B active 目标且 streamlx 的 qwen3_5_moe 路径更明确；Mistral 的 mistral4 MLX expert layout / adapter 尚未验证，应保留 P1，不应标成淘汰。Qwen 与 Mistral 的发布方基准不是同一测试设置，当前不能宣称谁在全部任务上胜出。

按三矩阵 SwiGLU 形状估算，Qwen 路由专家参数量为 48×8×3×3072×1024 ≈ 3.624B/token；Mistral 为 36×4×3×4096×2048 ≈ 3.624B/token。故 Mistral top-4 并不意味着路由专家计算量减半；专家宽度是 Qwen 的两倍。两者 shape-derived 4-bit group64 expert slot floor 均约 1.9 GiB，须精确索引验证。

**现有 Qwen3.5-4B 不卸载/不删除。** 它是 dense 4B（每 token 使用完整 dense 权重），当前热推理实测约 27.8 tok/s，继续作为快速回退、基准和质量对照。Kimi 的 27.6GB MLX checkpoint 需要 streamlx；不是可直接替换进现有 Ollama 的模型文件。大模型测试时停止/卸载 4B Runner，遵守单模型执行槽。待 Kimi 通过精确 checkpoint、短上下文正确性、内存/Swap、吞吐和 DSH 共存验收后，再决定是否改变默认路由；磁盘空间不是现在删除 4B 的理由。

### Top-k 路由语义

- Kimi：每 token、每个 MoE 层固定选择 8/256 routed experts，另有 shared expert。
- Qwen 122B：每 token、每个 MoE 层固定选择 8/256 routed experts，另有 shared expert。
- Mistral Small 4：每 token、每个 MoE 层固定选择 4/128 routed experts，另有 shared expert。

模型 Router 选择专家身份，不会因任务简单就自动把 top-k 从 8 降至 2–3。手动减小 K 是非参考推理修改，可能损害回答、推理和工具调用质量；如未来试验，必须对 K=2/4/6/8 做固定任务集 A/B，默认保留原始 K=8。PACS Task Router 可以在 4B 与 Kimi 之间按任务路由，但不能与模型内部 token router 混为一谈。

当前没有 PACS 任务或 expert-routing trace，无法给出“满负荷发生概率”的可靠数字。首轮按并发 1、短上下文、单模型、无 MTP/draft 执行；记录每层专家覆盖率、cache hit/miss、每 token 读取字节、预取命中/浪费、I/O wait、GPU compute、TTFT、tokens/s、系统内存压力及 Swap 增量，再用真实任务分布估计饱和概率。

详细架构、推导、限制与证据见 [G6 Runtime Compatibility Audit](research/g6-runtime-compatibility-audit-2026-11-17.md)。

### G6-Safety — 内存、功耗、热与 SSD 风险门槛

**新增硬门槛：不以“先运行看看”作为模型适配的首要判断。** 在下载或执行大型 checkpoint 前，先完成 pinned Safetensors index/header 精确解析、shell/专家池/KV 或 recurrent state/scratch/runtime 逐项内存预算，以及公开硬件功耗与热资料审查。

- Mac mini M4 16GB：Apple 公布 10-core GPU、120GB/s 内存带宽；M4 16GB 版本功耗表为 idle 4W / max 65W、最大热输出 222 BTU/h；官方工作环境 10–35°C。整机最大功耗不是某个 LLM 的预测功耗。
- Notebookcheck 的 CPU+GPU 压力测试曾测得约 57–58W 持续整机功耗、SoC 约 102°C、风扇约 2,950 RPM；不是 PACS LLM 实测，不能外推为目标模型温度。
- Apple Thermal State：Fair 降低预取/后台负载；Serious 停止接收新任务并卸载模型；Critical 中止推理并冷却。powermetrics 的功耗是估算，热状态读数是瞬时采样。
- 形状推算的完整 routed-expert cold miss：Kimi 约 0.77 GiB/token，Qwen 122B 约 1.90 GiB/token；按 TS900 834.7 MiB/s 顺序读取参考，对应约 0.95s / 2.33s 的串行读取时间等价。不是实际 token latency，缓存命中、预取、I/O 合并和计算重叠会显著改变结果。
- PACS 暂定至少保留 5 GiB 作为 macOS + DSH + 用户/Agent GUI 应用 + 后台服务 + 运行余量的非模型预算下限；这是项目暂定策略，不是 Apple 规格，也不是实测保证。纠正：现有 4B Runner 约 4.3 GiB 的 process peak 属于模型进程占用，不是 5 GiB 非模型预留的依据，只能作为模型侧参考。实际非模型占用超过 5 GiB 时，模型预算必须逐 GiB 下调；11 GiB 只是非模型预留确实满足时的模型侧上限，不是默认可用额度。
- 首个候选仅做静态可行性分析；单模型槽、并发 1、4K 起步、无 MTP/draft、有限缓存/预取。未完成内存、热和 SSD 温度证据前，不宣称适合无人值守持续服务。

详细推导与限制见 [G6 Runtime Compatibility Audit](research/g6-runtime-compatibility-audit-2026-11-17.md#7d-g6-safety--16gb-memory-power-thermal-and-ssd-risk-gate-2026-11-17)。

### G6-Context — 上下文、截图与 Agent 副产物预算

- Kimi Linear 是 20 层 KDA + 7 层 MLA 的混合注意力模型。按 16-bit MLA cache 假设，cache 斜率约 8,064 bytes/token：4K=31.5MiB、8K=63MiB、128K=0.984GiB、256K=1.969GiB、1M=7.875GiB。KDA recurrent state 对序列长度固定，但实际 dtype/layout 仍需核验。1M 是模型配置上限，不是 16GB Mac mini 的安全运行承诺。
- 语义压缩与 Prompt Cache 必须区分：语义压缩生成结构化任务摘要、保存原始事件记录、以短 prompt 重建上下文；Prompt/Prefix Cache 只复用已计算状态，不会缩短上下文，反而占 RAM 或 SSD。
- streamlx 支持有字节上限的 RAM prompt-cache LRU 和可选 SSD 分段 KV/prompt cache；TS900 同时承载专家读取，SSD cache 可能造成 I/O 竞争。Kimi 混合缓存的 recurrent state 只能在 segment 边界恢复，精确 Kimi 分支/回滚行为仍需验证。
- 模型角色必须区分：Qwen3.5-122B-A10B 是 P0 主力能力研究目标，模型本身支持图像输入；Mistral Small 4 也支持图像输入；Kimi Linear 48B-A3B 是 text-only 的低风险 MoE streaming 试验候选，不是整个 PACS 最终视觉助手的默认替代品。
- 4K 解码 RGBA 截图约 31.6MiB/帧，十帧约 316MiB，尚未包含 crop、patch、vision tensor 和 encoder activation。截图只保留当前帧及必要的比较帧，优先 ROI crop，抽取完成后释放图像缓冲。
- 浏览器、IDE、终端、文件查看器和 Agent 自动化宿主都属于整机内存预算。Agent 只能关闭自己创建的 Tab/应用，不自动终止用户进程。监控 Metal-aware process footprint 和系统内存压力，不能只看 RSS。
- 初始建议：4K context、并发 1；达到配置 prompt token budget 的 70% 开始语义压缩，85% 前强制压缩；系统内存压力、Swap 增长、Agent 应用 footprint 或截图队列异常时提前压缩/拒绝请求。该阈值是 PACS 提案，不是 Runtime 默认值。
- 完整内存方程：macOS + DSH + 用户应用 + Agent 应用 + model shell + expert pool + KDA/MLA state + prompt cache + prefill scratch + vision buffers + runtime/allocator + uncommitted headroom ≤ 16 GiB。

详见 [G6 Runtime Compatibility Audit / G6-Context](research/g6-runtime-compatibility-audit-2026-11-17.md)。

### G6.3 — Qwen3.5-122B-A10B 16GB 静态内存核算（2026-11-17）

**结论：有条件可行，未通过本机验收。** 以 4-bit affine / group64、48 层、top-8、每专家 3 个 3072×1024 矩阵估算：每专家约 5.0625 MiB；全体 routed experts 约 60.75 GiB；每层 top-8 的最低专家池约 1.90 GiB。模型仓库显示总 checkpoint 69.6 GB，扣除估算 routed experts 后，non-routed shell 余量约 4.07 GiB（估算，不是 index 精确解析）。

4K KV 约 96 MiB，linear recurrent state 形状估算约 144 MiB。按 PACS 暂定 5 GiB 非模型预留，2 GiB 专家池时 runtime/scratch 尚有约 4.8 GiB 余量；3 GiB 专家池时约 3.7 GiB。**首轮只允许 4K、并发 1、文本任务、专家池 2.0–2.5 GiB、无 MTP/draft、无同时运行 4B Runner、无 GUI/视觉并发。** streamlx 默认 8 GiB expert budget 不适合这台 16 GiB 主机，必须显式下调。

这只说明内存账面上有机会，不代表精确 checkpoint 已兼容、实际峰值已通过或速度/热表现可接受。精确 Safetensors index/header、lazy shell load、实际 MLX/Metal peak、TS900 I/O overlap、热状态仍待验收。未下载模型、未安装 Runtime、未运行大模型、未修改生产配置。

详见 [G6 Runtime Compatibility Audit / G6.3 Qwen 122B memory envelope](research/g6-runtime-compatibility-audit-2026-11-17.md#7g-g63--qwen35-122b-a10b-16-gib-static-memory-envelope-calculation-2026-11-17)。

### G6.2 — Qwen3.5-9B / Ministral 3 8B checkpoint audit (2026-11-18)

- **Qwen3.5-9B-4bit**: pinned `mlx-community/Qwen3.5-9B-4bit@8b2b98c00a6b4d291155e4890773ca8f769aee53`; dense `qwen3_5`, 32 layers, 4-bit affine/group64, 5.95GB index total, two-shard tree/index agree at displayed level. MLX-VLM card documents image inference. Config-derived 4K KV ≈128MiB; linear recurrent state ≈48MiB. With a provisional 5GiB non-model reserve, weights + 4K cache leave ~5.29GiB for runtime/scratch/image buffers. **Source-level candidate for a separately authorized isolated 4K pilot; not hardware-accepted.**
- **Ministral-3-8B-Instruct-2512 4-bit and 6-bit**: architecture is dense `mistral3`, 34 full-attention layers, 8 KV heads. Current visible model trees have two shards, but their Safetensors indices still map a three-shard `of-00003` layout and report 10.42GB total_size. The 4-bit and 6-bit artifacts are therefore **on hold for checkpoint/index inconsistency**; do not download until corrected. 4K KV estimate ≈544MiB, 8K ≈1.06GiB.
- Neither model requires SSD expert streaming. Both use a dense model load path; the current 16GB gate is whole-model weights + KV + vision/prefill scratch + MLX/Metal runtime + OS/DSH reserve.
- Existing Qwen3.5-4B remains installed as baseline/fallback. First pilot, if later approved: one model only, concurrency 1, 4K context, no simultaneous browser/Office/GUI agent, and no 4B co-residency.

Full pinned revisions, source links, arithmetic and exact artifact findings: [G6 Runtime Compatibility Audit / G6.2 Dense 8B–9B audit](research/g6-runtime-compatibility-audit-2026-11-17.md#7i-g62--dense-8b9b-multimodal-checkpoint-audit-2026-11-18)。

### G6-Vision & App Integration — 截图理解与 Office 工作流

- Qwen3.5-122B-A10B 的模型本身有 Vision Encoder，MLX 4-bit 模型卡提供 mlx-vlm 图像输入示例；Mistral Small 4 也支持图像输入。Kimi Linear 48B-A3B 是 text-generation/text-only checkpoint。
- **模型支持视觉 ≠ 当前 Streaming Runtime 支持视觉。** streamlx README 对 MLX-VLM 的说明明确是 text-only exports；Qwen 122B 完整 vision tower + image processor + SSD expert streaming 链路尚未通过端到端验证。Mistral Small 4 的 mistral4 adapter/视觉路径同样未验证。
- 已安装 Qwen3.5-4B 的模型架构有 Vision Encoder，但当前 Ollama 版本 + 本地模型 artifact 的图像请求尚未在本机做 smoke test，不能仅凭模型卡宣布可用。
- 截图理解范围只要求桌面截图：Accessibility Tree/OCR 优先；视觉模型仅处理 OCR 不足、布局/图标/对话框有歧义的 ROI。输出紧凑结构化观察，再交给主模型；处理后释放图像缓冲。
- 16GB 初期维持单模型槽。若 Qwen3.5-4B 做视觉、Kimi 做推理，必须顺序执行、先释放视觉 Runner，再加载 MoE；不得假设两个模型同时驻留。若未来 Qwen 122B + streamlx 完整视觉路径通过验证，则可以由主模型直接看图。
- PPT/图表/流程图优先生成可编辑 PPTX：模型给出大纲和结构化内容，python-pptx/PptxGenJS 或已安装 Office/Keynote/LibreOffice 的受支持 API/CLI/AppleScript/MCP 接口负责创建与导出。只在需要时渲染单页进行视觉 QA；不把普通 PPT 制作升级成视频、扩散模型或复杂图像生成任务。
- 应用集成不会让应用内存归零。浏览器、Office、IDE 和自动化宿主都计入整机预算；优先确定性/无头生成，避免重复启动应用实例。

详细验收标准、模型能力/Runtime 区分及来源见 [G6 Runtime Compatibility Audit / G6-Vision](research/g6-runtime-compatibility-audit-2026-11-17.md#7f-g6-vision--app-integration--screenshot-understanding-and-office-workflows-2026-11-17)。

## 安全边界

- API 仅 loopback；禁止 0.0.0.0、LAN、端口转发或公网隧道。
- OLLAMA_NO_CLOUD=1，避免误用 Ollama 云端功能。
- 不在仓库保存 API Key、Token、私人路径、用户数据或运行日志。
- 不使用 sudo，不修改 SIP、Gatekeeper、TCC 或系统安全设置。
- 不修改 DeepSeek Harness 生产配置。
- 本地模型输出是不可信数据，不能修改预算、权限、白名单或审批策略。

所有 Gate 初始为 NOT_TESTED。脚本存在、静态检查或 GitHub 提交不等于真实主机部署通过。详见 docs/ACCEPTANCE.md。

### G6.2 — PACS model-stack decision framework (2026-11-18)

- **Small model:** retain installed Qwen3.5-4B as measured baseline/fallback; do not replace it solely because Qwen3.5-9B exists. The 9B Dense model is only an optional small-model upgrade after task-suite and memory comparison.
- **Primary text MoE pilot:** Kimi Linear 48B-A3B (48B total / 3B active), because MLX-LM v0.32.1 exposes KimiSparseMoE with the stacked `switch_mlp` layout consumed by streamlx's generic loader, hybrid KDA/MLA reduces long-context cache growth, and the exact header audit confirms a 0.771240 GiB top-8 slot floor. This is source-level structural compatibility, not an upstream Kimi end-to-end validation. It is text-only; pair with OCR/accessibility or a sequential/remote vision helper.
- **Multimodal MoE comparison:** Qwen3.6-35B-A3B (35B / 3B active, vision encoder, 40 layers, 256 experts, top-8 + shared). streamlx validates the Qwen3.5-MoE family; current serve-mlx/mlx-moe-stream docs describe a 16GB vision starting profile, but this is not a PACS M4 mini hardware pass.
- **Stretch target:** Qwen3.5-122B-A10B (122B / 10B active, vision-capable); keep standard MLX+streamlx separate from TurboQuant custom format. Static fit is conditional; full vision-streaming and sustained DSH/GUI use remain unverified.
- **Mistral Small 4:** retain as P1 architecture/quality and `mistral4` adapter audit, not eliminated. Official spec says 119B total / 6B active in MoE (8B including embeddings/output), 128 experts, top-4, image input. No explicit streamlx adapter.
- **Routing:** top-k count is checkpoint-fixed per token (Kimi/Qwen top-8; Mistral top-4); task-level routing to 4B/tools is the supported way to avoid invoking the large model. Do not reduce top-k without quality regression tests.
- **16GiB policy:** provisional 5GiB whole-host non-model reserve; 4K start, concurrency 1, one model process, no co-resident 4B runner, no MTP/draft or GUI/Office concurrency in first pilot. Track shell + expert pool + context state + prompt cache + prefill/vision scratch + MLX/Metal runtime; do not infer RAM from active parameter count.
- **Context/cache:** keep stable prefixes for prompt-cache reuse; semantic compaction is not itself a cache hit. Measure prompt-prefix cache and expert-weight cache separately. Accessibility/OCR first; screenshot ROI only; compact task state and archive full logs/images outside the active prompt.
- **Nodes:** F117 (i7-7700HQ, 32GB RAM, GTX1050Ti 4GB) is a separate helper/tool node, not pooled memory and not an MLX/Metal host. T470s (i5-6300U, 20GB, Intel HD520) is an admin/client endpoint.
- **Qwen3.5-9B:** small-model replacement candidate only, not a replacement for the 48B MoE track.

Full decision matrix, context policy, local permissions, node roles and source references: [G6 Runtime Compatibility Audit / G6.2 PACS model-stack decision framework](research/g6-runtime-compatibility-audit-2026-11-17.md#7j-pacs-model-stack-decision-framework-2026-11-18)。



### 历史研究 — Kimi + Granite 双模型常驻静态内存审计（2026-11-18；非当前部署目标）

- **仅作历史静态研究，不是部署批准。** Kimi Linear 48B-A3B + Granite 4.0 H-Tiny 4-bit 双模型同时驻留、全局推理并发=1，修正后目标账本约 **9.103 GiB model-side**；另预留5 GiB macOS/DSH/应用空间和1.5 GiB未承诺安全余量，计划总量约 **15.603 GiB**，仅余0.397 GiB额外空间。当前执行政策仍是一次只驻留一个大型本地模型；Qwen3.5-4B 仅作顺序 fallback/control。
- Kimi：26 MoE层、top-8；2026-11-18 对 pinned Safetensors index + 六个 shard headers 完成精确核算：每专家3,981,312B，top-8最低槽位828,112,896B（0.771240GiB）；非 `switch_mlp` 张量共1,141,460,992B（1.063068GiB）。后者是 checkpoint trunk tensor payload，不等于包含 MLX/Metal/临时转换的实测 shell 峰值。首轮专家池暂定2GiB目标。
- Granite：4-bit模型卡显示3.91GB（3.64GiB）。按40层、64专家、top-6、hidden1536、expert intermediate512，shape-derived全专家权重约3.164GiB，shell余量约0.477GiB。标准MLX-LM路径按全部3.64GiB常驻；active专家约0.297GiB已包含在全模型权重中，不得重复相加。
- 4K状态估算：Kimi约0.073GiB（MLA KV + FP32 KDA recurrent state + 短卷积状态，源代码推导）；Granite约0.06GiB（Mamba2 state + attention KV，形状估算）。状态不是主要内存成本。
- 初始硬帽：Kimi pool 2GiB；allocator cache总计0.5GiB；prompt cache总计0.25GiB；runtime bases总计0.8GiB；活动模型scratch/startup peak 0.75GiB；MTP/draft关闭。
- 两模型同时推理/同时Prefill为 **NO-GO**。双模型同时驻留只在实际非模型基线≤5GiB、model-side峰值≤9.5GiB、并保留≥1.5GiB headroom时才准入；任一超限则拒绝双驻留。
- Granite MLX checkpoint 的完整 immutable revision、Safetensors index/header 和 H-Tiny/H-Micro 模型树元数据不一致仍待核对；不下载、不安装、不执行。Kimi index/header 精确解析已于2026-11-18完成，但该双驻留研究不构成当前部署目标。**G6.3仍为PARTIAL / STATIC ONLY。**

详细张量分类、公式、逐项预算、运行限制和待关闭问题：[G6 Runtime Compatibility Audit / 7K Dual-resident audit](research/g6-runtime-compatibility-audit-2026-11-17.md#7k-kimi-linear--granite-h-tiny-dual-resident-static-memory-audit-2026-11-18)。



## 2026-11-18 — Host operational baseline and follow-up

The user captured the host with DSH and desktop applications running and no Ollama model resident:

- Mac mini `Mac16,10`, macOS 26.2 build `25C56`, 16 GiB unified memory.
- `memory_pressure` reported 57% system-wide free percentage.
- Current swap used 470.50 MB; this is a point-in-time value, not proof of ongoing swap thrashing.
- No thermal or performance warning was recorded.
- TS900: 946 GiB available.
- Ollama `/api/ps`: `{"models":[]}`.

This is an operational desktop baseline, not a stripped-down idle baseline. Do not translate the 57% figure directly into model-allocatable memory.

The 18:30 CST sample on Nov 18 was followed by a materially worse snapshot at 15:55 CST on Nov 20: swap used 446.50→833.62 MB, system-wide free percentage 56%→51%, free pages 10,352→4,930, and compressor occupancy 288,694→362,081 pages (+1.12 GiB). Cumulative swapouts rose by 32,456 pages (+507.13 MiB) if no reboot occurred between samples; boot continuity is not yet verified. The 5 GiB non-model reserve remains unproven and Kimi admission is on hold.

Evidence: [Host Operational Follow-up](reports/host-operational-followup-2026-11-18-1830.md).

Evidence: [Host Operational Baseline](reports/host-operational-baseline-2026-11-18.md).

The Kimi header audit and shell breakdown have both completed using HTTP Range only. The second script confirms all nine non-routed categories sum to exactly 1,141,460,992 bytes and identifies 16,515,072 bytes (15.75 MiB) of original `kv_b_proj` tensors across seven MLA layers. It does not measure the dequantize/reshape/requantize startup peak.

**No model load, runtime installation, or checkpoint download is authorized by this baseline.**


## 2026-11-18 — Kimi G6.2 exact header audit

**PASS:** the user ran the pinned read-only HTTP-Range audit for `mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit@919175d75427f1c10cfc17e7254b53295edddf72`.

- 1,393 tensor keys matched exactly across the index and all six shard headers.
- Total tensor bytes: 27,641,073,664 (25.742756 GiB).
- Routed `switch_mlp` expert bytes: 26,499,612,672 (24.679688 GiB).
- Non-`switch_mlp` tensor bytes: 1,141,460,992 (1.063068 GiB).
- Exact top-8 per-layer slot floor across 26 MoE layers: 828,112,896 bytes (0.771240 GiB).
- Per-expert bundle: 3,981,312 bytes, identical across all 26 MoE layers.

**Runtime compatibility correction:** current inspected streamlx commit `af9bbe88439212464e5f4cccfa91df75172056b1` does not explicitly list Kimi as an end-to-end tested checkpoint in its README/model table. MLX-LM v0.32.1 does implement Kimi Linear with `KimiSparseMoE.switch_mlp`, which matches streamlx's generic wrapper. Classify this as SOURCE-VERIFIED STRUCTURAL MATCH, NOT END-TO-END VALIDATED. Explicitly pass `k=8`: streamlx's top-k helper reads `num_experts_per_tok`, while this Kimi config uses `num_experts_per_token` and therefore happens to fall back to 8.

The Kimi-only provisional 2/3/4 GiB pool envelope and exact byte audit are recorded in [Kimi Linear G6.2 Exact Header Audit](reports/kimi-linear-g6.2-exact-header-audit-2026-11-18.md).

**Current execution policy remains one large local model at a time.** The installed Qwen3.5-4B remains a sequential fallback/control, not co-resident with Kimi. The historical Kimi + Granite dual-resident ledger is not an approved deployment target.

No model download, runtime installation, model execution or production configuration change was performed.


**Shell breakdown 已完成：** [Kimi shell breakdown audit](scripts/mac/g6.2-kimi-shell-breakdown.py)。九类非routed张量精确合计1,141,460,992 bytes；MLA `kv_b_proj` 输入为21个张量、合计16,515,072 bytes（15.75 MiB）。MLX-LM v0.32.1 会对其执行 dequantize → reshape/split/contiguous → requantize；实际转换峰值仍未测量。详见 [Kimi G6.2 精确审计报告](reports/kimi-linear-g6.2-exact-header-audit-2026-11-18.md)。


### G6.2 — Kimi shell breakdown 与 18:30 主机内存复测（2026-11-18）

- 非 routed 张量九类精确合计 **1,141,460,992 bytes / 1.063068 GiB**，与 Header 总账完全一致。
- 最大分类为 attention_other：544,366,080 bytes / 0.506980 GiB；Embedding 与 Output Head 各 0.197754 GiB；Shared Experts 0.096405 GiB。
- MLA `kv_b_proj`：7层、21个张量、原始输入共 **16,515,072 bytes / 15.75 MiB**。MLX-LM sanitizer 会反量化、reshape、拆分、contiguous 并重新量化；15.75 MiB 不是临时内存峰值。
- 15:39→18:30 主机快照：Swap 470.50→446.50 MB；累计 swapouts 未增加；swapins +1,841 pages；Compressor +190.86 MiB；system-wide free percentage 57%→56%。**未观察到本区间新增 swapouts，但压缩器是否达到平台期仍未确定。**
- 5 GiB 非模型预留仍为 provisional；本轮没有安装 Runtime、下载模型或启动 Kimi。

报告：[Kimi Linear G6.2 Exact Header Audit](reports/kimi-linear-g6.2-exact-header-audit-2026-11-18.md) · [Host Operational Follow-up](reports/host-operational-followup-2026-11-18-1830.md)。


## 2026-11-20 — Host memory pressure follow-up / Kimi admission hold

The new 15:55:59 CST snapshot is materially worse than the Nov 18 18:30 snapshot: swap used 833.62 MB (+387.12 MB), system-wide free percentage 51% (-5 pp), free pages 4,930 (-5,422 pages), and compressor occupancy 362,081 pages (+73,387 pages / +1.1198 GiB). Wired pages decreased by 21,522 pages. Cumulative swapouts increased by 32,456 pages (+507.13 MiB) if no reboot occurred; boot continuity is not yet verified because uptime/boot time was not supplied.

**Decision: HOLD. Do not load Kimi or begin the smoke test.** The 2 GiB pool is still only a static design target; the 5 GiB host reserve is unproven. The pressure source is unknown until current resident processes and Ollama model residency are checked. See [Host Operational Follow-up — 2026-11-20 15:55](reports/host-operational-followup-2026-11-20-1555.md).



### 2026-11-20 16:00 — Process attribution follow-up

- Boot continuity confirmed: `kern.boottime` Nov 17 08:55:18 and uptime 3 days 7:05. Nov 18→Nov 20 cumulative VM counter deltas are therefore same-boot.
- Ollama `/api/ps` returned an empty model list. No Ollama model was resident at 16:00.
- Largest individual RSS process: Chrome renderer PID 8135 (~996.5 MiB); DSH renderer PID 880 (~525.7 MiB); next Chrome main/renderer ~322 MiB each; WPS ~253.7 MiB; DSH main ~222.9 MiB.
- RSS is not unique physical footprint. Do not sum RSS or infer a leak; inspect physical footprint and map Chrome PID 8135 to its tab before taking action.
- From 15:55 to 16:00, swap used fell 16 MB and swapouts did not increase, while compressor occupancy rose ~127.52 MiB; free percentage remained 51%.
- **Kimi admission remains HOLD.** No processes were terminated and no production changes, runtime installation, model download or model load occurred.

Evidence: [Host Process and Memory Audit](reports/host-process-memory-audit-2026-11-20-1600.md).


### 2026-11-20 — PACS single-model + DSH integration reassessment

**Proposed first qualification candidate: Qwen3.6-35B-A3B 4-bit MLX VLM.** This is a candidate priority, not a deployment approval.

Reason: the intended primary model should cover reasoning, coding, tool calls and image understanding. DSH supplies browser/desktop/file/terminal tools, but screenshot semantics still require an image-capable endpoint. Without an explicit `screenshotTarget`, CUA prechecks the Agent route and may reject a text-only model with `MODEL_DOES_NOT_SUPPORT_IMAGES`; a configured `screenshotTarget` can bypass that capture precheck but does not give the text model vision or route the image elsewhere. Accessibility Tree, browser DOM and OCR remain usable as structured text.

Pinned source-audit target:
`mlx-community/Qwen3.6-35B-A3B-4bit@38740b847e4cb78f352aba30aa41c76e08e6eb46`.

The checkpoint is documented as 35B total / 3B active, 40 layers, 256 experts, top-8, image-text-to-text, affine 4-bit/group64, converted with mlx-vlm 0.4.4. The exact 4-bit Safetensors headers, expert/shell/vision bytes, 16 GiB peak and DSH tool-call/image path are still unverified.

**Runtime candidate:** `serve-mlx` rather than assuming a text-only streamlx export preserves the complete VLM path. Its current docs support Qwen3.6 vision mode, OpenAI-compatible chat completions and function calling for compatible templates. Its Qwen3.6 M4 validation is on 24 GiB; the documented 16 GiB vision settings are a conservative starting profile, not a PACS Mac mini test. Exact 4-bit checkpoint compatibility must be audited.

**One-model policy:** one local model process, concurrency 1, no fan-out, no simultaneous vision model, no MTP/draft and no wired-memory dependency. Use AX/DOM/OCR first; send one bounded screenshot/ROI only when necessary. Load the model for active task batches and unload after a measured idle grace period or when user activity/host pressure requires it. Close only agent-owned resources, never arbitrary user processes.

Candidate order for qualification:
1. Qwen3.6-35B-A3B 4-bit — first multimodal + tool-using model audit.
2. Kimi Linear 48B-A3B 4-bit — text-first fallback if paired with explicit AX/OCR perception; direct CUA screenshots still need an image-capable route.
3. Qwen3.5-122B-A10B TurboQuant 3-bit — stretch target, deferred.

New read-only audit script:
[`g6.3-qwen36-vision-header-audit.py`](scripts/mac/g6.3-qwen36-vision-header-audit.py). It pins the exact MLX 4-bit revision and reads only config/index plus verified HTTP Range Safetensors headers. It does not download tensor payloads.

Full design and next qualification sequence:
[PACS single-model + DSH integration review](reports/pacs-single-model-dsh-integration-review-2026-11-20.md).

No model weights downloaded, no runtime installed, no model started, and no DSH/MCP production configuration changed.


### G6.3 audit run 1 — prefix matcher correction

The first read-only run verified all four shard headers (about 19.0008 GiB serialized tensor payload, not a RAM estimate) but failed MoE key classification because the script expected `language_model.model.layers` while Qwen keys also use `model.language_model.layers`. The script now accepts both naming orders and emits real expert-key samples if classification still fails. The regex was synthetically checked; the remote header audit still needs a rerun before any memory-budget conclusion. No weight payloads were downloaded.


### G6.3 Qwen3.6 expert-layout correction

The pinned 4-bit MLX checkpoint does **not** use per-expert `*.mlp.experts.N.*` keys. It stores routed experts as stacked tensors:
`language_model.model.layers.N.mlp.switch_mlp.{gate_proj,up_proj,down_proj}.{weight,scales,biases}`.
The audit now validates the leading dimension equals 256, accounts all three projections and affine metadata per layer, and reports MTP tensors separately. The second audit run exposed this key-family mismatch; it did not show missing MoE weights. Corrected script is committed, but still needs a Mac mini rerun before any cache/memory calculations are accepted.



### 2026-11-20 — Qwen3.6 G6.3 exact header audit PASS

The Mac mini successfully completed the pinned read-only audit for `mlx-community/Qwen3.6-35B-A3B-4bit@38740b847e4cb78f352aba30aa41c76e08e6eb46`. All four Safetensors headers matched the index exactly; 2,090 tensor keys summed to the declared 20,401,929,952 bytes (19.000778 GiB). No tensor payloads were downloaded.

- Routed stacked experts: **18,119,393,280 bytes / 16.875 GiB** across 40 layers and 360 tensors.
- Non-expert shell: **2,282,536,672 bytes / 2.125778 GiB**.
- Vision: **893,142,496 bytes / 0.831804 GiB** (333 tensors).
- Non-vision shell: **1,389,394,176 bytes / 1.293974 GiB**.
- MTP tensors in this checkpoint: **0**.
- Per-layer expert bundle: **1,769,472 bytes**; all 40 layers match.
- One-token Top-8 expert floor: **566,231,040 bytes / 540 MiB / 0.527344 GiB**.

This is an exact metadata/header accounting PASS, **not** a 16 GiB runtime-memory or DSH integration PASS. Preliminary 2/3/4 GiB cache arithmetic and a config-derived 4K/8K sequence-state estimate are recorded in [the PACS single-model + DSH review](reports/pacs-single-model-dsh-integration-review-2026-11-20.md). On the recorded 51%-free host snapshot, 4 GiB cache is rejected for the first trial; 3 GiB is tight; 2 GiB is the safer initial candidate. Actual runtime/allocator peak, image scratch, expert read-span behavior, cache hit rate and I/O/Metal overlap remain unmeasured.

