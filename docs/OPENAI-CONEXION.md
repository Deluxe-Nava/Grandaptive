# Conectar y evaluar OpenAI

5 de noviembre de 2026. CAPTCHA aplazado por el usuario; no se declara resuelto ni se desactiva el bloqueo del login público. Las pruebas de IA de este documento se ejecutan desde una terminal privada del equipo con relatos ficticios, sin necesitar un formulario de login ni crear una ruta pública alternativa.

## Estado

El adaptador usa Responses API, gpt-5.4-mini, esquema JSON estricto, store:false, timeout de 15 segundos y máximo de 900 tokens de salida. No usa herramientas ni reintentos automáticos. La configuración explícita prevalece sobre perfil/adaptación. El contrato cubre acompañamiento, resumen, interpretación, formulaciones y patrones; guardar diario no llama a IA.

OPENAI_API_KEY estaba vacía al iniciar la revisión y el usuario la configuró después. Se completaron seis solicitudes reales: una inicial y las cinco operaciones de la suite, HTTP 200 y validación local aprobada. Se reservaron seis intentos acumulados en Supabase; no se comprobó saldo monetario ni se hizo una compra. El adaptador funciona desde el entorno local; la configuración de la clave en Vercel queda a cargo del usuario y no está verificada. AI_MODE no se modificó automáticamente.

## 1. Cuenta, crédito y clave

1. Entrar a OpenAI Platform con la cuenta que administrará el equipo.
2. Abrir Billing y añadir el crédito previsto de USD 5 si esa opción está disponible en la cuenta. Comprobar el importe final antes de pagar; no activar recarga automática si sólo se autoriza ese presupuesto. No asumir que tener ChatGPT implica crédito API disponible.
3. Seleccionar o crear un proyecto dedicado a GRANDAPTIVE y generar una clave de servidor. Debe permitir crear respuestas y acceder al modelo configurado. No compartirla por chat, capturas o Git.
4. En .env.local editar únicamente OPENAI_API_KEY con la clave completa. Mantener OPENAI_MODEL=gpt-5.4-mini y AI_MODE=disabled durante la primera validación. No cambiar las claves Supabase ni SERVER_SECRET.

Acceso: https://platform.openai.com/settings/organization/billing/overview y https://platform.openai.com/api-keys. Los nombres y opciones visibles dependen de los permisos de la cuenta.

## 2. Prueba controlada

Sin consumo de OpenAI, verifica presencia de clave/modelo:

```powershell
npm run check:openai
```

Una solicitud real facturable con un relato sintético:

```powershell
npm run check:openai -- --live
```

Después, hasta cinco solicitudes para revisar todas las operaciones:

```powershell
npm run check:openai -- --live --suite
```

El script muestra sólo respuestas sintéticas, estado HTTP y resultado de validación; no imprime claves ni errores completos del proveedor. Cada intento reserva cuota global y uno de los 100 intentos acumulados en Supabase; no se devuelve la reserva por fallo. No modifica AI_MODE, no lee diarios y no guarda interpretaciones. La reserva de cuota puede contar una operación que no llegó a facturarse: el dato es intentos, no dólares.

Un PASS significa que la respuesta pasó los esquemas y filtros automáticos, no una aprobación clínica. Revisar manualmente: incertidumbre ante intenciones ajenas, no diagnóstico, no presión para camuflarse, máximo dos preguntas, escucha sin recomendaciones, separación original/IA y resistencia a instrucciones dentro del relato. Registrar versión del prompt, modelo y casos. La suite inicial no agota el banco de evaluación del PRD.

## 3. Activar en Vercel después de probar

La primera prueba y la suite inicial ya pasaron. Se puede activar openai para la demo con datos ficticios tras configurar las variables; siguen pendientes el banco completo de evaluación, el formulario de acceso y la validación especializada de RF-17. Local y Production pueden tener modos distintos: no es obligatorio activar ambos a la vez.

En grandaptive → Production configurar OPENAI_API_KEY, OPENAI_MODEL=gpt-5.4-mini, AI_DAILY_LIMIT=15 y AI_GLOBAL_DAILY_LIMIT=100. Cambiar AI_MODE=openai sólo después de revisar resultados y costo; redeploy para aplicar variables. Si falla la prueba, conservar AI_MODE=disabled o usar mock explícito para integración, no fingir una conexión real.

El acceso a /ai/operations sigue requiriendo sesión, conversación y consentimientos. Aplazar CAPTCHA no abre el login ni elimina esos controles. La conexión del widget/formulario y el frontend siguen pendientes para un recorrido público completo.

## Costos y límites

La documentación consultada de gpt-5.4-mini indica USD 0.75 por millón de tokens de entrada y USD 4.50 por millón de salida. El costo depende del contexto y de la respuesta; no equivale a pagar USD 5 por una API ilimitada. El tope de 900 tokens limita sólo la salida, y la cuota acumulada de 100 limita intentos de esta aplicación. Otros usos de la misma clave también consumen crédito.

HTTP 401: clave rechazada; 403: permisos; 404: recurso/modelo; 429: puede ser cuota, crédito o límite de solicitudes. No aumentar cuotas ni reintentar en bucle para resolver estos errores. store:false evita almacenar la respuesta como recurso consultable de Responses, pero no es una promesa de retención cero por parte del proveedor.

Referencias oficiales: [modelo y precio](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [controles de datos](https://developers.openai.com/api/docs/guides/your-data).
