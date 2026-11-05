# Verificación del backend

## OpenAI: conexión real inicial

Se ejecutaron seis solicitudes reales con datos sintéticos y gpt-5.4-mini: una inicial y cinco operaciones. Todas devolvieron HTTP 200 y pasaron esquema/filtros; seis intentos reservados, sin reintentos. Las 61 pruebas locales también se repitieron y aprobaron. Evidencia y límites en EVALUACION-IA-INICIAL.md. No se comprobó el saldo ni se activó AI_MODE automáticamente. El banco completo de seguridad/estilo sigue pendiente.

## Cierre técnico posterior: 5 de noviembre de 2026

Estado vigente en ESTADO-BACKEND.md. Compilación remota de Vercel sin TS2688, Node 24.x; 61 pruebas aprobadas mediante `node --test --test-isolation=none backend/tests/*.test.ts shared/tests/*.test.ts`, comprobación TypeScript y SQL embebido aprobados. El modo habitual de tests/build local encontró spawn EPERM del entorno Windows; el build completo se comprobó remotamente.

`npm run check:connections`: todos los checks aprobados, incluida migración 002. `npm run test:live -- --confirm-synthetic-users`: recorrido real aprobado con dos cuentas temporales (sesiones, aislamiento de diario por API/REST, versiones, consentimientos, preferencias/preview, perfil, pausa, exportación, borrado de entrada/conversación, revocación y borrado de cuenta/perfil). Se eliminaron ambas cuentas y sus datos de prueba. No hubo llamadas OpenAI ni correos.

Límites: login directo de Supabase Auth para obtener sesiones; no se probó CAPTCHA/formulario/login BFF en navegador ni interpretación con OpenAI real. Persisten pendientes de privacidad, accesibilidad y RF-17 especializado. Los registros de 401/503 y migración ausente que aparecen más abajo son históricos, ya resueltos para las comprobaciones indicadas.

## Revisión vigente: 5 de noviembre de 2026

Actualización posterior al despliegue: `npm run check:connections` confirmó health v0.3 GET/HEAD 200, sesión sin cookies 503 y Supabase Auth/REST 401 con las claves locales. No hubo lecturas de diarios ni escrituras remotas. La CLI de Vercel pudo listar nombres de variables de Production, sin descargar valores. `npm run check` y `npm run test:db` se repitieron y aprobaron después de añadir el diagnóstico de conexiones y la verificación SQL de instalación. Ver CIERRE-BACKEND.md para el plan actual; los estados v0.2 de abajo corresponden a la revisión anterior.

- `npm run build`: aprobado, TypeScript y bundle Vite.
- `npm test`: **60 pruebas aprobadas, cero fallos**.
- `npm run test:db`: aprobadas migraciones 001 y 002 y pruebas SQL, incluida membresía, preferencias, feedback, contador de pausas y alerta de presupuesto.
- `npm audit --audit-level=high`: **0 vulnerabilidades conocidas reportadas**.

Las pruebas anteriores son locales, con proveedor simulado y Auth de prueba. No gastaron créditos OpenAI. En producción health v0.2 respondió 200, pero auth/session respondió 503 de configuración. Credenciales locales de Supabase recibieron 401 en comprobaciones mínimas; no se certificó RLS real. Los cambios v0.3 no están publicados y UptimeRobot no se configuró. Ver REVISION-BACKEND-2026-11-05.md y UPTIMEROBOT.md para límites y acciones pendientes.

## Registro histórico del 4 de noviembre

Fecha: 4 de noviembre de 2026. Ejecutada localmente sin credenciales, llamadas OpenAI facturables ni despliegue.

## Resultados comprobados

- `npm run build`: TypeScript de frontend, backend, scripts y pruebas sin errores; Vite genera el bundle.
- `npm test`: **53 pruebas aprobadas, cero fallos** (incluye cuatro subpruebas).
- `npm run test:db`: migración y assertions SQL aprobadas en PostgreSQL embebido PGlite.
- `npm audit --audit-level=high`: **0 vulnerabilidades conocidas reportadas** en ese momento. No equivale a ausencia de vulnerabilidades ni auditoría de infraestructura.
- Servidor Node iniciado temporalmente en localhost: `/api/v1/health` devolvió HTTP 200. El proceso de prueba se cerró después.
- Inspección del bundle generado: no contiene el endpoint OpenAI del adaptador ni los nombres de las variables de secretos del backend. No había credenciales reales configuradas.

