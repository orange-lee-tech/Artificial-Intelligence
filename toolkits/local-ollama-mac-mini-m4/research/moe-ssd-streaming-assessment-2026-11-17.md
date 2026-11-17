# 本地 MoE 专家按需加载与 SSD Streaming 可行性评估

**日期：** 2026-11-17  
**设备基线：** Mac mini M4 / 16GB 统一内存 / 1TB 外置 USB SSD / macOS 26.2  
**状态：** RESEARCH COMPLETE / PROTOTYPE NOT STARTED  
**范围：** 只读调研与架构建议；本文件不授权安装运行时、下载大模型或修改生产 DSH 配置。

## 1. 执行结论

1. **方向可行，但不是 Ollama 当前标准模型加载方式。** 已出现 Apple Silicon 上的 MoE 专家权重 SSD 按需读取原型：模型的 trunk/shared/router 与当前专家缓存驻留统一内存，未命中的 routed experts 从 SSD 读取。
2. **不能把“激活参数少”误解为“模型文件小”或“无需内存”。** MoE 每 token 只计算每层路由选中的专家，但全部专家权重仍须可访问；trunk、当前专家、KV cache、视觉塔（如有）仍占统一内存。
3. **当前 qwen3.5:4b 是 dense 4B，不是 MoE 专家模型。** Qwen 官方模型卡将 Qwen3.5-4B 列为 dense architecture；MoE 变体是 35B-A3B、122B-A10B、397B-A17B。
4. **16GB M4 + 外置 USB SSD 的 100–200GB 模型不能直接判定可用。** 已有原型结果证明技术路线值得试，但不同运行时、模型专家稀疏性、SSD 总线、缓存命中率和非专家 trunk 大小都会决定结果。必须先在 16GB 目标机上做小规模 pilot。
5. **Claude Code 2026-03-31 源码泄露属于 Harness/CLI 源码泄露，不是 Claude 模型权重或内部 MoE 路由泄露。** 可借鉴 agent loop、工具权限闸门、子代理、上下文压缩、记忆生命周期、后台任务和远程通知等工程模式，不能据此推断 Claude 模型内部专家机制。

## 2. 当前机器状态与阻塞

- Ollama 0.40.16 已安装；本机 API 曾成功返回版本 JSON。
- 已下载模型：`qwen3.5:4b`，模型 ID 前缀 `7f3251fa6878`，约 4.0GB。
- 已将默认模型目录 `~/.ollama/models` 复制到 `/Volumes/SSD/AI-Workspace/models`，735 个文件逐文件比较通过；原始目录保留。
- launchd 环境显示目标路径，但监听服务进程环境仍显示 `OLLAMA_MODELS=/Users/liyucheng/.ollama/models`。因此 G3 **未通过**，不能认定 Ollama 已切换到外置目录。
- API 监听曾实测为 `127.0.0.1:11434`；`OLLAMA_NO_CLOUD=1` 在服务进程中可见。
- 必须先确认 Ollama GUI parent / server child 的进程树和启动环境，修正实际进程的模型路径，再做后续模型实验。

## 3. MoE 专家路由：概念与限制

MoE 模型在每个 MoE 层通过 router 选择少数专家参与当前 token 的计算。例如 Qwen3.5-122B-A10B 的模型卡说明：总参数 122B、每 token 激活约 10B；包含 256 个专家，每 token 选择 8 个 routed experts 加 1 个 shared expert。Qwen3.5-35B-A3B 则为总参数 35B、激活约 3B。

这减少每 token 的矩阵计算量，但不自动消除总权重存储需求。若推理引擎把所有专家权重常驻统一内存，16GB 机器仍无法容纳大模型。SSD streaming 的关键是：
- router、attention、shared/dense weights 等 trunk 常驻或按运行时策略加载；
- routed expert weights 保存在 SSD；
- 每层只保留有界的专家 cache（例如 LRU）；
- 当前 token 选中专家缺失时，通过异步 `pread` 读取；
- 让 SSD 读取与已命中专家的 GPU 计算重叠；
- 可选地根据下一层 router 预测做 prefetch；
- 严格限制 batch、context、KV cache 和并发数。

