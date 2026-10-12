import { describe, expect, it } from 'vitest';
import seed from './seed.json';
import { answerError, answerPassed, measurementSummary, procedureAffiliationIds, productStatus, copyLinksPlan, templateLinks, typeAddPlan, detectOvenType, detectOvenVariant, stepsForProduct, validateLink } from './domain';
import { byCode, defaultLookups, defaultOvenTypes, defaultOvenVariants, fromLegacy, lookupCode, toCode } from './lookups';
import { reorderValues } from './Procedures';
import { applyImport, importRows } from './uvoz';
import { createDemoStore } from './data';
import type { Answer, Step, Store } from './types';

// CSV data only (without the Končni preizkus import); IDs are numbers like in Supabase after 006.
const store: Store = createDemoStore(false);
const htb5 = store.products.findIndex(p => p.code === '100-301');
const base = stepsForProduct(store,store.products[htb5].id,'2026-10-02')[0];
function measurement(): Step { return { procedure: {...base.procedure}, input_type:'MERITEV', measurements: [], link: {...base.link,min_value:390,max_value:410,nominal_value:400} }; }
const answer = (value: string, skipped = false): Answer => ({link_id:base.link.id,value,note:'',skipped});
describe('CSV mapping and valid procedures', () => {
  it('preserves original records and resolves the legacy ID to KP-0001', () => {
    expect(store.procedures).toHaveLength(10); expect(store.products).toHaveLength(4); expect(store.links).toHaveLength(1);
    expect(base.procedure.code).toBe('KP-0001'); expect(base.link.valid_from).toBe('2026-08-08');
    expect(store.products.map(p => [p.id,p.code])).toEqual([[1,'100-201.000010'],[2,'100-301'],[3,'100-302'],[4,'100-303']]);
    expect([base.procedure.id,base.link.id,base.link.product_id]).toEqual([1,1,2]);
  });
  it('honors dates, active status, visibility and draft status', () => {
    expect(stepsForProduct(store,store.products[htb5].id,'2026-08-07')).toHaveLength(0);
    for (const change of [{visible:false},{status_id:byCode(store.statuses,'OSNUTEK')!.id}]) {
      const modified = structuredClone(store); Object.assign(modified.procedures[0],change);
      expect(stepsForProduct(modified,modified.products[htb5].id,'2026-10-02')).toHaveLength(0);
    }
    const modified = structuredClone(store); modified.links[0].valid_to = '2026-10-01';
    expect(stepsForProduct(modified,modified.products[htb5].id,'2026-10-02')).toHaveLength(0);
  });
});
describe('lookup tables', () => {
  it('maps CSV text values to lookup IDs without adding unknown values', () => {
    expect(toCode('PRIPRAVA _0')).toBe('PRIPRAVA_0'); expect(toCode('Ročno delo')).toBe('ROCNO_DELO');
    for (const kind of ['inputTypes','groups','affiliations','phases','statuses'] as const) expect(store[kind]).toHaveLength(defaultLookups[kind].length);
    const p = store.procedures.find(p => p.code === 'KP-0007')!;
    expect(lookupCode(store.phases,p.test_phase_id)).toBe('PRED_ZAGONOM_100'); expect(lookupCode(store.inputTypes,p.input_type_id)).toBe('MERITEV');
    expect(base.input_type).toBe('DA_NE');
  });
  it('keeps unknown legacy values by adding them to the lookup', () => {
    const l = structuredClone(defaultLookups);
    const [p] = fromLegacy([{...seed.procedures[0],group_name:'Hladilni sistem'}],l).procedures;
    expect(l.groups.find(g => g.id === p.group_id)?.name).toBe('Hladilni sistem');
  });
  it('requires a photo upload for the Foto input type', () => {
    expect(answerError({...base,input_type:'FOTO'},answer('slika.jpg'))).toContain('fotografijo');
  });
});
describe('several measurements', () => {
  const m = (id: number, name: string, min: number, max: number) => ({ id, link_id: base.link.id, name, unit: 'A', nominal_value: null, min_value: min, max_value: max, sort_order: 10, visible: true });
  const step: Step = { ...base, input_type: 'VEC_MERITEV', measurements: [m(1,'Bl',10,12), m(2,'Br',10,12)] };
  const multi = (values: Record<string,string>): Answer => ({ link_id: base.link.id, values, value: measurementSummary(step.measurements, values), note: '', skipped: false });
  it('requires a valid number for every measurement', () => {
    expect(answerError(step,multi({1:'11'}))).toContain('Br');
    expect(answerError(step,multi({1:'11',2:'x'}))).toContain('Br');
    expect(answerError(step,multi({1:'11',2:'11,5'}))).toBeNull();
    expect(answerError({...step,measurements:[]},multi({}))).toContain('niso določene');
  });
  it('passes only when all measurements are within limits', () => {
    expect(answerPassed(step,multi({1:'10',2:'12'}))).toBe(true);
    expect(answerPassed(step,multi({1:'10',2:'12.1'}))).toBe(false);
    expect(multi({1:'10',2:'12'}).value).toBe('Bl=10 A; Br=12 A');
  });
});
describe('import of the Končni preizkus form', () => {
  const l = structuredClone(defaultLookups), data = fromLegacy(structuredClone(seed.procedures), l);
  const ids = Object.fromEntries(data.procedures.map(p => [p.code, p.id]));
  applyImport(data.procedures, data.procedureAffiliations, l);
  it('updates KP-0001…KP-0010 in place and adds the rest with unique order', () => {
    expect(data.procedures).toHaveLength(importRows.length);
    expect(data.procedures.find(p => p.code === 'KP-0001')!.id).toBe(ids['KP-0001']);
    expect(data.procedures.find(p => p.code === 'KP-0009')!.name).toBe('Tok glavnega grelca spodaj');
    expect(new Set(data.procedures.map(p => p.default_order)).size).toBe(importRows.length);
    for (const kind of ['inputTypes','groups','affiliations','phases','statuses'] as const) expect(l[kind]).toHaveLength(defaultLookups[kind].length);
  });
  it('replaces affiliations with the ones from the form', () => {
    const kp1 = data.procedures.find(p => p.code === 'KP-0001')!;
    expect(procedureAffiliationIds(data,kp1.id).map(id => l.affiliations.find(a => a.id === id)!.code).sort()).toEqual(['OCA','OCB','ODC']);
    expect(data.procedureAffiliations.filter(a => a.id_postopka === kp1.id && !a.visible).map(a => lookupCode(l.affiliations,a.id_pripadnosti))).toEqual(['ALL']);
  });
});
describe('reordering procedures', () => {
  const rows = [...store.procedures].filter(p => p.visible).sort((a,b) => a.default_order - b.default_order);
  it('swaps neighbours and keeps the existing order numbers', () => {
    const ids = rows.map(p => p.id); [ids[0],ids[1]] = [ids[1],ids[0]];
    const changed = reorderValues(rows,ids);
    expect(changed.map(p => [p.code,p.default_order])).toEqual([['KP-0002',10],['KP-0001',11]]);
  });
  it('moves a dragged row and shifts the rows in between', () => {
    const ids = rows.map(p => p.id); ids.splice(3,0,ids.shift()!);
    expect(reorderValues(rows,ids).map(p => [p.code,p.default_order])).toEqual([['KP-0002',10],['KP-0003',11],['KP-0004',12],['KP-0001',13]]);
  });
  it('separates duplicate order numbers', () => {
    const dup = rows.slice(0,3).map((p,i) => ({...p,default_order:i < 2 ? 10 : 12}));
    expect(reorderValues(dup,dup.map(p => p.id)).map(p => p.default_order)).toEqual([11]);
  });
});
describe('quality control rules', () => {
  it('rejects missing and invalid results and required skips', () => {
    expect(answerError(base,undefined)).toBeTruthy(); expect(answerError(base,answer('',true))).toBeTruthy();
    expect(answerError(base,answer('YES'))).toBeTruthy(); expect(answerError(base,answer('DA'))).toBeNull();
  });
  it('accepts decimal comma and inclusive limits; records failed measurements', () => {
    const step = measurement();
    expect(answerError(step,answer('399,5'))).toBeNull();
    for (const value of ['390','410','399,5']) expect(answerPassed(step,answer(value))).toBe(true);
    for (const value of ['389','411','NaN','Infinity','napaka','0x190']) expect(answerPassed(step,answer(value))).toBe(false);
    expect(answerError(step,answer('napaka'))).toBeTruthy();
    expect(answerError(step,answer('411'))).toBeNull();
  });
  it('enforces poka-yoke and required photograph', () => {
    const step = measurement(); step.link.poka_yoke = true;
    expect(answerError(step,answer('411'))).toBeTruthy(); expect(answerError(step,answer('400'))).toBeNull();
    step.link.photo_required = true; expect(answerError(step,answer('400'))).toContain('fotografijo');
  });
  it('allows optional skipping', () => {
    const step = measurement(); step.link.required = false;
    expect(answerError(step,answer('',true))).toBeNull(); expect(answerPassed(step,answer('',true))).toBe(true);
  });
  it('rejects inverted limits, nominal outside limits and inverted dates', () => {
    const l = measurement().link;
    expect(() => validateLink({...l,min_value:420})).toThrow();
    expect(() => validateLink({...l,nominal_value:500})).toThrow();
    expect(() => validateLink({...l,valid_from:'2026-10-02',valid_to:'2026-10-01'})).toThrow();
  });
});
describe('product status', () => {
  it('is missing without visible procedures, in progress with them and ready only when confirmed', () => {
    const p = store.products.find(p => p.code === '100-301')!, empty = store.products.find(p => p.code === '100-302')!;
    expect(productStatus(store, empty)).toBe('missing');
    expect(productStatus(store, { ...empty, ready_for_production: true })).toBe('missing');
    expect(productStatus(store, p)).toBe('in_progress');
    expect(productStatus(store, { ...p, ready_for_production: true })).toBe('ready');
    expect(productStatus({ links: store.links.map(l => ({ ...l, visible: false })) }, { ...p, ready_for_production: true })).toBe('missing');
  });
});
describe('copying procedures between products', () => {
  it('copies settings and measurements, skips existing links and restores hidden ones', () => {
    const [src, dst, other] = ['100-301', '100-302', '100-303'].map(code => store.products.find(p => p.code === code)!);
    const link = store.links.find(l => l.product_id === src.id)!;
    const s: Store = { ...store,
      links: [{ ...link, min_value: 1, max_value: 9 }, { ...link, id: 900, product_id: dst.id, visible: false }, { ...link, id: 901, product_id: other.id }],
      measurements: [{ id: 1, link_id: link.id, name: 'Bl', unit: 'A', nominal_value: null, min_value: 1, max_value: 2, sort_order: 10, visible: true },
        { id: 2, link_id: 900, name: 'Staro', unit: null, nominal_value: null, min_value: null, max_value: null, sort_order: 10, visible: true }] };
    const plan = copyLinksPlan(s, src.id, [src, dst, other]);
    expect(plan.links).toHaveLength(1);
    expect(plan.links[0]).toMatchObject({ id: 900, product_id: dst.id, visible: true, min_value: 1, max_value: 9, title: `${dst.code}|KP-0001` });
    expect(plan.measurements[0]).toEqual([expect.objectContaining({ id: 0, name: 'Bl', min_value: 1, max_value: 2 })]);
    expect(plan.hidden).toEqual([expect.objectContaining({ id: 2, visible: false })]);
  });
});
describe('oven types and kinds', () => {
  const types = defaultOvenTypes, kinds = defaultOvenVariants;
  const typeCode = (id: number | null) => types.find(t => t.id === id)?.code ?? null, kindCode = (id: number | null) => kinds.find(v => v.id === id)?.code ?? null;
  it('recognises the type from the beginning of the name (longest match) and the kind from a word of the name', () => {
    const cases: [string, string | null, string | null][] = [
      ['FB5-S CL E1', 'OC-B', 'CL'], ['FB8-S', 'OC-B', 'S'], ['HTB10', 'OC-B', 'HTB'], ['HTB5 CL', 'OC-B', 'HTB'], ['HTBM-60 L', 'OC-B', 'HTB'], ['HTB16-D2', 'OC-B', 'HTB'], ['FB-Smart 5/8 CL', 'OC-B', 'CL'], ['FBM-40 S CL', 'OC-A', 'S'],
      ['FBM-40 S', 'OC-A', 'S'], ['FD64H2/1-S', 'OD-C', 'S'], ['FD68H1/1 D2', 'OD-C', 'D2'], ['FD68H1/2 M2', 'OD-C', 'M2'],
      ['HTBP16-D2', 'PV-B', 'D2'], ['HTBP10/60-S', 'PV-B', 'S'], ['HTBP16-M', 'PV-B', 'M2'], ['ES660-D2', 'OP-D', 'D2'], ['ES660-1 M', 'OP-D', 'M2'],
      ['SCH-660 D2', 'SCH', 'D2'], ['THERMICO PLUS 5', null, null],
    ];
    for (const [name, type, kind] of cases) expect([name, typeCode(detectOvenType(types, name)), kindCode(detectOvenVariant(kinds, name, detectOvenType(types, name)))]).toEqual([name, type, kind]);
  });
  it('adds procedures for all kinds or one kind, and an oven gets the common part plus its own kind', () => {
    const base = store.products.find(p => p.code === '100-301')!;
    const [htb, fd, fdD2] = [{ ...base, name: 'HTB5' }, { ...base, id: 801, code: 'X-1', name: 'FD64H2/1-S' }, { ...base, id: 802, code: 'X-2', name: 'FD68H1/1 D2' }];
    const odc = types.find(t => t.code === 'OD-C')!.id, d2 = kinds.find(v => v.code === 'D2')!.id;
    const [p1, p2, p3] = store.procedures.filter(p => ['KP-0002', 'KP-0003', 'KP-0004'].includes(p.code));
    const s: Store = { ...store, products: [htb, fd, fdD2], typeProcedures: [] };
    const all = typeAddPlan(s, [odc], null, [p1, p2]);
    expect(all.links.map(l => [l.product_id, l.procedure_id])).toEqual([[801, p1.id], [802, p1.id], [801, p2.id], [802, p2.id]]);
    const onlyD2 = typeAddPlan(s, [odc], d2, [p3]);
    expect(onlyD2.rows).toEqual([expect.objectContaining({ oven_type_id: odc, oven_variant_id: d2, procedure_id: p3.id })]);
    expect(onlyD2.links.map(l => l.product_id)).toEqual([802]);
    const typed: Store = { ...s, typeProcedures: [...all.rows, ...onlyD2.rows].map((r, i) => ({ ...r, id: i + 1 })) };
    const newOven = { ...base, id: 803, code: 'X-3', name: 'FD86H1/2-D2' };
    expect(templateLinks(typed, newOven).map(l => l.procedure_id)).toEqual([p1.id, p2.id, p3.id].sort((a, b) => store.procedures.find(p => p.id === a)!.default_order - store.procedures.find(p => p.id === b)!.default_order));
    expect(templateLinks(typed, { ...newOven, name: 'FD86H1/2-S' }).map(l => l.procedure_id)).not.toContain(p3.id);
    // A manual choice wins over the name; a link hidden on purpose is not restored automatically.
    expect(templateLinks(typed, { ...htb, oven_type_id: odc })).toHaveLength(2);
    expect(templateLinks({ ...typed, links: [...typed.links, { ...typed.links[0], id: 990, product_id: 803, procedure_id: p1.id, visible: false }] }, newOven).map(l => l.procedure_id)).not.toContain(p1.id);
  });
});
