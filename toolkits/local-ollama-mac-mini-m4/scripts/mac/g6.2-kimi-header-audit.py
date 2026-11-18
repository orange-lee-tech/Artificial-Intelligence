#!/usr/bin/env python3
"""Read-only Kimi Safetensors header audit. Never downloads tensor payloads."""
import json
import re
import struct
import sys
import urllib.request
from collections import defaultdict

REPO = "mlx-community/Kimi-Linear-48B-A3B-Instruct-4bit"
REV = "919175d75427f1c10cfc17e7254b53295edddf72"
BASE = f"https://huggingface.co/{REPO}/resolve/{REV}"
MAX_INDEX = 2 * 1024 * 1024
MAX_HEADER = 128 * 1024 * 1024
EXPECTED_EXPERTS = 256

def get_small(path, limit):
    req = urllib.request.Request(
        f"{BASE}/{path}",
        headers={"User-Agent": "PACS-G6.2-readonly-audit/1.0",
                 "Accept-Encoding": "identity"},
    )
    with urllib.request.urlopen(req, timeout=45) as r:
        data = r.read(limit + 1)
    if len(data) > limit:
        raise RuntimeError(f"{path} exceeds safety limit ({limit} bytes)")
    return data

def get_range(path, start, end):
    req = urllib.request.Request(
        f"{BASE}/{path}",
        headers={"User-Agent": "PACS-G6.2-readonly-audit/1.0",
                 "Accept-Encoding": "identity",
                 "Range": f"bytes={start}-{end}"},
    )
    with urllib.request.urlopen(req, timeout=45) as r:
        status = getattr(r, "status", r.getcode())
        content_range = r.headers.get("Content-Range", "")
        expected = end - start + 1
        if status != 206:
            raise RuntimeError(
                f"SAFE ABORT: {path} range {start}-{end} returned HTTP {status}; "
                "server did not confirm partial content. No response body was read."
            )
        if not content_range.startswith(f"bytes {start}-{end}/"):
            raise RuntimeError(
                f"SAFE ABORT: unexpected Content-Range for {path}: {content_range!r}"
            )
        data = r.read(expected + 1)
    if len(data) != expected:
        raise RuntimeError(
            f"SAFE ABORT: {path} returned {len(data)} bytes; expected {expected}"
        )
    return data

