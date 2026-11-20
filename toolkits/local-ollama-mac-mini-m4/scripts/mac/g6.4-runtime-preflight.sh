#!/usr/bin/env bash
set -euo pipefail

VOL="/Volumes/SSD"
BASE="$VOL/AI-Workspace/pacs-g6.4"
SRC="$BASE/serve-mlx"
VENV="$BASE/.venv"
LOGDIR="$BASE/logs"
UPSTREAM_SHA="d7021c9d6e66afbcf013b6a1b87431236b2d08f9"
UPSTREAM_URL="https://github.com/IDAH-BITBOX/serve-mlx.git"

if [ ! -d "$VOL" ]; then
  echo "[STOP] TS900 is not mounted at $VOL"
  exit 2
fi

umask 077
mkdir -p "$BASE" "$LOGDIR"
LOG="$LOGDIR/runtime-preflight-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1

echo "===== PACS G6.4 RUNTIME PREFLIGHT ====="
date '+timestamp=%Y-%m-%dT%H:%M:%S%z'
sw_vers
echo "physical_memory_bytes=$(sysctl -n hw.memsize)"
df -h "$VOL"
echo
echo "===== HOST MEMORY BEFORE INSTALL ====="
sysctl vm.swapusage
memory_pressure

if ! command -v brew >/dev/null 2>&1; then
  echo "[STOP] Homebrew is required to install an isolated Python 3.12 interpreter."
  exit 3
fi
if ! command -v git >/dev/null 2>&1; then
  echo "[STOP] git is unavailable; verify Xcode Command Line Tools."
  exit 3
fi

PY312_PREFIX="$(brew --prefix python@3.12 2>/dev/null || true)"
if [ -z "$PY312_PREFIX" ] || [ ! -x "$PY312_PREFIX/bin/python3.12" ]; then
  echo "Installing Homebrew python@3.12 (does not replace python3/python3.13/python3.14)..."
  brew install python@3.12
  PY312_PREFIX="$(brew --prefix python@3.12)"
fi
PY312="$PY312_PREFIX/bin/python3.12"
if [ ! -x "$PY312" ]; then
  echo "[STOP] Python 3.12 executable not found at $PY312"
  exit 4
fi
"$PY312" --version

if [ -e "$SRC" ] && [ ! -d "$SRC/.git" ]; then
  echo "[STOP] $SRC exists but is not a Git checkout; refusing to overwrite it."
  exit 5
fi
if [ ! -d "$SRC/.git" ]; then
  git clone "$UPSTREAM_URL" "$SRC"
else
  ORIGIN="$(git -C "$SRC" remote get-url origin)"
  if [ "$ORIGIN" != "$UPSTREAM_URL" ]; then
    echo "[STOP] Existing checkout origin mismatch: $ORIGIN"
    exit 5
  fi
  CURRENT="$(git -C "$SRC" rev-parse HEAD)"
  if [ "$CURRENT" != "$UPSTREAM_SHA" ] && [ -n "$(git -C "$SRC" status --porcelain)" ]; then
    echo "[STOP] Existing checkout has local changes on a different commit; refusing to overwrite."
    exit 5
  fi
  git -C "$SRC" fetch --no-tags origin main
fi

CURRENT="$(git -C "$SRC" rev-parse HEAD)"
if [ "$CURRENT" != "$UPSTREAM_SHA" ]; then
  git -C "$SRC" checkout --detach "$UPSTREAM_SHA"
fi
echo "upstream_commit=$(git -C "$SRC" rev-parse HEAD)"

PATCH="$BASE/qwen36-top-level-config.patch"
cat > "$PATCH" <<'PATCH_EOF'
diff --git a/src/mlx_moe_stream/storage/safetensors_store.py b/src/mlx_moe_stream/storage/safetensors_store.py
--- a/src/mlx_moe_stream/storage/safetensors_store.py
+++ b/src/mlx_moe_stream/storage/safetensors_store.py
@@ -413,7 +413,14 @@
 def _text_config(source_config: dict[str, Any], model_type: str) -> dict[str, Any]:
     if model_type == "qwen3_moe":
         return source_config
     value = source_config.get("text_config")
