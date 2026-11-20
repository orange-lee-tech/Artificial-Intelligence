#!/usr/bin/env bash
set -euo pipefail

VOL="/Volumes/SSD"
BASE="$VOL/AI-Workspace/pacs-g6.4"
VENV="$BASE/.venv"
LOGDIR="$BASE/logs"

RUNTIME_SHA="d7021c9d6e66afbcf013b6a1b87431236b2d08f9"
MODEL_REPO="mlx-community/Qwen3.6-35B-A3B-4bit"
MODEL_REV="38740b847e4cb78f352aba30aa41c76e08e6eb46"
MODEL_DIR="$VOL/AI-Workspace/models/qwen3.6-35b-a3b-4bit-38740b84"
MANIFEST_DIR="$BASE/prepared-qwen3.6-35b-a3b-4bit-38740b84"

if [ ! -d "$VOL" ]; then
  echo "[STOP] TS900 is not mounted at $VOL"
  exit 2
fi
if [ ! -f "$BASE/runtime-preflight.pass" ] || [ "$(cat "$BASE/runtime-preflight.pass")" != "$RUNTIME_SHA" ]; then
  echo "[STOP] G6.4 runtime preflight has not passed for pinned runtime $RUNTIME_SHA"
  exit 3
fi
if [ ! -x "$VENV/bin/python" ] || [ ! -x "$VENV/bin/mlx-moe-stream" ]; then
  echo "[STOP] isolated runtime venv/CLI is missing; run g6.4-runtime-preflight.sh first"
  exit 3
fi

umask 077
mkdir -p "$LOGDIR" "$VOL/AI-Workspace/huggingface"
LOG="$LOGDIR/pinned-qwen36-download-prepare-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1

export HF_HOME="$VOL/AI-Workspace/huggingface"
export HF_HUB_CACHE="$HF_HOME/hub"
export HF_HUB_DISABLE_TELEMETRY=1

echo "===== PACS PINNED QWEN3.6 DOWNLOAD + MANIFEST ====="
date '+timestamp=%Y-%m-%dT%H:%M:%S%z'
echo "repo=$MODEL_REPO"
echo "revision=$MODEL_REV"
echo "runtime_commit=$RUNTIME_SHA"
echo "model_dir=$MODEL_DIR"
df -h "$VOL"

AVAIL_KB="$(df -Pk "$VOL" | awk 'NR==2 {print $4}')"
if [ -z "$AVAIL_KB" ] || [ "$AVAIL_KB" -lt 30000000 ]; then
  echo "[STOP] Less than 30 GB free on TS900; refusing full checkpoint download."
  exit 4
fi

