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

### 3.4 Read-cache caveat

The reader sets `F_NOCACHE` and `F_RDAHEAD` when opening files, but catches and ignores errors from those fcntl calls. Its source comment also notes that on macOS 26.3 the page cache may still be populated despite the stated `F_NOCACHE` intent. Our host is macOS 26.2, so actual cache behavior must be measured on-device. Do not equate the flag being requested with proof that every read reaches the physical SSD.

### 3.5 Maintenance, license, dependencies

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

## 10. G6 status

| Gate | Status | Evidence |
|---|---|---|
| G6.1 Runtime source audit | COMPLETE | Source, package metadata, architecture, cache, memory and I/O paths inspected |
| G6.2 Exact checkpoint compatibility | NOT TESTED | No exact 48B–50B checkpoint selected or downloaded |
| G6.3 16 GiB memory envelope | NOT TESTED | No target runtime executed on this host |
| G6.4 TS900 runtime-level I/O overlap | NOT TESTED | Only generic SSD benchmark exists |
| Runtime installation | NOT AUTHORIZED IN THIS PHASE | No installation performed |
| Large model download | NOT AUTHORIZED IN THIS PHASE | No model downloaded |
| Ollama / DSH production configuration | UNCHANGED | No production configuration modified |

**G6 remains IN PROGRESS. Source-level audit is not hardware compatibility or deployment acceptance.**
