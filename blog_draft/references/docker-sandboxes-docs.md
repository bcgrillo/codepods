# Docker Sandboxes — Documentación oficial (docs.docker.com)

**URLs consultadas**:
- https://docs.docker.com/ai/sandboxes/ (overview)
- https://docs.docker.com/ai/sandboxes/architecture/ (arquitectura)
- https://docs.docker.com/ai/sandboxes/security/ (security model)
- https://docs.docker.com/ai/sandboxes/security/isolation/ (isolation layers)
- https://docs.docker.com/reference/cli/sbx/ (CLI reference)
- https://docs.docker.com/ai/sandboxes/docker-desktop/ → 404 (no existe)

**Recuperado**: 2026-09-11

## Resumen de contenido

Docker Sandboxes ejecuta agentes de programación de IA en microVMs aisladas.
Cada sandbox tiene su propio daemon Docker, filesystem y red. El agente puede
buildar contenedores, instalar paquetes y modificar archivos sin acceder a
recursos del host más allá de los que se comparten explícitamente.

### Producto
- **CLI**: `sbx` — gratuito, incluyendo uso comercial. Solo la gobernanza
  organizacional requiere suscripción de pago.
- Comando básico: `sbx run claude` (lanza Claude Code en un sandbox montando el
  directorio actual).
- Agentes soportados: Claude Code, Gemini, Codex, Kiro.

### Modelo de seguridad

**Trust boundary principal**: la microVM. El agente tiene control total dentro de
la VM, incluyendo sudo. La VM boundary previene que el agente alcance cualquier
cosa en el host excepto lo que se comparte explícitamente.

**Qué cruza la frontera hacia la VM**:
- Directorio workspace del host (read-write con direct mount, o read-only con
  `--clone` para que el agente trabaje en un clon privado).
- Credenciales: un proxy del lado del host inyecta headers de autenticación en
  peticiones HTTP salientes. Los valores de credenciales nunca entran en la VM.
- Acceso de red: conexiones TCP salientes a destinos permitidos por la política
  de red se proxean a través del host.
- Skills compartidas del agente: store persistente del host montado read-write.
- Tráfico MCP gateway: el agente se conecta a un endpoint MCP gateway del host.

**Qué cruza de vuelta al host**:
- Cambios en archivos del workspace (visibles en tiempo real con direct mount).
- Conexiones TCP salientes a destinos permitidos.
- Cambios en el store de skills compartidas.

**Lo que el agente NO puede hacer**:
- Acceder al filesystem del host fuera del workspace y skills compartidas.
- Acceder al daemon Docker del host.
- Acceder directamente a la red del host.
- Comunicarse directamente entre sandboxes por red.
- UDP e ICMP externos directos están bloqueados a nivel de red.

### Cinco capas de aislamiento

1. **Hypervisor isolation**: kernel separado por sandbox. No hay memoria ni
   procesos compartidos con el host. Los procesos dentro de la VM son invisibles
   para el host y para otros sandboxes. Symlinks que apuntan fuera del workspace
   no se siguen. `sbx rm` elimina la VM y todo su contenido.

2. **Network isolation**: cada sandbox tiene su propia red aislada. Los sandboxes
   no pueden comunicarse directamente entre sí ni compartir red con el host. Todo
   el tráfico TCP saliente pasa por un proxy en el host que aplica la política de
   red (deny-by-default). UDP e ICMP externos directos bloqueados. Las consultas
   DNS usan el resolver interno del sandbox.

3. **Docker Engine isolation**: cada sandbox tiene su propio Docker Engine
   aislado del daemon del host. Cuando el agente ejecuta `docker build` o
   `docker compose up`, esos comandos se ejecutan contra ese engine. El agente
   no tiene camino al daemon Docker del host. Esto evita la práctica peligrosa
   de montar `docker.sock` del host.

4. **Workspace isolation**: tres modos:
   - **Mountless**: no se comparte workspace del host. El agente trabaja en el
     filesystem del sandbox.
   - **Direct mount** (default con `sbx run`): el agente tiene acceso read-write
     al working tree. Los cambios aparecen en el host inmediatamente.
   - **Clone mode** (`--clone`): el repositorio se monta read-only y el agente
     trabaja en un clon privado dentro de la VM. Los cambios no llegan al host
     hasta que se hace fetch.

5. **Credential isolation**: las API keys se inyectan en headers HTTP por un
   proxy del lado del host. Los valores de credenciales nunca entran en la VM.

### Consideraciones de seguridad destacadas

