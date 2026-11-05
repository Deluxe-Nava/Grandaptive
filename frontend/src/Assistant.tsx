import { useEffect, useRef, useState } from 'react';
import type { Consents, Operation } from '../../shared/contracts.ts';
import { api, dateLabel, type Entry, type ResponseAI, type ProfileItem } from './api.ts';
import { ContentCard, Empty, Icon } from './components.tsx';
import type { Feedback } from './Diary.tsx';

interface Props extends Feedback { entries: Entry[]; initialEntry?: Entry; consents: Consents; profile: ProfileItem[]; onPrivacy: () => void; onProfile: () => void; profileChanged: () => Promise<void> }
export function Assistant({ entries, initialEntry, consents, profile, onPrivacy, onProfile, profileChanged, busy, run, notify }: Props) {
  const [entryId, setEntryId] = useState(initialEntry?.id ?? entries[0]?.id ?? '');
  const [operation, setOperation] = useState<Operation>('accompany');
  const [context, setContext] = useState('school'); const [turn, setTurn] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [conversation, setConversation] = useState<{id:string; entry:string} | null>(null);
  const [response, setResponse] = useState<ResponseAI | null>(null); const [paused, setPaused] = useState(false);
  const [saved, setSaved] = useState<string | null>(null); const [rejected, setRejected] = useState<number[]>([]);
  const [patternEdit, setPatternEdit] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const source = entries.find(x => x.id === entryId) ?? (initialEntry?.id === entryId ? initialEntry : undefined);
  function reset() { controller.current?.abort(); setResponse(null); setSaved(null); setRejected([]); setConversation(null); setPaused(false); setTurn(''); }
  async function generate(action: 'continue' | 'skip' | 'change-topic' | 'listen' = 'continue') {
    if (!source) return;
    const ctrl = new AbortController(); controller.current?.abort(); controller.current = ctrl;
    let current = conversation;
    if (!current || current.entry !== source.id) {
      const data = await api<{conversation:{id:string}}>('/conversations','POST',{entryId:source.id},ctrl.signal);
      current = { id: data.conversation.id, entry: source.id }; setConversation(current);
    }
    const previous = response;
    setResponse(null); setSaved(null); setRejected([]);
    const result = await api<ResponseAI>('/ai/operations','POST', { operation: action === 'listen' ? 'accompany' : operation, entryIds: operation === 'pattern' ? selected : [source.id], conversationId:current.id, context, turnText:turn || undefined, action, previousReceipt: operation === 'pattern' || action === 'change-topic' ? undefined : previous?.receipt },ctrl.signal);
    if (ctrl.signal.aborted) return;
    setResponse(result); setPatternEdit(result.content.type === 'pattern' ? result.content.hypothesis : ''); setTurn('');
  }
  async function persist(): Promise<string> {
    if (saved) return saved;
    if (!response) throw new Error('Solicita una respuesta primero.');
    const data = await api<{id:string}>(response.content.type === 'pattern' ? '/suggestions' : '/interpretations','POST',{receipt:response.receipt});
    setSaved(data.id); return data.id;
  }
  async function decide(decision:'accept'|'edit'|'reject'|'archive') { const id=await persist(); await api('/suggestions/'+id+'/decision','POST',{decision,...(decision==='edit'?{text:patternEdit}: {})}); setResponse(null); setSaved(null); await profileChanged(); }
  if (!consents.aiEnabled) return <section className="card"><Empty title="Tú decides si usar IA">Tu diario y tu perfil manual funcionan sin ella. Puedes revisar qué información autorizas antes de activarla.</Empty><button onClick={onPrivacy}>Revisar permisos de IA</button></section>;
  return <div className="assistant-layout"><section className="card stack"><span className="eyebrow">ACOMPAÑAMIENTO OPCIONAL</span><h2>Un poco más de claridad, a tu manera.</h2><p>La IA propone posibilidades. Tú conoces tu experiencia y puedes descartar cualquier lectura.</p>
    <label>Registro que quieres explorar<select value={entryId} disabled={busy} onChange={e=>{reset();setEntryId(e.target.value);}}><option value="" disabled>Elige una entrada</option>{[...(initialEntry&&!entries.some(x=>x.id===initialEntry.id)?[initialEntry]:[]),...entries].map(entry=><option key={entry.id} value={entry.id}>{dateLabel(entry.createdAt)} · {entry.text.slice(0,55)}</option>)}</select></label>{source && <details><summary>Ver texto original que se enviará</summary><p className="preserve">{source.text}</p></details>}
    <label>¿Qué te resultaría útil?<select value={operation} disabled={busy} onChange={e=>{reset();setOperation(e.target.value as Operation);}}><option value="accompany">Acompañarme</option><option value="summary">Resumir lo que escribí</option><option value="interpret">Entender una situación</option><option value="communicate">Encontrar mis palabras</option><option value="pattern">Explorar un posible patrón</option></select></label>
    {operation==='pattern' && <fieldset><legend>Elige hasta 5 entradas autorizadas</legend><p>Sólo se incluyen las marcadas como disponibles para análisis.</p>{entries.filter(x=>x.availableForAnalysis).map(entry=><label className="check-row" key={entry.id}><input type="checkbox" checked={selected.includes(entry.id)} disabled={busy || (!selected.includes(entry.id) && selected.length>=5)} onChange={e=>{setResponse(null);setSelected(old=>e.target.checked?[...old,entry.id]:old.filter(id=>id!==entry.id));}}/><span>{entry.text.slice(0,100)}</span></label>)}{!entries.some(x=>x.availableForAnalysis)&&<p>Autoriza las entradas que quieras desde Mi diario.</p>}</fieldset>}
    {operation==='communicate' && <label>Contexto<select value={context} onChange={e=>{setResponse(null);setContext(e.target.value);}} disabled={busy}><option value="school">Escuela</option><option value="family">Familia</option><option value="work">Trabajo</option><option value="friendship">Amistad</option></select></label>}
    <label>{operation==='communicate'?'¿Qué necesidad o límite quieres expresar?':'Algo que quieras añadir (opcional)'}<textarea rows={3} maxLength={2000} value={turn} onChange={e=>setTurn(e.target.value)} placeholder="Puedes hablar de una situación, del entorno o de lo que necesitas."/></label>
    <p className="muted">Evita nombres y datos identificables de otras personas. Se envían tu entrada y los permisos elegidos a OpenAI sólo al solicitar una respuesta real.</p>
    {!(operation==='pattern'?consents.patterns:consents.conversation) && <p className="notice">Esta operación necesita tu permiso. <button className="text-button" onClick={onPrivacy}>Revisar permisos</button></p>}
    <div className="actions"><button className="primary" disabled={busy||paused||!source||!(operation==='pattern'?consents.patterns&&selected.length>0:consents.conversation)} onClick={()=>void run(()=>generate())}><Icon name="assistant"/>{busy?'Preparando respuesta…':'Solicitar respuesta'}</button><button disabled={busy} onClick={()=>{reset();notify('Lo dejamos aquí. Tu entrada sigue guardada.');}}>Ahora no</button></div>
    {paused && <p role="status" className="notice">Esta conversación está pausada. Puedes seguir escribiendo en el diario. No se ha activado ningún servicio de atención humana.</p>}
  </section><div className="stack"><section className="soft-card lavender"><Icon name="assistant"/><h2>No tienes que responder a todo.</h2><p>Puedes omitir una pregunta, cambiar de tema o pedir que la IA sólo escuche. Tus preferencias tienen prioridad.</p></section>
  {response ? <section className="card ai-result" aria-label="Respuesta del asistente"><span className="badge">{response.simulation?'Simulación · no es IA real':'Generado por IA'}</span><ContentCard content={response.content} rejected={rejected} onReject={index=>void run(async()=>{const id=await persist();await api('/interpretations/'+id+'/readings/'+index,'PATCH',{fits:false});setRejected(old=>[...old,index]);},'Lectura guardada y marcada como «no encaja».')}/>
    <details><summary>Qué contexto se utilizó</summary><ul>{response.context.sources.map(s=><li key={s.entryId}>Entrada {dateLabel((entries.find(e=>e.id===s.entryId)??source)!.createdAt)} · versión {s.entryVersion}</li>)}</ul>{response.context.profileItemIds.length>0?<><p>Usando estas preferencias de tu perfil:</p><ul>{response.context.profileItemIds.map(id=><li key={id}>{profile.find(x=>x.id===id)?.text??'Preferencia autorizada'}</li>)}</ul></>:<p>No se utilizó memoria del perfil.</p>}</details>
    {response.content.type==='pattern'?<><label>Tu redacción del posible patrón<textarea value={patternEdit} maxLength={2000} onChange={e=>setPatternEdit(e.target.value)} rows={3}/></label><div className="actions"><button className="primary" disabled={busy} onClick={()=>void run(()=>decide('accept'),'Patrón aceptado en tu perfil.')}>Guardar en mi perfil</button><button disabled={busy||!patternEdit.trim()} onClick={()=>void run(()=>decide('edit'),'Tu versión quedó guardada en el perfil.')}>Guardar mi versión</button><button disabled={busy} onClick={()=>void run(()=>decide('reject'),'Se registró tu rechazo.')}>No, gracias</button><button onClick={()=>setResponse(null)}>Descartar sin guardar</button></div><button className="text-button" onClick={onProfile}>Ver mi perfil</button></>:<><div className="actions"><button className="primary" disabled={busy||Boolean(saved)} onClick={()=>void run(async()=>{await persist();},'Interpretación guardada por separado de tu entrada.')}>{saved?'Interpretación guardada':'Guardar interpretación'}</button><button disabled={busy} onClick={()=>{setResponse(null);setSaved(null);}}>Descartar respuesta</button></div>{operation==='accompany' && <div className="actions"><button disabled={busy} onClick={()=>void run(()=>generate('skip'))}>Omitir pregunta</button><button disabled={busy} onClick={()=>{setResponse(null);setSaved(null);setTurn('');notify('Contexto anterior descartado. Puedes escribir otro tema.');}}>Cambiar de tema</button><button disabled={busy} onClick={()=>void run(()=>generate('listen'))}>Solo escucha</button></div>}</>}
  </section>:<section className="card"><Empty title={busy?'Preparando una respuesta…':'Sin prisa por analizar'}>{busy?'Tu entrada sigue guardada. Puedes cerrar este espacio si lo prefieres.':'La respuesta aparecerá aquí cuando tú la solicites.'}</Empty></section>}
  {conversation && !paused && <button className="pause-button" disabled={busy} onClick={()=>void run(async()=>{controller.current?.abort();await api('/conversations/'+conversation.id+'/pause','POST',{});setPaused(true);setResponse(null);},'Interpretaciones pausadas en esta conversación.')}>Pausar interpretaciones de esta conversación</button>}
  </div></div>;
}
