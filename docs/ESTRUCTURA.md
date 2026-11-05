# Una carpeta de trabajo

La carpeta local canónica es `C:/Users/erick/Documents/Codex/Grandaptive-publicacion`, conectada a `https://github.com/Deluxe-Nava/Grandaptive.git`. El antiguo `outputs/grandaptive-starter` se conserva sólo como respaldo; no editar ni publicar desde ambas copias. El cambio reorganiza archivos e importaciones, sin añadir funcionalidades ni alterar el esquema de datos.

```text
Grandaptive-publicacion/
  frontend/
    src/                   Interfaz React, estilos y simulación existente
    index.html
    vite.config.ts
  backend/
    src/                   API, autenticación, seguridad y adaptador OpenAI
    scripts/               Diagnósticos y comprobaciones
    tests/                 Pruebas de backend
    supabase/
      migrations/
      tests/
      verify-installation.sql
  shared/
    contracts.ts           Tipos usados por frontend y backend
    core.ts                Reglas y validadores compartidos
    tests/
  api/index.ts             Entrada mínima para Vercel
  docs/                    Contratos, planes, evidencia y prototipos
  .vscode/                 Tareas del editor
  .env.example             Nombres y ejemplos sin secretos
  .env.local               Configuración privada local; ignorada por Git
  package.json
  package-lock.json
  tsconfig.json
  vercel.json
  grandaptive.code-workspace
```

## Desarrollo

Abrir el archivo `grandaptive.code-workspace` de la carpeta canónica. Ejecutar todos los comandos desde la raíz:

```powershell
npm ci
npm run dev:api
```

En otra terminal, `npm run dev` sirve el frontend en `http://127.0.0.1:5173`; `/api` se dirige al backend local en el puerto 3001. El frontend conserva su simulador; la reorganización no implementa el login ni lo conecta automáticamente a la API.

`npm run check`, `npm test`, `npm run test:db` y `npm run build` mantienen sus nombres. En el entorno Windows restringido se puede comprobar la suite sin crear procesos de aislamiento con `node --test --test-isolation=none backend/tests/*.test.ts shared/tests/*.test.ts`.

## Secretos y separación

`.env.local` vive únicamente en la raíz y lo leen los comandos del backend. No poner claves en `frontend/`, `shared/` ni variables `VITE_*`. Vite usa `frontend/` como raíz. La configuración del frontend no carga deliberadamente el archivo privado de la raíz. Los módulos compartidos no importan el backend ni leen credenciales.

La configuración guardada en disco del proyecto anterior puede conservarse localmente; los cambios que aún estén abiertos sin guardar en el editor deben guardarse antes de cambiar de carpeta. `.vercel/` también queda fuera de Git. Las variables Production se administran por separado en Vercel.

## Publicación

Vercel debe usar la raíz del repositorio como Root Directory. `npm run build` compila desde `frontend/` y deja los archivos estáticos en `dist/`. `api/index.ts` importa el backend y conserva `/api/v1/*`. No seleccionar `frontend/` como raíz de Vercel: excluiría el backend de este despliegue conjunto.

El movimiento de `supabase/` a `backend/supabase/` no requiere volver a ejecutar migraciones ya aplicadas. Al publicar, revisar el commit en Vercel, su estado Ready, y GET/HEAD de `/api/v1/health`. Eso confirma disponibilidad básica, no la validación completa de Supabase, login u OpenAI en producción.

Los marcadores vacíos `frontend/package.json`, `backend/package.json`, Prisma y archivos de ejemplo vacíos se retiraron: no formaban parte de una implementación. Se conserva un solo conjunto de dependencias para simplificar el MVP.
