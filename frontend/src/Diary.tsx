import { useEffect, useRef, useState } from 'react';
import { api, dateLabel, readDraft, writeDraft, type Entry, type ProfileItem, type SavedReading } from './api.ts';
import { Confirm, ContentCard, Empty, Icon, Toggle } from './components.tsx';

export interface Feedback { busy: boolean; run: (work: () => Promise<void>, message?: string) => Promise<void>; notify: (message: string) => void }
interface Props extends Feedback { userId: string; initialEntry?: Entry; entries: Entry[]; reload: () => Promise<void>; select: (entry: Entry) => void; aiEnabled: boolean }
export function Diary({ userId, initialEntry, entries, reload, select, aiEnabled, busy, run, notify }: Props) {
  const [draft, setDraft] = useState(() => readDraft(userId));
  const [storage, setStorage] = useState(true);
  const [query, setQuery] = useState(''); const [results, setResults] = useState<Entry[] | null>(null);
  const [more, setMore] = useState<Entry[]>([]); const [end, setEnd] = useState(false);
  const [opened, setOpened] = useState<Entry | null>(initialEntry ?? null);
  const [editing, setEditing] = useState(false); const [edit, setEdit] = useState('');
  const [readings, setReadings] = useState<SavedReading[]>([]); const [readingsError, setReadingsError] = useState('');
  const [deletion, setDeletion] = useState<{ entryId: string; profileItems: ProfileItem[]; interpretationIds: string[] } | null>(null);
  const detail = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!opened || !detail.current) return;
    const reduced = document.documentElement.dataset.motion === 'reduced' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    detail.current.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    detail.current.focus({ preventScroll: true });
  }, [opened?.id]);
  const visible = results ?? [...entries, ...more.filter(x => !entries.some(e => e.id === x.id))];
  useEffect(() => {
    if (!opened) { setReadings([]); return; }
    const ctrl = new AbortController(); setReadingsError('');
    api<{ interpretations: SavedReading[] }>('/interpretations?entryId='+opened.id, 'GET', undefined, ctrl.signal).then(x => setReadings(x.interpretations)).catch(error => { if (!ctrl.signal.aborted) setReadingsError(error.message); });
    return () => ctrl.abort();
  }, [opened]);
  function changeDraft(value: string) { setDraft(value); setStorage(writeDraft(userId, value)); }
  function open(entry: Entry) { setOpened(entry); setEditing(false); setReadings([]); }
  async function save() {
    const { entry } = await api<{ entry: Entry }>('/entries', 'POST', { text: draft });
    changeDraft(''); setResults(null); setQuery(''); await reload(); open(entry);
  }
  async function saveEdit() {
    if (!opened) return;
    const { entry } = await api<{ entry: Entry }>('/entries/'+opened.id, 'PATCH', { text: edit, expectedVersion: opened.version });
    writeDraft(userId+':edit:'+opened.id, ''); setOpened(entry); setEditing(false); await reload();
  }
  async function search() { const { entries: found } = await api<{ entries: Entry[] }>('/entries/search', 'POST', { q: query, limit: 100 }); setResults(found); }
  return <div className="diary-layout"><div className="stack">
    <section className="card editor"><div className="section-heading"><div><span className="eyebrow">TU ESPACIO, A TU RITMO</span><h2>¿Qué te gustaría registrar?</h2></div><span className="badge">Sin análisis automático</span></div><p>No necesitas encontrar una emoción ni explicar todo. Puedes empezar por lo que pasó.</p>
      <label htmlFor="new-entry" className="sr-only">Escribe tu experiencia</label><textarea id="new-entry" className="journal-input" value={draft} onChange={e => changeDraft(e.target.value)} maxLength={8000} placeholder="Hoy ocurrió… / Noté en mi cuerpo… / Necesitaba…" rows={7}/>
      <div className="editor-footer"><span className="muted">{draft.length}/8000 · {storage ? 'Borrador en este dispositivo' : 'No se pudo guardar el borrador local'}</span><button className="primary" disabled={busy || !draft.trim()} onClick={() => void run(save, 'Entrada guardada sin llamar a la IA.')}>Guardar entrada</button></div>
      <details><summary>Sobre tu borrador</summary><p>Se conserva en este navegador para que puedas volver. Se elimina al cerrar sesión desde la app. Evita dejar la sesión abierta en un dispositivo compartido.</p><button disabled={busy} onClick={() => changeDraft('')}>Descartar borrador</button></details>
    </section>
    {opened && <section ref={detail} tabIndex={-1} aria-label="Tu registro" className="card entry-detail"><div className="section-heading"><div><span className="eyebrow">LO ESCRIBISTE TÚ</span><h2>Tu registro</h2><time dateTime={opened.createdAt}>{dateLabel(opened.createdAt)} · versión {opened.version}</time></div><button onClick={() => { setOpened(null); setEditing(false); }}>Cerrar registro</button></div>
      {editing ? <><label>Editar texto original<textarea rows={7} value={edit} maxLength={8000} onChange={e => { setEdit(e.target.value); writeDraft(userId+':edit:'+opened.id, e.target.value); }}/></label><div className="actions"><button disabled={busy} onClick={() => setEditing(false)}>Volver sin guardar</button><button className="primary" disabled={busy || !edit.trim()} onClick={() => void run(saveEdit, 'Cambios guardados. Las interpretaciones anteriores conservan su versión.')}>Guardar cambios</button></div></> : <><p className="preserve original-text">{opened.text}</p><div className="actions"><button disabled={busy} onClick={() => { setEdit(readDraft(userId+':edit:'+opened.id) || opened.text); setEditing(true); }}>Editar</button>{aiEnabled && <button onClick={() => select(opened)}><Icon name="assistant"/>Explorar con IA</button>}<button className="danger-text" disabled={busy} onClick={() => void run(async () => setDeletion(await api('/entries/'+opened.id+'/deletion-plan')))}>Eliminar</button></div></>}
      <Toggle label="Disponible para explorar patrones" description="Sólo se analizará cuando tú lo pidas y hayas autorizado esa capa de IA." checked={opened.availableForAnalysis} disabled={busy} onChange={value => void run(async () => { const {entry} = await api<{entry:Entry}>('/entries/'+opened.id, 'PATCH', { expectedVersion: opened.version, availableForAnalysis: value }); setOpened(entry); await reload(); }, 'Permiso de esta entrada actualizado.')}/>
      <h3>Interpretaciones guardadas</h3>{readingsError && <p role="alert">{readingsError}</p>}{readings.length === 0 && !readingsError && <p className="muted">No hay interpretaciones guardadas para esta entrada.</p>}{readings.map(item => <article className="ai-saved" key={item.id}><div className="section-heading"><span className="badge">{item.simulation ? 'Simulación · no es IA real' : 'Generado por IA'}</span><time dateTime={item.created_at}>{dateLabel(item.created_at)}</time></div>{item.basedOnPreviousVersion && <p className="notice">Basada en una versión anterior de tu entrada.</p>}<ContentCard content={item.content} rejected={item.rejected_readings} onReject={index => void run(async () => { const { interpretation } = await api<{interpretation: SavedReading}>('/interpretations/'+item.id+'/readings/'+index, 'PATCH', { fits: false }); setReadings(old => old.map(x => x.id === item.id ? {...x, rejected_readings: interpretation.rejected_readings} : x)); }, 'La lectura quedó marcada como «no encaja».')}/><button disabled={busy} className="text-button danger-text" onClick={() => void run(async () => { await api('/interpretations/'+item.id, 'DELETE', {}); setReadings(old => old.filter(x => x.id !== item.id)); }, 'Interpretación eliminada. Tu texto original se conserva.')}>Eliminar interpretación</button></article>)}
    </section>}
  </div><aside className="stack"><section className="soft-card sage"><Icon name="leaf"/><h2>Escribir puede ser suficiente.</h2><p>No hay una manera correcta de contar tu día. Tú decides cuándo explorar algo y cuándo dejarlo aquí.</p></section>
    <section className="card history"><div className="section-heading"><h2>Mis registros</h2><span className="badge">Privados</span></div><form className="search" onSubmit={e => { e.preventDefault(); void run(search); }}><label className="sr-only" htmlFor="search">Buscar en mis registros</label><input id="search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar una palabra…" maxLength={120}/><button disabled={busy}>Buscar</button></form>{results && <button className="text-button" onClick={() => { setResults(null); setQuery(''); }}>Ver todos los registros</button>}
      {visible.length === 0 ? <Empty title={results ? 'Sin coincidencias' : 'Aquí empieza tu diario'}>{results ? 'Prueba otra palabra.' : 'Tus entradas aparecerán aquí cuando decidas guardar una.'}</Empty> : <ul className="entry-list">{visible.map(entry => <li key={entry.id}><button aria-pressed={opened?.id === entry.id} onClick={() => open(entry)}><time dateTime={entry.createdAt}>{dateLabel(entry.createdAt)}</time><span>{entry.text.slice(0, 140)}{entry.text.length > 140 ? '…' : ''}</span><small>{entry.availableForAnalysis ? 'Disponible para patrones' : 'Sin permiso para patrones'}</small></button></li>)}</ul>}
      {!results && !end && entries.length >= 100 && <button disabled={busy} onClick={() => void run(async () => { const { entries: next } = await api<{entries:Entry[]}>('/entries?limit=100&offset='+(entries.length+more.length)); setMore(old => [...old,...next]); setEnd(next.length<100); })}>Ver registros anteriores</button>}{results?.length === 100 && <p>Se muestran las primeras 100 coincidencias. Afina la búsqueda.</p>}
    </section></aside>
    {deletion && <Confirm title="¿Eliminar esta entrada?" confirm="Eliminar entrada y derivados" busy={busy} onCancel={() => setDeletion(null)} onConfirm={() => void run(async () => { await api('/entries/'+deletion.entryId, 'DELETE', { confirmCascade: true }); writeDraft(userId+':edit:'+deletion.entryId,''); setDeletion(null); setOpened(null); setMore([]); setResults(null); await reload(); notify('Entrada y derivados eliminados.'); })}><p>También se eliminarán sus conversaciones y {deletion.interpretationIds.length} interpretaciones derivadas. Esta acción no se puede deshacer.</p>{deletion.profileItems.length > 0 && <><p>Estos elementos del perfil dependen de ella y también se eliminarán:</p><ul>{deletion.profileItems.map(item => <li key={item.id}>{item.text}</li>)}</ul></>}<p>Puedes cancelar para revisar el contenido antes de eliminarlo.</p></Confirm>}
  </div>;
}
