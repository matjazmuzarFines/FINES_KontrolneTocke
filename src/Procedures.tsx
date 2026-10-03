import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, FilterX, GripVertical, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Badge, Empty, Field, Modal, PageTitle, matches } from './components';
import { NEW_ID } from './types';
import type { Id, Lookup, LookupKind, Procedure, Store } from './types';
import { saveProcedureAffiliations, saveRecord, saveRecords } from './data';
import { procedureAffiliationIds } from './domain';
import { byCode, lookupCode, lookupName, lookupOptions } from './lookups';

type Props = { store: Store; canEdit: boolean; refresh: () => Promise<void>; notify: (message: string) => void };
/** affs / originalAffs: selected affiliation IDs (ln_kp_postopki_pripadnost). */
type Editing = { original: Procedure; draft: Procedure; isNew: boolean; affs: Id[]; originalAffs: Id[] };
type Drop = { id: Id; after: boolean };
const emptyFilters = { code: '', name: '', order: '', group: '', phase: '', affiliation: '' };

const byOrder = (a: Procedure, b: Procedure) => a.default_order - b.default_order || a.code.localeCompare(b.code);
function nextCode(list: Procedure[]) {
  let number = 1; while (list.some(p => p.code === `KP-${String(number).padStart(4, '0')}`)) number++;
  return { code: `KP-${String(number).padStart(4, '0')}`, number };
}
/** Gives the rows in their new order the same set of order numbers, so phase ranges (0, 100, 200 ...) are kept. */
export function reorderValues(rows: Procedure[], ids: Id[]): Procedure[] {
  const values = rows.map(p => p.default_order).sort((a, b) => a - b);
  for (let i = 1; i < values.length; i++) if (values[i] <= values[i - 1]) values[i] = values[i - 1] + 1;
  return ids.map((id, i) => ({ ...rows.find(p => p.id === id)!, default_order: values[i] }))
    .filter(p => rows.find(r => r.id === p.id)!.default_order !== p.default_order);
}

