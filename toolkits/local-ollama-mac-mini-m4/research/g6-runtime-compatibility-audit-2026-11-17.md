# G6 Runtime Compatibility Audit — 2026-11-17

**Status:** G6.1 SOURCE AUDIT COMPLETE / G6 IN PROGRESS  
**Execution mode:** READ-ONLY SOURCE REVIEW  
**Target host:** Mac mini M4, Apple Silicon, 16 GiB unified memory, macOS 26.2  
**Storage:** External TS900 USB/APFS, /Volumes/SSD  
**Project branch:** `pacs/local-model-toolkit-m4-16gb`

## 0. Scope and non-actions

This review inspected public source code, project documentation, repository metadata, dependency declarations, model adapters, memory/cache logic, and the reported benchmark methodology for:

1. `IDAH-BITBOX/serve-mlx`
2. `srcterm/streamlx`
3. The `ggml-org/llama.cpp` MoE disk-paging RFC/PoC and its separate fork PR.

No runtime was installed. No model or checkpoint was downloaded. No model was converted. No Ollama or DeepSeek Harness production configuration was changed. No model files were deleted. No local service was restarted.

Evidence labels used below:

- **SOURCE_VERIFIED** — confirmed in repository source, tests, package metadata, or project documentation.
- **AUTHOR_REPORTED** — benchmark or hardware result published by a project author; not reproduced by this project.
- **INFERRED** — engineering conclusion derived from inspected implementation.
- **HARDWARE_TEST_REQUIRED** — cannot be established without a controlled run on this Mac mini M4.

## 1. Executive conclusion

The three projects implement materially different approaches.

- **streamlx is currently the strongest performance-oriented candidate for a later isolated MLX pilot.** Its reader coalesces expert byte ranges, uses concurrent `pread`/`preadv`, writes expert bytes directly into preallocated MLX pool storage, and supports LRU, next-layer prefetch, and optional multi-token pipeline scheduling. Its upstream repository was updated most recently (main branch commit dated 2026-11-15).
- **serve-mlx is the strongest memory-accounting and safety-policy reference.** It has a byte-budgeted cache, bounded demand-priority I/O loader, explicit shell/KV/scratch/safety reservations, and staged memory-pressure handling that disables prefetch, evicts, shrinks, then rejects. It also contains a `qwen3_5_moe` adapter. However, it is pre-release/pre-alpha, its main branch's latest commit is dated 2026-08-31, and its public tested-checkpoint list does not establish full-checkpoint validation of our exact target.
- **llama.cpp's PoC is the most explicit native Metal event/slot-pool reference.** It uses Metal shared memory, a CPU sidecar, `pread`, slot remapping, and `MTLSharedEvent`. It is an experimental fork/PR, not an upstream llama.cpp feature.

**No project is yet certified for this Mac mini M4 / 16 GiB and no exact 48B–50B checkpoint has been selected or validated.** Source-level support for a model family is not proof that a particular checkpoint, quantization, tensor layout, and memory envelope work.

Recommended disposition for continued G6:
- streamlx — P0 performance-path investigation;
- serve-mlx — P0 memory-safety and correctness reference;
- llama.cpp PoC — P1 native Metal alternative/reference.

This ranking is provisional and does not authorize installation.

## 2. Candidate comparison

| Dimension | streamlx | serve-mlx | llama.cpp MoE paging PoC |
|---|---|---|---|
| Core runtime | MLX / mlx-lm | MLX / mlx-lm | llama.cpp / Metal |
| Expert storage | Safetensors byte ranges | Safetensors byte ranges / manifest | GGUF byte ranges |
| Read path | `pread` and `preadv`, range coalescing | bounded async exact-bundle reads | CPU sidecar `pread` |
| Destination | preallocated MLX expert-pool storage | raw CPU byte buffers, then MLX materialization | Metal shared-memory expert slots |
| Cache | per-layer fixed-slot LRU | global byte-budgeted LRU, pin-safe | compact slot pool with LRU |
| Prefetch / overlap | next-layer prediction, async reads, optional MTP pipeline | bounded async loader and predictive prefetch | GPU event + CPU sidecar synchronization |
| Memory controls | `--budget-gib`, optional `--memory-gib`, `--prefill-memory-gib`, MLX cache cap | shell/KV/scratch/safety budget; staged pressure response | explicit slot count and micro-batch constraints |
| Model evidence | README reports Qwen3.6 and other MLX MoE layouts | Qwen3.5 adapter source; tiny synthetic integration test; README tested examples include Qwen3.6/Qwen3/Gemma | author-reported Qwen3-30B-A3B Q6_K |
| License | MIT | Apache-2.0 | llama.cpp project license in fork; verify exact fork revision before reuse |
| Current maintenance signal | main commit 2026-11-15 | main commit 2026-08-31 | separate fork/PR, not upstream |
| 16 GiB M4 validation | NOT ESTABLISHED | NOT ESTABLISHED for a full target checkpoint | author reports M1 Pro 16GB result; not this host |

## 3. streamlx source findings

### 3.1 Expert read and GPU-visible slot path

**SOURCE_VERIFIED**

