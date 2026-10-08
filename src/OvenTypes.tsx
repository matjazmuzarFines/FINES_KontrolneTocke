import { useState } from 'react';
import { ChevronRight, EyeOff, Layers, ListChecks, Plus, RefreshCw } from 'lucide-react';
import { Badge, Empty, PageTitle } from './components';
import { saveRecord, saveRecords } from './data';
import { productStatus, templateLinks, typeAddPlan, typeProcedureRows } from './domain';
import { lookupName, lookupOptions } from './lookups';
import { ProcedurePicker, StatusBadge } from './Products';
import { NEW_ID } from './types';
import type { CSSProperties } from 'react';
import type { Id, Store, TypeProcedure } from './types';

type Props = { store: Store; canEdit: boolean; refresh: () => Promise<void>; notify: (message: string) => void };
/** Test procedure of every oven type (pripadnost peči): procedures all ovens of the type get. */
export default function OvenTypes({ store, canEdit, refresh, notify }: Props) {
  const types = lookupOptions(store.ovenTypes);
  const [selected, setSelected] = useState<Id>(types[0]?.id ?? NEW_ID), [adding, setAdding] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const type = store.ovenTypes.find(t => t.id === selected);
  const ovensOf = (typeId: Id) => store.products.filter(p => p.visible && p.oven_type_id === typeId);
  const rows = type ? typeProcedureRows(store, type.id) : [], ovens = ovensOf(selected);
  // Links the ovens of this type still miss from its test procedure (e.g. procedures linked before the type was set).
  const missing = ovens.flatMap(o => templateLinks(store, o));
  const withProcedure = (procedureId: Id) => ovens.filter(o => store.links.some(l => l.product_id === o.id && l.procedure_id === procedureId && l.visible)).length;
  async function run(action: () => Promise<string>) {
    setBusy(true); setError('');
    try { const message = await action(); await refresh(); setAdding(false); notify(message); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  function add(ids: Id[], typeIds: Id[]) {
    const plan = typeAddPlan(store, typeIds, store.procedures.filter(p => ids.includes(p.id)));
    return run(async () => { await saveRecords('typeProcedures', plan.rows); await saveRecords('links', plan.links); return `Testni postopek: dodanih ${plan.rows.length}, povezav na pečeh: ${plan.links.length}.`; });
  }
  const sync = () => run(async () => { await saveRecords('links', missing); return `Peči tipa ${type?.name} so usklajene, dodanih povezav: ${missing.length}.`; });
  function remove(row: TypeProcedure) {
    const p = store.procedures.find(x => x.id === row.procedure_id);
    if (!confirm(`Odstranite ${p?.code} iz testnega postopka ${type?.name}? Peči, ki postopek že imajo, ga obdržijo.`)) return;
    return run(async () => { await saveRecord('typeProcedures', { ...row, visible: false }); return `Postopek ${p?.code} je odstranjen iz testnega postopka.`; });
  }
  return <>
    <PageTitle eyebrow="Nastavitve programov" title="Testni postopki peči" description="Vsak tip peči (pripadnost) ima svoj testni postopek. Postopki se dodajo vsem pečem tega tipa, tudi tistim, ki tip dobijo kasneje." />
    <div className="product-layout">
      <section className="panel type-list"><div className="panel-heading"><h2><Layers size={19} /> Tipi peči</h2><Badge>{types.length}</Badge></div>
        <div>{types.map(t => <div key={t.id} className={`product-item ${selected === t.id ? 'selected' : ''}`}><button className="product-option" title={`Prikaži testni postopek tipa ${t.name}`} onClick={() => setSelected(t.id)}><div><strong>{t.name}</strong><span>{ovensOf(t.id).length} peči · {typeProcedureRows(store, t.id).length} postopkov</span></div><ChevronRight size={18} /></button></div>)}</div>
        <div className="product-list-footer"><span>Peči brez tipa: {store.products.filter(p => p.visible && !p.oven_type_id).length}</span></div>
      </section>
      <section className="panel product-details">{type ? <>
        <div className="product-header"><div><span className="eyebrow">Tip peči</span><h2>{type.name}</h2><p>Pripadnost postopkov: {type.affiliation_id ? lookupName(store.affiliations, type.affiliation_id) : '—'} · {ovens.length} peči · {rows.length} postopkov</p></div>
          {canEdit && <div className="product-header-side"><div className="row-actions header-buttons">
            <button className="button success small" disabled={busy || !missing.length} title={missing.length ? 'Dodaj manjkajoče postopke vsem pečem tega tipa' : 'Vse peči tega tipa imajo vse postopke'} onClick={sync}><RefreshCw size={16} /> Uskladi peči ({missing.length})</button>
            <button className="button success small" disabled={busy} title={`Dodaj postopke v testni postopek ${type.name}`} onClick={() => { setError(''); setAdding(true); }}><Plus size={17} /> Dodaj postopke</button></div></div>}
        </div>
        {missing.length > 0 && <div className="alert warning product-missing" role="status">Pečem tega tipa manjka {missing.length} povezav iz testnega postopka. Gumb »Uskladi peči« jih doda.</div>}
        <div className="section-bar"><h3><ListChecks size={18} /> Testni postopek</h3><Badge title="Število postopkov v testnem postopku">{rows.length}</Badge></div>
        {error && <div className="alert danger" role="alert">{error}</div>}
        {rows.length ? <div className="table-scroll link-scroll" style={{ '--link-rows': 6 } as CSSProperties}><table><thead><tr><th>Red</th><th>Postopek</th><th>Skupina / vnos</th><th>Peči s postopkom</th><th>Dejanja</th></tr></thead><tbody>{rows.map(r => { const p = store.procedures.find(x => x.id === r.procedure_id); return <tr key={r.id}>
          <td><span className="order-number">{r.sort_order}</span></td>
          <td><strong>{p?.name ?? 'Neznan postopek'}</strong><span className="cell-sub">{p?.code}</span></td>
          <td>{p && lookupName(store.groups, p.group_id)}<span className="cell-sub">{p && lookupName(store.inputTypes, p.input_type_id)}</span></td>
          <td><Badge tone={withProcedure(r.procedure_id) === ovens.length ? 'success' : 'warning'} title="Število peči tega tipa, ki imajo postopek">{withProcedure(r.procedure_id)} / {ovens.length}</Badge></td>
          <td>{canEdit && <button className="icon-button danger-text" disabled={busy} aria-label={`Odstrani ${p?.code} iz testnega postopka`} title="Odstrani postopek iz testnega postopka" onClick={() => remove(r)}><EyeOff size={17} /></button>}</td>
        </tr>; })}</tbody></table></div> : <Empty title="Testni postopek je prazen">Dodajte postopke, ki jih morajo imeti vse peči tipa {type.name}.</Empty>}
        <div className="section-bar"><h3><Layers size={18} /> Peči tipa {type.name}</h3><Badge>{ovens.length}</Badge></div>
        <div className="type-ovens">{ovens.length ? ovens.map(o => <div key={o.id} className="type-oven" title={o.name}><div><strong>{o.name}</strong><span>{o.code}</span></div><StatusBadge status={productStatus(store, o)} /></div>)
          : <p className="pick-empty">Nobena peč še nima tega tipa. Tip nastavite v Povezave postopkov in izdelkov: v urejanju artikla ali z gumbom »Tip peči« za več izbranih šifer.</p>}</div>
        <div className="panel-note">Odstranjen postopek ostane pri pečeh, ki ga že imajo; nove peči tega tipa ga ne dobijo več.</div>
      </> : <Empty title="Ni tipov peči">Tipi peči se ustvarijo z migracijo supabase/008_tipi_peci.sql.</Empty>}</section>
    </div>
    {adding && type && <ProcedurePicker store={store} targets={[]} initialTypes={[type.id]} fixedTypes busy={busy} error={error} onClose={() => !busy && setAdding(false)} onSubmit={add} />}
  </>;
}
