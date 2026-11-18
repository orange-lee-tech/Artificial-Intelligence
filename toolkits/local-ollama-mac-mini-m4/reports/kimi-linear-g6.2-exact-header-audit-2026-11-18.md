# Kimi Linear G6.2 Exact Header Audit — 2026-11-18

**Host:** Mac mini M4 / 16 GiB unified memory / macOS 26.2  
**Checkpoint:** `mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit`  
**Immutable revision:** `919175d75427f1c10cfc17e7254b53295edddf72`  
**Evidence:** User-executed PACS header-only audit script; output supplied in project conversation  
**Scope:** Config + Safetensors index + six Safetensors headers via HTTP Range. No tensor payloads downloaded.

## 1. Result

**PASS — exact index-to-header key coverage and exact stored tensor-byte accounting.**

- Config: `kimi_linear`, 27 layers, 256 routed experts, top-8, first dense layer 0 / MoE layers 1–26.
- Quantization: affine 4-bit, group size 64; per-layer router gate overrides are 8-bit.
- Safetensors index: 125,538 bytes; metadata `total_size=27,641,073,664`.
- Six shard headers read; 165,621 header bytes fetched.
- All 1,393 tensor names in the index matched the combined shard headers exactly.
- No model tensor payload was downloaded.

## 2. Exact byte accounting

| Component | Exact bytes | GiB |
|---|---:|---:|
| All indexed tensors | 27,641,073,664 | 25.742756 |
| Routed `switch_mlp` expert tensors | 26,499,612,672 | 24.679688 |
| Non-`switch_mlp` tensors | 1,141,460,992 | 1.063068 |
| Top-8 minimum expert slot floor, all 26 MoE layers | 828,112,896 | 0.771240 |

There are 234 routed expert tensors: 26 MoE layers × 3 projections (gate/up/down) × 3 affine-quantization parts (weight/scales/biases).

Every routed expert tensor has a leading expert dimension of 256. Every MoE layer has the same exact per-expert bundle size:

`3,981,312 bytes`

Each layer's top-8 floor is:

`3,981,312 × 8 = 31,850,496 bytes`

Across 26 layers:

`31,850,496 × 26 = 828,112,896 bytes = 0.771240 GiB`

This replaces the earlier shape-derived estimate. It is a lower-bound slot floor, not total model memory or a measured runtime peak.

## 3. Runtime source cross-check

Pinned source revisions inspected:

- streamlx: `srcterm/streamlx@af9bbe88439212464e5f4cccfa91df75172056b1` (2026-11-17).
- MLX-LM: `ml-explore/mlx-lm@v0.32.1`.

The MLX-LM Kimi implementation confirms:

- `KimiSparseMoE` owns `gate`, `switch_mlp`, and `shared_experts`.
- Kimi's decoder exposes `model.layers`; the first layer is dense and layers 1–26 use `KimiSparseMoE`.
- Its sanitizer maps upstream expert tensors to the stacked `model.layers.N.mlp.switch_mlp.{gate_proj,up_proj,down_proj}` keys found in the audited checkpoint.
- `make_cache()` uses `ArraysCache(size=4)` for KDA layers and `KVCache()` for MLA layers.

The streamlx generic path:

1. Calls `mlx_lm.load(..., lazy=True)`.
2. Finds MoE blocks through `layer.mlp.switch_mlp`.
3. Replaces each routed `switch_mlp` with a streaming wrapper before evaluating model parameters.
4. Calls `mx.eval(model.parameters())` for the remaining trunk.
5. Allocates each layer's expert pool separately; `pool_floor()` is the sum of per-layer minimum slots.

Therefore, the exact 1.063068 GiB non-`switch_mlp` checkpoint payload is the source-derived trunk-weight byte count expected to be materialized by this loader path. It includes non-routed weights such as the shared expert and router. It is not the whole runtime shell footprint: MLX objects, transformed tensors, allocator/Metal overhead and temporary load buffers remain additional.

### Important validation correction

The inspected streamlx README/model table at the pinned commit does **not** explicitly list Kimi Linear as an end-to-end validated checkpoint. The earlier project wording that said streamlx explicitly validates or lists `kimi_linear` was too strong and is corrected by this update.

The evidence supports a **generic structural match**, not an upstream Kimi-specific end-to-end validation:

- MLX-LM v0.32.1 contains `mlx_lm.models.kimi_linear`.
- Kimi's MoE block uses the exact stacked `switch_mlp` structure expected by streamlx.
- streamlx's generic loader recognizes and wraps that structure.

A PACS isolated correctness run is still required before claiming runtime acceptance.

### Top-k config-key compatibility

The audited Kimi config uses `num_experts_per_token=8`. The inspected streamlx `_routed_topk()` helper reads `num_experts_per_tok`, so for this checkpoint it falls back to its default value 8. The values coincide, but a future controlled invocation must pass `k=8` explicitly rather than relying on the fallback.

## 4. Actual pool allocation at 2 / 3 / 4 GiB budgets

At the pinned streamlx code, each layer receives:

`slots = max(k, int(budget_bytes / moe_layer_count / one_expert_bytes))`

