# Contrato HTTP del backend · v0.2

Implementado en server/app.ts y server/schemas.ts. La demo visual anterior todavía no lo consume. Todos los ejemplos usan datos ficticios.

## Convenciones

Base `/api/v1`, mismo origen que la página. JSON de entrada, salvo GET sin cuerpo. Mutaciones requieren `Content-Type: application/json`, `Origin` exactamente APP_ORIGIN y `X-Requested-With: grandaptive`. El navegador envía cookies con `credentials: 'same-origin'`. No guardar JWT en localStorage ni Authorization del frontend.

UUID y fechas UTC ISO. Versiones/revisiones controladas por servidor. Máximo cuerpo 32 KiB. Errores: `{error:{code,message,requestId}}`; no depender del texto del mensaje para lógica.

400 formato, 401 sesión, 403 origen/permisos, 404 recurso, 409 contexto/conflicto, 413 tamaño, 415 tipo de cuerpo, 422 campos, 429 cuota, 503 proveedor/configuración. 429 incluye Retry-After genérico de 60 s; cuotas diarias o tope acumulado pueden seguir bloqueadas tras ese intervalo. UI debe evitar reintentos automáticos.

Los DTO de entradas/permisos/IA usan camelCase. Perfil y listas de interpretaciones/conversaciones exponen filas SQL con snake_case en este corte; no mezclar con tipos locales del demo sin un adaptador.

## Sesiones

- GET `/health`: estado del proceso, versión y registro público cerrado; no comprueba dependencias.
- POST `/auth/login`: `{email,password,captchaToken}`. Devuelve `{user:{id},expiresIn}` y dos cookies HttpOnly; CAPTCHA validado por Supabase Auth configurado. Demo requiere miembro invitado.
- GET `/auth/session`: `{user:{id}}`.
- POST `/auth/refresh`: `{}`; renueva cookies si sesión sigue activa dentro de ocho horas desde creación.
- POST `/auth/logout`: `{allDevices:false}` o true. Revoca remotamente antes de confirmar; si falla, devuelve error en vez de fingir cierre.

Sin autorregistro, reset público de contraseña ni verificación de edad implementados. Son decisiones/flujo futuro. No enviar contraseñas ni tokens a OpenAI.

## Diario

- GET `/entries?limit=50&offset=0`: `{entries,limit,offset}`; limit 1–100, offset máximo 10.000.
- POST `/entries/search`: `{q:"reunión",limit:50,offset:0}`, q máximo 120. Texto de búsqueda en cuerpo para no incluirlo en URLs de logs.
- POST `/entries`: `{text:"Registro ficticio.",availableForAnalysis:false}`. Respuesta 201: `{entry}`. No invoca IA ni requiere permisos IA.
- GET `/entries/:id`: `{entry}`.
- PATCH `/entries/:id`: `{expectedVersion:1,text:"Texto corregido."}`; también admite availableForAnalysis. Debe incluir algún cambio. Conflicto 409 si versión no coincide o recurso no disponible.
- GET `/entries/:id/deletion-plan`: entryId, profileItems afectados, interpretationIds, includesConversations, policy=cascade-or-cancel, snapshot=true. Incluye dependencias transitivas; vista previa no bloquea modificaciones concurrentes.
- DELETE `/entries/:id`: `{confirmCascade:true}`. Respuesta con deleted e includes. La UI debe mostrar alcance y permitir cancelar antes de enviar.

Entrada: `{id,text,version,availableForAnalysis,createdAt,updatedAt}`. Texto 1–8.000 caracteres no vacío. El servidor no acepta ownerId/user_id. Editar texto incrementa versión; no reescribe interpretaciones guardadas. Cambiar permiso individual no incrementa versión de texto, pero se vuelve a verificar en operaciones de patrones.

Política conservadora: elimina derivados incluso si tenían otras fuentes. Conservar derivados como manual sigue pendiente. Borrador local no viaja hasta guardar; UI debe limpiar borradores al cambiar de cuenta, cerrar o eliminar.

## Consentimientos

GET `/consents` devuelve:
```json
{"aiEnabled":false,"conversation":false,"patterns":false,"profileMemory":false,"authorizationRevision":0}
```

PATCH `/consents` requiere todos los booleanos más expectedRevision:
```json
{"expectedRevision":0,"aiEnabled":true,"conversation":true,"patterns":false,"profileMemory":false}
```

La revisión aumenta sólo si cambian permisos. Patrones usa capa 2 y fuentes autorizadas; operaciones conversacionales usan capa 1. Capa 3 permite contexto del perfil aceptado. Interruptor global domina todas. Revocar no borra derivados ya guardados: para eso están las operaciones de eliminación.

## Configuración

GET `/settings` → `{settings:{tone,length,listenOnly,followUp,settingsRevision}}`.

PATCH `/settings`:
```json
{"expectedRevision":0,"settings":{"tone":"neutral","length":"brief","listenOnly":true,"followUp":false}}
```

tone: neutral/warm/practical; length: brief/detailed. UI no escribe settingsRevision. Para restablecer enviar valores iniciales con revisión actual.

GET `/interface-settings` → `{settings}`.
PATCH `/interface-settings` envía:
```json
{"textScale":100,"contrast":"standard","density":"comfortable","reducedMotion":true,"notifications":false,"startSection":"diary"}
```

textScale 100–200, contrast standard/high, density comfortable/compact, startSection diary/profile/settings. Se reemplaza el conjunto; campos omitidos usan defaults. Última escritura prevalece en preferencias visuales; no afectan contexto IA. No implica que exista un sistema de notificaciones ni que UI ya aplique estos valores.

## Conversación y pausa

