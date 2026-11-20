# Qwen3.5-4B Runtime Baseline — 2026-11-17

**Host:** Mac mini M4, 16 GiB unified memory, macOS 26.2  
**Ollama:** 0.40.16  
**Model:** `qwen3.5:4b`  
**Runner:** MLX  
**Model store target:** `/Volumes/SSD/AI-Workspace/models`  
**Branch:** `pacs/local-model-toolkit-m4-16gb`

## 1. G3 functional verification

User-provided host checks after changing Ollama Desktop's Model location:

- `ollama serve` child process environment reports `OLLAMA_MODELS=/Volumes/SSD/AI-Workspace/models`.
- `OLLAMA_HOST=127.0.0.1:11434`.
- `OLLAMA_NO_CLOUD=1`.
- A request to `/api/generate` for `qwen3.5:4b` completed successfully.
- `ollama ps` showed `qwen3.5:4b`, runner `mlx`, context 4096, processor `100% GPU`.
- `ollama show --modelfile qwen3.5:4b` returned `FROM qwen3.5:4b`. This is a model-name reference, **not** an absolute filesystem path; it does not independently prove the physical blob path.

**G3 disposition:** functional PASS for configured external model store and successful inference. Physical file-open evidence from the external volume was not separately captured in the latest test, so do not claim that `ollama show --modelfile` proves the path. The internal source model directory remains untouched and must not be deleted until a separate cleanup decision.

## 2. First measured inference

User-provided non-streaming `/api/generate` result:

| Metric | Result |
|---|---:|
| Response text | `测试通过。` |
| `load_duration` | 5.517 s |
| `prompt_eval_count` | 16 tokens |
| `prompt_eval_duration` | 0.270 s |
| `eval_count` | 252 tokens |
| `eval_duration` | 9.023 s |
| `total_duration` | 14.829 s |
| Derived generation throughput | 27.93 tokens/s |
| Context shown by `ollama ps` | 4096 |
| Runner / processor | MLX / 100% GPU |

The request used `keep_alive: "5m"`. However, `load_duration=5.517 s` is non-zero, so this sample is **not a clean warm-start measurement**. Run a second request while the model remains resident to obtain a warm sample. `eval_count` may include internal thinking tokens; do not equate it with visible response length or user-visible output rate.

The `100% GPU` processor field means Ollama reports full GPU placement/offload for this runner; on Apple Silicon it does **not** mean a separate 4.1 GB VRAM pool. CPU and GPU share unified memory.

## 3. System memory snapshot during/after inference

User-provided `memory_pressure` and `sysctl vm.swapusage` output:

| Metric | Observed |
|---|---:|
| Physical memory | 16 GiB |
| System-wide memory free percentage | 36% |
| Current swap used | 1490.62 MB |
| Swap total | 2048.00 MB |
| Swap free | 557.38 MB |
| Compressor pages | 255,988 |
| Wired pages | 381,548 |
| Page size | 16 KiB |
| Pages out (reported counter) | 21,671 |
| Swapouts (reported counter) | 102,568 |

Approximate conversions from the reported page counts: compressed pages ~3.91 GiB; wired pages ~5.82 GiB.

Interpretation limits:

- These are system-wide counters/snapshots, not per-process attribution to Ollama.
- Swapouts/pageouts are cumulative counters, not proof that this single inference caused that amount of swapping.
- The 36% free figure alone is not a complete pressure classification.
- Current swap use is material enough to investigate, but without a pre-inference baseline and a DSH-on/off comparison it does not establish active swap thrashing or an unsafe state.


## 4. Second inference and before/after memory comparison

User-provided second test:

Before the request:
- `ollama ps` showed no loaded model.
- `vm.swapusage`: 1490.62 MB used / 2048.00 MB total.
- `memory_pressure` reported system-wide free percentage 65%.
- Pages decompressed: 2,977,864.
- Pages compressed: 4,020,814.
- Pageins: 3,941,958.
- Pageouts: 22,033.

Second non-streaming `/api/generate` request:

| Metric | Result |
|---|---:|
| Response | `测试通过。` |
| Thinking field | 718 characters |
| `load_duration` | 5.818 s |
| `prompt_eval_count` | 16 |
| `prompt_eval_duration` | 0.057 s |
| `eval_count` | 206 |
| `eval_duration` | 7.663 s |
| `total_duration` | 13.556 s |
| Derived generation throughput | 26.88 tokens/s |

After the request:
- `ollama ps` showed `qwen3.5:4b`, runner `mlx`, processor `100% GPU`, context 4096, approximately 4 minutes remaining.
- `vm.swapusage` remained 1490.62 MB used / 2048.00 MB total.
- `memory_pressure` reported system-wide free percentage 35%.
- Pages decompressed: 3,264,297 (delta +286,433).
- Pages compressed: 4,405,010 (delta +384,196).
- Pageins: 4,182,770 (delta +240,812).
- Pageouts: 22,130 (delta +97).

Process snapshot after the request:

| Process | PID | RSS reported by `ps` |
|---|---:|---:|
| `ollama serve` | 17125 | 27,680 KB |
| `ollama runner --model qwen3.5:4b` | 17451 | 187,920 KB |

**Interpretation:**
- This second request was also a cold load: the pre-request `ollama ps` was empty and `load_duration` was 5.818 s. It is not a warm-resident sample.
- Throughput 26.88 tokens/s is close to the first sample's 27.93 tokens/s, but both are short cold-load samples with different generated token counts; treat ~27 tokens/s as provisional only.
- Swap use was unchanged across this request, and pageouts increased by only 97 pages. This is encouraging, but does not prove that all memory pressure is safe or that there was no paging elsewhere.
- The reported free-memory percentage fell from 65% to 35% during the request. Pages compressed/decompressed and pageins counters also increased. These are system-wide counters; they do not attribute memory to Ollama and should not be interpreted as current compressor footprint.
- The small `ps` RSS values are process resident-set readings only. Do not treat them as the complete MLX/Metal unified-memory footprint without a VM/footprint accounting view.
- The `100% GPU` field is placement/offload information, not a measurement of GPU memory usage.



