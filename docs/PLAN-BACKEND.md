# Plan detallado del backend GRANDAPTIVE

Actualizado: 4 de noviembre de 2026. Cinco integrantes; dos días de challenge. Este documento diferencia implementación local, conexión externa pendiente y requisitos aún incompletos. No declara terminado todo el MVP.

## 1. Alcance y decisiones

**Confirmado por el usuario:** Must primero; web responsiva y TypeScript; servicios gestionados; sin voz, biblioteca ni sincronización offline en el primer corte. Frontend después. Presupuesto total de $500 MXN y compra prevista de USD 5 para OpenAI API. No hay cuentas confirmadas. Las encuestas del partner son el antecedente de validación comunicado; no se entregaron para revisión.

**Propuesta implementada localmente:** Vercel para publicación/servidor, Supabase para PostgreSQL/Auth y OpenAI Responses API con `gpt-5.4-mini` como candidato inicial. El modelo sigue pendiente de evaluación real. No se necesitan microservicios, base vectorial, Redis ni agentes con herramientas para este corte.

Las etiquetas [E], [R], [S] y [D] del PRD mantienen su significado original. OpenAI es una decisión posterior explícita del usuario. Hosting concreto, modelo, sesión de ocho horas, cuotas y borrado conservador son propuestas para la demo, no nuevas decisiones [E] ni políticas aprobadas para participantes.

Núcleo: guardar sin IA → solicitar una operación voluntaria → validar permisos/contexto → mostrar respuesta separada del original → guardar sólo si se elige → corregir/exportar/eliminar. Guardar nunca ejecuta análisis. El objetivo es comprender experiencias y desarrollar herramientas propias sin depender de mantener una máscara.

## 2. Arquitectura y contratos

Navegador → mismo origen `/api/v1` → backend TypeScript → Supabase y, sólo cuando se autoriza, OpenAI. El navegador nunca recibe las claves del proveedor ni service role. Las operaciones ordinarias usan el JWT del usuario y RLS. La clave administrativa queda restringida a cuotas, guardado validado de IA, cierre remoto y eliminación de cuenta.

- `server/app.ts`: rutas y orquestación.
- `server/schemas.ts`: entradas estrictas, tamaños y recibos.
- `server/security.ts`: cookies, origen, configuración y recibos cifrados.
- `server/database.ts`: clientes por solicitud y cuotas persistentes.
- `server/ai.ts`: reglas neuroafirmativas, adaptador real y simulación.
- `api/index.ts`: entrada Vercel; `server/dev.ts`: servidor local.
- `supabase/migrations/001_backend.sql`: esquema, permisos, cascadas y transacciones.
- `src/contracts.ts`: formatos de contenido compartidos.
- `docs/API-BACKEND.md`: contrato para el frontend posterior.

UUID para identidades, fechas UTC, versiones/revisiones controladas por servidor, JSON y errores sin detalles internos. Cookies HttpOnly; mutaciones con origen exacto y cabecera propia. Contenidos IA tienen tipo y marca de simulación. Las respuestas pendientes incluyen contexto y recibo cifrado de 15 minutos. No se guarda automáticamente contenido IA en nuestras tablas.

## 3. Bloques de trabajo y criterios de entrega

### A. Datos y autenticación — RF-15, RNF-04/05

Entrada: correo, contraseña y CAPTCHA. Salida: cookies y ID; no tokens en JSON. Rutas de inicio, renovación, sesión y cierre local/global. Demo cerrada: cuentas invitadas del equipo con `app_metadata.challenge_member=true`, registro público deshabilitado. No hay ruta de autorregistro.

Supabase administra hashes de contraseña; no hay tabla propia de contraseñas. Cada solicitud verifica usuario y sesión viva de PostgreSQL; el límite absoluto propuesto es ocho horas. RLS también verifica sesión. Depende de proyecto Supabase, migración y CAPTCHA realmente activado. Riesgo: diferencias entre Auth simulado y hospedado.

**Terminado externamente:** dos cuentas reales del equipo pueden iniciar sesión; A no lee/modifica/elimina datos de B; cierre remoto y expiración bloquean el JWT anterior.

### B. Diario y derivados — RF-01/11, RNF-05

