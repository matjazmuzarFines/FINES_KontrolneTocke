import { createClient } from '@supabase/supabase-js';
import seed from './seed.json';
import { answerError, answerPassed, stepsForProduct, validateLink, validateMeasurement, validateProcedure } from './domain';
import { byText, codeNumber, defaultLookups, fromLegacy, lookupTables, nextId } from './lookups';
import { applyImport } from './uvoz';
import { NEW_ID } from './types';
import type { Answer, Id, Link, Measurement, Procedure, ProcedureAffiliation, Product, Step, Store, TestRun } from './types';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
function checkConfig() {
  if (Boolean(url) !== Boolean(key)) return 'Nastavite obe spremenljivki VITE_SUPABASE_URL in VITE_SUPABASE_ANON_KEY.';
  if (!url) return null;
  try { if (!['https:', 'http:'].includes(new URL(url).protocol)) throw new Error(); }
  catch { return 'VITE_SUPABASE_URL mora biti veljaven HTTP ali HTTPS naslov.'; }
  if (key?.startsWith('sb_secret_')) return 'Uporabite javni Supabase publishable/anon ključ, ne skrivnega ključa.';
  return null;
}
export const configurationError = checkConfig();
export const supabase = !configurationError && url && key ? createClient(url, key) : null;
export const demoUser = { id: '00000000-0000-4000-8000-000900000001', display_name: 'Demo uporabnik', role: 'admin' as const, visible: true };
// v3: numeric IDs, lookup tables, affiliations and the procedures from the Končni preizkus form. Older demo data is not migrated.
const storageKey = 'fines-kontrolne-tocke-demo-v3';