The actual allocated pool is therefore quantized to whole expert slots per layer:

| Requested pool budget | Slots per MoE layer | Actual pool bytes | Actual pool GiB |
|---:|---:|---:|---:|
| 2 GiB | 20 | 2,070,282,240 | 1.928101 |
| 3 GiB | 31 | 3,208,937,472 | 2.988556 |
| 4 GiB | 41 | 4,244,078,592 | 3.952606 |

All three are above the 8-slot minimum (0.771240 GiB). The requested budget is a cap/target; integer slot rounding leaves a small amount unused.

## 5. Kimi-only provisional static envelope

This table is a planning envelope, not a measured runtime result. It deliberately models **one large local model only**. Qwen3.5-4B remains installed as a sequential fallback/control but is not co-resident during a Kimi run. Granite is not included.

Fixed provisional items (Kimi 4K state updated after source inspection of MLX-LM v0.32.1):

| Item | GiB | Evidence class |
|---|---:|---|
| Non-`switch_mlp` trunk tensor payload | 1.063068 | Exact checkpoint header bytes; expected materialized trunk |
| Kimi 4K KDA/MLA state | 0.073 | Source-derived conservative cap: 40 MiB FP32 KDA state + 31.5 MiB 16-bit MLA KV + up to 2.813 MiB KDA conv state; runtime activation dtype/allocator not measured |
| Kimi runtime base | 0.50 | Engineering cap, not measured |
| MLX freed-buffer allocator cache | 0.25 | Engineering cap, not measured |
| RAM prompt-prefix cache | 0.25 | Engineering cap, not measured |
| Active prefill/decode/startup scratch | 0.75 | Engineering peak cap, not measured |
| macOS + DSH + desktop/user apps reserve | 5.00 | Provisional whole-host reserve; not yet proven by baseline |
| Uncommitted safety headroom | 1.50 | Policy reserve |

| Expert-pool target | Model-side subtotal | Planned total incl. 5 GiB host + 1.5 GiB safety | Additional unallocated |
|---:|---:|---:|---:|
| 2 GiB target (1.928101 actual) | 4.814169 GiB | 11.314169 GiB | 4.685831 GiB |
| 3 GiB target (2.988556 actual) | 5.874624 GiB | 12.374624 GiB | 3.625376 GiB |
| 4 GiB target (3.952606 actual) | 6.838674 GiB | 13.338674 GiB | 2.661326 GiB |

Interpretation:

- All three configurations fit this **static arithmetic** under the provisional 5 GiB non-model reserve and explicit scratch/cache caps.
- The 5 GiB reserve is not yet validated. The host snapshot's 57% system-wide free percentage cannot be converted directly into model-allocatable GiB.
- The host snapshot reported 470.50 MB current swap and about 4.22 GiB physically occupied by compressor. A second time-separated snapshot is required to see whether swap and compressor pressure are still growing.
- The 4 GiB pool has the largest cache headroom but is not automatically the best choice. Cache hit rate, prefill scratch, actual MLX active/peak memory, Metal footprint and system pressure must be measured.
- The first hardware pilot, if separately approved, should start at 2 GiB expert-pool target, 4K context, concurrency 1, explicit `k=8`, no MTP/draft, no other model resident, and `STREAMLX_KEEPALIVE=0`. Increase to 3/4 GiB only after the 2 GiB run passes memory and correctness gates.

## 6. Remaining gates

1. The [Kimi shell breakdown script](../scripts/mac/g6.2-kimi-shell-breakdown.py) has now run successfully: all nine non-routed categories sum exactly to 1,141,460,992 bytes; the seven MLA `kv_b_proj` layers contain 16,515,072 bytes (15.75 MiB) of original quantized tensors.
2. Confirm actual activation dtype and measured sanitizer transient, 4K/8K KDA/MLA cache allocation and MLX/Metal peak in an isolated runtime.
3. The second host snapshot is recorded. It shows no new swapouts in the 15:39–18:30 interval, but compressor occupancy rose by 190.86 MiB; an optional third sample can establish whether that rise plateaus under unchanged workload.
4. Verify the installed local Python/MLX environment is separate from production and can meet the pinned streamlx/MLX-LM dependency set without touching Ollama or DSH.
5. Only after the above, propose an isolated, separately authorized correctness/memory pilot.

## 7. Current disposition

- Exact Kimi checkpoint index/header accounting: **PASS**.
- Exact routed-expert bytes and 26-layer top-8 slot floor: **PASS**.
- Exact non-routed checkpoint tensor bytes: **PASS**.
- Kimi generic streamlx structural match: **SOURCE-VERIFIED / NOT END-TO-END VALIDATED**.
- Runtime shell peak, sanitizer transient, KDA/MLA cache peak: **NOT MEASURED**.
- 16 GiB host admission: **STATIC CONDITIONAL ONLY**.
- Model download, runtime installation, model execution, production configuration change: **NOT AUTHORIZED / NOT PERFORMED**.

## 8. Pinned source references

