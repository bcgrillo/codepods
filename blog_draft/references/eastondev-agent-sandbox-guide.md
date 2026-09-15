# EastonDev — "AI Agent Sandboxes: Docker, gVisor, y Firecracker"

**URL**: https://eastondev.com/blog/es/posts/ai/20260323-agent-sandbox-guide/
**Idioma**: Español
**Recuperado**: 2026-09-11

## Resumen de contenido

Artículo técnico en español que compara tres enfoques de sandboxing para agentes de IA:
Docker (rápido, aislamiento débil), gVisor (intercepta syscalls), Firecracker
(aislamiento a nivel hardware). Cubre desde desarrollo local hasta despliegue en
Kubernetes.

### Tesis central
Ejecutar código generado por un agente de IA sin sandbox es arriesgado. El sandbox
es infraestructura del agente, como un firewall lo es para un servidor expuesto a
internet.

### Cuatro riesgos identificados
1. **Ejecución arbitraria de código**: el modelo no entiende límites de seguridad;
   `os.system()`, `subprocess.run()` los usa cuando hace falta, sin pensar en
   consecuencias. Un prompt bien diseñado puede forzar comandos del sistema.
2. **Agotamiento de recursos**: el código del agente no tiene conciencia de
   recursos. Un bucle infinito satura la CPU; una recursión sin fin revienta la
   memoria.
3. **Escalada en el sistema de archivos**: sin restringir rutas, puede leer todo
   el disco y escribir donde quiera. Configuración, claves, datos de usuarios.
4. **Fuga de datos por red**: una petición HTTP oculta envía datos sensibles al
   servidor del atacante y puede pasar desapercibida.

### Casos reales mencionados
- **Vulnerabilidad RCE en Langflow**: ejecución remota de código descubierta por
  Horizon3; entrada maliciosa ejecuta código arbitrario en el servidor.
- **Ejecución automática en Cursor**: investigadores encontraron que Cursor
  ejecuta ciertos comandos MCP; un prompt malicioso puede dispararlos.
- **Borrado de base de datos en Replit**: código generado por IA eliminó la base
  de datos completa.

### OWASP Top 10 Amenazas de Seguridad para Agentes de IA (2025)
La número uno: "manipulación de la interacción con herramientas del agente" —
el atacante, con prompt injection u otros medios, desvía cómo el agente invoca
herramientas.

### Comparativa de soluciones

| Enfoque | Aislamiento | Arranque | Recursos | Escenario |
|---|---|---|---|---|
| Contenedor Docker | ★★☆☆☆ | ★★★★★ | ★★★★★ | Dev/test, código de bajo riesgo |
| gVisor | ★★★★☆ | ★★★★☆ | ★★★☆☆ | Producción, riesgo medio |
| Firecracker | ★★★★★ | ★★★★☆ | ★★★☆☆ | Alta seguridad, producción |

### Docker (contenedor)
Arranque rápido, poco consumo, ecosistema maduro. Pero contenedor y host comparten
kernel. Los procesos están aislados por namespace, pero si alguien explota el
kernel, cruza el límite y obtiene root en el host. En 2024 se publicaron varias
vulnerabilidades de escape de contenedor. Para código no confiable, Docker solo
no es suficiente.

### gVisor
Capa que intercepta muchas llamadas al sistema antes del kernel anfitrión
(componente Sentry). Aporta frontera más fuerte que Docker convencional frente a
parte de los riesgos del kernel, sin saltar a una VM completa. Especialmente
interesante donde ya existe Kubernetes y se desea usar un runtime distinto con
`RuntimeClass`. Compromisos: compatibilidad de syscalls, comportamiento de red,
rendimiento de I/O y de cargas como builds, `npm install`, tests.

### Firecracker
MicroVM con aislamiento real a nivel de hardware. El agente trabaja detrás de un
hipervisor y con un kernel guest. La frontera principal deja de depender
exclusivamente del kernel compartido del host. Ideal para código hostil o
autonomía alta. Mayor coste de recursos y de tiempo de arranque.

### Tres valores del sandbox
1. **Aislamiento** — encerrar código riesgoso
2. **Límites** — tope en CPU, memoria, red y archivos
3. **Auditoría** — registrar qué hizo para investigar incidentes

### TL;DR del artículo
- Ejecutar código con agents tiene cuatro riesgos: ejecución arbitraria,
  agotamiento de recursos, acceso indebido a archivos y exfiltración de datos
- Tres enfoques: Docker (rápido, aislamiento débil), gVisor (intercepta syscalls),
  Firecracker (aislamiento a nivel hardware)
- Desarrollo local: FastAPI + Jupyter + gVisor; producción: E2B o Bedrock AgentCore
- La seguridad no es opcional: añade sandbox pronto, no esperes al incidente

### Estilo
Divulgación técnica en español, directo y pragmático. Usa casos reales y
comparativas con tablas. Incluye ejemplos prácticos (FastAPI, Dockerfile, GKE).
Tono de advertencia sin alarmismo. Menciona OWASP y vulnerabilidades concretas.