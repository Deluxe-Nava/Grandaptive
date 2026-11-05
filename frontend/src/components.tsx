import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AIContent } from '../../shared/contracts.ts';

export function Icon({ name }: { name: string }) {
  const paths: Record<string, ReactNode> = {
    diary: <><path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z"/><path d="M13 7a3 3 0 0 1 3-3h4v15h-4a4 4 0 0 0-3 2"/></>,
    assistant: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/></>,
    profile: <><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
    settings: <><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/></>,
    privacy: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/></>,
    leaf: <><path d="M20 3C9 2 2 7 5 15c6 7 16-1 15-12Z"/><path d="M3 22 16 8"/></>,
    plus: <path d="M12 4v16M4 12h16"/>,
  };
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.leaf}</svg>;
}
export function Toggle({ label, description, checked, onChange, disabled = false }: { label: string; description?: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <label className="toggle-row"><span><strong>{label}</strong>{description && <small>{description}</small>}</span><input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} /><span className="switch" aria-hidden="true" /></label>;
}
export function Empty({ title, children }: { title: string; children: ReactNode }) { return <div className="empty"><Icon name="leaf"/><h3>{title}</h3><p>{children}</p></div>; }
export function Confirm({ title, children, confirm, onCancel, onConfirm, busy, confirmDisabled = false }: { title: string; children: ReactNode; confirm: string; onCancel: () => void; onConfirm: () => void; busy: boolean; confirmDisabled?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; ref.current?.showModal(); return () => { ref.current?.close(); previous?.focus(); }; }, []);
  return <dialog ref={ref} aria-labelledby="confirm-title" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}><h2 id="confirm-title">{title}</h2>{children}<div className="actions"><button autoFocus disabled={busy} onClick={onCancel}>Cancelar</button><button className="danger" disabled={busy || confirmDisabled} onClick={onConfirm}>{busy ? 'Procesando…' : confirm}</button></div></dialog>;
}
export function ContentCard({ content, rejected = [], onReject }: { content: AIContent; rejected?: number[]; onReject?: (index: number) => void }) {
  if (content.type === 'interpret') return <div className="readings"><section><h3>Lo que ocurrió</h3><ul>{content.reportedFacts.map((item,i) => <li key={i}>{item}</li>)}</ul></section><section><h3>Posibles lecturas</h3>{content.abstentionReason && <p>{content.abstentionReason}</p>}<ul>{content.possibleReadings.map((item,i) => <li key={i}><p>{item}</p>{rejected.includes(i) ? <span className="badge">Marcaste: no encaja</span> : onReject && <button className="text-button" onClick={() => onReject(i)}>No encaja conmigo</button>}</li>)}</ul></section><section><h3>Lo que no sabemos</h3><ul>{content.unknowns.map((item,i) => <li key={i}>{item}</li>)}</ul></section></div>;
  if (content.type === 'communicate') return <div className="stack">{content.formulations.map((text,i) => <Formulation key={i+text} text={text} index={i}/>)}</div>;
  if (content.type === 'pattern') return <p className="preserve">{content.hypothesis}</p>;
  return <><p className="preserve">{content.text}</p>{content.type === 'accompany' && <>{content.questions.length > 0 && <ul>{content.questions.map((text,i) => <li key={i}>{text}</li>)}</ul>}{content.recommendations.length > 0 && <ul>{content.recommendations.map((text,i) => <li key={i}>{text}</li>)}</ul>}</>}</>;
}
function Formulation({ text, index }: { text: string; index: number }) {
  const [value, setValue] = useState(text); const [message, setMessage] = useState('');
  return <div className="formulation"><label>Opción {index+1} · puedes cambiarla<textarea value={value} onChange={e => { setValue(e.target.value); setMessage(''); }} rows={3}/></label><button onClick={async () => { try { await navigator.clipboard.writeText(value); setMessage('Copiada. Tú decides si compartirla.'); } catch { setMessage('Selecciona el texto y cópialo con el menú de tu dispositivo.'); } }}>Copiar mi versión</button><span role="status">{message}</span></div>;
}
