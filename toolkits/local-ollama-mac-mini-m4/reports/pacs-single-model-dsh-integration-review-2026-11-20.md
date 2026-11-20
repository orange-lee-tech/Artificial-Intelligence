# PACS Single-Model + DeepSeek Harness Integration Review — 2026-11-20

**Status:** PROPOSED MODEL-QUALIFICATION DIRECTION; NOT A DEPLOYMENT APPROVAL  
**Target:** Mac mini M4, 16 GiB unified memory, external TS900 SSD  
**Non-actions:** no model weights downloaded; no runtime installed; no model loaded; no DSH/MCP production configuration changed.

## 1. Objective

Deploy one cost-effective local primary model that can serve as the routine reasoning and execution brain for DeepSeek Harness (DSH), while DSH supplies tools, application access, browser operations, Computer Use and controlled execution. Preserve the small cloud budget for occasional high-value strategy and audit work.

The primary model should cover:
- general reasoning and Chinese/English work;
- coding and repository-level tasks;
- reliable structured tool/function calling;
- image/screenshot understanding for cases where DOM, Accessibility Tree or OCR is insufficient.

Audio, video generation, image generation and other modalities are not primary requirements in this phase.

## 2. DSH integration findings (official repository documentation inspected 2026-11-20)

- DSH's Models settings support a custom model API for self-hosted endpoints and can speak OpenAI Chat Completions, OpenAI Responses, Anthropic Messages or Gemini API.
- A custom model can declare per-model input modalities, including `[text, image]`. This declaration is a capability claim, not an endpoint test; the configured server must genuinely accept the declared inputs.
- Computer Use exposes application/window selection, Accessibility Tree reads, screenshots and authorized input.
- Without an explicit `screenshotTarget`, the CUA screenshot path resolves the Agent's model route and rejects a model that does not declare image input with `MODEL_DOES_NOT_SUPPORT_IMAGES`.
- A configured `screenshotTarget` controls screenshot sizing/bytes and can bypass that route precheck for capture/forwarding; it does not turn a text-only model into a vision model or route the screenshot to a separate model. The actual model request still needs an endpoint that accepts image content.
- Therefore DSH gives the agent the *capture and action tools*, but screenshot semantics still require an image-capable model route. DOM/AX/OCR can supply structured text to a text model without image understanding.

Official references:
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/cua/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/experimental/cua-macos/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/README.md

## 3. Proposed first qualification candidate: Qwen3.6-35B-A3B 4-bit MLX VLM

Pinned artifact for source audit:
- Repository: `mlx-community/Qwen3.6-35B-A3B-4bit`
- Revision: `38740b847e4cb78f352aba30aa41c76e08e6eb46`
- Conversion: mlx-vlm 0.4.4, affine 4-bit / group size 64 according to its model card.
- Model family: `qwen3_5_moe`; 35B total / 3B active; 40 layers; 256 routed experts; top-8 plus shared expert; hybrid linear/full attention; vision configuration present.
- Model card classifies it as image-text-to-text and includes a working mlx-vlm image-input example.
- Official Qwen3.6 documentation describes agentic coding and tool-calling support; the chat template encodes function calls.

Why it is the first audit target:
- It combines the required primary reasoning/coding model with native image input, reducing the need to keep a second local vision model.
- Its active parameter count is about 3B, not 10B.
- The inspected `serve-mlx` project explicitly supports Qwen3.6 image chat, OpenAI-compatible chat completions and function calling for compatible tokenizer templates.
- It therefore has a plausible direct DSH custom-provider path.

Unclosed risks:
- Exact 4-bit index/header accounting, expert bundle sizes, non-expert shell and vision-tower bytes have not yet been parsed by PACS.
- `serve-mlx` documents Qwen3.6 M4 validation on a 24 GiB system; its 16 GiB VLM profile is a conservative starting configuration, not a measured pass on this Mac mini.
- The public `serve-mlx` examples primarily identify the 8-bit Qwen3.6 checkpoint as tested. The exact pinned 4-bit artifact plus full vision path must be checked.
- OpenAI-compatible transport does not by itself prove DSH tool-call round trips, reasoning controls, streaming, image payloads and error semantics are all compatible.