def main():
    print("PACS G6.2 Kimi header-only audit")
    print(f"repo={REPO}")
    print(f"revision={REV}")
    print("mode=HTTP Range only; no safetensors tensor payloads are downloaded")

    cfg = json.loads(get_small("config.json", MAX_INDEX))
    expected_cfg = {
        "model_type": "kimi_linear",
        "num_hidden_layers": 27,
        "num_experts": EXPECTED_EXPERTS,
        "num_experts_per_token": 8,
    }
    for key, expected in expected_cfg.items():
        actual = cfg.get(key)
        print(f"config.{key}={actual}")
        if actual != expected:
            raise RuntimeError(f"config mismatch: {key} expected {expected}, got {actual}")
    print(f"config.first_k_dense_replace={cfg.get('first_k_dense_replace')}")
    print(f"config.moe_layer_freq={cfg.get('moe_layer_freq')}")
    print(f"config.quantization={json.dumps(cfg.get('quantization', {}), sort_keys=True)}")

    index_bytes = get_small("model.safetensors.index.json", MAX_INDEX)
    index = json.loads(index_bytes)
    weight_map = index.get("weight_map")
    if not isinstance(weight_map, dict) or not weight_map:
        raise RuntimeError("Safetensors index has no valid weight_map")
    expected_keys = set(weight_map)
    shards = sorted(set(weight_map.values()))
    print(f"index_bytes={len(index_bytes)}")
    print(f"index_metadata_total_size={index.get('metadata', {}).get('total_size')}")
    print(f"shard_count={len(shards)}")
    print("shards=" + ",".join(shards))

    all_tensors = {}
    header_bytes_total = 0
    for shard in shards:
        first8 = get_range(shard, 0, 7)
        header_len = struct.unpack("<Q", first8)[0]
        if header_len <= 0 or header_len > MAX_HEADER:
            raise RuntimeError(f"unsafe header length {header_len} in {shard}")
        raw_header = get_range(shard, 0, 7 + header_len)
        header_bytes_total += len(raw_header)
        header = json.loads(raw_header[8:].decode("utf-8"))
        names = set(header) - {"__metadata__"}
        expected_shard_names = {k for k, v in weight_map.items() if v == shard}
        if names != expected_shard_names:
            missing = sorted(expected_shard_names - names)[:5]
            extra = sorted(names - expected_shard_names)[:5]
            raise RuntimeError(
                f"index/header key mismatch in {shard}; missing={missing}, extra={extra}"
            )
        for name in names:
            if name in all_tensors:
                raise RuntimeError(f"duplicate tensor key: {name}")
            all_tensors[name] = header[name]
        print(f"header_ok={shard} header_bytes={len(raw_header)} tensors={len(names)}")

    if set(all_tensors) != expected_keys:
        raise RuntimeError("combined shard headers do not exactly match index weight_map")

    expert_pattern = re.compile(r"^model\.layers\.(\d+)\.mlp\.switch_mlp\.")
    expert_bytes = 0
    non_expert_bytes = 0
    layer_bytes = defaultdict(int)
    expert_tensor_count = 0
    tensor_bytes_total = 0
    for name, meta in all_tensors.items():
        offsets = meta.get("data_offsets")
        shape = meta.get("shape")
        if not isinstance(offsets, list) or len(offsets) != 2:
            raise RuntimeError(f"invalid data_offsets: {name}")
        size = int(offsets[1]) - int(offsets[0])
        if size < 0:
            raise RuntimeError(f"negative tensor size: {name}")
        tensor_bytes_total += size
        match = expert_pattern.match(name)
        if match:
            layer = int(match.group(1))
            if not isinstance(shape, list) or not shape or shape[0] != EXPECTED_EXPERTS:
                raise RuntimeError(
                    f"expert tensor does not have {EXPECTED_EXPERTS} leading experts: "
                    f"{name} shape={shape}"
                )
            expert_bytes += size
            layer_bytes[layer] += size // EXPECTED_EXPERTS
            if size % EXPECTED_EXPERTS:
                raise RuntimeError(f"expert tensor bytes not divisible by expert count: {name}")
            expert_tensor_count += 1
        else:
            non_expert_bytes += size

    moe_layers = sorted(layer_bytes)
    if len(moe_layers) != 26:
        raise RuntimeError(
            f"expected 26 streamed MoE layers, found {len(moe_layers)}: {moe_layers}"
        )
    top_k = int(cfg["num_experts_per_token"])
    floor_bytes = sum(top_k * layer_bytes[layer] for layer in moe_layers)
    if tensor_bytes_total != expert_bytes + non_expert_bytes:
        raise RuntimeError("internal tensor-byte accounting mismatch")

    print("")
    print("=== EXACT HEADER ACCOUNTING ===")
    print(f"tensor_count={len(all_tensors)}")
    print(f"header_bytes_fetched={header_bytes_total}")
    print(f"tensor_payload_bytes_total={tensor_bytes_total}")
    print(f"routed_expert_tensor_count={expert_tensor_count}")
    print(f"routed_expert_tensor_bytes={expert_bytes}")
    print(f"non_expert_tensor_bytes={non_expert_bytes}")
    print(f"routed_expert_bytes_per_selected_token_topk{top_k}={floor_bytes}")
    print(f"total_GiB={tensor_bytes_total / 1024**3:.6f}")
    print(f"expert_GiB={expert_bytes / 1024**3:.6f}")
    print(f"non_expert_GiB={non_expert_bytes / 1024**3:.6f}")
    print(f"per_token_topk{top_k}_expert_floor_GiB={floor_bytes / 1024**3:.6f}")
    print("")
    print("=== PER-LAYER TOP-K FLOOR ===")
    for layer in moe_layers:
        bundle = layer_bytes[layer]
        print(
            f"layer={layer} one_expert_bundle_bytes={bundle} "
            f"top{top_k}_floor_bytes={bundle * top_k}"
        )
    print("")
    print("PASS: exact index-to-header key coverage; no tensor payloads downloaded.")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"FAIL_CLOSED: {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(2)