POST `/conversations`: `{entryId:"UUID"}` → 201 `{conversation:{id,entry_id,safety_state}}`.

POST `/conversations/:id/pause`: `{}` → `{paused:true,specialistProtocol:"pending"}`. Persistente e irreversible para esa conversación. Toda IA de esa conversación queda bloqueada, incluido guardado de recibos anteriores. No es un detector de crisis ni implementa protocolo clínico.

## Generación de IA

POST `/ai/operations`:
```json
{
  "operation":"interpret",
  "entryIds":["UUID-DE-ENTRADA"],
  "conversationId":"UUID-DE-CONVERSACION",
  "action":"continue",
  "context":"school"
}
```

operation: accompany/summary/interpret/communicate/pattern. Una entrada salvo pattern (1–5, sin duplicados); turnText opcional hasta 2.000 caracteres. context opcional: school/family/work/friendship. action: continue/skip/change-topic/listen. Sin historial conversacional persistido automáticamente: entrada y turno actual son el contexto del corte.

Se envía hasta diez ítems aceptados del perfil si capa 3 activa. No se envía todo el diario. Respuesta:
```json
{
  "schemaVersion":"0.1",
  "requestId":"UUID",
  "simulation":true,
  "content":{"type":"interpret","reportedFacts":[],"possibleReadings":[],"unknowns":[],"abstentionReason":"No hay información suficiente."},
  "context":{"sources":[{"entryId":"UUID","entryVersion":1}],"profileItemIds":[]},
  "receipt":"RECIBO-CIFRADO-OPACO",
  "expiresAt":1790000000000
}
```

expiresAt es epoch en milisegundos, no una fecha fija del ejemplo. UI nunca modifica/interpreta el recibo. No enviar receipt a logs/analítica. `schemaVersion` corresponde al contenido compartido v0.1, distinto de la versión de documentación del backend.

Formatos de content:
- accompany: type, text, questions[], recommendations[].
- summary: type, text.
- interpret: type, reportedFacts[], possibleReadings[], unknowns[], abstentionReason:string|null. Hechos son lo reportado, no verificación externa.
- communicate: type, formulations[] con 2–3 elementos.
- pattern: type, hypothesis, category y patternKey.

Preguntas opcionales; sólo escucha vacía preguntas/recomendaciones; omitir no insiste. Configuración servidor tiene prioridad. La validación estructural no garantiza verdad ni seguridad clínica. UI renderiza texto, separa original/IA y muestra simulation sin excepciones.

Al fallar OpenAI se devuelve AI_UNAVAILABLE; el diario permanece. No se sustituye silenciosamente por mock. AI_MODE=disabled devuelve AI_DISABLED. Cuota o presupuesto impiden nueva generación sin borrar datos.

## Guardado voluntario, perfil y propuestas

POST `/interpretations`: `{receipt:"..."}` → 201 `{id,generatedBy:"simulation"|"ai"}`. Acepta sólo operaciones no pattern. Revalida dueño, sesión, permisos, configuración, fuentes versionadas, perfil usado y conversación. Recibo vence en 15 min.

GET `/interpretations?entryId=UUID&offset=0` → `{interpretations,limit:100,offset}`. Cada fila conserva entry_version, type, content, simulation y context_profile_ids. UI compara versión actual y muestra etiqueta de versión anterior.

DELETE `/interpretations/:id`: `{}`.

GET `/profile?offset=0` → `{items,limit:100,offset}`; incluye profile_item_sources.
POST `/profile`: `{category:"sensory",text:"Prefiero instrucciones escritas."}` → `{item}`.
PATCH `/profile/:id`: category y text; sólo campos manualmente editables.
DELETE `/profile/:id`: `{}`; también elimina derivados que usaron ese ítem como contexto.

POST `/suggestions`: `{receipt:"..."}` de pattern → `{id,status:"pending",simulation}`. No pasa automáticamente a aceptado.
POST `/suggestions/:id/decision`: `{decision:"accept"}`, edit con text, reject o archive → `{updated:true}`. accept/edit/reject requieren propuesta pendiente; archive permite retirar un ítem. Rechazar registra patternKey para no repetir esa clave, incluso si se elimina después el ítem. No garantiza bloqueo de todas las paráfrasis.

Categorías permitidas: communication/sensory/energy/social/strategies. Texto manual hasta 2.000 caracteres. Perfil: id, user_id, category, text, origin, status, simulation, pattern_key, context_profile_ids, created_at, updated_at y fuentes. No asignar origin/status desde formularios.

## Exportar y eliminar cuenta

GET `/export`: archivo `text/plain`, mis-datos-grandaptive.txt. Hasta tres exportaciones/hora. Reúne páginas por tabla; exportaciones grandes fallan explícitamente, no se truncan silenciosamente. No es snapshot transaccional concurrente. Sin contraseñas/tokens/borradores.

DELETE `/account`: `{confirmation:"ELIMINAR MI CUENTA"}`. Elimina datos activos con usuario Auth y borra cookies. Respuesta distingue backupRetention pendiente y localDrafts a limpiar por frontend. No prometer borrado de descargas, backups o logs de proveedores desde esta respuesta.

## Qué simular durante integración

Usar mock AI para las cinco operaciones y datos sintéticos para diarios/perfil. Fallos de red/proveedor y sesiones se simulan en tests, no mediante una ruta de depuración pública. PostgreSQL embebido verifica migración/RLS con Auth de prueba. No confundir mocks con cuentas reales ni usar localStorage como autenticación.

Orden de UI futura: sesión/CAPTCHA → diario sin IA → permisos/configuración → respuesta mock separada → guardado voluntario → perfil/exportación/borrado → OpenAI evaluado. Nunca conectar primero una clave de OpenAI directamente al navegador.