Entrada: texto de hasta 8.000 caracteres, permiso de análisis y versión esperada al editar. Salida: entrada versionada, historial paginado y búsqueda. El texto de búsqueda viaja en cuerpo JSON, evitando incluirlo en URLs de logs. Guardar funciona sin IA; borradores son responsabilidad posterior de UI.

Vista previa del borrado y cascada transaccional de entrada, interpretaciones, conversaciones e ítems dependientes del perfil, incluyendo dependencias transitivas. Propuesta del corte: cancelar o borrar la cascada completa, incluso si un ítem tiene otras fuentes. **Conservar un derivado como dato manual sigue [D]**; RF-11 no se declara completo. La vista previa es una fotografía y puede cambiar por operaciones concurrentes.

**Terminado:** guardar/leer/editar sin IA, conflicto ante versión obsoleta y eliminación sin derivados enviables al proveedor. Las interpretaciones guardadas conservan versión de origen: UI deberá indicar “basada en versión anterior”.

### C. Consentimientos y configuración — RF-09/10/12, RNF-09

Interruptor global y tres capas independientes: conversación, patrones y uso del perfil, apagados inicialmente. Patrones requiere autorización de todas las entradas seleccionadas. Capa 3 usa únicamente ítems aceptados; no condiciona el diario.

Se persisten tono, extensión, sólo escucha y seguimiento con revisiones. También preferencias de texto, contraste, densidad, movimiento, notificaciones y sección inicial. La UI debe aplicarlas y completar vista previa, restablecer y controles restantes del PRD. Persistir preferencias no acredita WCAG.

**Terminado:** cambios de permisos/preferencias/fuentes invalidan resultados pendientes. Se verifica antes/después de generar y de forma transaccional al guardar. Una revocación no puede retirar datos ya enviados al proveedor: descarta la respuesta y bloquea su guardado.

### D. Orquestación IA — RF-03/04/05/08/13/16, RNF-09/10

Entrada: operación, conversación, UUID de una o hasta cinco entradas y turno/contexto opcionales. Salida estricta: acompañamiento, resumen, interpretación, formulaciones o hipótesis. Interpretación exige ≥2 lecturas o abstención; comunicación devuelve 2–3 formulaciones editables.

Prompt sin diagnóstico ni afirmaciones de intenciones ajenas; prohíbe normalización, presión de contacto visual y ocultamiento. Configuración explícita prevalece. Preguntas opcionales, omitir sin insistencia y sólo escucha. Texto original/perfil son datos no confiables. No hay herramientas, navegación, ejecución de código ni acciones autónomas.

