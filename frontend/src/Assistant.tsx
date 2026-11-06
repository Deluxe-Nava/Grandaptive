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
    if (!response) throw new Error('Request a response first.');
    const data = await api<{id:string}>(response.content.type === 'pattern' ? '/suggestions' : '/interpretations','POST',{receipt:response.receipt});
    setSaved(data.id); return data.id;
  }
  async function decide(decision:'accept'|'edit'|'reject'|'archive') { const id=await persist(); await api('/suggestions/'+id+'/decision','POST',{decision,...(decision==='edit'?{text:patternEdit}: {})}); setResponse(null); setSaved(null); await profileChanged(); }
  if (!consents.aiEnabled) return <section className="card"><Empty title="You decide whether to use AI">Your journal and your manual profile work without it. You can review what information you authorize before turning it on.</Empty><div className="empty-action"><button onClick={onPrivacy}>Review AI permissions</button></div></section>;
  return <div className="assistant-layout"><section className="card stack"><span className="eyebrow">OPTIONAL SUPPORT</span><h2>A little more clarity, your way.</h2><p>The AI suggests possibilities. You know your experience and can discard any reading.</p>
    <label>Entry you want to explore<select value={entryId} disabled={busy} onChange={e=>{reset();setEntryId(e.target.value);}}><option value="" disabled>Choose an entry</option>{[...(initialEntry&&!entries.some(x=>x.id===initialEntry.id)?[initialEntry]:[]),...entries].map(entry=><option key={entry.id} value={entry.id}>{dateLabel(entry.createdAt)} · {entry.text.slice(0,55)}</option>)}</select></label>{source && <details><summary>See the original text that will be sent</summary><p className="preserve">{source.text}</p></details>}
    <label>What would be helpful?<select value={operation} disabled={busy} onChange={e=>{reset();setOperation(e.target.value as Operation);}}><option value="accompany">Keep me company</option><option value="summary">Summarize what I wrote</option><option value="interpret">Understand a situation</option><option value="communicate">Find my words</option><option value="pattern">Explore a possible pattern</option></select></label>
    {operation==='pattern' && <fieldset><legend>Choose up to 5 authorized entries</legend><p>Only entries marked as available for analysis are included.</p>{entries.filter(x=>x.availableForAnalysis).map(entry=><label className="check-row" key={entry.id}><input type="checkbox" checked={selected.includes(entry.id)} disabled={busy || (!selected.includes(entry.id) && selected.length>=5)} onChange={e=>{setResponse(null);setSelected(old=>e.target.checked?[...old,entry.id]:old.filter(id=>id!==entry.id));}}/><span>{entry.text.slice(0,100)}</span></label>)}{!entries.some(x=>x.availableForAnalysis)&&<p>Authorize the entries you want from My journal.</p>}</fieldset>}
    {operation==='communicate' && <label>Context<select value={context} onChange={e=>{setResponse(null);setContext(e.target.value);}} disabled={busy}><option value="school">School</option><option value="family">Family</option><option value="work">Work</option><option value="friendship">Friendship</option></select></label>}
    <label>{operation==='communicate'?'What need or boundary do you want to express?':'Anything you want to add (optional)'}<textarea rows={3} maxLength={2000} value={turn} onChange={e=>setTurn(e.target.value)} placeholder="You can talk about a situation, your surroundings, or what you need."/></label>
    <p className="muted">Avoid names and identifying details about other people. Your entry and the permissions you chose are sent to OpenAI only when you request a real response.</p>
    {!(operation==='pattern'?consents.patterns:consents.conversation) && <p className="notice">This action needs your permission. <button className="text-button" onClick={onPrivacy}>Review permissions</button></p>}
    <div className="actions"><button className="primary" disabled={busy||paused||!source||!(operation==='pattern'?consents.patterns&&selected.length>0:consents.conversation)} onClick={()=>void run(()=>generate())}><Icon name="assistant"/>{busy?'Preparing response…':'Request response'}</button><button disabled={busy} onClick={()=>{reset();notify('We’ll leave it here. Your entry is still saved.');}}>Not now</button></div>
    {paused && <p role="status" className="notice">This conversation is paused. You can keep writing in your journal. No human support service has been activated.</p>}
  </section><div className="stack"><section className="soft-card lavender"><Icon name="assistant"/><h2>You don't have to answer everything.</h2><p>You can skip a question, change the topic, or ask the AI to just listen. Your preferences come first.</p></section>
  {response ? <section className="card ai-result" aria-label="Assistant response"><span className="badge">{response.simulation?'Simulation · not real AI':'AI-generated'}</span><ContentCard content={response.content} rejected={rejected} onReject={index=>void run(async()=>{const id=await persist();await api('/interpretations/'+id+'/readings/'+index,'PATCH',{fits:false});setRejected(old=>[...old,index]);},'Reading saved and marked as “doesn’t fit”.')}/>
    <details><summary>What context was used</summary><ul>{response.context.sources.map(s=><li key={s.entryId}>Entry {dateLabel((entries.find(e=>e.id===s.entryId)??source)!.createdAt)} · version {s.entryVersion}</li>)}</ul>{response.context.profileItemIds.length>0?<><p>Using these preferences from your profile:</p><ul>{response.context.profileItemIds.map(id=><li key={id}>{profile.find(x=>x.id===id)?.text??'Authorized preference'}</li>)}</ul></>:<p>No profile memory was used.</p>}</details>
    {response.content.type==='pattern'?<><label>Your wording of the possible pattern<textarea value={patternEdit} maxLength={2000} onChange={e=>setPatternEdit(e.target.value)} rows={3}/></label><div className="actions"><button className="primary" disabled={busy} onClick={()=>void run(()=>decide('accept'),'Pattern accepted into your profile.')}>Save to my profile</button><button disabled={busy||!patternEdit.trim()} onClick={()=>void run(()=>decide('edit'),'Your version was saved to your profile.')}>Save my version</button><button disabled={busy} onClick={()=>void run(()=>decide('reject'),'Your rejection was recorded.')}>No, thanks</button><button onClick={()=>setResponse(null)}>Discard without saving</button></div><button className="text-button" onClick={onProfile}>View my profile</button></>:<><div className="actions"><button className="primary" disabled={busy||Boolean(saved)} onClick={()=>void run(async()=>{await persist();},'Interpretation saved separately from your entry.')}>{saved?'Interpretation saved':'Save interpretation'}</button><button disabled={busy} onClick={()=>{setResponse(null);setSaved(null);}}>Discard response</button></div>{operation==='accompany' && <div className="actions"><button disabled={busy} onClick={()=>void run(()=>generate('skip'))}>Skip question</button><button disabled={busy} onClick={()=>{setResponse(null);setSaved(null);setTurn('');notify('Previous context discarded. You can write about another topic.');}}>Change topic</button><button disabled={busy} onClick={()=>void run(()=>generate('listen'))}>Just listen</button></div>}</>}
  </section>:<section className="card"><Empty title={busy?'Preparing a response…':'No rush to analyze'}>{busy?'Your entry is still saved. You can close this space if you prefer.':'The response will appear here when you ask for it.'}</Empty></section>}
  {conversation && !paused && <button className="pause-button" disabled={busy} onClick={()=>void run(async()=>{controller.current?.abort();await api('/conversations/'+conversation.id+'/pause','POST',{});setPaused(true);setResponse(null);},'Interpretations paused in this conversation.')}>Pause interpretations in this conversation</button>}
  </div></div>;
}
