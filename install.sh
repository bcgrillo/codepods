#!/usr/bin/env bash
set -euo pipefail

# Codepods dev installer: publishes .NET CLI and registers 'codepods' command
# Determine script directory robustly (works when invoked via sudo or non-bash shells)
# Use BASH_SOURCE when available, otherwise fall back to $0, and resolve symlinks.
SOURCE="${BASH_SOURCE[0]:-$0}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
SCRIPT_DIR="$(cd -P "$(dirname "$SOURCE")" >/dev/null 2>&1 && pwd)"
cd "$SCRIPT_DIR"

if ! command -v dotnet >/dev/null 2>&1; then
  echo "dotnet is required but not found in PATH." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required but not found in PATH." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but not found in PATH." >&2
  exit 1
fi

NODE_VERSION_RAW="$(node -v | sed 's/^v//')"
NODE_MAJOR="$(echo "$NODE_VERSION_RAW" | cut -d. -f1)"
NODE_MINOR="$(echo "$NODE_VERSION_RAW" | cut -d. -f2)"
if [ "${NODE_MAJOR:-0}" -lt 20 ] || { [ "${NODE_MAJOR:-0}" -eq 20 ] && [ "${NODE_MINOR:-0}" -lt 19 ]; }; then
  echo "Node.js >= 20.19 is required (detected: v$NODE_VERSION_RAW)." >&2
  echo "Current frontend stack uses Tailwind CSS v4 and requires a newer Node runtime." >&2
  echo "Upgrade Node and re-run install. Example with nvm:" >&2
  echo "  nvm install 20.19.0" >&2
  echo "  nvm use 20.19.0" >&2
  exit 1
fi

if [ "${CODEPODS_SKIP_DOCKER_CHECK:-}" != "1" ]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker is required but not found in PATH." >&2
    exit 1
  fi

  if ! docker info >/dev/null 2>&1; then
    echo "docker is installed but not accessible for current user (daemon stopped or missing permissions)." >&2
    echo "Run 'docker info' and fix access before using codepods menu." >&2
    echo "Typical Ubuntu fix:" >&2
    echo "  sudo groupadd docker 2>/dev/null || true" >&2
    echo "  sudo usermod -aG docker \$USER" >&2
    echo "  newgrp docker" >&2
    exit 1
  fi
fi

CACHE_DIR="$SCRIPT_DIR/.install/cache"
mkdir -p "$CACHE_DIR"

hash_tree() {
  local root="$1"
  if [ ! -d "$root" ]; then
    echo ""
    return
  fi

  find "$root" -type f \
    ! -path "*/node_modules/*" \
    ! -path "*/dist/*" \
    ! -path "*/bin/*" \
    ! -path "*/obj/*" \
    -print0 \
    | sort -z \
    | xargs -0 sha256sum \
    | sha256sum \
    | awk '{print $1}'
}

frontend_tooling_ready() {
  [ -x "node_modules/.bin/tsc" ] && [ -x "node_modules/.bin/vite" ]
}

verify_tailwind_oxide_binding() {
  node -e "require('@tailwindcss/oxide')" >/dev/null 2>&1
}

detect_linux_oxide_package() {
  if [ "$(uname -s)" != "Linux" ]; then
    echo ""
    return
  fi

  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64)
      if command -v ldd >/dev/null 2>&1 && ldd --version 2>&1 | grep -qi musl; then
        echo "@tailwindcss/oxide-linux-x64-musl"
      else
        echo "@tailwindcss/oxide-linux-x64-gnu"
      fi
      ;;
    aarch64|arm64)
      if command -v ldd >/dev/null 2>&1 && ldd --version 2>&1 | grep -qi musl; then
        echo "@tailwindcss/oxide-linux-arm64-musl"
      else
        echo "@tailwindcss/oxide-linux-arm64-gnu"
      fi
      ;;
    *)
      echo ""
      ;;
  esac
}

ensure_linux_oxide_package() {
  local pkg
  pkg="$(detect_linux_oxide_package)"
  if [ -z "$pkg" ]; then
    return 0
  fi

  if ! node -e "require('${pkg}')" >/dev/null 2>&1; then
    echo "Installing or repairing Tailwind Linux native package: $pkg"
    npm install --no-save --force "$pkg"
  fi
}

repair_tailwind_oxide_state() {
  local lock_hash_file="$1"
  echo "Repairing frontend dependencies for Tailwind native binding..."
  rm -rf node_modules package-lock.json
  npm install --include=optional
  ensure_linux_oxide_package
  if [ -f package-lock.json ]; then
    sha256sum package-lock.json | awk '{print $1}' > "$lock_hash_file"
  fi
}

is_tailwind_oxide_error() {
  local log_file="$1"
  grep -qi "Cannot find native binding" "$log_file" || grep -qi "@tailwindcss/oxide" "$log_file"
}

run_frontend_build_with_recovery() {
  local lock_hash_file="$1"
  local log_file
  log_file="$(mktemp)"

  set +e
  npm run build:api 2>&1 | tee "$log_file"
  local build_exit="${PIPESTATUS[0]}"
  set -e

  if [ "$build_exit" -eq 0 ]; then
    rm -f "$log_file"
    return 0
  fi

  if is_tailwind_oxide_error "$log_file"; then
    echo "Detected broken Tailwind optional dependency state."
    repair_tailwind_oxide_state "$lock_hash_file"
    npm run build:api
    rm -f "$log_file"
    return 0
  fi

  rm -f "$log_file"
  return "$build_exit"
}

echo "Preparing frontend and syncing to API wwwroot..."
pushd src/Codepods.Frontend >/dev/null