Las pruebas cubren validación estricta, origen/CSRF, cuerpo acotado, cookies, recibos cifrados/alterados, sesión ausente/revocada, guardado HTTP sin IA y bloqueo de asignación de propietario. Adaptador OpenAI probado con fetch simulado: JSON estricto, store:false, timeout, sin reintentos, tamaño, preferencias y algunos contenidos prohibidos.

SQL comprueba aislamiento A/B, dueño falsificado, bloqueo de DELETE directo de entradas, revisiones controladas por servidor, claves foráneas de dueño, pausa persistente, fuente/perfil obsoletos, guardado de patrones en pausa, cascadas, sesión revocada/expirada, cuotas y tope acumulado de 100 intentos.

**Límite de evidencia:** PGlite ejecuta PostgreSQL real embebido, pero auth.users, auth.sessions, auth.uid y auth.jwt son fixtures. No prueba Supabase Auth, PostgREST, correo, CAPTCHA, Vercel ni OpenAI real. El bundle visual aún no usa el backend.

## Prueba conjunta antes de demo

Realizar en proyecto de prueba con dos cuentas del equipo y datos ficticios; registrar aprobado/fallo y evidencia sin claves, contraseñas o diarios.

1. **Sesión/CAPTCHA:** token válido permite login; inválido/reutilizado falla. Miembro no habilitado queda bloqueado. Inspeccionar HttpOnly, Secure, SameSite y ausencia de JWT en JSON/storage del frontend conectado.
2. **Aislamiento:** A crea registro; B intenta GET/PATCH/DELETE, perfil, interpretaciones y RPC con IDs de A. Cero datos/efectos cruzados. Repetir por API y REST de Supabase con claves de usuario de prueba.
3. **Sin IA:** AI_MODE=disabled; guardar/editar/listar/exportar funciona sin contactar OpenAI.
4. **Capas:** interruptor global y capas independientes; patrón no usa entrada sin autorización; capa 3 apagada implica cero perfil en payload.
5. **Carreras:** comenzar operación, cambiar consentimiento/configuración/texto/perfil o pausar y después intentar guardar recibo previo. Se descarta. Cerrar sesión global y reutilizar JWT viejo debe fallar.
6. **Cascada:** entrada con interpretaciones, conversación, propuesta aceptada y derivados del perfil. Mostrar vista previa, cancelar una vez y borrar después. No quedan derivados consultables/enviables.
7. **Exportación/cuenta:** originales separados de IA y versiones; sin tokens. Borrar cuenta limpia datos activos. Comunicar límites de backups/logs y limpiar borradores locales.
8. **Proveedor:** una solicitud real con dato ficticio, revisión de respuesta y dashboard; evaluar escenarios del banco. Simular 429, timeout, formato roto y caída manteniendo diario disponible.
9. **Cuotas:** verificar bloqueo y contador sin reinicio diario automático del tope acumulado. No agotar cupo facturable para probarlo: esa condición ya se prueba en SQL local.
10. **Hosting:** HTTPS y URL final, /api/v1/health, rewrites, cookies, variables separadas por entorno y CAPTCHA en dominio final. Assets del navegador sin claves.
11. **UI posterior:** teclado, foco, zoom 200%, contraste, mensajes de error, sólo escucha, no insistencia, simulación marcada y no HTML ejecutable. WCAG 2.2 AA requiere revisión completa; no declararla por estos pasos aislados.
12. **Ensayo:** guardar sin IA → respuesta voluntaria → aceptar/rechazar propuesta → exportar/borrar → falla IA y pausa técnica. RF-17 clínico se presenta como pendiente de especialistas.

## Riesgos conocidos y cierre pendiente

Sin idempotencia persistente de guardado de recibos; exportación/vista previa no son snapshots transaccionales; repetición de patrones bloqueada por clave exacta, no semántica; filtros no garantizan comportamiento neuroafirmativo. Falta integrar formularios/CAPTCHA y completar controles del PRD en UI, políticas de retención, registro/recuperación y RF-17 con especialistas. Conservar derivados como manual es decisión pendiente.

No habilitar uso con participantes ni adolescentes con base únicamente en estas pruebas. El acceso invitado restringe operación, no verifica edad ni sustituye aprobación ética.