Entrada total acotada; salida máxima 900 tokens; espera máxima 15 segundos; sin reintentos automáticos. Fallos dejan disponible el diario. `store:false` evita almacenamiento de estado de Responses, pero no garantiza retención cero de logs del proveedor. [Política de datos API](https://developers.openai.com/api/docs/guides/your-data).

**Riesgos:** filtros de expresiones no garantizan seguridad semántica; falta evaluar el modelo real. Un recibo válido se puede guardar más de una vez: UI debe evitar doble envío; idempotencia persistente queda como mejora si aparece esa necesidad. Bloqueo de patrones rechazados compara claves idénticas, no equivalencia semántica entre paráfrasis.

**Terminado para demo:** banco sintético normal, ambiguo, adversarial y de preferencias aprobado por el equipo, sin presentarlo como validación clínica; fallos controlados sin pérdida. Mientras tanto usar mock claramente rotulado.

### E. Perfil — RF-06/07/08, transparencia mínima RF-14

Manual: categoría/texto. IA: recibo válido y fuentes versionadas. Salida: ítem manual o propuesta pendiente; aceptar/editar/rechazar/archivar es decisión humana. Categorías: comunicación, sensorial, energía, social y estrategias. Simulación queda identificada.

Se devuelven los ítems enviados al modelo; esto acredita contexto proporcionado, no qué influyó causalmente en su razonamiento. Editar/borrar el perfil usado invalida recibos pendientes. **Terminado:** transiciones, fuentes y aislamiento comprobados; nunca aceptación automática.

### F. Privacidad y pausa técnica — RF-11/12/15/16/17, RNF-04/05

TXT legible con secciones JSON y registros paginados; excluye tokens, contraseñas y borradores locales. Exportación no es una instantánea transaccional si el usuario edita a la vez. Borrado de cuenta elimina usuario Auth y datos activos por cascada. Política de backups/logs y plazos de purga externa siguen pendientes; no se promete borrado instantáneo universal. Descargas ya exportadas requieren acción del usuario.

**RF-17 parcial:** pausa persistente que impide generación/guardado en esa conversación y no permite reanudarla. No hay detector aprobado, mensajes aprobados, directorio de recursos ni protocolo clínico. Esos elementos dependen de especialistas. No presentar el botón de pausa como cumplimiento total.

### G. Integración y evaluación — RNF-01/02/03/06/07/08

Pruebas de contratos, HTTP y SQL; evidencia y pendientes en VERIFICACION.md. PostgreSQL embebido usa esquema Auth simulado. **Terminado para demo técnica:** repetir con dos cuentas reales, probar hosting y ensayar sin IA. Accesibilidad WCAG 2.2 AA y rendimiento móvil necesitan frontend conectado y pruebas específicas.

## 4. Controles de seguridad

- Secretos en `.env.local` y entorno de servidor de Vercel; excluidos de Git. Clave dedicada por proyecto, sin prefijo `VITE_`. Rotar si hay exposición.
- Contraseñas con hash administrado por Supabase, no cifrado reversible casero. Configurar política de contraseña en Auth. No registrar credenciales, cuerpos, cookies ni respuestas IA.
- Cookies `__Host-`, Secure, HttpOnly, SameSite=Lax y sin Domain en producción. Origen exacto y cabecera propia para mutaciones; sin CORS abierto.
- Validación estricta, cuerpo máximo 32 KiB y consultas parametrizadas/estructuradas. El usuario no asigna dueño, origen ni aceptación de IA.
- RLS, relaciones compuestas por dueño/objeto y permisos por columna. Sesiones revocadas también se bloquean en SQL.
- CAPTCHA de Supabase Auth y cuotas atómicas por cuenta/correo/proyecto. Claves de cuotas con HMAC. Reducen abuso; no garantizan ausencia de spam o resistencia DDoS.
- HTTPS/TLS y cabeceras CSP, anti-framing y anti-sniffing. Renderizar datos como texto, nunca HTML del usuario/modelo. Backend por sí solo no certifica ausencia de XSS en una UI futura.
- Versiones fijadas y lockfile; auditoría, revisión y pruebas antes de actualizar. No aplicar `audit fix --force` sin revisión.
- Cifrado adicional por campo/gestión de llaves permanece [D]. Los recibos cifrados no significan diarios con cifrado extremo a extremo; administradores/proveedores autorizados pueden procesarlos según su configuración.

## 5. Plan de dos días y reparto

Asignación propuesta por tareas, sin presumir especialidades. Cada responsable deja evidencia reproducible y recibe revisión de otra persona.

1. **Integrante 1 — integración/despliegue:** contratos, variables y Vercel. Migración revisada por integrante 2. Entrega URL estable y comprobación de rutas/cookies. No compartir contraseña personal de hosting.
2. **Integrante 2 — datos/privacidad:** SQL, aislamiento, exportación y cascadas; prepara dos cuentas sintéticas. Puede avanzar con PostgreSQL embebido sin credenciales.
3. **Integrante 3 — IA:** prompts, banco de casos y evaluación; conecta OpenAI después de cuotas/permisos; revisa consumo sin guardar textos personales.
4. **Integrante 4 — preparación UI/UX:** usa contrato HTTP y mocks para formularios/estados futuros; revisa lenguaje. El rediseño visual queda para la fase siguiente.
5. **Integrante 5 — QA/demo:** reproduce pruebas, intenta acceso cruzado y recibos alterados, ensaya caída de IA y pausa. Revisa documentación y pendientes.

**Horas 0–2:** abrir workspace, ejecutar pruebas, asignar responsables y preparar cuentas. Salud y pruebas locales son el primer corte sin cuentas. IA/QA avanzan con simulaciones.

**Horas 2–5:** Supabase nuevo, migración, cuentas invitadas, CAPTCHA y sesión. Esqueleto andante conectado: iniciar sesión → guardar sin IA → leer → intentar acceso con otra cuenta → eliminar.

**Horas 5–8:** consentimientos/configuración/perfil/exportación y respuestas mock. Probar revocación y recibos; congelar contrato HTTP en reunión corta.

**Día 2, primeras 3 h:** el equipo adquiere crédito, configura clave de proyecto, prueba una llamada y luego el banco sintético, revisa consumo. Cambiar a OpenAI sólo al pasar evaluación; si falla, demo mock identificada.

**Siguientes 3 h:** despliegue de prueba, repetir aislamiento/sesiones/CAPTCHA/HTTPS, inspeccionar assets por secretos. Retomar frontend sólo para el recorrido indispensable acordado.

**Últimas 2 h:** ensayo completo, revisar borrado/costos, congelar cambios y respaldo sintético. Es una distribución orientativa; no promete completar todo Must en 48 h.

Ruta crítica: cuentas → migración/RLS → sesión real → diario con dos cuentas → permisos → IA → prueba hospedada → UI. Cuellos de botella: responsable de cuentas, condiciones de hosting, CAPTCHA sin UI conectada y RF-17. El último requiere especialistas; no se resuelve improvisando código.

## 6. Alojamiento y presupuesto

Vercel aloja servidor/página; Supabase aloja datos/Auth. Son complementarios. Recomiendo esa combinación para ahorrar configuración. Hobby está limitado a uso personal no comercial: confirmar que el challenge y partner encajen. No asumir que incluye cinco colaboradores de hosting. [Vercel Hobby](https://vercel.com/docs/plans/hobby).

Supabase Free publica $0/mes, 500 MB de base y 50.000 usuarios activos/mes; pausa tras una semana sin actividad. Capacidad estimada suficiente para cinco personas/datos sintéticos, sin garantía de disponibilidad. [Precios Supabase](https://supabase.com/pricing).

Alternativa si Hobby no corresponde: evaluar Workers + Supabase. Cloudflare ofrece nivel gratuito limitado y pago desde USD 5/mes; requiere adaptación/pruebas de runtime, por eso no se implementó un segundo despliegue. [Precios Workers](https://developers.cloudflare.com/workers/platform/pricing/).

`.vercel.app` sirve para el challenge; dominio propio después tiene costo separado. Vercel administra certificados TLS. No gastar ahora sólo para cambiar el sufijo. [TLS](https://vercel.com/docs/domains/working-with-ssl).

**USD 5 previstos para crédito OpenAI API**, no llamadas ilimitadas. Modelo candidato: USD 0,75/millón de tokens de entrada y USD 4,50/millón de salida. Ejemplo supuesto con 2.000 tokens totales de entrada y 400 de salida: USD 0,0033 por solicitud; cien: USD 0,33. El contexto real cambia el consumo. [Precio y modelo](https://developers.openai.com/api/docs/models/gpt-5.4-mini).

El código limita 15 solicitudes IA/persona/día, 100/proyecto/día y **100 intentos reales acumulados**, reservados en SQL antes del envío. No se reinicia ese contador diariamente y los fallos descuentan por prudencia. No mide dólares ni cubre llamadas externas a la app. Revisar dashboard, acceso a clave y recarga automática; no convertir a MXN sin tipo de cambio/cargos reales. Usar servicios implica aceptar condiciones estándar aunque no negocien un contrato formal. No se realizó ninguna compra.

## 7. Condiciones de cierre y siguiente paso

Para conectar: cuentas, migración, secreto del servidor, CAPTCHA, origen fijo y pruebas de aislamiento. Para IA: crédito/clave, acceso al modelo y evaluación sintética. Documentación, mocks y pruebas pueden hacerse sin pagar.

Antes de participantes: revisión ética/privacidad, edad/responsables legales, retención/purga, especialistas RF-17 y accesibilidad. No probar con adolescentes sólo porque existan encuestas. Acceso cerrado no verifica edad.

Antes de declarar todo Must: completar controles RF-09, aplicación visual RF-10, registro/recuperación elegidos de RF-15, conservación de derivados, “no encaja”, marcas de versión y evaluación completa. El enlace al diseño compartido no pudo recuperarse; imágenes/exportación serán útiles cuando se retome frontend.

**Siguiente paso inmediato:** ejecutar comprobaciones del workspace y seguir DESPLIEGUE.md con `AI_MODE=disabled`. Validar diario con dos cuentas del equipo antes de activar OpenAI.

