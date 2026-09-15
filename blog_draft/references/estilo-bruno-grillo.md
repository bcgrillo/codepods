# Análisis de estilo — Bruno Grillo (Medium)

**Fuentes analizadas**:
- `medium-estilo-agentes-y-herramientas.txt` — "Inteligencia Artificial sin fórmulas: Agentes y herramientas" (serie divulgativa)
- `medium-codepods-articulo-previo.txt` — "Codepods: Un gestor de agentes de terminal" (artículo técnico personal)

**Corpus completo** (10 artículos) en `medium-corpus/` — para consultar tics y
recursos recurrentes de cualquier otro artículo de la serie.

**Recuperado vía**: Feed RSS de Medium (`https://medium.com/feed/@brunogrillo.dev`) — evita el bloqueo de Cloudflare que afecta al HTML.

---

## Rasgos de estilo observados

### Voz
- **Primera persona** constante: "voy a intentar explicarlo", "me tocaba crear", "mi becario y yo".
- **Tono cercano y conversacional**, como si explicara a un amigo. Tutea al lector ("quizá estés pensando", "imagina que...").
- **Humor sutil y autoironía** sin restar rigor: "el adulting en general", "mi becario y yo", "no incendie la cocina", "¡Flying free🎶!".
- **Honestidad ante lo incierto**: admite simplificaciones ("he simplificado un poco, es verdad") y dudas propias.

### Estructura narrativa
- **Progresión por escalera**: encadena con entregas anteriores ("en las tres entregas anteriores fuimos avanzando...").
- **Contexto → problema → alternativas → decisión/aprendizaje**.
- **Arranque con una escena concreta** que engancha: "La primera vez que probé Copilot CLI tuve una sensación extraña...".
- **Avisos de simplificación** explícitos, normalmente al principio y al final.

### Recursos didácticos
- **Analogías cotidianas potentes**: el restaurante (camarero = modelo, cocina = herramientas), "entregarle las llaves del coche a un amigo nuevo".
- **Frases cortas y contundentes** para cerrar ideas: "el camarero no cocina", "la IA propone la llamada, pero no la ejecuta por sí misma".
- **Preguntas retóricas** que anticipan al lector: "¿cómo puede un modelo de lenguaje usar herramientas?", "¿qué es realmente un agente?".
- **Negaciones que aclaran conceptos**: "No porque tenga manos. No porque tenga voluntad. No porque dentro haya una pequeña persona operando un teclado."
- **Metáforas de fontanería**: "cableado, tuberías, adaptadores, juntas y llaves de paso".

### Formato
- **Títulos de sección conversacionales**: "Una conversación con cocina", "La fontanería invisible", "La IA no ejecuta la herramienta".
- **Negritas** para conceptos clave.
- **Listas** para pasos concretos (pero no abusa).
- **Bloques de ejemplo** con estructura de mensajes: `<usuario>`, `<asistente>`, `<llamada-herramienta>`.
- **Emojis con moderación** al final (👋 al despedirse, 🏎️💨).
- **Cierre con invitación al diálogo**: "si algo no ha quedado claro... estaré encantado de leerte".
- **Sección "Aclaración:" al final** con matices técnicos y enlaces de profundización.

### Cómo trata los temas técnicos
- Explica **primero el por qué**, luego el mecanismo.
- **Desmonta expectativas intuitivas**: "un agente no es una IA con manos digitales".
- Reconoce **riesgos sin alarmismo**: "una alucinación en un agente puede transformarse en... el borrado accidental de miles de archivos".
- **No vende hype**: distingue lo que el modelo hace de verdad de lo que parece hacer.
- Usa **"fontanería"/"orquestación"** para lo poco glamuroso pero imprescindible.

### Tics de escritura a conservar
- Muletillas de cercanía: "Pues...", "Claro que...", "Por cierto...", "Aviso importante:", "Es decir..."
- Guiones em (—) para incisos: "por ejemplo, consultar un calendario, buscar un restaurante y enviar una invitación —coordinadas por el software que rodea al modelo".
- Frases entre paréntesis para matices: "(algunos modelos generan llamadas en JSON...)".
- Estructura: idea → ejemplo → matiz → cierre con gancho.
- Termina con firma personal y emoji.

### Diferencias entre los dos artículos
- **Serie "sin fórmulas"**: más divulgativa, más analogías, guía paso a paso, público general.
- **CodePods**: más personal y técnico, tono de "diario de desarrollo", cuenta el viaje con sus tropiezos, incluye enlaces al repo, más informal ("Toma ya", "un frontal cutre").

### Advertencia del propio autor (para el nuevo artículo)
En el artículo de CodePods menciona implícitamente el tema del sandboxing:
> "no termino de fiarme del 'sandbox' (le he pedido alguna vez que me leyera una variable de entorno y os digo que lo hace, aunque se llame API_KEY o GITHUB_TOKEN, o sea, que mejor no digo nada)."

Este es el **puente narrativo perfecto** para el nuevo artículo: el autor ya expresó en su artículo anterior que no se fiaba del sandbox, y el nuevo artículo es la exploración técnica de esa sospecha.
