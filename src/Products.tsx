import { useEffect, useRef, useState } from 'react';
import { Plus, Pencil, EyeOff, RotateCcw, Link2, Package, Trash2, AlertCircle, AlertTriangle, CheckCircle2, Clock, Undo2, Copy, Tags } from 'lucide-react';
import { Badge, Empty, Field, Modal, PageTitle, SearchBox, matches } from './components';
import { saveRecord, saveRecords } from './data';
import { linkMeasurements, procedureActive, procedureAffiliationIds, productStatus, linkFor, copyLinksPlan, templateLinks, typeAddPlan, typeProcedureRows, type ProductStatus } from './domain';
import { lookupCode, lookupName, lookupOptions } from './lookups';
import { NEW_ID } from './types';
import type { Id, Link, Measurement, Procedure, Product, Store } from './types';

type Props = { store: Store; canEdit: boolean; refresh: () => Promise<void>; notify: (message: string) => void };
const missingText = (n: number) => n === 1 ? '1 šifra nima' : n === 2 ? '2 šifri nimata' : n < 5 ? `${n} šifre nimajo` : `${n} šifer nima`;
// Missing first, so new šifre from the sync without procedures are seen at once.
const statuses: { key: ProductStatus; label: string; tone: 'danger' | 'warning' | 'success'; hint: string; Icon: typeof Clock }[] = [
  { key: 'missing', label: 'Manjka', tone: 'danger', hint: 'Šifra nima kontrolnih postopkov', Icon: AlertCircle },
  { key: 'in_progress', label: 'V delu', tone: 'warning', hint: 'Kontrolni postopki so še v izdelavi', Icon: Clock },
  { key: 'ready', label: 'Pripravljeno', tone: 'success', hint: 'Šifra je pripravljena za proizvodnjo', Icon: CheckCircle2 },
];
const statusInfo = (key: ProductStatus) => statuses.find(s => s.key === key)!;
export function StatusBadge({ status }: { status: ProductStatus }) { const s = statusInfo(status); return <Badge tone={s.tone} title={s.hint}><s.Icon size={12} strokeWidth={2.4} />{s.label}</Badge>; }
export default function Products({ store, canEdit, refresh, notify }: Props) {
  const [query, setQuery] = useState(''), [selected, setSelected] = useState<Id>(store.products.find(p => p.visible)?.id ?? NEW_ID), [hidden, setHidden] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null), [editLink, setEditLink] = useState<Link | null>(null), [adding, setAdding] = useState(false), [copying, setCopying] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [checked, setChecked] = useState<Id[]>([]);
  const product = store.products.find(p => p.id === selected);
  // Filter by oven type (pripadnost peči); NEW_ID stands for ovens without a type.
  const [typeFilter, setTypeFilter] = useState<Id[]>([]), [assigning, setAssigning] = useState(false);
  const typeName = (id: Id | null) => store.ovenTypes.find(t => t.id === id)?.name;
  const typeCount = (id: Id) => store.products.filter(p => p.visible && (p.oven_type_id ?? NEW_ID) === id).length;
  const toggleType = (id: Id) => setTypeFilter(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
  const [statusFilter, setStatusFilter] = useState<ProductStatus[]>([]);
  const statusOf = (p: Product) => productStatus(store,p), order = (p: Product) => statuses.findIndex(s => s.key === statusOf(p));
  const statusCount = (key: ProductStatus) => store.products.filter(p => p.visible && statusOf(p) === key).length, missingCount = statusCount('missing');
  const toggleStatus = (key: ProductStatus) => setStatusFilter(f => f.includes(key) ? f.filter(x => x !== key) : [...f, key]);
  const products = store.products.filter(p => (p.visible || hidden) && matches(query,p.name,p.code) && (!typeFilter.length || typeFilter.includes(p.oven_type_id ?? NEW_ID)) && (!statusFilter.length || statusFilter.includes(statusOf(p))))
    .sort((a,b) => order(a) - order(b));
  const links = store.links.filter(l => l.product_id === selected && (l.visible || hidden)).sort((a,b) => a.sort_order - b.sort_order);
  // With checked products the new procedure is linked to all of them; otherwise only to the open product.
  const bulk = checked.length > 0;
  const targets = bulk ? store.products.filter(p => p.visible && checked.includes(p.id)) : product ? [product] : [];
  const linked = (productId: Id, procedureId: Id) => store.links.some(l => l.product_id === productId && l.procedure_id === procedureId && l.visible);
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
  async function setReady(p: Product, ready: boolean) {
    setBusy(true); setError('');
    try { await saveRecord('products', { ...p, ready_for_production: ready }); await refresh(); notify(ready ? `Šifra ${p.code} je pripravljena za proizvodnjo.` : `Šifra ${p.code} je vrnjena v delo.`); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const finish = async () => { await refresh(); setEditProduct(null); setEditLink(null); setAdding(false); notify('Spremembe so shranjene.'); };
  function addProduct() { setEditProduct({ id: NEW_ID, name: '', code: '', active: true, source: 'manual', last_synced_at: null, sync_status: null, manually_locked: false, ready_for_production: false, oven_type_id: null, note: null, visible: true }); }
  async function toggle(kind: 'products' | 'links', record: Product | Link) {
    if (!confirm(record.visible ? 'Skrijete zapis? Povezave in pretekli rezultati bodo ohranjeni.' : 'Obnovite zapis?')) return;
    setBusy(true); setError('');
    try { if (kind === 'products') await saveRecord(kind, { ...(record as Product), visible: !record.visible }); else await saveRecord(kind, { ...(record as Link), visible: !record.visible }); await refresh(); notify(record.visible ? 'Zapis je skrit.' : 'Zapis je obnovljen.'); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function run(action: () => Promise<string>) {
    setBusy(true); setError('');
    try { const message = await action(); await refresh(); setAdding(false); setCopying(false); notify(message); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function addLinks(ids: Id[], typeIds: Id[]) {
    const procs = store.procedures.filter(p => ids.includes(p.id));
    if (typeIds.length) {
      const plan = typeAddPlan(store,typeIds,procs);
      return run(async () => { await saveRecords('typeProcedures',plan.rows); await saveRecords('links',plan.links); return `Testni postopek: dodanih ${plan.rows.length}, povezav na pečeh: ${plan.links.length}.`; });
    }
    // One procedure on one product opens its settings right away, as before.
    if (!bulk && procs.length === 1) { setAdding(false); setEditLink(linkFor(store,targets[0],procs[0])); return; }
    const records = targets.flatMap(t => procs.filter(p => !linked(t.id,p.id)).map(p => linkFor(store,t,p)));
    return run(async () => { await saveRecords('links',records); return `Dodanih povezav: ${records.length}.`; });
  }
  function copyLinks(sourceId: Id) {
    const plan = copyLinksPlan(store,sourceId,targets), source = store.products.find(p => p.id === sourceId);
    return run(async () => {
      const saved = await saveRecords('links',plan.links);
      const rows = [...plan.hidden, ...plan.measurements.flatMap((ms,i) => ms.map(m => ({ ...m, link_id: saved[i].id })))];
      if (rows.length) await saveRecords('measurements',rows);
      return `Kopiranih povezav s šifre ${source?.code}: ${plan.links.length}.`;
    });
  }
  function assignType(typeId: Id | null) {
    return run(async () => {
      const saved = await saveRecords('products',targets.map(t => ({ ...t, oven_type_id: typeId })));
      const records = saved.flatMap(p => templateLinks(store,p));
      await saveRecords('links',records);
      setAssigning(false);
      return `Tip peči nastavljen za ${saved.length} šifer, dodanih povezav: ${records.length}.`;
    });
  }
  // Only products in progress can be confirmed; products without procedures are skipped.
  const readyTargets = targets.filter(t => statusOf(t) === 'in_progress');
  const setReadyMany = () => run(async () => { await saveRecords('products',readyTargets.map(t => ({ ...t, ready_for_production: true }))); return `Pripravljenih šifer: ${readyTargets.length}.`; });
  return <>
    <PageTitle eyebrow="Nastavitve programov" title="Povezave postopkov in izdelkov" description="Izberite artikel in določite kontrolne točke, njihov vrstni red ter meje meritev." action={canEdit && <button className="button success" title="Dodaj nov artikel" onClick={addProduct}><Plus size={18} /> Nov artikel</button>} />
    {missingCount > 0 && <div className="alert warning product-warning" role="status"><AlertTriangle size={20} /><span><strong>{missingText(missingCount)} kontrolnih postopkov.</strong> Vsaka nova šifra mora takoj dobiti postopke. Šifre brez postopkov so označene s klicajem in prikazane na vrhu seznama.</span>{!(statusFilter.length === 1 && statusFilter[0] === 'missing') && <button className="button small" title="Prikaži samo šifre brez postopkov" onClick={() => setStatusFilter(['missing'])}>Prikaži šifre</button>}</div>}
    <div className="product-layout"><section className="panel product-list"><div className="panel-heading"><h2><Package size={19} /> Artikli</h2><Badge>{store.products.filter(p => p.visible).length}</Badge></div><div className="product-search"><SearchBox value={query} onChange={setQuery} placeholder="Poiščite artikel ali šifro ..." /><div className="product-filter"><div className="product-filter-head"><span>Status</span>{statusFilter.length > 0 && <button className="text-link" title="Počisti filter po statusu" onClick={() => setStatusFilter([])}>Počisti</button>}</div><div className="choice-chips" role="group" aria-label="Filter po statusu">{statuses.map(s => <label key={s.key} className={`choice-chip status-chip ${s.tone} ${statusFilter.includes(s.key) ? 'checked' : ''}`} title={`${statusFilter.includes(s.key) ? 'Odstrani' : 'Prikaži'} šifre s statusom ${s.label}`}><input type="checkbox" checked={statusFilter.includes(s.key)} onChange={() => toggleStatus(s.key)} /><span className="status-dot" />{s.label} <small>{statusCount(s.key)}</small></label>)}</div></div><div className="product-filter"><div className="product-filter-head"><span>Tip peči</span>{typeFilter.length > 0 && <button className="text-link" title="Počisti filter po tipu peči" onClick={() => setTypeFilter([])}>Počisti</button>}</div><div className="choice-chips" role="group" aria-label="Filter po tipu peči">{[...lookupOptions(store.ovenTypes), { id: NEW_ID, name: 'Brez tipa' }].map(t => <label key={t.id} className={`choice-chip ${typeFilter.includes(t.id) ? 'checked' : ''}`} title={`${typeFilter.includes(t.id) ? 'Odstrani' : 'Prikaži'} peči tipa ${t.name}`}><input type="checkbox" checked={typeFilter.includes(t.id)} onChange={() => toggleType(t.id)} />{t.name} <small>{typeCount(t.id)}</small></label>)}</div></div><label className="check"><input type="checkbox" checked={hidden} onChange={e => setHidden(e.target.checked)} /> Prikaži skrite zapise</label></div>
    {canEdit && <div className="product-bulk"><label className="check" title={allShown ? 'Odznači vse prikazane artikle' : 'Označi vse prikazane artikle'}><input type="checkbox" checked={allShown} disabled={!shown.length} onChange={toggleAll} /> {bulk ? `Izbranih artiklov: ${checked.length}` : 'Izberi več artiklov'}</label>{bulk && <button className="text-link" title="Počisti izbor vseh artiklov" onClick={() => setChecked([])}>Počisti</button>}</div>}
    <div className="product-list-items" ref={listRef} onKeyDown={moveSelection} title="Drsite ali uporabite puščici gor in dol">{products.map(p => <div key={p.id} className={`product-item ${selected === p.id ? 'selected' : ''} ${checked.includes(p.id) ? 'checked' : ''} ${p.visible && statusOf(p) === 'missing' ? 'missing' : ''}`}>{canEdit && <label className="product-check" title={p.visible ? `Označi artikel ${p.code} za skupno dodajanje` : 'Skritega artikla ni mogoče označiti'}><input type="checkbox" aria-label={`Označi artikel ${p.code}`} disabled={!p.visible} checked={checked.includes(p.id)} onChange={() => toggleCheck(p.id)} /></label>}<button className="product-option" title={`Prikaži kontrolne postopke artikla ${p.code}`} onClick={() => setSelected(p.id)}><div><strong>{p.name}</strong><span>{p.code}{!p.visible ? ' · Skrit' : !p.active ? ' · Neaktiven' : ''}{p.oven_type_id ? ` · ${typeName(p.oven_type_id)}` : ''}</span></div><StatusBadge status={statusOf(p)} /></button></div>)}</div>{!products.length && <Empty title="Ni artiklov" />}<div className="product-list-footer" title="Število prikazanih artiklov glede na filter"><span>Prikazanih {products.length} od {store.products.filter(p => p.visible || hidden).length}</span>{bulk && <span>Izbranih {checked.length}</span>}</div></section>
    <section className="panel product-details">{product ? <><div className="product-header"><div><span className="eyebrow">{product.code}</span><h2>{product.name}</h2><p>{links.filter(l => l.visible).length} povezanih kontrolnih postopkov</p></div><div className="product-header-side"><div className="row-actions"><Badge tone={product.oven_type_id ? 'orange' : 'neutral'} title={product.oven_type_id ? 'Tip peči (pripadnost)' : 'Peč še nima tipa; nastavite ga v urejanju artikla'}>{typeName(product.oven_type_id) ?? 'Brez tipa'}</Badge><StatusBadge status={statusOf(product)} /><Badge tone={product.visible && product.active ? 'success' : 'neutral'}>{!product.visible ? 'Skrit' : product.active ? 'Aktiven' : 'Neaktiven'}</Badge>{canEdit && <><button className="icon-button" aria-label="Uredi artikel" title="Uredi podatke artikla" onClick={() => setEditProduct(product)}><Pencil size={18} /></button><button className="icon-button danger-text" disabled={busy} aria-label={product.visible ? 'Skrij artikel' : 'Obnovi artikel'} title={product.visible ? 'Skrij artikel iz seznama' : 'Obnovi skriti artikel'} onClick={() => toggle('products',product)}>{product.visible ? <EyeOff size={18} /> : <RotateCcw size={18} />}</button></>}</div>
    {canEdit && (bulk || product.visible) && <div className="row-actions header-buttons">{bulk
      ? <button className="button success small" disabled={busy || !readyTargets.length} title={readyTargets.length ? `Potrdi ${readyTargets.length} izbranih šifer za proizvodnjo` : 'Med izbranimi ni šifer s statusom V delu'} onClick={setReadyMany}><CheckCircle2 size={16} /> Pripravljeno ({readyTargets.length})</button>
      : statusOf(product) === 'ready'
      ? <button className="button small" disabled={busy} title="Vrni šifro v status V delu" onClick={() => setReady(product,false)}><Undo2 size={16} /> Vrni v delo</button>
      : <button className="button success small" disabled={busy || statusOf(product) === 'missing'} title={statusOf(product) === 'missing' ? 'Najprej dodajte kontrolne postopke' : 'Potrdi, da je šifra pripravljena za proizvodnjo'} onClick={() => setReady(product,true)}><CheckCircle2 size={16} /> Pripravljeno</button>}
      {bulk && <button className="button small" disabled={busy} title="Nastavi tip peči vsem izbranim šifram" onClick={() => { setError(''); setAssigning(true); }}><Tags size={16} /> Tip peči ({targets.length})</button>}
      <button className="button success small" title={bulk ? 'Kopiraj postopke druge šifre na izbrane šifre' : 'Kopiraj vse postopke z druge šifre'} onClick={() => { setError(''); setCopying(true); }}><Copy size={16} /> {bulk ? `Kopiraj postopke (${targets.length})` : 'Kopiraj postopke'}</button>
      <button className="button success small" title={bulk ? 'Poveži postopke z vsemi izbranimi artikli' : 'Poveži kontrolne postopke z artiklom'} onClick={() => { setError(''); setAdding(true); }}><Plus size={17} /> {bulk ? `Dodaj postopke (${targets.length})` : 'Dodaj postopke'}</button></div>}</div></div>
    {product.visible && statusOf(product) === 'missing' && <div className="alert warning product-missing" role="status"><AlertCircle size={18} />Ta šifra nima kontrolnih postopkov in ni pripravljena za proizvodnjo. {product.oven_type_id ? 'Dodajte postopke ali jih dodajte v testni postopek tipa.' : 'Nastavite tip peči, da dobi testni postopek tipa, ali dodajte postopke.'}</div>}
    <div className="section-bar"><h3><Link2 size={18} /> Kontrolni postopki</h3><Badge title="Število prikazanih kontrolnih postopkov">{links.length}</Badge></div>
    {error && <div className="alert danger" role="alert">{error}</div>}<div className={`table-scroll ${links.length ? 'link-scroll' : ''}`}><table><thead><tr><th>Red</th><th>Postopek</th><th>Meje / enota</th><th>Zahteve</th><th>Dejanja</th></tr></thead><tbody>{links.map(l => { const p = store.procedures.find(p => p.id === l.procedure_id); return <tr key={l.id} className={!l.visible ? 'muted-row' : ''}><td><span className="order-number">{l.sort_order}</span></td><td><button className="text-link" title="Odpri nastavitve povezave s postopkom" onClick={() => setEditLink(l)}>{p?.name ?? 'Neznan postopek'}</button><span className="cell-sub">{p?.code} · {p && lookupName(store.inputTypes,p.input_type_id)}{!l.visible ? ' · Skrit' : !l.active ? ' · Neaktiven' : ''}{p && !procedureActive(store,p) ? ' · Postopek ni aktiven' : ''}</span></td><td>{p && lookupCode(store.inputTypes,p.input_type_id) === 'VEC_MERITEV' ? <>{linkMeasurements(store,l.id).length} meritev<span className="cell-sub">{linkMeasurements(store,l.id).map(m => m.name).join(', ') || 'Meritve niso določene'}</span></> : <>{l.min_value ?? '—'} / {l.max_value ?? '—'}<span className="cell-sub">{l.measurement_name ? `${l.measurement_name} · ` : ''}{l.unit_override || p?.default_unit || 'Brez enote'}</span></>}</td><td><div className="badge-stack"><Badge>{l.required ? 'Obvezen' : 'Neobvezen'}</Badge>{l.poka_yoke && <Badge tone="warning">Poka-yoke</Badge>}{l.photo_required && <Badge tone="warning">Fotografija</Badge>}</div></td><td><div className="row-actions"><button className="icon-button" aria-label={`Uredi povezavo ${p?.code}`} title="Uredi nastavitve povezave s postopkom" onClick={() => setEditLink(l)}><Pencil size={17} /></button>{canEdit && <button disabled={busy} className="icon-button danger-text" aria-label={`${l.visible ? 'Skrij' : 'Obnovi'} povezavo ${p?.code}`} title={l.visible ? 'Skrij povezavo s postopkom' : 'Obnovi skrito povezavo'} onClick={() => toggle('links',l)}>{l.visible ? <EyeOff size={17} /> : <RotateCcw size={17} />}</button>}</div></td></tr>; })}</tbody></table></div>{!links.length && <Empty title="Artikel še nima kontrolnih postopkov">Dodajte kontrolne točke, ki jih zahteva razvoj.</Empty>}<div className="panel-note">Navodila in enote se privzeto prevzamejo iz postopka. Tukaj jih lahko prilagodite izbranemu artiklu.</div></> : <Empty title="Izberite artikel">Za urejanje postopkov izberite artikel na seznamu.</Empty>}</section></div>
    {adding && <ProcedurePicker store={store} targets={targets} busy={busy} error={error} onClose={() => !busy && setAdding(false)} onSubmit={addLinks} />}
    {assigning && <TypeAssign store={store} targets={targets} busy={busy} error={error} onClose={() => !busy && setAssigning(false)} onSubmit={assignType} />}
    {copying && <CopyLinks store={store} targets={targets} busy={busy} error={error} onClose={() => !busy && setCopying(false)} onSubmit={copyLinks} />}
    {editProduct && <ProductEditor store={store} value={editProduct} onClose={() => setEditProduct(null)} onSaved={finish} />}
    {editLink && <LinkEditor value={editLink} store={store} canEdit={canEdit} onClose={() => setEditLink(null)} onSaved={finish} />}
  </>;
}
type DialogProps = { store: Store; targets: Product[]; busy: boolean; error: string; onClose: () => void };
/**
 * Several procedures at once, with search and the same filters as the procedure definitions.
 * "Tipi peči" adds them to the test procedure of the chosen oven types and to every oven of those types.
 */
export function ProcedurePicker({ store, targets, initialTypes = [], fixedTypes = false, busy, error, onClose, onSubmit }: DialogProps & { initialTypes?: Id[]; fixedTypes?: boolean; onSubmit: (ids: Id[], typeIds: Id[]) => void }) {
  const firstAff = store.ovenTypes.find(t => t.id === initialTypes[0])?.affiliation_id;
  const [query,setQuery] = useState(''), [aff,setAff] = useState(fixedTypes && firstAff ? String(firstAff) : ''), [group,setGroup] = useState(''), [picked,setPicked] = useState<Id[]>([]);
  const [mode,setMode] = useState<'products' | 'types'>(fixedTypes || initialTypes.length || !targets.length ? 'types' : 'products'), [typeIds,setTypeIds] = useState<Id[]>(initialTypes);
  const multi = targets.length > 1, allId = store.affiliations.find(a => a.code === 'ALL')?.id;
  const linked = (productId: Id, procedureId: Id) => store.links.some(l => l.product_id === productId && l.procedure_id === procedureId && l.visible);
  const inType = (typeId: Id, procedureId: Id) => store.typeProcedures.some(r => r.oven_type_id === typeId && r.procedure_id === procedureId && r.visible);
  const ovens = (typeId: Id) => store.products.filter(p => p.visible && p.oven_type_id === typeId);
  const missingFor = (p: Procedure) => targets.filter(t => !linked(t.id,p.id)).length;
  const typesWith = (p: Procedure) => typeIds.filter(t => inType(t,p.id)).length;
  const available = store.procedures.filter(p => p.visible && (mode === 'types' ? !typeIds.length || typesWith(p) < typeIds.length : missingFor(p) > 0)).sort((a,b) => a.default_order - b.default_order);
  // An affiliation filter also shows procedures for ALL, they apply to every oven.
  const shown = available.filter(p => matches(query,p.code,p.name) && (!group || p.group_id === Number(group)) && (!aff || procedureAffiliationIds(store,p.id).some(id => id === Number(aff) || id === allId)));
  const allShown = shown.length > 0 && shown.every(p => picked.includes(p.id));
  const toggle = (id: Id) => setPicked(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);
  const toggleAll = () => setPicked(c => allShown ? c.filter(id => !shown.some(p => p.id === id)) : [...new Set([...c, ...shown.map(p => p.id)])]);
  const toggleType = (id: Id) => setTypeIds(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);
  const affs = (p: Procedure) => lookupOptions(store.affiliations).filter(a => procedureAffiliationIds(store,p.id).includes(a.id)).map(a => a.name).join(', ');
  const ovenCount = typeIds.reduce((n,t) => n + ovens(t).length, 0), typeNames = store.ovenTypes.filter(t => typeIds.includes(t.id)).map(t => t.name).join(', ');
  const subtitle = mode === 'types' ? (typeNames ? `Testni postopek: ${typeNames}` : 'Izberite tipe peči') : multi ? `Izbranih šifer: ${targets.length}` : targets[0]?.name;
  const note = (p: Procedure) => mode === 'types' ? (typesWith(p) ? ` · že v ${typesWith(p)} tipih` : '') : multi && missingFor(p) < targets.length ? ` · že povezan pri ${targets.length - missingFor(p)} šifrah` : '';
  return <Modal wide title="Dodaj kontrolne postopke" subtitle={subtitle} onClose={onClose}><form onSubmit={e => { e.preventDefault(); onSubmit(picked, mode === 'types' ? typeIds : []); }}><div className="modal-body">
    {!fixedTypes && <div className="pick-target"><span>Dodaj na</span><div className="choice-chips" role="radiogroup" aria-label="Kam dodam postopke">
      {targets.length > 0 && <label className={`choice-chip ${mode === 'products' ? 'checked' : ''}`} title="Dodaj postopke izbranim šifram"><input type="radio" name="pick-mode" checked={mode === 'products'} onChange={() => setMode('products')} />{multi ? `Izbrane šifre (${targets.length})` : `Šifro ${targets[0].code}`}</label>}
      <label className={`choice-chip ${mode === 'types' ? 'checked' : ''}`} title="Dodaj postopke tipom peči in vsem njihovim pečem"><input type="radio" name="pick-mode" checked={mode === 'types'} onChange={() => setMode('types')} />Tipe peči</label></div></div>}
    {!fixedTypes && mode === 'types' && <div className="pick-types choice-chips" role="group" aria-label="Tipi peči">{lookupOptions(store.ovenTypes).map(t => <label key={t.id} className={`choice-chip ${typeIds.includes(t.id) ? 'checked' : ''}`} title={`${typeIds.includes(t.id) ? 'Odstrani' : 'Izberi'} tip peči ${t.name} (${ovens(t.id).length} peči)`}><input type="checkbox" checked={typeIds.includes(t.id)} onChange={() => toggleType(t.id)} />{t.name} <small>{ovens(t.id).length}</small></label>)}</div>}
    {available.length ? <>
      <div className="pick-tools"><SearchBox value={query} onChange={setQuery} placeholder="Poiščite postopek ali kodo ..." />
        <select value={aff} aria-label="Pripadnost" title="Filtriraj postopke po pripadnosti" onChange={e => setAff(e.target.value)}><option value="">Vse pripadnosti</option>{lookupOptions(store.affiliations).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <select value={group} aria-label="Skupina" title="Filtriraj postopke po skupini" onChange={e => setGroup(e.target.value)}><option value="">Vse skupine</option>{lookupOptions(store.groups).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
      <div className="pick-head"><label className="check" title={allShown ? 'Odznači vse prikazane postopke' : 'Izberi vse prikazane postopke'}><input type="checkbox" checked={allShown} disabled={!shown.length} onChange={toggleAll} /> Izberi vse prikazane ({shown.length})</label><span>Izbranih: {picked.length}</span></div>
      <div className="pick-list">{shown.map(p => <label key={p.id} className={`pick-row ${picked.includes(p.id) ? 'checked' : ''}`} title={`${picked.includes(p.id) ? 'Odstrani' : 'Izberi'} postopek ${p.code}`}><input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} /><span><strong>{p.code} · {p.name}</strong><small>{lookupName(store.groups,p.group_id)} · {lookupName(store.inputTypes,p.input_type_id)}{affs(p) ? ` · ${affs(p)}` : ''}{note(p)}</small></span></label>)}
        {!shown.length && <p className="pick-empty">Noben postopek ne ustreza filtrom.</p>}</div>
      <p className="pick-hint">{mode === 'types' ? `Postopki se dodajo v testni postopek izbranih tipov in vsem pečem teh tipov (zdaj ${ovenCount}). Peči, ki jim tip nastavite kasneje, jih dobijo samodejno.` : multi || picked.length > 1 ? 'Postopki se dodajo s privzetimi nastavitvami. Meje in meritve nato uredite pri posamezni šifri. Obstoječe povezave ostanejo nespremenjene.' : 'Pri enem postopku na eni šifri se takoj odprejo njegove nastavitve.'}</p>
    </> : <Empty title="Vsi postopki so že dodani">Ustvarite nov postopek v definicijah.</Empty>}
    {error && <div className="alert danger" role="alert">{error}</div>}</div>
    <footer className="modal-footer"><button type="button" className="button" title="Prekliči dodajanje postopkov" disabled={busy} onClick={onClose}>Prekliči</button><button className="button success" title={mode === 'types' ? 'Dodaj izbrane postopke tipom peči in njihovim pečem' : 'Poveži izbrane postopke s šiframi'} disabled={busy || !picked.length || (mode === 'types' && !typeIds.length)}>{busy ? 'Shranjujem ...' : `Dodaj izbrane (${picked.length})`}</button></footer>
  </form></Modal>;
}
/** Sets the oven type of the checked products; they get the test procedure of the type. */
function TypeAssign({ store, targets, busy, error, onClose, onSubmit }: DialogProps & { onSubmit: (typeId: Id | null) => void }) {
  const [typeId,setTypeId] = useState('');
  const type = store.ovenTypes.find(t => t.id === Number(typeId)), count = type ? typeProcedureRows(store,type.id).length : 0;
  return <Modal title="Nastavi tip peči" subtitle={`Izbranih šifer: ${targets.length}`} onClose={onClose}><form onSubmit={e => { e.preventDefault(); onSubmit(typeId === 'none' ? null : Number(typeId)); }}><div className="modal-body">
    <Field label="Tip peči (pripadnost)" hint="Šifre dobijo vse postopke testnega postopka tipa. Obstoječi postopki ostanejo nespremenjeni."><select required value={typeId} onChange={e => setTypeId(e.target.value)}><option value="" disabled>- izberi -</option>{lookupOptions(store.ovenTypes).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}<option value="none">Brez tipa</option></select></Field>
    {type && <div className="pick-summary" role="status">Testni postopek tipa {type.name} ima <strong>{count}</strong> postopkov.</div>}
    <div className="selected-products">{targets.map(t => <Badge key={t.id} tone="orange" title={t.name}>{t.code}</Badge>)}</div>
    {error && <div className="alert danger" role="alert">{error}</div>}</div>
    <footer className="modal-footer"><button type="button" className="button" title="Prekliči nastavitev tipa peči" disabled={busy} onClick={onClose}>Prekliči</button><button className="button success" title="Shrani tip peči za izbrane šifre" disabled={busy || !typeId}>{busy ? 'Shranjujem ...' : 'Shrani tip'}</button></footer>
  </form></Modal>;
}
/** Copies all procedures of another šifra with limits and measurements. */
function CopyLinks({ store, targets, busy, error, onClose, onSubmit }: DialogProps & { onSubmit: (sourceId: Id) => void }) {
  const [query,setQuery] = useState(''), [source,setSource] = useState<Id>(NEW_ID);
  const count = (id: Id) => store.links.filter(l => l.product_id === id && l.visible).length;
  const sources = store.products.filter(p => p.visible && count(p.id) > 0 && !(targets.length === 1 && targets[0].id === p.id)).sort((a,b) => count(b.id) - count(a.id) || a.code.localeCompare(b.code));
  const shown = sources.filter(p => matches(query,p.name,p.code));
  const plan = source ? copyLinksPlan(store,source,targets) : null;
  const receivers = targets.filter(t => t.id !== source).length, existing = source ? count(source) * receivers - plan!.links.length : 0;
  return <Modal wide title="Kopiraj postopke z druge šifre" subtitle={targets.length > 1 ? `Izbranih šifer: ${targets.length}` : targets[0]?.name} onClose={onClose}><form onSubmit={e => { e.preventDefault(); onSubmit(source); }}><div className="modal-body">
    <p className="pick-hint first">Izberite šifro, katere postopke z vrstnim redom, mejami, navodili in meritvami želite prenesti. Postopki, ki jih šifra že ima, ostanejo nespremenjeni.</p>
    {sources.length ? <>
      <div className="pick-tools single"><SearchBox value={query} onChange={setQuery} placeholder="Poiščite šifro ali naziv ..." /></div>
      <div className="pick-list" role="radiogroup" aria-label="Šifra, s katere kopiramo">{shown.map(p => <label key={p.id} className={`pick-row ${source === p.id ? 'checked' : ''}`} title={`Kopiraj postopke s šifre ${p.code}`}><input type="radio" name="copy-source" checked={source === p.id} onChange={() => setSource(p.id)} /><span><strong>{p.name}</strong><small>{p.code} · {count(p.id)} postopkov</small></span><StatusBadge status={productStatus(store,p)} /></label>)}
        {!shown.length && <p className="pick-empty">Nobena šifra ne ustreza iskanju.</p>}</div>
      {plan && <div className="pick-summary" role="status">{plan.links.length ? <>Prenese se <strong>{plan.links.length}</strong> povezav{receivers > 1 ? ` na ${receivers} šifer` : ''}{plan.measurements.flat().length ? `, skupaj z ${plan.measurements.flat().length} meritvami` : ''}.</> : 'Vse šifre že imajo vse postopke izbrane šifre.'}{existing > 0 && ` Že obstaja: ${existing}.`}</div>}
    </> : <Empty title="Ni šifer s postopki">Najprej povežite postopke z vsaj eno šifro.</Empty>}
    {error && <div className="alert danger" role="alert">{error}</div>}</div>
    <footer className="modal-footer"><button type="button" className="button" title="Prekliči kopiranje postopkov" disabled={busy} onClick={onClose}>Prekliči</button><button className="button success" title="Kopiraj postopke izbrane šifre" disabled={busy || !plan?.links.length}>{busy ? 'Shranjujem ...' : `Kopiraj (${plan?.links.length ?? 0})`}</button></footer>
  </form></Modal>;
}
function ProductEditor({ store, value, onClose, onSaved }: { store: Store; value: Product; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft,setDraft] = useState(value), [busy,setBusy] = useState(false), [error,setError] = useState('');
  function close() { if (!busy && (JSON.stringify(draft) === JSON.stringify(value) || confirm('Zapustite obrazec brez shranjevanja?'))) onClose(); }
  async function save(e: React.FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { const saved = await saveRecord('products',draft); if (saved.oven_type_id !== value.oven_type_id) await saveRecords('links',templateLinks(store,saved)); await onSaved(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <Modal title={value.name ? 'Uredi artikel' : 'Nov artikel'} onClose={close}><form onSubmit={save}><div className="modal-body"><fieldset className="form-grid" disabled={busy}><Field label="Naziv *"><input required value={draft.name} onChange={e => setDraft({...draft,name:e.target.value})} /></Field><Field label="Šifra *"><input required value={draft.code} onChange={e => setDraft({...draft,code:e.target.value})} /></Field><div className="span-two"><Field label="Tip peči (pripadnost)" hint="Ob spremembi tipa šifra dobi postopke testnega postopka tipa."><select value={draft.oven_type_id ?? ''} onChange={e => setDraft({...draft,oven_type_id:e.target.value ? Number(e.target.value) : null})}><option value="">Brez tipa</option>{lookupOptions(store.ovenTypes,value.oven_type_id ?? undefined).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field></div><div className="span-two"><Field label="Opomba"><textarea value={draft.note ?? ''} onChange={e => setDraft({...draft,note:e.target.value || null})} /></Field></div><label className="check"><input type="checkbox" checked={draft.active} onChange={e => setDraft({...draft,active:e.target.checked})} /> Aktiven artikel</label><label className="check"><input type="checkbox" checked={draft.manually_locked} onChange={e => setDraft({...draft,manually_locked:e.target.checked})} /> Ročno zaklenjen za sinhronizacijo</label></fieldset>{error && <div className="alert danger" role="alert">{error}</div>}</div><footer className="modal-footer"><button type="button" className="button" title="Prekliči in zapri obrazec" disabled={busy} onClick={close}>Prekliči</button><button className="button success" title="Shrani podatke artikla" disabled={busy}>{busy ? 'Shranjujem ...' : 'Shrani artikel'}</button></footer></form></Modal>;
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
