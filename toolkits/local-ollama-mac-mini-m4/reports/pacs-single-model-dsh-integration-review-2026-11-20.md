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

Code-level regex samples passed for the pinned index prefix and alternate MLX prefix; MTP names are not captured as backbone experts. This is not yet a successful remote header audit. The corrected script must be rerun on the Mac mini; no memory envelope is valid until it passes exact index/header coverage, shape validation, all-layer/projection checks, and total byte reconciliation.

The model config also declares `mtp_num_hidden_layers=1`; this alone does not prove MTP tensors are present. The next audit prints actual MTP tensor count and bytes so the runtime decision can be evidence-based.