if [ -e "$MODEL_DIR" ]; then
  if [ -f "$MODEL_DIR/.pacs-model-revision" ] && [ "$(cat "$MODEL_DIR/.pacs-model-revision")" = "$MODEL_REV" ]; then
    echo "Existing pinned model directory found; snapshot_download will resume/verify it."
  elif [ -n "$(find "$MODEL_DIR" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]; then
    echo "[STOP] Model directory exists without the PACS revision marker; refusing to mix checkpoints."
    exit 5
  fi
else
  mkdir -p "$MODEL_DIR"
fi
printf '%s\n' "$MODEL_REV" > "$MODEL_DIR/.pacs-model-revision"

echo
echo "===== DOWNLOAD EXACT IMMUTABLE REVISION TO TS900 ====="
"$VENV/bin/python" - "$MODEL_REPO" "$MODEL_REV" "$MODEL_DIR" <<'PY'
import sys
from huggingface_hub import snapshot_download

repo_id, revision, local_dir = sys.argv[1:]
path = snapshot_download(
    repo_id=repo_id,
    revision=revision,
    local_dir=local_dir,
    allow_patterns=[
        "*.json",
        "model*.safetensors",
        "tokenizer.*",
        "*.jinja",
        "*.txt",
    ],
    max_workers=4,
)
print(f"snapshot_path={path}")
print(f"snapshot_revision={revision}")
PY

echo
echo "===== VERIFY PINNED CHECKPOINT CONTENTS ====="
"$VENV/bin/python" - "$MODEL_DIR" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
config = json.loads((root / "config.json").read_text(encoding="utf-8"))
index = json.loads((root / "model.safetensors.index.json").read_text(encoding="utf-8"))

assert config.get("model_type") == "qwen3_5_moe", config.get("model_type")
assert int(config.get("num_hidden_layers", 0)) == 40
assert int(config.get("num_experts", 0)) == 256
assert int(config.get("num_experts_per_tok", 0)) == 8
assert isinstance(config.get("vision_config"), dict) and config["vision_config"]
assert config.get("image_token_id") is not None

quant = config.get("quantization") or {}
assert quant.get("bits") == 4
assert quant.get("group_size") == 64
assert quant.get("mode") == "affine"
rules = {
    key: value
    for key, value in quant.items()
    if key.startswith("language_model.model.layers.")
}
assert len(rules) == 80, len(rules)
for layer in range(40):
    for module in ("gate", "shared_expert_gate"):
        key = f"language_model.model.layers.{layer}.mlp.{module}"
        rule = rules.get(key)
        assert rule is not None, key
        assert int(rule.get("bits", 0)) == 8, (key, rule)
        assert int(rule.get("group_size", 0)) == 64, (key, rule)

expected_total = 20_401_929_952
assert int(index.get("metadata", {}).get("total_size", -1)) == expected_total
weight_map = index.get("weight_map") or {}
shards = sorted(set(weight_map.values()))
expected_names = [
    "model-00001-of-00004.safetensors",
    "model-00002-of-00004.safetensors",
    "model-00003-of-00004.safetensors",
    "model-00004-of-00004.safetensors",
]
assert shards == expected_names, shards
expected_sizes = {
    expected_names[0]: 5_288_196_018,
    expected_names[1]: 5_368_472_749,
    expected_names[2]: 5_368_324_139,
    expected_names[3]: 4_377_211_365,
}
for name, size in expected_sizes.items():
    actual = (root / name).stat().st_size
    assert actual == size, (name, actual, size)

print("model_type=qwen3_5_moe")
print("layers=40 experts=256 top_k=8")
print("global_quantization=4bit/group64/affine")
print("per_layer_gate_rules=80/80; all 8bit/group64")
print(f"tensor_payload_bytes={expected_total}")
print("shard_count=4; exact pinned shard sizes=PASS")
print("vision_config=present")
PY

echo
echo "===== BUILD EXACT-READ MANIFEST FROM LOCAL PATH ====="
if [ ! -f "$MANIFEST_DIR/manifest.json" ]; then
  "$VENV/bin/mlx-moe-stream" prepare --model "$MODEL_DIR" --output "$MANIFEST_DIR"
else
  echo "Manifest already exists; validating it without overwriting."
fi

"$VENV/bin/python" - "$MANIFEST_DIR/manifest.json" <<'PY'
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
manifest = json.loads(path.read_text(encoding="utf-8"))
assert manifest["model_type"] == "qwen3_5_moe"
assert int(manifest["num_layers"]) == 40
assert int(manifest["num_experts"]) == 256
assert int(manifest["experts_per_token"]) == 8
assert len(manifest["expert_bundles"]) == 40 * 256
sizes = {int(bundle["total_bytes"]) for bundle in manifest["expert_bundles"].values()}
assert sizes == {1_769_472}, sizes
print(f"manifest={path}")
print(f"expert_bundles={len(manifest['expert_bundles'])}")
print(f"expert_bundle_bytes={sorted(sizes)}")
print("MANIFEST_VALIDATION=PASS")
PY

echo
echo "===== CHECKPOINT HASHES ====="
shasum -a 256 "$MODEL_DIR/config.json" "$MODEL_DIR/model.safetensors.index.json"
df -h "$VOL"
echo "MODEL_DOWNLOAD_AND_MANIFEST=PASS"
echo "MODEL_RUNTIME_LOAD=NOT_YET_RUN"
echo "LOG=$LOG"
echo "Next gate: launch one short VLM request with resident expert cache off and memory monitoring active."
