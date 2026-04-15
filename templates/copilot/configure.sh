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

# Copilot currently has no rendered config templates to copy.
