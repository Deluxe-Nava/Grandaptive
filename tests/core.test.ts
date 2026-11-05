import test from 'node:test';
import assert from 'node:assert/strict';
import type { DemoState, ErrorCode, Interpretation, Operation } from '../src/contracts.ts';
import { assertFresh, assertPermission, createEntry, deleteEntry, DomainError, exportText, freshState, makeSnapshot, ownedEntry, validateContent, validateResult } from '../src/core.ts';
import { simulateAccompaniment } from '../src/mock-ai.ts';

const operations: Operation[] = ['accompany', 'summary', 'interpret', 'communicate', 'pattern'];
const hasCode = (code: ErrorCode) => (error: unknown) => error instanceof DomainError && error.code === code;

function fixture(): DemoState {
  const state = freshState();
  state.entries = [createEntry('Registro ficticio: había mucho ruido.', 'account-a')];
  state.consents = { aiEnabled: true, conversation: true, patterns: true, profileMemory: false, authorizationRevision: 1 };
  return state;
}

function savedInterpretation(state: DemoState, index = 0): Interpretation {
  const entry = state.entries[index]!;
  return { id: `interpretation-${entry.id}`, entryId: entry.id, entryVersion: entry.version, origin: 'ai', simulation: true, content: { type: 'summary', text: 'Resumen ficticio separado.' }, savedAt: new Date().toISOString() };
}

test('guardar texto conserva el original y no necesita activar ni invocar el adaptador', () => {
  const state = freshState();
  const text = '  Registro ficticio sin clasificación emocional.\nSegunda línea.  ';
  const entry = createEntry(text, 'account-a');
  state.entries.push(entry);
  assert.equal(entry.text, text);
  assert.equal(entry.ownerId, 'account-a');
  assert.equal(entry.version, 1);
  assert.equal(entry.availableForAnalysis, false);
  assert.deepEqual(state.interpretations, []);
  assert.equal(state.consents.aiEnabled, false);
  assert.throws(() => createEntry(' \n ', 'account-a'));
});

test('ownedEntry limita la búsqueda lógica al titular; no representa autenticación real', () => {
  const state = fixture();
  const entry = state.entries[0]!;
  assert.equal(ownedEntry(state.entries, entry.id, 'account-a'), entry);
  assert.throws(() => ownedEntry(state.entries, entry.id, 'account-b'), hasCode('NOT_FOUND'));
  assert.throws(() => ownedEntry(state.entries, 'missing', 'account-a'), hasCode('NOT_FOUND'));
});

test('el interruptor global bloquea las cinco operaciones aunque las capas estén activas', () => {
  const state = fixture();
  state.entries[0]!.availableForAnalysis = true;
  state.consents.aiEnabled = false;
  for (const operation of operations) {
    assert.throws(() => assertPermission(operation, state.consents, state.entries), hasCode('CONSENT_REQUIRED'), operation);
  }
});

test('patrones requiere capa 2 y todas las fuentes autorizadas, independientemente de capa 1', () => {
  const state = fixture();
  state.consents.conversation = false;
  assert.throws(() => assertPermission('pattern', state.consents, state.entries), hasCode('CONSENT_REQUIRED'));
  state.entries[0]!.availableForAnalysis = true;
  assert.doesNotThrow(() => assertPermission('pattern', state.consents, state.entries));
  assert.throws(() => assertPermission('pattern', state.consents, []), hasCode('CONSENT_REQUIRED'));
  const unapproved = createEntry('Otra entrada ficticia.', 'account-a');
  assert.throws(() => assertPermission('pattern', state.consents, [...state.entries, unapproved]), hasCode('CONSENT_REQUIRED'));
  state.consents.patterns = false;
  state.consents.conversation = true;
  assert.throws(() => assertPermission('pattern', state.consents, state.entries), hasCode('CONSENT_REQUIRED'));
  assert.doesNotThrow(() => assertPermission('accompany', state.consents, state.entries));
});

test('las operaciones conversacionales necesitan capa 1 aunque exista permiso de patrones', () => {
  const state = fixture();
  state.consents.conversation = false;
  state.entries[0]!.availableForAnalysis = true;
  for (const operation of operations.filter(item => item !== 'pattern')) {
    assert.throws(() => assertPermission(operation, state.consents, state.entries), hasCode('CONSENT_REQUIRED'));
  }
});

