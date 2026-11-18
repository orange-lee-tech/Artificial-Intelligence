# PACS 本地主力模型三选一评估

**日期：** 2026-11-18  
**状态：** CANDIDATE EVALUATION — NOT INSTALLED  
**目标主机：** Mac mini M4 / 16 GiB Unified Memory / macOS 26.2  
**存储：** TS900 1 TB USB/APFS  
**原则：** 单一主力模型；不默认双模型常驻；质量优先于速度，但拒绝无效计算和不受控内存压力。

> **候选名称说明：** 本文件将本轮用户所称的“GPT”解释为 **OpenAI gpt-oss-120b**。如果该称呼实际指向其他 GPT checkpoint，本文件的第一候选必须替换后重新评估。

## 1. 当前决策

本阶段已经接受：

- 本地只保留一个主力推理模型；
- 全局本地推理并发为 1；
- 不让轻量模型与主力模型同时常驻；
- 第二模型未来如有必要，只能作为按需互斥加载的备用候选；
- DeepSeek Harness 云端模型承担高级参谋长与低频审计职责，不承担日常高频本地推理；
- 模型选择必须先于 PACS 自主工作机制的最终适配。

**当前三候选：**

1. OpenAI **gpt-oss-120b**
2. **Qwen3.6-35B-A3B**
3. **Qwen3.5-122B-A10B**

当前不批准任何一个进入生产部署；先完成候选准入与短期实机对照。

## 2. 选择原则

模型文件大小、总参数和激活参数都不能直接决定是否适合 16 GiB 统一内存。

实际经济性必须计算：

```
系统固定占用
+ 模型 non-expert shell
+ expert cache
+ active experts
+ KV / recurrent state
+ prefill scratch
+ runtime allocator/cache
+ 安全余量
```

并同时考虑：

- 模型能力；
- 实际任务成功率；
- 错误类型和自我纠错；
- 工具调用与结构化输出；
- 24 小时稳定运行；
- Swap / Memory Pressure；
- SSD I/O 等待；
- 长任务的总完成时间；
- 人工返工成本；
- 云端审计介入次数。

**速度不是第一指标。**

但“速度不重要”不等于“计算时间没有价值”。如果一个模型只比另一个模型好一点，却需要数倍计算时间，并且没有产生更多正确成果，那么它同样属于低效率。

## 3. 三候选结构比较

| 项目 | gpt-oss-120b | Qwen3.6-35B-A3B | Qwen3.5-122B-A10B |
|---|---|---|---|
| 总参数 | 117B | 35B | 122B |
| 激活参数 | 5.1B | 3B | 10B |
| 专家 | 128 | 256 | 256 |
| 每 token 路由 | 4 experts | 8 routed + 1 shared | 8 routed + 1 shared |
| 原生上下文 | 128K | 262K，可扩展 | 262K，可扩展 |
| 推理模式 | low / medium / high | thinking | thinking |
| 公开能力重点 | reasoning / coding / tools | agentic coding / tool use | reasoning / knowledge / agent / long context |
| 16GB M4 公开运行证据 | 有 16GB Apple Silicon expert-streaming 软件支持，但缺少本项目目标 M4 16GB 的同等强度实测 | 有 M4 16GB 第三方 streaming / TurboQuant 实测；标准 4-bit 的本机结果仍需单独验证 | **有 base M4 16GB expert-streaming 实测** |
| 当前项目 Runtime 适配证据 | 尚未进入 G6 精确 checkpoint 审计 | streamlx 已验证 qwen3_5_moe 家族 | TurboQuant 有明确 M4 16GB 路径；需独立审查其工程成熟度 |
| 当前结论 | 候选，但准入风险最高 | **最稳妥的质量/资源平衡候选** | **质量上限候选，优先进行高质量验证** |

## 4. 已知外部证据

### 4.1 gpt-oss-120b