Runtime source:
- https://github.com/IDAH-BITBOX/serve-mlx
- https://github.com/srcterm/streamlx

## 4. Candidate ranking (qualification priority, not final quality ranking)

| Candidate | Strength | Material limitation | Current role |
|---|---|---|---|
| Qwen3.6-35B-A3B 4-bit | 3B active; native vision; agentic coding/tool template; Qwen3.6 VLM streaming server path | 16 GiB exact 4-bit VLM peak and DSH end-to-end path untested | **First source/runtime audit** |
| Kimi Linear 48B-A3B 4-bit | Exact header/shell audit completed; lower static expert pool floor; text reasoning pilot candidate | Text-only checkpoint; CUA direct screenshots require a separate image-capable route or OCR/AX-only workflow | Text-first fallback candidate |
| Qwen3.5-122B-A10B TurboQuant 3-bit | Higher-capability stretch target; vision architecture | Separate runtime/quantization path; 16 GiB cache/quality/DSH co-residency evidence insufficient; not best first value/risk tradeoff | Defer; no download |

The Qwen3.5-9B dense VLM remains a lower-complexity control/fallback candidate, not a second resident model. Existing Qwen3.5-4B remains a measured baseline; do not co-reside it with the primary model during initial acceptance.

## 5. One-model operating policy

- One local model checkpoint/process at a time; inference concurrency 1.
- No model fan-out, no simultaneous local vision model, no MTP/draft path and no wired-memory dependency in the first acceptance profile.
- Prefer AX tree, browser DOM and OCR before screenshots; use one bounded screenshot or region-of-interest only when structured observations are insufficient.
- DSH should call the local model through a loopback-only custom provider; no external exposure.
- Load the model when a task batch begins; keep it resident while useful work is actively progressing; unload after a measured idle grace period or when the user resumes memory-heavy desktop work / host pressure crosses the stop threshold. The exact idle grace and pressure threshold must be calibrated, not guessed.
- Agent-owned tabs, windows and child processes must be tracked and closed after the task. Do not terminate user-owned applications or arbitrary system processes.
- DSH and its permission/control layer remain available; the model weights need not stay resident 24/7.
- Keep the cloud model in a low-frequency chief-of-staff / audit role, not as the default reasoning dependency.

## 6. Next qualification sequence

1. Run the new read-only Qwen3.6 4-bit Safetensors header audit. It uses HTTP Range for index and shard headers only and must fail closed if the server does not return verified partial content.
2. Calculate exact routed expert bytes, per-layer top-8 floor, non-expert shell, vision tensor bytes, and 1/2/3 GiB cache envelopes.
3. Audit the exact `serve-mlx` release/commit and whether the pinned 4-bit checkpoint is supported in `--vision` mode; verify image processor, vision tower, chat template, function-call parser and OpenAI request schema.
4. Build a static 4/8K memory envelope with shell, expert cache, recurrent/attention state, 2 GiB vision scratch reserve, runtime/allocator and a measured non-model reserve.
5. Only after static gates pass, prepare an isolated local server profile and test DSH custom-provider text, tool-call, image, streaming and unload/reload behavior. Do not edit the production DSH profile for this test.
6. Approve a bounded host smoke test only after the user sees the static results and the stop conditions.

## 7. Decision boundary

Qwen3.6-35B-A3B is the **first candidate to qualify**, not yet the final deployed model. If its exact vision shell or DSH integration fails the 16 GiB envelope, reconsider Kimi with an explicit AX/OCR-first perception design or the dense Qwen3.5-9B VLM. Do not jump automatically to 122B.

No weight download, runtime installation, model execution, service restart, process termination or production configuration change is authorized by this review.


### G6.3 audit run 1 — 2026-11-20

The first Mac mini run successfully read the config, index, and all four Safetensors shard headers with verified HTTP Range responses. The index declared 20,401,929,952 tensor bytes across four shards (about 19.0008 GiB of serialized tensor payload; this is not a RAM requirement). No tensor payloads were downloaded.

