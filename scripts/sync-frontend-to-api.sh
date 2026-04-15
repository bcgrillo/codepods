#!/usr/bin/env bash
set -euo pipefail

FRONTEND_DIR="${1:-src/Codepods.Frontend}"
API_WWWROOT="${2:-src/Codepods.Api/wwwroot}"
FRONTEND_DIST="${FRONTEND_DIR}/dist"

if [ ! -d "${FRONTEND_DIST}" ]; then
  echo "Frontend dist folder not found: ${FRONTEND_DIST}. Run frontend build first." >&2
  exit 1
fi

mkdir -p "${API_WWWROOT}"
rm -rf "${API_WWWROOT:?}/"*
cp -R "${FRONTEND_DIST}/." "${API_WWWROOT}/"

echo "Frontend synced into ${API_WWWROOT}"
