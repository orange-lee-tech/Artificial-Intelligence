#!/usr/bin/env bash
set -euo pipefail
MODE="dry-run"
if [[ "$#" -gt 1 ]]; then printf 'Usage: %s [--apply]\n' "$0"; exit 2; fi
if [[ "$#" -eq 1 ]]; then [[ "$1" == "--apply" ]] || { printf 'Usage: %s [--apply]\n' "$0"; exit 2; }; MODE="apply"; fi
BACKUP_FILE="$HOME/.pacs/ollama-deploy/launchctl-env.before"
UNSET_SENTINEL="__PACS_OLLAMA_ENV_UNSET__"
[[ -f "$BACKUP_FILE" ]] || { printf '[BLOCKED] No backup file: %s\n' "$BACKUP_FILE"; exit 2; }
OLD_MODELS="$(sed -n '1p' "$BACKUP_FILE")"
OLD_HOST="$(sed -n '2p' "$BACKUP_FILE")"
OLD_NO_CLOUD="$(sed -n '3p' "$BACKUP_FILE")"
printf 'Mode: %s\nWill restore OLLAMA_MODELS, OLLAMA_HOST and OLLAMA_NO_CLOUD. No files will be deleted.\n' "$MODE"
if [[ "$MODE" == "dry-run" ]]; then printf '[DRY-RUN] No changes made. Use --apply after review.\n'; exit 0; fi
[[ -t 0 ]] || { printf '[BLOCKED] Run from Terminal for interactive confirmation.\n'; exit 2; }
read -r -p "Type ROLLBACK to continue: " CONFIRM
[[ "$CONFIRM" == "ROLLBACK" ]] || { printf 'Cancelled.\n'; exit 1; }
restore_value() {
  local key="$1" value="$2"
  if [[ "$value" == "$UNSET_SENTINEL" ]]; then launchctl unsetenv "$key"; else launchctl setenv "$key" "$value"; fi
}
restore_value OLLAMA_MODELS "$OLD_MODELS"
restore_value OLLAMA_HOST "$OLD_HOST"
restore_value OLLAMA_NO_CLOUD "$OLD_NO_CLOUD"
printf '[APPLIED] Previous launchd values restored. Quit and reopen Ollama. Backup and model files retained.\n'