## 9. Runner VM Map captured while model was resident

User successfully held `qwen3.5:4b` with `keep_alive: "10m"`. The API request completed and `ollama ps` confirmed the model resident for approximately 9 more minutes.

Request metrics:
- `load_duration`: 5.525776084 s
- `eval_count`: 191
- `eval_duration`: 7.040030125 s
- Derived generation throughput: approximately 27.13 tokens/s.

Runner:
- PID: 17791
- Parent (serve): PID 17125
- `ps` RSS: 203,216 KB (about 198.5 MiB).

`vmmap -summary 17791` successfully captured:
- Physical footprint (peak): 4.3 GiB.
- Total resident: 4.1 GiB.
- Total dirty: 4.0 GiB.
- IOAccelerator (graphics): 3.8 GiB resident, 3.8 GiB dirty, 3.8 GiB nonvolatile.
- Writable regions: 4.3 GiB virtual, 3.9 GiB resident.
- VM_ALLOCATE: 1.3 GiB virtual, 83.6 MiB resident.
- ReadOnly portion of Libraries: 935.7 MiB total, 128.2 MiB resident.

This demonstrates why the runner's `ps` RSS (~198.5 MiB) is not a valid proxy for its full Apple Silicon MLX/Metal memory footprint. The IOAccelerator graphics region dominates this process's reported resident memory. The 4.3 GiB peak footprint is the runner process's peak physical footprint, **not a pure model-weight measurement**; it includes runtime and accelerator allocations and must not be interpreted as a universal per-parameter coefficient.

System snapshot taken while the model was resident:
- `memory_pressure` system-wide free percentage: 38%.
- Pages free: 5,888.
- Pages purgeable: 8,146.
- Pages wired down: 366,346 (~5.59 GiB at 16 KiB/page).
- Pages used by compressor: 259,264 (~3.95 GiB at 16 KiB/page).
- `vm.swapusage`: 1490.62 MB used / 2048.00 MB total, unchanged from prior snapshot.
- Swapouts counter: 102,568, unchanged from prior snapshot.
- Pageouts counter: 22,546.

The prior unloaded-model snapshot had 66% system-wide free and 203,062 compressor pages (~3.10 GiB). This comparison is indicative of increased system memory pressure while the model is resident, but it is not a controlled attribution of the entire delta to Ollama: other apps, caches, and system activity were not frozen. No additional swap use or swapouts were observed in this snapshot.

**Interpretation:** a 4B MLX model on this host is associated with approximately 4.3 GiB peak runner physical footprint in this specific configuration. This is a useful measured reference point for the 16 GiB unified-memory budget. It does not establish that a 48B–50B MoE will fit: MoE expert residency, non-expert weights, runtime buffers, KV cache, routing, SSD streaming/cache policy, and DSH co-residency must be measured or audited separately.


## 11. True warm-resident inference sample

User confirmed model residency immediately before the request:
- `ollama ps`: `qwen3.5:4b` present, MLX runner, 100% GPU placement, context 4096, approximately 6 minutes remaining.

Warm inference result:

| Metric | Result |
|---|---:|
| Response | `WARM TEST PASSED` |
| `load_duration` | 0.0049 s |
| `prompt_eval_count` | 19 |
| `prompt_eval_duration` | 0.3365 s |
| `eval_count` | 946 |
| `eval_duration` | 34.0299 s |
| `total_duration` | 34.3854 s |
| Derived generation throughput | 27.80 tokens/s |

This is a valid warm-resident sample: the model was confirmed resident before the request and the reported load duration was approximately 4.9 ms. The 946 generated tokens may include internal thinking tokens for this reasoning model; therefore 27.80 tokens/s is runtime token throughput, not necessarily user-visible response throughput.

System snapshot after warm inference:
- system-wide free percentage: 37%;
- pages free: 5,316;
- pages wired down: 377,269 (~5.76 GiB at 16 KiB/page);
- pages used by compressor: 251,598 (~3.84 GiB at 16 KiB/page);
- `vm.swapusage`: 1490.62 MB used / 2048.00 MB total, unchanged.

Compared with the preceding resident snapshot (free 38%, wired 366,346 pages, compressor 259,264 pages), the change is small: free percentage -1 point, wired +10,923 pages (~171 MiB), compressor -7,666 pages (~120 MiB). These are system-wide snapshots and the differences cannot be attributed solely to the inference request. No swap growth was observed.

**G4 disposition:** the 4B cold-load samples, one true warm-resident sample, and one resident VM Map footprint have now been captured. The measured warm throughput is 27.80 tokens/s and the runner peak physical footprint in the captured run was 4.3 GiB. This is a useful 4B baseline, not a proof of 48B–50B MoE feasibility. DSH co-residency remains a separate, not-yet-tested resource-safety check and must be assessed without modifying DSH production configuration.

## 12. Next work

Proceed to G5: non-destructive TS900 external SSD sequential I/O benchmark. First inspect mount identity, filesystem, free space, and available benchmark tools. Use a dedicated temporary test file under the SSD workspace; do not overwrite model blobs or project files. Benchmark read/write only after confirming sufficient free space, then remove only the test file created by that benchmark. Separately schedule a read-only DSH-on / model-unloaded versus DSH-on / model-resident memory comparison before approving concurrent use.

No model files were deleted, no large model was downloaded, and no production configuration was changed.
