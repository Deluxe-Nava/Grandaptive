> Documento histórico del simulador inicial. La implementación actual del backend y la elección posterior de OpenAI están en [PLAN-BACKEND.md](PLAN-BACKEND.md), [API-BACKEND.md](API-BACKEND.md) y [DESPLIEGUE.md](DESPLIEGUE.md). Este archivo no describe el estado actual completo.

# Contratos de integración · GRANDAPTIVE

**Versión 0.1 · propuesta técnica para el arranque local · 4 de noviembre de 2026**

Base: PRD v0.1, secciones 8–16 y decisiones pendientes 20.3. Este documento propone contratos de implementación; no convierte recomendaciones [R], supuestos [S] ni decisiones pendientes [D] del PRD en acuerdos aprobados. El alcance acordado para este arranque es local, con datos sintéticos, sin autenticación ni proveedor de IA reales, sin despliegue ni gasto. El horizonte comunicado es de dos días con cinco ingenieros y un presupuesto máximo comunicado de $500 MXN; no se presupone ninguna cuenta o contratación. Las encuestas del partner son la única evidencia de usuarios disponible: no acreditan usabilidad, seguridad, resultados clínicos ni validación de este prototipo.

**Límite verificable:** la simulación demuestra estados, navegación y contratos. No acredita aislamiento entre cuentas, autorización servidor, borrado remoto, confidencialidad del navegador ni detección de riesgo. RF-17 sólo tiene un parámetro técnico `safetyPaused` en helpers de permisos y pruebas; no existe control de activación en la interfaz, conversación persistida, detector clínico ni protocolo aprobado.

**Implementado en este corte:** diario local con borrador, guardado, búsqueda, edición versionada y borrado; ajustes de acompañamiento; interruptores de las tres capas; simulación determinista únicamente de `accompany`; descarte por cambios de permisos/configuración/fuentes; guardado separado de interpretación simulada; exportación TXT y reinicio local. `summary`, `interpret`, `communicate` y `pattern` tienen tipos y validadores estructurales, pero no flujo de interfaz ni adaptador de generación. `ProfileItem` es un contrato sin módulo de perfil operativo. No hay API, sesiones, servidor, llamadas a un proveedor ni eventos de seguridad registrados. La fuente de verdad de los nombres ejecutables es `shared/contracts.ts`; los apartados marcados como futuros son propuestas adicionales.

## 1. Convenciones y responsabilidades

- API futura: prefijo `/api/v1`, JSON UTF-8, fechas ISO 8601 UTC; mostrar fechas en la zona de la persona. Identificadores opacos, versiones enteras crecientes y errores con códigos estables. Todas las rutas futuras requieren sesión válida, excepto las públicas de acceso que se definan después.
- La sesión real del servidor determina la persona propietaria. Nunca confiar en `ownerId`, `userId` o equivalentes enviados por el cliente. El servidor verifica propiedad también en vínculos, fuentes, exportaciones y conversaciones; una coincidencia de identificador no autoriza acceso.
- Cliente: recoge acciones explícitas, muestra origen y estados, conserva un borrador local según política aprobada. Servidor futuro: autoriza, compone contexto mínimo, impone límites, valida respuestas y aplica borrado. Proveedor: genera contenido; no decide permisos ni ejecuta cambios sobre datos.
- Las etiquetas de origen se conservan al editar: una interpretación corregida no se presenta como original del diario. Los textos del usuario y mensajes pegados son datos, nunca instrucciones capaces de cambiar permisos, reglas o configuración.
- `requestId` identifica una operación. `expectedVersion` evita sobrescribir ediciones concurrentes. Una clave de idempotencia, limitada a persona y operación, evita duplicar guardados; un reintento no autoriza una llamada adicional ilimitada.
- Toda capacidad simulada se identifica como tal en la interfaz. Ninguna clave de proveedor ni credencial se incluye en cliente, repositorio, fixture o documento.

