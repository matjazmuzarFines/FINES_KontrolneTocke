import { useState } from 'react';
import { ChevronRight, EyeOff, Layers, ListChecks, Plus, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { Badge, Empty, PageTitle } from './components';
import { saveRecord, saveRecords } from './data';
import { ovenOf, ovensOf, productStatus, templateLinks, typeAddPlan, typeProcedureRows } from './domain';
import { kindAllowed, kindLabel, lookupName, lookupOptions } from './lookups';
import { ProcedurePicker, StatusBadge, ovenLabel } from './Products';
import { NEW_ID } from './types';
import type { CSSProperties } from 'react';
import type { Id, Store, TypeProcedure } from './types';

type Props = { store: Store; canEdit: boolean; refresh: () => Promise<void>; notify: (message: string) => void };
/**
 * Test procedure of every oven type: procedures for all kinds of the type plus procedures for one kind (S Smart, D2 Digital, M2 Manual).
 * An oven gets both parts; type and kind are recognised from its name.
 */
export default function OvenTypes({ store, canEdit, refresh, notify }: Props) {
  const types = lookupOptions(store.ovenTypes);
  const [selected, setSelected] = useState<Id>(types[0]?.id ?? NEW_ID), [kind, setKind] = useState<Id | null>(null);
  const [adding, setAdding] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const type = store.ovenTypes.find(t => t.id === selected), variant = store.ovenVariants.find(v => v.id === kind);
  // CL is offered only for OC-B.
  const kinds = lookupOptions(store.ovenVariants).filter(v => kindAllowed(v, selected));
  function chooseType(id: Id) { setSelected(id); if (variant && !kindAllowed(variant, id)) setKind(null); }
  const count = (typeId: Id, kindId: Id | null) => typeProcedureRows(store, typeId, kindId).length;
  const rows = type ? typeProcedureRows(store, type.id, kind) : [], ovens = type ? ovensOf(store, type.id, kind) : [];
  // Links the ovens of this type still miss from its test procedure (e.g. new šifre from the sync).
  const missing = type ? ovensOf(store, type.id).flatMap(o => templateLinks(store, o)) : [];
  const withProcedure = (procedureId: Id) => ovens.filter(o => store.links.some(l => l.product_id === o.id && l.procedure_id === procedureId && l.visible)).length;
  const scope = variant ? `${type?.name} · ${kindLabel(variant)}` : `${type?.name} · vse vrste`;
  async function run(action: () => Promise<string>) {
    setBusy(true); setError('');
    try { const message = await action(); await refresh(); setAdding(false); notify(message); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function add(ids: Id[], typeIds: Id[], variantId: Id | null) {
    const plan = typeAddPlan(store, typeIds, variantId, store.procedures.filter(p => ids.includes(p.id)));
    return run(async () => { await saveRecords('typeProcedures', plan.rows); await saveRecords('links', plan.links); return `Testni postopek: dodanih ${plan.rows.length}, povezav na pečeh: ${plan.links.length}.`; });
  }
  const sync = () => run(async () => { await saveRecords('links', missing); return `Peči tipa ${type?.name} so usklajene, dodanih povezav: ${missing.length}.`; });
  function remove(row: TypeProcedure) {
    const p = store.procedures.find(x => x.id === row.procedure_id);
    if (!confirm(`Odstranite ${p?.code} iz testnega postopka ${scope}? Peči, ki postopek že imajo, ga obdržijo.`)) return;
    return run(async () => { await saveRecord('typeProcedures', { ...row, visible: false }); return `Postopek ${p?.code} je odstranjen iz testnega postopka.`; });
  }
  return <>
    <PageTitle eyebrow="Nastavitve programov" title="Testni postopki peči" description="Izberite tip peči in vrsto ter dodajte postopke. Dobijo jih vse peči tega tipa in vrste; tip in vrsta se prepoznata iz naziva peči." />
    <div className="product-layout">
      <div className="side-stack">
        <section className="panel type-list"><div className="panel-heading"><h2><Layers size={19} /> Tip peči</h2><Badge>{types.length}</Badge></div>
          <div>{types.map(t => <div key={t.id} className={`product-item ${selected === t.id ? 'selected' : ''}`}><button className="product-option" title={`Prikaži testni postopek tipa ${t.name}`} onClick={() => chooseType(t.id)}><div><strong>{t.name}</strong><span>{ovensOf(store, t.id).length} peči · {t.patterns.split(',').join(', ') || '—'}</span></div><ChevronRight size={18} /></button></div>)}</div>
          <div className="product-list-footer" title="Peči, katerih tipa ni bilo mogoče prepoznati iz naziva"><span>Peči brez tipa: {store.products.filter(p => p.visible && !ovenOf(store, p).typeId).length}</span></div>
        </section>
        {type && <section className="panel type-list"><div className="panel-heading"><h2><SlidersHorizontal size={19} /> Vrsta</h2></div>
          <div>{[{ id: null, title: 'Vse vrste', sub: 'Skupni postopki tipa' }, ...kinds.map(v => ({ id: v.id as Id | null, title: kindLabel(v), sub: `${ovensOf(store, type.id, v.id).length} peči` }))].map(v => <div key={v.id ?? 'all'} className={`product-item ${kind === v.id ? 'selected' : ''}`}><button className="product-option" title={v.id ? `Postopki samo za vrsto ${v.title}` : `Postopki za vse peči tipa ${type.name}`} onClick={() => setKind(v.id)}><div><strong>{v.title}</strong><span>{v.sub} · {count(type.id, v.id)} postopkov</span></div><ChevronRight size={18} /></button></div>)}</div>
        </section>}
      </div>
      <section className="panel product-details">{type ? <>
        <div className="product-header"><div><span className="eyebrow">Testni postopek</span><h2>{scope}</h2><p>Pripadnost postopkov: {type.affiliation_id ? lookupName(store.affiliations, type.affiliation_id) : '—'} · {ovens.length} peči · {rows.length} postopkov{variant ? ` (+ ${count(type.id, null)} iz »Vse vrste«)` : ''}</p></div>
          {canEdit && <div className="product-header-side"><div className="row-actions header-buttons">
            <button className="button success small" disabled={busy || !missing.length} title={missing.length ? `Dodaj manjkajoče postopke vsem pečem tipa ${type.name}` : 'Vse peči tega tipa imajo vse postopke'} onClick={sync}><RefreshCw size={16} /> Uskladi peči ({missing.length})</button>
            <button className="button success small" disabled={busy} title={`Dodaj postopke v testni postopek ${scope}`} onClick={() => { setError(''); setAdding(true); }}><Plus size={17} /> Dodaj postopke</button></div></div>}
        </div>
        {missing.length > 0 && <div className="alert warning product-missing" role="status">Pečem tipa {type.name} manjka {missing.length} povezav iz testnega postopka (npr. nove šifre). Gumb »Uskladi peči« jih doda.</div>}
        <div className="section-bar"><h3><ListChecks size={18} /> Postopki: {scope}</h3><Badge title="Število postopkov v tem delu testnega postopka">{rows.length}</Badge></div>
        {error && <div className="alert danger" role="alert">{error}</div>}
        {rows.length ? <div className="table-scroll link-scroll" style={{ '--link-rows': 6 } as CSSProperties}><table><thead><tr><th>Red</th><th>Postopek</th><th>Skupina / vnos</th><th>Peči s postopkom</th><th>Dejanja</th></tr></thead><tbody>{rows.map(r => { const p = store.procedures.find(x => x.id === r.procedure_id); return <tr key={r.id}>
          <td><span className="order-number">{r.sort_order}</span></td>
          <td><strong>{p?.name ?? 'Neznan postopek'}</strong><span className="cell-sub">{p?.code}</span></td>
          <td>{p && lookupName(store.groups, p.group_id)}<span className="cell-sub">{p && lookupName(store.inputTypes, p.input_type_id)}</span></td>
          <td><Badge tone={withProcedure(r.procedure_id) === ovens.length ? 'success' : 'warning'} title="Število peči, ki imajo postopek">{withProcedure(r.procedure_id)} / {ovens.length}</Badge></td>
          <td>{canEdit && <button className="icon-button danger-text" disabled={busy} aria-label={`Odstrani ${p?.code} iz testnega postopka`} title="Odstrani postopek iz testnega postopka" onClick={() => remove(r)}><EyeOff size={17} /></button>}</td>
        </tr>; })}</tbody></table></div> : <Empty title="Ni postopkov">{variant ? `Dodajte postopke, ki veljajo samo za vrsto ${kindLabel(variant)}.` : `Dodajte postopke, ki jih morajo imeti vse peči tipa ${type.name}.`}</Empty>}
        <div className="section-bar"><h3><Layers size={18} /> Peči: {scope}</h3><Badge>{ovens.length}</Badge></div>
        <div className="type-ovens">{ovens.length ? ovens.map(o => <div key={o.id} className="type-oven" title={o.name}><div><strong>{o.name}</strong><span>{o.code} · {ovenLabel(store, o)}</span></div><StatusBadge status={productStatus(store, o)} /></div>)
          : <p className="pick-empty">Nobena peč ne spada sem. Tip in vrsta se prepoznata iz naziva peči; po potrebi ju izberete v urejanju artikla.</p>}</div>
        <div className="panel-note">Peč dobi postopke iz »Vse vrste« in iz svoje vrste. Odstranjen postopek ostane pri pečeh, ki ga že imajo.</div>
      </> : <Empty title="Ni tipov peči">Tipi peči se ustvarijo z migracijama supabase/008_tipi_peci.sql in 009_vrste_peci.sql.</Empty>}</section>
    </div>
    {adding && type && <ProcedurePicker store={store} targets={[]} initialTypes={[type.id]} initialVariant={kind} fixedTypes busy={busy} error={error} onClose={() => !busy && setAdding(false)} onSubmit={add} />}
  </>;
}
