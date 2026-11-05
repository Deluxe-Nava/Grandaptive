# Plan de cierre del backend

**Avance posterior:** conexiones y migración 002 verificadas; empaquetado TS2688 corregido y publicado; recorrido de dos cuentas sintéticas aprobado con limpieza completa. Estado vigente y límites en [ESTADO-BACKEND.md](ESTADO-BACKEND.md). La sección «Estado comprobado al iniciar el cierre» conserva el diagnóstico inicial, ya superado. El siguiente trabajo externo es [CAPTCHA y acceso](CAPTCHA-Y-ACCESO.md).

Actualizado el 5 de noviembre de 2026. Alcance: hacer funcional y verificable el backend del challenge; el diseño visual lo realizará el equipo con Claude Code. Basado en el PRD, PrimerAcercamientoMVP y decisiones posteriores del usuario. Las etiquetas originales [E]/[R]/[S]/[D] conservan su significado. Las decisiones técnicas de este plan son propuestas de implementación salvo confirmación previa explícita.

## Estado comprobado al iniciar el cierre

- Producción: GET y HEAD /api/v1/health devuelven 200 y GET informa versión 0.3. UptimeRobot en línea, confirmado por el usuario. No requiere API key en la aplicación.
- Producción: GET /api/v1/auth/session sin cookies devuelve 503; debe devolver 401 una vez configurado correctamente.
- Entorno local: formato de configuración válido, pero Supabase Auth y REST rechazan con 401 las claves copiadas. Aún no puede confirmarse la migración remota.
- IA local: desactivada, sin clave. CAPTCHA local declarado inactivo. Estas variables locales no prueban el estado del entorno Production.
- La CLI autenticada de Vercel confirmó la presencia en Production de APP_ORIGIN, PORT, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SERVER_SECRET y AI_MODE. No se descargaron sus valores. CAPTCHA, OPENAI_API_KEY/OPENAI_MODEL y límites explícitos todavía no figuran en esa lista; los límites tienen defaults en código. Mantener la IA desactivada hasta su etapa de conexión.
- Ya existen módulos de diario, perfil, consentimiento, preferencias, autenticación, IA, exportación, cascadas, cuotas y pausa. Hay 60 pruebas locales aprobadas en la revisión anterior, compilación y SQL embebido aprobados; no equivalen a pruebas con Auth real.

## Secuencia y dependencias

Credenciales → esquema y RLS → sesión y CAPTCHA → recorrido de dos cuentas → permisos y derivados → IA simulada → OpenAI real evaluado → entrega de contrato al frontend → prueba conjunta.

Se puede trabajar en paralelo en documentación y casos de evaluación. No activar OpenAI para compensar un fallo del diario ni abrir registro público antes de verificar aislamiento. No se añaden voz, biblioteca, sincronización offline, vectores o microservicios.

## 1. Conectar correctamente Supabase y Vercel

Objetivo: disponer de una base verificable y configuración de producción válida. Cubre RF-15, RNF-03 y RNF-04.

- En Supabase, abrir el proyecto GRANDAPTIVE. Connect muestra la URL; Settings → API Keys contiene las claves.
- Se recomiendan Publishable y Secret actuales. Con los nombres que lee este código, SUPABASE_ANON_KEY recibe Publishable y SUPABASE_SERVICE_ROLE_KEY recibe Secret. Si se mantienen claves legacy válidas, corresponden a anon y service_role. No intercambiarlas ni usar JWT Secret, contraseña de la base o token personal de Supabase.
- Copiar URL y claves completas del mismo proyecto en .env.local y en Vercel → grandaptive → Settings → Environment Variables → Production. La clave de servidor nunca se publica en VITE_*, el frontend o Git.
- APP_ORIGIN local puede seguir en http://127.0.0.1:5173; Production debe ser exactamente https://grandaptive.vercel.app. SERVER_SECRET debe conservar el secreto aleatorio válido de 64 caracteres hexadecimales; no regenerarlo en cada despliegue.
- Redeploy después de cambiar variables de Production. No sobrescribir .env.local con la plantilla.
- Ejecutar `npm run check:connections`. Sólo realiza diagnósticos sin escrituras, no llama a OpenAI y no imprime secretos ni cuerpos del proveedor.

Terminado cuando: health GET/HEAD 200, sesión sin cookies 401, Auth de Supabase 200 y consultas de esquema autorizadas. Un 401 de Supabase no demuestra RLS: primero hay que autenticar la aplicación.

