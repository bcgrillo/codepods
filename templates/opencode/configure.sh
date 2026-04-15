#!/usr/bin/env bash
set -euo pipefail

# Codepods configure script context:
# - CODEPODS_AGENT_NAME: container name of the target agent (used by docker exec/cp).
# - CODEPODS_TYPE_RENDER_DIR: rendered files for this template instance (source of files to copy).
# - CODEPODS_SHARED_RENDER_DIR: rendered files from templates/shared (available when include_shared_template_files=true).

if [ -z "${CODEPODS_AGENT_NAME:-}" ]; then
  echo "CODEPODS_AGENT_NAME is required" >&2
  exit 1
fi

if [ -z "${CODEPODS_TYPE_RENDER_DIR:-}" ]; then
  echo "CODEPODS_TYPE_RENDER_DIR is required" >&2
  exit 1
fi

AGENT_NAME="${CODEPODS_AGENT_NAME}"
TYPE_DIR="${CODEPODS_TYPE_RENDER_DIR}"

copy_file() {
  local source_path="$1"
  local target_path="$2"

  if [ ! -f "$source_path" ]; then
    return 0
  fi

  docker exec "$AGENT_NAME" mkdir -p "$(dirname "$target_path")"
  docker cp "$source_path" "$AGENT_NAME:$target_path"
}

copy_file "$TYPE_DIR/root/.opencode/opencode.jsonc" "/root/.opencode/opencode.jsonc"
copy_file "$TYPE_DIR/root/.opencode/tui.json" "/root/.opencode/tui.json"
copy_file "$TYPE_DIR/root/.local/share/opencode/auth.json" "/root/.local/share/opencode/auth.json"