OpenAI 将 gpt-oss-120b 定义为 117B 总参数、5.1B 激活参数、128 个专家、每 token 激活 4 个专家，并提供 low / medium / high 三档 reasoning effort。官方评估中，high reasoning 下 GPQA Diamond 为 80.1、MMLU 为 90.0、HLE 为 19.0、SWE-Bench Verified 为 62.4；这些评估使用官方 MXFP4 权重。citeturn640318search1turn640318search2

OpenAI 同时提供 Apple Silicon Metal 参考实现，但官方仓库明确说明该实现不是 production-ready。citeturn296783search4

第三方 TUFF 已支持在 16GB Apple Silicon 上对 GPT-OSS 120B 做 SSD expert streaming，并将其列为 16GB 可运行模型；但该项目的公开测试说明其主要基准机器是 16GB M2 MacBook Air，不能直接替代本机 M4 16GB 验收。citeturn496609search0

**判断：**

gpt-oss-120b 的模型能力和 reasoning 控制值得保留，但当前在本项目上的主要问题不是“模型不够强”，而是：

1. 16GB M4 的精确运行路径证据不足；
2. Apple Metal 官方参考实现本身不是生产级；
3. 需要额外验证 Harmony 格式、工具调用和本地 Agent 接口；
4. 目前没有证据证明它在本机的质量优势足以抵消部署不确定性。

因此暂不排第一。

### 4.2 Qwen3.6-35B-A3B

Qwen 官方模型卡给出 35B 总参数、3B 激活、256 专家、8 routed + 1 shared、40 层，原生 262K 上下文。官方测试中，SWE-bench Verified 73.4、Terminal-Bench 2.0 51.5、Claw-Eval 68.7、MCPMark 37.0、GPQA 86.0、MMLU-Pro 85.2。citeturn167137search0turn617452search0

官方 MLX 4-bit checkpoint 当前约 20.4 GB，architecture 为 `qwen3_5_moe`。citeturn423081search0

streamlx 已明确将 `qwen3_5_moe` / Qwen3.6 列为支持的专家流式家族；其公开 32GB M4 Air 4-bit 测试显示 8 GiB expert budget 时 resident 约 11GB，约 7.2 tok/s，但这不是本机 16GB M4 mini 的结果。citeturn167137search2

TurboQuant-MLX 另有 base M4 16GB mini 的 Qwen3.6 3-bit 实测：8GB cache 时约 9.4GB peak RSS、约 4.5 tok/s，且完整 top-k 路由可做到与其 fully-resident quantized build bit-identical。该量化版本不是标准 4-bit，因此不能直接证明标准 4-bit checkpoint 在本机的内存包络。citeturn847520search1

**判断：**

这是当前最稳健的候选之一：

- 模型能力已经足够强；
- Agent / coding 能力突出；
- 3B active 参数非常适合低资源计算；
- runtime 家族已有明确支持；
- 16GB M4 已有第三方实际运行证据。

缺点是：它的能力上限可能低于 122B 候选，尤其是在复杂长期推理和知识密度任务上。

### 4.3 Qwen3.5-122B-A10B

Qwen 官方模型卡给出 122B 总参数、10B 激活、256 专家、8 routed + 1 shared、48 层，原生 262K 上下文。官方报告中，Qwen3.5-122B-A10B 的 MMLU-Pro 为 86.7、GPQA Diamond 86.6、HLE with CoT 25.3、SWE-bench Verified 72.0、Terminal Bench 2 为 49.4。citeturn470971search0

与 gpt-oss-120b 的公开对照中，Qwen3.5-122B-A10B 在 MMLU-Pro、GPQA Diamond、HLE 和 SWE-bench Verified 等指标上整体更有优势；但两家测试协议并非完全一致，因此只能作为候选排序依据，不能直接视为严格 head-to-head 实验。citeturn470971search0turn640318search2

当前最关键的证据来自 TurboQuant-MLX：