Referencia: https://supabase.com/docs/guides/getting-started/api-keys

## 2. Confirmar esquema, permisos y migraciones

Objetivo: asegurar los contratos de persistencia. Cubre RF-01, RF-06–RF-13, RF-15, RF-17 técnico y RNF-04/10.

- Ejecutar `supabase/verify-installation.sql` en SQL Editor. Sólo consulta metadatos, sin modificar usuarios ni datos.
- Si no existe el esquema de GRANDAPTIVE, revisar/aplicar 001_backend.sql y luego 002_prd_monitoring.sql en esa base.
- Si 001 ya existe y falta 002, aplicar únicamente 002. Si hay instalación parcial o cambios manuales, revisar diferencias antes de repetir cualquier migración. No aplicar a la base de Cipherwatch.
- 002 normaliza preferencias, agrega feedback de lecturas, contador privado de pausas, lectura del presupuesto y comprobación de dependencias; también exige membresía de demo en RLS. Puede invalidar recibos pendientes por cambio de revisión de preferencias.
- `supabase/tests/*.sql` usa fixtures de prueba: NO ejecutar esos archivos sobre producción. `npm run test:db` los ejecuta de forma aislada en PostgreSQL embebido.

Terminado cuando: verificación sin MISSING/FAIL y RPC backend_readiness devuelve 2. Esta inspección no sustituye las pruebas entre dos cuentas.

## 3. Sesiones reales y protección de formularios

Objetivo: acceso cerrado al equipo, contraseñas delegadas a Supabase Auth y sesiones revocables. Cubre RF-15 y RNF-04.

- Crear dos cuentas de prueba con correos del equipo, sin relatos reales. Habilitarlas mediante app_metadata.challenge_member=true, nunca user_metadata. DESPLIEGUE.md contiene el procedimiento por UUID.
- Configurar CAPTCHA compatible con Supabase Auth y dominio de producción; activar AUTH_CAPTCHA_ENABLED sólo después de configurar el servicio. La bandera no sustituye la validación real del CAPTCHA.
- Probar token válido, ausente, falso y reutilizado. La obtención del token requiere un cliente/widget de prueba o el frontend; el backend ya acepta captchaToken. No desactivar controles para simular que el login pasó.
- Comprobar cookies Secure/HttpOnly/SameSite, expiración y cierre en todos los dispositivos; los JWT no se guardan en localStorage.
- Propuesta de corte: acceso por invitación. Registro abierto, recuperación pública y gestión de edad siguen pendientes; si se exige producto abierto, deben implementarse y probarse antes de declararlo completo.

Terminado cuando: login válido funciona, token inválido falla, usuario no habilitado queda bloqueado y una sesión revocada ya no accede. No registrar contraseñas ni cookies en evidencia.

## 4. Recorrido funcional y aislamiento

Objetivo: validar el valor central sin depender de IA. Cubre RF-01, RF-06/07, RF-09–RF-15.

1. Cuenta A guarda sólo texto, consulta, busca y edita con versión. Guardar no genera llamadas OpenAI.
2. Cuenta B intenta leer/modificar/borrar los IDs de A por backend y REST/RPC de Supabase con su propio JWT. Debe obtener rechazo o cero filas, sin efectos cruzados.
3. A crea y modifica perfil manual, preferencias visuales y preferencias IA separadas.
4. Consentimientos independientes e interruptor global: cambios revocan el uso futuro; recibos con contexto anterior no se aceptan.
5. Con IA mock, guardar interpretación sólo por acción explícita, marcar «no encaja», editar fuente y comprobar etiqueta de versión anterior.
6. Ver plan de borrado, cancelar sin efectos o confirmar cascada. Comprobar derivados transitivos y que el contenido eliminado no se use en futuras solicitudes IA.
7. Exportar datos legibles; eliminar una cuenta de prueba autorizada y comprobar cascada, revocación y ausencia de acceso posterior.

Terminado cuando: cada caso tiene resultado y evidencia sin contenido sensible. Limitación a resolver/documentar: la política implementada elimina derivados o permite cancelar; conservarlos como manuales no está implementado. Exportación TXT es una propuesta de formato, no una decisión establecida por el PRD.

## 5. OpenAI, costos y evaluación