-    if not isinstance(value, dict):
-        raise ValueError(f"{model_type} config requires an object 'text_config'")
-    return value
+    if isinstance(value, dict):
+        return value
+    # Some Qwen3.6 MLX VLM checkpoints keep text fields at the top level.
+    if model_type == "qwen3_5_moe" and all(
+        key in source_config
+        for key in ("num_hidden_layers", "num_experts", "num_experts_per_tok")
+    ):
+        return source_config
+    raise ValueError(f"{model_type} config requires an object 'text_config'")
diff --git a/tests/unit/test_safetensors_store.py b/tests/unit/test_safetensors_store.py
--- a/tests/unit/test_safetensors_store.py
+++ b/tests/unit/test_safetensors_store.py
@@ -211,4 +211,18 @@
     shell = load_nonexpert_weights(
         manifest, include=lambda name: name.startswith("language_model.")
     )
     assert set(shell) == {"language_model.model.embed_tokens.weight"}
+
+
+def test_qwen35_manifest_accepts_top_level_text_config(tmp_path: Path):
+    model_path = tmp_path / "qwen35-top-level"
+    _write_multimodal_family_model(model_path, "qwen3_5_moe")
+    config_path = model_path / "config.json"
+    config = json.loads(config_path.read_text(encoding="utf-8"))
+    config.update(config.pop("text_config"))
+    config_path.write_text(json.dumps(config), encoding="utf-8")
+
+    manifest = build_streaming_manifest(model_path)
+    assert manifest.model_type == "qwen3_5_moe"
+    assert manifest.num_layers == 1
+    assert manifest.experts_per_token == 2
PATCH_EOF

if ! grep -Fq "Some Qwen3.6 MLX VLM checkpoints keep text fields at the top level." "$SRC/src/mlx_moe_stream/storage/safetensors_store.py"; then
  git -C "$SRC" apply --check "$PATCH"
  git -C "$SRC" apply "$PATCH"
else
  echo "Qwen3.6 top-level config compatibility patch already present."
fi

if [ -x "$VENV/bin/python" ]; then
  VENV_VERSION="$("$VENV/bin/python" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
  if [ "$VENV_VERSION" != "3.12" ]; then
    echo "[STOP] Existing venv uses Python $VENV_VERSION, expected 3.12: $VENV"
    exit 6
  fi
else
  "$PY312" -m venv "$VENV"
fi

echo
echo "===== INSTALL ISOLATED MLX / VLM RUNTIME ====="
"$VENV/bin/python" -m pip install --upgrade pip
"$VENV/bin/python" -m pip install \
  "mlx==0.32.4" \
  "mlx-lm==0.32.2" \
  "mlx-vlm==0.8.0" \
  "huggingface-hub>=0.30"
(
  cd "$SRC"
  "$VENV/bin/python" -m pip install -e ".[dev,vlm]"
)

echo
echo "===== STATIC TESTS (NO MODEL CHECKPOINT DOWNLOAD) ====="
(
  cd "$SRC"
  "$VENV/bin/ruff" check src tests
  "$VENV/bin/pytest" -q
)

"$VENV/bin/python" -m pip check
"$VENV/bin/python" - <<'PY'
from importlib.metadata import version
import mlx.core
import mlx_lm
import mlx_vlm
import mlx_moe_stream

for package in ("mlx", "mlx-lm", "mlx-vlm", "mlx-moe-stream", "huggingface-hub"):
    print(f"{package}={version(package)}")
print("MLX_IMPORT=PASS")
print("MLX_LM_IMPORT=PASS")
print("MLX_VLM_IMPORT=PASS")
print("MLX_MOE_STREAM_IMPORT=PASS")
PY

"$VENV/bin/mlx-moe-stream" --help >/dev/null
"$VENV/bin/mlx-moe-stream" prepare --help >/dev/null

echo
echo "===== PREFLIGHT RESULT ====="
echo "RUNTIME_PREFLIGHT=PASS"
echo "MODEL_WEIGHTS_DOWNLOADED=NO"
echo "OLLAMA_DSH_MCP_PRODUCTION_CONFIG_CHANGED=NO"
echo "VENV=$VENV"
echo "SOURCE=$SRC"
echo "LOG=$LOG"
echo "Next gate: download the pinned Qwen3.6 checkpoint to TS900, build manifest, then test the actual VLM shell under memory watchdog."