export default function Procedures({ store, canEdit, refresh, notify }: Props) {
  const [filters, setFilters] = useState(emptyFilters), [hidden, setHidden] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null), [archiving, setArchiving] = useState<Procedure | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [dragId, setDragId] = useState<Id | null>(null), [drop, setDrop] = useState<Drop | null>(null);
  const filter = (key: keyof typeof emptyFilters, value: string) => setFilters(f => ({ ...f, [key]: value }));
  const filtered = Object.values(filters).some(Boolean);
  const typeCode = (p: Procedure) => lookupCode(store.inputTypes, p.input_type_id);
  const affsOf = (p: Procedure) => editing?.draft.id === p.id ? editing.affs : procedureAffiliationIds(store, p.id);
  const allId = byCode(store.affiliations, 'ALL')?.id;
  const sortedAffs = (ids: Id[]) => lookupOptions(store.affiliations).filter(a => ids.includes(a.id));
  const rows = store.procedures.filter(p => (hidden || p.visible) && matches(filters.code, p.code) && matches(filters.name, p.name)
    && (!filters.order.trim() || String(p.default_order).startsWith(filters.order.trim())) && (!filters.group || p.group_id === Number(filters.group)) && (!filters.phase || p.test_phase_id === Number(filters.phase))
    && (!filters.affiliation || procedureAffiliationIds(store, p.id).some(id => id === Number(filters.affiliation) || id === allId))).sort(byOrder);
  // A new or copied procedure stays at the bottom of the table until it is saved.
  const draftRow = editing?.isNew ? editing.draft : null;
  const list = draftRow ? [...rows, draftRow] : rows;
  const movableRows = rows.filter(p => p.visible);
  const movable = (p: Procedure) => canEdit && !busy && p.visible && p !== draftRow;
  const dirty = Boolean(editing && (editing.isNew || JSON.stringify(editing.draft) !== JSON.stringify(editing.original) || [...editing.affs].sort().join() !== [...editing.originalAffs].sort().join()));

  function leave() { return !dirty || confirm('Zavrzite neshranjene spremembe postopka?'); }
  function open(p: Procedure) { if (editing?.draft.id === p.id || !leave()) return; setError(''); const affs = procedureAffiliationIds(store, p.id); setEditing({ original: p, draft: p, isNew: false, affs, originalAffs: affs }); }
  function close() { if (busy || !leave()) return; setError(''); setEditing(null); }
  function create(source?: Procedure) {
    if (!leave()) return;
    const { code, number } = nextCode(store.procedures);
    const bottom = Math.max(0, ...store.procedures.filter(p => p.visible).map(p => p.default_order)) + 1;
    const pick = (kind: LookupKind, code: string) => byCode(store[kind], code)?.id ?? lookupOptions(store[kind])[0]?.id ?? 0;
    const base: Procedure = source ? { ...source, name: `${source.name} (kopija)` } : {
      id: NEW_ID, name: '', code: '', default_order: 0, input_type_id: pick('inputTypes', 'OK_NOK'), instruction: '', default_unit: null, group_id: Number(filters.group) || pick('groups', 'FUNKCIJA'),
      active: true, internal_note: null, sequence_number: 0, test_phase_id: Number(filters.phase) || pick('phases', 'PRIPRAVA_0'), keywords: null, status_id: pick('statuses', 'AKTIVEN'), visible: true,
    };
    const draft = { ...base, id: NEW_ID, code, default_order: bottom, sequence_number: number, visible: true };
    const affs = source ? procedureAffiliationIds(store, source.id) : filters.affiliation ? [Number(filters.affiliation)] : [];
    setError(''); setEditing({ original: draft, draft, isNew: true, affs, originalAffs: [] });
  }
  function update<K extends keyof Procedure>(key: K, value: Procedure[K]) { setEditing(e => e && { ...e, draft: { ...e.draft, [key]: value } }); }
  function toggleAffiliation(id: Id) { setEditing(e => e && { ...e, affs: e.affs.includes(id) ? e.affs.filter(a => a !== id) : [...e.affs, id] }); }
  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!editing) return; setBusy(true); setError('');
    try {
      const same = store.procedures.find(p => p.visible && p.id !== editing.draft.id && p.default_order === editing.draft.default_order);
      if (same) throw new Error(`Vrstni red ${editing.draft.default_order} že uporablja ${same.code}. Izberite drugo številko.`);
      const saved = await saveRecord('procedures', editing.draft);
      await saveProcedureAffiliations(store.procedureAffiliations, saved.id, editing.affs);
      await refresh(); setEditing({ ...editing, original: saved, draft: saved, isNew: false, originalAffs: editing.affs }); notify('Kontrolni postopek je shranjen.');
    }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function reorder(ids: Id[]) {
    const changed = reorderValues(movableRows, ids);
    if (!changed.length) return;
    setBusy(true); setError('');
    try {
      await saveRecords('procedures', changed); await refresh();
      // Keep the open form in sync without discarding other unsaved edits.
      const moved = editing && changed.find(p => p.id === editing.draft.id);
      if (moved) setEditing(e => e && { ...e, original: { ...e.original, default_order: moved.default_order }, draft: { ...e.draft, default_order: moved.default_order } });
      notify('Vrstni red je posodobljen.');
    } catch (e) { setError((e as Error).message); notify(`Vrstnega reda ni bilo mogoče shraniti: ${(e as Error).message}`); } finally { setBusy(false); }
  }
  function move(p: Procedure, delta: -1 | 1) {
    const ids = movableRows.map(r => r.id), index = ids.indexOf(p.id), target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void reorder(ids);
  }
  function dropOn(target: Procedure, after: boolean) {
    const ids = movableRows.map(r => r.id).filter(id => id !== dragId);
    const index = ids.indexOf(target.id);
    setDragId(null); setDrop(null);
    if (dragId === null || dragId === target.id || index < 0) return;
    ids.splice(after ? index + 1 : index, 0, dragId);
    void reorder(ids);
  }
  async function visibility() {
    if (!archiving) return; setBusy(true); setError('');
    try {
      const next = { ...archiving, visible: !archiving.visible };
      await saveRecord('procedures', next); await refresh();
      if (editing?.draft.id === next.id) setEditing(next.visible || hidden ? { ...editing, original: next, draft: next, isNew: false } : null);
      notify(archiving.visible ? 'Postopek je izbrisan (skrit). Pretekli rezultati so ohranjeni.' : 'Postopek je obnovljen.'); setArchiving(null);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!editing || archiving) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler);
  });

  return <>
    <PageTitle eyebrow="Nastavitve programov" title="Definicija kontrolnih postopkov" description="Izberite postopek v tabeli. Vse podrobnosti uredite v desnem delu." action={canEdit && <button className="button success" title="Dodaj nov kontrolni postopek" onClick={() => create()}><Plus size={18} /> Nov postopek</button>} />
    <section className="panel filter-panel" aria-label="Filtri postopkov">
      <Field label="ID postopka"><input value={filters.code} placeholder="npr. KP-0001" title="Filtriraj tabelo po ID-ju postopka" onChange={e => filter('code', e.target.value)} /></Field>
      <Field label="Naziv"><input value={filters.name} placeholder="Del naziva ..." title="Filtriraj tabelo po nazivu postopka" onChange={e => filter('name', e.target.value)} /></Field>
      <Field label="Vrstni red"><input inputMode="numeric" value={filters.order} placeholder="npr. 10" title="Filtriraj po začetku vrstnega reda" onChange={e => filter('order', e.target.value)} /></Field>
      <Field label="Skupina"><select value={filters.group} title="Filtriraj tabelo po skupini" onChange={e => filter('group', e.target.value)}><option value="">Vse skupine</option>{lookupOptions(store.groups).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
      <Field label="Faza testa"><select value={filters.phase} title="Filtriraj tabelo po fazi testa" onChange={e => filter('phase', e.target.value)}><option value="">Vse faze</option>{lookupOptions(store.phases).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Pripadnost"><select value={filters.affiliation} title="Filtriraj tabelo po pripadnosti" onChange={e => filter('affiliation', e.target.value)}><option value="">Vse pripadnosti</option>{lookupOptions(store.affiliations).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <div className="filter-actions"><label className="check" title="Prikaži tudi izbrisane (skrite) postopke"><input type="checkbox" checked={hidden} onChange={e => setHidden(e.target.checked)} /> Prikaži izbrisane</label><button className="button small" title="Počisti vse filtre tabele" disabled={!filtered} onClick={() => setFilters(emptyFilters)}><FilterX size={15} /> Počisti filtre</button></div>
    </section>
    <div className="proc-layout">
      <section className="panel proc-list">
        <div className="table-meta"><span>{rows.length} od {store.procedures.filter(p => hidden || p.visible).length} postopkov</span>{draftRow ? <Badge tone="warning">Nov postopek še ni shranjen</Badge> : canEdit && <span className="hint">Vrstico povlecite ali jo izberite in premaknite s puščicami.</span>}</div>
        {error && !editing && !archiving && <div role="alert" className="alert danger table-alert">{error}</div>}
        <div className="table-scroll"><table className="dense-table">
          <thead><tr><th className="move-col"><span className="sr-only">Premik</span></th><th>Vr. red</th><th className="hide-sm">ID</th><th>Naziv postopka</th><th className="hide-sm">Tip vnosa</th><th className="hide-md">Skupina</th><th className="hide-md">Faza testa</th><th className="hide-sm">Pripadnost</th><th>Status</th>{canEdit && <th><span className="sr-only">Dejanja</span></th>}</tr></thead>
          <tbody>{list.map(p => {
            const isDraft = p === draftRow, selected = editing?.draft.id === p.id, canMove = movable(p);
            const position = movableRows.indexOf(p), active = p.visible && lookupCode(store.statuses, p.status_id) === 'AKTIVEN';
            const className = ['select-row', selected && 'selected', !p.visible && 'muted-row', dragId === p.id && 'dragging', drop?.id === p.id && (drop.after ? 'drop-after' : 'drop-before')].filter(Boolean).join(' ');
            return <tr key={p.id} tabIndex={0} aria-current={selected || undefined} className={className} title={canMove ? 'Klikni za urejanje, povleci za premik' : 'Klikni za pregled in urejanje postopka'}
              draggable={canMove} onDragStart={e => { setDragId(p.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(p.id)); }} onDragEnd={() => { setDragId(null); setDrop(null); }}
              onDragOver={e => { if (dragId === null || !canMove) return; e.preventDefault(); const box = e.currentTarget.getBoundingClientRect(); const after = e.clientY > box.top + box.height / 2; if (drop?.id !== p.id || drop.after !== after) setDrop({ id: p.id, after }); }}
              onDrop={e => { e.preventDefault(); if (drop) dropOn(p, drop.after); }}
              onClick={() => open(p)} onKeyDown={e => {
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(p); }
                if (e.altKey && canMove && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(p, e.key === 'ArrowUp' ? -1 : 1); }
              }}>
              <td className="move-col">{canMove && (selected ? <div className="move-buttons">
                <button className="icon-button small" aria-label={`Premakni ${p.code} gor`} title="Premakni postopek eno mesto gor" disabled={position <= 0} onClick={e => { e.stopPropagation(); move(p, -1); }}><ChevronUp size={16} /></button>
                <button className="icon-button small" aria-label={`Premakni ${p.code} dol`} title="Premakni postopek eno mesto dol" disabled={position >= movableRows.length - 1} onClick={e => { e.stopPropagation(); move(p, 1); }}><ChevronDown size={16} /></button>
              </div> : <GripVertical size={15} className="grip" aria-hidden="true" />)}</td>
              <td><span className="order-number" title="Privzeti vrstni red postopka">{p.default_order}</span></td>
              <td className="code-cell hide-sm">{p.code}</td>
              <td className="name-cell">{p.name || <em>Nov postopek</em>}<span className="cell-sub show-sm">{p.code}</span></td>
              <td className="hide-sm"><Badge tone={typeCode(p) === 'MERITEV' ? 'orange' : 'neutral'} title="Tip vnosa rezultata">{lookupName(store.inputTypes, p.input_type_id)}</Badge></td>
              <td className="hide-md">{lookupName(store.groups, p.group_id)}</td>
              <td className="hide-md nowrap">{lookupName(store.phases, p.test_phase_id)}</td>
              <td className="hide-sm affiliation-cell">{sortedAffs(affsOf(p)).map(a => a.name).join(', ') || <span className="muted-text">—</span>}</td>
              <td>{isDraft ? <Badge tone="warning" title="Postopek še ni shranjen">Neshranjen</Badge> : <Badge tone={!p.visible ? 'neutral' : active ? 'success' : 'warning'} title={active ? 'Postopek se uporablja v novih testih' : 'Postopek se ne uporablja v novih testih'}>{!p.visible ? 'Izbrisan' : lookupName(store.statuses, p.status_id)}</Badge>}</td>
              {canEdit && <td><div className="row-actions">{!isDraft && <>
                <button className="icon-button" aria-label={`Kopiraj ${p.code}`} title="Kopiraj postopek v novo vrstico" onClick={e => { e.stopPropagation(); create(p); }}><Copy size={16} /></button>
                <button className={`icon-button ${p.visible ? 'danger-text' : ''}`} aria-label={`${p.visible ? 'Izbriši' : 'Obnovi'} ${p.code}`} title={p.visible ? 'Izbriši (skrij) kontrolni postopek' : 'Obnovi izbrisan kontrolni postopek'} onClick={e => { e.stopPropagation(); setError(''); setArchiving(p); }}>{p.visible ? <Trash2 size={16} /> : <RotateCcw size={16} />}</button>
              </>}</div></td>}
            </tr>;
          })}</tbody>
        </table></div>
        {!list.length && <Empty title="Ni najdenih postopkov">Spremenite ali počistite filtre.</Empty>}
      </section>
      <div className="proc-divider" aria-hidden="true" />
      {editing && <button className="proc-backdrop" aria-label="Zapri podrobnosti" title="Zapri podrobnosti postopka" onClick={close} />}
      <aside className={`panel proc-detail ${editing ? 'open' : ''}`} aria-label="Podrobnosti postopka">
        {editing ? <ProcedureDetail editing={editing} store={store} toggleAffiliation={toggleAffiliation} position={movable(editing.draft) ? movableRows.findIndex(r => r.id === editing.draft.id) : -1} count={movableRows.length} onMove={delta => move(editing.draft, delta)} canEdit={canEdit} busy={busy} error={archiving ? '' : error} update={update} onSave={save} onClose={close} />
          : <Empty title="Izberite postopek">Kliknite vrstico v tabeli za pregled in urejanje vseh podatkov postopka.</Empty>}
      </aside>
    </div>
    {archiving && <Modal title={archiving.visible ? 'Izbriši kontrolni postopek?' : 'Obnovi kontrolni postopek?'} onClose={() => !busy && setArchiving(null)}><div className="modal-body"><p><strong>{archiving.code} · {archiving.name}</strong></p><p>{archiving.visible ? 'Postopek bo skrit iz seznama in umaknjen iz novih testov. Podatki, povezave in pretekli rezultati ostanejo shranjeni; obnovite ga lahko s prikazom izbrisanih.' : 'Postopek bo ponovno viden in na voljo glede na svoj status.'}</p>{error && <div role="alert" className="alert danger">{error}</div>}</div><footer className="modal-footer"><button className="button" title="Prekliči in zapri okno" disabled={busy} onClick={() => setArchiving(null)}>Prekliči</button><button className={`button ${archiving.visible ? 'danger' : 'success'}`} title={archiving.visible ? 'Potrdi brisanje (skrivanje) postopka' : 'Potrdi obnovitev postopka'} disabled={busy} onClick={visibility}>{busy ? 'Shranjujem ...' : archiving.visible ? 'Izbriši postopek' : 'Obnovi postopek'}</button></footer></Modal>}
  </>;
}