## 2. Entidades mínimas y estados

Los campos existentes siguientes corresponden a `shared/contracts.ts`. Las entidades futuras se distinguen expresamente.

| Entidad | Campos mínimos / regla |
|---|---|
| Entrada (`Entry`) | `id`, `ownerId`, `text`, `version`, `createdAt`, `updatedAt`, `availableForAnalysis`. Sólo una acción del usuario edita `text`; cada edición incrementa `version`. `ownerId: local-demo` en la interfaz es una etiqueta, no una identidad autenticada. No llamar IA al guardar. |
| Conversación — futura | Se proponen `id`, `entryId`, `safetyState`, `saved`, `expiresAt`. No existe en `DemoState`. Historial efímero por defecto y conservación explícita son objetivos pendientes. |
| Interpretación (`Interpretation`) | `id`, `entryId`, `entryVersion`, `origin: ai`, `simulation`, `content`, `savedAt`. Separada de Entrada y guardada por acción explícita. La edición de la fuente permite mostrar “basada en versión anterior”, sin reescribir contenido. |
| Ítem del perfil (`ProfileItem`, sólo tipo) | `id`, `ownerId`, `category`, `text`, `origin: user / ai`, `status: pending / accepted / rejected / archived`, `sources`, `updatedAt`. Categorías: `communication`, `sensory`, `energy`, `social`, `strategies`. Su flujo y persistencia siguen pendientes. |
| Fuente | `entryId` y `entryVersion`. Debe pertenecer a la misma persona y seguir autorizada para la operación. No admitir fuentes inventadas por el modelo. |
| Contenido de patrón (`AIContent`, sólo tipo/validación) | `type: pattern`, `hypothesis`, `category`, `patternKey`; las fuentes viven en `AIResult.context.sources`. Aceptar/editar/rechazar y evitar reformulaciones equivalentes siguen pendientes. No existe estado `edited` en el tipo actual. |
| Consentimientos (`Consents`) | `aiEnabled`, `conversation`, `patterns`, `profileMemory`, `authorizationRevision`. Capas independientes; apagar global domina todas. Versión del aviso e historial fechado serían adiciones futuras. |
| Configuración (`Settings`) | `tone: neutral / warm / practical`, `length: brief / detailed`, `listenOnly`, `followUp`, `settingsRevision`. Ajustes visuales completos, ejemplos y tipo de pregunta siguen pendientes. |
| Snapshot (`RequestSnapshot`) | `requestId`, `operation`, `authorizationRevision`, `settingsRevision`, `sources`. Permite invalidar resultados antiguos; no es un evento de telemetría ni un recibo persistido. |

No se implementa biblioteca de expresiones RF-18, voz ni memoria semántica en este corte. `patternKey` prepara una identificación futura; no hay rechazo de patrones operativo ni equivalencia semántica resuelta. Plazos de retención, revisión y purga, así como el eventual historial de versiones completas, siguen pendientes; no conservar copias antiguas por defecto sólo para implementar un contador de versión.

## 3. Operaciones de IA y respuesta común

Solicitud conceptual: `requestId`, `operation`, `conversationId` si aplica, referencia de entrada y versión o texto de consulta, acción explícita y datos propios de la operación. El cliente puede enviar la versión que conoce; el servidor futuro resuelve y vuelve a comprobar la configuración y permisos vigentes.

