> Documento histórico del simulador inicial. La implementación actual del backend y la elección posterior de OpenAI están en [PLAN-BACKEND.md](PLAN-BACKEND.md), [API-BACKEND.md](API-BACKEND.md) y [DESPLIEGUE.md](DESPLIEGUE.md). Este archivo no describe el estado actual completo.

# Registro de decisiones de arranque

Actualizado el **4 de noviembre de 2026**, según fecha del usuario. Este registro distingue decisiones aprobadas para el arranque, propuestas de implementación y asuntos abiertos. No cambia retroactivamente las etiquetas [E], [R], [S] o [D] del PRD.

## Aprobado por el usuario en esta conversación

- **Alcance:** mantener los Must del PRD. Excluir voz, biblioteca de expresiones y sincronización offline de este corte; el borrador local de RF-01 continúa dentro del alcance.
- **Transparencia mínima:** incluir explicación básica del contexto usado por IA. El indicador detallado de RF-14 no se convierte por ello en Must.
- **Dirección técnica:** aplicación web con TypeScript y servicios gestionados como orientación de arquitectura. Esto no selecciona proveedor, modelo, base de datos, hosting ni método concreto de autenticación.
- **Equipo y tiempo:** cinco ingenieros; trabajar en el arranque hoy y mañana, 4–5 de noviembre de 2026. No están confirmadas las especialidades individuales ni las horas disponibles.
- **Presupuesto:** máximo de $500 MXN. No contratar servicios ahora. No hay cuentas, claves, créditos o infraestructura confirmados.
- **Entrega inmediata:** contratos y esqueleto local; no construir todo el MVP ni desplegarlo en este paso.
- **Evidencia disponible declarada:** encuestas de un challenge partner. Todavía no se han inspeccionado; no se asume acceso ni autorización para reutilizar datos.

## Propuestas del equipo técnico, no aprobaciones adicionales

- Distribuir el presupuesto futuro en **$300 MXN para IA, $0 para hosting de desarrollo local y $200 de reserva**. El costo de este corte no requiere consumo de IA; no se ha autorizado gasto ni se afirman precios o planes gratuitos.
- Construir el recorrido local con datos sintéticos y un adaptador IA determinista, claramente identificado como simulación.
- Usar los mismos contratos en los adaptadores simulados y futuros servicios reales para reducir cambios al integrar.
- Repartir por P1 integración/backend; P2 diario; P3 IA; P4 perfil/configuración; P5 UX/privacidad/QA, con pruebas y revisiones distribuidas. Confirmar nombres y capacidades antes de asignar tareas definitivas.
- Priorizar original separado de interpretación, configuración explícita, consentimiento verificable, errores controlados y trazabilidad. No habilitar análisis automático por guardar una entrada.
- Documentar explícitamente lo simulado y lo pendiente. Las pruebas locales de contrato no demuestran seguridad de un proveedor, aislamiento real entre cuentas ni cumplimiento integral de accesibilidad.

## Pendiente: decidir al implementar el bloque correspondiente

1. **Servicios reales:** proveedor y modelo IA, presupuesto por llamada/día, condiciones de datos; base de datos, hosting, autenticación, región y secretos. Ninguno se da por existente. No bloquea la simulación local; sí su conexión real.
2. **Ciclo de datos:** retención, purga de copias, formato de exportación, destino de ítems aceptados al borrar fuentes, tratamiento de versiones, borradores y sesiones en dispositivos compartidos. Definir antes de persistir datos personales reales.
3. **Contratos aún revisables:** identidad de patrones rechazados, vigencia de propuestas, final de conversación efímera, efectos de revocación durante una llamada y transparencia mínima exacta. Registrar cambios antes de que dependan de ellos varios módulos.
4. **IA y calidad:** banco de casos, rúbricas, límites de respuesta/costo, filtros, criterios de abstención y versiones. Validar con modelo real antes de afirmar comportamiento del producto, aunque el simulador pase.
5. **RF-17 y adolescentes:** especialistas responsables, escenarios, mensajes y recursos por jurisdicción; edad mínima, verificación y participación de responsables legales según revisión jurídica/ética. No improvisar contenido clínico. RF-17 no está terminado por disponer de un estado técnico de pausa.
6. **Validación:** aprobación ética aplicable según el PRD, personas participantes, permisos y revisión de las encuestas del challenge partner. No inferir eficacia, seguridad, impacto ni representatividad de evidencia no revisada.
7. **Demostración y alcance posterior:** fecha/hora y requisitos oficiales del reto, navegadores objetivo, nombre final y otros idiomas. El calendario local de dos días no demuestra que todos los Must puedan completarse antes de la demo.

## Regla para aceptar el siguiente paso

El corte se acepta como **esqueleto local** si el recorrido documentado es reproducible, distingue simulación de funcionalidad real y supera las comprobaciones acordadas. El MVP solo puede declararse terminado cuando todos los Must y sus criterios aplicables estén integrados y verificados, incluidos los dependientes de especialistas. No se ha contratado, desplegado ni aprobado un piloto con este registro.
