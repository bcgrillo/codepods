# Codepods

Codepods gestiona contenedores "agente-*" para orquestar sesiones de CLI de IA (OpenCode, Codex, Copilot) desde una VM con Docker.

## Uso básico

```bash
codepods menu
```

El menú interactivo permite crear, entrar, pausar y eliminar agentes.  
Al crear un agente se elige el **tipo** (opencode, codex, copilot) y se genera automáticamente su configuración a partir de las variables de `.env`.

## Tipos de agente

| Tipo | CLI | Config generada | Notas |
|------|-----|-----------------|-------|
| `opencode` | opencode-ai | `~/.opencode/opencode.jsonc` | Proveedor Azure OpenAI |
| `codex` | @openai/codex | `~/.codex/codex.toml` | Proveedor OpenAI / compatible |
| `copilot` | GitHub Copilot CLI | `~/.copilot/*` | Sesiones y auth de Copilot CLI |

Cada tipo tiene su directorio en `templates/<tipo>/` y define su comportamiento desde `manifest.yml` (contrato de runtime: `services`, `mounts`, scripts e iconos).

El API y el core usan `manifest.yml` como fuente de verdad para las rutas del contenedor montadas en `data/<agente>/...`.

Cada tipo también incluye `configure.sh`, un script explícito que indica qué archivos renderizados se copian al contenedor y en qué rutas.

Los campos clave son:

- `description`, para describir el tipo.
- `manifest.yml` define `services` (`id|kind|port`) y `mounts` (`nombre|ruta_contenedor`) como contrato operativo obligatorio.
- `files/**/*.template` define archivos a inyectar dentro del contenedor. La ruta relativa bajo `files/` se interpreta como ruta absoluta en el contenedor (ej.: `files/root/.codex/config.toml.template` -> `/root/.codex/config.toml`).
- `configure.sh` define el mapeo explícito de copia (`origen renderizado` -> `destino en contenedor`) usando `docker cp`.

Las plantillas se renderizan sustituyendo `${VAR}` con los valores de `.env`, se guardan temporalmente en `tmp/codepods/<agente>/configs/<tipo>/` y luego se copian con `docker cp` al contenedor destino para evitar que el propio contenedor cree archivos root-owned en el host.

## Estructura del proyecto

```
manage-agents.sh        # Script principal
templates/            # Definición de cada tipo de agente
  opencode/
    manifest.yml
    files/root/.opencode/opencode.jsonc.template
  codex/
    manifest.yml
    files/root/.codex/config.toml.template
  copilot/
    manifest.yml
docker/                 # Contenedor reservado para utilidades Docker
build-files/
  AGENTS.md             # Instrucciones copiadas en el contenedor
scripts/                # Utilidades auxiliares
src/Codepods.Api/       # Servicio web .NET (OpenAPI/Swagger)
src/Codepods.Cli/       # CLI principal .NET
data/                   # Workspace de cada agente (ignorado en Git)
tmp/                    # Directorios temporales para builds y configs (ignorado en Git)
```

## API Service

```bash
codepods web start
```

- Swagger UI: `https://localhost:8000/swagger`
- OpenAPI: `https://localhost:8000/swagger/v1/swagger.json`
- Health: `https://localhost:8000/health`

Comandos:
- `codepods web start`
- `codepods web stop`
- `codepods web status`
- `codepods web login`
- `codepods web users list|add|remove`
- `codepods web devices list|add|remove`

## Frontend (Vite + shadcn seed)

Se ha añadido una base frontend limpia en `src/Codepods.Frontend` y un repositorio de referencia en `examples/shadcn-admin-reference` (solo para copiar bloques visuales puntuales, no para usarlo como app final).

Flujo recomendado:

```bash
cd src/Codepods.Frontend
npm install
npm run dev
```

Para compilar y sincronizar el build dentro del API (`src/Codepods.Api/wwwroot`):

```bash
cd src/Codepods.Frontend
npm run build:api
```

Al arrancar el API, si existe `wwwroot/index.html`, el servidor también sirve el frontend SPA.

## API Authentication

1. Login:
`POST /api/auth/login` with `username`, `password`, and optional `device_id`.

2. Use token:
Add `Authorization: Bearer <access_token>` for protected endpoints.

3. Current session:
`GET /api/auth/me`

Primera instalación:
- Si la tabla `user` está vacía, se crea automáticamente un superadmin usando `DASH_USER` y `DASH_PASSWORD`.

## Setup

Prerequisitos:
- .NET SDK 8+
- Docker Engine accesible por el usuario actual (`docker info` debe funcionar sin sudo)
- Node.js + npm (instalación compila frontend y lo sincroniza con el API)

Si aparece `permission denied while trying to connect to the docker API at unix:///var/run/docker.sock`:

```bash
sudo groupadd docker 2>/dev/null || true
sudo usermod -aG docker $USER
newgrp docker
```

Después vuelve a validar con:

```bash
docker info
```

1. Copia `.env.example` a `.env` y rellena las variables de tu proveedor
2. Construye la imagen: `docker build -f docker/Dockerfile -t codepods-agent:dev .`
3. Instala CLI de desarrollo: `./install.sh`
4. Ejecuta `codepods menu` y crea tu primer agente

## Release installation (without package manager)

Instalador remoto para binarios release de GitHub:

```bash
curl -fsSL https://raw.githubusercontent.com/lualab-xyz/CodexAgentsManager/main/scripts/install-release.sh | bash
```

Opciones:
- `CODEPODS_VERSION=vX.Y.Z` para fijar versión concreta.
- `CODEPODS_INSTALL_DIR=/custom/bin` para cambiar ruta de instalación.

