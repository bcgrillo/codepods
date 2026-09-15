# Azure Container Apps Dynamic Sessions — Microsoft Learn

**URLs consultadas**:
- https://learn.microsoft.com/en-us/azure/container-apps/sessions (overview)
- https://learn.microsoft.com/en-us/azure/container-apps/sessions-code-interpreter (code interpreter)
- https://microsoft.github.io/autogen/stable/user-guide/extensions-user-guide/azure-container-code-executor.html (AutoGen integration)

**Recuperado**: 2026-09-11

## Resumen de contenido

Azure Container Apps Dynamic Sessions proporciona acceso rápido a entornos
sandbox seguros ideales para ejecutar código o aplicaciones que requieren fuerte
aislamiento de otras cargas. Ofrece entornos precalentados mediante pools de
sesiones que arrancan en milisegundos, escalan bajo demanda y mantienen fuerte
aislamiento.

### Beneficios
- **Aislamiento seguro**: Hyper-V isolation y controles de red opcionales.
  Sesiones aisladas entre sí y del host. Seguridad de nivel empresarial.
- **Entornos sandbox**: cada sesión corre en su propio entorno aislado.
- **Arranque instantáneo**: pools precalentados permiten arranque sub-segundo.
- **Escalable**: cientos o miles de sesiones concurrentes sin intervención manual.
- **Lifecycle gestionado**: las sesiones se desaprovisionan automáticamente tras
  su uso o un cooldown configurable.

### Escenarios comunes
- **Workflows de IA/LLM**: ejecutar código generado por IA de forma segura.
- **Desarrollo interactivo**: entornos rápidos y desechables para testing.
- **Ejecución segura de código**: código no confiable o enviado por usuarios.
- **Tareas de compute personalizadas**: jobs de corta duración con dependencias
  específicas.
- **Cargas burst**: picos impredecibles escalando sesiones.

### Conceptos clave
- **Session Pool**: conjunto de sesiones precalentadas listas para usar. Habilita
  arranque casi instantáneo.
- **Session**: entorno de ejecución efímero e aislado. Se asigna del pool, se usa
  y se destruye.
- **Session lifecycle**: las peticiones incluyen un identificador de sesión; si
  existe se reutiliza, si no se crea. Tras el cooldown sin actividad, se destruye.
- **Request routing**: las peticiones se hacen al management endpoint del pool;
  el path después del endpoint se reenvía al contenedor de la sesión.

### Tipos de pool de sesiones

| Dimensión | Code interpreter | Custom container |
|---|---|---|
| Mejor para | Código generado por IA, scripts de usuarios | Workloads con runtime/librerías custom |
| Entorno | Preconfigurado con runtimes comunes | Imagen de contenedor propia |
| Elección | Simplicidad, arranque más rápido, setup mínimo | Control total del entorno |
| Casos | LLM workflows, code interpretation, educación | Compute custom, intérpretes propios |
| Lenguaje/protocolo | Limitado a runtimes built-in + REST API | Cualquier lenguaje/stack del contenedor |
| Imagen | No requiere (usa built-in) | Requerida (URI de imagen propia) |

### Autenticación
- Vía Microsoft Entra tokens. Roles necesarios: Azure ContainerApps Session
  Executor y Contributor en el session pool.
- El token debe contener un claim `aud` con valor `https://dynamicsessions.io`.
- Con frameworks LLM (LangChain, LlamaIndex, Semantic Kernel), el framework
  gestiona los tokens automáticamente.

### Integración con AutoGen (`ACADynamicSessionsCodeExecutor`)
- Clase Python que ejecuta código en una sesión code interpreter serverless.
- Requiere `pool_management_endpoint` + credenciales (`DefaultAzureCredential`).
- Soporta subida/bajada de archivos (directorio `/mnt/data`).
- Ejecuta bloques de código Python en entorno Jupyter preinstalado.

### Regiones soportadas
Disponible en múltiples regiones de Americas, Europa, Asia Pacific y Middle East
& Africa (Brasil South, Canada Central/East, Central US, East US/East US 2,
France Central/South, etc.).