#!/usr/bin/env python3
"""Read-only Qwen3.6 MLX VLM Safetensors header audit. Never downloads tensor payloads."""
import json
import re
import struct
import sys
import urllib.request
from collections import defaultdict

REPO = "mlx-community/Qwen3.6-35B-A3B-4bit"
REV = "38740b847e4cb78f352aba30aa41c76e08e6eb46"
BASE = f"https://huggingface.co/{REPO}/resolve/{REV}"
MAX_SMALL = 2 * 1024 * 1024
MAX_HEADER = 128 * 1024 * 1024
EXPECTED_MODEL_TYPE = "qwen3_5_moe"
EXPECTED_LAYERS = 40
EXPECTED_EXPERTS = 256
EXPECTED_TOP_K = 8
EXPECTED_BITS = 4
EXPECTED_GROUP_SIZE = 64

def get_small(path, limit):
    req = urllib.request.Request(
        f"{BASE}/{path}",
        headers={"User-Agent": "PACS-G6.3-readonly-audit/1.0",
                 "Accept-Encoding": "identity"},
    )
    with urllib.request.urlopen(req, timeout=45) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise RuntimeError(f"{path} exceeds safety limit ({limit} bytes)")
    return data

def get_range(path, start, end):
    req = urllib.request.Request(
        f"{BASE}/{path}",
        headers={"User-Agent": "PACS-G6.3-readonly-audit/1.0",
                 "Accept-Encoding": "identity",
                 "Range": f"bytes={start}-{end}"},
    )
    with urllib.request.urlopen(req, timeout=45) as response:
        status = getattr(response, "status", response.getcode())
        content_range = response.headers.get("Content-Range", "")
        expected = end - start + 1
        match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", content_range)
        if status != 206 or not match:
            raise RuntimeError(
                f"SAFE ABORT: {path} range {start}-{end} returned HTTP {status}; "
                f"Content-Range={content_range!r}; server did not confirm partial content"
            )
        actual_start, actual_end, total_size = map(int, match.groups())
        if (actual_start, actual_end) != (start, end):
            raise RuntimeError(
                f"SAFE ABORT: unexpected Content-Range for {path}: {content_range!r}"
            )
        data = response.read(expected + 1)
    if len(data) != expected:
        raise RuntimeError(
            f"SAFE ABORT: {path} returned {len(data)} bytes; expected {expected}"
        )
    return data, total_size

def get_cfg_value(config, text_config, key):
    if key in text_config:
        return text_config[key]
    return config.get(key)