The run failed closed at MoE layer classification: the script expected the key prefix `language_model.model.layers.N.mlp.experts.*`, while Qwen3.6 checkpoint naming also uses `model.language_model.layers.N.mlp.experts.*` (as seen in the upstream Qwen3.6 index). The model's MoE structure was not disproved; only the script's name matcher failed.

Patch applied to `g6.3-qwen36-vision-header-audit.py`:
- accept `model.language_model.layers.N`, `language_model.layers.N`, `language_model.model.layers.N`, and `model.language_model.model.layers.N` prefixes;
- keep `mtp.layers.N` outside the routed language-model expert pool;
- if classification still fails, print up to 20 actual `.mlp.experts.` tensor keys to make the next diagnosis evidence-based.

A synthetic regex check passed for all supported prefixes and excluded `mtp.layers.0`. This is a code-level check only; the patched audit has **not yet been rerun against the remote Safetensors headers**. The audit remains incomplete until the user reruns it and it passes exact index/header accounting, all expected MoE layers, vision tensor classification and byte totals.


## 8. G6.3 header audit: actual MLX expert layout identified — 2026-11-20

The first audit failed because the classifier expected raw per-expert keys under `*.mlp.experts.N.*`. The second run still failed after a prefix-only regex adjustment; its diagnostic sample was empty. That was not evidence of missing experts. It showed the key-family assumption was wrong.

The pinned MLX checkpoint uses stacked expert projections under:
- `language_model.model.layers.N.mlp.switch_mlp.gate_proj.{weight,scales,biases}`
- `language_model.model.layers.N.mlp.switch_mlp.up_proj.{weight,scales,biases}`
- `language_model.model.layers.N.mlp.switch_mlp.down_proj.{weight,scales,biases}`

This is consistent with the pinned checkpoint's published index excerpt and mlx-lm's Qwen3.5/3.6 sanitize tests: Qwen3.6 fused expert tensors are normalized into the stacked `switch_mlp` representation. The leading dimension is the expert axis; the audit must validate it equals 256 before dividing tensor bytes by 256.

Updated script:
`scripts/mac/g6.3-qwen36-vision-header-audit.py`
- recognizes the three `switch_mlp` projections and `weight/scales/biases` fields;
- requires all 40 configured layers, all three projections and all three affine quantization fields per projection;
- verifies each tensor's leading dimension is 256 and byte count is divisible by 256;
- treats MTP tensors separately as optional bytes rather than routed backbone experts;
- fails closed on unknown `switch_mlp` or unexpected non-stacked backbone expert keys.

Code-level regex samples passed for the pinned index prefix and alternate MLX prefix; MTP names are not captured as backbone experts. This was the pending status at the time of that note. It was superseded by the successful Mac mini run recorded in Section 9.

The model config declares `mtp_num_hidden_layers=1`; the subsequent exact header run found zero MTP tensors in this pinned checkpoint. See Section 9.


## 9. G6.3 Qwen3.6 exact header audit — PASS (Mac mini run, 2026-11-20)

User executed the corrected read-only audit against the pinned artifact:

- Repo: `mlx-community/Qwen3.6-35B-A3B-4bit`
- Revision: `38740b847e4cb78f352aba30aa41c76e08e6eb46`
- Four shard headers read via HTTP Range; no Safetensors tensor payloads downloaded.
- 2,090 tensor keys; 274,319 header bytes fetched.
- Header tensor-byte sum: 20,401,929,952 bytes, exactly matching the index declaration (19.000778 GiB).
- Routed expert layout: stacked `switch_mlp[256,...]`.
- 360 routed expert tensors = 40 layers × 3 projections × 3 affine quantization fields.
- Routed expert bytes: 18,119,393,280 bytes (16.875000 GiB).
- Non-expert bytes: 2,282,536,672 bytes (2.125778 GiB).
- Vision: 333 tensors, 893,142,496 bytes (0.831804 GiB).
- Non-vision shell: 1,389,394,176 bytes (1.293974 GiB).
- MTP tensors: 0.
- Every one of 40 MoE layers has exactly 1,769,472 bytes per expert bundle; top-8 floor is 566,231,040 bytes (540 MiB / 0.527344 GiB) per token across all layers.