- Kimi MLX checkpoint: https://huggingface.co/mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit/tree/919175d75427f1c10cfc17e7254b53295edddf72
- MLX-LM v0.32.1 Kimi implementation: https://github.com/ml-explore/mlx-lm/blob/v0.32.1/mlx_lm/models/kimi_linear.py
- streamlx pinned integration: https://github.com/srcterm/streamlx/blob/af9bbe88439212464e5f4cccfa91df75172056b1/streamlx/integrate.py
- streamlx pinned pool: https://github.com/srcterm/streamlx/blob/af9bbe88439212464e5f4cccfa91df75172056b1/streamlx/pool.py
- streamlx pinned Safetensors index: https://github.com/srcterm/streamlx/blob/af9bbe88439212464e5f4cccfa91df75172056b1/streamlx/stindex.py
- PACS header audit script: https://github.com/orange-lee-tech/Artificial-Intelligence/blob/pacs/local-model-toolkit-m4-16gb/toolkits/local-ollama-mac-mini-m4/scripts/mac/g6.2-kimi-header-audit.py


## 9. Exact non-routed module breakdown — 2026-11-18

**PASS:** the user ran `g6.2-kimi-shell-breakdown.py` against the same pinned checkpoint. It repeated the index/header audit and reported nine non-routed categories. Their exact sum is `1,141,460,992 bytes`, exactly matching the non-`switch_mlp` total.

| Category | Tensors | Exact bytes | MiB | GiB |
|---|---:|---:|---:|---:|
| `attention_other` | 730 | 544,366,080 | 519.148 | 0.506980 |
| `embedding` | 3 | 212,336,640 | 202.500 | 0.197754 |
| `output_head` | 3 | 212,336,640 | 202.500 | 0.197754 |
| `shared_experts` | 234 | 103,514,112 | 98.719 | 0.096405 |
| `mla_kv_b_proj_sanitize` | 21 | 16,515,072 | 15.750 | 0.015381 |
| `moe_router` | 104 | 16,307,200 | 15.552 | 0.015187 |
| `other_non_routed` | 9 | 35,831,808 | 34.172 | 0.033371 |
| `layer_norms` | 54 | 248,832 | 0.237 | 0.000232 |
| `final_norm` | 1 | 4,608 | 0.004 | 0.000004 |
| **Total** | **1,159** | **1,141,460,992** | **1,088.535** | **1.063068** |

### MLA `kv_b_proj` sanitizer input

The audit found 21 tensors across the seven MLA layers (3, 7, 11, 15, 19, 23, 26):

- Per layer: `weight [8192,64] U32 = 2,097,152 bytes`; `scales [8192,8] BF16 = 131,072 bytes`; `biases [8192,8] BF16 = 131,072 bytes`.
- Per layer total: 2,359,296 bytes (2.25 MiB).
- Seven-layer total: **16,515,072 bytes (15.75 MiB)**.

Pinned MLX-LM v0.32.1 `KimiLinear.sanitize()` confirms that this is not a pass-through: it removes the packed weight/scales/biases, calls `mx.dequantize()`, reshapes the result, splits and makes contiguous `wk`/`wv` arrays, then calls `mx.quantize()` again and emits `embed_q` and `unembed_out` weights plus new scales/biases. Source: https://github.com/ml-explore/mlx-lm/blob/v0.32.1/mlx_lm/models/kimi_linear.py

The 15.75 MiB figure is the exact **input checkpoint payload**, not the conversion peak. Dequantized intermediates, contiguous copies, requantized outputs, lazy graph lifetime and allocator behavior are not measured by a header-only audit. Do not use 15.75 MiB as the startup scratch allowance.

## 10. Host operational follow-up — 2026-11-18 18:30 CST

The second user-provided snapshot is compared with the first capture at 15:39 CST:

| Metric | 15:39 | 18:30 | Change |
|---|---:|---:|---:|
| System-wide free percentage | 57% | 56% | -1 pp |
| Current swap used | 470.50 MB | 446.50 MB | -24.00 MB |
| Free pages | 9,106 | 10,352 | +1,246 pages (+19.47 MiB) |
| Wired pages | 153,700 | 149,110 | -4,590 pages (-71.72 MiB) |
| Pages occupied by compressor | 276,479 | 288,694 | +12,215 pages (+190.86 MiB) |
| Cumulative swapins | 44,582 | 46,423 | +1,841 pages (+28.77 MiB) |
| Cumulative swapouts | 102,568 | 102,568 | **No increase** |
| Cumulative pageouts | 67,561 | 70,520 | +2,959 pages (+46.23 MiB) |

At 18:30, compressor occupancy was 4.405121 GiB, wired pages 2.275238 GiB and raw free pages 161.75 MiB. The 56% system-wide free percentage is not directly model-allocatable memory.

**Interpretation:** no new swapouts were observed and current swap use fell during this interval. Compressor occupancy nevertheless rose by about 191 MiB and free percentage fell one point. This does not show active swap-out growth, but it also does not establish a compressor plateau or validate the 5 GiB non-model reserve. Pageouts are a different cumulative counter from swapouts.

Full second-snapshot evidence: [Host Operational Follow-up](host-operational-followup-2026-11-18-1830.md).

