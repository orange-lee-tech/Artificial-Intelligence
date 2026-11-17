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

**Runtime match:** streamlx README explicitly lists `kimi_linear` among the validated model families. This is stronger evidence than merely sharing a generic MoE label. It is still not proof that this exact immutable 4-bit checkpoint revision was exercised by the streamlx author on a 16 GiB Mac mini.

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
- streamlx explicitly validates qwen3_5_moe, kimi_linear and laguna; it does not explicitly list mistral4.
- Mistral's MLX conversion exists (67.8 GB) and uses model_type mistral4, 36 layers, 128 experts and top-4. The existence of an MLX conversion is not proof that its tensor naming, expert bundle layout, quantization metadata and loader path are compatible with streamlx.
- Therefore Mistral should be **P1 architecture/quality and adapter-audit candidate**, not P2/eliminated. If adapter work passes, it may be a better resource/performance choice for workloads that value lower total active parameters and configurable reasoning. It is not yet the first 16GB pilot because the runtime path is less verified.
- Qwen remains **P0 8–10B capability target**, with standard MLX+streamlx and separate TurboQuant paths kept distinct.

### Kimi Linear 48B-A3B vs existing Qwen3.5-4B

The installed qwen3.5:4b is a dense 4B model: essentially all 4B parameters participate in each token's forward pass. It is not a 4B-active MoE.
Kimi Linear 48B-A3B is a sparse MoE: 48B total / 3B active, 27 layers (first dense, 26 MoE), 256 routed experts, top-8 + one shared expert, 20 KDA linear-attention layers + 7 MLA layers. Its inspected MLX 4-bit checkpoint is 27.6 GB and streamlx explicitly lists kimi_linear as a validated family.

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

- **Kimi Linear 48B-A3B:** lower cold expert-read floor (~0.77 GiB/token) and lower top-k slot floor (~0.77 GiB) than Qwen 122B; streamlx lists kimi_linear. This makes Kimi the preferred first static feasibility candidate, not yet approved for execution. Exact shell, attention state, cache and total memory remain unparsed.
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

KDA recurrent matrix state is fixed with sequence length. Using 20 layers × 32 heads × 128 × 128 state elements gives 20 MiB at 16-bit or 40 MiB at 32-bit, plus short-convolution state. Actual runtime state dtype/layout must be checked before treating this as an exact number.

These estimates omit allocator padding, cache metadata, prefill scratch, vision buffers, model shell and expert pool. The 1M model limit must not be used as the PACS context setting: at 16-bit MLA-cache assumptions the cache alone is 7.875 GiB, before every other runtime and host process.

### Prompt caching is not context compression

- **Semantic compaction** shortens the active prompt: produce a structured state summary, preserve the full event log/artifacts externally, start a new shorter sequence and rebuild the model state from the compact prompt. It trades some verbatim history for a smaller active context.
- **Prefix/prompt caching** retains computed KV/recurrent state to avoid recomputing an unchanged prefix. It does not shorten the prompt or erase its state memory.
- **Disk prompt cache** can reduce retained RAM but adds SSD I/O and disk use. streamlx documents a byte-capped RAM prompt-cache LRU and an optional segmented SSD cache (kv-cache-dir, bounded by kv-cache-gib). The PACS TS900 is also the expert-weight source, so using it for prompt-cache reads/writes may contend with expert streaming; this must be benchmarked, not assumed free.
- streamlx's paged cache stores ordinary token-sliced KV cache segments, but recurrent ArraysCache layers store their whole state at segment ends. Hybrid recurrent/attention caches therefore restore only at segment boundaries rather than arbitrary token divergence. Kimi's exact cache adapter, compaction/restart behavior and branch handling require source-level and later isolated correctness audit.
- streamlx also documents byte-capped prompt-cache and MLX allocator caches, memory-gib expert-pool resizing as the sequence cache grows, and prefill-memory-gib to bound prefill extras. These are useful mechanisms, not proof that every Kimi path is safe. The exact defaults and Kimi support must be pinned and reviewed before use.
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

## 10. G6 status

| Gate | Status | Evidence |
|---|---|---|
| G6.1 Runtime source audit | COMPLETE | Source, package metadata, architecture, cache, memory and I/O paths inspected |
| G6.2 Exact checkpoint compatibility | NOT TESTED | No exact 48B–50B checkpoint selected or downloaded |
| G6.3 16 GiB memory envelope | NOT TESTED | No target runtime executed on this host |
| G6.4 TS900 runtime-level I/O overlap | NOT TESTED | Only generic SSD benchmark exists |
| G6-Safety static power/thermal envelope | PARTIAL / SOURCE-BASED | Apple specifications and third-party stress review; no PACS workload measurement |
| G6-Context prompt/KDA/MLA accounting | PARTIAL / SOURCE-BASED | Kimi config and streamlx cache code inspected; no local runtime measurement |
| G6-Context screenshots/agent applications | POLICY DEFINED / NOT MEASURED | Qwen vision vs Kimi text-only routing; no GUI-agent stress test |
| Runtime installation | NOT AUTHORIZED IN THIS PHASE | No installation performed |
| Large model download | NOT AUTHORIZED IN THIS PHASE | No model downloaded |
| Ollama / DSH production configuration | UNCHANGED | No production configuration modified |

**G6 remains IN PROGRESS. Source-level audit is not hardware compatibility or deployment acceptance.**