**G6.3 exact header accounting is PASS.** This does not mean the 16 GiB runtime memory envelope or end-to-end VLM/DSH path has passed. No runtime was installed and no model was loaded.

### 9.1 Static cache-capacity arithmetic

Assuming the runtime cache budget is in GiB and one complete expert bundle occupies 1,769,472 bytes:

| Expert cache | Whole bundles (floor) | Average bundles/layer | Fraction of 16.875 GiB expert pool |
|---:|---:|---:|---:|
| 2 GiB | 1,213 | 30.325 | 11.85% |
| 3 GiB | 1,820 | 45.500 | 17.78% |
| 4 GiB | 2,427 | 60.675 | 23.70% |

These are capacity equivalents, not predicted cache hit rates. Real hit rate depends on router locality, expert popularity, per-layer eviction policy, and prefetch. Uniform per-layer allocations of 30/45/60 experts consume 1.977539/2.966309/3.955078 GiB respectively.

### 9.2 Config-derived sequence-state estimate

The pinned config specifies 40 layers, 10 full-attention layers (every fourth layer), 30 linear-attention layers, 2 KV heads, head dimension 256, BF16 model dtype, 32 linear value heads, key/value head dimensions 128, and linear convolution kernel 4.

Using those values and the inspected MLX-LM Qwen3.5/3.6 implementation:
- Full-attention K/V cache estimate: 80 MiB at 4K, 160 MiB at 8K (batch 1, BF16 K and V).
- Gated-delta recurrent state: 60 MiB (30 × 32 × 128 × 128 × 4 bytes, FP32 state).
- Linear-attention convolution state: 1.40625 MiB (30 × 3 × 8,192 × 2 bytes, BF16 input dtype).
- Combined state estimate: 0.138092 GiB at 4K and 0.216217 GiB at 8K.

These are configuration/source-derived state sizes, not measured runtime peaks. They exclude prefill activations, attention scratch, image-token scratch, allocator fragmentation, runtime overhead, and any implementation-specific copies.

### 9.3 TS900 sequential-read screen

The one-token all-cold Top-8 expert payload is 540 MiB. At the previously measured 834.7 MiB/s sequential `F_NOCACHE` read baseline, the idealized payload-transfer time is 0.647 seconds, or 1.546 tokens/s if every token incurred a full cold Top-8 read and there were no compute/transfer overlap or other overhead.

This is only a sequential-bandwidth screen, not a tokens/s forecast. Each token selects 320 expert bundles (8 × 40); each bundle is represented by nine projection/quantization tensor slices, so there can be up to 2,880 logical slice ranges before adjacent-range merging. The 540 MiB is cumulative full-miss read volume across the token, not a claim that all 540 MiB must be simultaneously resident. Actual span sizes, random-read amplification, cache misses, prefetch waste and I/O/Metal overlap remain G6.4 measurements.

### 9.4 Preliminary 16 GiB admission screen — NOT A PASS

The 2026-11-20 16:00 host snapshot showed 51% system-wide free percentage and 817.62 MB swap in use. Treating 51% of 16 GiB (8.16 GiB) only as a coarse available-memory proxy, and reserving 2 GiB for vision scratch, the model-side arithmetic is:

| Cache | 4K shell + cache + state + 2 GiB vision scratch | Coarse remainder from 8.16 GiB | 8K coarse remainder |
|---:|---:|---:|---:|
| 2 GiB | 6.264 GiB | 1.896 GiB | 1.818 GiB |
| 3 GiB | 7.264 GiB | 0.896 GiB | 0.818 GiB |
| 4 GiB | 8.264 GiB | -0.104 GiB | -0.182 GiB |

The remainder must still cover runtime/allocator, prefill scratch beyond the vision reserve, measurement uncertainty and the safety margin. The memory_pressure percentage is not an exact free-byte counter, so this is a screening calculation, not an admission result.