- En modo direct, los cambios en el workspace son live en el host. El agente edita
  los mismos archivos que ves. Esto incluye archivos que se ejecutan implícitamente:
  Git hooks (`.git/hooks/`), CI config, IDE task configs, AI project config
  (`.claude/`, `.codex/`, `.gemini/`), Makefile, package.json scripts.
- Los Git hooks están dentro de `.git/` y no aparecen en `git diff` — hay que
  revisarlos por separado.
- Los dominios permitidos por defecto incluyen wildcards amplios (ej.
  `*.googleapis.com` cubre muchos servicios más allá de APIs de IA). Se puede
  revisar con `sbx policy ls`.
- Los kits ejecutan comandos de instalación con root dentro del sandbox. `sbx`
  restringe las fuentes de kits a una allowlist (por defecto solo Docker Hub).
- Las skills compartidas crean una excepción estrecha al aislamiento entre
  sandboxes: el store se monta read-write, así que un sandbox puede modificar
  instrucciones o scripts que un agente usa en otro sandbox.
- Los servidores MCP stdio locales corren fuera de la VM del sandbox (en el
  host). Si un MCP server local arranca un contenedor Docker, usa Docker del host.

### Comandos CLI principales (`sbx`)

| Comando | Descripción |
|---|---|
| `sbx run` | Ejecutar un agente en un sandbox |
| `sbx create` | Crear un sandbox para un agente |
| `sbx attach` | Conectarse a un sandbox cloud en ejecución |
| `sbx exec` | Ejecutar comando dentro de un sandbox |
| `sbx ls` | Listar sandboxes |
| `sbx rm` | Eliminar sandbox(es) |
| `sbx stop` | Detener sin eliminar |
| `sbx cp` | Copiar archivos entre sandbox y host |
| `sbx policy` | Gestionar políticas de red/filesystem |
| `sbx mcp` | Gestionar servidores MCP |
| `sbx secret` | Gestionar secretos almacenados |
| `sbx skills` | Gestionar skills disponibles |
| `sbx template` | Gestionar plantillas de sandbox |
| `sbx ports` | Gestionar publicación de puertos |
| `sbx prune` | Eliminar todos los sandboxes detenidos |

### Gobernanza organizacional
Los admins pueden gestionar centralmente políticas de red, filesystem y MCP para
que los mismos controles se apliquen uniformemente en cada máquina de cada
desarrollador. Requiere suscripción de pago separada.

### Arquitectura (detalle adicional)

**Almacenamiento del workspace**:
- Desde sbx 0.42.0 el workspace es opcional en `sbx create`. Sin workspace del
  host, el sandbox usa el `WORKDIR` de la imagen template
  (`/home/agent/workspace` por defecto).
- El workspace con direct mount aparece en la **misma ruta absoluta** que en el
  host (mensajes de error, configs y builds referencian rutas reales del host).
- Aviso: no montar almacenamiento de red (SMB/NFS, unidades de red, carpetas
  sincronizadas en la nube) — cada lectura/escritura iría por red y ralentiza al
  agente.

**Persistencia**:
- Todo dentro del sandbox persiste hasta `sbx rm`: imágenes, contenedores,
  paquetes instalados, estado/historial del agente, archivos en workspaces
  mountless o clonados.
- Cada sandbox mantiene su **propio daemon Docker, caché de imágenes e
  instalaciones**. Varios sandboxes **no comparten** imágenes ni capas — el store
  de skills compartidas es la excepción.
- Cada sandbox consume disco (VM + imágenes + capas + volúmenes) y crece al
  construir imágenes/instalar paquetes.
- Caché Virtiofs activada por defecto en direct mount (mejora lecturas pesadas
  como `git status`); se desactiva con `DOCKER_SANDBOXES_ENABLE_VIRTIOFS_CACHE=0`.

**Red (más detalle)**:
- Todo el TCP saliente pasa por un proxy del host. HTTP/HTTPS usan forward proxy;
  otro TCP se reenvía de forma transparente. Ambos aplican la política de red.
- El forward proxy además inyecta credenciales.
- El proxy del host usa la configuración de red/routing del host: si un destino
  requiere un **proxy upstream**, reenvía la petición. Encadenar a un upstream
  proxy hace que el tráfico del sandbox respete los mismos controles de egress
  que otras apps del host. (Soporte de upstream proxy experimental.)

**MCP gateway**:
- Los agentes conectan a **un único endpoint MCP gateway** por sandbox. El gateway
  corre **en el lado del host**, fuera de la frontera.
