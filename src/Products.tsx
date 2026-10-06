import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, ChevronRight, Pencil, EyeOff, RotateCcw, Link2, Package, Trash2 } from 'lucide-react';
import { Badge, Empty, Field, Modal, PageTitle, SearchBox, matches } from './components';
import { saveRecord, saveRecords } from './data';
import { linkMeasurements, procedureActive, procedureAffiliationIds } from './domain';
import { lookupCode, lookupName, lookupOptions } from './lookups';
import { NEW_ID } from './types';
import type { Id, Link, Measurement, Product, Store } from './types';

type Props = { store: Store; canEdit: boolean; refresh: () => Promise<void>; notify: (message: string) => void };
const withProducts = (n: number) => `${n} ${n === 1 ? 'artiklom' : n === 2 ? 'artikloma' : 'artikli'}`;
export default function Products({ store, canEdit, refresh, notify }: Props) {
  const [query, setQuery] = useState(''), [selected, setSelected] = useState<Id>(store.products.find(p => p.visible)?.id ?? NEW_ID), [hidden, setHidden] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null), [editLink, setEditLink] = useState<Link | null>(null), [adding, setAdding] = useState(false), [procedureId, setProcedureId] = useState<Id>(NEW_ID);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [checked, setChecked] = useState<Id[]>([]);
  const product = store.products.find(p => p.id === selected);
  // A product has the affiliations of its linked procedures (products have no affiliation of their own).
  const productAffs = useMemo(() => { const m = new Map<Id, Set<Id>>(); for (const l of store.links) if (l.visible) { const s = m.get(l.product_id) ?? new Set<Id>(); procedureAffiliationIds(store,l.procedure_id).forEach(a => s.add(a)); m.set(l.product_id,s); } return m; }, [store]);
  const [affFilter, setAffFilter] = useState<Id[]>([]);
  const toggleAff = (id: Id) => setAffFilter(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
  const affNames = (id: Id) => lookupOptions(store.affiliations).filter(a => productAffs.get(id)?.has(a.id)).map(a => a.name).join(', ');
  const products = store.products.filter(p => (p.visible || hidden) && matches(query,p.name,p.code) && (!affFilter.length || affFilter.some(a => productAffs.get(p.id)?.has(a))));
  const links = store.links.filter(l => l.product_id === selected && (l.visible || hidden)).sort((a,b) => a.sort_order - b.sort_order);
  // With checked products the new procedure is linked to all of them; otherwise only to the open product.
  const bulk = checked.length > 0;
  const targets = bulk ? store.products.filter(p => p.visible && checked.includes(p.id)) : product ? [product] : [];
  const linked = (productId: Id, procedureId: Id) => store.links.some(l => l.product_id === productId && l.procedure_id === procedureId && l.visible);
  const available = store.procedures.filter(p => p.visible && targets.some(t => !linked(t.id,p.id)));
  const shown = products.filter(p => p.visible), allShown = shown.length > 0 && shown.every(p => checked.includes(p.id));
  const toggleCheck = (id: Id) => setChecked(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);
  const toggleAll = () => setChecked(c => allShown ? c.filter(id => !shown.some(p => p.id === id)) : [...new Set([...c, ...shown.map(p => p.id)])]);
  // Keep the open product visible inside the scrolling list without scrolling the whole page.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current, item = list?.querySelector<HTMLElement>('.product-item.selected');
    if (!list || !item) return;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
  }, [selected, products.length]);
  function moveSelection(e: React.KeyboardEvent) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const i = products.findIndex(p => p.id === selected), next = products[Math.min(products.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (!next) return;
    e.preventDefault(); setSelected(next.id);
    listRef.current?.querySelectorAll<HTMLElement>('.product-option')[products.indexOf(next)]?.focus({ preventScroll: true });
  }
  const finish = async () => { await refresh(); setEditProduct(null); setEditLink(null); setAdding(false); notify('Spremembe so shranjene.'); };
  function addProduct() { setEditProduct({ id: NEW_ID, name: '', code: '', active: true, source: 'manual', last_synced_at: null, sync_status: null, manually_locked: false, note: null, visible: true }); }
  async function toggle(kind: 'products' | 'links', record: Product | Link) {
    if (!confirm(record.visible ? 'Skrijete zapis? Povezave in pretekli rezultati bodo ohranjeni.' : 'Obnovite zapis?')) return;
    setBusy(true); setError('');
    try { if (kind === 'products') await saveRecord(kind, { ...(record as Product), visible: !record.visible }); else await saveRecord(kind, { ...(record as Link), visible: !record.visible }); await refresh(); notify(record.visible ? 'Zapis je skrit.' : 'Zapis je obnovljen.'); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function addLink(e: React.FormEvent) {
    e.preventDefault(); const p = store.procedures.find(p => p.id === procedureId); if (!p || !targets.length) return;
    // A hidden link is restored instead of creating a duplicate.
    const linkFor = (t: Product): Link => { const old = store.links.find(l => l.product_id === t.id && l.procedure_id === p.id); return old ? { ...old, visible: true } : { id: NEW_ID, title: `${t.code}|${p.code}`, product_id: t.id, procedure_id: p.id, sort_order: p.default_order, required: true, min_value: null, max_value: null, nominal_value: null, photo_required: false, poka_yoke: false, unit_override: null, instruction_override: null, measurement_name: null, active: true, valid_from: null, valid_to: null, visible: true }; };
    if (!bulk) { setAdding(false); setEditLink(linkFor(targets[0])); return; }
    const records = targets.filter(t => !linked(t.id,p.id)).map(linkFor);
    setBusy(true); setError('');
    try { await saveRecords('links',records); await refresh(); setAdding(false); notify(`Postopek ${p.code} je povezan z ${withProducts(records.length)}.`); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <>
    <PageTitle eyebrow="Nastavitve programov" title="Povezave postopkov in izdelkov" description="Izberite artikel in določite kontrolne točke, njihov vrstni red ter meje meritev." action={canEdit && <button className="button success" title="Dodaj nov artikel" onClick={addProduct}><Plus size={18} /> Nov artikel</button>} />
    <div className="product-layout"><section className="panel product-list"><div className="panel-heading"><h2><Package size={19} /> Artikli</h2><Badge>{store.products.filter(p => p.visible).length}</Badge></div><div className="product-search"><SearchBox value={query} onChange={setQuery} placeholder="Poiščite artikel ali šifro ..." /><div className="product-filter"><div className="product-filter-head"><span>Pripadnost</span>{affFilter.length > 0 && <button className="text-link" title="Počisti filter po pripadnosti" onClick={() => setAffFilter([])}>Počisti</button>}</div><div className="choice-chips" role="group" aria-label="Filter po pripadnosti">{lookupOptions(store.affiliations).map(a => <label key={a.id} className={`choice-chip ${affFilter.includes(a.id) ? 'checked' : ''}`} title={`${affFilter.includes(a.id) ? 'Odstrani' : 'Prikaži'} artikle s pripadnostjo ${a.name}`}><input type="checkbox" checked={affFilter.includes(a.id)} onChange={() => toggleAff(a.id)} />{a.name}</label>)}</div></div><label className="check"><input type="checkbox" checked={hidden} onChange={e => setHidden(e.target.checked)} /> Prikaži skrite zapise</label></div>
    {canEdit && <div className="product-bulk"><label className="check" title={allShown ? 'Odznači vse prikazane artikle' : 'Označi vse prikazane artikle'}><input type="checkbox" checked={allShown} disabled={!shown.length} onChange={toggleAll} /> {bulk ? `Izbranih artiklov: ${checked.length}` : 'Izberi več artiklov'}</label>{bulk && <button className="text-link" title="Počisti izbor vseh artiklov" onClick={() => setChecked([])}>Počisti</button>}</div>}
    <div className="product-list-items" ref={listRef} onKeyDown={moveSelection} title="Drsite ali uporabite puščici gor in dol">{products.map(p => <div key={p.id} className={`product-item ${selected === p.id ? 'selected' : ''} ${checked.includes(p.id) ? 'checked' : ''}`}>{canEdit && <label className="product-check" title={p.visible ? `Označi artikel ${p.code} za skupno dodajanje` : 'Skritega artikla ni mogoče označiti'}><input type="checkbox" aria-label={`Označi artikel ${p.code}`} disabled={!p.visible} checked={checked.includes(p.id)} onChange={() => toggleCheck(p.id)} /></label>}<button className="product-option" title={`Prikaži kontrolne postopke artikla ${p.code}`} onClick={() => setSelected(p.id)}><div><strong>{p.name}</strong><span>{p.code}{!p.visible ? ' · Skrit' : !p.active ? ' · Neaktiven' : ''}{productAffs.get(p.id)?.size ? ` · ${affNames(p.id)}` : ''}</span></div><ChevronRight size={18} /></button></div>)}</div>{!products.length && <Empty title="Ni artiklov" />}<div className="product-list-footer" title="Število prikazanih artiklov glede na filter"><span>Prikazanih {products.length} od {store.products.filter(p => p.visible || hidden).length}</span>{bulk && <span>Izbranih {checked.length}</span>}</div></section>
    <section className="panel product-details">{product ? <><div className="product-header"><div><span className="eyebrow">{product.code}</span><h2>{product.name}</h2><p>{links.filter(l => l.visible).length} povezanih kontrolnih postopkov</p></div><div className="product-header-side"><div className="row-actions"><Badge tone={product.visible && product.active ? 'success' : 'neutral'}>{!product.visible ? 'Skrit' : product.active ? 'Aktiven' : 'Neaktiven'}</Badge>{canEdit && <><button className="icon-button" aria-label="Uredi artikel" title="Uredi podatke artikla" onClick={() => setEditProduct(product)}><Pencil size={18} /></button><button className="icon-button danger-text" disabled={busy} aria-label={product.visible ? 'Skrij artikel' : 'Obnovi artikel'} title={product.visible ? 'Skrij artikel iz seznama' : 'Obnovi skriti artikel'} onClick={() => toggle('products',product)}>{product.visible ? <EyeOff size={18} /> : <RotateCcw size={18} />}</button></>}</div>
    {canEdit && (bulk || product.visible) && <button className="button success small" title={bulk ? 'Poveži postopek z vsemi izbranimi artikli' : 'Poveži nov kontrolni postopek z artiklom'} onClick={() => { setError(''); setProcedureId(available[0]?.id ?? NEW_ID); setAdding(true); }}><Plus size={17} /> {bulk ? `Dodaj postopek (${targets.length})` : 'Dodaj postopek'}</button>}</div></div>
    <div className="section-bar"><h3><Link2 size={18} /> Kontrolni postopki</h3><Badge title="Število prikazanih kontrolnih postopkov">{links.length}</Badge></div>
    {error && <div className="alert danger" role="alert">{error}</div>}<div className={`table-scroll ${links.length ? 'link-scroll' : ''}`}><table><thead><tr><th>Red</th><th>Postopek</th><th>Meje / enota</th><th>Zahteve</th><th>Dejanja</th></tr></thead><tbody>{links.map(l => { const p = store.procedures.find(p => p.id === l.procedure_id); return <tr key={l.id} className={!l.visible ? 'muted-row' : ''}><td><span className="order-number">{l.sort_order}</span></td><td><button className="text-link" title="Odpri nastavitve povezave s postopkom" onClick={() => setEditLink(l)}>{p?.name ?? 'Neznan postopek'}</button><span className="cell-sub">{p?.code} · {p && lookupName(store.inputTypes,p.input_type_id)}{!l.visible ? ' · Skrit' : !l.active ? ' · Neaktiven' : ''}{p && !procedureActive(store,p) ? ' · Postopek ni aktiven' : ''}</span></td><td>{p && lookupCode(store.inputTypes,p.input_type_id) === 'VEC_MERITEV' ? <>{linkMeasurements(store,l.id).length} meritev<span className="cell-sub">{linkMeasurements(store,l.id).map(m => m.name).join(', ') || 'Meritve niso določene'}</span></> : <>{l.min_value ?? '—'} / {l.max_value ?? '—'}<span className="cell-sub">{l.measurement_name ? `${l.measurement_name} · ` : ''}{l.unit_override || p?.default_unit || 'Brez enote'}</span></>}</td><td><div className="badge-stack"><Badge>{l.required ? 'Obvezen' : 'Neobvezen'}</Badge>{l.poka_yoke && <Badge tone="warning">Poka-yoke</Badge>}{l.photo_required && <Badge tone="warning">Fotografija</Badge>}</div></td><td><div className="row-actions"><button className="icon-button" aria-label={`Uredi povezavo ${p?.code}`} title="Uredi nastavitve povezave s postopkom" onClick={() => setEditLink(l)}><Pencil size={17} /></button>{canEdit && <button disabled={busy} className="icon-button danger-text" aria-label={`${l.visible ? 'Skrij' : 'Obnovi'} povezavo ${p?.code}`} title={l.visible ? 'Skrij povezavo s postopkom' : 'Obnovi skrito povezavo'} onClick={() => toggle('links',l)}>{l.visible ? <EyeOff size={17} /> : <RotateCcw size={17} />}</button>}</div></td></tr>; })}</tbody></table></div>{!links.length && <Empty title="Artikel še nima kontrolnih postopkov">Dodajte kontrolne točke, ki jih zahteva razvoj.</Empty>}<div className="panel-note">Navodila in enote se privzeto prevzamejo iz postopka. Tukaj jih lahko prilagodite izbranemu artiklu.</div></> : <Empty title="Izberite artikel">Za urejanje postopkov izberite artikel na seznamu.</Empty>}</section></div>
    {adding && <Modal title="Dodaj kontrolni postopek" subtitle={bulk ? `Izbranih artiklov: ${targets.length}` : product?.name} onClose={() => !busy && setAdding(false)}><form onSubmit={addLink}><div className="modal-body">{available.length ? <Field label="Kontrolni postopek" hint={bulk ? 'Artikli, ki postopek že imajo, ostanejo nespremenjeni. Meje nato uredite pri posameznem artiklu.' : undefined}><select required disabled={busy} value={procedureId} onChange={e => setProcedureId(Number(e.target.value))}>{available.map(p => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></Field> : <Empty title="Vsi postopki so že povezani">Ustvarite nov postopek v definicijah.</Empty>}
      {bulk && <div className="selected-products">{targets.map(t => <Badge key={t.id} tone={linked(t.id,procedureId) ? 'neutral' : 'orange'} title={linked(t.id,procedureId) ? 'Artikel že ima ta postopek' : t.name}>{t.code}{linked(t.id,procedureId) ? ' · že povezan' : ''}</Badge>)}</div>}
      {error && <div className="alert danger" role="alert">{error}</div>}</div><footer className="modal-footer"><button type="button" className="button" title="Prekliči dodajanje postopka" disabled={busy} onClick={() => setAdding(false)}>Prekliči</button><button className="button success" title={bulk ? 'Poveži postopek z izbranimi artikli' : 'Poveži izbrani postopek z artiklom'} disabled={busy || !procedureId || !available.length}>{busy ? 'Shranjujem ...' : bulk ? `Poveži z ${withProducts(targets.filter(t => !linked(t.id,procedureId)).length)}` : 'Nastavi povezavo'}</button></footer></form></Modal>}
    {editProduct && <ProductEditor value={editProduct} onClose={() => setEditProduct(null)} onSaved={finish} />}
    {editLink && <LinkEditor value={editLink} store={store} canEdit={canEdit} onClose={() => setEditLink(null)} onSaved={finish} />}
  </>;
}
function ProductEditor({ value, onClose, onSaved }: { value: Product; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft,setDraft] = useState(value), [busy,setBusy] = useState(false), [error,setError] = useState('');
  function close() { if (!busy && (JSON.stringify(draft) === JSON.stringify(value) || confirm('Zapustite obrazec brez shranjevanja?'))) onClose(); }
  async function save(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { await saveRecord('products',draft); await onSaved(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <Modal title={value.name ? 'Uredi artikel' : 'Nov artikel'} onClose={close}><form onSubmit={save}><div className="modal-body"><fieldset className="form-grid" disabled={busy}><Field label="Naziv *"><input required value={draft.name} onChange={e => setDraft({...draft,name:e.target.value})} /></Field><Field label="Šifra *"><input required value={draft.code} onChange={e => setDraft({...draft,code:e.target.value})} /></Field><div className="span-two"><Field label="Opomba"><textarea value={draft.note ?? ''} onChange={e => setDraft({...draft,note:e.target.value || null})} /></Field></div><label className="check"><input type="checkbox" checked={draft.active} onChange={e => setDraft({...draft,active:e.target.checked})} /> Aktiven artikel</label><label className="check"><input type="checkbox" checked={draft.manually_locked} onChange={e => setDraft({...draft,manually_locked:e.target.checked})} /> Ročno zaklenjen za sinhronizacijo</label></fieldset>{error && <div className="alert danger" role="alert">{error}</div>}</div><footer className="modal-footer"><button type="button" className="button" title="Prekliči in zapri obrazec" disabled={busy} onClick={close}>Prekliči</button><button className="button success" title="Shrani podatke artikla" disabled={busy}>{busy ? 'Shranjujem ...' : 'Shrani artikel'}</button></footer></form></Modal>;
}
const numberOrNull = (v: string) => v === '' ? null : Number(v);
function LinkEditor({ value, store, canEdit, onClose, onSaved }: { value: Link; store: Store; canEdit: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [initialRows] = useState(() => linkMeasurements(store, value.id));
  const [draft,setDraft] = useState(value), [rows,setRows] = useState<Measurement[]>(initialRows), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const p = store.procedures.find(p => p.id === draft.procedure_id)!;
  const type = lookupCode(store.inputTypes,p.input_type_id);
  const set = <K extends keyof Link>(k: K, v: Link[K]) => setDraft(d => ({...d,[k]:v}));
  const setRow = <K extends keyof Measurement>(id: Id, k: K, v: Measurement[K]) => setRows(r => r.map(m => m.id === id ? {...m,[k]:v} : m));
  const addRow = () => setRows(r => [...r, { id: Math.min(NEW_ID, ...r.map(m => m.id)) - 1, link_id: draft.id, name: '', unit: null, nominal_value: null, min_value: null, max_value: null, sort_order: Math.max(0, ...r.map(m => m.sort_order)) + 10, visible: true }]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value) || JSON.stringify(rows) !== JSON.stringify(initialRows);
  function close() { if (!busy && (!dirty || confirm('Zapustite obrazec brez shranjevanja?'))) onClose(); }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (type === 'VEC_MERITEV' && !rows.length) throw new Error('Dodajte vsaj eno meritev.');
      const saved = await saveRecord('links',draft);
      if (type === 'VEC_MERITEV') {
        // Removed rows are hidden, never deleted.
        const removed = initialRows.filter(m => !rows.some(r => r.id === m.id)).map(m => ({...m,visible:false}));
        const changed = rows.filter(r => JSON.stringify(r) !== JSON.stringify(initialRows.find(m => m.id === r.id))).map(r => ({...r,link_id:saved.id}));
        if (removed.length || changed.length) await saveRecords('measurements',[...changed,...removed]);
      }
      await onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Modal wide title="Nastavitve povezave" subtitle={`${p.code} · ${p.name}`} onClose={close}><form onSubmit={save}><div className="modal-body"><fieldset className="form-grid" disabled={!canEdit || busy}>
    <Field label="Vrstni red *"><input required type="number" min="0" step="1" value={draft.sort_order} onChange={e => set('sort_order',Number(e.target.value))} /></Field>
    {type === 'VEC_MERITEV' ? <Field label="Tip vnosa" hint="Enote in meje se določijo za vsako meritev posebej."><input readOnly className="locked" value={lookupName(store.inputTypes,p.input_type_id)} /></Field>
      : <Field label="Enota za artikel" hint={`Privzeto: ${p.default_unit || 'brez enote'}`}><input value={draft.unit_override ?? ''} onChange={e => set('unit_override',e.target.value || null)} /></Field>}
    <div className="span-two instruction-preview"><span>Izvirno navodilo postopka</span><p>{p.instruction}</p></div>
    <div className="span-two"><Field label="Navodilo za izbrani artikel" hint="Prazno polje uporabi izvirno navodilo."><textarea rows={3} value={draft.instruction_override ?? ''} placeholder={p.instruction} onChange={e => set('instruction_override',e.target.value || null)} /></Field></div>
    {type === 'MERITEV' && <>
      <div className="span-two"><Field label="Ime meritve" hint="Npr. U, I grelca, temperatura motorja."><input value={draft.measurement_name ?? ''} placeholder={p.name} onChange={e => set('measurement_name',e.target.value || null)} /></Field></div>
      <Field label="Nominalna vrednost"><input type="number" step="any" value={draft.nominal_value ?? ''} onChange={e => set('nominal_value',numberOrNull(e.target.value))} /></Field>
      <div />
      <Field label="Minimalna vrednost"><input type="number" step="any" value={draft.min_value ?? ''} onChange={e => set('min_value',numberOrNull(e.target.value))} /></Field>
      <Field label="Maksimalna vrednost"><input type="number" step="any" value={draft.max_value ?? ''} onChange={e => set('max_value',numberOrNull(e.target.value))} /></Field>
    </>}
    {type === 'VEC_MERITEV' && <div className="span-two measurement-editor">
      <div className="measurement-head"><strong>Meritve za ta artikel</strong><button type="button" className="button success small" title="Dodaj novo meritev za ta artikel" onClick={addRow}><Plus size={15} /> Dodaj meritev</button></div>
      {p.internal_note && <p className="measurement-hint">{p.internal_note}</p>}
      {rows.length ? <div className="table-scroll"><table className="dense-table measurement-table"><thead><tr><th>Ime meritve</th><th>Enota</th><th>Nominalno</th><th>Min</th><th>Max</th><th><span className="sr-only">Dejanja</span></th></tr></thead><tbody>{rows.map((m,i) => <tr key={m.id}>
        <td><input required aria-label={`Ime meritve ${i+1}`} placeholder="npr. Bl" value={m.name} onChange={e => setRow(m.id,'name',e.target.value)} /></td>
        <td><input aria-label={`Enota meritve ${i+1}`} placeholder="A" value={m.unit ?? ''} onChange={e => setRow(m.id,'unit',e.target.value || null)} /></td>
        <td><input type="number" step="any" aria-label={`Nominalna vrednost meritve ${i+1}`} value={m.nominal_value ?? ''} onChange={e => setRow(m.id,'nominal_value',numberOrNull(e.target.value))} /></td>
        <td><input type="number" step="any" aria-label={`Minimum meritve ${i+1}`} value={m.min_value ?? ''} onChange={e => setRow(m.id,'min_value',numberOrNull(e.target.value))} /></td>
        <td><input type="number" step="any" aria-label={`Maksimum meritve ${i+1}`} value={m.max_value ?? ''} onChange={e => setRow(m.id,'max_value',numberOrNull(e.target.value))} /></td>
        <td><button type="button" className="icon-button danger-text" aria-label={`Odstrani meritev ${i+1}`} title="Odstrani meritev s seznama" onClick={() => setRows(r => r.filter(x => x.id !== m.id))}><Trash2 size={15} /></button></td>
      </tr>)}</tbody></table></div> : <p className="measurement-hint">Dodajte vsaj eno meritev. Za vsako določite ime, enoto in meje.</p>}
    </div>}
    <Field label="Velja od"><input type="date" value={draft.valid_from ?? ''} onChange={e => set('valid_from',e.target.value || null)} /></Field>
    <Field label="Velja do"><input type="date" value={draft.valid_to ?? ''} onChange={e => set('valid_to',e.target.value || null)} /></Field>
    <label className="check" title="Obveznega koraka ni mogoče preskočiti"><input type="checkbox" checked={draft.required} onChange={e => set('required',e.target.checked)} /> Postopek je obvezen</label>
    <label className="check" title="Za nadaljevanje je potreben ustrezen rezultat"><input type="checkbox" checked={draft.poka_yoke} onChange={e => set('poka_yoke',e.target.checked)} /> Poka-yoke: zahteva ustrezen rezultat</label>
    <label className="check" title="Korak zahteva fotografijo"><input type="checkbox" checked={draft.photo_required} onChange={e => set('photo_required',e.target.checked)} /> Fotografija je obvezna</label>
    <label className="check" title="Neaktivna povezava se ne uporablja v testih"><input type="checkbox" checked={draft.active} onChange={e => set('active',e.target.checked)} /> Povezava je aktivna</label>
  </fieldset>{draft.photo_required && <div className="alert warning">Nalaganje fotografij še ni vključeno. Obvezna fotografija bo preprečila zaključek testa.</div>}{error && <div className="alert danger" role="alert">{error}</div>}</div>
  <footer className="modal-footer"><button type="button" className="button" title={canEdit ? 'Prekliči in zapri obrazec' : 'Zapri obrazec'} disabled={busy} onClick={close}>{canEdit ? 'Prekliči' : 'Zapri'}</button>{canEdit && <button className="button success" title="Shrani nastavitve povezave" disabled={busy}>{busy ? 'Shranjujem ...' : 'Shrani povezavo'}</button>}</footer>
  </form></Modal>;
}
