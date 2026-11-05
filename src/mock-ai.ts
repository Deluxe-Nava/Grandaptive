import type { AIResult, RequestSnapshot, Settings } from './contracts.ts';
import { DomainError } from './core.ts';

/** Adaptador determinista; no usa fetch, no analiza el texto y no contiene credenciales. */
export async function simulateAccompaniment(snapshot: RequestSnapshot, settings: Settings, fail = false): Promise<AIResult> {
  await new Promise(resolve => setTimeout(resolve, 650));
  if (fail) throw new DomainError('PROVIDER_UNAVAILABLE', 'El servicio simulado no está disponible. Tu entrada sigue guardada.');
  const greeting = { neutral: 'Tu registro queda aquí.', warm: 'Gracias por compartir este registro.', practical: 'Registro disponible.' }[settings.tone];
  return {
    schemaVersion: '0.1', requestId: snapshot.requestId, simulation: true,
    content: {
      type: 'accompany',
      text: settings.listenOnly ? `${greeting} Puedes dejarlo así, sin analizarlo.` : `${greeting}${settings.length === 'detailed' ? ' Puedes responder, omitir la pregunta o cambiar a solo escucha cuando quieras.' : ''}`,
      questions: settings.listenOnly || !settings.followUp ? [] : ['¿Hay algo del entorno o de tu energía que quieras registrar?'],
      recommendations: [],
    },
    context: { sources: snapshot.sources, profileItemIds: [] },
  };
}