- Qwen3.5-122B-A10B 的 TurboQuant 3-bit checkpoint 约 54.1GB；
- 专家部分约 50.2GB，可流式读取；
- base M4 16GB Mac mini 已有实测；
- 4GB expert cache 时约 9.0GB MLX peak；
- Decode 约 1.1 tok/s；
- expert hit-rate 约 44.6%；
- 该路径的瓶颈主要是 SSD expert I/O；
- 模型在 16GB 上能够实际运行。citeturn423081search1turn483759search1

这里有一个非常重要的区别：

**这不是“把122B模型硬塞进16GB”。**

它是在 16GB 中常驻 non-expert 部分和有限 expert cache，其余专家保留在 SSD，按 token 路由结果读取。

因此，这个模型恰好符合我们的架构目标：牺牲等待时间换取更高的模型能力，同时保持内存边界。

**判断：**

它是目前最值得验证的质量优先候选。

缺点：

- 10B active 参数远高于 Qwen3.6 的3B；
- 每 token SSD I/O 显著增加；
- 约1 tok/s 的公开 M4 mini 结果意味着长思考任务可能需要较长时间；
- TurboQuant 是第三方量化/runtime路径，不应未经本机验证就视为生产级；
- 54GB 权重下载和转换工作本身需要额外时间；
- 需要重新验证我们的 TS900，而不是直接采用内部 SSD 的作者数据。

## 5. 当前暂定排序

在不进行实机质量测试之前，我给出的是**研究优先级**，不是最终批准：

### 第一：Qwen3.5-122B-A10B

**理由：最高质量潜力 + 已证明可以在 M4 16GB 上通过专家流式运行。**

我们的场景不追求交互速度，而且 Mac mini 24小时运行，因此约1 tok/s 并非自动淘汰条件。

真正需要验证的是：

> 它是否能用更长的计算时间，换来足够明显的任务成功率提升。

如果答案是肯定的，它最符合 PACS 的设计目标。

### 第二：Qwen3.6-35B-A3B

**理由：最好的工程风险/能力平衡。**

如果 122B 在实际 PACS 任务中没有明显质量优势，那么 Qwen3.6 会成为最终赢家。

这也是一个非常重要的判据：

**如果122B只比35B好5%，却让任务耗时增加3–5倍，那么我们不应该为了“122B”这个数字支付这笔成本。**

### 第三：gpt-oss-120b

不是因为模型能力弱。

恰恰相反，它的 reasoning / tool-use 能力很强，而且 reasoning effort 可调。

但当前对 PACS 来说，它最大的劣势是**本机部署证据链不如另外两个候选完整**。

如果后续实测证明：

- M4 16GB 稳定；
- Harmony / tool calling 接入顺畅；
- 质量明显优于 Qwen3.6；
- 运行成本和时间可接受；

那么它完全可以重新进入第一名。

## 6. 最终不能靠公开 benchmark 决定

这是本项目最重要的一条。

公开 benchmark 只能决定：

> 哪些模型值得进入本机测试。

不能决定：

> 哪个模型应该成为 PACS 主力。

最终决策必须使用 PACS 自己的任务集。

### PACS 模型测试集

建议建立 15 个固定任务：

**A. 复杂推理 × 4**

- 系统架构分析；
- 多条件技术决策；
- 故障根因分析；
- 反事实方案比较。

**B. Agent / Coding × 4**

- 阅读现有代码；
- 定位 bug；
- 设计最小修复；
- 运行测试后根据失败结果重新修正。

**C. 文档与知识 × 3**

- 长技术文档提取；
- 日志关联分析；
- 中文技术资料总结。

**D. 工具与结构化输出 × 2**

- JSON Schema；
- 工具参数生成与错误恢复。

**E. 自我纠错 × 2**

先给模型一个包含错误假设的任务，再在中途加入反证，观察它是否能够真正改变方案。

## 7. 评分方法

不采用简单的“模型回答看起来不错”。

每项任务记录：

- 是否完成；
- 正确率；
- 关键错误数量；
- 是否需要人工修正；
- 是否成功使用工具；
- 是否产生无效循环；
- 总推理时间；
- 输入 / 输出 token；
- 峰值内存；
- Swap 增量；
- SSD 读取量；
- 是否需要重新执行。

