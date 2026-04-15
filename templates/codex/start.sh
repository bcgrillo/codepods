#!/bin/bash
set -euo pipefail

cd /workspace

exec codex resume --all
