# Qué valor corresponde a cada variable

Los nombres son los mismos en .env.local y en Vercel. El archivo local no sincroniza sus valores con Production. En Vercel se añaden por separado nombre y valor: en el campo Value no escribir NOMBRE=.

## Direcciones

- APP_ORIGIN: local `http://127.0.0.1:5173`; Vercel Production `https://grandaptive.vercel.app`. Sin barra final. No añadir /api ni /health.
- PORT: `3001` sólo para desarrollo local. Vercel administra el puerto; no es necesario agregarla allí.
- SUPABASE_URL: Project URL de Connect en el proyecto correcto de Supabase. Formato `https://<referencia>.supabase.co`. Mismo valor en ambos entornos para la demo. La dirección del dashboard no sirve como API.

## Claves y secreto interno

- SUPABASE_ANON_KEY: valor completo de Publishable key (`sb_publishable_...`). El nombre antiguo es el que todavía lee nuestro código; no renombrarlo.
- SUPABASE_SERVICE_ROLE_KEY: valor completo de Secret key (`sb_secret_...`). No es la contraseña de la base ni JWT Secret. Nunca llega al frontend.
- Ambas claves se obtienen en Supabase → proyecto GRANDAPTIVE → Settings → API Keys. Deben corresponder a la misma Project URL. Las claves legacy anon/service_role válidas también son compatibles, pero no es necesario cambiar a ellas.
- SERVER_SECRET: secreto aleatorio propio de la app, 32 bytes representados por 64 caracteres hexadecimales. No se obtiene de Supabase. Guardarlo fuera del repositorio; puede ser distinto por entorno, pero debe ser estable en todas las instancias de un mismo entorno.

Si una Secret key o SERVER_SECRET aparece en una captura compartida, reemplazarla. Crear una nueva Secret key, actualizar sus usos y revocar la expuesta desde Supabase. Generar un nuevo SERVER_SECRET y actualizar el entorno correspondiente; los recibos IA pendientes cifrados con el anterior dejarán de ser válidos. No sustituye la revocación de la Secret key y no implica borrar diarios.

En terminal privada, generar SERVER_SECRET con:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
```

No compartir la salida ni incluirla en capturas.

## Configuración actual de la demo

- AUTH_CAPTCHA_ENABLED: `false` mientras no se haya configurado y probado CAPTCHA. Eso no deja listo el login público. Cambiar a `true` después de conectar realmente el proveedor, no para ocultar un error.
- AI_MODE: `disabled` por ahora; `mock` para simulación explícita; `openai` sólo al habilitar llamadas reales.
- OPENAI_API_KEY: vacío en local y omitido en Vercel mientras no esté disponible la clave. No pegar una clave de Supabase aquí.
- OPENAI_MODEL: `gpt-5.4-mini`, valor que admite actualmente este adaptador; mantenerlo mientras AI_MODE esté desactivado. Su uso real requiere evaluación y disponibilidad en la cuenta.
- AI_DAILY_LIMIT: `15`.
- AI_GLOBAL_DAILY_LIMIT: `100`.
- UPTIMEROBOT_API_KEY: no utilizada por la aplicación. Eliminar esa línea o dejarla vacía; `UP` es un estado del monitor, no una clave.
- MONITOR_TOKEN: opcional, dejar vacío/omitido mientras sólo se use /health. No es necesario para el monitor actual.
- VERCEL_OIDC_TOKEN: administrado por la CLI si aparece al final del archivo. No copiarlo manualmente a variables de la app ni compartirlo.

## Después de cambiar valores

Guardar .env.local y reiniciar el servidor local. Guardar las variables en Vercel → grandaptive → Settings → Environment Variables → Production y hacer Redeploy. No reemplazar todo el archivo por la plantilla: editar sólo las líneas correspondientes. Ejecutar `npm run check:connections`; este diagnóstico no imprime las claves ni modifica la base.

Referencia oficial: https://supabase.com/docs/guides/getting-started/api-keys
