# MCP Security Best Practices — Model Context Protocol

**URL**: https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices
**Recuperado**: 2026-09-11

## Resumen de contenido

Documento de seguridad para el Model Context Protocol (MCP) que identifica
riesgos, vectores de ataque y buenas prácticas para implementaciones de MCP.
Complementa la especificación de autorización de MCP y las mejores prácticas de
seguridad de OAuth 2.0.

### Confused Deputy Problem
- **Ataque**: servidores proxy MCP que conectan a APIs de terceros con un client
  ID estático pueden ser explotados. Un atacante obtiene códigos de autorización
  sin consentimiento del usuario explotando cookies de consentimiento +
  client registration dinámica.
- **Mitigación**: consentimiento por cliente, validación de redirect_uri exacto,
  parámetro OAuth state con valores de un solo uso y expiración corta, cookies
  `__Host-` prefix + Secure + HttpOnly + SameSite=Lax.

### Token Passthrough
- **Anti-pattern**: un servidor MCP acepta tokens de un cliente sin validar que
  fueron emitidos para el servidor MCP y los pasa a la API downstream.
- **Riesgo**: acceso no autorizado al servidor MCP o compromiso si acepta tokens
  emitidos para otros recursos.
- **Mitigación**: validar siempre que los tokens fueron emitidos específicamente
  para el servidor MCP.

### Server-Side Request Forgery (SSRF)
- MCP servers que aceptan URLs o referencias a recursos externos pueden ser
  víctimas de SSRF.
- **Mitigación**: validar URLs, restringir destinos, no seguir redirects
  automáticamente, bloquear acceso a recursos internos/metadata.

### State Handle Hijacking
- Secuestro de identificadores de estado de sesión.

### Local MCP Server Compromise
- **Riesgo**: servidores MCP locales stdio corren en el host. Si son
  comprometidos, usan permisos del host, no del sandbox.
- **Mitigación**: tratar los servidores MCP locales como integraciones de host
  confiables. Aislar procesos lanzados.

### OAuth Authorization URL Validation
- Validación estricta de URLs de autorización para evitar redirecciones
  maliciosas.

### stdio Transport Security in Proxy Scenarios
- Seguridad del transporte stdio en escenarios de proxy.

### Mix-Up Attacks
- Ataques de confusión entre múltiples flujos OAuth.

### Localhost Redirect URI Impersonation
- Impersonación de URIs de redirección localhost.

### CIMD Trust Policies — Scope Minimization
- Minimización del alcance de las políticas de confianza.

### Mensajes clave para el artículo
- MCP amplía la superficie de ataque: cada servidor MCP es una capacidad
  operativa adicional.
- El sandbox del proceso no basta si el agente conserva acceso a un MCP
  privilegiado que actúa fuera de esa frontera.
- Los servidores MCP stdio locales corren en el host, no en el sandbox. Si
  arrancan contenedores Docker, usan Docker del host.
- Principios: mínimo privilegio por herramienta, consentimiento para acciones
  sensibles, credenciales delegadas/no reutilizables, aislamiento de procesos,
  allowlists de red y trazabilidad.