| Operación | Entrada específica | Permisos mínimos | Contenido de salida |
|---|---|---|---|
| `accompany` | Entrada o turno, controles omitir/cambiar tema/solo escucha | Global + capa conversación | Reconocimiento y 0–2 preguntas opcionales. En solo escucha: cero preguntas y cero recomendaciones. |
| `summary` | Petición expresa y fuentes de esa conversación/entrada | Global + capa conversación | Resumen separado; nunca generado por guardar ni persistido sin acción. |
| `interpret` | Situación o mensaje aportado | Global + capa conversación | Hechos descritos por el usuario, dos o más lecturas posibles y lo desconocido; o declaración explícita de que no se pueden ofrecer lecturas. No afirmar hechos externos verificados. |
| `communicate` | Necesidad, contexto y tono compatible con configuración | Global + capa conversación | Dos o tres formulaciones editables; copiar es acción del usuario. No enviar a nadie. |
| `pattern` | Conjunto explícito y acotado de entradas autorizadas | Global + capa patrones + permiso por cada entrada | Hipótesis con fuentes verificadas; queda pendiente, nunca actualiza perfil automáticamente. |

La capa `profileMemory` será adicional cuando se adjunten ítems del perfil a cualquiera de estas operaciones. La regla propuesta es usar sólo ítems `accepted`, con origen `user` o `ai`; nunca pendientes, rechazados, archivados o eliminados. Actualmente el adaptador no usa perfil, incluso con la capa activada, y `validateResult` rechaza cualquier `profileItemIds` no vacío. Capa conversación apagada no apaga implícitamente patrones: el helper usa la capa correspondiente a cada operación. Con global apagado no se permite ninguna operación. No existe análisis remoto de seguridad.

Respuesta común actual (`AIResult`): `schemaVersion: 0.1`, `requestId`, `simulation`, `content` y `context: { sources, profileItemIds }`. La operación se discrimina por `content.type`, no por un campo `operation` separado. El snapshot conserva revisiones; la respuesta no tiene `status`, `generatedBy` ni `contextUsed`. Los fallos se expresan mediante `DomainError`, y la interfaz gestiona carga/descarte fuera de `AIResult`. `simulation: true` identifica las respuestas del adaptador actual.

Validación actual previa a mostrar: correspondencia de solicitud, versión de esquema, fuentes del snapshot, ausencia de perfil y estructura/límites del contenido; `assertFresh` comprueba vigencia de fuentes y revisiones. Las reglas semánticas no están implementadas. Para proveedor real, se propone añadir evaluación de comportamiento: el proveedor no puede autorizar sus propias fuentes. La regeneración única prevista por §14.5 requerirá consentimiento y cuota; actualmente no existe regeneración, cuota ni streaming.

Las reglas de tono, diagnóstico, certeza sobre emociones/intenciones y no insistencia requieren evaluación de contenido, además del esquema. Pasar un validador estructural no demuestra que la respuesta sea neuroafirmativa.

## 4. Revocación en vuelo y RF-17

**Snapshot de autorización:** al iniciar, capturar `authorizationRevision`, `settingsRevision`, versiones de fuentes y estado de conversación. Antes de enviar a proveedor, antes de mostrar y antes de guardar, comparar con estado vigente. Si cambian permisos, fuentes o configuración, la respuesta antigua se descarta; no se incorpora al historial ni al perfil. Una respuesta de una versión antigua no se muestra como adaptada a la nueva. El nuevo intento requiere una acción vigente y una nueva comprobación. El cliente local simula este comportamiento con una revisión/token; la implementación real necesita controles de servidor, no sólo botones desactivados.

Revocar no recupera información ya enviada a un proveedor: sus condiciones de retención deben revisarse antes de usar datos reales. Borrar una fuente invalida solicitudes pendientes; una tarea que termine después no puede recrearla ni recrear sus derivados.

**RF-17 futuro:** se propone que una activación fije `safetyState: paused` para esa conversación. Deberá impedir interpretaciones posteriores y resultados concurrentes, incluso tras recarga o reintento. Mensajes y recursos se seleccionarían de contenido aprobado por especialistas para una jurisdicción definida; no los redactaría libremente el modelo. Nada de esta persistencia por conversación está implementado.

En el código actual sólo existe el argumento booleano `safetyPaused` de `assertPermission`, `makeSnapshot` y `assertFresh`, utilizado en pruebas técnicas. La interfaz no lo activa ni dispone de conversación persistida. No existe detector, mensaje clínico, directorio, notificación a terceros ni acción de reanudación. Las condiciones del protocolo corresponden a especialistas. Restablecer datos de demostración es una operación de prueba independiente.

