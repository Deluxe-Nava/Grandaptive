# Verificación del backend

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