这不是“SSD 变成显存”，而是一个受限内存的缓存/分页推理系统。SSD 读取带宽、随机读取放大、cache miss 和模型专家路由分布都会影响 tokens/s。

## 4. 公开原型与证据等级

### 4.1 MLX / Apple Silicon

- `IDAH-BITBOX/serve-mlx`：预发布的 OpenAI-compatible server，明确将 MoE routed experts 从 SSD 流式读入 bounded cache；列出 16GB Mac 的保守启动参数，同时警告 35B 模型的 non-expert shell 可能仍过大。它是实验项目，不是 Ollama 的内建功能。
- `srcterm/streamlx`：报告在 M4 MacBook Air 32GB 上对 117B、34.7GB 量化模型进行 SSD expert streaming，12GiB resident 配置约 4.5 tok/s；这是 32GB 机器结果，不可直接外推到本项目的 16GB M4。
- `Jakevin/moe-offload`：报告在 M4 Pro 64GB 上对 Qwen3.8-Flash-Next 125B MoE 做 MLX SSD streaming；另有 M4 16GB 对 Nemotron 74B-A9B 的 4GB cache 结果约 4.39 tok/s，但不是 125B 模型在 16GB 上的验证。

### 4.2 llama.cpp 原型

- llama.cpp discussion #23324 的 PoC 使用 Metal 专家槽位池、LRU 和 `pread` 按需读取；作者报告 Qwen3-30B-A3B-Q6_K 在 M1 Pro 16GB 上达到 13 tok/s。该数字是作者报告的单机结果；主表中的系统化 cache-size 测量主要来自 M3 Pro 36GB，代码路径仍是 PoC/非通用生产能力。
- llama.cpp 有 CPU MoE / MoE cache 相关能力，但“CPU experts”不等于外置 SSD 按需专家读取。需要核对具体版本、补丁和 Metal kernel 支持，不能仅凭命令行存在 `--cpu-moe` 就认定实现了本项目所需的 SSD streaming。

### 4.3 外置 USB SSD 的性能风险

公开的 Slipstream 测试在 36GB Apple Silicon 设备上报告：118B-A8B Q4 模型使用外置 USB SSD 的 expert paging 约 0.72 tok/s，而使用内部 NVMe 的一种存储布局约 1.95 tok/s。此结果不能直接预测本机速度，但足以说明外置 USB SSD 可能显著成为瓶颈。必须先实测本机 SSD 的顺序吞吐和目标运行时的专家读取行为。

## 5. Claude Code 2026-03 泄露：可借鉴什么

2026-03-31 公开的是 Claude Code npm 包意外包含 source map 后暴露的 CLI/Harness TypeScript 源码；公开报道明确表示没有客户数据或凭据泄露。它不是 Claude 模型权重、训练数据或模型内部 MoE router 的泄露。

对本项目真正可迁移的是 Harness 工程：
- 统一 query/agent loop 管理所有 LLM 请求、streaming、cache、重试和上下文预算；
- 工具通过统一 registry 暴露，每个工具独立定义 schema、权限和执行边界；
- 子代理本身作为受权限控制的工具调用；
- 分层上下文压缩，先压缩/裁剪工具结果，再做会消耗模型调用的完整总结；
- 持久记忆、后台任务、状态日志和通知；
- 明确的失败分类、退避、恢复和取消机制。

本项目已有 A1/D1 local-first router 与 budget guard 骨架，可沿此方向发展；但必须继续补齐未覆盖的 Web Search / Search-Fetch / 第三方收费出口、真实子代理派生测试和生产级预算账本。不能将“本地模型”当作拥有无边界 shell、凭据、文件系统或微信发送权限的理由；工具执行仍由权限 broker 控制。

