#!/bin/bash
set -euo pipefail

cd /workspace

if [ -n "${COPILOT_MODEL:-}" ]; then
  copilot config set default-model "${COPILOT_MODEL}" >/dev/null 2>&1 || true
fi

exec copilot --resume