function LookupSelect({ label, list, value, onChange, hint }: { label: string; list: Lookup[]; value: Id; onChange: (id: Id) => void; hint: string }) {
  return <Field label={`${label} *`}><select required value={value} title={hint} onChange={e => onChange(Number(e.target.value))}>{!value && <option value="">Izberite ...</option>}{lookupOptions(list, value).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>;
}
type DetailProps = { editing: Editing; store: Store; toggleAffiliation: (id: Id) => void; position: number; count: number; onMove: (delta: -1 | 1) => void; canEdit: boolean; busy: boolean; error: string; update: <K extends keyof Procedure>(key: K, value: Procedure[K]) => void; onSave: (e: React.FormEvent) => void; onClose: () => void };
function ProcedureDetail({ editing, store, toggleAffiliation, position, count, onMove, canEdit, busy, error, update, onSave, onClose }: DetailProps) {
  const { draft, isNew, affs } = editing;
  const multi = lookupCode(store.inputTypes, draft.input_type_id) === 'VEC_MERITEV';
  const sameOrder = store.procedures.filter(p => p.visible && p.id !== draft.id && p.default_order === draft.default_order);
  const links = store.links.filter(l => l.visible && l.procedure_id === draft.id).length;
  return <form className="detail-form" onSubmit={onSave}>
    <header className="detail-header"><div><span className="eyebrow">{isNew ? 'Nov postopek' : draft.code}</span><h2>{draft.name || 'Nov kontrolni postopek'}</h2>{!isNew && <p>Uporabljen pri {links} {links === 1 ? 'artiklu' : 'artiklih'}</p>}</div><div className="detail-actions">{position >= 0 && <>
      <button type="button" className="icon-button" aria-label="Premakni postopek gor" title="Premakni postopek eno mesto gor" disabled={position === 0} onClick={() => onMove(-1)}><ChevronUp size={19} /></button>
      <button type="button" className="icon-button" aria-label="Premakni postopek dol" title="Premakni postopek eno mesto dol" disabled={position === count - 1} onClick={() => onMove(1)}><ChevronDown size={19} /></button>
    </>}<button type="button" className="icon-button" aria-label="Zapri podrobnosti" title="Zapri podrobnosti postopka" onClick={onClose}><X size={20} /></button></div></header>
    <div className="detail-body">
      <fieldset disabled={!canEdit || busy} className="detail-grid">
        <h3 className="span-all">Osnovni podatki</h3>
        <Field label="ID postopka" hint="Dodeli se samodejno in se ne spreminja."><input readOnly className="locked" value={draft.code} title="ID postopka se ne spreminja" /></Field>
        <Field label="Vrstni red *"><input type="number" required min="0" step="1" value={draft.default_order} onChange={e => update('default_order', Number(e.target.value))} /></Field>
        {sameOrder.length > 0 && <div className="alert warning span-all">Vrstni red {draft.default_order} že uporablja {sameOrder.map(p => p.code).join(', ')}.</div>}
        <div className="span-all"><Field label="Naziv postopka *"><input required value={draft.name} onChange={e => update('name', e.target.value)} /></Field></div>
        <LookupSelect label="Tip vnosa" list={store.inputTypes} value={draft.input_type_id} hint="Izberite, kako se vnese rezultat" onChange={id => { update('input_type_id', id); if (lookupCode(store.inputTypes, id) === 'VEC_MERITEV') update('default_unit', null); }} />
        <Field label="Privzeta enota" hint={multi ? 'Pri več meritvah se enote določijo na artiklu.' : undefined}><input disabled={multi} className={multi ? 'locked' : ''} value={draft.default_unit ?? ''} placeholder={multi ? 'Določi se na artiklu' : 'npr. V, A, °C'} title={multi ? 'Enote meritev se določijo na artiklu' : 'Enota rezultata meritve'} onChange={e => update('default_unit', e.target.value || null)} /></Field>
        <div className="span-all"><Field label="Navodilo za izvajalca *"><textarea required rows={5} value={draft.instruction} onChange={e => update('instruction', e.target.value)} /></Field></div>
        <h3 className="span-all">Razvrstitev</h3>
        <LookupSelect label="Skupina" list={store.groups} value={draft.group_id} hint="Izberite skupino postopka" onChange={id => update('group_id', id)} />
        <LookupSelect label="Faza testa" list={store.phases} value={draft.test_phase_id} hint="Izberite fazo testa" onChange={id => update('test_phase_id', id)} />
        <div className="span-all field"><span>Pripadnost</span><div className="choice-chips" role="group" aria-label="Pripadnost">{store.affiliations.filter(a => a.visible || affs.includes(a.id)).sort((a, b) => a.sort_order - b.sort_order).map(a =>
          <label key={a.id} className={`choice-chip ${affs.includes(a.id) ? 'checked' : ''}`} title={`${affs.includes(a.id) ? 'Odstrani' : 'Dodaj'} pripadnost ${a.name}`}><input type="checkbox" checked={affs.includes(a.id)} onChange={() => toggleAffiliation(a.id)} />{a.name}</label>)}</div></div>
        <h3 className="span-all">Status</h3>
        <LookupSelect label="Status" list={store.statuses} value={draft.status_id} hint="Samo aktivni postopki se uporabljajo v testih" onChange={id => update('status_id', id)} />
        <h3 className="span-all">Dodatno</h3>
        <div className="span-all"><Field label="Ključne besede"><input value={draft.keywords ?? ''} onChange={e => update('keywords', e.target.value || null)} /></Field></div>
        <div className="span-all"><Field label="Interna opomba"><textarea rows={3} value={draft.internal_note ?? ''} onChange={e => update('internal_note', e.target.value || null)} /></Field></div>
      </fieldset>
      {error && <div role="alert" className="alert danger">{error}</div>}
    </div>
    <footer className="detail-footer"><button type="button" className="button" title={canEdit ? 'Zavrzi spremembe in zapri' : 'Zapri podrobnosti postopka'} disabled={busy} onClick={onClose}>{canEdit ? 'Prekliči' : 'Zapri'}</button>{canEdit && <button type="submit" className="button success" title="Shrani spremembe kontrolnega postopka" disabled={busy}>{busy ? 'Shranjujem ...' : 'Shrani postopek'}</button>}</footer>
  </form>;
}
