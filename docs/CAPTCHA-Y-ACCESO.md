# Habilitar acceso de demo con CAPTCHA

Propuesta: Cloudflare Turnstile Managed. La configuración del proveedor requiere una cuenta del equipo; no se creó ni contrató desde esta entrega. El backend ya recibe captchaToken y lo envía a Supabase Auth. No validar el mismo token dos veces: Supabase realiza la verificación.

## 1. Crear el widget

1. Entrar al dashboard de Cloudflare, abrir Turnstile y seleccionar Add widget.
2. Nombre: GRANDAPTIVE. Hostname: grandaptive.vercel.app, sin protocolo ni ruta.
3. Seleccionar Managed; no habilitar pre-clearance para esta integración.
4. Guardar la Site key y la Secret key en el lugar correspondiente. Son distintas de las claves de Supabase.
5. La Secret key se configura en Supabase, no en el frontend. La Site key es pública y se usa para renderizar el widget cuando se conecte el formulario.

La política CSP de vercel.json permite scripts e iframe sólo desde challenges.cloudflare.com para este widget, sin habilitar unsafe-inline ni unsafe-eval. Esto prepara las cabeceras; no significa que el widget ya esté integrado.

## 2. Activar en Supabase

1. Abrir el proyecto GRANDAPTIVE → Authentication / configuración → Bot and Abuse Protection.
2. Activar CAPTCHA, seleccionar Turnstile y pegar su Secret key. Guardar.
3. Mantener registro público deshabilitado para la demo por invitación; comprobar la opción de altas en configuración de Auth. No deshabilitar RLS.
4. Cuando el proveedor esté configurado, poner AUTH_CAPTCHA_ENABLED=true en Vercel Production y redeploy. La bandera no configura ni verifica el proveedor.
5. En .env.local, usar true sólo cuando el entorno local apunte a ese mismo proyecto protegido. No cambiar APP_ORIGIN local a producción.

## 3. Crear cuentas del equipo

En Authentication → Users, crear usuarios de demo por administración con correo del equipo y contraseña única. No compartir contraseñas por chat ni guardarlas en el repositorio. Deben ser usuarios confirmados según el flujo administrativo elegido.

Por cada UUID confirmado, habilitar exclusivamente esa cuenta desde el SQL Editor administrativo:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"challenge_member":true}'::jsonb
where id = 'REEMPLAZAR-POR-UUID-EXACTO'::uuid;
```

No ejecutar con el placeholder ni quitar WHERE. No usar user_metadata para esta autorización. Iniciar sesión de nuevo después de habilitar la cuenta.

## 4. Integración del formulario (pendiente frontend)

Renderizar el widget con la Site key. Recibir su token en memoria y enviar al backend del mismo origen:

```text
POST /api/v1/auth/login
Content-Type: application/json
X-Requested-With: grandaptive
Body: {email, password, captchaToken}
```

El navegador envía Origin automáticamente. Usar credentials: same-origin. El backend emite las cookies HttpOnly; no copiar JWT a localStorage. Limpiar contraseña/token del formulario tras uso; restablecer el widget cuando el token expire o haya un intento de acceso.

No crear una ruta alternativa que omita CAPTCHA. Para pruebas locales usar un widget/entorno permitido por el proveedor; no poner claves universales de prueba en producción.

## 5. Criterios de terminado

- Usuario de demo con contraseña y token válidos inicia sesión; usuario no habilitado no accede.
- Token ausente, inválido o reutilizado se rechaza sin filtrar detalles internos.
- Cookies Secure, HttpOnly, SameSite y Path=/ comprobadas en navegador.
- Cierre de sesión y cierre global bloquean acceso posterior; refresh sólo funciona mientras la sesión siga activa.
- El widget permite navegación por teclado y ofrece error comprensible sin borrar el relato del usuario.

Documentación oficial: [Cloudflare widget](https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/), [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [CSP de Turnstile](https://developers.cloudflare.com/turnstile/reference/content-security-policy/).