### 最终评分

建议：

| 指标 | 权重 |
|---|---:|
| 任务正确率 / 质量 | 35% |
| 长任务完成率 | 20% |
| 自我纠错能力 | 15% |
| 内存与24小时稳定性 | 15% |
| Agent / 工具可靠性 | 10% |
| 时间效率 | 5% |

速度只有5%，但并不代表忽略时间。

另外单独计算：

```
有效任务产出 / 墙上时间
```

如果一个模型 2 小时完成一个高质量任务，而另一个模型 20 分钟完成一个低质量任务，不能只看 tokens/s。

## 8. 硬性淘汰条件

任何候选出现以下任意情况，直接淘汰，不进入最终评分：

1. 无法稳定加载；
2. 产生持续 Swap；
3. 导致 macOS Memory Pressure 长时间处于严重状态；
4. 运行时无法在安全边界内停止；
5. 长任务中频繁崩溃；
6. 工具调用无法可靠解析；
7. 无法恢复中断任务；
8. 需要修改 PACS / DSH 生产配置才能勉强运行；
9. 需要牺牲安全余量才能运行；
10. 质量优势只来自更长的无效思考，而不是更高的任务成功率。

## 9. 试验顺序

不同时安装三个模型。

### P0 — 纸面准入

完成：

- exact checkpoint；
- quantization；
- runtime；
- expert layout；
- shell size；
- minimum expert cache；
- KV；
- scratch；
- memory envelope。

### P1 — 低风险硬件 Smoke Test

一次只测试一个模型：

- 单请求；
- 单并发；
- 短上下文；
- 无 MTP / draft；
- 无长期 keep-alive；
- 设置 Memory Pressure / Swap 停止条件。

### P2 — PACS 代表性任务

运行 15 项固定任务。

### P3 — 长任务

让候选连续运行：

- 30 min；
- 2 h；
- overnight。

观察：

- 内存；
- Swap；
- SSD；
- 温度；
- 崩溃；
- cache；
- I/O；
- 任务是否产生有效进展。

### P4 — 云端独立审计

只抽取少量关键结果给 DeepSeek Harness 云端参谋长：

- 不要求每项审计；
- 不上传完整原始数据；
- 只提供任务摘要、关键证据和候选结果；
- 用于发现本地模型的系统性偏差。

## 10. 最终决策规则

如果：

**Qwen3.5-122B-A10B**

在 PACS 任务集上相对于 Qwen3.6：

- 正确率提升 ≥ 10 个百分点；
- 关键错误明显减少；
- 内存安全通过；
- overnight 稳定；
- 时间成本虽然更高但没有产生明显无效等待；

则选择 **122B**。

如果质量提升不足 10 个百分点，但 Qwen3.6：

- 稳定性明显更好；
- 任务完成速度显著更快；
- Agent 工具链更可靠；

则选择 **Qwen3.6-35B-A3B**。

gpt-oss-120b 只有在本机硬件准入和实际任务质量均表现出明显优势时重新进入第一名。

## 11. 当前不执行的事项

本文件不授权：

- 下载 50GB+ checkpoint；
- 安装 TurboQuant；
- 安装 streamlx；
- 安装 TUFF；
- 修改 iogpu wired-memory；
- 修改 Ollama；
- 修改 DeepSeek Harness；
- 修改 MCP；
- 修改系统权限。

当前仍然是研究阶段。

## 12. 结论

**我们现在不是在选择“最大的模型”。**

我们在选择：

> **在16GiB统一内存和24小时运行条件下，能够以最低长期资源成本持续产生最高质量有效成果的单一模型。**

因此，当前研究排序是：

**Qwen3.5-122B-A10B → Qwen3.6-35B-A3B → gpt-oss-120b**

但最终选择必须由本机实测的 **质量 × 稳定性 × 时间 × 内存** 四维证据决定。

**当前最值得做的下一步：先完成 Qwen3.5-122B-A10B 的精确运行时与内存准入审计。**

