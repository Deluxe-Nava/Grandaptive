# Configuración y despliegue del backend

Estado al 5 de noviembre de 2026: existe publicación v0.2 en grandaptive.vercel.app; health responde 200 y sesión 503 de configuración. Archivos locales v0.3 preparados, sin publicar desde esta revisión ni ejecutar SQL remoto. No se realizó pago ni llamada OpenAI facturable. Seguir con datos sintéticos. Consultar [UPTIMEROBOT.md](UPTIMEROBOT.md) para corregir Production y configurar el monitor.

## 1. Preparación local

Abrir `grandaptive.code-workspace` en VS Code. Terminal en esta carpeta. Node.js 24.15 o superior compatible.

```powershell
npm ci
npm run build
npm test
npm run test:db
Copy-Item -LiteralPath .env.example -Destination .env.local
```

Copiar el entorno sólo si no existe; no sobrescribir claves ya configuradas. `.env.local` está excluido de Git. Configurar valores manualmente en ese archivo; nunca pegarlos en chat ni capturas.

Generar un secreto aleatorio de 32 bytes para SERVER_SECRET con un gestor de contraseñas o, en terminal privada:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copiar los 64 caracteres a SERVER_SECRET y evitar compartir el historial de terminal. No reutilizar una contraseña. Usar el mismo secreto sólo entre funciones del mismo entorno; cambiarlo invalida recibos pendientes y cambia las claves HMAC de cuotas.

## 2. Supabase: base y autenticación

1. Crear un proyecto nuevo de Supabase Free en cuenta controlada por el equipo. Elegir región documentando dónde se procesarán los datos. Guardar contraseña administrativa en gestor de contraseñas. No se necesita exponer una conexión PostgreSQL directa en la aplicación.
2. Leer `backend/supabase/migrations/001_backend.sql` con otra persona y ejecutarlo UNA VEZ en SQL Editor del proyecto nuevo. Está diseñado para crear tablas; no es migración idempotente para una base existente ni debe ejecutarse sobre datos ajenos. Después aplicar `002_prd_monitoring.sql`. Si 001 ya está aplicada, ejecutar únicamente 002. Esta migración añade preferencias, feedback, conteos y monitoreo, y refuerza membresía en RLS; normaliza preferencias existentes e invalida recibos que usaban su revisión anterior. Respaldar datos existentes antes de migrar.
3. Verificar RLS en todas las tablas públicas creadas. No desactivar políticas para “arreglar” un error. La migración usa `auth.sessions`; comprobar en este proyecto compatibilidad con la comprobación de sesión.
4. Copiar URL, anon key y service role key a las variables respectivas del servidor. La clave administrativa evita RLS y debe permanecer exclusivamente en servidor. El cliente no necesita estas claves: consumirá nuestra API.
5. En Auth deshabilitar registro público. Para esta demo crear dos usuarios de prueba del equipo con correos bajo su control y contraseñas únicas. No enviar diarios reales.
6. Habilitar explícitamente a cada usuario con `app_metadata.challenge_member=true` mediante la API administrativa de Auth o las herramientas administrativas del dashboard. NO usar `user_metadata`, editable por el usuario. Si se utiliza SQL Editor para los dos usuarios creados, actualizar sólo su UUID confirmado:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"challenge_member":true}'::jsonb
where id = 'REEMPLAZAR-POR-UUID-DEL-USUARIO-DE-PRUEBA'::uuid;
```

No introducir el placeholder literalmente ni usar una actualización sin WHERE. Este paso no crea ni cambia contraseñas. La comprobación de membresía está en el backend y, con 002, también en RLS; registro público cerrado y control de altas son parte necesaria de esta demo.
7. Configurar política de contraseñas, URL del sitio y URLs de redirección exactas. No habilitar SMTP ni recuperación pública hasta decidir y probar ese flujo; no está conectado en esta entrega.
8. Crear CAPTCHA Turnstile o hCaptcha y activarlo en Supabase Auth con el secreto del proveedor y dominios permitidos. El frontend futuro enviará `captchaToken`; Supabase valida el token. No consumirlo también con otra verificación porque es de un solo uso. La bandera `AUTH_CAPTCHA_ENABLED=true` es una comprobación de configuración declarada, NO activa ni demuestra que el proveedor esté protegido. [Guía CAPTCHA Supabase](https://supabase.com/docs/guides/auth/auth-captcha).
9. Comprobar inicio con token válido y rechazo con token vacío/falso/reutilizado. Sin widget integrado se pueden usar las herramientas de prueba del proveedor en entorno de desarrollo; nunca sus claves de prueba en despliegue público. Esta prueba queda pendiente hasta integrar CAPTCHA real.

Supabase utiliza hashes de contraseña administrados por Auth. No agregar cifrado reversible propio. [Seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security).

## 3. Entorno local y esqueleto conectado

`.env.local` define:
- APP_ORIGIN: exactamente `http://127.0.0.1:5173`, sin slash final.
- SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY: proyecto de pruebas.
- SERVER_SECRET: secreto aleatorio generado.
- AUTH_CAPTCHA_ENABLED: true después de configurar Auth.
- AI_MODE: disabled inicialmente; mock para ensayar sin consumo.
- OPENAI_API_KEY: vacío mientras no exista cuenta/crédito.
- OPENAI_MODEL: gpt-5.4-mini.
- AI_DAILY_LIMIT: 15; AI_GLOBAL_DAILY_LIMIT: 100.