/** Demo data with the same numbers as Supabase after 006_stevilcni_id.sql (procedures by code, products by code …). withImport adds the Končni preizkus form like 005. */
export function createDemoStore(withImport = true): Store {
  const lookups = structuredClone(defaultLookups);
  const { procedures, procedureAffiliations: affiliations } = fromLegacy(structuredClone(seed.procedures), lookups);
  if (withImport) applyImport(procedures, affiliations, lookups);
  const procedureId = new Map(seed.procedures.map(p => [p.id, codeNumber(p.code)]));
  const products: Product[] = [...seed.products].sort((x, y) => byText(x.code, y.code)).map((p, i) => ({ ...p, id: i + 1 }));
  const productId = new Map(seed.products.map(p => [p.id, products.find(x => x.code === p.code)!.id]));
  const links: Link[] = seed.links.map((l, i) => ({ ...l, id: i + 1, product_id: productId.get(l.product_id)!, procedure_id: procedureId.get(l.procedure_id)!, measurement_name: null }));
  const procedureAffiliations = affiliations.sort((x, y) => x.id_postopka - y.id_postopka || x.id_pripadnosti - y.id_pripadnosti).map((r, i) => ({ ...r, id: i + 1 }));
  const htb5 = productId.get(seed.products[0].id)!, htb8 = productId.get(seed.products[1].id)!, fb5 = productId.get(seed.products[3].id)!;
  return {
    ...lookups, procedures, products, links, procedureAffiliations, measurements: [],
    orders: [
      { id: 1, code: 'DEMO-2026-001', customer: 'Demonstracijski nalog · HTB serija', due_date: '2026-10-09', visible: true },
      { id: 2, code: 'DEMO-2026-002', customer: 'Demonstracijski nalog · FB serija', due_date: '2026-10-12', visible: true },
    ],
    items: [
      { id: 1, order_id: 1, product_id: htb5, serial_number: 'DEMO-HTB5-001', visible: true },
      { id: 2, order_id: 1, product_id: htb5, serial_number: 'DEMO-HTB5-002', visible: true },
      { id: 3, order_id: 1, product_id: htb8, serial_number: 'DEMO-HTB8-001', visible: true },
      { id: 4, order_id: 2, product_id: fb5, serial_number: 'DEMO-FB5-001', visible: true },
    ],
    tests: [], profiles: [demoUser],
  };
}
function readDemo(): Store {
  const saved = localStorage.getItem(storageKey);
  if (!saved) { const store = createDemoStore(); writeDemo(store); return store; }
  try {
    const value = JSON.parse(saved);
    if (!(Object.keys(tableMap) as (keyof Store)[]).every(k => Array.isArray(value[k]))) throw new Error();
    return value;
  } catch { throw new Error(`Lokalnih demo podatkov ni mogoče prebrati. Izvozite vsebino lokalne shrambe in odstranite ključ ${storageKey} za nov začetek.`); }
}
function writeDemo(store: Store) {
  try { localStorage.setItem(storageKey, JSON.stringify(store)); }
  catch { throw new Error('Shranjevanje v brskalniku ni uspelo. Preverite prostor in dovoljenje za lokalno shrambo.'); }
}
const tableMap: Record<keyof Store, string> = { ...lookupTables, procedures: 'kp_postopki', products: 'kp_artikli', links: 'ln_kp_artikel_postopki', orders: 'kp_delovni_nalogi', items: 'ln_kp_nalog_artikli', tests: 'kp_testi', profiles: 'kp_uporabniki', procedureAffiliations: 'ln_kp_postopki_pripadnost', measurements: 'kp_meritve' };
const lookupFields = 'id,code,name,sort_order,visible';
const fields: Record<keyof Store, string> = {
  inputTypes: lookupFields, groups: lookupFields, affiliations: lookupFields, phases: lookupFields, statuses: lookupFields,
  procedures: 'id,default_order,name,code,input_type_id,instruction,default_unit,group_id,active,internal_note,sequence_number,test_phase_id,keywords,status_id,visible',
  products: 'id,name,code,active,source,last_synced_at,sync_status,manually_locked,note,visible',
  links: 'id,title,product_id,procedure_id,sort_order,required,min_value,max_value,nominal_value,photo_required,poka_yoke,unit_override,instruction_override,measurement_name,active,valid_from,valid_to,visible',
  procedureAffiliations: 'id,id_postopka,id_pripadnosti,visible',
  measurements: 'id,link_id,name,unit,nominal_value,min_value,max_value,sort_order,visible',
  orders: 'id,code,customer,due_date,visible',
  items: 'id,order_id,product_id,serial_number,visible',
  tests: 'id,submission_id,order_item_id,tester_id,completed_at,passed,answers,snapshot,visible',
  profiles: 'id,display_name,role,visible',
};
export async function loadStore(): Promise<Store> {
  if (!supabase) return readDemo();
  const pairs = await Promise.all(Object.entries(tableMap).map(async ([k, table]) => {
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase!.from(table).select(fields[k as keyof Store]).order('id').range(offset, offset + 999);
      if (error) throw new Error(error.message);
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return [k, rows];
  }));
  return Object.fromEntries(pairs) as Store;
}
type SavedKind = 'procedures' | 'products' | 'links' | 'procedureAffiliations' | 'measurements';
/** Saves one record and returns it as saved; a new record (id NEW_ID) comes back with its number. */
export async function saveRecord<K extends SavedKind>(kind: K, record: Store[K][number]): Promise<Store[K][number]> {
  return (await saveRecords(kind, [record]))[0];
}
/**
 * Saves several records at once (e.g. a changed order of procedures) and returns them in the same order.
 * Records with id NEW_ID (0 or below) are inserted and get the next number from the database / demo store.
 */