## 6. 建议目标架构

```
用户 / 微信通知入口
        |
任务接收、持久队列、状态与取消
        |
Harness Orchestrator（Claude Code 可借鉴的工程层）
  - task planner / deterministic classifier
  - typed tool registry + permission broker
  - context / memory / compaction
  - retries / watchdog / notifications
        |
Local-first Task Router（A1/D1 演进）
  |                 |                    |
Qwen 4B 本地快任务   MoE SSD-stream 本地重任务   Cloud fallback
Ollama              experimental server       Budget Guard
  |                 |                    |
本机 loopback API    本机 loopback API        单次/时段/每日硬上限
        |
Usage Ledger + 审计日志 + WeChat 状态/结果通知
```

模型内部的 MoE router 与 Harness 层 task router 是两个不同层次：
- MoE router：每一层、每一个 token 选择专家；
- Harness router：每个任务选择 4B、SSD-stream MoE、工具链或云模型。

建议始终让 Ollama/实验推理服务只监听 loopback。外部微信只访问消息网关，不直接访问模型 API。

## 7. 分阶段实施方案

### G3.1 — 修复 Ollama 实际模型目录（当前阻塞）
1. 只读检查 server PID、PPID、Ollama.app 主进程、launchd job、app settings 和实际打开的模型文件。
2. 查明为何 child process 环境仍是默认路径。
3. 通过受控重启或显式环境启动，使服务进程实际使用外置 SSD。
4. 验收：server process env 为外置路径；API 正常；监听仅 127.0.0.1；`ollama list` 能识别模型；外置目录有数据。
5. 原始内置模型目录先保留，直到通过完整推理回归并经用户确认后才考虑清理。

### G4 — 4B 基线
- 用现有 `qwen3.5:4b` 测试中文文档整理、分类、模板填充、短总结、文件操作规划。
- 记录 tokens/s、首 token 延迟、峰值内存、context、CPU/GPU、温度和任务成功率。
- 它是 dense 4B，不能用于验证 MoE expert paging。

### G5 — 外置 SSD 基准
- 确认 USB negotiated link speed 与 APFS 卷信息。
- 测量大文件顺序读取速度，并用目标 runtime 的 expert-read benchmark 测随机/分层读取。
- 不安装额外依赖前先审查工具来源和权限。

### G6 — 运行时审计与隔离 pilot
优先审查 `mlx-moe-stream/serve-mlx`、`streamlx` 和 llama.cpp SSD paging PoC：
- 许可证、维护状态、依赖、安装脚本、网络行为、文件写入范围；
- 支持的模型架构、量化格式、Metal/MLX kernel；
- 16GB 下 trunk、expert cache、KV cache、scratch 的最低内存；
- 是否有 watchdog / OOM 保护 / 请求串行化。
在独立虚拟环境和独立测试目录中试验，不修改生产 Ollama/DSH 配置。

### G7 — 小型 MoE pilot
先测试 30B–35B 总参数、约 3B active 的 MoE，而不是直接下载 100–200GB 模型。建议优先选择有明确 16GB 启动策略的兼容 checkpoint。若 trunk 在 16GB 下无法安全驻留，停止，不以 swap thrash 强行运行。

### G8 — 放大模型规模
只有 G7 的任务质量、内存稳定性和吞吐量达到用户设定阈值，才测试 70B–125B / 30–100GB 级别模型。397B / 约 200GB 级别作为研究目标，不作为当前承诺。

### G9 — 接入 DSH
- 将 SSD-stream server 作为独立 OpenAI-compatible provider 接入现有 DSH provider seam；
- 先在隔离 profile 验证，不覆盖 desktop production settings；
- A1/D1 local-first route 负责任务级选模，Budget Guard 负责所有云端出口；
- 先完成真实子代理测试与 Web/Search/第三方出口覆盖，再开放 unattended task execution；
- 微信只作为通知/文件交付渠道，所有执行仍由本机权限 broker 管理。

