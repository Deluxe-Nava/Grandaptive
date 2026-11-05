import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AIResult, Consents, DemoState, RequestSnapshot, Settings } from './contracts.ts';
import { assertFresh, createEntry, deleteEntry, exportText, freshState, validateResult, makeSnapshot } from './core.ts';
import { simulateAccompaniment } from './mock-ai.ts';
import './styles.css';

const storageKey = 'challenge-diary-demo-v01';
const fictitiousText = 'Hoy trabajé en un proyecto con mi equipo. Había bastante ruido y preferí tomar un descanso antes de continuar.';

// Almacenamiento exclusivo de la demo. No constituye autenticación ni almacenamiento seguro.
function loadDemo(): DemoState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return freshState();
    const data: DemoState = JSON.parse(raw);
    if (!Array.isArray(data.entries) || !Array.isArray(data.interpretations) || typeof data.draft !== 'string') return freshState();
    if (!data.entries.every(entry => typeof entry.id === 'string' && typeof entry.text === 'string' && Number.isInteger(entry.version))) return freshState();
    if (!data.consents || !data.settings || typeof data.consents.aiEnabled !== 'boolean' || typeof data.settings.listenOnly !== 'boolean') return freshState();
    return data;
  } catch { return freshState(); }
}

function App() {
  const [state, setState] = useState(loadDemo);
  const latest = useRef(state);
  const [tab, setTab] = useState<'diary' | 'settings' | 'privacy'>('diary');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editText, setEditText] = useState('');
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const [storageError, setStorageError] = useState('');
  const [busy, setBusy] = useState(false);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [answer, setAnswer] = useState<{ result: AIResult; snapshot: RequestSnapshot } | null>(null);
  const requestSequence = useRef(0);
  const selected = state.entries.find(entry => entry.id === selectedId);
  const canAccompany = state.consents.aiEnabled && state.consents.conversation;

  function commit(next: DemoState) {
    latest.current = next;
    setState(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setStorageError(''); }
    catch { setStorageError('El navegador no pudo guardar estos cambios. Siguen en esta pestaña; exporta antes de cerrarla.'); }
  }

  function invalidate() {
    requestSequence.current += 1;
    setAnswer(null);
    setBusy(false);
  }

  function updateConsents(patch: Partial<Consents>) {
    invalidate();
    commit({ ...latest.current, consents: { ...latest.current.consents, ...patch, authorizationRevision: latest.current.consents.authorizationRevision + 1 } });
    setMessage('Permisos actualizados. Las respuestas pendientes se han descartado.');
  }

  function updateSettings(patch: Partial<Settings>) {
    invalidate();
    commit({ ...latest.current, settings: { ...latest.current.settings, ...patch, settingsRevision: latest.current.settings.settingsRevision + 1 } });
    setMessage('Preferencias actualizadas para la siguiente respuesta.');
  }

  function saveEntry() {
    try {
      const entry = createEntry(latest.current.draft, 'local-demo');
      commit({ ...latest.current, entries: [entry, ...latest.current.entries], draft: '' });
      invalidate(); setSelectedId(entry.id); setEditing(false);
      setMessage('Entrada guardada en este navegador, sin analizarla.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar.'); }
  }

  async function accompany() {
    if (!selected || busy) return;
    const sequence = ++requestSequence.current;
    setBusy(true); setAnswer(null); setMessage('Preparando una respuesta de ejemplo…');
    try {
      const snapshot = makeSnapshot('accompany', [selected], latest.current.consents, latest.current.settings);
      const result = await simulateAccompaniment(snapshot, latest.current.settings, simulateFailure);
      if (sequence !== requestSequence.current) return;
      assertFresh(snapshot, latest.current);
      validateResult(result, snapshot, latest.current.settings);
      setAnswer({ result, snapshot });
      setMessage('Respuesta simulada disponible. No se ha guardado como interpretación.');
    } catch (error) {
      if (sequence === requestSequence.current) setMessage(error instanceof Error ? error.message : 'La respuesta no está disponible. Tu entrada sigue guardada.');
    } finally { if (sequence === requestSequence.current) setBusy(false); }
  }

  function saveInterpretation() {
    if (!answer || !selected) return;
    try {
      assertFresh(answer.snapshot, latest.current);
      commit({ ...latest.current, interpretations: [...latest.current.interpretations, {
        id: crypto.randomUUID(), entryId: selected.id, entryVersion: selected.version, origin: 'ai',
        simulation: true, content: answer.result.content, savedAt: new Date().toISOString(),
      }] });
      setAnswer(null); setMessage('Interpretación simulada guardada por separado. Tu texto no cambió.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo guardar la interpretación.'); }
  }

  function removeEntry() {
    if (!pendingDelete) return;
    invalidate(); commit(deleteEntry(latest.current, pendingDelete));
    if (selectedId === pendingDelete) setSelectedId(null);
    setPendingDelete(null); setMessage('Entrada e interpretaciones asociadas eliminadas de esta demo local.');
  }

  function download() {
    const url = URL.createObjectURL(new Blob([exportText(latest.current)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'diario-ficticio.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('Exportación de demostración preparada. El borrador no guardado no se incluye.');
  }

  return <>
    <a className="skip" href="#main">Ir al contenido</a>
    <div className="demo-notice">Prototipo del challenge · solo datos ficticios · respuestas simuladas · sin cuenta real</div>
    <header className="header">
      <a className="brand" href="#main" onClick={() => setTab('diary')}><span className="brand-mark" aria-hidden="true">g.</span><span>Mi espacio<span className="brand-caption">Diario de bienestar</span></span></a>
      <nav aria-label="Principal">
        {([['diary', 'Mi diario'], ['settings', 'Preferencias'], ['privacy', 'Mis datos']] as const).map(([key, label]) => <button key={key} aria-current={tab === key ? 'page' : undefined} className={tab === key ? 'nav active' : 'nav'} onClick={() => { setTab(key); setConfirmClear(false); }}>{label}</button>)}
      </nav>
    </header>
    <main id="main" tabIndex={-1}>
      {storageError && <p className="error" role="alert">{storageError}</p>}
      <p className="status" role="status" aria-live="polite">{message || 'Puedes guardar un registro sin analizarlo.'}</p>
      {tab === 'diary' && <>
        <div className="intro"><p className="eyebrow">A TU RITMO</p><h1>Un espacio para lo que viviste.</h1><p>No necesitas ponerle nombre a una emoción. Puedes escribir sobre una situación, tu energía o el entorno.</p></div>
        <div className="diary-grid">
          <section className="editor panel" aria-labelledby="new-entry">
            <div className="section-heading"><h2 id="new-entry">Mi registro</h2><span className="tag">Sin análisis automático</span></div>
            <label htmlFor="draft">¿Qué quieres dejar por escrito?</label>
            <textarea id="draft" rows={7} maxLength={8000} value={state.draft} onChange={event => commit({ ...latest.current, draft: event.target.value })} placeholder="En esta demostración usa únicamente situaciones inventadas." aria-describedby="draft-help" />
            <p id="draft-help" className="hint">El borrador se conserva en este navegador. No hay sincronización ni protección mediante cuenta.</p>
            <div className="actions"><button className="primary" disabled={!state.draft.trim()} onClick={saveEntry}>Guardar sin IA</button><button onClick={() => { commit({ ...latest.current, draft: fictitiousText }); setMessage('Ejemplo ficticio cargado. Puedes editarlo antes de guardar.'); }}>Usar ejemplo ficticio</button></div>
          </section>
          <aside className="quiet-panel"><p className="eyebrow">TÚ DECIDES</p><h2>Escribir puede ser suficiente.</h2><p>Guardar no activa el acompañamiento. Puedes volver después o dejar el registro tal como está.</p><div className="divider" /><p className="hint">Este prototipo no es terapia, tratamiento ni diagnóstico. No detecta riesgos ni ofrece un servicio de emergencia.</p></aside>
        </div>
        <section className="history" aria-labelledby="history-title">
          <div className="section-heading"><h2 id="history-title">Mis registros</h2><span className="hint">{state.entries.length} guardados en este navegador</span></div>
          {state.entries.length > 0 && <><label htmlFor="search">Buscar en mis registros</label><input id="search" type="search" value={query} onChange={event => setQuery(event.target.value)} /></>}
          {state.entries.length === 0 ? <p className="empty">Tu primer registro aparecerá aquí cuando lo guardes.</p> : <div className="history-grid"><ul className="entry-list">{state.entries.filter(entry => entry.text.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'))).map(entry => <li key={entry.id}><button className={selectedId === entry.id ? 'entry selected' : 'entry'} onClick={() => { invalidate(); setSelectedId(entry.id); setEditing(false); setPendingDelete(null); }} aria-pressed={selectedId === entry.id}><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}</time><span>{entry.text.slice(0, 110)}{entry.text.length > 110 ? '…' : ''}</span></button></li>)}</ul>
            <div className="entry-detail panel">{selected ? <>
              <div className="section-heading"><h3>Lo que escribí</h3><span className="tag">Versión {selected.version}</span></div>
              {editing ? <><label htmlFor="edit-entry">Editar mi texto</label><textarea id="edit-entry" rows={5} maxLength={8000} value={editText} onChange={event => setEditText(event.target.value)} /><div className="actions"><button className="primary" disabled={!editText.trim()} onClick={() => { invalidate(); commit({ ...latest.current, entries: latest.current.entries.map(entry => entry.id === selected.id ? { ...entry, text: editText, version: entry.version + 1, updatedAt: new Date().toISOString() } : entry) }); setEditing(false); setMessage('Texto actualizado. Las interpretaciones guardadas conservan su versión de origen.'); }}>Guardar edición</button><button onClick={() => setEditing(false)}>Cancelar</button></div></> : <p className="original">{selected.text}</p>}
              <div className="actions"><button onClick={() => { setEditing(true); setEditText(selected.text); }}>Editar texto</button><button className="danger" onClick={() => setPendingDelete(selected.id)}>Eliminar</button></div>
              {pendingDelete === selected.id && <div className="confirmation"><p>Se eliminarán esta entrada y sus interpretaciones simuladas. Esta acción no se puede deshacer.</p><div className="actions"><button className="danger" onClick={removeEntry}>Sí, eliminar entrada y derivados</button><button onClick={() => setPendingDelete(null)}>Conservar</button></div></div>}
              {canAccompany ? <div className="companion"><h3>Acompañamiento de ejemplo</h3><p className="hint">Respuesta fija que prueba los controles; no analiza tu texto. No se envía información a un proveedor.</p><button className="primary" disabled={busy || editing} onClick={accompany}>{busy ? 'Preparando ejemplo…' : 'Probar acompañamiento'}</button>
                {answer?.result.content.type === 'accompany' && <div className="answer"><span className="tag">Simulación · no es IA real</span><p>{answer.result.content.text}</p>{answer.result.content.questions.map(question => <p key={question}>{question}</p>)}<div className="actions"><button onClick={saveInterpretation}>Guardar interpretación separada</button><button onClick={() => { invalidate(); setMessage('Lo dejamos aquí. No se volverá a preguntar automáticamente.'); }}>Omitir / ahora no</button>{!state.settings.listenOnly && <button onClick={() => updateSettings({ listenOnly: true })}>Solo escucha</button>}</div><details><summary>Ver contexto de esta simulación</summary><p>Se vinculó esta entrada, versión {answer.snapshot.sources[0]?.entryVersion}. No se usó perfil ni otras entradas. El adaptador recibe la referencia, no el texto.</p></details></div>}
              </div> : <p className="hint separated">El acompañamiento está desactivado. Puedes habilitar la simulación desde Mis datos.</p>}
              {state.interpretations.filter(item => item.entryId === selected.id).map(item => <section className="saved-interpretation" key={item.id}><h3>Interpretación simulada guardada</h3><p className="hint">Generado por un simulador · {item.entryVersion !== selected.version ? 'Basada en versión anterior' : `Fuente: versión ${item.entryVersion}`}</p>{item.content.type === 'accompany' && <p>{item.content.text}</p>}<button onClick={() => { commit({ ...latest.current, interpretations: latest.current.interpretations.filter(saved => saved.id !== item.id) }); setMessage('Interpretación eliminada. La entrada se conserva.'); }}>Eliminar interpretación</button></section>)}
            </> : <p>Selecciona un registro para leerlo.</p>}</div>
          </div>}
        </section>
      </>}
      {tab === 'settings' && <section className="settings-page"><p className="eyebrow">ACOMPAÑAMIENTO</p><h1>Como te resulte más cómodo.</h1><p>Estos ajustes cambian la siguiente respuesta simulada. La configuración prevalece sobre cualquier adaptación.</p><div className="panel form-stack">
        <label htmlFor="tone">Tono</label><select id="tone" value={state.settings.tone} onChange={event => updateSettings({ tone: event.target.value as Settings['tone'] })}><option value="neutral">Neutral</option><option value="warm">Cálido</option><option value="practical">Práctico</option></select>
        <label htmlFor="length">Extensión</label><select id="length" value={state.settings.length} onChange={event => updateSettings({ length: event.target.value as Settings['length'] })}><option value="brief">Breve</option><option value="detailed">Con más detalle</option></select>
        <label className="check"><input type="checkbox" checked={state.settings.listenOnly} onChange={event => updateSettings({ listenOnly: event.target.checked })} /><span>Solo escucha<span className="hint">Sin preguntas ni recomendaciones.</span></span></label>
        <label className="check"><input type="checkbox" checked={state.settings.followUp} onChange={event => updateSettings({ followUp: event.target.checked })} /><span>Permitir preguntas opcionales<span className="hint">No se hacen si “Solo escucha” está activo.</span></span></label>
        <div className="preview"><h2>Vista previa fija</h2><p>{state.settings.listenOnly ? 'Tu registro queda aquí. Puedes dejarlo así, sin analizarlo.' : state.settings.followUp ? '¿Hay algo del entorno o de tu energía que quieras registrar?' : 'Tu registro queda aquí.'}</p><p className="hint">Muestra del modo de escucha; no es una respuesta de un modelo.</p></div><button onClick={() => updateSettings(freshState().settings)}>Restablecer preferencias</button>
      </div><p className="hint">La interfaz inicial usa bloques breves y no tiene animaciones. Los controles visuales completos de RF-10 son parte del siguiente módulo.</p></section>}
      {tab === 'privacy' && <section className="settings-page"><p className="eyebrow">CONTROL DE DATOS</p><h1>Los permisos se eligen por separado.</h1><p>Este es un ensayo local de los consentimientos. Nadie inicia sesión y no se conecta ninguna API.</p><div className="panel form-stack">
        <label className="check"><input type="checkbox" checked={state.consents.aiEnabled} onChange={event => updateConsents({ aiEnabled: event.target.checked })} /><span>Habilitar funciones simuladas de IA<span className="hint">Desactivarlo bloquea todas las operaciones, aunque una capa conserve su permiso.</span></span></label>
        <label className="check"><input type="checkbox" checked={state.consents.conversation} onChange={event => updateConsents({ conversation: event.target.checked })} /><span>Capa 1 · Acompañamiento<span className="hint">Permite solicitar la respuesta de ejemplo sobre una entrada.</span></span></label>
        <label className="check"><input type="checkbox" checked={state.consents.patterns} onChange={event => updateConsents({ patterns: event.target.checked })} /><span>Capa 2 · Patrones<span className="hint">Se conserva el estado para integrar el siguiente módulo. Aún no se analizan entradas.</span></span></label>
        <label className="check"><input type="checkbox" checked={state.consents.profileMemory} onChange={event => updateConsents({ profileMemory: event.target.checked })} /><span>Capa 3 · Memoria de perfil<span className="hint">Aún no hay perfil conectado; esta capa no añade contexto a la simulación.</span></span></label>
      </div><section className="panel spaced"><h2>Los datos de esta demostración</h2><p>Se guardan en este navegador. Otras personas que usen este navegador pueden acceder a ellos. Usa solo ejemplos ficticios.</p><div className="actions"><button onClick={download}>Exportar registros ficticios</button><button className="danger" onClick={() => setConfirmClear(true)}>Borrar demostración</button></div>{confirmClear && <div className="confirmation"><p>Se borrarán borrador, entradas, interpretaciones y preferencias de esta demostración.</p><div className="actions"><button className="danger" onClick={() => { invalidate(); commit(freshState()); setSelectedId(null); setConfirmClear(false); setQuery(''); setMessage('Demostración reiniciada. Todos los permisos están desactivados.'); }}>Confirmar borrado de la demo</button><button onClick={() => setConfirmClear(false)}>Cancelar</button></div></div>}</section>
        <details className="panel spaced"><summary>Comprobar fallo del servicio simulado</summary><label className="check"><input type="checkbox" checked={simulateFailure} onChange={event => setSimulateFailure(event.target.checked)} /><span>Hacer fallar la próxima solicitud de acompañamiento</span></label><p className="hint">El diario seguirá disponible. Este control permite ensayar la demostración.</p></details>
      </section>}
    </main><footer><p>Prototipo técnico local · nombre provisional · no habilitado para pruebas con adolescentes.</p><p>RF-17, autenticación, proveedor real y validación participativa siguen pendientes.</p></footer>
  </>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
