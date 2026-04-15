#!/usr/bin/env bash
set -euo pipefail

TERMINAL_PORT="${CODEPODS_TERMINAL_PORT:-7681}"
WEB_PORT="${CODEPODS_WEB_PORT:-4096}"
if [ -z "$TERMINAL_PORT" ]; then
  echo "Terminal port not configured. Please set CODEPODS_TERMINAL_PORT." >&2
  exit 1
fi

FONT_OPTION="fontSize=${TERM_FONT_SIZE:-14}"
TMUX_CMD=(tmux new-session -A -s main "/usr/local/bin/opencode-start")

pids=()
stop=false

cleanup() {
  for pid in "${pids[@]:-}"; do
    kill "$pid" >/dev/null 2>&1 || true
  done
  pids=()
}

ensure_tmux_config() {
  tmux start-server >/dev/null 2>&1 || true
  tmux source-file "/root/.tmux.conf" >/dev/null 2>&1 || true
}

start_ttyd() {
  ensure_tmux_config
  echo "Starting ttyd on port $TERMINAL_PORT, attaching tmux session 'main'"

  /usr/local/bin/ttyd \
    --port "$TERMINAL_PORT" \
    --writable \
    --client-option disableLeaveAlert=true \
    --client-option "$FONT_OPTION" \
    "${TMUX_CMD[@]}" &
  
  pids+=("$!")
}

start_web() {
  if [ -z "$WEB_PORT" ]; then
    return
  fi
  echo "Starting OpenCode web on port $WEB_PORT"
  cd /workspace
  opencode web --port "$WEB_PORT" --hostname 0.0.0.0 >/tmp/opencode-web.log 2>&1 &
  pids+=("$!")
}

trap 'stop=true; cleanup' INT TERM

start_services() {
  cleanup
  start_ttyd
  start_web
  if [ "${#pids[@]}" -eq 0 ]; then
    return
  fi
  wait -n "${pids[@]}"
}

while true; do
  start_services
  if $stop; then
    break
  fi
  sleep 1
done

cleanup