## 8. 决策建议

**批准研究和小型 MoE pilot；暂不批准直接下载 100–200GB 模型。**

理由：
- 技术路线已经有多个真实原型，不是纯理论；
- 16GB M4 + USB 外置盘的组合尚无与本机完全匹配的端到端证据；
- 先用 30B–35B MoE 验证专家缓存、SSD I/O、内存余量和任务质量，成本和风险更低；
- 若小型 pilot 成功，再按模型文件大小和实际吞吐逐级放大。

## 9. 2026-11-17 追加核验：模型保留、进程环境与 Runtime 兼容性

### 9.1 当前 Ollama 父子进程环境证据

用户提供的只读输出：

| 进程 | PID / PPID | `OLLAMA_MODELS` |
|---|---|---|
| `/Applications/Ollama.app/Contents/MacOS/Ollama` | 14156 / 1 | `/Volumes/SSD/AI-Workspace/models` |
| `.../Contents/Resources/ollama serve` | 14157 / 14156 | `/Users/liyucheng/.ollama/models` |

两者均有 `OLLAMA_NO_CLOUD=1`、`OLLAMA_HOST=127.0.0.1:11434`。launchd 列表可见 `com.ollama.ollama` 与 Electron application job；两个 LaunchAgents 目录未发现 Ollama plist。

**结论：** 进程环境不一致已被确认；子进程为什么拿到旧值仍是 UNKNOWN。父进程环境正确不等于服务端实际采用外置模型目录。下一步只读检查：
- `lsof -p 14157` 中打开的模型 blob / manifest 路径；
- Ollama server 日志及启动参数；
- `~/.ollama/server.json`（如存在）和 Ollama.app 相关设置；
- launchd job / login item 实际定义。
在根因确定前，不重复迁移、不重复下载、不删除 `~/.ollama/models`。官方 Ollama macOS FAQ 说明通过 `launchctl setenv` 设置服务环境并重启应用，但本机父子进程实测仍不一致，因此需查明本地启动链，而不是继续重复官方步骤。

### 9.2 保留 4B，不卸载

当前 `qwen3.5:4b` 是 4B dense architecture：官方模型卡列出 FFN，而非 MoE 专家层。它仍有实际价值：
- 轻量、短时、低复杂度任务的本地模型；
- MoE runtime 故障或模型不兼容时的 fallback；
- 对比 MoE 的质量、延迟、内存和任务成功率的 baseline。

在 16GB 统一内存机器上，不应默认同时驻留 4B 与 35B MoE。建议模型文件保留在外置 SSD，但推理采用单一执行槽：任务批次完成后卸载当前模型，再切换到另一个 runtime。只有测得内存余量后才讨论并发。

### 9.3 三层“专家唤醒/路由”必须分开

1. **模型内 Token Router：** 对每个 token，在每个 MoE 层选择 top-k routed experts 和 shared expert。Qwen3.5-35B-A3B 官方模型卡列出 256 experts、8 routed + 1 shared、35B total / 3B activated。
2. **SSD Expert Streaming Runtime：** 把专家权重保存在 SSD；router 选中后从 SSD 读取，放入有界 cache。非专家 trunk、router、attention、shared weights、当前专家和 KV cache 仍占统一内存。SSD 不等于 RAM/VRAM。
3. **PACS Task Router：** 在任务级决定调用 4B、MoE runtime、确定性工具链或云端模型。这一层受 Budget Guard 约束。

因此“稀疏激活”主要是模型架构提供的计算稀疏性；“专家从 SSD 按需读取”是推理 runtime 提供的内存管理；“什么任务用什么模型”才是我们在 A1/D1 上继续开发的任务路由。三者缺一不可。

### 9.4 Runtime 与 checkpoint 兼容性门槛