### Backup de clave maestra (`master.key`)

Codepods usa una clave maestra local para criptografía interna (sesión, fingerprint de dispositivo y cifrado de variables secretas por derivación de subclaves).  
Tras el primer arranque, haz backup seguro de `master.key`:

- Si instalas desde repo (dev): `var/keys/master.key` dentro de la raíz del proyecto.
- Si instalas desde release: la ubicación depende del root efectivo de ejecución; localízala y respáldala en un vault/secret manager.

Si se pierde la clave, no podrás recuperar secretos cifrados existentes.  
Si se filtra, un atacante podría descifrar esos secretos.

## Variables de entorno (`.env`)

Ver `.env.example` para la lista completa. Variables clave:

- **OpenCode/Azure**: `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_BASE_URL`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_MODEL_NAME`, `AZURE_OPENAI_RESOURCE_NAME`
- **Codex/OpenAI**: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `CODEX_MODEL`
- **GitHub**: `GITHUB_TOKEN` (se expone en el contenedor para que tus scripts o CLIs lo usen según necesiten)
- **Copilot CLI**: `COPILOT_GITHUB_TOKEN` (PAT fine-grained con el scope _Copilot Requests_ si trabajas con `copilot --resume`)
- **Copilot CLI**: `COPILOT_MODEL` (modelo por defecto que se aplica al arrancar `copilot --resume --yes`)

## Control de las variables dentro de los agentes

Puedes definir `.env.template` en `templates/shared/` y/o `templates/<tipo>/`. Ambos se renderizan (en ese orden) y se concatenan en `tmp/codepods/<agente>/configs/<tipo>/env/container.env`, que es el archivo que se pasa a `docker run --env-file`. Si no existe ninguno, el lanzamiento recurre al `.env` de la raíz.

## Persistencia de sesiones y configuración

Cada tipo define `mounts` en `templates/<tipo>/manifest.yml` como una lista de entradas `nombre|ruta_contenedor`. Al crear o arrancar un agente, el gestor crea en `data/<agente>/<nombre>` un directorio que se monta en el contenedor en la ruta indicada, garantizando así que la configuración y los estados de sesión se guarden fuera de la imagen. Ejemplos actuales:

| Tipo | Valor de `mounts` | Qué persiste |
|------|-----------------------------|--------------|
| `copilot` | `workspace|/workspace`<br>`config|~/.copilot` | Workspace persistente más configuración y `session-state` |
| `codex` | `workspace|/workspace`<br>`config|~/.codex` | Workspace persistente y rollouts/config |
| `opencode` | `workspace|/workspace`<br>`config|~/.opencode`<br>`share|~/.local/share/opencode` | Workspace general, sesiones globales, logs y config |

Así podemos reconstruir imágenes o reiniciar contenedores sin perder sesiones. Puedes añadir nuevos montajes nombrándolos como prefieras (`sessions`, `data`, etc.) y usarlos en tus scripts de arranque.

La primera entrada de `mounts` siempre debe ser `workspace|/workspace`, ya que esa carpeta se mapea a `/workspace` dentro del contenedor y sirve como punto de trabajo compartido con el host.

## Contextos temporales seguros

El script ahora usa `tmp/codepods/<nombre-de-agente>/` como raíz para todo el trabajo temporal: los contextos de build (`build-context-XXXXX`), los ficheros de configuración intermedios y el bloqueo que impide que se construyan dos veces el mismo agente a la vez (`.building`). Justo antes de mostrar el menú principal se limpia cualquier directorio de `tmp/codepods/` con más de 24h, y se ignora la carpeta `tmp/` en Git para que esos artefactos nunca se versionen. Esto permite construir imágenes desde un contexto controlado y evita que datos residuales de `data/` se cuelen en el build.

## Añadir nuevos tipos de agente

1. Crea `templates/<nombre>/manifest.yml` y define `services` y `mounts`.
2. Añade los templates del contenedor dentro de `templates/<nombre>/files/` usando `.template` (ej.: `files/root/.tu-cli/config.toml.template`). Usa `${VAR}` para referirte a variables del `.env` de la raíz.
3. Añade `templates/<nombre>/.env.template` si necesitas variables exclusivas del tipo.
4. En `manifest.yml`, define `mounts`, asegurándote de que la primera entrada es `workspace|/workspace` para que `/workspace` sea persistente y los montajes restantes cubran config, logs o datos añadidos.
5. Implementa `configure.sh` para copiar explícitamente cada archivo renderizado a su destino dentro del contenedor.

Las plantillas se renderizan sustituyendo `${VAR}` desde `.env`, así que no es necesario habilitar nada adicional.

## Scripts de inicio por tipo

Cada carpeta `templates/<tipo>/` debe incluir un `start.sh` que arranca el CLI del agente. Cuando ejecutas `enter_agent_shell` el script se renderiza (para sustituir variables de `.env`), se copia al contenedor en `/usr/local/bin/<tipo>-start` y se ejecuta cada vez que se reanuda el agente. Esto permite, por ejemplo, que Copilot aplique `COPILOT_MODEL`, que Codex use `CODEX_MODEL` o que OpenCode muestre el selector de sesiones. Si un tipo necesita un `ENTRYPOINT` especial, añádelo al `Dockerfile` de ese tipo.

## Notas

- Los datos de cada agente viven en `data/<nombre>/` (montado como `/workspace`)
- Al eliminar un agente, sus datos se mueven a `data/.trash/<nombre>` (recuperables)
* La config generada se guarda en `tmp/codepods/<agente>/configs/<tipo>/` y se inyecta al contenedor con `docker cp`
