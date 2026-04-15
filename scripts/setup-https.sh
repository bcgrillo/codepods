#!/usr/bin/env bash
# setup-https.sh — Obtiene certificado Let's Encrypt y configura HTTPS para Codepods.
# Requiere: PUBLIC_DOMAIN y CERTBOT_EMAIL definidos en .env
# Uso: sudo ./scripts/setup-https.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: no se encontró .env en $REPO_ROOT"
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

if [ -z "${PUBLIC_DOMAIN:-}" ]; then
  echo "Error: PUBLIC_DOMAIN no está definido en .env"
  exit 1
fi

if [ -z "${CERTBOT_EMAIL:-}" ]; then
  echo "Error: CERTBOT_EMAIL no está definido en .env"
  exit 1
fi

# Usuario que ejecutará la API (el que invocó sudo, o el usuario actual)
DASH_SERVICE_USER="${SUDO_USER:-$USER}"
# Si el servicio systemd ya existe, leer el usuario de ahí (más fiable)
SERVICE_FILE="/etc/systemd/system/codepods-dashboard.service"
if [ -f "$SERVICE_FILE" ]; then
  _svc_user=$(grep "^User=" "$SERVICE_FILE" | cut -d= -f2 | tr -d '[:space:]')
  [ -n "$_svc_user" ] && DASH_SERVICE_USER="$_svc_user"
fi

echo "==> Dominio:        $PUBLIC_DOMAIN"
echo "==> Email:          $CERTBOT_EMAIL"
echo "==> Usuario servicio: $DASH_SERVICE_USER"

# ---------------------------------------------------------------------------
# 1. Instalar certbot si no está presente
# ---------------------------------------------------------------------------
PKGS_NEEDED=""
command -v certbot >/dev/null 2>&1 || PKGS_NEEDED="$PKGS_NEEDED certbot"

if [ -n "$PKGS_NEEDED" ]; then
  echo "==> Instalando:$PKGS_NEEDED…"
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq
    apt-get install -y $PKGS_NEEDED
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y $PKGS_NEEDED
  else
    echo "Error: no se pudo instalar automáticamente. Instala manualmente:$PKGS_NEEDED"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# 2. Obtener / renovar certificado
# ---------------------------------------------------------------------------
CERT_DIR="/etc/letsencrypt/live/$PUBLIC_DOMAIN"

if [ -d "$CERT_DIR" ]; then
  echo "==> Certificado ya existente en $CERT_DIR. Intentando renovar…"
  certbot renew --non-interactive --quiet
else
  echo "==> Obteniendo certificado para $PUBLIC_DOMAIN…"
  # --standalone usa el puerto 80 temporalmente (debe estar abierto en el NSG).
  certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "$CERTBOT_EMAIL" \
    -d "$PUBLIC_DOMAIN"
fi

echo "==> Certificado listo en $CERT_DIR"

# ---------------------------------------------------------------------------
# 3. Copiar certs a /etc/codepods/certs/ con permisos del usuario del servicio
# ---------------------------------------------------------------------------
_copy_certs() {
  local domain="$1"
  local user="$2"
  local dest="/etc/codepods/certs/$domain"
  echo "==> Copiando certs a $dest (propietario: $user)…"
  mkdir -p "$dest"
  cp -L "/etc/letsencrypt/live/$domain/fullchain.pem" "$dest/fullchain.pem"
  cp -L "/etc/letsencrypt/live/$domain/privkey.pem"   "$dest/privkey.pem"
  chmod 644 "$dest/fullchain.pem"
  chmod 600 "$dest/privkey.pem"
  chown -R "$user:" "$dest"
}
_copy_certs "$PUBLIC_DOMAIN" "$DASH_SERVICE_USER"

# ---------------------------------------------------------------------------
# 4. Hook de renovación: reaplica ACL y reinicia el servicio systemd si existe
# ---------------------------------------------------------------------------
HOOK_FILE="/etc/letsencrypt/renewal-hooks/deploy/codepods-reload.sh"
echo "==> Instalando hook de renovación en $HOOK_FILE…"
cat > "$HOOK_FILE" << HOOK
#!/usr/bin/env bash
# Copia certs renovados a /etc/codepods/certs/ y reinicia el servicio de Codepods.
DOMAIN="$PUBLIC_DOMAIN"
DEST="/etc/codepods/certs/\$DOMAIN"
mkdir -p "\$DEST"
cp -L "/etc/letsencrypt/live/\$DOMAIN/fullchain.pem" "\$DEST/fullchain.pem"
cp -L "/etc/letsencrypt/live/\$DOMAIN/privkey.pem"   "\$DEST/privkey.pem"
chmod 644 "\$DEST/fullchain.pem"
chmod 600 "\$DEST/privkey.pem"
chown -R "$DASH_SERVICE_USER:" "\$DEST"
if systemctl is-active --quiet codepods-dashboard.service; then
  systemctl restart codepods-dashboard.service
  echo "codepods-dashboard reiniciado tras renovación de certificado."
fi
HOOK
chmod +x "$HOOK_FILE"

# ---------------------------------------------------------------------------
# 5. Renovación automática via cron
# ---------------------------------------------------------------------------
CRON_FILE="/etc/cron.d/certbot-codepods"
if [ ! -f "$CRON_FILE" ]; then
  echo "==> Configurando cron de renovación automática…"
  echo "0 3 * * * root certbot renew --quiet" > "$CRON_FILE"
  chmod 644 "$CRON_FILE"
fi

# ---------------------------------------------------------------------------
# 6. Reiniciar el servicio si ya está instalado, o mostrar próximos pasos
# ---------------------------------------------------------------------------
echo ""
if systemctl is-active --quiet codepods-dashboard.service 2>/dev/null; then
  echo "==> Reiniciando codepods-dashboard.service con SSL…"
  systemctl restart codepods-dashboard.service
  sleep 2
  systemctl status codepods-dashboard.service --no-pager -l | head -20
else
  echo "Próximo paso: inicia la API ejecutando:"
  echo "  codepods web start"
fi

echo ""
echo "✅ HTTPS configurado correctamente."
echo "  API (Swagger): https://$PUBLIC_DOMAIN:8000/docs"
echo "  Relay range: https://$PUBLIC_DOMAIN:${RELAY_PORT_MIN:-10000}-${RELAY_PORT_MAX:-10100}"