Ejecutar en dos terminales:

```powershell
npm run dev:api
```

```powershell
npm run dev
```

API local en puerto 3001 y proxy del navegador en 5173. Health: `http://127.0.0.1:5173/api/v1/health`. La UI todavía usa su simulador: que cargue no demuestra conexión con la base. Usar el contrato HTTP para pruebas con cliente REST y cookie jar, enviando Origin y X-Requested-With correctos. No registrar tokens/cookies en archivos de ejemplo.

Primer recorrido real: login → guardar entrada sin IA → leer → cuenta B intenta acceso → editar con versión → borrar con confirmación. Luego permisos, conversación, mock, guardar recibo, exportar y cerrar todas las sesiones.

## 4. OpenAI y los USD 5

1. El equipo crea/accede a su cuenta API de OpenAI, revisa condiciones y compra el crédito previsto desde facturación. No asumir que una suscripción de ChatGPT cubre este consumo ni que el pago ya se realizó.
2. Crear proyecto y clave dedicados al challenge, con acceso mínimo necesario a Responses y al modelo elegido. No compartir clave entre integrantes por chat.
3. Definir presupuesto/alertas disponibles en el proveedor, revisar recarga automática y mantenerla deshabilitada si no desean recargas. Las alertas por sí solas no deben tratarse como corte infalible.
4. Poner OPENAI_API_KEY sólo en servidor. Cambiar AI_MODE=openai y reiniciar/redeploy únicamente cuando sesión, permisos, cuotas y mock pasen.
5. Probar con un relato ficticio breve. Verificar JSON, cumplimiento de preferencias, fallo/refusal y consumo en dashboard; después ejecutar banco sintético revisado.
6. Si el modelo no está disponible para la cuenta, no cambiarlo sin evaluar compatibilidad, costo y reglas. El código acepta sólo el modelo previsto para evitar un cambio accidental costoso.

Adaptador: `POST https://api.openai.com/v1/responses`, JSON Schema estricto, `store:false`, sin herramientas, sin streaming, espera de 15 s y 900 tokens máximos de salida. No envía correo, contraseña ni tokens. El texto del diario puede contener datos personales: sólo usar ficticios durante esta fase.

Además de cuotas diarias, PostgreSQL reserva **100 intentos reales acumulados** por proyecto. Este tope no se resetea automáticamente ni debe subirse para resolver errores sin revisar consumo. Una solicitud fallida puede haber sido facturada; por eso no se devuelve el cupo. Inspección administrativa:

```sql
select calls from private.ai_budget where id = true;
```

No equivale a saldo en USD ni cubre uso de la clave fuera de esta app. No hay compra ni llamada facturable ejecutada por esta entrega.

## 5. Vercel

1. Confirmar elegibilidad de Hobby: uso personal no comercial y limitaciones de colaboración. Si no encaja, evaluar alternativa descrita en PLAN-BACKEND.md antes de pagar.
2. Crear cuenta/proyecto. Subir únicamente código a un repositorio controlado por el equipo; excluir `.env*` salvo plantilla, node_modules, diarios/exportaciones y claves. No se ha creado ni publicado ese repositorio aquí.
3. Importar en Vercel. Si suben sólo esta carpeta, Root Directory es la raíz; si suben todo el workspace, elegir `outputs/grandaptive-starter`. Framework Vite; build `npm run build`; output `dist`; Node 24.x compatible. El código usa `api/index.ts` y rewrites de `vercel.json`.
4. Cargar variables en Environment Variables del servidor para el entorno correcto. APP_ORIGIN debe ser exactamente la URL estable HTTPS del proyecto. Vercel se detecta como producción y activa cookies Secure. No poner secretos bajo prefijo VITE_ ni en Build Command.
5. Mantener AI_MODE=disabled para primer despliegue. No reutilizar base ni claves de producción sensible en previews de ramas. Origen exacto implica configurar por separado cada entorno; no usar comodín `*.vercel.app`.
6. Desplegar y probar `/api/v1/health`, login, cookies y rutas privadas. La reescritura de URL y preservación de cookies debe verificarse en Vercel real; build local no la acredita.
7. Configurar CAPTCHA para dominio final. La CSP actual no permite widgets externos: al integrar la UI, agregar únicamente los dominios script/frame/connect necesarios del proveedor siguiendo su documentación, y probar. No resolverlo con `*` o `unsafe-inline` general.
8. Repetir pruebas externas de VERIFICACION.md antes de demo. Preparar fallback mock señalado.
9. Más adelante: agregar dominio propio y DNS desde Vercel. No comprar dominio para este primer corte. HTTPS/certificados son gestionados por el hosting. [SSL Vercel](https://vercel.com/docs/domains/working-with-ssl).

## 6. Qué NO acredita un despliegue correcto

Un health 200 no demuestra base configurada, Auth, aislamiento, IA ni cumplimiento RF-17. CAPTCHA debe fallar con token inválido; no basta una variable. Las pruebas SQL embebidas no sustituyen Supabase real. La UI actual conserva datos en localStorage y no está conectada a estas sesiones. No usar diarios reales hasta cerrar integración, política de retención y validaciones pendientes.

