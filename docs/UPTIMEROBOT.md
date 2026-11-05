# UptimeRobot para GRANDAPTIVE

Actualizado: 5 de noviembre de 2026. Hay cuenta según el usuario; **no se creó un monitor desde esta sesión**. La automatización de Chrome se detuvo al no poder verificar la URL activa con seguridad.

## Configuración inmediata desde el dashboard

1. Entrar en la cuenta de UptimeRobot y crear un monitor HTTP(s).
2. Nombre: `GRANDAPTIVE · API`.
3. URL: `https://grandaptive.vercel.app/api/v1/health`.
4. Método: **HEAD**, predeterminado del plan gratuito. La captura del usuario confirma que cambiarlo requiere pago: no actualizar el plan para resolver esto. Publicar la revisión local v0.3, que responde 200 tanto a HEAD como a GET. El despliegue v0.2 comprobado responde GET 200 pero HEAD 503. No usar la URL con identificador aleatorio que exige iniciar sesión en Vercel.
5. Intervalo: 5 minutos si corresponde al plan Free; esperar HTTP 200. Sin autenticación ni cabeceras secretas para esta ruta.
6. Seleccionar el contacto de alertas propio ya verificado y guardar. Revisar que una comprobación real aparezca como UP.

La URL es el destino que se comprueba, **no una API key**. Iniciar sesión con GitHub tampoco crea el monitor ni sincroniza las variables de Vercel. Para este procedimiento manual no hace falta configurar UPTIMEROBOT_API_KEY. Esa clave sólo se usaría para administrar monitores por API desde una herramienta privada; no debe ponerse en el navegador ni es necesaria para ejecutar el backend.

La ruta health respondió 200 durante la revisión. Eso acredita que la función atiende; **no acredita que funcionen Supabase, las sesiones o la IA**. La sesión pública devolvió 503 BACKEND_NOT_CONFIGURED en la misma revisión.

Corrección de diagnóstico: ese 200 corresponde a GET; HEAD devolvió 503 en la versión pública 0.2. La solución gratuita es publicar el handler corregido de `server/app.ts`. Hacer Redeploy de una fuente antigua vuelve a publicar el mismo error: primero deben llegar los archivos actualizados al proyecto GRANDAPTIVE de Vercel. La ruta health de v0.3 funciona sin migración de base ni claves; las otras funciones nuevas sí requieren la migración 002 indicada abajo.

## Corregir y publicar el backend antes del monitor de dependencias

1. En el proyecto GRANDAPTIVE de Vercel, revisar las variables del entorno **Production**. APP_ORIGIN debe ser exactamente `https://grandaptive.vercel.app`, sin slash final. El archivo .env.local sólo configura el desarrollo local; no sincroniza Vercel.
2. Revisar SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY y SERVER_SECRET. No copiar claves a archivos públicos. La última comprobación local de Supabase recibió 401: no se ha confirmado que esas credenciales funcionen. Revisar el proyecto de origen y volver a copiarlas completas desde su dashboard.
3. Mantener AI_MODE=disabled durante estas pruebas. Configurar y probar CAPTCHA antes de habilitar login público de demostración.
4. En la base correspondiente a GRANDAPTIVE, aplicar `001_backend.sql` sólo si aún no existe ese esquema y después `002_prd_monitoring.sql`. En un proyecto ya creado con 001, aplicar únicamente 002; no repetir 001. Leer ambos y respaldar datos existentes antes de migrar. No se aplicó ninguna migración remota aquí.
5. Publicar los archivos locales actualizados y realizar Redeploy con las variables de Production. Comprobar health versión 0.3 y la sesión sin cookies: debe rechazar por autenticación, no por configuración. Después probar login y aislamiento con dos cuentas del equipo.

## Monitor opcional de conexión a Supabase

Disponible después de aplicar 002 y publicar v0.3. Crear un secreto aleatorio independiente de al menos 32 caracteres en un gestor de contraseñas. Configurarlo como MONITOR_TOKEN en Vercel y hacer redeploy.

- Nombre: `GRANDAPTIVE · Supabase`.
- URL: `https://grandaptive.vercel.app/api/v1/ready`.
- Método: GET; intervalo: 5 minutos.
- Cabecera personalizada: `Authorization: Bearer <valor de MONITOR_TOKEN>`.
- Esperado: 200 y `status: ready`; 503 indica configuración, esquema o conexión no disponibles.

Usar ese token únicamente para la comprobación. **Nunca usar aquí la service role key, la clave de OpenAI ni la API key de UptimeRobot.** ready ejecuta una RPC con acceso anon que comprueba el esquema sin leer diarios; no valida todo el flujo Auth ni la IA. Si el plan de UptimeRobot no ofrece cabeceras personalizadas, conservar sólo health y comprobar dependencias manualmente; no trasladar el token a la URL ni quitar la protección.

## Qué significa «despertar»

Vercel atiende funciones a demanda; un ping no garantiza mantener todas las instancias calientes. health no consulta la base, por lo que no evita por sí mismo la pausa por inactividad de Supabase. El monitor sirve para detectar disponibilidad, no como garantía de operación permanente en planes gratuitos. Una frecuencia de 5 minutos supone aproximadamente 288 comprobaciones/día por monitor, sin contar reintentos o ubicaciones adicionales. Estas rutas no llaman a OpenAI.

Referencias oficiales: [crear un monitor](https://help.uptimerobot.com/en/articles/11358364-how-to-create-your-first-monitor-on-uptimerobot-quick-setup-guide), [método HTTP y diagnóstico](https://help.uptimerobot.com/en/articles/11358466-how-to-debug-a-monitor-showing-as-down-in-uptimerobot), [pausas de Supabase Free](https://supabase.com/docs/guides/platform/free-project-pausing), [funciones de Vercel](https://vercel.com/docs/fluid-compute).