export async function saveRecords<K extends SavedKind>(kind: K, records: Store[K][number][]): Promise<Store[K][number][]> {
  for (const record of records) {
    if (kind === 'procedures') validateProcedure(record as Procedure);
    if (kind === 'links') validateLink(record as Link);
    if (kind === 'measurements') validateMeasurement(record as Measurement);
    if (kind === 'products' && (!(record as Product).name.trim() || !(record as Product).code.trim())) throw new Error('Naziv in šifra artikla sta obvezna.');
  }
  // Send only known writable fields; never forward server metadata.
  type Row = Store[K][number];
  const isNew = (r: Row) => r.id <= NEW_ID;
  const clean = (r: Row) => Object.fromEntries(fields[kind].split(',').filter(k => !(k === 'id' && isNew(r))).map(k => [k, (r as unknown as Record<string, unknown>)[k]]));
  if (supabase) {
    const added = records.filter(isNew), changed = records.filter(r => !isNew(r));
    const saved: Row[] = [];
    if (changed.length) {
      const { data, error } = await supabase.from(tableMap[kind]).upsert(changed.map(clean)).select(fields[kind]);
      if (error) throw new Error(error.message);
      if (data.length !== changed.length) throw new Error('Vseh sprememb ni bilo mogoče shraniti. Osvežite podatke.');
      saved.push(...(data as unknown as Row[]));
    }
    // Insert one by one so every new record gets its own number back in the right order.
    const inserted: Row[] = [];
    for (const r of added) {
      const { data, error } = await supabase.from(tableMap[kind]).insert(clean(r)).select(fields[kind]).single();
      if (error) throw new Error(error.message);
      inserted.push(data as unknown as Row);
    }
    return records.map(r => isNew(r) ? inserted[added.indexOf(r)] : saved.find(x => x.id === r.id)!);
  } else {
    const store = readDemo();
    const rows = store[kind] as Row[];
    const result: Row[] = [];
    for (const original of records) {
      const record = isNew(original) ? { ...original, id: nextId(rows) } : original;
      if (kind === 'links' && store.links.some(l => l.id !== record.id && l.product_id === (record as Link).product_id && l.procedure_id === (record as Link).procedure_id)) throw new Error('Ta postopek je že povezan z artiklom. Obnovite obstoječo povezavo.');
      if (kind === 'procedureAffiliations' && store.procedureAffiliations.some(a => a.id !== record.id && a.id_postopka === (record as ProcedureAffiliation).id_postopka && a.id_pripadnosti === (record as ProcedureAffiliation).id_pripadnosti)) throw new Error('Pripadnost je že dodana postopku.');
      if (rows.some(r => r.id !== record.id && 'code' in r && r.code === (record as Procedure | Product).code)) throw new Error('Ta koda je že uporabljena.');
      const index = rows.findIndex(r => r.id === record.id);
      if (index < 0) rows.push(record); else rows[index] = record;
      result.push(record);
    }
    writeDemo(store);
    return result;
  }
}
/** Sets the affiliations of a procedure: hides removed rows, restores or adds selected ones. */
export async function saveProcedureAffiliations(current: ProcedureAffiliation[], procedureId: Id, selected: Id[]) {
  const rows = current.filter(a => a.id_postopka === procedureId);
  const changes: ProcedureAffiliation[] = [
    ...rows.filter(a => a.visible !== selected.includes(a.id_pripadnosti)).map(a => ({ ...a, visible: !a.visible })),
    ...selected.filter(id => !rows.some(a => a.id_pripadnosti === id)).map(id => ({ id: NEW_ID, id_postopka: procedureId, id_pripadnosti: id, visible: true })),
  ];
  if (changes.length) await saveRecords('procedureAffiliations', changes);
}
/** submissionId: UUID made by the browser once per test, so a retry after a network error is not saved twice. */
export async function submitTest(submissionId: string, itemId: Id, testerId: string, answers: Answer[], snapshot: Step[]) {
  if (supabase) {
    const { error } = await supabase.rpc('kp_submit_test', { p_id: submissionId, p_item_id: itemId, p_answers: answers, p_expected_snapshot: snapshot });
    if (error) throw new Error(error.message);
    return;
  }
  const store = readDemo();
  const existing = store.tests.find(t => t.submission_id === submissionId);
  if (existing && existing.order_item_id === itemId && JSON.stringify(existing.answers) === JSON.stringify(answers)) return;
  if (existing) throw new Error('ID testa je že uporabljen.');
  if (store.tests.some(t => t.order_item_id === itemId && t.passed && t.visible)) throw new Error('Artikel je že uspešno testiran.');
  const item = store.items.find(i => i.id === itemId);
  if (!item) throw new Error('Artikel naloga ne obstaja.');
  const current = stepsForProduct(store, item.product_id);
  if (JSON.stringify(current) !== JSON.stringify(snapshot)) throw new Error('Postopek se je spremenil. Osvežite podatke in ponovite test.');
  if (!current.length || answers.length !== current.length || new Set(answers.map(a => a.link_id)).size !== current.length) throw new Error('Manjkajo rezultati.');
  for (const step of current) { const error = answerError(step, answers.find(a => a.link_id === step.link.id)); if (error) throw new Error(error); }
  const test: TestRun = { id: nextId(store.tests), submission_id: submissionId, order_item_id: itemId, tester_id: testerId, completed_at: new Date().toISOString(), passed: current.every(s => answerPassed(s, answers.find(a => a.link_id === s.link.id)!)), answers, snapshot, visible: true };
  store.tests.push(test); writeDemo(store);
}
export async function updateProfile(id: string, role: string, visible: boolean) {
  if (!supabase) throw new Error('Pravice demo uporabnika se ne spreminjajo.');
  const { error } = await supabase.from('kp_uporabniki').update({ role, visible }).eq('id', id).select('id').single();
  if (error) throw new Error(error.message);
}
