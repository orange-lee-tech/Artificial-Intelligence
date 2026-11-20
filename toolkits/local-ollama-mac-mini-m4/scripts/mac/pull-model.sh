#!/usr/bin/env bash
set -euo pipefail
MODEL_TAG="${PACS_MODEL_TAG:-qwen3.5:4b-q4_K_M}"
MODEL_VOLUME="${PACS_MODEL_VOLUME:-/Volumes/SSD}"
MODEL_DIR="${PACS_MODEL_DIR:-$MODEL_VOLUME/AI-Workspace/models}"
MODE="dry-run"
if [[ "$#" -gt 1 ]]; then printf 'Usage: %s [--pull]\n' "$0"; exit 2; fi
if [[ "$#" -eq 1 ]]; then [[ "$1" == "--pull" ]] || { printf 'Usage: %s [--pull]\n' "$0"; exit 2; }; MODE="pull"; fi
die() { printf '[BLOCKED] %s\n' "$1" >&2; exit 2; }
[[ "$(uname -s)" == "Darwin" ]] || die "macOS required."
command -v ollama >/dev/null 2>&1 || die "Ollama CLI not installed."
[[ -d "$MODEL_VOLUME" ]] || die "Model volume missing."
mount | grep -F " on $MODEL_VOLUME (" >/dev/null 2>&1 || die "Model volume is not mounted."
[[ -d "$MODEL_DIR" && -w "$MODEL_DIR" ]] || die "Model directory missing or not writable."
ACTIVE_MODELS="$(launchctl getenv OLLAMA_MODELS 2>/dev/null || true)"
[[ "$ACTIVE_MODELS" == "$MODEL_DIR" ]] || die "OLLAMA_MODELS does not match the target directory; configure and restart Ollama first."
HOST_ENV="$(launchctl getenv OLLAMA_HOST 2>/dev/null || true)"
[[ -z "$HOST_ENV" || "$HOST_ENV" == "127.0.0.1:11434" ]] || die "OLLAMA_HOST is not loopback."
NO_CLOUD="$(launchctl getenv OLLAMA_NO_CLOUD 2>/dev/null || true)"
[[ "$NO_CLOUD" == "1" ]] || die "OLLAMA_NO_CLOUD=1 is required."
curl --silent --show-error --fail --connect-timeout 2 --max-time 5 http://127.0.0.1:11434/api/version >/dev/null || die "Ollama API is not responding on loopback; start/reopen Ollama and verify its environment first."
FREE_KB="$(df -Pk "$MODEL_DIR" | awk 'NR==2 {print $4}')"
[[ -n "$FREE_KB" && "$FREE_KB" -ge 10485760 ]] || die "At least 10 GiB free space required."
INSTALLED_MODELS="$(ollama list 2>/dev/null || true)"
if printf '%s\n' "$INSTALLED_MODELS" | awk -v tag="$MODEL_TAG" 'NR>1 && $1==tag {found=1} END {exit !found}'; then
  printf '[PASS] Model already present: %s\n' "$MODEL_TAG"; exit 0
fi
printf 'Mode: %s\nModel: %s\nModel store: %s\nFree space: %s KiB\n' "$MODE" "$MODEL_TAG" "$ACTIVE_MODELS" "$FREE_KB"
printf 'This downloads weights from the Ollama registry; it does not call a cloud inference API.\n'
if [[ "$MODE" == "dry-run" ]]; then printf '[DRY-RUN] No model downloaded. Use --pull after review.\n'; exit 0; fi
[[ -t 0 ]] || die "Run from Terminal for interactive confirmation."
read -r -p "Type the exact model tag to confirm: " CONFIRM
[[ "$CONFIRM" == "$MODEL_TAG" ]] || die "Model tag mismatch; cancelled."
ollama pull "$MODEL_TAG"
printf '[PASS] Pull completed. Run smoke-test.mjs before Harness integration.\n'