No se registran eventos de seguridad. En una implementación futura, persistir un estado local no acreditaría un bloqueo resistente a manipulación. Un contador futuro de activaciones tampoco permitiría calcular falsos positivos o negativos sin escenarios etiquetados y revisados por especialistas.

## 5. API futura y errores

Estas rutas son contratos propuestos, **no endpoints implementados ni disponibles**. Respuestas correctas: `200` consulta/actualización/operación completada; `201` creación; `204` eliminación completada sin cuerpo. `202` sólo cuando exista un trabajo real cuyo estado se pueda consultar; nunca para fingir que terminó un borrado.

| Ruta / método | Función y condición |
|---|---|
| `GET /session` · `POST /session/revoke-all` | Leer sesión y revocar todas las sesiones. La integración con proveedor de autenticación queda pendiente. |
| `GET, POST /entries` | Listar/buscar sólo entradas propias; crear sin IA. |
| `GET, PATCH, DELETE /entries/{id}` | Leer, editar con `expectedVersion`, eliminar con plan confirmado. |
| `GET /entries/{id}/deletion-plan` | Mostrar fuentes y derivados afectados antes de borrar; revalidar al ejecutar. |
| `GET, PATCH /consents` · `GET, PATCH /settings` | Cambiar capas o ajustes e incrementar revisión correspondiente. |
| `POST /conversations` · `PATCH /conversations/{id}` | Iniciar y guardar expresamente conversación. Nunca permitir al cliente quitar una pausa RF-17. |
| `POST /ai/operations` | Ejecutar una de las cinco operaciones con comprobaciones por operación. |
| `POST /interpretations` · `DELETE /interpretations/{id}` | Guardar expresamente un resultado vigente o eliminarlo. |
| `GET, POST /profile-items` · `PATCH, DELETE /profile-items/{id}` | Perfil manual y edición/eliminación de ítems autorizados. |
| `POST /suggestions/{id}/decision` | `accept`, `edit`, `reject` o `delete`; operación atómica y versionada. |
| `POST /exports` · `GET /exports/{id}` | Exportación propia y estado/descarga protegidos; formato propuesto legible más datos estructurados, pendiente de aprobación. |
| `DELETE /account` · `GET /deletions/{id}` | Solicitud confirmada de borrado y comprobación de su estado mediante mecanismo autorizado a definir. No mantener una sesión de cuenta borrada sólo para consultar el estado. |

Error actual: `DomainError` con `code` y `message`, sin transporte HTTP. Códigos existentes: `CONSENT_REQUIRED`, `SAFETY_PAUSED`, `STALE_REQUEST`, `PROVIDER_UNAVAILABLE`, `INVALID_OUTPUT`, `NOT_FOUND`. Mapeo HTTP futuro propuesto: 403, 409, 409, 503, 502 y 404 respectivamente. El futuro sobre de error añadiría `requestId`, `retryable` y `details` sin contenido sensible. Los códigos de la tabla siguiente son ampliaciones futuras, no una lista de errores ya implementados.

| HTTP | Código propuesto | Comportamiento |
|---|---|---|
| 400 / 422 | `INVALID_REQUEST` / `INVALID_CONTENT` | Explicar el campo/acción inválido; conservar borrador. |
| 401 | `AUTH_REQUIRED` | No devolver datos privados; recuperar acceso según política futura. |
| 403 | `CONSENT_REQUIRED` / `AI_DISABLED` | No llamar al proveedor ni activar permisos automáticamente. |
| 404 | `NOT_FOUND` | Recurso inexistente o no accesible; no revelar pertenencia a otra cuenta. |
| 409 | `VERSION_CONFLICT` / `STALE_AUTHORIZATION` / `SAFETY_PAUSED` | No sobrescribir ni mostrar resultado antiguo; pausa exige tratamiento RF-17. |
| 429 | `QUOTA_EXCEEDED` / `BUDGET_LIMIT` | Bloquear gasto adicional; diario y perfil manual siguen disponibles. |
| 502 / 503 / 504 | `AI_INVALID_RESPONSE` / `AI_UNAVAILABLE` / `AI_TIMEOUT` | No mostrar contenido inválido; reintento manual acotado. |
| 500 | `PERSISTENCE_FAILED` / `DELETION_FAILED` | No confirmar un guardado o borrado fallido; ofrecer reintento seguro. |