截至本次公开资料核验：
- `IDAH-BITBOX/serve-mlx` 是 pre-release、本机 loopback、单用户、一次只生成一个请求的 OpenAI-compatible server。README 明确说明专家从 SSD 流式读取，但非专家 shell、当前专家和 KV cache 仍在 Unified Memory。
- 其公开 README 列出的测试 checkpoint 包含 `mlx-community/Qwen3.6-35B-A3B-8bit`、`mlx-community/Qwen3-30B-A3B-4bit` 和 Gemma 4；不能据此直接宣称 `Qwen3.5-35B-A3B` 已通过该项目的端到端验证。
- 另一项目 `ddalcu/mlx-serve` 的模型支持表包含 `qwen3_5_moe`，但“支持 Qwen3.5 MoE 架构”本身不等于具备 SSD expert streaming。必须分开核验 model loader 与 disk paging 两项能力。
- 因此，首个 pilot 应优先选取明确列在 SSD streaming runtime 测试清单中的 checkpoint；若坚持 Qwen3.5-35B-A3B，则先做模型转换、张量命名/shape、router、量化格式与 expert paging 的兼容性审计，不可直接下载后再碰运气。

### 9.5 16GB 资源疏导策略

- 模型全量文件在外置 SSD；只将非专家运行时必需部分、当前激活专家和 KV cache 放入统一内存。
- 初期并发固定为 1；禁止 4B 与 MoE 同时驻留。
- 初始上下文使用保守值（建议从 4K 开始验证，再评估 8K），限制最大输出和单任务批量。
- 专家 cache 容量先使用 runtime 自动/保守默认值，不在未测内存前拍脑袋指定 GB 数。
- 每轮记录 macOS Memory Pressure、swap、runtime RSS/footprint、SSD I/O、cache hit/miss、TTFT、tokens/s 和任务质量。
- 发生持续内存压力、swap 增长或系统 UI 卡顿时自动停止/卸载 MoE runtime；不要靠 swap thrashing 强行维持大模型。

## 10. 参考资料


1. Ollama FAQ — macOS launchctl environment / model storage: https://github.com/ollama/ollama/blob/main/docs/faq.mdx
2. Qwen3.5-4B model card: https://huggingface.co/Qwen/Qwen3.5-4B
3. Qwen3.5 MoE architecture: https://huggingface.co/docs/transformers/en/model_doc/qwen3_5_moe
4. Qwen3.5-122B-A10B model card: https://huggingface.co/Qwen/Qwen3.5-122B-A10B
5. Claude Code leak incident (Axios, 2026-03-31): https://www.axios.com/2026/03/31/anthropic-leaked-source-code-ai
6. Harness architecture analysis (Mint Security, 2026-04-16): https://www.mint.security/blog/anatomy-of-an-agent-harness-claude-code-leak
7. SSD MoE streaming on Apple Silicon (serve-mlx): https://github.com/IDAH-BITBOX/serve-mlx
8. MLX MoE SSD streaming (streamlx): https://github.com/srcterm/streamlx
9. Apple Silicon MoE offload experiments: https://github.com/Jakevin/moe-offload
10. llama.cpp MoE on-demand paging PoC: https://github.com/ggml-org/llama.cpp/discussions/23324
11. Slipstream benchmarks including external USB SSD: https://github.com/Schero94/slipstream
12. Ollama DeepSeek Harness integration docs: https://github.com/ollama/ollama/blob/main/docs/integrations/deepseek-harness.mdx
13. Ollama macOS environment and model-store FAQ: https://github.com/ollama/ollama/blob/main/docs/faq.mdx
14. Qwen3.5-35B-A3B official model card: https://huggingface.co/Qwen/Qwen3.5-35B-A3B
15. Qwen3.5-4B official model card: https://huggingface.co/Qwen/Qwen3.5-4B
16. MLX Serve supported architecture list (Qwen 3.5 MoE architecture support; not proof of SSD paging): https://github.com/ddalcu/mlx-serve/blob/main/docs/models.md
