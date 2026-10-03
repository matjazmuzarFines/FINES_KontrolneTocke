import { useEffect, useRef, type ReactNode } from 'react';
import { X, Search, Inbox } from 'lucide-react';

export function Badge({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'orange' | 'success' | 'warning' | 'danger'; title?: string }) { return <span className={`badge ${tone}`} title={title}>{children}</span>; }
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function SearchBox({ value, onChange, placeholder = 'Poiščite ...' }: { value: string; onChange: (v: string) => void; placeholder?: string }) { return <label className="search"><Search size={18} /><input aria-label={placeholder} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} /></label>; }
export function Empty({ title, children }: { title: string; children?: ReactNode }) { return <div className="empty"><Inbox size={36} strokeWidth={1.4} /><h3>{title}</h3>{children && <p>{children}</p>}</div>; }
export function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>; }
export function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const dialog = ref.current!;
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
    focusables()[0]?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current(); }
      if (e.key === 'Tab') {
        const list = focusables(), first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', handler);
    return () => { document.body.style.overflow = bodyOverflow; document.removeEventListener('keydown', handler); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop"><div ref={ref} role="dialog" aria-modal="true" aria-labelledby="modal-title" className={`modal ${wide ? 'wide' : ''}`}><header className="modal-header"><div><h2 id="modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="Zapri obrazec" title="Zapri okno brez shranjevanja" onClick={onClose}><X size={22} /></button></header>{children}</div></div>;
}
export function dateLabel(date: string) { return new Intl.DateTimeFormat('sl-SI', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Ljubljana' }).format(new Date(date)); }
export function matches(query: string, ...values: (string | null)[]) { return values.join(' ').toLocaleLowerCase('sl').includes(query.toLocaleLowerCase('sl').trim()); }
