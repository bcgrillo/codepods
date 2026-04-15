#!/usr/bin/env bash
set -euo pipefail

REPO="${CODEPODS_REPO:-lualab-xyz/CodexAgentsManager}"
VERSION="${CODEPODS_VERSION:-latest}"
INSTALL_DIR="${CODEPODS_INSTALL_DIR:-$HOME/.local/bin}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required." >&2
  exit 1
fi

if ! command -v tar >/dev/null 2>&1; then
  echo "tar is required." >&2
  exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH" >&2
    exit 1
    ;;
esac

OS="$(uname -s)"
case "$OS" in
  Linux) RID="linux-$ARCH" ;;
  Darwin) RID="osx-$ARCH" ;;
  *)
    echo "Unsupported OS: $OS" >&2
    exit 1
    ;;
esac

if [ "$VERSION" = "latest" ]; then
  VERSION="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
  if [ -z "$VERSION" ]; then
    echo "Failed to resolve latest release tag from GitHub." >&2
    exit 1
  fi
fi

ASSET="codepods-${RID}.tar.gz"
BASE_URL="https://github.com/${REPO}/releases/download/${VERSION}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading ${ASSET} (${VERSION})..."
curl -fL "${BASE_URL}/${ASSET}" -o "${TMP_DIR}/${ASSET}"

if curl -fsSL "${BASE_URL}/checksums.txt" -o "${TMP_DIR}/checksums.txt"; then
  if command -v sha256sum >/dev/null 2>&1; then
    (
      cd "$TMP_DIR"
      sha256sum -c checksums.txt --ignore-missing
    )
  fi
fi

mkdir -p "$INSTALL_DIR"
tar -xzf "${TMP_DIR}/${ASSET}" -C "$TMP_DIR"
install -m 0755 "${TMP_DIR}/codepods" "${INSTALL_DIR}/codepods"

if [ "${CODEPODS_SKIP_DOCKER_CHECK:-}" != "1" ]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "Warning: docker is not installed. 'codepods menu' will fail until docker is available." >&2
  elif ! docker info >/dev/null 2>&1; then
    echo "Warning: docker is installed but not accessible for current user. Fix permissions/daemon before using agent commands." >&2
  fi
fi

echo "Installed: ${INSTALL_DIR}/codepods"
echo "Ensure this directory is in PATH."
echo
echo "IMPORTANT SECURITY NOTE:"
echo "  Codepods generates/uses a local master key for cryptographic operations."
echo "  After first runtime start, locate and back up 'master.key' securely."
echo "  If the key is lost, encrypted secrets cannot be recovered."
echo "  If the key is leaked, an attacker could decrypt stored secrets."
