# Claude Code — Sandboxing y Sandbox Environments

**URLs consultadas**:
- https://code.claude.com/docs/en/sandboxing (Configure the sandboxed Bash tool)
- https://code.claude.com/docs/en/sandbox-environments (Choose a sandbox environment)

**Recuperado**: 2026-09-11

## Configure the sandboxed Bash tool

El Bash sandbox de Claude Code permite ejecutar la mayoría de comandos shell sin
detenerse a pedir permiso. En lugar de aprobar cada comando, defines qué archivos
y dominios de red pueden tocar, y el sistema operativo aplica esa frontera a
cada comando Bash y sus subprocesos.

### Plataformas
- **macOS**: usa el framework Seatbelt integrado. Sin instalación.
- **Linux y WSL2**: requiere `bubblewrap` (aislamiento de filesystem) y `socat`
  (relay para tráfico de red vía proxy). Filtro seccomp opcional para bloquear
  Unix domain sockets.
- **Windows nativo**: no soportado. Usar WSL2.

### Modos de sandbox
1. **Auto-allow mode**: ejecuta comandos sandboxed sin prompting. La primera vez
   que un comando necesita un dominio de red nuevo, pide aprobación o lo envía
   al classifier.
2. **Regular permissions mode**: mantiene los prompts de permiso normales incluso
   con comandos sandboxed.

### Aislamiento
- **Filesystem isolation**: comandos pueden escribir en el working directory,
  directorio temp de sesión, y directorios añadidos con `--add-dir`.
- **Network isolation**: dominios de red aprobados. Primera vez que se necesita
  un dominio nuevo, prompt o classifier.
- **OS-level enforcement**: usa Seatbelt (macOS) o bubblewrap (Linux).

### Credenciales
- **Mask credentials**: oculta valores de credenciales.
- **Mask environment variables**: oculta vars de entorno sensibles.
- **Re-sign AWS requests**: re-firma peticiones AWS dentro del sandbox.
- **Mask credential files**: oculta archivos de credenciales.

### Configuración organizacional
- `sandbox.enabled: true` en user settings (`~/.claude/settings.json`) para todos
  los proyectos.
- Managed settings para forzar sandboxing en toda la organización.
- `sandbox.failIfUnavailable: true` para hacer fallo hard si el sandbox no puede
  arrancar (para despliegues gestionados que requieren sandbox como security gate).

### Limitaciones
- Solo aísla comandos Bash y sus subprocesos. File tools, MCP servers y hooks
  corren directamente en el host.
- El aislamiento no cambia lo que se envía al modelo: prompts y archivos leídos
  se transmiten a la API de Anthropic con o sin sandbox.

---

## Choose a sandbox environment

Compara opciones de aislamiento para Claude Code, desde sandbox ligero por
comando hasta VM completa.

### Tabla comparativa

| Enfoque | Qué aísla | Requiere Docker | Esfuerzo setup |
|---|---|---|---|
| Sandboxed Bash tool | Comandos Bash y subprocesos | No | Mínimo macOS; bajo Linux/WSL2 |
| Sandbox runtime | Todo el proceso Claude Code (file tools, MCP, hooks) | No | Bajo |
| Dev container | Entorno de desarrollo completo | Sí | Medio |
| Custom container | Entorno de desarrollo completo | Sí | Medio-alto |
| Virtual machine | Sistema operativo completo | No | Alto |
| Claude Code on the web | SO completo, hospedado por Anthropic | No | Ninguno |

### Mensaje clave
> "The sandboxed Bash tool is built into Claude Code and restricts only Bash
> commands. Built-in file tools, MCP servers, and hooks still run directly on
> your host. Every other approach in the table puts the whole Claude Code process
> inside the isolation boundary, so file tools, MCP servers, and hooks are
> restricted too."

### Cuándo elegir qué
- **Reducir prompts en trabajo diario**: Sandboxed Bash tool con `/sandbox`.
- **Trabajo desatendido** (`--dangerously-skip-permissions` o auto mode): dev
  container, VM o sandbox runtime.
- **Aislar MCP servers y hooks sin Docker**: sandbox runtime.
- **Repositorio no confiable**: VM dedicada o Claude Code on the web.
- **Estandarizar en un equipo**: dev container preconfigurado en el repo.
- **Sin setup local**: Claude Code on the web.
- **Forzar en organización**: managed settings.

### Relación con permission modes
- Permission modes deciden si un tool call se ejecuta y si se te prompting.
- Isolation restringe a qué puede acceder un comando una vez se ejecuta.
- Con `--dangerously-skip-permissions`: Claude actúa sin preguntar. La frontera
  de aislamiento es lo que protege el sistema. Siempre usar dentro de container,
  VM o sandbox runtime.
- Auto mode: reemplaza el prompt con un classifier. No es frontera de aislamiento.
- Se pueden combinar: sandboxed Bash tool dentro de un container/VM da restricciones
  OS-level encima del boundary del entorno.

### Limitaciones de seguridad (importante para el artículo)
> "Sandbox isolation reduces the impact of a breach, but it does not eliminate
> risk. Any approach that allows network egress can still leak data the agent can
> read, and any approach that mounts your project directory writable can still
> modify that code."

> "Isolation also does not change what is sent to the model. Your prompts and the
> files Claude reads are transmitted to the Anthropic API or your configured
> provider with or without a sandbox."