Un error de red sin respuesta HTTP se representa en cliente como `NETWORK_UNAVAILABLE`. La UI distingue “borrador local” de “guardado en servidor”; nunca mostrar el segundo sin confirmación real.

## 6. Borrado, offline y fixtures de aceptación

**Borrado:** la demo sólo mantiene entradas e interpretaciones vinculadas; al borrar una entrada elimina sus interpretaciones y explica el alcance antes de confirmar. No hay propuestas o perfil persistidos que borrar. Esto no resuelve CA-11.2: conservar un ítem futuro como declaración manual requiere decisión explícita, reglas de múltiples fuentes y ruptura de vínculos/textos de origen. Eliminar una cuenta futura abarcaría consentimientos, perfil, rechazos, conversaciones, exportaciones, sesiones y datos locales alcanzables; plazos de copias/proveedor siguen [D]. No prometer purga instantánea de dispositivos desconectados o copias externas.

**Persistencia local:** el navegador conserva borrador, entradas, interpretaciones, preferencias y capas; no existe servidor. Para la futura arquitectura, la propuesta de alcance offline es sólo borrador, sin sincronización automática. No hay sincronización posterior real, resolución de conflictos ni garantías multicuenta. FL-02 menciona guardado local y sincronización: esa diferencia queda como limitación pendiente, no como Must completado. El prototipo se usa únicamente con datos sintéticos. La exportación actual es TXT con entradas, interpretaciones, preferencias y capas; excluye el borrador. Exportación completa de cuenta y formato definitivo siguen pendientes.

**Comprobaciones actuales y pruebas pendientes:**

1. **Actual:** guardar no llama al adaptador; el helper bloquea operaciones sin global/capa aplicable. Sólo `accompany` se ejecuta desde la interfaz.
2. **Actual:** capas independientes; patrones requieren fuentes autorizadas en el helper. **Pendiente:** recuperación y filtrado de perfil real.
3. **Actual:** acompañamiento fijo, solo escucha y omisión; validadores para múltiples lecturas y 2–3 formulaciones. **Pendiente:** esos dos flujos, generación semántica y conversación con varios turnos.
4. **Actual:** cambios de configuración/permiso descartan respuestas demoradas, antes de mostrar o guardar.
5. **Actual:** versión anterior visible; borrar invalida resultados pendientes y elimina interpretaciones locales asociadas.
6. **Pendiente:** aceptar/editar/rechazar patrones y prevenir reaparición; sólo existen contratos de datos.
7. **Actual:** fallo del adaptador simulado y validación de salida. **Pendiente:** timeout real, cuotas, presupuesto y continuidad de un perfil manual operativo.
8. **Actual:** helper rechaza si recibe `safetyPaused`. **Pendiente:** activación, estado persistido por conversación, concurrencia y detector/protocolo revisados por especialistas.

Los fixtures no certifican la IA real. Antes de datos reales siguen pendientes autenticación y aislamiento verificables, condiciones del proveedor, presupuesto operativo, política de retención, aviso/consentimientos revisados y aprobación ética; para adolescentes, además, definiciones de edad/responsables/verificación y RF-17 revisado por especialistas. La entrega local debe presentar estas limitaciones junto al resultado, sin afirmar que los Must de privacidad o seguridad ya están aceptados.
