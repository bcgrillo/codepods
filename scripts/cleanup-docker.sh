#!/bin/bash
# Limpia imágenes Docker de Codepods (dangling o con label com.codepods.managed=true)
# que no estén en uso por ningún contenedor y sean más antiguas que N horas.
# Uso: ./cleanup-docker.sh [--dry-run] [--auto] [--hours N]
# --dry-run : simula sin borrar
# --auto    : no pide confirmación (para llamadas automáticas)
# --hours N : umbral en horas (default: 1)

set -euo pipefail

DRY_RUN=false
AUTO=false
HOURS=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    --auto)    AUTO=true ;;
    --hours)   HOURS="${2:?'--hours requires a value'}"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
  shift
done

CUTOFF=$(date -d "${HOURS} hours ago" +%s 2>/dev/null || date -v -${HOURS}H +%s 2>/dev/null || echo 0)

# IDs de imágenes actualmente usadas por algún contenedor (running o stopped)
IMAGES_IN_USE=$(docker ps -a --format '{{.Image}}' | sort -u)

is_in_use() {
  local id="$1"
  echo "$IMAGES_IN_USE" | grep -qF "$id"
}

is_old_enough() {
  local created_raw="$1"
  local created_ts
  created_ts=$(date -d "$created_raw" +%s 2>/dev/null || echo 0)
  [ "$created_ts" -gt 0 ] && [ "$created_ts" -lt "$CUTOFF" ]
}

echo "Buscando imágenes Codepods sin uso con más de ${HOURS}h..."

IMAGES_TO_PRUNE=""

# 1. Imágenes dangling (sin tag, restos de builds)
while IFS=$'\t' read -r id created_raw; do
  is_in_use "$id" && continue
  is_old_enough "$created_raw" || continue
  IMAGES_TO_PRUNE="${IMAGES_TO_PRUNE}${id} <dangling>"$'\n'
done < <(docker images --format $'{{.ID}}\t{{.CreatedAt}}' -f dangling=true)

# 2. Imágenes con label com.codepods.managed=true (nuestras, con o sin tag)
while IFS=$'\t' read -r id repo_tag created_raw; do
  is_in_use "$id" && continue
  is_old_enough "$created_raw" || continue
  # Evitar duplicados con dangling
  echo "$IMAGES_TO_PRUNE" | grep -qF "$id" && continue
  IMAGES_TO_PRUNE="${IMAGES_TO_PRUNE}${id} ${repo_tag}"$'\n'
done < <(docker images --format $'{{.ID}}\t{{.Repository}}:{{.Tag}}\t{{.CreatedAt}}' \
  --filter "label=com.codepods.managed=true")

IMAGES_TO_PRUNE=$(printf '%s' "$IMAGES_TO_PRUNE" | sed '/^$/d')

if [ -z "$IMAGES_TO_PRUNE" ]; then
  echo "No hay imágenes para borrar."
  exit 0
fi

TOTAL=$(printf '%s\n' "$IMAGES_TO_PRUNE" | wc -l)
echo "Imágenes a borrar ($TOTAL):"
printf '%s\n' "$IMAGES_TO_PRUNE"

if $DRY_RUN; then
  echo "Simulación OK. Ejecuta sin --dry-run para borrar."
  exit 0
fi

if ! $AUTO; then
  read -rp "¿Borrar estas imágenes? (y/N): " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || { echo "Cancelado."; exit 0; }
fi

echo "Borrando..."
while IFS= read -r line; do
  [ -z "$line" ] && continue
  id="${line%% *}"
  docker rmi "$id" 2>/dev/null && echo "  Eliminada: $line" || echo "  Skip (en uso): $id"
done <<< "$IMAGES_TO_PRUNE"

docker system prune -f --volumes=false 2>/dev/null || true
echo "Limpieza completada."
df -h /
