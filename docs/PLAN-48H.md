> Documento histórico del simulador inicial. La implementación actual del backend y la elección posterior de OpenAI están en [PLAN-BACKEND.md](PLAN-BACKEND.md), [API-BACKEND.md](API-BACKEND.md) y [DESPLIEGUE.md](DESPLIEGUE.md). Este archivo no describe el estado actual completo.

# Plan de arranque: 4 y 5 de noviembre de 2026

**Objetivo aprobado:** preparar contratos de integración y un esqueleto local que permita repartir el trabajo. Este corte no equivale al MVP completo, no se despliega y no requiere contratar servicios. Fechas según el calendario del usuario (America/Mexico_City).

**Capacidad conocida:** cinco personas con formación de ingeniería; su disponibilidad efectiva y experiencia por tecnología no están confirmadas. Los responsables P1–P5 son asignaciones propuestas para sustituir por nombres. Las fechas siguientes son objetivos por hitos, no una garantía de completar todos los Must en dos días.

## Hoy, 4 de noviembre: acordar y unir

### Hito 1. Contratos revisables y reparto

- **P1, integración y backend:** coordina el contrato común, identidad, propiedad de datos y errores; mantiene una única rama integrada.
- **P2, diario:** revisa entrada original, versiones, borrador local, historial y separación de interpretaciones.
- **P3, IA:** revisa operaciones, respuestas estructuradas, consentimiento, configuración, simulaciones y fallos.
- **P4, perfil y configuración:** revisa categorías, estados, procedencia, fuentes, aceptar/rechazar y prioridad de preferencias explícitas.
- **P5, UX, privacidad y QA:** revisa navegación, accesibilidad, textos, matriz de pruebas y decisiones pendientes. Cada persona verifica también su bloque: P5 no concentra toda la calidad ni sustituye a especialistas externos.

**Salida:** contratos con ejemplos sintéticos compartidos, convenciones acordadas y un responsable por interfaz. Resolver juntos los cambios de contrato antes de trabajar por separado. P1 y P5 revisan acceso y eliminación; P3 y P4 revisan contexto y propuestas.

### Hito 2. Esqueleto local ejecutable

**Recorrido mínimo propuesto:** abrir la aplicación → escribir y guardar una entrada sintética sin IA → recuperar la entrada → activar explícitamente acompañamiento → recibir una respuesta simulada identificada → mostrarla separada del original → cambiar a “Solo escucha” → comprobar que no aparecen preguntas ni recomendaciones.

- P1 une la aplicación y los adaptadores locales; no conecta cuentas ni proveedores.
- P2 implementa el recorrido del diario contra el contrato local.
- P3 aporta el simulador determinista con respuesta normal, error y pausa técnica.
- P4 aporta configuración mínima y un perfil manual de prueba.
- P5 verifica que se pueda recorrer con teclado, que las acciones sean claras y que la simulación sea visible.

**Terminado:** otro integrante puede iniciar el esqueleto con las instrucciones incluidas; guardar no invoca IA; el texto original no se sobrescribe. La identidad local de demostración no acredita autenticación ni aislamiento de producción. Usar solo datos inventados.

## Mañana, 5 de noviembre: cerrar integración y evidencias

### Hito 3. Pruebas de contrato y recuperación

Integrar cambios pequeños de forma continua, con una sincronización al iniciar la jornada y otra antes del corte final. Priorizar:

1. Respuesta inválida o proveedor simulado caído: el diario sigue disponible y no se pierde el texto.
2. Consentimiento desactivado y modo “Sin IA”: no sale contenido hacia el adaptador de generación.
3. Cambio de preferencias: la siguiente respuesta simulada refleja la configuración explícita.
4. Original e interpretación mantienen entidades y procedencia distintas.
5. Contratos de propuestas, rechazo, edición y eliminación tienen ejemplos verificables, aunque sus pantallas completas queden pendientes.
6. Revisión manual de teclado, foco, etiquetas y ampliación de texto en el recorrido implementado. Registrar defectos; no declarar conformidad WCAG 2.2 AA con esta revisión parcial.

**Reparto:** P1 integra y revisa errores; P2 comprueba recuperación del diario; P3 prueba respuestas y controles; P4 prueba preferencias/perfil; P5 coordina recorrido conjunto y registra resultados. Revisión cruzada, no autocertificación.

### Hito 4. Corte local demostrable y siguiente bloque

Congelar el recorrido que funciona, ejecutar las pruebas conjuntas y preparar una demostración corta con datos sintéticos. Entregar lista explícita de lo implementado, lo simulado, lo pendiente y los fallos conocidos. Elegir el siguiente módulo según los resultados, sin ampliar el corte a todo el MVP.

**Orden posterior recomendado:** identidad y autorización reales → persistencia y privacidad → proveedor IA validado → perfil y patrones completos → aceptación conjunta de todos los Must. La selección de servicios necesita una decisión posterior; no es parte de este arranque local.

## Presupuesto y reglas de corte

- **Tope comunicado por el usuario: $500 MXN.** Distribución propuesta, aún sin gastar: $300 para evaluaciones de IA, $0 para hosting durante desarrollo local y $200 de reserva. No presupone cuentas gratuitas, créditos ni precios de proveedores.
- Hoy y mañana: usar simulaciones; no contratar, habilitar facturación ni hacer llamadas pagadas. Una conexión real futura requiere seleccionar proveedor y verificar condiciones y costo antes de consumir presupuesto.
- Mantener fuera voz, biblioteca de expresiones y sincronización offline. El borrador local recuperable sigue siendo distinto de sincronizar registros sin conexión.
- Si falta tiempo, reducir pantallas y casos del corte; conservar contratos, separación de datos, controles y etiquetado de simulación. No eliminar silenciosamente Must del alcance final ni presentar funciones incompletas como terminadas.
- **Ruta crítica local:** contratos → esqueleto integrado → controles y pruebas → demostración reproducible. Cuellos de botella: cambios tardíos de contrato y concentrar integración en una sola persona.

## Condiciones para fases posteriores

RF-17 requiere mensajes, recursos y escenarios aprobados por especialistas; la pausa simulada solo comprueba el mecanismo técnico. No inventar un protocolo clínico ni declarar RF-17 cumplido. Edad, consentimiento aplicable, retención, eliminación y aprobación ética siguen pendientes antes de pruebas con personas según el PRD, especialmente adolescentes.

Las encuestas del challenge partner son la única evidencia externa mencionada; no se han revisado. No acreditan eficacia, seguridad, validación participativa del producto ni representatividad. Su revisión y los permisos de uso son trabajo pendiente.
