#!/usr/bin/env bash
set -euo pipefail
MODE="dry-run"
if [[ "$#" -gt 1 ]]; then printf 'Usage: %s [--apply]\n' "$0"; exit 2; fi
if [[ "$#" -eq 1 ]]; then [[ "$1" == "--apply" ]] || { printf 'Usage: %s [--apply]\n' "$0"; exit 2; }; MODE="apply"; fi
MODEL_VOLUME="${PACS_MODEL_VOLUME:-/Volumes/SSD}"
MODEL_DIR="${PACS_MODEL_DIR:-$MODEL_VOLUME/AI-Workspace/models}"
STATE_DIR="$HOME/.pacs/ollama-deploy"
BACKUP_FILE="$STATE_DIR/launchctl-env.before"
DEFAULT_MODEL_DIR="$HOME/.ollama/models"
UNSET_SENTINEL="__PACS_OLLAMA_ENV_UNSET__"
die() { printf '[BLOCKED] %s\n' "$1" >&2; exit 2; }

[[ "$(uname -s)" == "Darwin" ]] || die "macOS required."
[[ "$MODEL_VOLUME" == /* && "$MODEL_DIR" == "$MODEL_VOLUME/"* ]] || die "Model directory must be inside the configured volume."
[[ -d "$MODEL_VOLUME" ]] || die "Volume missing: $MODEL_VOLUME"
mount | grep -F " on $MODEL_VOLUME (" >/dev/null 2>&1 || die "Not a mounted volume: $MODEL_VOLUME"
[[ ! -L "$MODEL_DIR" ]] || die "Refusing symlink model directory."
OLD_MODELS="$(launchctl getenv OLLAMA_MODELS 2>/dev/null || true)"
OLD_HOST="$(launchctl getenv OLLAMA_HOST 2>/dev/null || true)"
OLD_NO_CLOUD="$(launchctl getenv OLLAMA_NO_CLOUD 2>/dev/null || true)"
[[ -z "$OLD_MODELS" || "$OLD_MODELS" == "$MODEL_DIR" ]] || die "OLLAMA_MODELS already points elsewhere; inspect first."
DEFAULT_FIRST_FILE=""
if [[ -d "$DEFAULT_MODEL_DIR" ]]; then
  DEFAULT_FIRST_FILE="$(find "$DEFAULT_MODEL_DIR" -type f -print -quit 2>/dev/null || true)"
fi
if [[ -n "$DEFAULT_FIRST_FILE" && "$OLD_MODELS" != "$MODEL_DIR" ]]; then
  die "Default model directory contains data; refusing to hide or move existing models."
fi

REUSE_BACKUP=0
if [[ -e "$BACKUP_FILE" ]]; then
  [[ -f "$BACKUP_FILE" ]] || die "Backup path exists but is not a regular file."
  [[ "$(wc -l < "$BACKUP_FILE" | tr -d ' ')" == "3" ]] || die "Environment backup is malformed; inspect manually."
  BACKUP_MODELS="$(sed -n '1p' "$BACKUP_FILE")"
  BACKUP_HOST="$(sed -n '2p' "$BACKUP_FILE")"
  BACKUP_NO_CLOUD="$(sed -n '3p' "$BACKUP_FILE")"
  allowed_current() {
    local current="$1" target="$2" original="$3"
    [[ -z "$current" || "$current" == "$target" || "$current" == "$original" ]]
  }
  allowed_current "$OLD_MODELS" "$MODEL_DIR" "$BACKUP_MODELS" || die "OLLAMA_MODELS changed since the backup; inspect manually."
  allowed_current "$OLD_HOST" "127.0.0.1:11434" "$BACKUP_HOST" || die "OLLAMA_HOST changed since the backup; inspect manually."
  allowed_current "$OLD_NO_CLOUD" "1" "$BACKUP_NO_CLOUD" || die "OLLAMA_NO_CLOUD changed since the backup; inspect manually."
  REUSE_BACKUP=1
fi

FREE_KB="$(df -Pk "$MODEL_VOLUME" | awk 'NR==2 {print $4}')"
[[ -n "$FREE_KB" && "$FREE_KB" -ge 10485760 ]] || die "At least 10 GiB free space required."
printf 'Mode: %s\nVolume: %s\nModel directory: %s\nFree space: %s KiB\n' "$MODE" "$MODEL_VOLUME" "$MODEL_DIR" "$FREE_KB"
printf 'Will set OLLAMA_MODELS=%s\nOLLAMA_HOST=127.0.0.1:11434\nOLLAMA_NO_CLOUD=1\n' "$MODEL_DIR"
if [[ "$REUSE_BACKUP" -eq 1 ]]; then
  printf 'Existing original-environment backup will be preserved: %s\n' "$BACKUP_FILE"
fi
if [[ "$MODE" == "dry-run" ]]; then printf '[DRY-RUN] No changes made. Use --apply after review.\n'; exit 0; fi
[[ -t 0 ]] || die "Interactive confirmation required; run from Terminal."
read -r -p "Type APPLY to create the directory and change launchd environment: " CONFIRM
[[ "$CONFIRM" == "APPLY" ]] || die "Cancelled."
mkdir -p "$STATE_DIR" "$MODEL_DIR"
umask 077
if [[ "$REUSE_BACKUP" -eq 0 ]]; then
  if [[ -n "$OLD_MODELS" ]]; then OLD_MODELS_SAVE="$OLD_MODELS"; else OLD_MODELS_SAVE="$UNSET_SENTINEL"; fi
  if [[ -n "$OLD_HOST" ]]; then OLD_HOST_SAVE="$OLD_HOST"; else OLD_HOST_SAVE="$UNSET_SENTINEL"; fi
  if [[ -n "$OLD_NO_CLOUD" ]]; then OLD_NO_CLOUD_SAVE="$OLD_NO_CLOUD"; else OLD_NO_CLOUD_SAVE="$UNSET_SENTINEL"; fi
  {
    printf '%s\n' "$OLD_MODELS_SAVE"
    printf '%s\n' "$OLD_HOST_SAVE"
    printf '%s\n' "$OLD_NO_CLOUD_SAVE"
  } > "$BACKUP_FILE"
  chmod 600 "$BACKUP_FILE"
  RESTORE_MODELS="$OLD_MODELS_SAVE"
  RESTORE_HOST="$OLD_HOST_SAVE"
  RESTORE_NO_CLOUD="$OLD_NO_CLOUD_SAVE"
else
  RESTORE_MODELS="$BACKUP_MODELS"
  RESTORE_HOST="$BACKUP_HOST"
  RESTORE_NO_CLOUD="$BACKUP_NO_CLOUD"
fi
restore_value() {
  local key="$1" value="$2"
  if [[ "$value" == "$UNSET_SENTINEL" ]]; then launchctl unsetenv "$key"; else launchctl setenv "$key" "$value"; fi
}
if ! launchctl setenv OLLAMA_MODELS "$MODEL_DIR" || ! launchctl setenv OLLAMA_HOST "127.0.0.1:11434" || ! launchctl setenv OLLAMA_NO_CLOUD "1"; then
  restore_value OLLAMA_MODELS "$RESTORE_MODELS" || true
  restore_value OLLAMA_HOST "$RESTORE_HOST" || true
  restore_value OLLAMA_NO_CLOUD "$RESTORE_NO_CLOUD" || true
  die "launchctl update failed; previous values restored where possible. Inspect backup."
fi
printf '[APPLIED] Environment updated. Quit and reopen Ollama, then run verify-ollama.sh.\n'
printf 'This launchd environment has not been proven to survive logout/reboot; rerun this script after login if the values are absent.\n'
printf 'Backup: %s\n' "$BACKUP_FILE"
