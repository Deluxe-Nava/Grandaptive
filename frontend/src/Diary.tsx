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
    <section className="card editor"><div className="section-heading"><div><span className="eyebrow">YOUR SPACE, YOUR PACE</span><h2>What would you like to write down?</h2></div><span className="badge">No automatic analysis</span></div><p>You don't need to name an emotion or explain everything. You can start with what happened.</p>
      <label htmlFor="new-entry" className="sr-only">Write your experience</label><textarea id="new-entry" className="journal-input" value={draft} onChange={e => changeDraft(e.target.value)} maxLength={8000} placeholder="Today… / I noticed in my body… / I needed…" rows={7}/>
      <div className="editor-footer"><span className="muted">{draft.length}/8000 · {storage ? 'Draft saved on this device' : 'Could not save the local draft'}</span><button className="primary" disabled={busy || !draft.trim()} onClick={() => void run(save, 'Entry saved without calling the AI.')}>Save entry</button></div>
      <details><summary>About your draft</summary><p>It stays in this browser so you can come back to it. It is deleted when you sign out from the app. Avoid leaving your session open on a shared device.</p><button disabled={busy} onClick={() => changeDraft('')}>Discard draft</button></details>
    </section>
    {opened && <section ref={detail} tabIndex={-1} aria-label="Your entry" className="card entry-detail"><div className="section-heading"><div><span className="eyebrow">YOU WROTE THIS</span><h2>Your entry</h2><time dateTime={opened.createdAt}>{dateLabel(opened.createdAt)} · version {opened.version}</time></div><button onClick={() => { setOpened(null); setEditing(false); }}>Close entry</button></div>
      {editing ? <><label>Edit original text<textarea rows={7} value={edit} maxLength={8000} onChange={e => { setEdit(e.target.value); writeDraft(userId+':edit:'+opened.id, e.target.value); }}/></label><div className="actions"><button disabled={busy} onClick={() => setEditing(false)}>Back without saving</button><button className="primary" disabled={busy || !edit.trim()} onClick={() => void run(saveEdit, 'Changes saved. Earlier interpretations keep their version.')}>Save changes</button></div></> : <><p className="preserve original-text">{opened.text}</p><div className="actions"><button disabled={busy} onClick={() => { setEdit(readDraft(userId+':edit:'+opened.id) || opened.text); setEditing(true); }}>Edit</button>{aiEnabled && <button onClick={() => select(opened)}><Icon name="assistant"/>Explore with AI</button>}<button className="danger-text" disabled={busy} onClick={() => void run(async () => setDeletion(await api('/entries/'+opened.id+'/deletion-plan')))}>Delete</button></div></>}
      <Toggle label="Available for pattern exploration" description="Only analyzed when you ask for it and have authorized that AI layer." checked={opened.availableForAnalysis} disabled={busy} onChange={value => void run(async () => { const {entry} = await api<{entry:Entry}>('/entries/'+opened.id, 'PATCH', { expectedVersion: opened.version, availableForAnalysis: value }); setOpened(entry); await reload(); }, 'Permission for this entry updated.')}/>
      <h3>Saved interpretations</h3>{readingsError && <p role="alert">{readingsError}</p>}{readings.length === 0 && !readingsError && <p className="muted">There are no saved interpretations for this entry.</p>}{readings.map(item => <article className="ai-saved" key={item.id}><div className="section-heading"><span className="badge">{item.simulation ? 'Simulation · not real AI' : 'AI-generated'}</span><time dateTime={item.created_at}>{dateLabel(item.created_at)}</time></div>{item.basedOnPreviousVersion && <p className="notice">Based on an earlier version of your entry.</p>}<ContentCard content={item.content} rejected={item.rejected_readings} onReject={index => void run(async () => { const { interpretation } = await api<{interpretation: SavedReading}>('/interpretations/'+item.id+'/readings/'+index, 'PATCH', { fits: false }); setReadings(old => old.map(x => x.id === item.id ? {...x, rejected_readings: interpretation.rejected_readings} : x)); }, 'The reading was marked as “doesn’t fit”.')}/><button disabled={busy} className="text-button danger-text" onClick={() => void run(async () => { await api('/interpretations/'+item.id, 'DELETE', {}); setReadings(old => old.filter(x => x.id !== item.id)); }, 'Interpretation deleted. Your original text is kept.')}>Delete interpretation</button></article>)}
    </section>}
  </div><aside className="stack"><section className="soft-card sage"><Icon name="leaf"/><h2>Writing can be enough.</h2><p>There is no right way to tell your day. You decide when to explore something and when to leave it here.</p></section>
    <section className="card history"><div className="section-heading"><h2>My entries</h2><span className="badge">Private</span></div><form className="search" onSubmit={e => { e.preventDefault(); void run(search); }}><label className="sr-only" htmlFor="search">Search my entries</label><input id="search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search for a word…" maxLength={120}/><button disabled={busy}>Search</button></form>{results && <button className="text-button" onClick={() => { setResults(null); setQuery(''); }}>Show all entries</button>}
      {visible.length === 0 ? <Empty title={results ? 'No matches' : 'Your journal starts here'}>{results ? 'Try another word.' : 'Your entries will appear here when you decide to save one.'}</Empty> : <ul className="entry-list">{visible.map(entry => <li key={entry.id}><button aria-pressed={opened?.id === entry.id} onClick={() => open(entry)}><time dateTime={entry.createdAt}>{dateLabel(entry.createdAt)}</time><span>{entry.text.slice(0, 140)}{entry.text.length > 140 ? '…' : ''}</span><small>{entry.availableForAnalysis ? 'Available for patterns' : 'Not available for patterns'}</small></button></li>)}</ul>}
      {!results && !end && entries.length >= 100 && <button disabled={busy} onClick={() => void run(async () => { const { entries: next } = await api<{entries:Entry[]}>('/entries?limit=100&offset='+(entries.length+more.length)); setMore(old => [...old,...next]); setEnd(next.length<100); })}>Show older entries</button>}{results?.length === 100 && <p>Showing the first 100 matches. Refine your search.</p>}
    </section></aside>
    {deletion && <Confirm title="Delete this entry?" confirm="Delete entry and derived items" busy={busy} onCancel={() => setDeletion(null)} onConfirm={() => void run(async () => { await api('/entries/'+deletion.entryId, 'DELETE', { confirmCascade: true }); writeDraft(userId+':edit:'+deletion.entryId,''); setDeletion(null); setOpened(null); setMore([]); setResults(null); await reload(); notify('Entry and derived items deleted.'); })}><p>Its conversations and {deletion.interpretationIds.length} derived interpretations will also be deleted. This cannot be undone.</p>{deletion.profileItems.length > 0 && <><p>These profile items depend on it and will also be deleted:</p><ul>{deletion.profileItems.map(item => <li key={item.id}>{item.text}</li>)}</ul></>}<p>You can cancel to review the content before deleting it.</p></Confirm>}
  </div>;
}
