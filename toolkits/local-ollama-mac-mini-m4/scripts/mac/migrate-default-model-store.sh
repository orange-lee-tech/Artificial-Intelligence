#!/usr/bin/env bash
set -euo pipefail

MODE="dry-run"
if [[ "$#" -gt 1 ]]; then
  printf 'Usage: %s [--apply]\n' "$0"
  exit 2
fi
if [[ "$#" -eq 1 ]]; then
  [[ "$1" == "--apply" ]] || { printf 'Usage: %s [--apply]\n' "$0"; exit 2; }
  MODE="apply"
fi

MODEL_VOLUME="\${PACS_MODEL_VOLUME:-/Volumes/SSD}"
MODEL_DIR="\${PACS_MODEL_DIR:-$MODEL_VOLUME/AI-Workspace/models}"
SOURCE_DIR="$HOME/.ollama/models"

die() { printf '[BLOCKED] %s\n' "$1" >&2; exit 2; }

[[ "$(uname -s)" == "Darwin" ]] || die "macOS required."
[[ "$MODEL_VOLUME" == /* && "$MODEL_DIR" == "$MODEL_VOLUME/"* ]] || die "Destination must be inside the configured external volume."
[[ -d "$MODEL_VOLUME" ]] || die "External volume missing: $MODEL_VOLUME"
mount | grep -F " on $MODEL_VOLUME (" >/dev/null 2>&1 || die "External volume is not mounted: $MODEL_VOLUME"
[[ -d "$SOURCE_DIR" ]] || die "Default Ollama model store missing: $SOURCE_DIR"
[[ ! -L "$SOURCE_DIR" && ! -L "$MODEL_DIR" ]] || die "Refusing symlink model-store paths."
[[ -d "$SOURCE_DIR/blobs" && -d "$SOURCE_DIR/manifests" ]] || die "Source does not look like an Ollama model store."
SOURCE_FIRST_FILE="$(find "$SOURCE_DIR" -type f -print -quit 2>/dev/null || true)"
[[ -n "$SOURCE_FIRST_FILE" ]] || die "Source model store contains no files."

ACTIVE_MODELS="$(launchctl getenv OLLAMA_MODELS 2>/dev/null || true)"
ACTIVE_HOST="$(launchctl getenv OLLAMA_HOST 2>/dev/null || true)"
ACTIVE_NO_CLOUD="$(launchctl getenv OLLAMA_NO_CLOUD 2>/dev/null || true)"
[[ "$ACTIVE_MODELS" == "$MODEL_DIR" ]] || die "launchd OLLAMA_MODELS does not match destination."
[[ "$ACTIVE_HOST" == "127.0.0.1:11434" ]] || die "launchd OLLAMA_HOST is not loopback-only."
[[ "$ACTIVE_NO_CLOUD" == "1" ]] || die "launchd OLLAMA_NO_CLOUD=1 is required."

command -v lsof >/dev/null 2>&1 || die "lsof is required to confirm Ollama is stopped."
LISTENER="$(lsof -nP -iTCP:11434 -sTCP:LISTEN 2>/dev/null || true)"
[[ -z "$LISTENER" ]] || die "Ollama still has a listener on port 11434. Quit Ollama completely, then retry."

if [[ -d "$MODEL_DIR" ]]; then
  DEST_FIRST_FILE="$(find "$MODEL_DIR" -mindepth 1 -print -quit 2>/dev/null || true)"
  [[ -z "$DEST_FIRST_FILE" ]] || die "Destination is not empty. Refusing to overwrite or merge: $MODEL_DIR"
fi

SOURCE_SIZE="$(du -sh "$SOURCE_DIR" | awk '{print $1}')"
SOURCE_COUNT="$(find "$SOURCE_DIR" -type f | wc -l | tr -d ' ')"

printf 'Mode: %s\n' "$MODE"
printf 'Source: %s\n' "$SOURCE_DIR"
printf 'Source size: %s\n' "$SOURCE_SIZE"
printf 'Source files: %s\n' "$SOURCE_COUNT"
printf 'Destination: %s\n' "$MODEL_DIR"
printf 'Ollama listener: stopped\n'
printf 'launchd environment: target path / loopback / cloud disabled\n'

if [[ "$MODE" == "dry-run" ]]; then
  printf '[DRY-RUN] No files copied or deleted. Use --apply after review.\n'
  exit 0
fi

[[ -t 0 ]] || die "Interactive confirmation required; run from Terminal."
read -r -p "Type COPY to copy the existing model store; source will be retained: " CONFIRM
[[ "$CONFIRM" == "COPY" ]] || die "Cancelled."

mkdir -p "$MODEL_DIR"
ditto "$SOURCE_DIR" "$MODEL_DIR"

if ! diff -qr "$SOURCE_DIR" "$MODEL_DIR"; then
  die "Copy verification failed. Both source and destination were retained; inspect before retrying."
fi

DEST_SIZE="$(du -sh "$MODEL_DIR" | awk '{print $1}')"
DEST_COUNT="$(find "$MODEL_DIR" -type f | wc -l | tr -d ' ')"
[[ "$SOURCE_COUNT" == "$DEST_COUNT" ]] || die "File-count mismatch after copy; both stores were retained."

printf '[PASS] Model store copied and byte-content verified.\n'
printf 'Destination size: %s\nDestination files: %s\n' "$DEST_SIZE" "$DEST_COUNT"
printf '[SAFE] Original model store remains untouched at %s\n' "$SOURCE_DIR"
printf 'Next: reopen Ollama and verify ollama list plus external-store size. Do not delete the original yet.\n'
