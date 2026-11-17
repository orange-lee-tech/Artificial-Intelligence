#!/usr/bin/env bash
set -euo pipefail
API_URL="${OLLAMA_BASE_URL:-http://127.0.0.1:11434}"
case "$API_URL" in
  http://127.0.0.1:11434|http://localhost:11434) ;;
  *) printf '[BLOCKED] API URL must be loopback-only: %s\n' "$API_URL"; exit 2 ;;
esac
command -v ollama >/dev/null 2>&1 || { printf '[BLOCKED] Ollama CLI not installed.\n'; exit 2; }
printf 'Ollama CLI: '
ollama --version
printf '\nAPI version:\n'
curl --silent --show-error --fail --connect-timeout 2 --max-time 5 "$API_URL/api/version"
printf '\nAPI tags:\n'
curl --silent --show-error --fail --connect-timeout 2 --max-time 5 "$API_URL/api/tags"
printf '\n'
HOST_ENV="$(launchctl getenv OLLAMA_HOST 2>/dev/null || true)"
if [[ -n "$HOST_ENV" && "$HOST_ENV" != "127.0.0.1:11434" ]]; then
  printf '[FAIL] OLLAMA_HOST is not loopback: %s\n' "$HOST_ENV"; exit 3
fi
if command -v lsof >/dev/null 2>&1; then
  LISTENERS="$(lsof -nP -iTCP:11434 -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$LISTENERS" ]]; then
    printf '[WARN] lsof did not report a listener; API answered, but bind address is unverified.\n'
  else
    printf '\nListener:\n%s\n' "$LISTENERS"
    if ! printf '%s\n' "$LISTENERS" | awk '/TCP/ { addr=$9; if (addr !~ /^(127\.0\.0\.1|\[::1\]|localhost):11434$/) bad=1 } END { exit bad }'; then
      printf '[FAIL] Listener is not restricted to loopback. Stop Ollama and correct OLLAMA_HOST.\n'
      exit 3
    fi
    printf '[PASS] Listener is loopback-only.\n'
  fi
else
  printf '[WARN] lsof unavailable; bind address not independently checked.\n'
fi
NO_CLOUD="$(launchctl getenv OLLAMA_NO_CLOUD 2>/dev/null || true)"
if [[ "$NO_CLOUD" == "1" ]]; then printf '[PASS] OLLAMA_NO_CLOUD=1\n'; else printf '[WARN] OLLAMA_NO_CLOUD is not 1.\n'; fi
printf '\n[PASS] Local API responded. No model inference or external request was made.\n'