FRONTEND_LOCK_HASH_FILE="$CACHE_DIR/frontend-lock.hash"
FRONTEND_BUILD_HASH_FILE="$CACHE_DIR/frontend-build.hash"
CURRENT_LOCK_HASH=""
if [ -f package-lock.json ]; then
  CURRENT_LOCK_HASH="$(sha256sum package-lock.json | awk '{print $1}')"
fi
LAST_LOCK_HASH="$(cat "$FRONTEND_LOCK_HASH_FILE" 2>/dev/null || true)"

if [ -d node_modules ] && [ -n "$CURRENT_LOCK_HASH" ] && [ "$CURRENT_LOCK_HASH" = "$LAST_LOCK_HASH" ]; then
  echo "Frontend dependencies unchanged, skipping npm install."
else
  echo "Installing frontend dependencies..."
  if [ -f package-lock.json ]; then
    npm ci --include=dev --include=optional
  else
    npm install --include=dev --include=optional
  fi
  if [ -n "$CURRENT_LOCK_HASH" ]; then
    echo "$CURRENT_LOCK_HASH" > "$FRONTEND_LOCK_HASH_FILE"
  fi
fi

if ! frontend_tooling_ready; then
  echo "Frontend toolchain is incomplete (missing tsc/vite). Reinstalling dependencies..."
  rm -rf node_modules
  if [ -f package-lock.json ]; then
    npm ci --include=dev --include=optional
  else
    npm install --include=dev --include=optional
  fi
  if [ -f package-lock.json ]; then
    sha256sum package-lock.json | awk '{print $1}' > "$FRONTEND_LOCK_HASH_FILE"
  fi
fi

if ! verify_tailwind_oxide_binding; then
  echo "Tailwind native binding check failed."
  ensure_linux_oxide_package
fi

if ! verify_tailwind_oxide_binding; then
  echo "Tailwind native binding still unavailable after package check."
  repair_tailwind_oxide_state "$FRONTEND_LOCK_HASH_FILE"
fi

CURRENT_FRONTEND_HASH="$(hash_tree "$SCRIPT_DIR/src/Codepods.Frontend")"
LAST_FRONTEND_HASH="$(cat "$FRONTEND_BUILD_HASH_FILE" 2>/dev/null || true)"

if [ -n "$CURRENT_FRONTEND_HASH" ] && [ "$CURRENT_FRONTEND_HASH" = "$LAST_FRONTEND_HASH" ] && [ -f "$SCRIPT_DIR/src/Codepods.Api/wwwroot/index.html" ]; then
  echo "Frontend sources unchanged, skipping frontend build."
else
  run_frontend_build_with_recovery "$FRONTEND_LOCK_HASH_FILE"
  CURRENT_FRONTEND_HASH="$(hash_tree "$SCRIPT_DIR/src/Codepods.Frontend")"
  if [ -n "$CURRENT_FRONTEND_HASH" ]; then
    echo "$CURRENT_FRONTEND_HASH" > "$FRONTEND_BUILD_HASH_FILE"
  fi
fi

popd >/dev/null

echo "Restoring .NET projects..."
dotnet restore Codepods.sln

echo "Building API project (Release, incremental)..."
dotnet build src/Codepods.Api/Codepods.Api.csproj -c Release --no-restore

echo "Building CLI project (Release, incremental)..."
dotnet build src/Codepods.Cli/Codepods.Cli.csproj -c Release --no-restore

echo "Publishing Codepods CLI (.NET)..."
INSTALL_DIR="$SCRIPT_DIR/.install/bin"
mkdir -p "$INSTALL_DIR"
dotnet publish src/Codepods.Cli/Codepods.Cli.csproj -c Release --no-build --no-restore -o "$INSTALL_DIR"

echo "Making CLI script executable..."
chmod +x scripts/codepods

if [ -w /usr/local/bin ]; then
  echo "Linking 'codepods' shim into /usr/local/bin..."
  rm -f /usr/local/bin/codepods
  cat <<EOF > /usr/local/bin/codepods
#!/usr/bin/env bash
set -e
# Absolute repo root (embedded at install time)
REPO_ROOT="$SCRIPT_DIR"
exec env CODEPODS_ROOT_PATH="\${REPO_ROOT}" dotnet "\${REPO_ROOT}/.install/bin/Codepods.Cli.dll" "\$@"
EOF
  chmod +x /usr/local/bin/codepods
  echo "-> codepods command is now available globally"
else
  echo "Note: To use 'codepods' globally, create a wrapper script or symlink manually." >&2
  echo "Example (wrapper):" >&2
  echo "  cat > /usr/local/bin/codepods <<'SHIM' && chmod +x /usr/local/bin/codepods" >&2
  echo "  #!/usr/bin/env bash" >&2
  echo "  REPO_ROOT=\"$SCRIPT_DIR\"" >&2
  echo "  exec env CODEPODS_ROOT_PATH=\"\$REPO_ROOT\" dotnet \"\$REPO_ROOT/.install/bin/Codepods.Cli.dll\" \"\$@\"" >&2
  echo "  SHIM" >&2
fi

echo "Installation complete. Run 'codepods --help' for usage."
echo
echo "IMPORTANT SECURITY NOTE:"
echo "  Codepods uses a local master key for cryptographic operations."
echo "  After first runtime start, back up this key securely:"
echo "    $SCRIPT_DIR/var/keys/master.key"
echo "  If this key is lost, encrypted secrets cannot be recovered."
echo "  If this key is leaked, an attacker could decrypt stored secrets."

if [ -t 0 ] && [ -t 1 ]; then
  echo
  read -r -p "Do you want to start/restart Codepods web now? [y/N] " answer
  case "$answer" in
    [yY]|[yY][eE][sS])
      echo "Restarting Codepods web..."
      codepods web restart
      ;;
    *)
      echo "You can start it later with: codepods web start"
      ;;
  esac
fi