test('Solo escucha rechaza preguntas y recomendaciones; sin seguimiento rechaza preguntas', () => {
  const settings = freshState().settings;
  const content = { type: 'accompany', text: 'Tu registro está guardado.', questions: [], recommendations: [] };
  assert.doesNotThrow(() => validateContent(content, 'accompany', settings));
  assert.throws(() => validateContent({ ...content, questions: ['¿Quieres continuar?'] }, 'accompany', settings), hasCode('INVALID_OUTPUT'));
  assert.throws(() => validateContent({ ...content, recommendations: ['Prueba a escribir más.'] }, 'accompany', settings), hasCode('INVALID_OUTPUT'));
  const noFollowUp = { ...settings, listenOnly: false, followUp: false };
  assert.throws(() => validateContent({ ...content, questions: ['¿Algo más?'] }, 'accompany', noFollowUp), hasCode('INVALID_OUTPUT'));
  const questionsAllowed = { ...noFollowUp, followUp: true };
  assert.doesNotThrow(() => validateContent({ ...content, questions: ['¿Algo del entorno?', '¿Algo de tu energía?'] }, 'accompany', questionsAllowed));
  assert.throws(() => validateContent({ ...content, questions: ['¿Uno?', '¿Dos?', '¿Tres?'] }, 'accompany', questionsAllowed), hasCode('INVALID_OUTPUT'));
});

test('RF-13 acepta dos lecturas o abstención explícita, no una lectura sin abstención', () => {
  const settings = freshState().settings;
  const content = { type: 'interpret', reportedFacts: ['Según tu relato, no hubo respuesta.'], possibleReadings: ['Quizá no vio el mensaje.', 'Quizá estaba ocupado.'], unknowns: ['No sabemos por qué.'], abstentionReason: null };
  assert.doesNotThrow(() => validateContent(content, 'interpret', settings));
  assert.throws(() => validateContent({ ...content, possibleReadings: ['Quizá estaba ocupado.'] }, 'interpret', settings), hasCode('INVALID_OUTPUT'));
  assert.doesNotThrow(() => validateContent({ ...content, possibleReadings: [], abstentionReason: 'No hay contexto suficiente para proponer lecturas.' }, 'interpret', settings));
  assert.throws(() => validateContent({ ...content, possibleReadings: [], abstentionReason: ' ' }, 'interpret', settings), hasCode('INVALID_OUTPUT'));
});

test('comunicación admite únicamente dos o tres formulaciones no vacías', () => {
  const settings = freshState().settings;
  for (const formulations of [['Necesito tiempo.', 'Me ayudaría una pausa.'], ['Necesito tiempo.', 'Me ayudaría una pausa.', 'Podemos continuar después.']]) {
    assert.doesNotThrow(() => validateContent({ type: 'communicate', formulations }, 'communicate', settings));
  }
  for (const formulations of [[], ['Una.'], ['Una.', 'Dos.', 'Tres.', 'Cuatro.'], ['Una.', ' ']]) {
    assert.throws(() => validateContent({ type: 'communicate', formulations }, 'communicate', settings), hasCode('INVALID_OUTPUT'));
  }
});

test('una respuesta pendiente se descarta al cambiar configuración, revocar permiso, editar o borrar la fuente', async t => {
  const mutations: [string, (state: DemoState) => DemoState][] = [
    ['configuración', state => ({ ...state, settings: { ...state.settings, tone: 'practical', settingsRevision: state.settings.settingsRevision + 1 } })],
    ['revocación', state => ({ ...state, consents: { ...state.consents, conversation: false, authorizationRevision: state.consents.authorizationRevision + 1 } })],
    ['edición', state => ({ ...state, entries: state.entries.map(entry => ({ ...entry, text: 'Texto corregido.', version: entry.version + 1 })) })],
    ['eliminación', state => deleteEntry(state, state.entries[0]!.id)],
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, () => {
      const state = fixture();
      const snapshot = makeSnapshot('accompany', state.entries, state.consents, state.settings);
      assert.doesNotThrow(() => assertFresh(snapshot, state));
      assert.throws(() => assertFresh(snapshot, mutate(state)), hasCode('STALE_REQUEST'));
    });
  }
});

