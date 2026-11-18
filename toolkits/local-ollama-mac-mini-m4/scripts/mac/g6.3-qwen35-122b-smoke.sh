#!/bin/bash
set -euo pipefail

# PACS G6.3 isolated hardware smoke test.
# This script is intentionally independent of Ollama, DSH Desktop Profile and MCP.
# It does NOT change production configuration and does NOT stop DSH.
#
# Authorized initial envelope:
#   Qwen3.5-122B-A10B / TurboQuant 3-bit
#   cache=3 GB / short context <=8K / batch=1 / full routing
#   MTP/draft=off / fan-out=off / wired-memory=off
#
# Evidence directory and Python environment are placed on the external TS900.

MODEL_REPO="manjunathshiva/qwen3.5-122b-tq3"
MODEL_REVISION="2c7a3a9da6b51053d77fc17591e5e0718c4ef60b"
MODEL_DIR="${PACS_MODEL_DIR:-/Volumes/SSD/AI-Workspace/models/qwen3.5-122b-tq3}"
WORK_DIR="${PACS_G63_DIR:-/Volumes/SSD/AI-Workspace/pacs-g6.3-qwen35-122b}"
VENV_DIR="${WORK_DIR}/venv"
HF_HOME_DIR="${WORK_DIR}/hf-cache"
RUN_ROOT="${WORK_DIR}/runs"
CACHE_GB="${PACS_EXPERT_CACHE_GB:-3}"
MAX_TOKENS="${PACS_MAX_TOKENS:-128}"

die() {
  echo "[G6.3][STOP] $*" >&2
  exit 2
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

[ "$(uname -s)" = "Darwin" ] || die "macOS required"
[ "$(uname -m)" = "arm64" ] || die "Apple Silicon ARM64 required"
[ -d /Volumes/SSD ] || die "/Volumes/SSD is not mounted; refusing to use internal SSD"

FREE_BYTES="$(df -Pk /Volumes/SSD | awk 'NR==2 {print $4*1024}')"
[ "$FREE_BYTES" -gt $((70*1024*1024*1024)) ] || die "TS900 free space is below 70 GB"

for cmd in python3 curl vm_stat sysctl ps pgrep sw_vers; do
  need_cmd "$cmd"
done

mkdir -p "$WORK_DIR" "$RUN_ROOT" "$HF_HOME_DIR"
RUN_ID="$(date +%Y%m%d-%H%M%S)"
RUN_DIR="${RUN_ROOT}/${RUN_ID}"
mkdir -p "$RUN_DIR"

export HF_HOME="$HF_HOME_DIR"
export HUGGINGFACE_HUB_CACHE="$HF_HOME_DIR/hub"
export PIP_CACHE_DIR="${WORK_DIR}/pip-cache"
export TOKENIZERS_PARALLELISM=false

# Refuse to start when another local model is resident.
# We do not kill anything automatically.
if curl -fsS --max-time 2 http://127.0.0.1:11434/api/ps >"${RUN_DIR}/ollama-ps.json" 2>/dev/null; then
  if ! python3 - "${RUN_DIR}/ollama-ps.json" <<'PY'
import json, sys
payload = json.load(open(sys.argv[1], encoding="utf-8"))
raise SystemExit(0 if not payload.get("models") else 1)
PY
  then
    die "Ollama reports a resident model; unload it before this isolated test"
  fi
fi

pgrep -fl 'ollama_llama_server|ollama runner|ollama serve' >"${RUN_DIR}/ollama-processes.txt" || true

{
  echo "timestamp=$(date -Iseconds)"
  echo "model_repo=${MODEL_REPO}"
  echo "model_revision=${MODEL_REVISION}"
  echo "model_dir=${MODEL_DIR}"
  echo "cache_gb=${CACHE_GB}"
  echo "max_tokens=${MAX_TOKENS}"
  echo "routing=full (max-active-experts=0)"
  echo "prefetch_workers=8"
  echo "prefetch_ahead=0"
  echo "fanout=off"
  echo "wire_memory=off"
  echo "page_cache=off"
  echo "hostname=$(hostname)"
  sw_vers
  sysctl hw.memsize
  sysctl iogpu.wired_limit_mb 2>/dev/null || true
  sysctl vm.swapusage 2>/dev/null || true
  memory_pressure 2>/dev/null || true
  df -h /Volumes/SSD
  ps -axo pid,ppid,rss,vsz,%cpu,%mem,command | sort -k3 -nr | head -30
} >"${RUN_DIR}/baseline.txt"

if [ ! -x "${VENV_DIR}/bin/python" ]; then
  python3 -m venv "${VENV_DIR}"
fi

source "${VENV_DIR}/bin/activate"
python -m pip install --disable-pip-version-check -U pip >/dev/null
python -m pip install --disable-pip-version-check "turboquant-mlx-full==0.30.0"

# Always resolve the exact immutable revision. If the model directory already exists,
# snapshot_download verifies/refreshes the files for this revision rather than silently
# switching to a moving main branch.
python - <<PY
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id="${MODEL_REPO}",
    revision="${MODEL_REVISION}",
    local_dir="${MODEL_DIR}",
)
PY
printf '%s\n' "${MODEL_REVISION}" >"${MODEL_DIR}/.pacs-g6.3-revision"

turboquant-plan \
  --model "${MODEL_DIR}" \
  --context 8192 \
  --ram-gb 16 \
  --wired-gb 10.5 \
  --json >"${RUN_DIR}/plan.json"

PROMPT='你是本地模型硬件验收测试节点。请只回答：SMOKE_TEST_OK。不要调用工具，不要提出问题。'

set +e
/usr/bin/time -p \
  python -m turboquant_mlx.stream.stream_generate \
    --model "${MODEL_DIR}" \
    --prompt "${PROMPT}" \
    --max-tokens "${MAX_TOKENS}" \
    --cache-budget-gb "${CACHE_GB}" \
    --max-active-experts 0 \
    --prefetch-workers 8 \
    --prefetch-ahead 0 \
    --no-page-cache \
    >"${RUN_DIR}/generation.txt" 2>"${RUN_DIR}/runtime.stderr"
STATUS=$?
set -e

{
  echo "timestamp=$(date -Iseconds)"
  echo "exit_status=${STATUS}"
  sysctl vm.swapusage 2>/dev/null || true
  memory_pressure 2>/dev/null || true
  df -h /Volumes/SSD
  ps -axo pid,ppid,rss,vsz,%cpu,%mem,command | sort -k3 -nr | head -30
} >"${RUN_DIR}/after.txt"

if [ "${STATUS}" -ne 0 ]; then
  echo "[G6.3][FAIL] runtime exited with status ${STATUS}"
  echo "${RUN_DIR}"
  exit "${STATUS}"
fi

echo "[G6.3][PASS] isolated generation completed"
echo "${RUN_DIR}"
