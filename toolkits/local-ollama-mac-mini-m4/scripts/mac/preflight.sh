#!/usr/bin/env bash
set -euo pipefail
MODEL_VOLUME="$PACS_MODEL_VOLUME"
if [[ -z "$MODEL_VOLUME" ]]; then MODEL_VOLUME="/Volumes/SSD"; fi
MODEL_DIR="$PACS_MODEL_DIR"
if [[ -z "$MODEL_DIR" ]]; then MODEL_DIR="$MODEL_VOLUME/AI-Workspace/models"; fi
section() { printf '\n== %s ==\n' "$1"; }
note() { printf '[INFO] %s\n' "$1"; }
warn() { printf '[WARN] %s\n' "$1"; }

section "Platform"
OS_NAME="$(uname -s)"
ARCH="$(uname -m)"
if [[ "$OS_NAME" != "Darwin" ]]; then
  printf '[BLOCKED] macOS required; detected %s.\n' "$OS_NAME"
  exit 2
fi
printf 'macOS: %s\n' "$(sw_vers -productVersion)"
printf 'Architecture: %s\n' "$ARCH"
[[ "$ARCH" == "arm64" ]] || warn "Expected Apple Silicon arm64."

section "Unified memory"
MEM_BYTES="$(sysctl -n hw.memsize)"
awk -v n="$MEM_BYTES" 'BEGIN { printf "Physical memory: %.1f GiB\n", n/1024/1024/1024 }'
memory_pressure 2>/dev/null | sed -n '1,5p' || true
sysctl vm.swapusage 2>/dev/null || true

section "Internal storage"
df -h /

section "External model volume"
printf 'Expected volume: %s\nExpected model directory: %s\n' "$MODEL_VOLUME" "$MODEL_DIR"
if [[ -d "$MODEL_VOLUME" ]] && mount | grep -F " on $MODEL_VOLUME (" >/dev/null 2>&1; then
  note "Volume is mounted."
  df -h "$MODEL_VOLUME"
  diskutil info "$MODEL_VOLUME" 2>/dev/null | grep -E 'Device Location|Protocol|Solid State|File System Personality|Volume Name|Mount Point|Disk Size|Volume Free Space' || true
  if [[ -d "$MODEL_DIR" ]]; then
    [[ -w "$MODEL_DIR" ]] && note "Model directory writable." || warn "Model directory not writable."
  else
    note "Model directory absent; preflight did not create it."
  fi
else
  warn "Expected volume not mounted. No directory was created."
fi

section "Ollama"
if command -v ollama >/dev/null 2>&1; then
  command -v ollama
  ollama --version || true
  ollama list 2>&1 || true
  ollama ps 2>&1 || true
else
  note "Ollama CLI not found."
fi
[[ -d "/Applications/Ollama.app" ]] && note "Ollama.app exists." || note "Ollama.app not found."

section "Loopback API (GET only)"
if curl --silent --show-error --fail --connect-timeout 2 --max-time 3 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  note "Ollama API answered on loopback."
else
  note "No Ollama API response on 127.0.0.1:11434."
fi

section "launchd environment"
for key in OLLAMA_HOST OLLAMA_MODELS OLLAMA_NO_CLOUD; do
  value="$(launchctl getenv "$key" 2>/dev/null || true)"
  if [[ -n "$value" ]]; then printf '%s=%s\n' "$key" "$value"; else printf '%s=(unset)\n' "$key"; fi
done
printf '\nREAD_ONLY=YES\nNo files, settings, packages, models, or services were changed.\n'