test('la revisión de frescura vuelve a comprobar el permiso y la autorización de fuentes', () => {
  const state = fixture();
  state.entries[0]!.availableForAnalysis = true;
  const snapshot = makeSnapshot('pattern', state.entries, state.consents, state.settings);
  state.entries[0]!.availableForAnalysis = false;
  assert.throws(() => assertFresh(snapshot, state), hasCode('CONSENT_REQUIRED'));
  state.entries[0]!.availableForAnalysis = true;
  state.consents.aiEnabled = false;
  assert.throws(() => assertFresh(snapshot, state), hasCode('CONSENT_REQUIRED'));
});

test('eliminar entrada borra sus interpretaciones locales y conserva otras entradas y derivados', () => {
  const state = fixture();
  state.entries.push(createEntry('Segunda entrada ficticia.', 'account-a'));
  state.interpretations = [savedInterpretation(state), savedInterpretation(state, 1)];
  const removedId = state.entries[0]!.id;
  const remainingId = state.entries[1]!.id;
  const result = deleteEntry(state, removedId);
  assert.deepEqual(result.entries.map(entry => entry.id), [remainingId]);
  assert.deepEqual(result.interpretations.map(item => item.entryId), [remainingId]);
  assert.equal(state.entries.length, 2, 'la función no muta el estado anterior');
});

test('exportación separa el texto original de la interpretación simulada y señala versión anterior', () => {
  const state = fixture();
  state.interpretations = [savedInterpretation(state)];
  state.entries[0]!.version = 2;
  state.entries[0]!.text = 'Texto ficticio corregido por la persona.';
  const exported = exportText(state);
  assert.match(exported, /SOLO DATOS FICTICIOS/);
  assert.match(exported, /No contiene resultados de una IA real/);
  assert.ok(exported.includes(state.entries[0]!.text));
  assert.match(exported, /INTERPRETACIÓN SIMULADA · fuente v1 · basada en versión anterior/);
  assert.match(exported, /Resumen ficticio separado/);
});

test('el adaptador produce una respuesta marcada como simulada y vinculada al contexto aprobado', async () => {
  const state = fixture();
  const snapshot = makeSnapshot('accompany', state.entries, state.consents, state.settings);
  const result = await simulateAccompaniment(snapshot, state.settings);
  assert.equal(result.simulation, true);
  assert.deepEqual(result.context.sources, snapshot.sources);
  assert.deepEqual(result.context.profileItemIds, []);
  assert.equal(validateResult(result, snapshot, state.settings), result);
  assert.throws(() => validateResult({ ...result, requestId: 'otra-solicitud' }, snapshot, state.settings), hasCode('INVALID_OUTPUT'));
  assert.throws(() => validateResult({ ...result, context: { sources: [], profileItemIds: [] } }, snapshot, state.settings), hasCode('INVALID_OUTPUT'));
  assert.throws(() => validateResult({ ...result, context: { sources: snapshot.sources, profileItemIds: ['perfil-no-autorizado'] } }, snapshot, state.settings), hasCode('INVALID_OUTPUT'));
});

test('un fallo simulado devuelve error controlado y conserva entrada y borrador', async () => {
  const state = fixture();
  state.draft = 'Borrador ficticio aún sin guardar.';
  const before = structuredClone(state);
  const snapshot = makeSnapshot('accompany', state.entries, state.consents, state.settings);
  await assert.rejects(simulateAccompaniment(snapshot, state.settings, true), hasCode('PROVIDER_UNAVAILABLE'));
  assert.deepEqual(state, before);
});

test('safetyPaused es sólo una condición de fixture: bloquea solicitud y respuesta pendiente sin detectar ni persistir riesgo', () => {
  const state = fixture();
  const snapshot = makeSnapshot('accompany', state.entries, state.consents, state.settings);
  const before = structuredClone(state);
  assert.throws(() => makeSnapshot('accompany', state.entries, state.consents, state.settings, true), hasCode('SAFETY_PAUSED'));
  assert.throws(() => assertFresh(snapshot, state, true), hasCode('SAFETY_PAUSED'));
  assert.deepEqual(state, before);
  assert.doesNotThrow(() => assertFresh(snapshot, state, false));
});