**Current decision:** do not start with 4 GiB cache on the recorded host state. Keep 3 GiB as the intended comparison target, but treat it as tight until a fresh baseline and runtime/allocator reserve are measured. A 2 GiB cache is the safer first candidate for a future isolated pilot. No model download, runtime installation, model load, service restart, process termination, or production DSH/MCP change is authorized by this audit.

### 9.5 G6.3 exit state

- Exact pinned config/index/header accounting: **PASS**
- Exact routed expert and non-expert byte totals: **PASS**
- Exact vision tensor byte total: **PASS**
- MTP tensor presence in this checkpoint: **NONE**
- 16 GiB static admission: **PROVISIONAL / NOT PASS**
- Actual 4K/8K runtime peak: **NOT MEASURED**
- TS900 expert-span I/O / cache hit / overlap: **NOT MEASURED**
- DSH OpenAI-compatible tool/image round trip: **NOT TESTED**


## 10. serve-mlx source compatibility audit — STRUCTURAL MATCH / EXACT CHECKPOINT NOT YET QUALIFIED

Inspected public source at `IDAH-BITBOX/serve-mlx` main commit `d7021c9d6e66afbcf013b6a1b87431236b2d08f9` (package version `0.1.0a7`, Apache-2.0). It is pre-release software and its README's Qwen3.6 end-to-end examples use the 8-bit checkpoint on an M4 MacBook Pro with 24 GiB, not this exact 4-bit checkpoint on the PACS 16 GiB Mac mini.

Positive source-level matches:
- `storage/safetensors_store.py` has a `qwen3_5_moe` layout matching `language_model.model.layers.N.mlp.switch_mlp.{gate_proj,up_proj,down_proj}.{weight,scales,biases}`.
- The manifest builder reads the leading expert axis and splits each of the nine tensor fields into exact per-expert byte spans; this matches the PACS header audit's 40 × 256 × 9 structure.
- The VLM loader accepts `qwen3_5_moe`, constructs the VLM shell without materializing the expert banks, retains vision tower/projector/router/shared/dense weights in Unified Memory, replaces routed MoE blocks with the streaming runtime, and loads the Qwen3-VL processor.
- The README documents OpenAI-compatible chat, SSE, compatible-template function calling, reasoning output and Qwen3.6 image chat.

Important runtime defaults for vision mode:
- `--vision` defaults resident expert cache to `off`.
- VLM scratch reserve is at least 2 GiB.
- VLM prefill step defaults to 256 tokens.
- The documented 16 GB starting profile uses no resident expert cache, automatic memory safety margin, 4-bit KV cache, a bounded prompt, and 256-token prefill chunks.
- On a 16 GiB host, automatic memory safety margin is documented as 4 GiB. These defaults are more conservative than a 3 GiB resident expert cache.

Open qualification gates:
1. **Config schema: CLOSED — PASS.** The Mac mini read-only config check at the pinned revision returned `model_type=qwen3_5_moe`, `text_config_source=top_level`, `top_level_text_config=True`, and `quantization_text_config=False`; the top-level text config contains 40 layers, 256 experts, and top-8 routing. This exactly matches serve-mlx's `_text_config()` path for `qwen3_5_moe`; no config-schema patch is required. The same check returned 4-bit/group-64 quantization and 80 explicit per-layer quantization keys (for each of 40 layers: `mlp.gate` and `mlp.shared_expert_gate`). The inspected `_quantize_shell()` looks up full module paths in the quantization map and strips a leading `language_model.` as a fallback, so these path forms are supported at source level. The actual VLM `nn.quantize()` execution and resulting module tree have not yet been runtime-tested. This is a source-level concern, not yet a confirmed failure.
2. **Exact 4-bit VLM:** no end-to-end test of this pinned 4-bit checkpoint and vision path was found in the inspected test tree. Existing tests exercise small synthetic text-family adapters; README validation is 8-bit Qwen3.6 on 24 GiB.
3. **Host memory:** runtime-reported shell bytes, startup peak, allocator/scratch peak, and real 4K/8K VLM memory have not been measured on this Mac mini.
4. **DSH protocol:** actual DSH tool-call, streaming, image and unload/reload round trips remain untested.