def main():
    print("PACS G6.3 Qwen3.6 VLM header-only audit")
    print(f"repo={REPO}")
    print(f"revision={REV}")
    print("mode=HTTP Range only; no Safetensors tensor payloads are downloaded")

    config = json.loads(get_small("config.json", MAX_SMALL))
    text_config = config.get("text_config")
    if not isinstance(text_config, dict):
        # Some MLX-VLM conversions place text fields at the top level.
        text_config = config

    model_type = config.get("model_type")
    if model_type != EXPECTED_MODEL_TYPE:
        raise RuntimeError(f"model_type mismatch: expected {EXPECTED_MODEL_TYPE}, got {model_type!r}")

    num_layers = int(get_cfg_value(config, text_config, "num_hidden_layers") or 0)
    num_experts = int(get_cfg_value(config, text_config, "num_experts") or 0)
    top_k = int(get_cfg_value(config, text_config, "num_experts_per_tok") or 0)
    quant = config.get("quantization") or {}
    bits = quant.get("bits")
    group_size = quant.get("group_size")
    vision_config = config.get("vision_config")

    checks = {
        "num_hidden_layers": (num_layers, EXPECTED_LAYERS),
        "num_experts": (num_experts, EXPECTED_EXPERTS),
        "num_experts_per_tok": (top_k, EXPECTED_TOP_K),
        "quantization.bits": (bits, EXPECTED_BITS),
        "quantization.group_size": (group_size, EXPECTED_GROUP_SIZE),
    }
    print(f"config.architectures={config.get('architectures')}")
    print(f"config.model_type={model_type}")
    print(f"config.num_hidden_layers={num_layers}")
    print(f"config.num_experts={num_experts}")
    print(f"config.num_experts_per_tok={top_k}")
    print(f"config.quantization={json.dumps(quant, sort_keys=True)}")
    if not isinstance(vision_config, dict) or not vision_config:
        raise RuntimeError("vision_config missing; refusing to classify this as a VLM checkpoint")
    print(f"config.vision_config.depth={vision_config.get('depth')}")
    print(f"config.vision_config.hidden_size={vision_config.get('hidden_size')}")
    print(f"config.image_token_id={config.get('image_token_id')}")
    print(f"config.video_token_id={config.get('video_token_id')}")
    for name, (actual, expected) in checks.items():
        if actual != expected:
            raise RuntimeError(f"{name} mismatch: expected {expected}, got {actual!r}")

    index_bytes = get_small("model.safetensors.index.json", MAX_SMALL)
    index = json.loads(index_bytes)
    weight_map = index.get("weight_map")
    if not isinstance(weight_map, dict) or not weight_map:
        raise RuntimeError("Safetensors index has no valid weight_map")
    expected_keys = set(weight_map)
    shards = sorted(set(weight_map.values()))
    declared_total = int(index.get("metadata", {}).get("total_size", -1))
    print(f"index_bytes={len(index_bytes)}")
    print(f"index_metadata_total_size={declared_total}")
    print(f"shard_count={len(shards)}")
    print("shards=" + ",".join(shards))

    all_tensors = {}
    header_bytes_total = 0
    shard_sizes = {}
    for shard in shards:
        first8, shard_size = get_range(shard, 0, 7)
        shard_sizes[shard] = shard_size
        header_len = struct.unpack("<Q", first8)[0]
        if header_len <= 0 or header_len > MAX_HEADER:
            raise RuntimeError(f"unsafe header length {header_len} in {shard}")
        raw_header, second_size = get_range(shard, 0, 7 + header_len)
        if second_size != shard_size:
            raise RuntimeError(f"shard size changed while reading header: {shard}")
        header_bytes_total += len(raw_header)
        header = json.loads(raw_header[8:].decode("utf-8"))
        names = set(header) - {"__metadata__"}
        expected_shard_names = {key for key, value in weight_map.items() if value == shard}
        if names != expected_shard_names:
            missing = sorted(expected_shard_names - names)[:8]
            extra = sorted(names - expected_shard_names)[:8]
            raise RuntimeError(
                f"index/header key mismatch in {shard}; missing={missing}, extra={extra}"
            )
        for name in names:
            if name in all_tensors:
                raise RuntimeError(f"duplicate tensor key: {name}")
            all_tensors[name] = header[name]
        print(
            f"header_ok={shard} file_bytes={shard_size} "
            f"header_bytes={len(raw_header)} tensors={len(names)}"
        )

    if set(all_tensors) != expected_keys:
        raise RuntimeError("combined shard headers do not exactly match index weight_map")

    expert_re = re.compile(
        r"^language_model\.model\.layers\.(\d+)\.mlp\.experts\."
    )
    vision_re = re.compile(r"(?:^|\.)(?:vision_tower|visual)(?:\.|$)", re.IGNORECASE)
    layer_bytes = defaultdict(int)
    layer_tensor_count = defaultdict(int)
    layer_suffixes = defaultdict(set)
    categories = defaultdict(int)
    category_tensors = defaultdict(int)
    expert_bytes = 0
    vision_bytes = 0
    non_expert_bytes = 0
    tensor_bytes_total = 0
    expert_tensor_count = 0
    vision_tensor_count = 0
    mtp_tensor_count = 0

    for name, meta in all_tensors.items():
        offsets = meta.get("data_offsets")
        shape = meta.get("shape")
        if not isinstance(offsets, list) or len(offsets) != 2:
            raise RuntimeError(f"invalid data_offsets: {name}")
        size = int(offsets[1]) - int(offsets[0])
        if size < 0:
            raise RuntimeError(f"negative tensor size: {name}")
        tensor_bytes_total += size

        expert_match = expert_re.match(name)
        if expert_match:
            layer = int(expert_match.group(1))
            if not isinstance(shape, list) or not shape or int(shape[0]) != EXPECTED_EXPERTS:
                raise RuntimeError(
                    f"expert tensor does not have {EXPECTED_EXPERTS} leading experts: "
                    f"{name} shape={shape}"
                )
            expert_bytes += size
            layer_bytes[layer] += size // EXPECTED_EXPERTS
            layer_tensor_count[layer] += 1
            layer_suffixes[layer].add(name.split(".mlp.experts.", 1)[1].split(".")[0])
            if size % EXPECTED_EXPERTS:
                raise RuntimeError(f"expert tensor bytes not divisible by expert count: {name}")
            expert_tensor_count += 1
            continue

        if ".mlp.experts." in name:
            raise RuntimeError(f"unclassified expert tensor key; refusing to undercount: {name}")

        non_expert_bytes += size
        if vision_re.search(name):
            categories["vision"] += size
            category_tensors["vision"] += 1
            vision_bytes += size
            vision_tensor_count += 1
        elif "embed_tokens" in name or ".embeddings." in name:
            categories["embedding"] += size
            category_tensors["embedding"] += 1
        elif "lm_head" in name:
            categories["output_head"] += size
            category_tensors["output_head"] += 1
        elif ".shared_expert" in name:
            categories["shared_experts"] += size
            category_tensors["shared_experts"] += 1
        elif ".mlp.gate." in name or "router" in name:
            categories["moe_router"] += size
            category_tensors["moe_router"] += 1
        elif ".linear_attn." in name or ".self_attn." in name or ".attention." in name:
            categories["attention"] += size
            category_tensors["attention"] += 1
        elif "norm" in name.lower():
            categories["norms"] += size
            category_tensors["norms"] += 1
        else:
            categories["other_non_expert"] += size
            category_tensors["other_non_expert"] += 1

        if "mtp." in name or name.startswith("mtp."):
            mtp_tensor_count += 1

    expected_layers = list(range(EXPECTED_LAYERS))
    actual_layers = sorted(layer_bytes)
    if actual_layers != expected_layers:
        raise RuntimeError(
            f"expected MoE layers {expected_layers}, found {actual_layers}"
        )
    for layer in expected_layers:
        suffixes = layer_suffixes[layer]
        if not any("gate_up_proj" in suffix for suffix in suffixes):
            raise RuntimeError(f"layer {layer} missing gate_up_proj expert tensor")
        if not any("down_proj" in suffix for suffix in suffixes):
            raise RuntimeError(f"layer {layer} missing down_proj expert tensor")

    if vision_tensor_count == 0 or vision_bytes == 0:
        raise RuntimeError(
            "no vision tensors found in Safetensors index/header; config alone is not a VLM pass"
        )
    if tensor_bytes_total != declared_total:
        raise RuntimeError(
            f"index metadata total_size mismatch: headers sum to {tensor_bytes_total}, "
            f"index declares {declared_total}"
        )
    if tensor_bytes_total != expert_bytes + non_expert_bytes:
        raise RuntimeError("internal tensor-byte accounting mismatch")
    if sum(categories.values()) != non_expert_bytes:
        raise RuntimeError("non-expert category sum does not match non-expert total")

    topk_floor = sum(top_k * layer_bytes[layer] for layer in expected_layers)
    non_vision_shell = non_expert_bytes - vision_bytes
    if non_vision_shell < 0:
        raise RuntimeError("vision byte total exceeds non-expert total")

    print("")
    print("=== EXACT HEADER ACCOUNTING ===")
    print(f"tensor_count={len(all_tensors)}")
    print(f"header_bytes_fetched={header_bytes_total}")
    print(f"tensor_payload_bytes_total={tensor_bytes_total}")
    print(f"routed_expert_tensor_count={expert_tensor_count}")
    print(f"routed_expert_tensor_bytes={expert_bytes}")
    print(f"routed_moe_layer_count={len(actual_layers)}")
    print(f"per_layer_expert_bundle_min_bytes={min(layer_bytes.values())}")
    print(f"per_layer_expert_bundle_max_bytes={max(layer_bytes.values())}")
    print(f"non_expert_tensor_bytes={non_expert_bytes}")
    print(f"vision_tensor_count={vision_tensor_count}")
    print(f"vision_tensor_bytes={vision_bytes}")
    print(f"non_vision_shell_bytes={non_vision_shell}")
    print(f"mtp_tensor_count={mtp_tensor_count}")
    print(f"routed_expert_bytes_per_selected_token_topk{top_k}={topk_floor}")
    print(f"total_GiB={tensor_bytes_total / 1024**3:.6f}")
    print(f"expert_GiB={expert_bytes / 1024**3:.6f}")
    print(f"non_expert_GiB={non_expert_bytes / 1024**3:.6f}")
    print(f"vision_GiB={vision_bytes / 1024**3:.6f}")
    print(f"non_vision_shell_GiB={non_vision_shell / 1024**3:.6f}")
    print(f"per_token_topk{top_k}_expert_floor_GiB={topk_floor / 1024**3:.6f}")

    print("")
    print("=== NON-EXPERT MODULE BREAKDOWN ===")
    print("category,tensors,bytes,GiB")
    for category in sorted(categories):
        size = categories[category]
        print(
            f"{category},{category_tensors[category]},{size},"
            f"{size / 1024**3:.6f}"
        )

    print("")
    print("=== PER-LAYER TOP-K FLOOR ===")
    for layer in expected_layers:
        bundle = layer_bytes[layer]
        print(
            f"layer={layer} expert_tensors={layer_tensor_count[layer]} "
            f"one_expert_bundle_bytes={bundle} top{top_k}_floor_bytes={bundle * top_k}"
        )

    print("")
    print("PASS: exact index-to-header key coverage, tensor byte sum, all 40 MoE layers,")
    print("      and non-empty vision tensor accounting; no tensor payloads downloaded.")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"FAIL_CLOSED: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(2)
