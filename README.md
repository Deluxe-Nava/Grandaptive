# GRANDAPTIVE · backend del challenge

Backend TypeScript para diario, perfil, consentimientos, sesiones y OpenAI. Revisión v0.3 del 5 de noviembre de 2026. **Producción y migración 002 conectadas; recorrido con dos cuentas sintéticas aprobado y cuentas eliminadas. El frontend anterior sigue siendo una simulación local y todavía no consume esta API. Faltan CAPTCHA/login interactivo y OpenAI real.**

Objetivo: comprender experiencias, autonomía y bienestar; nunca enseñar a camuflarse mejor. Uso actual: equipo y datos sintéticos. RF-17 tiene una pausa técnica persistente, sin detector, mensajes ni protocolo aprobados por especialistas; no se declara cumplido.

## Abrir en VS Code

Abrir `grandaptive.code-workspace` o esta carpeta con Archivo → Abrir carpeta. Las tareas están en Terminal → Ejecutar tarea.

## Leer primero

Prioridad actual: [conexión y pruebas OpenAI](docs/OPENAI-CONEXION.md). CAPTCHA aplazado por el usuario; el control de login permanece activo.

**Estado actual:** [terminado y pendiente](docs/ESTADO-BACKEND.md). **Siguiente configuración:** [CAPTCHA y cuentas de demo](docs/CAPTCHA-Y-ACCESO.md). Los estados de conexiones fallidas en revisiones anteriores son históricos.

Siguiente etapa: [plan de cierre del backend](docs/CIERRE-BACKEND.md), con dependencias, criterios de terminado y pruebas reales pendientes. Diagnóstico sin escrituras: `npm run check:connections`. Inspección de metadatos en SQL Editor: `supabase/verify-installation.sql` (no confundir con los fixtures de `supabase/tests/`).

Estado más reciente: [revisión contra PRD](docs/REVISION-BACKEND-2026-11-05.md) y [configuración de UptimeRobot](docs/UPTIMEROBOT.md). Aplicar la migración incremental `002_prd_monitoring.sql` después de `001_backend.sql` antes de desplegar v0.3. No se ejecutó SQL remoto durante esta revisión.

1. [Plan detallado](docs/PLAN-BACKEND.md): alcance, módulos, responsables, entregas y pendientes.
2. [Configuración y despliegue](docs/DESPLIEGUE.md): cuentas, variables, OpenAI y publicación.
3. [Contrato HTTP](docs/API-BACKEND.md): rutas para conectar el frontend después.
4. [Verificación](docs/VERIFICACION.md): evidencia local y pruebas externas pendientes.

Los documentos iniciales PLAN-48H, DECISIONES y CONTRATOS conservan el contexto del simulador; la propuesta técnica actual está en los documentos anteriores.

## Ejecutar

Node.js 24.15 o superior compatible. En esta carpeta:

```sh
npm ci
npm run dev:api
```

Sin credenciales, sólo `/api/v1/health` funciona; rutas privadas fallan de forma controlada. Copiar `.env.example` a `.env.local` y seguir DESPLIEGUE.md para conectar Supabase.

```sh
npm run build
npm test
npm run test:db
npm run audit
```

Las pruebas usan datos sintéticos y proveedores simulados. `test:db` ejecuta PostgreSQL embebido con Auth de prueba; no crea cuentas ni gasta créditos. `npm run dev` abre la demo visual anterior en http://127.0.0.1:5173; el proxy `/api` está preparado para la integración futura.

## Carpetas

- `server/`: rutas, validaciones, cookies, permisos, Supabase y OpenAI.
- `api/`: entrada Vercel con el mismo handler local.
- `supabase/migrations/`: esquema, RLS, transacciones, borrado y cuotas.
- `supabase/tests/` y `tests/`: pruebas SQL y TypeScript.
- `scripts/`: pruebas PostgreSQL sin cuentas.
- `src/`: contratos y demo visual existente; integración pendiente.
- `docs/`: plan escrito, contrato y puesta en marcha.
- `.vscode/`: tareas para VS Code.

## Presupuesto

$500 MXN totales declarados; compra prevista de USD 5 para OpenAI API, no realizada aquí. No se pagó ni contrató ningún servicio. IA inicial desactivada. Límites: 15 solicitudes por persona/día, 100 por proyecto/día y 100 intentos reales acumulados por proyecto.

Claves sólo en servidor; nunca variables `VITE_*`. Las pruebas locales no certifican ausencia total de vulnerabilidades, WCAG ni seguridad clínica. La demo visual guarda en localStorage: usar exclusivamente datos ficticios hasta integrar sesiones y limpieza de datos locales.


## Contexto del equipo

Grandaptive is being developed for the **North American AI Challenge for Neurodiverse Learning** by five students from **Tecnológico de Monterrey, Campus Querétaro**, working with **Surfeando la Neurodiversidad** as our Challenge Partner.

Our goal is to support autistic students in understanding their experiences, expressing their needs, and navigating transitions while encouraging mutual understanding with peers and mentors.

## Equipo

- Abril Odette Jiménez Sánchez
- Arturo Sebastián García Soto
- Emma Valentina Molina Hernández
- Erick Domínguez Navarrete
- Naoto Santiago Salvador Masuoka
