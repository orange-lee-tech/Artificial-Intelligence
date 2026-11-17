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

## 4. Next measurements

1. While `ollama ps` still shows the model resident, run a second short generation request and record `load_duration`, `eval_count`, `eval_duration`, and derived tokens/s.
2. Capture `memory_pressure`, `sysctl vm.swapusage`, `ollama ps`, and top process memory before/after the request.
3. Capture an idle baseline with Ollama model unloaded, then compare with 4B resident.
4. Repeat with DeepSeek Harness in its normal state; do not modify its production configuration. Compare the incremental memory pressure and swap change.
5. Keep concurrency at 1. Do not infer 35B/48B/50B suitability from the 4B model-file size or this single system snapshot.
6. Keep the internal model copy. No model deletion, large-model download, or runtime installation is authorized by this report.

## 5. Gate status

| Gate | Status |
|---|---|
| G3 — Ollama external model-store functional verification | PASS (physical blob-path evidence still desirable) |
| G4 — 4B performance and memory baseline | IN PROGRESS |
| G5 — TS900 SSD I/O benchmark | NOT TESTED |
| G6 — SSD Expert Streaming Runtime audit | RESEARCH STARTED |
| G7 — MoE isolated pilot | NOT STARTED |

**PR #2 remains Draft / unmerged.**
