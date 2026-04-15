# Renovación automática de certificados con Azure DNS (DNS-01)

Por defecto `setup-https.sh` usa el método **HTTP-01** (puerto 80).  
Si quieres cerrar el puerto 80 en el NSG y que las renovaciones automáticas sigan funcionando, migra al método **DNS-01** con el plugin `certbot-dns-azure`.

## Requisitos previos

- Zona DNS gestionada en Azure DNS (puede ser el dominio público de Azure: `*.westeurope.cloudapp.azure.com`)
- `az` CLI autenticado en la VM o acceso a una cuenta con permisos para crear service principals

---

## Paso 1 — Crear Service Principal con permisos DNS

```bash
# Variables — ajusta a tu entorno
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
RESOURCE_GROUP=<resource-group-de-tu-zona-dns>
DNS_ZONE=<tu-dominio>   # ej: codepods.westeurope.cloudapp.azure.com

# Crear service principal con rol DNS Zone Contributor
az ad sp create-for-rbac \
  --name "certbot-dns-codepods" \
  --role "DNS Zone Contributor" \
  --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.Network/dnszones/$DNS_ZONE"
```

Guarda el output — necesitarás `appId`, `password` y `tenant`.

---

## Paso 2 — Instalar plugin y crear fichero de credenciales (en la VM)

```bash
# Instalar plugin
pip install certbot-dns-azure

# Crear fichero de credenciales (fuera del repo)
sudo mkdir -p /etc/letsencrypt
sudo tee /etc/letsencrypt/azure-dns.ini << EOF
dns_azure_sp_client_id = <appId>
dns_azure_sp_client_secret = <password>
dns_azure_tenant_id = <tenant>
dns_azure_environment = AzurePublicCloud
dns_azure_zone1 = $DNS_ZONE:/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP
EOF
sudo chmod 600 /etc/letsencrypt/azure-dns.ini
```

---

## Paso 3 — Obtener/reemplazar certificado con DNS-01

```bash
source /workspace/CodexAgentsManager/.env   # carga PUBLIC_DOMAIN y CERTBOT_EMAIL

sudo certbot certonly \
  --dns-azure \
  --dns-azure-credentials /etc/letsencrypt/azure-dns.ini \
  --dns-azure-propagation-seconds 30 \
  --non-interactive --agree-tos \
  --email "$CERTBOT_EMAIL" \
  -d "$PUBLIC_DOMAIN" \
  --force-renewal
```

Tras esto certbot recuerda el método DNS-01 en `/etc/letsencrypt/renewal/<dominio>.conf`.  
El cron instalado por `setup-https.sh` (`/etc/cron.d/certbot-codepods`) ya no necesitará el puerto 80.

---

## Paso 4 — Cerrar puerto 80 en el NSG (opcional)

Una vez migrado a DNS-01 puedes eliminar la regla de entrada del puerto 80 en el NSG de Azure.

---

## Notificaciones de expiración

Let's Encrypt envía un email a `CERTBOT_EMAIL` ~20 días antes de que expire el cert si no se ha renovado.  
Los certs duran **90 días**; el cron renueva automáticamente a los **60 días**.

Para monitorizar renovaciones manualmente:
```bash
sudo certbot certificates          # estado actual
sudo journalctl -u cron | grep certbot   # historial del cron
```
