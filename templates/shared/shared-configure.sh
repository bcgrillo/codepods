#!/usr/bin/env bash
set -euo pipefail

# Codepods configure script context:
# - CODEPODS_AGENT_NAME: container name of the target agent (used by docker exec/cp).
# - CODEPODS_SHARED_RENDER_DIR: rendered files from templates/shared (source of files to copy).
# - CODEPODS_TYPE_RENDER_DIR: rendered files for the selected template (available when needed by custom logic).

if [ -z "${CODEPODS_AGENT_NAME:-}" ]; then
  echo "CODEPODS_AGENT_NAME is required" >&2
  exit 1
fi

if [ -z "${CODEPODS_SHARED_RENDER_DIR:-}" ]; then
  echo "CODEPODS_SHARED_RENDER_DIR is required" >&2
  exit 1
fi

AGENT_NAME="${CODEPODS_AGENT_NAME}"
SHARED_DIR="${CODEPODS_SHARED_RENDER_DIR}"

copy_file() {
  local source_path="$1"
  local target_path="$2"

  if [ ! -f "$source_path" ]; then
    return 0
  fi

  docker exec "$AGENT_NAME" mkdir -p "$(dirname "$target_path")"
  docker cp "$source_path" "$AGENT_NAME:$target_path"
}

copy_file "$SHARED_DIR/root/.tmux.conf" "/root/.tmux.conf"