Current disposition: serve-mlx is the strongest source-level runtime candidate for this VLM, but exact checkpoint qualification is **PARTIAL**. The config-schema gate is closed; exact 4-bit VLM execution, host-memory admission, and DSH protocol remain open. Do not install it, download weights, run `prepare` against a remote model ID, or change DSH/MCP production settings until those remaining gates are explicitly authorized and resolved.


### 10.1 Runtime memory semantics relevant to the cache table

The inspected `serve-mlx` runtime has two distinct modes:
- `NoCacheExpertRuntime`: each route group reads and materializes one expert bundle from SSD, executes it, and does not retain a resident expert cache.
- `CachedExpertRuntime`: a global byte-budgeted LRU retains expert bundles; active bundles are pinned during execution.

Therefore the 0.527344 GiB Top-8 figure is the cumulative full-miss bytes across all 40 layers for one token. It is **not** a mandatory simultaneous resident-memory floor for `serve-mlx` no-cache mode. A single bundle is 1.6875 MiB; the actual peak also depends on execution temporaries and overlap. The earlier streamlx per-layer pool-floor rule remains specific to that runtime's slot-pool design and must not be blindly applied to serve-mlx.

For the VLM path, serve-mlx defaults to `resident-budget off`, at least 2 GiB VLM scratch reserve, and 256-token prefill. This makes a no-cache correctness baseline the lowest-risk first runtime profile; resident-cache A/B should follow only if the measured memory budget permits.


### 10.2 Pinned config-schema confirmation — PASS (Mac mini, 2026-11-20)

The user ran the read-only config check against the same pinned revision and returned:

- `model_type=qwen3_5_moe`
- `text_config_source=top_level`; `top_level_text_config=True`
- `quantization_text_config=False`
- `num_hidden_layers=40`, `num_experts=256`, `num_experts_per_tok=8`
- `quantization_bits=4`, `quantization_group_size=64`
- `quantization_keys` contains 80 explicit per-layer module entries: `language_model.model.layers.N.mlp.gate` and `language_model.model.layers.N.mlp.shared_expert_gate` for N=0..39, plus global bits/group_size/mode.

This closes the earlier manifest-schema concern: serve-mlx's `_text_config()` reads top-level `text_config` for `qwen3_5_moe`, which is exactly where this checkpoint places it. No config compatibility patch is required.

The inspected `_quantize_shell()` uses the checkpoint's `quantization` object, looks up the full module path, and has a fallback that strips the leading `language_model.`. Thus the returned per-layer key naming is supported by the source-level lookup contract. This is **not** proof that the pinned VLM's instantiated module paths and MLX-VLM quantization behavior succeed at runtime; that remains a runtime qualification gate.

No weights were downloaded; no package was installed; no model or service was started; no DSH/MCP production setting was changed.


### 10.3 Per-layer quantization-rule coverage — PASS (Mac mini, 2026-11-20)

The user ran the standalone read-only audit against the pinned config and returned:

- `per_layer_rule_count=80`
- `expected_rule_count=80`
- `missing_rule_count=0`
- Global quantization: `bits=4`, `group_size=64`, `mode=affine`
- Four printed boundary entries (layer 0 and layer 39, `mlp.gate` and `mlp.shared_expert_gate`) each return `{group_size:64,bits:8}`.

This proves exact key coverage and the complete value distribution: all 80 rules are `(bits=8, group_size=64, mode=affine)`. No per-layer rule is missing or extra.

Source inspection at serve-mlx commit `d7021c9d6e66afbcf013b6a1b87431236b2d08f9` confirms the VLM path calls `_quantize_shell(model, mlx_nn, source_config, weights)` after VLM weight sanitization and before strict weight loading. `_quantize_shell()` reads global bits/group_size/mode, checks full module paths in the per-layer quantization map (with a fallback stripping the leading `language_model.`), and returns each matching per-layer dict to `mlx.nn.quantize`'s `class_predicate`. This is a source-level compatibility match for the returned key format, not an executed proof that all actual MLX-VLM module paths match at runtime.