- Los MCP server registrados pueden ser remotos o **stdio locales lanzados en el
  host** — los stdio locales NO corren dentro de la microVM.
- Si un MCP stdio local está empaquetado como imagen OCI, o si se registra un
  comando docker explícito, **usa Docker del host**.
- La aplicación de políticas MCP ocurre en el gateway (ruta separada del proxy
  HTTP/HTTPS). Se valida el registro del servidor antes de almacenarlo y las
  peticiones gobernadas antes de llamadas a tools, lecturas de recursos,
  recuperación de prompts o meta-tools.

**Lifecycle**:
- `sbx run` inicializa la VM y arranca el agente. Se puede parar/reiniciar sin
  recrear la VM (conserva paquetes, imágenes, archivos).
- Los sandboxes persisten hasta `sbx rm`; parar no borra la VM.
- Con `--clone`, `sbx rm` también elimina el remoto `sandbox-<name>` del repo del host.

### Tabla comparativa (de la doc de Docker) — MUY útil para el artículo

| Enfoque | Aislamiento | Acceso a Docker | Caso de uso |
|---|---|---|---|
| Sandboxes (microVMs) | Full (hypervisor) | Daemon aislado | Agentes autónomos |
| Contenedor con socket montado | Parcial (namespaces) | Daemon del host compartido | Herramientas de confianza |
| Docker-in-Docker | Parcial (privileged) | Daemon anidado | Pipelines CI/CD |
| Ejecución en host | Ninguno | Daemon del host | Desarrollo manual |

> "Los sandboxes cambian mayor overhead de recursos (una VM más su propio daemon)
> por aislamiento completo. Usa contenedores cuando necesites empaquetado ligero
> sin acceso a Docker. Usa sandboxes cuando necesites dar a algo autónomo
> capacidades Docker completas sin confiarle tu entorno de host."

**Otras notas de aislamiento**:
- El agente corre como usuario **no-root con sudo dentro de la VM**. La frontera
  del hipervisor es el control de aislamiento, no la separación de privilegios
  in-VM.
- Procesos en un sandbox local pueden **escribir en el portapapeles del host**,
  pero no leer su contenido existente. Tras ejecutar código no confiable,
  revisar el portapapeles antes de pegar en el host.

### MCP gateway (detalle operativo — docs.docker.com/ai/sandboxes/mcp-gateway/)

Concepto clave para el artículo: Docker resuelve el problema de MCP con un
**gateway único en el lado del host** — exactamente el patrón "gateway/proxy"
que el autor menciona querer para CodePods.

- El gateway del sandbox es **distinto** del Docker Desktop MCP Toolkit.
- Los MCP server se **registran en el host** (`sbx mcp add <name> --url ...` o
  `--command ...`) y no se adjuntan a un sandbox por sí solos; se exponen con
  `--static-mcp` al crear el sandbox o `sbx mcp load` en uno en marcha.
- **Registro y ejecución**:
  - `--url <remote>`: server remoto; el gateway del sandbox conecta a él.
  - `--url <metadata> --local`: resuelve un `server.json`/`server.yaml` que
    describe un paquete OCI stdio y **lo corre en el host con Docker**.
  - `--command <exe> --args ...`: stdio arbitrario (p. ej. `npx`, o
    `docker run -i --rm ...`), **corre en el host**.
- **Advertencia de aislamiento**: *"Los servidores stdio locales corren en el
  host, fuera del aislamiento del sandbox. Si el comando arranca un contenedor
  Docker, ese contenedor usa el aislamiento de Docker del host, no el del
  sandbox. El proceso o contenedor puede acceder a archivos del host, recursos
  de red del host y credenciales que se le den."* ← Esto es oro para el artículo:
  el punto más débil del modelo es justo donde MCP toca el host.
- **SSRF**: si el hostname de `--url` resuelve a dirección privada, loopback,
  link-local o de metadata cloud, `sbx` avisa. *"Registra solo URLs de
  confianza; cargar un manifest de una URL no confiable puede exponer servicios
  internos o metadata cloud, y DNS rebinding puede redirigir un hostname tras
  haberse comprobado."* Se puede silenciar con `--skip-ssrf-check` para
  servidores internos de confianza.
- **OAuth**: las credenciales OAuth se quedan en el host (credential store del
  SO). Cliente confidencial: el secret se guarda con `sbx secret set` en el
  store cifrado del host, no en el registro MCP. Scopes mínimos por defecto (no
  se pide el set completo del servidor).
- La aplicación de políticas MCP es una **ruta separada** del proxy HTTP/HTTPS.