Relevant files:
- [README.md](https://github.com/srcterm/streamlx/blob/main/README.md)
- [pool.py](https://github.com/srcterm/streamlx/blob/main/streamlx/pool.py)
- [reader.py](https://github.com/srcterm/streamlx/blob/main/streamlx/reader.py)
- [integrate.py](https://github.com/srcterm/streamlx/blob/main/streamlx/integrate.py)
- [pipeline.py](https://github.com/srcterm/streamlx/blob/main/streamlx/pipeline.py)

Implementation observations:

1. `SafetensorsIndex` parses safetensors headers and calculates contiguous expert row ranges for stacked `switch_mlp` tensors.
2. `ExpertReader` sorts byte-range requests by shard and offset, merges adjacent ranges within a 64 KiB gap, and caps each merged span at 16 MiB.
3. The reader defaults to six worker threads and balances read spans across workers.
4. `read_into` uses `os.preadv` to write bytes directly into writable storage exported by pre-evaluated MLX arrays. The pool code explicitly checks that the MLX array exposes writable, contiguous storage of the expected size.
5. Each MoE layer owns a fixed number of expert slots; an expert ID is mapped to a slot. Cache misses are read into the slot before the relevant compute graph uses it.
6. The decode path supports route lookahead/prefetch. The optional `PipelinedDecoder` can overlap several token streams when a compatible draft/MTP head exists.

This is the closest of the three Python projects to the desired SSD → unified-memory pool → GPU data path.

### 3.2 Important budget-floor caveat

**SOURCE_VERIFIED + INFERRED**

In `load_streaming_model`, the slot count for each MoE layer is computed as:

```python
slots = max(k, int(budget_bytes / len(moe_layers) / expert_bytes_per_layer))
```

where `k` is the routed top-k (or a default derived from the model configuration). Thus every layer retains at least the number of expert slots needed by one routed step.

The actual pool footprint is:

```python
sum(pool.n_slots * pool.expert_bytes for pool in pools.values())
```

Therefore `--budget-gib` is not necessarily a hard upper bound when the minimum top-k slot floor across all layers is larger than the requested budget.

For a target checkpoint, calculate this lower bound before choosing a cache budget:

[
M_{pool,min} = sum_{l=1}^{L} k_l 	imes S_l
]

where (S_l) is the stored byte size of one expert bundle in layer (l). Do not assume all layers have equal expert tensor sizes.

### 3.3 Memory governor and 16 GiB limitations

**SOURCE_VERIFIED**

The server exposes:
- `--budget-gib` (default 8 GiB);
- `--memory-gib` (optional; adjusts expert pools based on MLX memory peaks and prior request/cache growth);
- `--prefill-memory-gib` (caps MLX freed-buffer cache and queued prefill reads);
- `--mlx-cache-gib` (default 2 GiB);
- `--prompt-cache-gib` or an SSD-backed prompt-cache directory.

The memory governor resizes expert pools before requests and between prefill chunks. However:

- `--memory-gib` is optional, not automatically enforced unless supplied.
- The inspected wrapper's governor relies on MLX active/peak memory and request/cache growth; it does not provide a complete macOS Memory Pressure / Swap watchdog.
- The model shell is loaded before request-time pool resizing can protect inference. A shell that cannot fit is still a startup failure.
- The configured pool budget must be checked against the actual minimum top-k slot floor.
- The optional MTP/draft pipeline is not appropriate for the first 16 GiB experiment. The README reports roughly 2.5–3 GiB additional peak memory for three streams; this is author-reported and must be treated as a separate later experiment.

The README's M4 performance table is from an M4 MacBook Air with 32 GB, not our 16 GiB Mac mini. It is not a direct predictor for this host.

### 3.4 GPU keepalive side effect

**SOURCE_VERIFIED**

In `streamlx/pool.py`, `STREAMLX_KEEPALIVE` defaults to enabled. While waiting for SSD reads, the runtime can submit tiny GPU kernels; a separate GPU-hold mechanism may also run matrix-multiplication work to keep the Apple GPU performance state elevated. The environment variable `STREAMLX_KEEPALIVE=0` disables these mechanisms.

This is a performance policy, not free overlap. It can add GPU activity, power draw, and thermal load. For the first correctness and memory-safety pilot, keep it disabled; only run a controlled enabled/disabled A/B test after the baseline is stable. Do not assume the keepalive improves end-to-end throughput on this Mac mini without measurement.

### 3.5 Read-cache caveat

The reader sets `F_NOCACHE` and `F_RDAHEAD` when opening files, but catches and ignores errors from those fcntl calls. Its source comment also notes that on macOS 26.3 the page cache may still be populated despite the stated `F_NOCACHE` intent. Our host is macOS 26.2, so actual cache behavior must be measured on-device. Do not equate the flag being requested with proof that every read reaches the physical SSD.

### 3.6 Maintenance, license, dependencies

**SOURCE_VERIFIED**

- License: MIT.
- Python requirement: >=3.10.
- Declared dependencies: `mlx-lm>=0.31`, `numpy`.
- Main branch commit: `9ab2cca54c3e2e5397718c0a5997b22537c7a454`, dated 2026-11-15.
- The repository includes manual validation, generation, serving, and sweep examples. The inspected tree has no dedicated `tests/` directory or CI workflow.
- The local server wraps `mlx_lm.server`; it is intended for sequential, batch-1 requests. Explicitly bind to loopback when later tested.
- `trust_remote_code` is opt-in. The serving example requires a local model directory, avoiding an implicit model download in the serving path.

The manual `examples/validate.py` correctness gate compares logits and greedy output token-for-token against a full-resident reference for a model that fits in RAM; it also describes pool-size invariance as a check for models too large for a full-resident reference.

## 4. serve-mlx source findings

### 4.1 Memory accounting and pressure response

**SOURCE_VERIFIED**

Relevant files:
- [README.md](https://github.com/IDAH-BITBOX/serve-mlx/blob/main/README.md)
- [memory.py](https://github.com/IDAH-BITBOX/serve-mlx/blob/main/src/mlx_moe_stream/memory.py)
- [runtime.py](https://github.com/IDAH-BITBOX/serve-mlx/blob/main/src/mlx_moe_stream/runtime.py)
- [async_loader.py](https://github.com/IDAH-BITBOX/serve-mlx/blob/main/src/mlx_moe_stream/prefetch/async_loader.py)
- [qwen3_5_moe.py](https://github.com/IDAH-BITBOX/serve-mlx/blob/main/src/mlx_moe_stream/models/qwen3_5_moe.py)

The memory budget calculation is based on:

[
M_{expert} leq M_{working-set} - M_{safety} - M_{shell} - M_{KV} - M_{scratch}
]

The implementation reads MLX device information, active/cache/peak memory, process RSS, and macOS swap usage for snapshots. It does not count swap as usable model capacity.

When active MLX memory exceeds the safe working set, the pressure manager applies staged actions at layer-safe points:

1. disable future prefetch;
2. evict unpinned resident experts;
3. shrink the resident cache;
4. reject further work if pressure persists.

The async loader uses a bounded worker pool, demand-priority requests, exact bundle reads, and coalescing of duplicate demand/prefetch requests. Raw CPU byte buffers are returned to the model thread for MLX materialization.

This is a useful reference design for PACS memory protection and request admission.

### 4.2 Qwen3.5 architecture support boundary

**SOURCE_VERIFIED**

- `SUPPORTED_MODEL_TYPES` includes `qwen3_5_moe`.
- `Qwen35MoeAdapter` probes that model type and imports the corresponding `mlx_lm.models.qwen3_5_moe` implementation.
- Text mode selects the `language_model.` tensor subtree; vision mode uses a separate adapter path.
- The integration test builds a tiny synthetic `qwen3_5_moe` checkpoint with one layer and two experts and checks output closeness against the upstream tiny model.

This proves source-level architecture plumbing and a small synthetic integration test. It does **not** prove that a full production Qwen3.5-35B-A3B checkpoint, a particular quantization, or the desired 48B–50B model loads and streams correctly.

The README's listed end-to-end tested checkpoints include Qwen3.6-35B-A3B-8bit, Qwen3-30B-A3B-4bit, and Gemma 4. The exact checkpoint targeted by PACS must still be audited separately.

### 4.3 Maintenance, license, dependencies

**SOURCE_VERIFIED**

- License: Apache-2.0.
- Package version in `pyproject.toml`: `0.1.0a7`.
- Development status classifier: Pre-Alpha.
- Declared dependencies include `mlx>=0.32`, `mlx-lm>=0.31`, `numpy`, `safetensors`, and `jsonschema`; VLM support is optional.
- Main branch commit: `d7021c9d6e66afbcf013b6a1b87431236b2d08f9`, dated 2026-08-31.
- The repository has unit and integration tests, including a tiny synthetic Qwen3.5-MoE adapter test.
- README reports end-to-end testing on an M4 MacBook Pro with 24 GB unified memory. That is not a 16 GiB Mac mini validation.

The source contains an M4 Mac mini 16 GB memory-margin note: reducing the safety margin from 4 GiB to 1 GiB reportedly increased cache hit rate but reduced decode throughput from 2.65 to 2.43 tok/s due to memory-compressor pressure. This is **AUTHOR_REPORTED** source commentary, not a measurement by PACS. It reinforces that maximizing cache occupancy can reduce total throughput.

## 5. llama.cpp disk-paging PoC findings

**SOURCE_VERIFIED + AUTHOR_REPORTED**

References:
- [Upstream discussion #23324](https://github.com/ggml-org/llama.cpp/discussions/23324)
- [Separate fork PR #2](https://github.com/kisasexypantera94/llama.cpp/pull/2)

The PoC's data path:

1. A Metal interceptor kernel writes selected expert IDs to a Metal shared-memory request structure.
2. A CPU sidecar observes the request sequence.
3. The sidecar resolves expert-to-slot mappings with LRU.
4. Missing expert bytes are loaded from GGUF using `pread`.
5. Remapped slot IDs are written to shared memory.
6. An `MTLSharedEvent` signals the GPU to continue the existing gather/matmul path.

The author reports Qwen3-30B-A3B-Q6_K at about 13 tok/s on an M1 Pro 16 GB. The slot-count table is primarily measured on M3 Pro 36 GB. These results are not transferable to the M4/TS900 host without reproduction.

The feature is in a separate fork/PR, not established as an upstream llama.cpp capability. It is therefore a native Metal architecture reference, not the default deployment candidate.

## 6. Mapping to our measured TS900 storage path

PACS host benchmark (user-provided, 2026-11-17):

| Metric | Result |
|---|---:|
| Non-zero random-source ceiling | 633.4 MiB/s |
| 24 GiB sequential write + sync | 408.9 MiB/s |
| 24 GiB F_NOCACHE sequential read | 834.7 MiB/s |
| 4 KiB QD1 random read | 5,492.1 IOPS; P95 0.288 ms |
| 64 KiB QD1 random read | 2,983.6 IOPS; P95 0.451 ms |
| Allocated fraction | 1.0003 |
| Cleanup | PASS |

Interpretation for runtime testing:

- streamlx's coalesced reads (up to 16 MiB) make sequential throughput and large-span concurrent read tests more relevant than the QD1 4 KiB IOPS alone.
- The existing TS900 test is a storage baseline, not a runtime-level expert paging benchmark.
- G6/G7 must measure actual bytes read per expert, average/percentile span sizes, read concurrency, cache hit rate, prefetch usefulness, I/O wait time, and compute/I/O overlap.
- A future benchmark should compare cold cache, warm cache, prefetch disabled/enabled, and several strictly bounded expert budgets.

## 7. PACS-specific compatibility gates

No runtime should be called compatible until all relevant checks pass for the exact checkpoint and quantization.

### G6.2 — Exact checkpoint and tensor-layout audit

- Record exact model repository, immutable revision, config, model type, layer count, routed top-k, expert count, and quantization metadata.
- Confirm whether experts use the stacked `switch_mlp` layout expected by streamlx or a different safetensors naming/layout.
- Confirm all expert tensors and quantization metadata are included in each exact byte-range bundle.
- Confirm non-expert shell loading does not materialize routed expert banks.
- Confirm the model's tokenizer/template and multimodal boundaries.
- Do not infer compatibility from a similar model name or shared architecture label.

### G6.3 — 16 GiB memory-envelope audit

For the exact checkpoint, calculate and then measure:

[
M_{total} =
M_{OS/headroom} + M_{shell} + M_{expert-pool} +
M_{active-experts} + M_{KV} + M_{scratch} + M_{runtime}
]

For streamlx, separately calculate the per-layer top-k slot floor. For serve-mlx, verify that the cache's minimum bundle size and active execution buffers fit the remaining budget.

The first controlled pilot must use:
- one model process;
- one request at a time;
- no simultaneous Ollama 4B residency;
- no MTP/draft pipeline;
- short context and bounded output;
- conservative expert cache;
- external monitoring of macOS Memory Pressure, swap growth, MLX active/peak memory, process footprint, and temperature;
- a stop condition before sustained memory pressure or swap thrashing.

A cache budget is not a complete system-memory budget.

### G6.4 — Runtime-level I/O and overlap audit

Measure on the TS900:
- exact expert read bytes and read-span distribution;
- sequential/coalesced read throughput under the runtime's worker count;
- random and mixed reads under realistic request patterns;
- prefetch submitted/used/wasted bytes;
- time waiting for expert reads;
- GPU compute time during the same interval;
- effective overlap and end-to-end tokens/s.

The 834.7 MiB/s storage baseline is an input to this analysis, not a tokens/s prediction.

## 7A. G6.2 — Exact checkpoint candidate audit (read-only, 2026-11-17)

### Primary candidate: Kimi-Linear-48B-A3B-Instruct, MLX 4-bit

**Candidate status: STRONG SOURCE-LEVEL MATCH / NOT HARDWARE-VALIDATED**

Exact MLX checkpoint:
- Repository: `mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit`
- Current main revision inspected: `919175d75427f1c10cfc17e7254b53295edddf72`
- Model card: https://huggingface.co/mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit
- Revision-specific config: https://huggingface.co/mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit/blob/919175d75427f1c10cfc17e7254b53295edddf72/config.json
- Revision-specific model index: https://huggingface.co/mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit/blob/919175d75427f1c10cfc17e7254b53295edddf72/model.safetensors.index.json

**SOURCE_VERIFIED from model card/config/index and streamlx README:**

| Field | Value |
|---|---|
| Total parameters | 49B |
| Active parameters | 3B |
| MLX checkpoint size | 27.6 GB (model card display) |
| Format | Safetensors, MLX |
| Model type | `kimi_linear` |
| Architecture | `KimiLinearForCausalLM` |
| Decoder layers | 27 |
| Dense prefix | first layer is dense (`first_k_dense_replace: 1`) |
| MoE layers | 26 (derived from layer count + dense prefix + `moe_layer_freq: 1`) |
| Routed experts / MoE layer | 256 |
| Routed top-k | 8 (`num_experts_per_token: 8`) |
| Shared experts | 1 |
| Expert intermediate size | 1024 |
| Hidden size | 2304 |
| Attention layout | 20 KDA linear-attention layers + 7 MLA full-attention layers |
| Context metadata | 1,048,576 maximum; not a promise that such a context fits on 16 GiB |
| Quantization | affine 4-bit, group size 64 |
| Router gate override | per-layer `model.layers.N.mlp.gate` is 8-bit |
| License | MIT on MLX checkpoint card |
| Custom code | model card is tagged `custom_code`; config contains `auto_map` entries |

The model index/commit shows six safetensors shards and expert tensor keys in the stacked layout, including `model.layers.N.mlp.switch_mlp.{gate_proj,up_proj,down_proj}.{weight,scales,biases}`. This is a direct structural match for streamlx's documented `switch_mlp` byte-range streaming path.

**Runtime match (corrected 2026-11-18):** the inspected streamlx commit README/model table does not explicitly list Kimi as an end-to-end validated checkpoint. MLX-LM v0.32.1 implements `KimiSparseMoE.switch_mlp`, matching streamlx's generic stacked-expert wrapper. This is source-level structural compatibility, not explicit Kimi validation or proof of a 16 GiB hardware run.

### Important implementation detail: top-k config key spelling

The Kimi config uses `num_experts_per_token`. streamlx's inspected `_routed_topk()` helper reads `num_experts_per_tok` and otherwise falls back to 8. The present Kimi checkpoint's top-k is also 8, so the fallback happens to match. For a controlled load, pass `k=8` explicitly through the Python API or add a verified compatibility check before serving. Do not assume the fallback is universally correct for other Kimi variants.

### Estimated minimum expert-pool floor — not exact

Using the config's 26 MoE layers, top-8, hidden 2304, expert intermediate 1024, three SwiGLU projections (gate/up/down), 4-bit packed weights, and affine scale/bias arrays at group size 64 gives a first-order estimate:

```
parameters per expert ≈ 3 × 2304 × 1024 = 7,077,888
packed 4-bit weights ≈ 3,538,944 bytes
FP16 scale + bias estimate ≈ 442,368 bytes
estimated expert bundle ≈ 3,981,312 bytes
minimum slots = 26 × 8 = 208
estimated minimum pool ≈ 828,112,896 bytes ≈ 0.77 GiB
```

**INFERRED / NOT YET INDEX-VERIFIED:** this is a shape-based estimate, not a measurement from parsing all tensor shapes and byte offsets in the exact pinned safetensors index. The final G6.2 gate must calculate each layer's actual expert bundle bytes from the pinned index and verify whether any nonuniform layer shapes, quantization exceptions, padding, or additional expert tensors change the floor.

The pool floor being below 1 GiB is promising. It does **not** prove 16 GiB feasibility: the non-expert trunk, embeddings, router/attention weights, MLX runtime, active compute buffers, recurrent/KDA state, MLA KV state, prompt cache, OS headroom and memory safety reserve still have to fit.

### Kimi architecture implication

The model combines 20 KDA linear-attention layers and 7 MLA full-attention layers. This is potentially favorable for long-context cache growth compared with a conventional all-full-attention model, but it is not zero-cache. The actual MLX cache implementation and per-token cache growth must be measured. The configured one-million-token maximum context is not a usable 16 GiB target without a separate cache/memory proof.

### Secondary comparison candidates

1. **Qwen3.6-35B-A3B, MLX 4-bit** — streamlx's README reports a 22.1 GB checkpoint and publishes M4 MacBook Air 32 GB tests at several expert budgets. serve-mlx also lists Qwen3.6-35B-A3B-8bit among its tested checkpoints on an M4 MacBook Pro 24 GB. Useful as a less ambitious architecture/runtime control, not the primary 48B target. Author hardware results are not transferable to our 16 GiB Mac mini.
2. **Gemma 4 26B-A4B, MLX 8-bit** — serve-mlx lists this among its tested checkpoints and contains a Gemma4 adapter/test. Useful as an independent architecture comparison, but it does not meet the 48B–50B total-parameter objective.
3. **Laguna-S-2.1 117B, oQ2e-fast** — streamlx README reports SSD-streaming measurements on an M4 MacBook Air 32 GB. This is an oversized stress-test candidate, not the first 16 GiB target. Its top-10-of-256 routing creates a substantially larger per-layer minimum expert-slot floor than Kimi top-8, and the published results used a faster SSD and 32 GB host.

### G6.2 decision

- **Primary candidate for exact metadata and later isolated pilot planning:** `mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit`.
- **Control/fallback candidate:** Qwen3.6-35B-A3B 4-bit.
- **Architecture comparison candidate:** Gemma 4 26B-A4B 8-bit.
- **Large-model stress candidate only:** Laguna-S-2.1 117B oQ2e-fast.

**G6.2 remains PARTIAL.** Architecture family, quantization metadata, model card size, shard count, expert key naming and streamlx family support are confirmed from public sources. Exact per-layer expert bundle byte totals, full shell byte count, checkpoint immutable revision pinning against all shard files, and 16 GiB runtime memory fit are not yet established. No checkpoint was downloaded.

## 7B. Expanded model selection — 8–10B active target (2026-11-17)

User direction: prioritize model capability; preserve the installed Qwen3.5-4B as a benchmark/control; focus on modern 8–10B active MoE models; do not generate another ChatGPT Project context file.

### Primary candidate: Qwen3.5-122B-A10B

Official model card: https://huggingface.co/Qwen/Qwen3.5-122B-A10B  
MLX 4-bit conversion: https://huggingface.co/mlx-community/Qwen3.5-122B-A10B-4bit  
Alternative 16GB-oriented TurboQuant build: https://huggingface.co/manjunathshiva/Qwen3.5-122B-A10B-tq3a-tqTe-g64

**SOURCE_VERIFIED (official Qwen card):**
- 122B total / 10B active parameters.
- 48 decoder layers; 256 routed experts; 8 routed + 1 shared expert per token.
- hidden size 3072; expert intermediate size 1024.
- hybrid backbone: 12 groups of (3 Gated DeltaNet → MoE + 1 Gated Attention → MoE), hence 48 MoE blocks.
- native context 262,144; extended context metadata is not a 16GB operating target.
- Apache-2.0 upstream license.
- official model-card scores versus Qwen3.5-35B-A3B: MMLU-Pro 86.7 vs 85.3; SuperGPQA 67.1 vs 63.4; HLE-CoT 25.3 vs 22.4; GPQA Diamond 86.6 vs 84.2; Terminal-Bench 2 49.4 vs 40.5; BFCL-V4 72.2 vs 67.3; SWE-bench Verified 72.0 vs 69.2. These are publisher-reported results and should guide, not replace, our own task evaluation.

### Model format and runtime paths must not be conflated

**Path A — standard MLX 4-bit + streamlx**
- MLX community checkpoint currently lists 69.6 GB and 14 Safetensors shards.
- streamlx explicitly validates `qwen3_5_moe` and remaps MLX-VLM text-only exports; MLX-LM's Qwen3.5 MoE sanitizer creates the stacked `switch_mlp` expert layout streamlx expects.
- This is a strong source-level architecture match, but the exact 122B checkpoint has not been executed through streamlx on this 16GB Mac mini. No 16GB streamlx performance or memory result is claimed.
- Provisional 4-bit expert slot floor: 48 MoE layers × top-8 = 384 simultaneous slots. With 3 matrices/expert (3072×1024 each), 4-bit weights plus estimated group-64 FP16 scales/biases gives about 5.06 MiB/expert and approximately 1.90 GiB for the minimum 384 slots. This is shape-derived, not exact index parsing. It is a lower bound, not a recommended cache size.

**Path B — TurboQuant-MLX custom low-bit format + its own streaming runtime**
- Project documentation reports a Qwen3.5-122B-A10B `tq3a-tqTe-g64` build at 30.9 GB: 3-bit attention and ternary (about 1.58-bit) experts.
- The runtime's published base 16GB M4 Mac mini result is about 2.1 tokens/s, 82% expert-cache hit rate, and 11.3 GB peak at an 8 GB cache budget. This is third-party author-reported hardware data, not a PACS test.
- The same project reports about 0.6–1.1 tokens/s at a 1–4 GB cache in an earlier measurement; its latest guide lists 8 GB as the 16GB-mini operating point.
- This is not the standard affine 4-bit MLX checkpoint and must not be assumed compatible with streamlx. It is a separate runtime/quantization path.
- Streaming itself can be bit-identical to the corresponding quantized resident checkpoint; that does not imply the custom quantization has identical quality to the original BF16/4-bit checkpoint.
- At ~2.1 tok/s, 1,000 generated tokens take roughly 8 minutes. This may be acceptable for deliberate long reasoning, but is not a good default interactive/agent throughput target.
- The published 11.3 GB peak leaves limited room for macOS and DSH concurrency. The PACS baseline has not yet verified DSH + large-model co-residency. Keep one execution slot and do not run the 4B runner concurrently.

### Secondary modern candidate: Mistral Small 4 (119B / 6.5B active)

Official announcement: https://mistral.ai/news/mistral-small-4/  
MLX 4-bit checkpoint: https://huggingface.co/mlx-community/Mistral-Small-4-119B-2603-4bit

- Official architecture: 119B total, 6B active in MoE (about 8B including embeddings/output), 128 experts, top-4; 256K context.
- Apache-2.0. Unifies general instruction, reasoning, coding/agentic and image input capabilities.
- MLX 4-bit conversion is listed at 67.8 GB.
- A community conversion note says `mistral4` requires a custom MLX implementation and recommends 64GB+ unified memory. No verified 16GB expert-streaming result was found.
- It is a credible quality/architecture comparison candidate, but it is below the requested 8–10B active band and has no confirmed streamlx adapter. Keep as P2 research, not the first pilot.

### Kimi family clarification

Moonshot's public model listing contains Kimi Linear 48B-A3B (base/instruct), Kimi-VL-A3B 16B, Kimi-Dev-72B, Kimi K2 (about 1T total), and Kimi K3 (about 2.8T total). No current Moonshot-published ~70B-total / 8–10B-active Kimi Linear sibling was found.
- Kimi-Dev-72B is based on Qwen2.5-72B and its config is dense `Qwen2ForCausalLM`; it activates the full dense model and is an older June 2025 coding-specific model, not a modern sparse MoE match.
- Kimi K2/K3 are far above the desired active-parameter budget.
- Thus, do not select a Kimi-branded model solely to stay within the Kimi family.

### Resource and deployment interpretation

- 10B active parameters are not 10 GB of memory. Resident shell, active expert slots, cache, attention/recurrent state, KV, prefill scratch, MLX/Metal allocations and OS headroom determine feasibility.
- TS900 PACS benchmark: non-zero sequential uncached read about 834.7 MiB/s. Runtime per-token expert bytes and cache-hit rate, not the generic SSD benchmark, will determine decode throughput.
- The TurboQuant 2.1 tok/s / 11.3 GB report is useful as an external reference point, not a guaranteed PACS result. Re-run with the actual TS900 and macOS 26.2.
- The standard 4-bit MLX checkpoint's 69.6 GB disk size is within the external SSD capacity, but disk capacity does not establish runtime memory fit.

### Existing 4B baseline and F117 node

- Keep `qwen3.5:4b` installed as the current local baseline, control and recovery model. There is no technical reason to replace it with a separate 3B model. For large-model trials, unload/stop its runner; do not delete its model files.
- Uploaded F117 hardware record: Intel i7-7700HQ (4C/8T), 32GB DDR4-2400, NVIDIA GTX 1050 Ti 4GB, Intel HD 630, TS900 1TB. This is a separate, older Windows/NVIDIA node, not extra unified memory for the Mac. Direct Ethernet can improve RPC transport but cannot pool the two machines' RAM or GPU memory. MLX/Metal runtimes cannot be assumed portable to this host.

### Updated selection decision

1. **P0 primary research target:** Qwen3.5-122B-A10B (10B active), because it best matches the requested model capability/active-parameter target and has a modern hybrid MoE architecture.
2. **P0 runtime path comparison:** standard MLX 4-bit + streamlx versus TurboQuant-MLX `tq3a-tqTe-g64`. Keep these as separate paths; do not mix quantization/runtime assumptions.
3. **P1 comparison candidate:** Mistral Small 4 119B-A6.5B; retain it for quality/adapter audit. It is not eliminated; its mistral4 streamlx path is not yet validated.
4. **Kimi Linear 48B-A3B:** promote to P0/P1 next local MoE pilot because its 3B-active footprint and explicit streamlx family support make it the lower-risk 16GB experiment; keep Qwen3.5-4B installed as fallback/control.
5. **Qwen3.5-397B-A17B:** above the current 8–10B active target; defer.

**No model was downloaded. No runtime was installed. No local or production configuration was changed.**

## 7C. Corrected comparative decision and routing semantics (2026-11-17)

### Qwen3.5-122B-A10B vs Mistral Small 4: correction

Mistral Small 4 is **not eliminated**. The earlier P2 label overstated the case: Qwen is the P0 target because it exactly matches the user's 8–10B active-parameter preference and has a clearer existing streamlx/Qwen3.5 adapter path, not because a fair head-to-head evaluation proved it universally better.

Verified architecture:
- Qwen3.5-122B-A10B: 122B total / 10B active; 48 layers; 256 routed experts; top-8 + one shared expert; hidden 3072; expert intermediate 1024; 4-bit MLX checkpoint listed at 69.6 GB.
- Mistral Small 4: 119B total / 6.5B active; 36 layers; 128 routed experts; top-4 + one shared expert; hidden 4096; expert intermediate 2048; 4-bit MLX checkpoint listed at 67.8 GB; Apache-2.0.
- Both are recent multimodal text/image models with 256K context and Apache-2.0 weights.
- Mistral unifies instruction, reasoning, coding/agent and image input; its API exposes configurable reasoning effort. Its official announcement reports improvements against Mistral Small 3 and strong scores against GPT-OSS-120B on selected tasks. These are vendor-reported results, not a same-harness Qwen-vs-Mistral comparison.
- Qwen's official model card reports MMLU-Pro 86.7, SuperGPQA 67.1, GPQA Diamond 86.6, HLE-CoT 25.3 and SWE-bench Verified 72.0. Those are also publisher-reported. Available public results do not establish a universal winner between Qwen 122B and Mistral Small 4.

Expert compute shape sanity check (derived, not a benchmark): assuming three SwiGLU expert matrices per routed expert:
- Qwen: 48 × 8 × 3 × 3072 × 1024 = 3.624B routed-expert parameters touched per token across all MoE layers.
- Mistral: 36 × 4 × 3 × 4096 × 2048 = 3.624B.
Thus Mistral's top-4 does not imply half the routed-expert matrix work: its expert intermediate width is twice Qwen's. At 4-bit group-64 with estimated scale/bias overhead, both have a shape-derived minimum expert-slot floor around 1.9 GiB. Exact index parsing, layer-specific tensors, shared experts, shell and runtime buffers remain necessary.

Runtime status:
- streamlx's inspected README identifies generic stacked `switch_mlp` MoE support and shows Qwen3.6 as a tested example. It does not explicitly list Kimi Linear as an end-to-end validated checkpoint; no explicit `mistral4` adapter is listed.
- Mistral's MLX conversion exists (67.8 GB) and uses model_type mistral4, 36 layers, 128 experts and top-4. The existence of an MLX conversion is not proof that its tensor naming, expert bundle layout, quantization metadata and loader path are compatible with streamlx.
- Therefore Mistral should be **P1 architecture/quality and adapter-audit candidate**, not P2/eliminated. If adapter work passes, it may be a better resource/performance choice for workloads that value lower total active parameters and configurable reasoning. It is not yet the first 16GB pilot because the runtime path is less verified.
- Qwen remains **P0 8–10B capability target**, with standard MLX+streamlx and separate TurboQuant paths kept distinct.

### Kimi Linear 48B-A3B vs existing Qwen3.5-4B

The installed qwen3.5:4b is a dense 4B model: essentially all 4B parameters participate in each token's forward pass. It is not a 4B-active MoE.
Kimi Linear 48B-A3B is a sparse MoE: 48B total / 3B active, 27 layers (first dense, 26 MoE), 256 routed experts, top-8 + one shared expert, 20 KDA linear-attention layers + 7 MLA layers. Its inspected MLX 4-bit checkpoint is 27.6 GB. MLX-LM v0.32.1 exposes the stacked `KimiSparseMoE.switch_mlp` structure expected by streamlx's generic path; this is a structural match, not an explicit upstream Kimi end-to-end validation.

For a shape-only routed-expert calculation, Kimi has 26 × 8 × 3 × 2304 × 1024 = 1.472B routed-expert parameters selected across all MoE layers per token. Estimated 4-bit group-64 minimum slot floor from the inspected project report is about 0.77 GiB. This is lower than the rough Qwen/Mistral 1.9 GiB floors, but is not the whole model memory budget and does not establish a measured speed.

Decision:
- Kimi is a **credible next primary local MoE pilot** and a plausible capability upgrade over the dense 4B baseline, but it is not a physically small model: its 4-bit checkpoint is 27.6 GB and requires expert streaming on 16GB.
- Do not delete the existing Qwen3.5-4B before Kimi has passed exact checkpoint parsing, short-context single-request correctness, memory/swap safety, latency/throughput and DSH coexistence tests.
- Keep the 4B weights installed as the fast fallback, control and regression baseline. Stop/unload its runner before a Kimi test; the two model runners must not be resident together in the initial 16GB test.
- Kimi's MLX/streamlx server is a different runtime path from the existing Ollama Qwen3.5-4B. This is not a direct Ollama model swap. PACS would call the Kimi OpenAI-compatible endpoint once isolated serving is approved and verified.

### Top-k routing: what "full load" means

The current checkpoints use fixed top-k routing:
- Kimi: every token selects 8 routed experts from 256 in each of its 26 MoE layers, plus the shared expert.
- Qwen 122B: every token selects 8 routed experts from 256 in each of 48 MoE layers, plus the shared expert.
- Mistral Small 4: every token selects 4 routed experts from 128 in each of 36 MoE layers, plus the shared expert.

The model router chooses *which* experts based on token hidden states; it does not normally choose to activate only 2–3 experts for an "easy" request. With these checkpoints, the configured top-k is selected for each token. The selected experts are not all 256; it is 8/256 (3.125%) or 4/128 (3.125%) per layer and token. Shared expert execution is additional. Runtime scheduling may serialize or overlap kernels; "selected" does not guarantee simultaneous physical execution.

Manually reducing Kimi's top-k to 2–3 would be a non-reference inference modification. It may reduce expert compute and SSD reads, but can change model quality, instruction following, reasoning and tool-call reliability. Do not enable it by default. If explored later, compare K=2/4/6/8 on a fixed task suite against the unmodified K=8 output and quality baseline.

PACS task-level routing is separate: it can choose the dense 4B model for easy/fast tasks and Kimi for difficult tasks. This preserves each model's trained internal top-k. If only Kimi is retained eventually, simple requests still use its top-8 routing unless a validated variable-top-k implementation is developed.

### "Probability of full load" cannot yet be stated numerically

No PACS workload trace or expert-routing trace exists, so a numeric probability would be fabricated. Separate:
1. Per-token routing: top-k is fixed as above; not probabilistic whether all top-k slots are selected.
2. Per-layer expert coverage across many prompt tokens: the union of experts can grow with prompt diversity and length.
3. Runtime cache saturation: depends on cache budget, route locality, prefill chunk size, prompt history, cache hit rate, prefetch accuracy and eviction.
4. System memory pressure: depends on shell, expert pool, KV/recurrent state, prefill scratch, MLX/Metal buffers, macOS/DSH, context and concurrency.

For the first 16GB pilot, keep one request/concurrency 1, short context, one model runner, no MTP/draft, and explicit memory-pressure/swap stop conditions. Instrument: unique experts per layer per sequence, expert hit/miss, bytes read per generated token, prefetch hit/waste, cache occupancy, I/O wait, GPU compute, TTFT, decode tokens/s, process footprint, system memory pressure and swap delta. Exercise at least simple Q&A, extraction, long-document, coding/agent and multi-step reasoning tasks. Only this trace can estimate how often actual PACS workloads approach cache or memory saturation.

## 8. Current recommendation

1. Continue source-level and model-format work on **streamlx** as the primary performance candidate.
2. Reuse **serve-mlx**'s memory accounting, staged pressure response, exact bundle validation, and correctness tests as the safety/reference checklist.
3. Keep the **llama.cpp Metal paging PoC** as a separate native implementation track if MLX scheduling or Python overhead becomes limiting.
4. Do not install any runtime or download any large checkpoint during this G6 source-audit phase.
5. Do not finalize the 48B–50B model choice until its actual expert layout, top-k slot floor, shell size, KV behavior, and runtime compatibility are known.

## 9. Repository and source references

- streamlx repository: https://github.com/srcterm/streamlx
- streamlx README: https://github.com/srcterm/streamlx/blob/main/README.md
- streamlx reader: https://github.com/srcterm/streamlx/blob/main/streamlx/reader.py
- streamlx pool: https://github.com/srcterm/streamlx/blob/main/streamlx/pool.py
- streamlx integration: https://github.com/srcterm/streamlx/blob/main/streamlx/integrate.py
- streamlx pipeline: https://github.com/srcterm/streamlx/blob/main/streamlx/pipeline.py
- serve-mlx repository: https://github.com/IDAH-BITBOX/serve-mlx
- serve-mlx README: https://github.com/IDAH-BITBOX/serve-mlx/blob/main/README.md
- serve-mlx memory manager: https://github.com/IDAH-BITBOX/serve-mlx/blob/main/src/mlx_moe_stream/memory.py
- serve-mlx async loader: https://github.com/IDAH-BITBOX/serve-mlx/blob/main/src/mlx_moe_stream/prefetch/async_loader.py
- serve-mlx Qwen3.5 adapter: https://github.com/IDAH-BITBOX/serve-mlx/blob/main/src/mlx_moe_stream/models/qwen3_5_moe.py
- llama.cpp discussion: https://github.com/ggml-org/llama.cpp/discussions/23324
- llama.cpp fork PR: https://github.com/kisasexypantera94/llama.cpp/pull/2
- PACS TS900 benchmark: ../reports/ts900-ssd-benchmark-2026-11-17.md
- PACS 4B baseline: ../reports/4b-runtime-baseline-2026-11-17.md

## 7D. G6-Safety — 16GB memory, power, thermal and SSD risk gate (2026-11-17)

This is a source-based preflight, not a host stress test. No model weights were downloaded or executed for this assessment.

### Hardware facts and limits

Target host: 2024 Mac mini M4, 16GB unified memory, 10-core GPU, 120GB/s published memory bandwidth. Apple's published power table for the 16GB M4 Mac mini lists 4W idle and 65W maximum power consumption, with 222 BTU/h maximum thermal output. Apple lists 10–35°C as the operating ambient-temperature range. These are product-level specifications, not a prediction of a particular MLX workload's power draw.

Third-party Notebookcheck combined CPU/GPU stress testing reported approximately 62.5W initial system draw, 57–58W sustained system draw, SoC temperature around 102°C, and automatic fan speed around 2,950 RPM. This is not an LLM test and cannot be used as a direct temperature forecast. It does demonstrate that internal SoC temperature can be much higher than enclosure surface temperature and that the fan becomes audible under sustained stress.

Apple's ProcessInfo thermal states:
- nominal: within normal limits;
- fair: slightly elevated; system may run fans and defer background work;
- serious: high; system reduces performance and fans run at maximum;
- critical: significantly affecting performance; system needs to cool.
Apple's powermetrics documentation says power readings are estimates and thermal readings are instantaneous snapshots, not a continuous guarantee.

### Why 10B active is not a thermal or memory verdict

Active parameter count does not directly specify:
- resident unified-memory footprint;
- amount of SSD data read per token;
- GPU utilization or sustained power;
- thermal equilibrium or fan curve.

The relevant runtime memory budget remains:
OS + DSH + model shell + expert pool + KV/recurrent state + prefill/decode scratch + MLX/Metal/runtime buffers.

The existing Qwen3.5-4B warm-run baseline and TS900 throughput benchmark are useful reference points, but neither measures the target MoE runtime's sustained power, temperature or DSH co-residency.

### Shape-derived cold expert-read envelope (not a throughput prediction)

Using the already documented 4-bit group-64 expert bundle estimates:
- Kimi Linear: 26 MoE layers × top-8 = 208 selected expert bundles/token. At approximately 3,981,312 bytes/bundle, a full cold miss of all selected routed experts is about 0.77 GiB/token.
- Qwen3.5-122B: 48 MoE layers × top-8 = 384 selected expert bundles/token. At approximately 5,308,416 bytes/bundle, a full cold miss is about 1.90 GiB/token.

At the PACS TS900 non-zero sequential uncached-read reference of 834.7 MiB/s, the serialized read-time equivalents are approximately:
- Kimi: 0.95 seconds for a full selected-expert cold miss.
- Qwen 122B: 2.33 seconds for a full selected-expert cold miss.

These are intentionally conservative cold-miss transfer equivalents, not measured per-token latency. They assume every selected routed expert is absent from cache and ignore I/O/compute overlap, request merging, asynchronous prefetch and any reuse. Real performance depends heavily on cache hit rate and route locality. They do not include shell/attention/KV/scratch traffic. The TS900 benchmark did not measure SSD temperature; its SMART status was reported unsupported, so SSD thermal behavior remains unknown.

The 120GB/s unified-memory bandwidth specification and 834.7 MiB/s TS900 read result describe different subsystems and workload conditions; they must not be treated as directly interchangeable. They do illustrate why expert streaming must maximize cache reuse and overlap rather than repeatedly cold-reading every selected expert.

### Static safety envelope and decision rules

Before any large checkpoint download or execution, require all of the following from metadata/source analysis:
1. Exact pinned Safetensors index and shard-header parse; calculate all expert bundles, shell tensors and non-expert bytes. No file-size-only inference.
2. Account separately for resident shell, minimum top-k slot floor, proposed cache budget, K/V or recurrent state at 4K and 8K, prefill scratch, MLX/Metal buffers and runtime overhead.
3. Keep at least 5 GiB as a provisional non-model reserve for macOS + DSH + user/agent GUI applications + background services + operating headroom. This is a PACS engineering policy, not an Apple specification or a measured guarantee. Important correction: the existing 4B runner's 4.3 GiB process peak is model-process memory, not evidence for the 5 GiB non-model reserve; count it as a model-side reference only. The 5 GiB is a provisional floor to be checked against a measured idle/DSH/app baseline. If actual non-model use exceeds it, reduce the model budget one-for-one; never assume 11 GiB is always available.
4. Reject any candidate whose documented or conservatively estimated peak exceeds the model-side envelope, relies on sustained swap, or has an unbounded cache/prefetch path.
5. For the first eventual controlled serving profile: one model slot, concurrency 1, short context (start 4K), no MTP/draft, bounded expert cache and prefetch, no simultaneous 4B runner, no DSH concurrency claim until static memory accounting supports it.
6. Treat thermal state as a hard runtime control: Fair reduces speculative prefetch/background work; Serious stops admission of new inference jobs and drains/unloads the current model; Critical aborts inference and cools down. A persistent Serious state is a candidate rejection for unattended sustained service.
7. Do not assign a numeric watts or SoC-temperature safety threshold without a validated device sensor and workload basis. Apple product maximum power is a system specification, not a per-model budget. powermetrics power values are estimates; thermal-state samples are instantaneous.
8. Treat external TS900 SSD temperature as unverified. Do not assume the generic read benchmark establishes sustained thermal suitability.

### Model-specific preflight interpretation

- **Kimi Linear 48B-A3B:** lower cold expert-read floor (~0.77 GiB/token) and lower top-k slot floor (~0.77 GiB) than Qwen 122B. MLX-LM's Kimi `switch_mlp` layout matches streamlx's generic wrapper, but Kimi is not explicitly listed as an end-to-end validated checkpoint in the inspected streamlx README. This makes Kimi the preferred first static feasibility candidate, not yet approved for execution. Exact header accounting and trunk bytes are now available; runtime peak, attention-state allocation and total memory remain unmeasured.
- **Qwen3.5-122B-A10B:** 10B active remains a research target, not an accepted 16GB deployment. The 4-bit checkpoint's 69.6GB disk size and active-parameter label do not prove feasibility. The standard MLX+streamlx shell accounting and expert pool must fit the 11GiB provisional model envelope with reserve. TurboQuant's third-party 11.3GB reported peak at 8GB cache is not a PACS result and has not established safe DSH co-residency or thermal equilibrium.
- **Mistral Small 4:** remains P1 for architecture/quality and adapter audit; thermal safety cannot be inferred from 6.5B active. It needs the same full accounting and a validated mistral4 runtime path.

### G6-Safety evidence sources

- Apple Mac mini M4 power and thermal output: https://support.apple.com/en-sg/103253
- Apple Mac mini M4 technical specifications and operating environment: https://support.apple.com/en-sg/121555
- Apple ProcessInfo thermal-state definitions: https://developer.apple.com/documentation/foundation/processinfo/thermalstate-swift.enum
- Apple powermetrics manual (estimated power and instantaneous thermal sample): https://manp.gs/mac/1/powermetrics
- Notebookcheck M4 Mac mini sustained combined-load review: https://www.notebookcheck.net/Apple-Mac-Mini-M4-review-Smaller-faster-and-louder.918832.0.html
- PACS TS900 non-zero benchmark: ../reports/ts900-ssd-benchmark-2026-11-17.md
- PACS 4B warm inference baseline: ../reports/4b-runtime-baseline-2026-11-17.md

**Conclusion:** 10B active is neither automatically safe nor automatically unsafe. Under the current no-download/no-execution constraint, only static feasibility can be assessed. Qwen 122B remains conditional until exact shell/cache/state accounting passes the 11GiB provisional model envelope. Kimi is the lower-risk first static candidate. No model is certified for sustained power/thermal behavior without a future separately approved, bounded validation; no such validation is requested or performed in this phase.

## 7E. G6-Context — long context, prompt cache, screenshots and agent-app memory gate (2026-11-17)

This section adds context and agent side-effects to the whole-host memory envelope. It is a source-based estimate and policy proposal; no local runtime, screenshot workload or GUI-agent stress test was run.

### Context is not one memory number

Separate these resources:
1. **Serialized prompt/history:** text, tool outputs, structured state and multimodal input passed to the model.
2. **Active attention/recurrent state:** MLA KV cache and KDA recurrent/convolution state for the active sequence.
3. **Prompt/prefix cache:** retained computed state to avoid repeating prefill. This is a performance cache, not semantic compression; it consumes RAM or SSD.
4. **Prefill scratch and MLX/Metal buffers:** temporary memory while ingesting long prompts. Peak can exceed steady decode cache.
5. **Vision path:** decoded pixels, crops/patches, image embeddings and encoder activations. Compressed screenshot file size is not its working-memory size.
6. **Agent applications:** browser tabs, IDEs, terminal, file viewers, automation host and other processes opened or kept alive by the agent.

Whole-host accounting must include all six, plus macOS, DSH and user applications. Model-process RSS alone is insufficient: the PACS 4B baseline recorded about 200 MiB ps RSS while vmmap reported a 4.3 GiB physical-footprint peak for the MLX runner.

### Kimi Linear context-state estimate

The pinned Kimi config identifies 20 KDA layers and 7 MLA full-attention layers, with kv_lora_rank=512 and qk_rope_head_dim=64. The model card declares a 1,048,576-token context limit, but this is a model capability/configuration field, not a 16 GiB host guarantee.

Assuming the MLA cache stores 512 latent KV values plus 64 RoPE-key values per token per MLA layer, at FP16/BF16 (2 bytes/value), the architecture-derived cache slope is:

7 × (512 + 64) × 2 = 8,064 bytes/token

| Active sequence length | Estimated MLA cache |
|---:|---:|
| 4K | 31.5 MiB |
| 8K | 63 MiB |
| 16K | 126 MiB |
| 32K | 252 MiB |
| 64K | 504 MiB |
| 128K | 0.984 GiB |
| 256K | 1.969 GiB |
| 512K | 3.938 GiB |
| 1,048,576 | 7.875 GiB |

KDA recurrent matrix state is fixed with sequence length. The pinned MLX-LM v0.32.1 `gated_delta_update` explicitly initializes state as FP32 with shape [B, 32, 128, 128] per KDA layer: 20 × 32 × 128 × 128 × 4 bytes = 40 MiB. Kimi's 20 KDA layers also retain q/k/v short-convolution states: each is [B, 3, 4096], three arrays per layer, adding 1.406 MiB if activations are 16-bit or 2.813 MiB if 32-bit. With 16-bit MLA KV, source-derived total state is approximately 72.906–74.313 MiB at 4K (0.0712–0.0726 GiB), and 104.406–105.813 MiB at 8K (0.1020–0.1033 GiB). Activation dtype and actual allocator footprint still require runtime confirmation.

These estimates omit allocator padding, cache metadata, prefill scratch, vision buffers, model shell and expert pool. The 1M model limit must not be used as the PACS context setting: at 16-bit MLA-cache assumptions the cache alone is 7.875 GiB, before every other runtime and host process.

### Prompt caching is not context compression

- **Semantic compaction** shortens the active prompt: produce a structured state summary, preserve the full event log/artifacts externally, start a new shorter sequence and rebuild the model state from the compact prompt. It trades some verbatim history for a smaller active context.
- **Prefix/prompt caching** retains computed KV/recurrent state to avoid recomputing an unchanged prefix. It does not shorten the prompt or erase its state memory.
- **Disk prompt cache** can reduce retained RAM but adds SSD I/O and disk use. streamlx documents a byte-capped RAM prompt-cache LRU and an optional segmented SSD cache (kv-cache-dir, bounded by kv-cache-gib). The PACS TS900 is also the expert-weight source, so using it for prompt-cache reads/writes may contend with expert streaming; this must be benchmarked, not assumed free.
- streamlx's paged cache stores ordinary token-sliced KV cache segments, but recurrent ArraysCache layers store their whole state at segment ends. Hybrid recurrent/attention caches therefore restore only at segment boundaries rather than arbitrary token divergence. MLX-LM v0.32.1 Kimi uses ArraysCache(size=4) for KDA and KVCache for MLA. Kimi's exact cache adapter, compaction/restart behavior and branch handling still require isolated correctness audit.
- streamlx also documents byte-capped prompt-cache and MLX allocator caches, memory-gib expert-pool resizing as the sequence cache grows, and prefill-memory-gib to bound prefill extras. These are useful mechanisms, not proof that every Kimi path is safe. The generic Kimi structural path is source-matched, but the exact Kimi runtime path still requires a bounded correctness test.
- Quantized KV, rotating/sliding cache or reduced context are potential controls only after confirming they support Kimi's hybrid KDA+MLA cache and preserve quality. Do not silently truncate or quantize state in the first correctness baseline.

### Screenshot and visual-input policy

The inspected Kimi Linear checkpoint is a text-generation model (KimiLinearForCausalLM) and its config has no vision tower; treat it as text-only. The existing Qwen3.5-4B checkpoint is a vision-language model with a vision encoder. Therefore:
1. Prefer the OS accessibility tree, app semantics and OCR/text extraction before invoking a vision model.
2. Capture a screenshot only when layout/visual state cannot be established from structured UI data.
3. Capture the smallest relevant region; downscale where legibility allows. For small text, crop the relevant region instead of sending the entire high-resolution desktop.
4. Keep only the current screenshot and, if required, one comparison frame. Do not retain a rolling gallery in active prompt memory.
5. Release image buffers after extraction; retain only the derived text, image hash/path and task-relevant evidence in the event log.
6. If visual understanding is necessary, route through a vision-capable model as a separate stage, then unload it before Kimi. Do not keep Qwen3.5-4B and Kimi simultaneously resident under the single-model-slot policy.
7. Exact image-token count and vision peak are processor/model/resolution dependent. They must be obtained from the exact image processor and runtime; do not infer them from JPEG/PNG file size.

A decoded 3840×2160 RGBA screenshot occupies about 31.6 MiB before crops, resized copies, patches, embeddings or vision activations. Ten such decoded frames would be about 316 MiB just for the pixel buffers. This is an arithmetic illustration, not a measured Qwen/MLX vision footprint.

### Agent application and tool-output controls

- Count browser, IDE, terminal, file viewer, automation host and child processes opened by the agent as part of the whole-host budget.
- Use one browser session and only the tabs/windows needed for the active task; avoid duplicate app instances, background polling and unattended GUI loops.
- Track agent-owned process IDs and opened tabs. The agent may close only resources it created for the task; never terminate user-owned apps or unrelated processes automatically.
- Capture process physical footprint/VM accounting and system memory pressure; do not use ps RSS as the sole measure for Metal/MLX workloads.
- Parse command output into relevant fields. Keep large logs, HTML, source dumps and screenshots as bounded files/artifacts with hashes and references; place only concise extracts in the active prompt.
- Do not repeatedly inject the same page, full log or screenshot into every turn. Retrieve relevant slices on demand.

### PACS context-compaction protocol (proposed)

Maintain a small active working set and a durable external record:
1. **Stable policy layer:** permissions, safety rules, model routing, network boundary and non-negotiable project decisions.
2. **Task capsule:** objective; current phase; exact current state; decisions; completed actions and evidence; files/commit SHAs; pending steps; blockers; explicit non-actions/authorization boundaries.
3. **Recent working window:** only the most recent turns and tool outputs needed for the immediate next step.
4. **Retrieval archive:** append-only event log, full tool outputs, documents and screenshots on disk/GitHub; fetch exact slices when required.

When compaction is triggered, generate a structured summary rather than a generic narrative. Preserve numbers, paths, hashes, process IDs only while still relevant, test outcomes, source references, safety constraints and user approvals verbatim where exactness matters. Do not summarize away permissions or mark unverified actions as complete. Re-tokenize the compacted prompt into a fresh request/cache; the old active sequence cache can then be released at a safe point.

Initial policy proposal:
- Start the first controlled model profile at 4K context, concurrency 1; raise to 8K only after the static memory budget passes. Treat 16K+ as a new memory/pre-fill gate, not an automatic next step.
- Soft compaction at 70% of the configured prompt-token budget; mandatory compaction before 85%. Reserve the remainder for tool results and output. These are PACS policy thresholds, not model/runtime defaults.
- Trigger earlier if whole-host memory pressure rises, MLX active+cache+peak approaches its working-set cap, swap begins increasing during the task, agent-app footprints expand, or screenshot/tool-output queues exceed their byte limits.
- Under pressure: stop admitting new tasks; stop background polling and speculative prefetch; release agent-created screenshot/image buffers and stale tabs; compact or evict prompt cache; shrink expert pools only at runtime-safe points; if still unsafe, reject the request and unload the model. Do not rely on swap as extra model capacity.
- Keep the full audit/event record outside the active context. Context summaries are working memory, not the sole source of truth.

### Whole-host memory equation

16 GiB = macOS + DSH + user apps + agent apps + model shell + expert pool + KDA/MLA state + prompt cache + prefill scratch + vision buffers + runtime/allocator + uncommitted headroom

The 5 GiB non-model reserve is a provisional floor, not a fixed measurement. The 11 GiB model-side ceiling applies only when the non-model reserve is actually respected; if browser/IDE/vision/other applications consume more, reduce the model-side budget by the same amount. Do not allocate 11 GiB to the model and then treat GUI apps as free.

### G6-Context evidence sources

- Kimi Linear official model card (architecture, 1M context claim, hybrid KDA/MLA): https://huggingface.co/moonshotai/Kimi-Linear-48B-A3B-Instruct
- Kimi Linear official config (pinned architecture fields: KDA/MLA layers, KV LoRA rank, RoPE key dimension): https://huggingface.co/moonshotai/Kimi-Linear-48B-A3B-Instruct/blob/main/config.json
- Kimi Linear architecture paper: https://arxiv.org/abs/2510.26692
- Kimi 4-bit MLX checkpoint revision used by PACS: https://huggingface.co/mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit/tree/919175d75427f1c10cfc17e7254b53295edddf72
- streamlx prompt-cache, KV-cache and prefill options: https://github.com/srcterm/streamlx/blob/main/README.md
- streamlx sequential server memory/prompt-cache handling: https://github.com/srcterm/streamlx/blob/main/examples/serve.py
- streamlx segmented disk prompt-cache and recurrent-state boundary behavior: https://github.com/srcterm/streamlx/blob/main/streamlx/kvcache.py
- MLX-LM long-prompt, rotating KV cache and prompt-cache features: https://github.com/ml-explore/mlx-lm
- Apple WWDC25 MLX KV-cache reuse explanation: https://developer.apple.com/videos/play/wwdc2025/298/
- Qwen3.5-4B official model card (vision encoder): https://huggingface.co/Qwen/Qwen3.5-4B
- PACS measured 4B runner baseline: ../reports/4b-runtime-baseline-2026-11-17.md

### G6-Context status

| Item | Status |
|---|---|
| Kimi MLA cache slope from public config | SOURCE-DERIVED estimate |
| KDA fixed-state size | SHAPE estimate; dtype/layout pending |
| 1M context suitability on 16 GiB | NOT ACCEPTED; cache alone ~7.875 GiB at 16-bit |
| streamlx prompt cache / disk cache semantics | SOURCE AUDITED |
| Kimi hybrid cache segment/branch behavior | PARTIAL; exact adapter correctness pending |
| Screenshot/vision peak | NOT MEASURED; route policy defined |
| Agent app process budget | POLICY DEFINED; host measurements pending |
| Context compaction thresholds | PROPOSED; not runtime implemented |

## 7F. G6-Vision & App Integration — screenshot understanding and Office workflows (2026-11-17)

This gate separates model-level modality from runtime-level support and application automation. The user's visual requirement is deliberately narrow: understand computer-screen screenshots. Video understanding, video editing, diffusion/image generation and complex creative-media pipelines are out of scope.

### Corrected model-role map

| Model | PACS role | Model-level image input | Current runtime evidence |
|---|---|---|---|
| Qwen3.5-122B-A10B | P0 primary capability research target | YES; official model card identifies a vision encoder and text/image input | MLX-VLM image-input example exists; full vision + streamlx expert-streaming path is NOT VERIFIED |
| Mistral Small 4 119B-A6.5B | P1 architecture/quality comparison | YES; official Mistral announcement says text and image input | No validated streamlx mistral4 adapter; end-to-end local image path NOT VERIFIED |
| Kimi Linear 48B-A3B | Lower-risk MoE streaming pilot candidate | NO; text-generation / CausalLM checkpoint | Text-only path is the relevant target |
| Existing Qwen3.5-4B | Installed baseline and possible screenshot helper | YES at model architecture/checkpoint level; official card identifies a vision encoder | Exact installed Ollama version + model artifact image-input request has NOT been locally tested in this audit |

This corrects any reading that Kimi Linear is the sole or final PACS primary model. The current expanded model-selection decision keeps Qwen3.5-122B-A10B as the P0 capability target and Kimi Linear as the lower-risk streaming pilot candidate. Do not promote a text-only Kimi deployment to the only PACS assistant if direct screenshot understanding is a required product capability.

### Critical runtime boundary

- The Qwen3.5-122B-A10B official model card identifies a vision encoder. The MLX community 4-bit checkpoint was converted using mlx-vlm and documents an image-input example via `mlx_vlm.load` / `mlx_vlm.generate`.
- streamlx README validates the Qwen3.5 MoE language-model family and says it remaps **MLX-VLM text-only exports** whose tensors use the `language_model.` prefix. That wording is not evidence that streamlx streams/loads the complete vision tower, image processor, image embeddings or multimodal prefill path.
- Therefore: Qwen3.5-122B is multimodal as a model, but its complete visual-input path through the PACS-selected SSD expert-streaming runtime remains **NOT VERIFIED**. Do not claim image understanding is deployable until a real image request passes end-to-end through the exact pinned checkpoint, runtime and server API.
- Mistral Small 4 is also multimodal at the model level, but its `mistral4` adapter and image-input runtime path remain unverified. It is not a drop-in alternative until both are audited.
- The existing Qwen3.5-4B checkpoint is a vision-language architecture. Its installed Ollama artifact/runtime version still needs a local image-request smoke test; architecture metadata alone is not proof that the current installed server path accepts images.

### Minimal screenshot-understanding pipeline

1. Prefer macOS Accessibility APIs / UI element tree and OCR for readable text, labels, menu items and control states. This avoids invoking a VLM for routine screen inspection.
2. Invoke a vision model only for visual layout, icon/diagram interpretation, ambiguous state or OCR failure.
3. Capture a single screenshot or a small region of interest (ROI); crop and resize while retaining the legibility required by the task.
4. Ask for a compact structured result: visible app/window, relevant controls, text, state, approximate coordinates only when needed, confidence and unresolved ambiguity.
5. Release decoded pixels, image tensors and temporary crops after extraction. Store the original screenshot as an external evidence artifact only when required for audit.
6. Send the compact structured result to the primary reasoning model. Do not repeatedly attach the same screenshot to the conversation.
7. On the 16 GiB Mac mini, keep the initial single-model-slot rule. If Qwen3.5-4B performs visual extraction and Kimi performs reasoning, run them sequentially, unload/release the vision runner before loading the MoE model, and verify memory recovery. Do not claim simultaneous residency.
8. If the final Qwen3.5-122B runtime later passes full vision support and the whole-host budget, it may consume the screenshot directly; keep the OCR/accessibility path as the low-cost default.

### Office / PPT / diagram generation is an application workflow, not image generation

The user's output requirement is editable office-style material: slide text, shapes, tables, charts, diagrams and export to PDF/PNG. It does not require video creation, diffusion models or complex raster-art generation.

Preferred workflow:
- Primary model produces slide outline, content, layout constraints and structured data.
- A deterministic PPTX renderer (for example python-pptx or PptxGenJS) or an installed Office/Keynote/LibreOffice automation interface creates editable slides using text, vector shapes, tables and charts.
- An application API/CLI/AppleScript/MCP connector may open, format, export and save the deck when the installed application exposes a supported interface. Do not assume a connector exists before checking.
- Export PDF/PNG for preview; visually inspect only selected slides or a single rendered slide at a time. Retain the editable PPTX as the source of truth.
- Use image generation only when a specific illustration cannot be represented adequately with native shapes or charts.

This reduces image-token usage and avoids turning every slide into a large raster input. It does not make the Office application free: PowerPoint/Keynote/LibreOffice and any automation host still consume RAM and must be included in the whole-host memory budget. Prefer deterministic/headless generation where possible, and open one application instance only when visual QA or application-specific export is required.

### G6-Vision acceptance tests (not yet run)

1. Verify the exact installed Qwen3.5-4B model accepts an image through the current Ollama endpoint and returns grounded observations from a harmless test screenshot.
2. Separately verify the pinned Qwen3.5-122B MLX checkpoint's image path with mlx-vlm on a host/runtime that can safely load it; this is a compatibility probe, not authorization to load the 122B model on the 16 GiB target.
3. Audit whether the candidate streaming runtime can preserve and execute the vision tower and processor while expert tensors are streamed. A text-only export test does not pass this gate.
4. Measure image pre-processing, vision encoder peak, image-token expansion, prefill scratch and total process/system footprint; test one image, one ROI, concurrency 1.
5. Verify screenshot outputs against a small fixed set of desktop states: app/window identification, button/menu recognition, dialog/error interpretation, OCR and coordinate grounding.
6. Verify PPTX generation and export with a small deterministic deck; test that text/shapes remain editable and that only one slide render is held for visual QA.

### G6-Vision status

| Item | Status |
|---|---|
| Qwen3.5-122B model-level image capability | SOURCE VERIFIED |
| Qwen3.5-122B MLX-VLM image example | SOURCE VERIFIED |
| Qwen3.5-122B + streamlx full vision path | NOT VERIFIED |
| Mistral Small 4 model-level image capability | SOURCE VERIFIED |
| Mistral Small 4 + streaming runtime | NOT VERIFIED |
| Kimi Linear 48B-A3B image input | NOT SUPPORTED by inspected text-generation checkpoint |
| Existing Qwen3.5-4B model-level vision architecture | SOURCE VERIFIED |
| Installed Qwen3.5-4B Ollama image-input path | NOT TESTED on target host |
| Accessibility/OCR-first screenshot workflow | POLICY DEFINED |
| PPTX/Office automation path | DESIGN DEFINED; installed app/connector discovery and test pending |

### G6-Vision evidence sources

- Qwen3.5-122B-A10B official model card (Vision Encoder; text/image capability): https://huggingface.co/Qwen/Qwen3.5-122B-A10B
- MLX 4-bit Qwen3.5-122B-A10B model card and mlx-vlm image example: https://huggingface.co/mlx-community/Qwen3.5-122B-A10B-4bit
- streamlx README (Qwen MoE support and explicit MLX-VLM text-only export wording): https://github.com/srcterm/streamlx/blob/main/README.md
- Mistral Small 4 official announcement (text and image inputs): https://mistral.ai/news/mistral-small-4/
- Kimi Linear official model card (Text Generation): https://huggingface.co/moonshotai/Kimi-Linear-48B-A3B-Instruct
- Qwen3.5-4B official model card (Vision Encoder): https://huggingface.co/Qwen/Qwen3.5-4B
- Ollama Qwen3.5 model library: https://ollama.com/library/qwen3.5

## 7G. G6.3 — Qwen3.5-122B-A10B 16 GiB static memory-envelope calculation (2026-11-17)

**Decision:** The 16 GiB host is *plausibly sufficient for a tightly bounded, text-first, single-request pilot* using SSD expert streaming. This is not a hardware pass, a sustained-service approval, or proof that the exact checkpoint is compatible with streamlx. The current evidence does not support simultaneous DSH + browser/Office + large-model + screenshot-vision operation.

### Source inputs

- Target: Mac mini M4, 16 GiB unified memory; TS900 external SSD.
- MLX checkpoint: `mlx-community/Qwen3.5-122B-A10B-4bit`; Hugging Face currently lists 69.6 GB across 14 Safetensors shards.
- Config: 4-bit affine quantization, group size 64; 48 layers; hidden size 3072; expert intermediate size 1024; 256 routed experts/layer; top-k 8; 2 KV heads; head dimension 256; 12 full-attention layers (one full-attention layer per four-layer interval) and 36 linear-attention layers; linear value heads 64 × value dimension 128; `mamba_ssm_dtype=float32`.
- streamlx trunk loading is lazy and routed experts are streamed from Safetensors. Its README's default expert budget is 8 GiB; this is too high for the PACS 16 GiB policy and must be overridden. The README lists `qwen3_5_moe` as a validated family (Qwen3.6), not an end-to-end validation of this exact Qwen3.5-122B checkpoint.

### Routed expert tensor arithmetic (shape-derived, not index-parsed)

Assumptions: each routed expert is SwiGLU with gate, up and down projections; each matrix has shape 3072 × 1024; all routed expert tensors use 4-bit affine quantization, group size 64, with FP16/BF16 scale and bias (4 bytes per 64-weight group).

```
parameters/expert = 3 × 3072 × 1024 = 9,437,184
packed 4-bit weights = 9,437,184 / 2 = 4,718,592 bytes
quant groups = 9,437,184 / 64 = 147,456
scale + bias = 147,456 × 4 = 589,824 bytes
estimated bundle/expert = 5,308,416 bytes = 5.0625 MiB

all routed experts = 48 × 256 = 12,288
estimated routed-expert tensors = 65,229,815,808 bytes = 60.75 GiB

per-token top-k slot floor = 48 × 8 = 384 bundles
minimum expert pool = 2,038,431,744 bytes = 1.8984 GiB
```

The model repository's displayed 69.6 GB checkpoint is approximately 64.82 GiB. Subtracting the shape-derived 60.75 GiB routed-expert estimate leaves approximately **4.07 GiB for the entire non-routed trunk**: attention, embeddings/output, routers/norms, shared experts, vision tower and other non-routed tensors. This residual is an estimate, not a measured shell allocation. Exact per-tensor index/header parsing could change it.

### Context-state estimates

- Full attention: 12 layers × 2 KV heads × 256 dimensions × K/V × 2 bytes = 24,576 bytes/token.
- MLA-style KV equivalent: 4K ≈ 96 MiB; 8K ≈ 192 MiB; 16K ≈ 384 MiB.
- Linear-attention recurrent state (shape estimate): 36 layers × 64 value heads × 128 × 128 FP32 elements ≈ 144 MiB, plus convolution state and runtime metadata. Actual MLX cache dtype/layout is not yet measured.
- 4K/8K context-state estimate is small relative to the shell and expert pool; prefill scratch and allocator peaks are the larger unknowns.

### PACS 16 GiB budget scenarios

PACS retains a **provisional 5 GiB non-model reserve** for macOS, DSH, user/agent applications and operating headroom. Therefore the provisional model-side ceiling is 11 GiB only if actual non-model usage stays within 5 GiB.

| Item | Minimum-pool case | Practical pilot envelope |
|---|---:|---:|
| Non-routed shell estimate | 4.07 GiB | 4.07 GiB |
| Expert pool | 1.90 GiB minimum | 3.00 GiB cap |
| 4K KV | 0.094 GiB | 0.094 GiB |
| Linear recurrent state | 0.141 GiB | 0.141 GiB |
| **Subtotal before runtime/scratch** | **6.20 GiB** | **7.30 GiB** |
| Non-model reserve | 5.00 GiB | 5.00 GiB |
| **Remaining for runtime, MLX/Metal allocator, prefill scratch, transient activations and extra buffers** | **4.80 GiB** | **3.70 GiB** |

At 8K, add approximately 96 MiB to the 4K figures. Context length is not the primary static obstacle at 4K–8K; the exact shell, execution scratch, allocator behavior and cache residency are.

The streamlx documented default 8 GiB expert budget would produce approximately 12.30 GiB for shell + expert pool + 4K recurrent/KV state alone, before the 5 GiB non-model reserve. It is therefore **not acceptable** on this host under PACS policy. Start with a 2.0–2.5 GiB correctness/memory probe (the 1.90 GiB floor is a hard lower bound); only consider 3 GiB if measured headroom permits. Do not set 8 GiB by copying the upstream default.

### I/O and performance constraint

The shape-derived cold-miss envelope for all 384 routed experts selected by a token is approximately 1.90 GiB. At the measured TS900 uncached sequential-read reference of 834.7 MiB/s, fully cold serialized transfer is about 2.33 seconds/token-equivalent. This is not a decode-latency prediction: expert reuse, cache hit rate, merged reads, prefetch and GPU/I/O overlap can improve it substantially. The 16 GiB hit rate and actual tokens/s are unknown. Memory feasibility does not imply acceptable interactive speed.

### Explicit first-pilot limits

- Single model process, concurrency 1, 4K context, bounded output.
- Text-only first; do not send screenshots or images through streamlx until the full vision tower/processor path is verified.
- Stop/unload Ollama Qwen3.5-4B before loading the large model; do not co-reside both runners.
- Expert pool 2.0–2.5 GiB initially (2.0 GiB is close to the 1.90 GiB slot floor); explicitly cap prompt cache at about 0.5–1.0 GiB and MLX freed-buffer cache at about 0.5–1.0 GiB rather than inheriting the documented 2 GiB MLX-cache default; prefill chunk 2048 or smaller if measured scratch requires it. These are proposed caps, not measured safe values.
- Disable MTP/draft and speculative prefetch initially; keep GPU keepalive off for the first correctness/memory baseline. Measure before enabling prefetch.
- Do not launch browser/Office/GUI-agent workloads concurrently in the first memory acceptance test.
- Stop on rising system memory pressure, sustained swap growth, memory compression escalation, or Apple thermal state Serious/Critical. No numeric watt/temperature threshold is claimed.
- Measure total system memory pressure, MLX active/peak, process physical footprint, swap delta, prefill peak, expert hit/miss and actual read bytes, TTFT, decode tok/s and thermal state.

### Final G6.3 judgement

- **Can the 10B-active model plausibly fit in 16 GiB with expert streaming? YES, conditionally**, at 4K–8K, one request, a small bounded expert pool and no concurrent vision/GUI workload.
- **Is it proven to run on this exact Mac mini? NO.** No target hardware run was performed.
- **Is it approved as a daily always-on PACS model with DSH, GUI apps and direct screenshot vision? NO.**
- **Is speed guaranteed to be useful? NO.** Cache locality and SSD/GPU overlap remain unmeasured.
- **Is the exact Qwen3.5-122B checkpoint accepted by streamlx? NOT YET.** The family adapter is listed, but exact pinned index/header, expert key layout, lazy shell load and full 122B correctness still require source-level verification.

This calculation closes the first-order *static arithmetic* question. It does not close G6.2 exact-checkpoint compatibility, G6.3 measured peak memory, G6.4 I/O/Metal overlap, or thermal acceptance. No download, installation, runtime execution or production configuration change was performed.

## 7H. G6.3 correction — Qwen 122B cache locality, prefill traffic and deployment suitability (2026-11-18)

This section qualifies the optimistic static-memory conclusion in 7G. The previous 7G calculation showed that a constrained memory layout is arithmetically plausible; it did **not** establish an acceptable cache hit rate, prefill latency, decode throughput, thermal behavior or daily-use suitability. The model should not be promoted to the first deployment choice on that basis.

### 1. streamlx allocates slots per MoE layer, not as one freely shared cache

Pinned source inspected: streamlx commit `9ab2cca54c3e2e5397718c0a5997b22537c7a454`, especially `streamlx/integrate.py`, `streamlx/pool.py`, and `README.md`.

- `load_streaming_model()` divides the expert budget equally by the number of MoE layers and each layer's expert bytes.
- Each layer receives `max(top_k, int(budget / layer_count / expert_bytes))` slots.
- Each layer uses an independent LRU. Slots from a layer that has spare locality cannot simply be reassigned to another layer.
- `pool.py` exposes hit, miss, eviction, fetch-time and bytes-read counters, but no Qwen3.5-122B route trace or measured hit rate is available.

For the Qwen 122B shape estimate (48 MoE layers, 256 experts/layer, 5.0625 MiB/expert):

| Nominal expert budget | Actual integer slots/layer | Allocated pool bytes | Fraction of 256 expert IDs resident/layer |
|---:|---:|---:|---:|
| 2 GiB | 8 (minimum top-k) | 1.898 GiB | 3.1% |
| 2.5 GiB | 10 | 2.373 GiB | 3.9% |
| 3 GiB | 12 | 2.848 GiB | 4.7% |
| 4 GiB | 16 | 3.797 GiB | 6.3% |

The 2.5 GiB proposal therefore provides only two slots above the eight experts needed by each layer for one decode token. Three GiB provides four extra slots. Under an independent uniform-routing thought experiment, expected hits would be roughly the resident fraction (about 3.9–4.7% at these budgets). **This is not a measured or predicted model hit rate**: real routers can have strongly skewed hot-expert distributions, which may improve locality substantially. The missing evidence is an actual representative routing trace and measured per-layer hit/miss data.

For comparison, the pinned Kimi Linear 48B-A3B exact header audit confirms 26 MoE layers and 3,981,312 bytes (3.797 MiB) per expert. At 2/3/4 GiB pool targets, streamlx's integer slot calculation yields 20/31/41 slots per layer and 1.928/2.989/3.953 GiB actual pools. Kimi's stacked `switch_mlp` layout matches streamlx's generic path through MLX-LM v0.32.1; the inspected streamlx README does not explicitly list Kimi as end-to-end validated. A Kimi-specific runtime correctness test remains required. Kimi Linear is text-only.

### 2. Decode cold-read and cache-miss exposure

The 1.898 GiB selected-expert set per Qwen token is the all-cold-miss envelope. At the PACS TS900 uncached-read reference of 834.7 MiB/s, its serial transfer equivalent is about 2.33 seconds. If the route distribution behaved like the uniform thought experiment above, a 2.5–3 GiB pool would still miss roughly 95–96% of selected expert lookups, corresponding to about 2.22–2.24 seconds of serialized read-equivalent per token. This is **not** a throughput forecast: real route skew, expert reuse, next-layer prefetch, I/O/compute overlap and read merging change wall time. It does show why the missing routing trace is decision-critical rather than a minor optimization detail.

### 3. Prefill has a separate, potentially larger I/O bill

streamlx's README and `examples/serve.py` describe expert-major prefill sweeps: when a chunk routes more experts than the pool can hold, each unique needed expert is streamed once through a throwaway buffer; the implementation notes that a chunk's sweep reads roughly every expert. This differs from the per-token decode cold-miss calculation.

For Qwen 122B, the shape-derived total routed-expert tensor set is about 60.75 GiB. A 2,048-token prefill chunk makes 16,384 top-k selections per MoE layer (2,048 × 8). If that chunk touches nearly all 256 experts in each of 48 layers, its expert-sweep read volume approaches 60.75 GiB, or about 74.5 seconds at the measured TS900 sequential-read rate before compute overlap. A 4,096-token prompt processed as two such chunks could approach twice that volume. These are upper/near-full-coverage envelopes, not measured prompt latency; actual unique experts per chunk depend on the model's routing distribution. Prompt caching can reduce repeated-prefix work on later turns, but it does not remove the first prefill cost.

### 4. Published streamlx performance is a warning, not a transferable guarantee

At the streamlx README's reported test condition — M4 MacBook Air, 32 GB unified memory, approximately 2.4 GB/s SSD, batch-1 greedy decode — the author reports:
- Laguna-S-2.1 117B, 2-bit, 8 GiB expert budget: 25.9% miss rate and 3.4 tok/s; at 16 GiB budget: 7.6% miss rate and 7.2 tok/s.
- Qwen3.6-35B-A3B, 4-bit, 8 GiB budget: 8.3% miss rate and 7.2 tok/s; at 16 GiB budget: 3.6% miss rate and 15.9 tok/s (19.0 tok/s with warm-start).

These are author-reported measurements on a 32 GB Mac and a drive roughly 2.7× faster than the PACS TS900 sequential-read result. They are not measurements of Qwen3.5-122B, not 16 GB results, and not a prediction for PACS. They demonstrate that expert budget and model-specific route locality materially affect throughput.

### 5. Power/thermal caution in the inspected runtime

In the inspected streamlx source, GPU keepalive is enabled by default. The pool implementation contains a GPU-hold mechanism that periodically submits matrix multiplications to keep the Apple GPU at a higher performance state when decode routing synchronization would otherwise leave it idle. This is a performance tactic, not a thermal-safety feature. For any later first correctness/memory test, keepalive should remain disabled; thermal and power acceptance still requires separate host measurements and stop conditions. No power or temperature failure has been observed because no such PACS run has occurred.

### 6. Revised model-selection decision

- **Qwen3.5-122B-A10B: do not select as the first PACS deployment model and do not download yet.** Retain it as a research candidate. Its 10B active label and static memory arithmetic do not offset the presently unbounded cache-miss, prefill-I/O, exact-adapter and thermal risks.
- **Kimi Linear 48B-A3B: move ahead as the first source-level MoE pilot candidate**, not as an already-approved deployment. It has a much smaller estimated per-layer top-k pool floor (~0.77 GiB versus ~1.90 GiB), fewer MoE layers (26 versus 48), more cache slots per layer at the same total pool budget, and an explicitly listed streamlx family/layout. Its text-only nature means screenshot understanding remains a separate sequential vision-helper task; do not co-reside Kimi and Qwen3.5-4B.
- **Qwen3.6-35B-A3B: retain as a benchmark/control candidate.** streamlx reports a 32 GB M4 test, but that result cannot be transferred to 16 GB. It is useful as a lower-active-parameter comparison if its exact checkpoint and memory envelope are audited.
- The project may continue exploring 8–10B active models, but any candidate must pass cache locality, prefill I/O, whole-host memory, exact runtime adapter and thermal preflight. Do not optimize for total parameter count alone.

**Decision:** the 122B-A10B is not worth choosing as the first daily-use model under the current evidence. This is a deployment-priority decision, not a claim that the architecture cannot run on Apple Silicon. No checkpoint was downloaded, no runtime installed or executed, and no production configuration changed.

## 7I. G6.2 — Dense 8B–9B multimodal checkpoint audit (2026-11-18)

Scope: read-only audit of the first two candidates from the model-screening plan. No weights downloaded, no runtime installed or executed, no Mac mini configuration changed, and no Ollama/DSH production configuration changed.

### Candidate A — Qwen3.5-9B-4bit (preferred source-level candidate)

**Pinned repository:** `mlx-community/Qwen3.5-9B-4bit`  
**Pinned revision:** `8b2b98c00a6b4d291155e4890773ca8f769aee53`  
**Base model:** `Qwen/Qwen3.5-9B`  
**License:** Apache-2.0  
**Artifact:** MLX Safetensors, 2 shards; repository tree reports 5.98 GB.  
**Index:** `metadata.total_size=5,950,062,560` bytes; weight map names the two-shard set `model-00001-of-00002.safetensors` and `model-00002-of-00002.safetensors`. The public tree and index size are mutually consistent at the displayed level.

Config findings:
- `architectures=Qwen3_5ForConditionalGeneration`, `model_type=qwen3_5`; this is the **dense** Qwen3.5 architecture, not `qwen3_5_moe`.
- 9B parameters; 32 text layers; hidden size 4096; intermediate size 12288.
- Hybrid attention: `full_attention_interval=4`; 8 full-attention layers and 24 linear-attention layers by config-derived count.
- Full-attention KV: 4 KV heads × head dimension 256.
- Linear state config: 16 key heads, 32 value heads, key/value head dimension 128, convolution kernel dimension 4; `mamba_ssm_dtype=float32`.
- Vision config: 27 layers, hidden size 1152, intermediate size 4304, 16 heads, patch size 16, spatial merge 2. Processor metadata identifies Qwen3-VL image and video processors.
- Quantization: affine 4-bit, group size 64.

Runtime evidence:
- The exact model card documents `mlx_vlm.load()` / `mlx_vlm.generate()` and a real image-input example; it says the checkpoint was converted from Qwen3.5-9B using mlx-vlm 0.3.12.
- The inspected mlx-vlm source tree contains the `qwen3_5` package and distinguishes dense `qwen3_5` from `qwen3_5_moe`.
- This is source-level/runtime-family evidence only; no PACS execution has been performed. The full Safetensors key/header list was not exhaustively parsed by this web inspection, so exact per-tensor vision-key accounting remains open.

Derived memory envelope (not measured):
- Packed checkpoint/index size: 5,950,062,560 bytes ≈ 5.54 GiB.
- KV estimate assumes 8 full-attention layers × 4 KV heads × 256 dimensions × K/V × 2 bytes: 32 KiB/token; 4K ≈ 128 MiB, 8K ≈ 256 MiB.
- Linear recurrent state shape estimate: 24 × 32 × 128 × 128 × FP32 ≈ 48 MiB, plus small convolution state and runtime metadata.
- Known model weights + estimated 4K KV + linear state ≈ 5.71 GiB; at 8K ≈ 5.84 GiB.
- Against the project's provisional 5 GiB non-model reserve, about 5.29 GiB (4K) or 5.16 GiB (8K) remains for MLX/Metal runtime, prefill/activation scratch, allocator overhead and image buffers. This makes a **single-model, 4K isolated pilot plausible**, not yet safe/accepted for DSH-concurrent daily service. Image resolution and image count must be bounded; no claim is made about measured peak memory.

**Disposition:** PASS for source-level candidate screening; eligible to be the first isolated pilot *after* a separate explicit test authorization. Not yet a 16 GiB deployment pass.

### Candidate B — Ministral 3 8B (architecture supported; current MLX checkpoint packaging blocked)

**4-bit repository:** `mlx-community/Ministral-3-8B-Instruct-2512-4bit`  
**Current inspected revision:** `182f003f01daa75f9de0f2c4d379722fd0bc1c61`  
**Visible tree:** two shards named `model-00001-of-00002.safetensors` and `model-00002-of-00002.safetensors`; total displayed repository model size 5.63 GB.  
**Config:** `Mistral3ForConditionalGeneration`, `model_type=mistral3`; affine 4-bit, group size 64; 34 text layers, hidden size 4096, intermediate size 14336, 32 attention heads, 8 KV heads, head dimension 128. Vision config: Pixtral, 24 layers, hidden size 1024, 16 heads, patch size 14, image edge 1540. Dense architecture; no MoE expert router/cache.

**Blocking artifact inconsistency:**
- The current visible Safetensors index reports `total_parameters=8,918,026,716` and `total_size=10,420,523,960` bytes.
- Its weight map references the three-shard naming scheme `model-00001-of-00003`, `model-00002-of-00003`, and `model-00003-of-00003`.
- The current repository tree instead lists only two files using the `of-00002` naming scheme.
- The latest 4-bit commit deleted an old standalone `model.safetensors` file, but the visible index metadata/weight-map still reflects the older layout. The same stale three-shard/10.42GB index pattern appears in the 6-bit sibling.
- Therefore the exact checkpoint cannot be accepted as loadable from the current repo state. This is a packaging/index inconsistency, not a proven MLX architecture limitation.

**6-bit sibling cross-check:** `mlx-community/Ministral-3-8B-Instruct-2512-6bit`, revision `8eb4968e7ab0a00940ffdb55c7de35716dd62c3f`; tree shows two shards totalling 7.76 GB, while its index likewise maps three shards and reports 10.42GB. Its model card documents an mlx-vlm 0.3.9 image-generation command, which supports the *family* runtime path but does not repair the checkpoint/index mismatch.

KV/memory implications if a corrected artifact is published:
- Standard full attention, 34 layers × 8 KV heads × 128 dimensions × K/V × 2 bytes = 136 KiB/token.
- Estimated KV: 4K ≈ 544 MiB; 8K ≈ 1.0625 GiB; 16K ≈ 2.125 GiB. Thus its context cache grows about 4.25× faster than Qwen3.5-9B's config-derived KV estimate.
- Based only on visible tree file totals, 4-bit weights would be about 5.24 GiB and 6-bit weights about 7.23 GiB; however, because the index disagrees with the tree, these are **not accepted resident-weight totals**. If the index's 10.42GB tensor total were the true required weight set, the 4K model-side requirement would be about 10.23 GiB before runtime/scratch, leaving only ~0.77 GiB after the provisional 5 GiB non-model reserve. This ambiguity alone blocks a 16 GiB safety conclusion.
- Vision prefill activations, tokenizer/processor allocations and runtime scratch are not included.

Runtime-family evidence:
- mlx-vlm source tree contains a `ministral3` package.
- The 6-bit sibling card provides an explicit `mlx_vlm.generate` image example using mlx-vlm 0.3.9.
- The exact 4-bit checkpoint README does not provide an equivalent inference example; regardless, its index/tree mismatch is the immediate blocker.

**Disposition:** FAIL current checkpoint packaging gate / HOLD. Do not download either current 4-bit or 6-bit MLX artifact. Re-audit only after the publisher supplies an index whose weight-map shard names, shard count and total_size agree with the repository tree, or after a separately authorized reproducible conversion from the official base checkpoint.

### G6.2 comparison and next action

| Gate | Qwen3.5-9B-4bit | Ministral 3 8B 4-bit |
|---|---|---|
| Dense vs MoE classification | Dense | Dense |
| Vision config + processor | Present | Present |
| MLX-VLM family support | Present | Present |
| Exact pinned repo revision | Identified | Identified |
| Tree/index shard consistency | PASS at displayed level | FAIL / mismatch |
| 4-bit quant metadata | affine / group64 | affine / group64 |
| 4K KV estimate | ~128 MiB + ~48 MiB linear state | ~544 MiB |
| Static 16 GiB pilot plausibility | Plausible, conditional | Cannot conclude until artifact repaired |
| Hardware test | Not run | Not run |

**Selection update:** prioritize Qwen3.5-9B-4bit as the next candidate for an isolated, single-model 4K pilot after explicit authorization. Keep Ministral 3 8B on hold pending corrected artifacts. This does not replace or unload the existing Qwen3.5-4B baseline. Keep single-model concurrency 1; do not co-reside 4B and 9B; no browser/Office/GUI-agent concurrency during first acceptance.

Sources inspected:
- Qwen MLX repo/tree and pinned commit: https://huggingface.co/mlx-community/Qwen3.5-9B-4bit/tree/8b2b98c00a6b4d291155e4890773ca8f769aee53
- Qwen config: https://huggingface.co/mlx-community/Qwen3.5-9B-4bit/blob/8b2b98c00a6b4d291155e4890773ca8f769aee53/config.json
- Qwen index: https://huggingface.co/mlx-community/Qwen3.5-9B-4bit/blob/8b2b98c00a6b4d291155e4890773ca8f769aee53/model.safetensors.index.json
- Ministral 4-bit current tree: https://huggingface.co/mlx-community/Ministral-3-8B-Instruct-2512-4bit/tree/182f003f01daa75f9de0f2c4d379722fd0bc1c61
- Ministral 4-bit index: https://huggingface.co/mlx-community/Ministral-3-8B-Instruct-2512-4bit/blob/182f003f01daa75f9de0f2c4d379722fd0bc1c61/model.safetensors.index.json
- Ministral 6-bit tree: https://huggingface.co/mlx-community/Ministral-3-8B-Instruct-2512-6bit/tree/8eb4968e7ab0a00940ffdb55c7de35716dd62c3f
- Ministral 6-bit index: https://huggingface.co/mlx-community/Ministral-3-8B-Instruct-2512-6bit/blob/8eb4968e7ab0a00940ffdb55c7de35716dd62c3f/model.safetensors.index.json
- MLX-VLM model registry mirror (qwen3_5 and ministral3 entries): https://upd.dev/Blaizzy/mlx-vlm/src/commit/451e3a3e9d70ed2890f78083f62e305d40f5c959/mlx_vlm/models

## 10. G6 status

| Gate | Status | Evidence |
|---|---|---|
| G6.1 Runtime source audit | COMPLETE | Source, package metadata, architecture, cache, memory and I/O paths inspected |
| G6.2 Exact checkpoint compatibility | PARTIAL / SOURCE-LEVEL | Qwen3.5-9B-4bit pinned repo/config/index and MLX-VLM path audited; candidate for isolated pilot only. Ministral 3 8B current 4/6-bit MLX repos have shard/index mismatch and are on hold. No target hardware run. |
| G6.3 16 GiB memory envelope | PARTIAL / STATIC ONLY | Qwen 122B shell/pool/state arithmetic estimated; per-layer slot allocation, cache locality thought experiment and prefill sweep I/O envelope audited; exact index, representative route trace, measured peak and thermal data remain absent; 122B not selected for first deployment |
| G6.4 TS900 runtime-level I/O overlap | NOT TESTED | Only generic SSD benchmark exists |
| G6-Safety static power/thermal envelope | PARTIAL / SOURCE-BASED | Apple specifications and third-party stress review; no PACS workload measurement |
| G6-Context prompt/KDA/MLA accounting | PARTIAL / SOURCE-BASED | Kimi config and streamlx cache code inspected; no local runtime measurement |
| G6-Context screenshots/agent applications | POLICY DEFINED / NOT MEASURED | Accessibility/OCR-first, bounded screenshots and app-process budget; no GUI-agent stress test |
| G6-Vision model/runtime compatibility | PARTIAL / SOURCE-VERIFIED | Qwen 122B and Mistral Small 4 are model-level vision-capable; streamlx full vision path and installed 4B Ollama image API remain untested |
| G6-App Office/PPT automation | DESIGN DEFINED / NOT TESTED | Editable PPTX via deterministic renderer or supported app API; installed app/connector and RAM impact pending |
| Runtime installation | NOT AUTHORIZED IN THIS PHASE | No installation performed |
| Large model download | NOT AUTHORIZED IN THIS PHASE | No model downloaded |
| Ollama / DSH production configuration | UNCHANGED | No production configuration modified |

**G6 remains IN PROGRESS. Source-level audit is not hardware compatibility or deployment acceptance.**

## 7J. PACS model-stack decision framework (2026-11-18)

This section separates the small-model decision from the primary MoE decision. The prior Qwen3.5-9B discussion is a *small dense model replacement option*; it does not supersede or eliminate the 48B-class MoE track.

### Small model: retain Qwen3.5-4B for now

- The installed `qwen3.5:4b` remains the measured local baseline/control/fallback: 4.1GB artifact; warm generation about 27.8 tok/s; runner vmmap physical-footprint peak about 4.3GiB; post-inference system free percentage around 37%; swap usage about 1.49GB. These are historical host measurements, not a DSH-concurrent safety pass.
- Do not replace or delete it merely because Qwen3.5-9B exists. The 9B dense MLX model is an optional small-model upgrade only if a fixed PACS task suite demonstrates a meaningful quality gain and its memory/switching cost is justified.
- The installed 4B model is vision-capable at the model-architecture level, but the exact installed Ollama artifact/API image request remains untested. Verify this before buying the complexity of a separate visual model.
- Keep one execution slot on the 16GiB Mac: do not assume 4B and a large MoE can remain resident together.

### Primary MoE and multimodal candidates

1. **Kimi Linear 48B-A3B — P0 text-first MoE pilot candidate.**
   - 48B total / 3B active; 27 layers (first dense, 26 MoE); 256 experts, top-8 + one shared; 20 KDA linear-attention + 7 MLA layers.
   - Exact MLX 4-bit candidate: `mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit@919175d75427f1c10cfc17e7254b53295edddf72`, 27.6GB.
   - MLX-LM v0.32.1 implements Kimi's `switch_mlp` structure, matching streamlx's generic wrapper; this is not an explicit streamlx end-to-end validation. The 2026-11-18 exact header audit confirms a 0.771240 GiB top-8 slot floor and 1.063068 GiB non-`switch_mlp` tensor payload. KDA/MLA runtime cache behavior and 16GiB hardware peak remain open.
   - Text-generation-only checkpoint: no native image input. Pair with OCR/accessibility or a sequential/remote vision helper.
2. **Qwen3.6-35B-A3B — P0/P1 multimodal MoE comparison.**
   - 35B total / 3B active; 40 layers; 256 experts, 8 routed + one shared; hybrid Gated DeltaNet/full attention; native vision encoder and image input.
   - streamlx validates the `qwen3_5_moe` family. Its README reports 22.1GB 4-bit model and M4 MacBook Air 32GB results, which are not transferable to this 16GB Mac mini.
   - Current serve-mlx / mlx-moe-stream documentation provides a Qwen3.6 vision profile for 16GB Macs (no resident expert cache, scratch reserve, quantized KV, short prefill); this is a documented starting configuration, not a PACS M4 mini hardware pass. Treat this as the strongest all-in-one multimodal comparison, with exact pinned checkpoint + vision + memory validation still required.
   - Shape-only expert-pool floor estimate using 40 × top-8 × 3 × 2048 × 512 and affine 4-bit group-64 scale/bias assumptions is ≈0.53GiB; this is not index-parsed and excludes vision/runtime buffers.
3. **Qwen3.5-122B-A10B — P1 stretch capability target.**
   - 122B total / 10B active; 48 MoE layers, 256 experts, top-8 + shared; native vision encoder.
   - Standard MLX 4-bit checkpoint is listed at 69.6GB; streamlx family support exists. Shape-derived minimum expert pool ≈1.90GiB; first-order static accounting leaves ≈3.7GiB for runtime/scratch if pool is capped at 3GiB and the provisional 5GiB non-model reserve is respected.
   - This is plausible for a tightly bounded text-first single-request study, not approved for sustained DSH + GUI + vision concurrency. Full vision + SSD expert-streaming path and exact pinned checkpoint remain unverified.
   - A separate TurboQuant-MLX path has third-party reported ~2.1 tok/s, ~82% hit rate and ~11.3GiB peak with 8GiB cache on a 16GiB M4 mini. This is not a PACS result, has little whole-host headroom, and is a distinct runtime/quantization path from standard MLX+streamlx.
4. **Mistral Small 4 — P1 adapter/quality audit, not eliminated.**
   - Mistral officially describes 119B total / 6B active in MoE (about 8B including embeddings/output), 128 experts with top-4, 256K context, image input, reasoning/coding/agent capabilities.
   - Existing PACS static shape analysis finds routed expert matrix work comparable to Qwen 122B despite top-4, because its expert intermediate width is larger; rough minimum pool ≈1.9GiB.
   - streamlx does not explicitly list `mistral4`; a custom adapter/tensor-layout audit is required before considering a 16GiB pilot. It remains a valid comparison candidate, not a current deployment candidate.
5. **Qwen3.5-397B-A17B / Kimi K2/K3 / Kimi-Dev-72B — defer or reject for this role.** They either exceed the active-parameter envelope, or are not a modern sparse Kimi Linear sibling. No Moonshot-published ~70B-total / 8–10B-active Kimi Linear sibling was identified in the inspected catalog; Kimi-Dev-72B is a dense Qwen2.5-derived coding model, not a like-for-like sparse replacement.

### Critical routing semantics

- Model-internal top-k is fixed by the checkpoint for each token: Kimi and Qwen select 8 routed experts per MoE layer; Mistral Small 4 selects 4. The router chooses *which* experts, not usually *how many* based on task difficulty.
- Do not manually reduce top-k to 2–3 as a default optimization; that changes reference inference and may degrade reasoning/tool calls. PACS should route easy tasks to the small model/tools and hard tasks to the MoE model instead.
- No numeric probability of cache saturation/full-load can be claimed without PACS workload traces. Measure unique experts/layer, hit/miss, bytes read/token, prefetch hit/waste, cache occupancy, I/O wait, GPU compute, TTFT, tok/s, whole-host memory pressure and swap.

### Whole-host constraints and context/cache policy

- Mac mini: M4, 16GiB unified memory, macOS 26.2; TS900 1TB USB/APFS. PACS measured non-zero uncached sequential read 834.7MiB/s, 4KiB QD1 5,492 IOPS, 64KiB QD1 2,984 IOPS. These are storage inputs, not model tokens/s.
- Keep a provisional 5GiB reserve for macOS, DSH, user/agent apps and operating headroom; model-side ceiling is at most 11GiB only while the measured non-model baseline remains ≤5GiB. Budget shell + expert pool + KDA/MLA or KV state + prompt cache + prefill scratch + vision buffers + MLX/Metal runtime/allocator. Reduce model budget one-for-one if actual non-model use exceeds the reserve.
- Start 4K context, concurrency 1, one model process; no co-resident 4B runner; no browser/Office/GUI-agent concurrency in the first memory pilot; no MTP/draft. Increase to 8K only after static and measured gates pass.
- Separate **prompt-prefix cache** from **expert-weight cache**. Prefix-cache reuse requires a stable identical prefix; keep system policy/tool schemas stable and append task-specific content. Semantic compaction shortens active history but is not itself a cache hit. Expert cache hit depends on route locality, pool size, task distribution, prefetch and eviction; measure it separately.
- Proposed compaction policy: soft at 70%, mandatory before 85% of configured prompt budget. Preserve a structured task capsule (goal, phase, facts, decisions, permissions, evidence refs, completed/pending work); archive full logs/screenshots outside the prompt. OCR/accessibility first, screenshot ROI only, one current image, release pixel/image tensors after extraction.
- SSD-backed prompt cache and expert reads share TS900 bandwidth; benchmark contention before enabling both aggressively.
- Disable `STREAMLX_KEEPALIVE`, MTP/draft and speculative prefetch for the first correctness/safety baseline. Only enable one feature at a time after baseline.
- Thermal gate: do not set unsupported watt/temperature limits. Observe macOS thermal state; Fair reduces background/prefetch, Serious stops new jobs and drains the request, Critical aborts inference/cools down. Sustained Serious is not acceptable for unattended service.

### Local device access and secondary nodes

- Model weights do not grant desktop permissions. A PACS tool broker/agent host should expose scoped file, terminal, browser, Accessibility, Screen Recording and app-automation tools with explicit macOS TCC grants, allowlists, logs and confirmation for destructive/high-impact actions. Do not give the model unrestricted root/arbitrary shell; tool host enforces permissions.
- F117: Intel i7-7700HQ 4C/8T, 32GB DDR4-2400, GTX 1050 Ti 4GB, separate 1TB HDD plus TS900 SSD. It cannot pool its RAM/VRAM with the Mac or run MLX/Metal. A direct Ethernet link can stabilize RPC but does not increase Mac unified memory. Initial role: independent OCR/file-processing/tool node; later test a small quantized helper with CPU/partial-GPU offload only after Pascal/CUDA/runtime compatibility check. Do not assign it the primary 48B/122B streaming model.
- T470s: i5-6300U 2C/4T, 20GB DDR4, Intel HD 520 only; use as administration/client endpoint, not an inference node.

### Proposed selection, not deployment approval

- Keep Qwen3.5-4B installed.
- Primary text MoE pilot: Kimi Linear 48B-A3B.
- Parallel all-in-one vision/MoE comparison: Qwen3.6-35B-A3B.
- Stretch target: Qwen3.5-122B-A10B after 48B/35B gates and workload trace.
- Mistral Small 4 stays in adapter/quality audit.
- Qwen3.5-9B remains optional small-model replacement only; not the primary MoE model.
- No model download, runtime installation, hardware execution or production configuration change is authorized by this strategy section.



## 7K. Kimi Linear + Granite H-Tiny dual-resident static memory audit (2026-11-18)

### 7K.1 Scope and conclusion

Static/source-level only. No checkpoint weights downloaded, no runtime installed, no model started, no production configuration changed.

**Conclusion: CONDITIONAL STATIC FIT; NOT A SAFETY PASS.**

**Policy clarification:** this Kimi + Granite dual-resident calculation is retained only as historical research. It does not supersede the user's current direction: one large local model resident at a time; Qwen3.5-4B is sequential fallback/control, not co-resident with the large model. No Granite deployment is authorized by this section.


Two models *resident at the same time, with only one generating at a time* have a controlled target budget of approximately **9.103 GiB model-side**, plus a provisional 5 GiB non-model reserve and 1.5 GiB uncommitted safety headroom. This totals 15.603 GiB and leaves 0.397 GiB beyond the explicit headroom. The target therefore depends on hard caps for Kimi's expert pool, both MLX allocator caches, prompt cache, prefill/startup scratch, and on the non-model footprint actually staying at or below 5 GiB.

A higher-runtime/high-cache scenario can exceed the 16 GiB envelope. **Simultaneous inference (both models actively prefill/decode) is NOT admitted.** The proposed operating mode is dual-resident, global inference concurrency 1.

### 7K.2 Exact artifacts and source status

**Kimi**

- Repo: `mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit`
- Immutable revision: `919175d75427f1c10cfc17e7254b53295edddf72`
- Config: `kimi_linear`, 27 layers; first dense + 26 MoE; 256 routed experts; top-8; one shared expert; hidden 2304; expert intermediate 1024; 20 KDA + 7 MLA; affine 4-bit/group64, router gates overridden to 8-bit.
- HF tree displays 27.6 GB and six safetensors shards. The model page and config are pinned to the inspected revision.
- streamlx loads the trunk lazily, replaces stacked `switch_mlp` blocks, materializes the remaining model parameters and allocates per-layer pools. Kimi's MLX-LM v0.32.1 implementation matches this generic structure; the inspected streamlx README does not explicitly claim Kimi end-to-end validation.

**Granite**

- Candidate repo: `mlx-community/granite-4.0-h-tiny-4bit`
- Model card says it was converted from `ibm-granite/granite-4.0-h-tiny` with `mlx-lm 0.28.2`; the page reports 3.91 GB, 4-bit MLX.
- Official IBM H-Tiny config/index: 6,939,037,248 parameters; BF16 source index total_size 13,878,074,496 bytes; 40 layers (36 Mamba-2 + 4 attention), hidden 1536, 64 experts, top-6, expert intermediate 512, 48 Mamba heads ×64 head dim, state size128, 4 KV heads.
- **Artifact identity is not fully closed:** the MLX model card conversion text names H-Tiny, but the Hugging Face model-tree relation currently points to H-Micro; the index/header and full immutable revision of the MLX quantized artifact have not been parsed in this audit. Treat 3.91 GB as a published size, not exact parsed tensor total. Do not download/use until the full revision, config and index/header are pinned and cross-checked.
- MLX-LM documentation/model registry includes `granitemoehybrid`; this is architecture support evidence, not proof of this exact quantized artifact's correctness on the M4 mini.
- **Do not assume streamlx streaming for Granite.** The inspected streamlx README documents the generic stacked `switch_mlp` path and names Qwen3.6 as a tested example. Kimi's layout has now been source-matched through MLX-LM, but not end-to-end validated; the exact Granite MLX index layout has not been checked. Budget Granite conservatively as a fully resident 4-bit model.

### 7K.3 Kimi weight-tensor ledger

All calculations below are shape-derived, not yet exact per-key Safetensors-header accounting. Quantization overhead assumes affine 4-bit, group64, FP16 scales and FP16 biases. Router gates are 8-bit per config and are included in the shell residual, not in the routed expert formula.

For each routed expert, the three SwiGLU matrices are gate/up/down, each with 2304 × 1024 elements:

- Parameters per matrix: 2,359,296.
- Packed 4-bit values: 1,179,648 bytes.
- Number of groups: 36,864; FP16 scales + FP16 biases: 147,456 bytes.
- Per matrix: 1,327,104 bytes.
- Three matrices per expert: **3,981,312 bytes = 3.797 MiB**.

| Kimi tensor group | Calculation | Estimate |
|---|---|---:|
| All routed experts on disk | 26 × 256 × 3,981,312 B | 26.50 GB / 24.68 GiB |
| Minimum active slot floor | 26 × 8 × 3,981,312 B | 0.771 GiB |
| Proposed resident expert pool | explicit cap | 2.00 GiB |
| Non-expert trunk/shell | 27.6 GB published checkpoint size less estimated routed experts | ~1.03 GiB |
| Full routed-expert bank not resident | kept on TS900 | not counted in RAM |

The 2 GiB pool is about 2.6× the shape-derived minimum floor and averages about 20.7 expert slots per MoE layer (about 78.8 MiB/layer), versus the required 8 slots/layer. This is a capacity target, **not a predicted hit rate**. Actual expert locality/hit rate is unknown without a PACS routing trace.

At a cold token where every selected expert misses, the shape-derived fetched bytes are about 0.771 GiB. At the TS900 non-zero sequential-read reference of 834.7 MiB/s, that is about 0.95 s of serial-read equivalent before overlap/parallelism/cache effects; it is not a token-latency prediction.

### 7K.4 Granite H-Tiny weight-tensor ledger

Published MLX 4-bit artifact size is 3.91 GB decimal = **3.64 GiB**. The original IBM BF16 index gives 6.939B total parameters and the config gives hidden 1536, expert intermediate512, 64 experts, top-6, 40 layers. The following split assumes each expert is represented by fused input (gate+up) and output projections, equivalent to three 1536 × 512 matrices. It also assumes affine 4-bit/group64 with FP16 scales and biases; the quantized MLX header is not yet available for exact verification.

- Parameters/expert: 3 × 1536 × 512 = 2,359,296.
- Packed 4-bit values: 1,179,648 bytes.
- Group metadata: 36,864 groups × (FP16 scale + FP16 bias) = 147,456 bytes.
- Estimated bundle/expert: **1,327,104 bytes = 1.266 MiB**.

| Granite tensor group | Calculation | Estimate |
|---|---|---:|
| All routed experts | 40 × 64 × 1,327,104 B | 3.397 GB / 3.164 GiB |
| Active routed expert set per token | 40 × 6 × 1,327,104 B | 0.297 GiB |
| Non-expert shell residual | published 3.91 GB less estimated full expert bank | ~0.477 GiB |
| Full 4-bit model resident | standard MLX-LM load assumption | 3.64 GiB |

**Important double-counting rule:** in the proposed standard MLX-LM path, the 3.64 GiB full model weight allocation already contains all experts. The 0.297 GiB active expert set is a subset of those resident weights and must NOT be added again. Only if a verified Granite streaming adapter is later implemented would the full resident expert bank be replaced by a smaller expert pool.

### 7K.5 Context state and cache

These are 4K estimates at batch 1, BF16 state/cache assumption; cache object layout and actual dtype still require runtime-source confirmation.

| Model | Component | Shape-derived estimate |
|---|---|---:|
| Kimi | 7 MLA layers, compressed KV rank512 + RoPE key64, 4K | 31.5 MiB |
| Kimi | 20 KDA recurrent matrices, 32 heads ×128×128, BF16 | ~20 MiB |
| Kimi | KDA short-convolution and metadata | small additional amount; not exact |
| **Kimi total** | **4K state allowance** | **0.073 GiB conservative source-derived cap** |
| Granite | 36 Mamba-2 state tensors, 48×64×128 BF16/layer | ~27 MiB |
| Granite | 4 attention layers, 4 KV heads ×128, K+V BF16, 4K | 32 MiB |
| Granite | Mamba convolution state and metadata | small additional amount; not exact |
| **Granite total** | **4K state allowance** | **0.06 GiB** |

Combined Kimi + Granite model state allowance at 4K is approximately **0.133 GiB** after updating Kimi's KDA state to FP32. At 8K, the Kimi state estimate is approximately 0.102–0.103 GiB; a combined Kimi + Granite estimate must be recalculated if that historical dual-resident scenario is ever reconsidered. This means context state is not the dominant resident-memory term for these hybrid architectures at 4K/8K; full Granite weights, Kimi expert pool, runtime, scratch and allocator caches dominate.

Prompt-prefix cache is separate from KV/recurrent state. Initial combined prompt-cache cap: **0.25 GiB** (Kimi up to 0.25 GiB; Granite prefix reuse disabled initially unless separately bounded). Do not confuse semantic compaction with prefix-cache reuse.

### 7K.6 Runtime, allocator and scratch budget

These are explicit engineering caps, not published measurements of the target M4 mini:

| Runtime item | Initial budget |
|---|---:|
| Kimi process/runtime base, excluding model shell and pool | 0.50 GiB |
| Granite process/runtime base, excluding weights | 0.30 GiB |
| MLX freed-buffer allocator caches combined | 0.50 GiB (target 0.25 GiB per process) |
| Active prefill/decode/startup temporary scratch | 0.75 GiB peak, one active model only |
| Prompt-prefix cache combined | 0.25 GiB |
| MTP/draft | 0 GiB; disabled |
| Concurrent second-model scratch | 0 GiB; disallowed |

streamlx README reports resident use approximately trunk + expert budget + 1–2 GB on its tested 32GB M4 Air systems, and exposes `--mlx-cache-gib` (default2.0) and `--prompt-cache-gib` controls. The 1–2 GB is not a Granite or PACS M4 mini measurement; this audit converts it into explicit provisional process/cache/scratch caps. Override defaults rather than inheriting the 2 GiB MLX freed-buffer cache or auto prompt-cache budget.

Prefill target: 2048-token chunks or smaller. No MTP/draft, no speculative multi-stream, no concurrent browser/Office/GUI screenshot workload in the first dual-resident acceptance stage.

### 7K.7 16 GiB admission ledger

| Item | GiB | Status |
|---|---:|---|
| macOS + DSH + desktop/user apps reserve | 5.00 | provisional project reserve; actual baseline must be ≤5 |
| Kimi non-`switch_mlp` tensor payload | 1.063 | exact pinned index/header sum; runtime shell overhead and transform peak excluded |
| Kimi expert pool | 2.00 | explicit cap |
| Kimi 4K KDA/MLA state | 0.073 | source-derived conservative cap after MLX-LM KDA FP32 state inspection |
| Granite full 4-bit weights | 3.64 | published file size converted GB→GiB |
| Granite 4K Mamba/KV state | 0.06 | shape-derived allowance |
| Kimi + Granite runtime bases | 0.80 | explicit engineering cap |
| MLX allocator caches | 0.50 | explicit combined cap |
| Prompt-prefix cache | 0.25 | explicit combined cap |
| Active scratch/startup peak | 0.75 | explicit peak cap; one model active |
| **Model-side subtotal** | **9.103** | **must remain ≤9.50 GiB** |
| Additional uncommitted safety headroom | 1.50 | hard reserve |
| **Planned total** | **15.603 GiB** | **0.397 GiB unallocated** |

Admission rule:

1. Actual non-model baseline (macOS + DSH + user apps) must be no more than 5 GiB. Every GiB above this reduces the 9.5 GiB model cap one-for-one.
2. Model-side measured peak must remain ≤9.5 GiB.
3. At least 1.5 GiB must remain uncommitted after the planned workload.
4. Any cap breach, rising swap, sustained memory pressure or failed allocator-cache reclamation rejects dual-resident mode.
5. If Granite load/startup creates a transient copy above the 0.75 GiB scratch allowance, the dual-resident admission fails; do not force it through swap.

### 7K.8 Operating-mode decision

| Mode | Decision |
|---|---|
| Both model processes resident; one idle | **Conditional target** under 9.5 GiB model cap |
| Granite active, Kimi resident but idle | Conditional; global concurrency remains 1 |
| Kimi active, Granite resident but idle | Conditional; global concurrency remains 1 |
| Both models generating simultaneously | **NO-GO** |
| Both models prefill simultaneously | **NO-GO** |
| 8K context | later gate, only after 4K |
| MTP/draft / multi-stream | disabled |
| Kimi expert pool above 2 GiB | not admitted until re-budgeted |
| Granite streaming expert pool | not counted; adapter/layout not validated |

Use separate model processes/endpoints and a PACS global GPU semaphore. streamlx itself documents one-at-a-time requests by design; a second service does not imply safe concurrent Metal execution.

### 7K.9 Main unresolved items before any download or installation

1. Pin the full immutable Granite MLX repo revision; resolve its H-Tiny/H-Micro model-tree metadata discrepancy.
2. Parse the exact Granite MLX Safetensors index and shard headers; confirm all tensor names, shapes, quantized weight/scales/biases dtypes and exact total_size.
3. Kimi pinned index/header and exact non-`switch_mlp` tensor bytes were parsed on 2026-11-18; remaining work is to measure runtime shell/transform peak, not to repeat the header sum.
4. Inspect the pinned Granite MLX-LM implementation for lazy materialization, Mamba state dtype, attention cache dtype and prefill temporary allocations.
5. streamlx pool allocation source is now inspected: `row_stride` is derived from exact tensor shape/dtype and pools allocate integer expert slots per layer. Hardware MLX/Metal allocation overhead and actual pool peak still require measurement.
6. Establish whether separate MLX processes can enforce the stated allocator-cache caps and whether freed buffers are actually reclaimed from Metal.
7. Recalculate if the measured idle DSH/macOS/app baseline exceeds 5 GiB.

No download, install, model execution, process restart, Ollama/DSH configuration change, or deletion was performed. G6.3 remains **PARTIAL / STATIC ONLY**. Dual-resident mode is a conditional research target, not an approved deployment.

### 7K.10 Source references

- Kimi pinned MLX checkpoint tree: https://huggingface.co/mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit/tree/919175d75427f1c10cfc17e7254b53295edddf72
- Kimi pinned config: https://huggingface.co/mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit/blob/919175d75427f1c10cfc17e7254b53295edddf72/config.json
- streamlx implementation/README: https://github.com/srcterm/streamlx
- IBM Granite H-Tiny config: https://huggingface.co/ibm-granite/granite-4.0-h-tiny/blob/a6188e17509164464aa9601a346febf2be9ac5a5/config.json
- IBM Granite H-Tiny original index: https://huggingface.co/ibm-granite/granite-4.0-h-tiny/blob/a6188e17509164464aa9601a346febf2be9ac5a5/model.safetensors.index.json
- MLX Granite H-Tiny 4-bit candidate: https://huggingface.co/mlx-community/granite-4.0-h-tiny-4bit
- MLX-LM Granite hybrid model registry: https://github.com/ml-explore/mlx-lm
- Independent M4 Max benchmark discussion (architecture/runtime corroboration only; not M4 mini evidence): https://github.com/ml-explore/mlx-lm/discussions/1847



### 7L. G6.2 — Kimi exact Safetensors header and streamlx loader cross-check (2026-11-18)

The user ran the pinned read-only HTTP-Range audit against `mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit@919175d75427f1c10cfc17e7254b53295edddf72`.

**Exact header audit: PASS.** The index and all six shard headers matched across 1,393 tensor keys. Only 165,621 bytes of header data were fetched; no tensor payload was downloaded.

| Component | Exact bytes | GiB |
|---|---:|---:|
| All indexed tensors | 27,641,073,664 | 25.742756 |
| Routed `switch_mlp` expert tensors | 26,499,612,672 | 24.679688 |
| Non-`switch_mlp` tensors | 1,141,460,992 | 1.063068 |
| 26-layer top-8 minimum pool floor | 828,112,896 | 0.771240 |

There are 234 routed expert tensors (26 layers × 3 projections × 3 affine parts). Every layer has the same exact 3,981,312-byte per-expert bundle. Each layer's top-8 floor is 31,850,496 bytes.

**Loader-source cross-check: SOURCE VERIFIED.**

Pinned source:
- streamlx `af9bbe88439212464e5f4cccfa91df75172056b1` (2026-11-17).
- MLX-LM `v0.32.1`.

MLX-LM's `KimiSparseMoE` contains `gate`, `switch_mlp` and `shared_experts`; Kimi decoder layers expose `model.layers`, with layers 1–26 routed MoE and layer 0 dense. Its sanitizer maps the expert tensors to the stacked `model.layers.N.mlp.switch_mlp.{gate_proj,up_proj,down_proj}` layout present in the checkpoint. Kimi `make_cache()` uses `ArraysCache(size=4)` for KDA layers and `KVCache()` for MLA layers.

streamlx's generic loader uses `mlx_lm.load(..., lazy=True)`, wraps each `layer.mlp.switch_mlp` before `mx.eval(model.parameters())), then materializes the remaining trunk and allocates expert pools. Thus the exact 1.063068 GiB non-`switch_mlp` checkpoint tensor payload is the source-derived trunk weight payload expected to be materialized. It is not the full runtime shell peak; transformed tensors, MLX/Metal allocations, Python objects and temporary load buffers remain unmeasured.

**Compatibility wording correction:** the inspected streamlx README/model table does not explicitly list Kimi Linear as an end-to-end validated checkpoint. The evidence is a generic structural match through MLX-LM v0.32.1, not explicit Kimi validation. The earlier statements that streamlx "explicitly lists" or "explicitly validates" `kimi_linear` were too strong and are corrected here.

**Top-k key guard:** Kimi config uses `num_experts_per_token=8`; streamlx's `_routed_topk()` reads `num_experts_per_tok` and therefore falls back to default 8 for this checkpoint. A controlled invocation must pass `k=8` explicitly.

**Pool allocation at the inspected streamlx commit:**

| Requested budget | Integer slots/layer | Actual allocated pool |
|---:|---:|---:|
| 2 GiB | 20 | 1.928101 GiB |
| 3 GiB | 31 | 2.988556 GiB |
| 4 GiB | 41 | 3.952606 GiB |

**Kimi-only provisional static envelope:** exact trunk tensor bytes + the above actual pool + 0.073 GiB conservative source-derived 4K KDA/MLA state + provisional 0.50 GiB runtime base + 0.25 GiB allocator cache + 0.25 GiB prompt cache + 0.75 GiB scratch gives model-side subtotals of 4.814 / 5.875 / 6.839 GiB for 2/3/4 GiB pool targets. Adding the provisional 5 GiB host reserve and 1.5 GiB uncommitted safety reserve gives 11.314 / 12.375 / 13.339 GiB planned totals. This is static arithmetic only; the host reserve is not yet validated by the one-point host snapshot.

The first bounded pilot, if separately authorized, should begin with a 2 GiB pool target, 4K context, concurrency 1, explicit `k=8`, no MTP/draft, no other model resident, and `STREAMLX_KEEPALIVE=0`. Do not increase the pool to 3/4 GiB until correctness, actual MLX/Metal peak, swap trend and system pressure pass.

The 15:39→18:30 host follow-up showed system-wide free percentage 57%→56%, current swap 470.50→446.50 MB, swapouts unchanged at 102,568, swapins +1,841 pages (+28.77 MiB), and compressor occupancy +12,215 pages (+190.86 MiB). No new swapouts were observed in this interval; compressor plateau is not established. These values are not a direct model-allocatable-memory measurement, and the provisional 5 GiB non-model reserve remains unproven. See [Host Operational Follow-up](../reports/host-operational-followup-2026-11-18-1830.md).

Full calculations and source links: [Kimi Linear G6.2 Exact Header Audit](../reports/kimi-linear-g6.2-exact-header-audit-2026-11-18.md).


**Next metadata-only step:** [Kimi non-routed shell breakdown script](../scripts/mac/g6.2-kimi-shell-breakdown.py) groups the exact 1.063068 GiB non-routed tensor bytes and reports the original MLA `kv_b_proj` tensors that MLX-LM's Kimi sanitizer dequantizes/re-quantizes. It reads headers only and fails closed if HTTP Range is unavailable.


### 7M. Kimi shell breakdown and host memory follow-up (2026-11-18)

**Header-only shell breakdown: PASS.** The user ran `g6.2-kimi-shell-breakdown.py` against the same immutable checkpoint. Nine non-routed categories sum exactly to 1,141,460,992 bytes (1.063068 GiB):

| Category | Tensors | Exact bytes | GiB |
|---|---:|---:|---:|
| attention_other | 730 | 544,366,080 | 0.506980 |
| embedding | 3 | 212,336,640 | 0.197754 |
| output_head | 3 | 212,336,640 | 0.197754 |
| shared_experts | 234 | 103,514,112 | 0.096405 |
| MLA kv_b_proj sanitizer input | 21 | 16,515,072 | 0.015381 |
| MoE router | 104 | 16,307,200 | 0.015187 |
| other non-routed | 9 | 35,831,808 | 0.033371 |
| layer norms | 54 | 248,832 | 0.000232 |
| final norm | 1 | 4,608 | 0.000004 |
| **Total** | **1,159** | **1,141,460,992** | **1.063068** |

The seven MLA `kv_b_proj` layers (3, 7, 11, 15, 19, 23, 26) each have 2,359,296 bytes of source tensors: U32 weight [8192,64] plus BF16 scales and biases [8192,8]. Across seven layers this is 16,515,072 bytes = **15.75 MiB** of checkpoint input.

MLX-LM v0.32.1 `KimiLinear.sanitize()` confirms that these inputs are dequantized, reshaped, split into contiguous `wk`/`wv` arrays and requantized into `embed_q` and `unembed_out`. Therefore 15.75 MiB is not a valid conversion peak estimate. Intermediate arrays, lazy evaluation lifetime, allocator behavior and startup peak remain unmeasured. Source: https://github.com/ml-explore/mlx-lm/blob/v0.32.1/mlx_lm/models/kimi_linear.py

**Host follow-up:** first snapshot 15:39 CST, second 18:30 CST. Swap used fell 24 MB (470.50→446.50 MB); cumulative swapouts did not increase (102,568 at both samples); swapins increased 1,841 pages (+28.77 MiB); compressor occupancy increased 12,215 pages (+190.86 MiB, to 4.405 GiB); system-wide free percentage moved 57%→56%. This is no observed swapout growth during the interval, not proof of a long-term plateau or model admission. The 5 GiB non-model reserve remains provisional.

Full second-snapshot data and interpretation: [Host Operational Follow-up](../reports/host-operational-followup-2026-11-18-1830.md). Full exact category table and Kimi audit: [Kimi Linear G6.2 Exact Header Audit](../reports/kimi-linear-g6.2-exact-header-audit-2026-11-18.md).

**Disposition:** checkpoint/header and shell-category accounting PASS; Kimi sanitizer conversion peak and actual MLX/Metal runtime peak NOT MEASURED; G6.3 remains PARTIAL / STATIC ONLY. No model was downloaded or executed.
