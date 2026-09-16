# AGENTS

Guía operativa para agentes y colaboradores del proyecto.

## Objetivo
Este documento define cómo trabajar en el repositorio y cómo mantener el contexto vivo del proyecto sin deriva documental.

## Estructura documental obligatoria
- Carpeta de contexto: `.context/`
- Documentos obligatorios en `.context/`:
  - `design.md`: resumen técnico vigente de la solución (no histórico).
  - `todo.md`: lista global de tareas y estado (no subtareas de la tarea activa).
  - `task.md`: tarea actual, objetivo y estado; se actualiza en cada interacción relevante.
  - `decisions.md`: reglas/decisiones persistentes del proyecto.
  - `changelog.md`: resumen por versión/integración en `main` o `dev`; cada integración abre nueva entrada acumulativa.

## Reglas de ramas y ejecución de tareas
- No se trabaja directamente en `main` ni en `dev`.
- Todo trabajo ocurre en ramas `feature/task-name`.
- Si aparece una nueva tarea estando en `dev`, se crea nueva rama `feature/...` y nuevo `task.md` para esa tarea.
- Si aumenta el alcance de la misma tarea, puede mantenerse la misma rama `feature/...` y actualizar `task.md`.
- Si no está confirmado que sea la misma tarea, tratarlo como potencial trabajo futuro y registrarlo en `todo.md`.
- **Antes de mergear cualquier feature a `dev` se debe confirmar explícitamente con el usuario que la feature está terminada.**
- **Checkpoint commits:** durante el desarrollo en una rama `feature/...` se deben hacer commits frecuentes y subirlos al remoto como puntos de control, aunque la feature no esté terminada. Esto permite sincronizar el progreso y recuperar el estado en cualquier momento.

## Regla crítica sobre `task.md`
- Leer y actualizar siempre `task.md` durante la ejecución.
- Se permiten notas temporales de trabajo.
- No dejar que crezca sin control: compactar y mover contexto estable a otros documentos (`design.md`, `decisions.md`, `changelog.md`, etc.).

## README
- `README.md` vive en la raíz del repositorio (no en `.context`).
- Debe contener información resumida y finalista para humanos y agentes.
- No debe incluir historial de versiones ni crecer indefinidamente.

## Documentación adicional
- Si se necesitan nuevos documentos (deployment, integraciones, etc.), se crean en `docs/`.
- Siempre confirmar antes de crear documentos adicionales fuera de los definidos como obligatorios.

## Gestión de cambios importantes
- Cualquier cambio relevante (stack, arquitectura, decisiones de alto impacto) debe confirmarse antes de actualizar documentación clave.
- Ejemplo: pasar de C# a TypeScript requiere confirmación explícita antes de modificar `design.md` u otros documentos de referencia.

## Flujo sugerido por interacción
1. Leer `task.md`.
2. Ejecutar cambios de código/documentación de la tarea actual.
3. Actualizar `task.md` con estado breve y notas actuales.
4. Si aplica, actualizar `todo.md`, `decisions.md`, `design.md` y/o `changelog.md`.
5. Confirmar con el usuario antes de registrar cambios importantes en documentos base.

## Filtrado de salida de internet (egress)
- El anfitrión puede tener activado el filtrado de egress: los agentes corren en una red Docker interna sin ruta a internet, y todo el tráfico HTTP/HTTPS pasa por un proxy que solo permite los dominios de una whitelist.
- Si una conexión falla con `403 Forbidden - Codepods egress: "<dominio>" is not in the whitelist`, el dominio está bloqueado. No es un error de red: informa al usuario/administrador de que añada el dominio a la whitelist (Settings → Network security) si lo considera seguro. No intentes evadir el filtro (IPs directas, túneles, DNS alternativos): están bloqueados a nivel de red por diseño.
- Usa los dominios de la whitelist en lugar de espejos o CDNs genéricos cuando sea posible.