Objetivo: probar las cinco operaciones y la degradación segura. Cubre RF-03–RF-05, RF-08/09, RF-13/14/16 y RNF-09/10.

- Primero AI_MODE=mock con cuenta autenticada y consentimientos; mostrar siempre que es simulación.
- Cuando el crédito de USD 5 y la clave del proyecto estén disponibles, configurar OPENAI_API_KEY sólo en servidor. AI_MODE=openai habilita consumo; conservar los límites y el modelo admitido hasta evaluar cambios.
- Verificar resumen sólo solicitado, acompañamiento, interpretación con alternativas/incertidumbre, formulaciones y patrón tentativo. Nunca guardar una sugerencia en el perfil automáticamente.
- Probar configuración explícita sobre perfil/adaptación, sólo escucha, omitir, cambiar tema, datos insuficientes, frases diagnósticas, atribuciones de terceros e instrucciones maliciosas dentro del diario.
- Probar fallo/timeout del proveedor, respuesta inválida y cuota agotada: diario y perfil manual siguen utilizables. No sustituir un fallo real por una simulación silenciosa.
- Verificar corte acumulado de 100 intentos y aviso desde 80 %. No equivale a USD restantes; revisar consumo real en el proveedor y usos de la clave fuera de la app.

Terminado cuando: se registran modelo, versión del prompt, casos sintéticos, resultado esperado/observado y consumo, sin afirmar evaluación clínica. Pendiente funcional: el rechazo de patrones bloquea la clave exacta, no todas las paráfrasis. Debe resolverse o declararse parcial, nunca darse por cumplido CA-08.3 sólo con filtros.

## 6. Seguridad, privacidad y RF-17

Objetivo: no confundir controles técnicos con aprobación clínica o privacidad completa.

- Revisar secretos sólo servidor, validación estricta, consultas parametrizadas, control de origen y cuotas. Repetir auditoría de dependencias al cambiar paquetes; una auditoría sin avisos no demuestra ausencia total de vulnerabilidades.
- Comprobar privacidad de logs, plazo de retención y borrado en servicios/backups. Definir aviso por capas y tratamiento de adolescentes con responsables institucionales. Las encuestas del partner no sustituyen estas decisiones.
- RF-17: probar pausa persistente, rechazo de generación y guardado posterior, y contador mínimo privado. Escenarios de activación, recursos, mensaje y protocolo de crisis/autolesión/abuso dependen de especialistas; no se implementa un protocolo clínico inventado.
- Mantener la demo con el equipo y datos sintéticos mientras estos puntos sigan abiertos.

Terminado técnico cuando: pruebas de controles aprobadas. RF-17 completo y participación real permanecen pendientes de validación especializada; no se marcan como resueltos por el monitor verde.

## 7. Entrega al frontend y prueba conjunta

Contrato de referencia: API-BACKEND.md. Orden: sesión/CAPTCHA → diario real sin IA → permisos/configuración → IA mock → interpretación separada y guardado voluntario → perfil/exportación/borrado → IA real evaluada.

El frontend debe renderizar texto de usuario/IA sin HTML ejecutable, limpiar borradores al cambiar de cuenta, mostrar procedencia y simulación, y respetar pausa/errores de cuota. Debe aplicar preferencias visuales y verificar WCAG 2.2 AA con teclado, lector, foco, contraste, zoom y mensajes de error. El backend por sí solo no cumple esos criterios.

Terminado cuando: recorrido conjunto en móvil/escritorio y sin red/proveedor, aislamiento entre cuentas y manejo de sesión comprobados. No declarar todo el MVP completo mientras los criterios anteriores y dependencias del PRD sigan pendientes.

## Reparto propuesto para cinco integrantes

- Integrante 1: configuración de proveedores, migraciones y publicación; revisar cambios con integrante 2.
- Integrante 2: autenticación, CAPTCHA y pruebas de aislamiento/cascada.
- Integrante 3: contratos y conexión frontend/backend; coordinación con quien use Claude Code.
- Integrante 4: IA, casos sintéticos, preferencias, costos y fallos del proveedor.
- Integrante 5: registro de evidencia, privacidad, accesibilidad y coordinación con especialistas.

Asignación propuesta, no supone especialidades reales. La ruta crítica pasa por credenciales, esquema, Auth y dos cuentas. La evaluación IA y revisión de accesibilidad pueden prepararse en paralelo; especialistas son dependencia externa para RF-17 completo.
