# Índice de referencias para el artículo

**Fecha**: 2026-09-11
**Rama**: `feature/blog-sandboxing`

## Referencias recopiladas (con resumen de contenido y estilo)

| # | Fuente | URL | Archivo | Estado |
|---|---|---|---|---|
| 1 | EastonDev — AI Agent Sandboxes | https://eastondev.com/blog/es/posts/ai/20260323-agent-sandbox-guide/ | `eastondev-agent-sandbox-guide.md` | ✅ Recuperado |
| 2 | Docker Sandboxes — Overview | https://docs.docker.com/ai/sandboxes/ | `docker-sandboxes-docs.md` | ✅ Recuperado |
| 2b | Docker Sandboxes — Architecture | https://docs.docker.com/ai/sandboxes/architecture/ | `docker-sandboxes-docs.md` | ✅ Recuperado |
| 2c | Docker Sandboxes — MCP gateway | https://docs.docker.com/ai/sandboxes/mcp-gateway/ | `docker-sandboxes-docs.md` | ✅ Recuperado |
| 3 | Docker Sandboxes — Security model | https://docs.docker.com/ai/sandboxes/security/ | `docker-sandboxes-docs.md` | ✅ Recuperado |
| 4 | Docker Sandboxes — Isolation layers | https://docs.docker.com/ai/sandboxes/security/isolation/ | `docker-sandboxes-docs.md` | ✅ Recuperado |
| 5 | Docker Sandboxes — CLI reference (sbx) | https://docs.docker.com/reference/cli/sbx/ | `docker-sandboxes-docs.md` | ✅ Recuperado |
| 6 | Docker Sandboxes — Docker Desktop | https://docs.docker.com/ai/sandboxes/docker-desktop/ | — | ❌ 404 (no existe) |
| 7 | Docker Sandboxes — Producto | https://www.docker.com/products/docker-sandboxes/ | — | ❌ Requiere JS (vacío con curl) |
| 8 | Azure — Dynamic Sessions | https://learn.microsoft.com/en-us/azure/container-apps/sessions | `azure-dynamic-sessions.md` | ✅ Recuperado |
| 9 | Azure — Code Interpreter Sessions | https://learn.microsoft.com/en-us/azure/container-apps/sessions-code-interpreter | `azure-dynamic-sessions.md` | ✅ Recuperado |
| 10 | AutoGen — ACA Code Executor | https://microsoft.github.io/autogen/.../azure-container-code-executor.html | `azure-dynamic-sessions.md` | ✅ Recuperado |
| 11 | MCP — Security Best Practices | https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices | `mcp-security-best-practices.md` | ✅ Recuperado |
| 12 | Claude Code — Sandboxing | https://code.claude.com/docs/en/sandboxing | `claude-code-sandboxing.md` | ✅ Recuperado |
| 13 | Claude Code — Sandbox Environments | https://code.claude.com/docs/en/sandbox-environments | `claude-code-sandboxing.md` | ✅ Recuperado |
| 14 | Medium — CodePods article | https://medium.com/@brunogrillo.dev/codepods-un-gestor-de-agentes-de-terminal-b2f259f1d872 | `medium-codepods-articulo-previo.txt` | ✅ Recuperado (vía RSS) |
| 15 | Medium — Perfil autor + estilo | https://medium.com/@brunogrillo.dev | `estilo-bruno-grillo.md` | ✅ Analizado (vía RSS) |
| 16 | Medium — "Agentes y herramientas" (ejemplo estilo) | https://medium.com/@brunogrillo.dev/inteligencia-artificial-sin-fórmulas-agentes-y-herramientas-a1c1563559f5 | `medium-estilo-agentes-y-herramientas.txt` | ✅ Recuperado (vía RSS) |

### Nota sobre Medium
Medium bloquea el HTML con Cloudflare (bot detection) para IPs de datacenter.
**Solución**: usar el **feed RSS** del autor, que no pasa por Cloudflare:
`https://medium.com/feed/@brunogrillo.dev` (devuelve los 10 últimos artículos
con el contenido completo en `<content:encoded>`).

## No accesibles (para referencia manual del autor)

### Docker Sandboxes product page (requiere JS)
- https://www.docker.com/products/docker-sandboxes/ — la página de producto
  requiere JavaScript para renderizar. La info del producto está cubierta por
  la documentación (docs.docker.com/ai/sandboxes/).

### Docker Sandboxes Docker Desktop (404)
- https://docs.docker.com/ai/sandboxes/docker-desktop/ — devuelve 404. La URL
  del draft ya no existe; posiblemente reorganizada.