No package was installed, no weights downloaded, no model loaded, and no DSH/MCP production setting changed.


### 10.4 Complete quantization + upstream VLM architecture audit — PASS at source/config level; runtime remains open

The Mac mini's next read-only config audit returned the complete distribution:

- Expected 80 / actual 80 / missing 0 / extra 0.
- All 80 per-layer rules: `(8-bit, group_size=64, affine)`.
- Global rule: `(4-bit, group_size=64, affine)`.

The MLX 0.32 API contract supports this exact pattern: `mlx.nn.quantize` accepts a `class_predicate` returning either a boolean or a parameter dictionary passed to `to_quantized`; `mlx.nn.Linear.to_quantized` defaults to `mode="affine"`. Therefore the per-layer dictionaries' omitted `mode` inherit affine, matching the checkpoint. This is API/source evidence, not a runtime load result.

Upstream MLX-VLM source checks:
- `mlx_vlm.models.qwen3_5_moe.language` defines a distinct sparse Qwen3.5-MoE path. `Qwen3_5MoeSparseMoeBlock` contains `gate`, `switch_mlp` (backed by `SwitchGLU`), `shared_expert`, and `shared_expert_gate`; both gate modules are MLX Linear layers. These names correspond to the checkpoint's 80 quantization keys and the serve-mlx VLM replacement adapter.
- `mlx_vlm.models.qwen3_5_moe.__init__` exports `Model`, `LanguageModel`, `VisionModel`, and registers `Qwen3VLProcessor` for `qwen3_5_moe`. serve-mlx's Qwen3.5-MoE VLM path imports the same language module, temporarily replaces its `SwitchGLU` constructor with a no-weight stub during shell creation, then replaces all 40 sparse blocks with streamed blocks. The CLI's `--vision` flag is passed through to this VLM path.
- The separate upstream issue about dense `qwen3_5` MLPs (#1073) is not the same code path as the dedicated `qwen3_5_moe` sparse module; do not conflate them.
- The Qwen3.6 nested vision-weight remapping fix was merged upstream as MLX-VLM PR #1179 on 2026-05-13 and was included in the v0.6.0 release. serve-mlx declares `mlx-vlm>=0.6.15`, so its declared minimum is newer than that fix. However, the dependency is open-ended and the exact resolved version is not yet locked or tested.
- Existing serve-mlx integration tests exercise tiny synthetic text-family adapters. The inspected test tree does not contain an end-to-end Qwen3.6 VLM shell/image test. Exact 4-bit VLM sanitization, vision-tower population, and generation therefore remain runtime qualification gates.

Memory policy confirmed in serve-mlx source and README:
- `--vision` defaults resident expert cache to off, reserves at least 2 GiB transient scratch, and defaults prefill chunks to 256 tokens.
- The documented 16 GiB VLM starting profile uses no resident expert cache, automatic safety margin, 4-bit KV cache, bounded prompt/output, and 256-token prefill. This is consistent with the PACS single-model/no-wired-memory objective. Do not force the previous 3 GiB cache target into the first VLM smoke test.
- The Qwen3.6 VLM processor path uses the Qwen3-VL processor, consistent with the upstream Qwen3.5-MoE model package registration.

A follow-up version of `g6.3-qwen36-vision-header-audit.py` was committed to print vision tensor dtype counts, module component counts, leaf-field counts, and a small tensor sample. This remains header-only; no tensor payloads are fetched. It will establish whether the 333 vision tensors are BF16 or quantized before memory admission.

**Current gate status:** exact config + all 80 quantization values + upstream sparse module names = PASS. Actual MLX-VLM/MLX runtime execution, vision tensor dtype output, host memory admission, and DSH tool/image round trip = NOT TESTED. No package install, checkpoint download, model load, or production DSH/MCP change occurred.
