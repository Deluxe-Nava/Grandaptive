# Revisión del backend contra el PRD

Fecha: 5 de noviembre de 2026. El usuario confirmó la publicación de v0.3 mostrando la respuesta de health y posteriormente confirmó UptimeRobot en línea. Falta comprobar los flujos con servicios reales. Este documento complementa PLAN-BACKEND.md y no declara completo todo el MVP.

## Fuentes y alcance

Se revisaron PRD.MVP.GRANDAPTIVE.v1.pdf (38 páginas), PrimerAcercamientoMVP.pdf (11 páginas) y el [chat compartido](https://chatgpt.com/share/6aebb0bb-9414-83e8-9793-deadc1226290), cuyo texto sí pudo consultarse en esta revisión. No se reprodujo ni modificó su diseño visual. Se preserva el diario como centro, perfil híbrido y configuración explícita por encima de adaptaciones. El objetivo es comprender experiencias y favorecer autonomía y bienestar, sin enseñar mejor camuflaje ni imponer dejar de camuflarse.

Las etiquetas [E]/[R]/[S]/[D] del PRD no cambian. La decisión posterior del usuario excluye voz, biblioteca y sincronización offline del primer corte. Vercel y Supabase fueron confirmados como servicios utilizados; no se confirmó su configuración completa. OpenAI API está previsto con USD 5; no se hizo compra ni llamada facturable.

## Cobertura funcional y límites

- **RF-01:** CRUD del diario sin IA al guardar. El borrador automático y su limpieza al cambiar de cuenta corresponden al frontend pendiente de integración.
- **RF-02 y RF-18:** fuera del corte aprobado; sin voz ni biblioteca.
- **RF-03 y RF-04:** operaciones voluntarias, resumen explícito, máximo dos preguntas, omitir/cambiar tema/escuchar, prioridad de configuración. Se añadió continuidad de un intercambio anterior mediante recibo cifrado y validado. No es historial completo. Falta evaluar el comportamiento del modelo real, especialmente no insistir ni afirmar estados de terceros.
- **RF-05:** 2–3 formulaciones y contexto, sin envío automático. Edición y copia son trabajo de frontend. Validación estructural y filtros no demuestran seguridad semántica universal.
- **RF-06 y RF-07:** perfil manual y sugerido, cinco categorías, origen/fecha, texto sensorial libre y consentimiento de capa 3. El formulario opcional con ejemplos requiere frontend.
- **RF-08:** autorización de capa 2, fuentes trazables, aceptación/edición/rechazo y bloqueo de una clave de patrón rechazada. No se garantiza detectar todas las paráfrasis de un patrón rechazado: aceptación CA-08.3 queda parcial.
- **RF-09:** preferencias de tono, extensión, preguntas, escucha, seguimiento, ejemplos, literalidad y modalidad de texto; vista previa simulada sin proveedor, restablecimiento mediante PATCH. La vista previa no predice exactamente al modelo real. La prioridad de N1 está implementada en instrucciones y validaciones; requiere banco de evaluación real.
- **RF-10:** persistencia separada de preferencias visuales. Aplicación inmediata, reflow a 200 %, movimiento y contraste requieren interfaz y pruebas de accesibilidad.
- **RF-11:** historial/búsqueda, versiones, marca basada en versión anterior y plan de eliminación con cascada transaccional. Política propuesta: eliminar derivados o cancelar; conservarlos como manuales sigue pendiente. La UI debe mostrar alcance y pedir confirmación antes de borrar.
- **RF-12:** tres capas independientes e interruptor global, exportación TXT propuesta, borrado de cuenta activa, cierre remoto. Plazos de backups/proveedores, aviso por capas y revisión de privacidad siguen pendientes; no prometer eliminación inmediata de copias externas.
- **RF-13:** formato de hechos reportados/lecturas/incertidumbre, alternativas o abstención; se añadió «no encaja» persistente en interpretaciones guardadas sin alterar el original. La tarjeta y feedback de respuestas no guardadas corresponden al frontend.
- **RF-14:** IDs de contexto del perfil disponibles para transparencia mínima. Indicador visible pendiente de interfaz.
- **RF-15:** sesión con cookies, expiración, revocación y acceso limitado a miembros de demo; comprobación de membresía también en RLS con migración 002. Alta pública, recuperación, verificación de edad y pruebas reales de Auth pendientes. No afirmar cumplimiento completo de registro.
- **RF-16:** errores controlados, timeout del proveedor y diario/perfil manual independientes de la clave OpenAI. Se corrigió la validación global que podía bloquearlos al configurar mal la IA. Mensajes y conservación de texto en pantalla pendientes de integración.
- **RF-17:** pausa técnica persistente, bloqueo de generación/guardado en la conversación y conteo privado mínimo. No hay detección automática, recursos locales ni mensaje clínico aprobado; el requisito sigue incompleto y depende de especialistas. No se deduce riesgo clínico del contador.

## Requerimientos no funcionales

- **RNF-01:** timeout de IA y límites de payload implementados. No se midieron umbrales de 4G ni percentiles del proveedor real.
- **RNF-02:** datos de preferencias preparados; WCAG 2.2 AA no puede certificarse desde backend. Pendientes teclado, lector, contraste, zoom, foco, errores y pruebas con interfaz conectada.
- **RNF-03:** health público y ready protegido preparados. El usuario configuró UptimeRobot y confirmó el monitor en línea. Esto prueba disponibilidad básica, no funcionamiento de Auth, base o IA; no hay SLA.
- **RNF-04:** validación de esquemas, consultas parametrizadas/RPC, RLS, cookies HttpOnly/Secure/SameSite en producción, comprobación de origen, secretos de servidor, límites y auditoría de paquetes. HTTPS público observado. CAPTCHA real, sesiones/aislamiento en Supabase y configuración del proveedor todavía no verificados. XSS también depende de renderizar texto sin HTML sin sanear en la futura interfaz.
- **RNF-05:** separación original/interpretación, contexto mínimo autorizado, no logs de diario previstos, cascadas y exportación. Retención y condiciones para adolescentes requieren decisiones y revisión institucional. Encuestas del partner no sustituyen aprobación ética o clínica.
- **RNF-06:** contratos, migraciones y pruebas locales disponibles. Revisión por otra persona y repositorio/CI del equipo pendientes de comprobar.
- **RNF-07 y RNF-08:** arquitectura gestionada y API independiente del navegador. Carga ligera y matriz de navegadores todavía no ejecutadas.
- **RNF-09:** simulation, fuentes, procedencia y versiones en respuestas. Falta presentación clara de IA y límites en frontend.
- **RNF-10:** cuotas diarias y corte de 100 intentos reales acumulados; endpoint de aviso desde 80 %. Son intentos, no saldo USD; la alerta visual y facturación real deben comprobarse antes de activar OpenAI.

## Seguridad y privacidad para la integración

Las contraseñas se delegan al hash administrado por Supabase Auth, no se cifran reversiblemente en nuestra aplicación. No colocar secretos en VITE_*, JavaScript del cliente, URLs, logs o repositorio. El cliente consume /api/v1 con cookies; no recibe la service role key. Las instrucciones dentro de diarios o respuestas de IA son datos no confiables; el modelo no tiene herramientas con acceso a otros datos ni acciones externas.

La configuración explícita debe dominar adaptación y perfil. No diagnosticar, atribuir emociones/intenciones como hechos, insistir o sustituir atención humana. Las validaciones de esquema y filtros de texto son defensas parciales, no una garantía clínica. Evaluar prompts con casos sintéticos y especialistas antes de participantes, especialmente adolescentes.

## Evidencia externa anterior a la publicación v0.3

Los errores siguientes son históricos; no deben interpretarse como una nueva comprobación después del despliegue. Posteriormente el usuario confirmó health v0.3 y UptimeRobot en línea. El estado actual de sesión, credenciales y migraciones requiere verificación independiente.

- Producción `https://grandaptive.vercel.app/`: 200; health: 200 con versión 0.2; auth/session: 503 BACKEND_NOT_CONFIGURED. Hay publicación, pero no backend funcional confirmado.
- URL de despliegue con hash y sufijo cipherwatch1: redirección 302 a autenticación de Vercel. No usarla para el monitor público ni desactivar su protección.
- Comprobaciones mínimas con credenciales locales de Supabase: 401. No se recuperaron diarios ni se validó aislamiento real. El error no prueba que RLS funcione; primero deben corregirse las credenciales/configuración.
- OpenAI desactivado, sin clave local disponible; CAPTCHA declarado desactivado localmente. No se inspeccionaron secretos en el dashboard de Vercel.
- UptimeRobot: cuenta declarada por el usuario; monitor no creado. Chrome detuvo automatización por no poder verificar la URL activa con seguridad.

## Orden inmediato de puesta en marcha

1. Corregir variables Production y credenciales siguiendo UPTIMEROBOT.md; no compartir valores por chat.
2. Aplicar migración 002 sobre 001 y publicar la revisión local. 002 normaliza preferencias y aumenta su revisión; recibos antiguos pueden invalidarse de forma intencional.
3. Monitoreo básico terminado según confirmación del usuario: conservar HEAD en health. ready es opcional y requiere migración/token; no hace falta la API key de UptimeRobot.
4. Probar dos cuentas del equipo: login, guardar sin IA, acceso cruzado denegado, editar, permisos, feedback, cascada y cierre remoto.
5. Claude Code conecta la interfaz al contrato API, separa texto original de IA, muestra simulación y resuelve accesibilidad; mantener datos sintéticos.
6. Activar OpenAI sólo con presupuesto/clave disponibles y después de las pruebas de permisos, cuotas y banco de evaluación. RF-17 completo y participación real siguen sujetos a especialistas.

La documentación histórica conserva decisiones pendientes; esta revisión no convierte propuestas de implementación en decisiones establecidas por el PRD.
