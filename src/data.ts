import { createClient } from '@supabase/supabase-js';
import seed from './seed.json';
import { answerError, answerPassed, stepsForProduct, validateLink, validateProcedure } from './domain';
import type { Answer, Link, Procedure, Product, Step, Store, TestRun } from './types';

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
const storageKey = 'fines-kontrolne-tocke-demo-v1';

function newDemo(): Store {
  const base = structuredClone(seed) as Pick<Store, 'procedures' | 'products' | 'links'>;
  return {
    ...base,
    orders: [
      { id: 'demo-order-1', code: 'DEMO-2026-001', customer: 'Demonstracijski nalog · HTB serija', due_date: '2026-10-09', visible: true },
      { id: 'demo-order-2', code: 'DEMO-2026-002', customer: 'Demonstracijski nalog · FB serija', due_date: '2026-10-12', visible: true },
    ],
    items: [
      { id: 'demo-item-1', order_id: 'demo-order-1', product_id: base.products[0].id, serial_number: 'DEMO-HTB5-001', visible: true },
      { id: 'demo-item-2', order_id: 'demo-order-1', product_id: base.products[0].id, serial_number: 'DEMO-HTB5-002', visible: true },
      { id: 'demo-item-3', order_id: 'demo-order-1', product_id: base.products[1].id, serial_number: 'DEMO-HTB8-001', visible: true },
      { id: 'demo-item-4', order_id: 'demo-order-2', product_id: base.products[3].id, serial_number: 'DEMO-FB5-001', visible: true },
    ],
    tests: [], profiles: [demoUser],
  };
}
function readDemo(): Store {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return newDemo();
  try {
    const value = JSON.parse(saved);
    if (!['procedures', 'products', 'links', 'orders', 'items', 'tests', 'profiles'].every(k => Array.isArray(value[k]))) throw new Error();
    return value;
  } catch { throw new Error('Lokalnih demo podatkov ni mogoče prebrati. Izvozite vsebino lokalne shrambe in odstranite ključ fines-kontrolne-tocke-demo-v1 za nov začetek.'); }
}
function writeDemo(store: Store) {
  try { localStorage.setItem(storageKey, JSON.stringify(store)); }
  catch { throw new Error('Shranjevanje v brskalniku ni uspelo. Preverite prostor in dovoljenje za lokalno shrambo.'); }
}
const tableMap = { procedures: 'rbo_postopki', products: 'rbo_artikli', links: 'tl_rbo_artikel_postopki', orders: 'rbo_delovni_nalogi', items: 'tl_rbo_nalog_artikli', tests: 'rbo_testi', profiles: 'rbo_uporabniki' };
const fields = {
  procedures: Object.keys(seed.procedures[0]).join(','),
  products: Object.keys(seed.products[0]).join(','),
  links: Object.keys(seed.links[0]).join(','),
  orders: 'id,code,customer,due_date,visible',
  items: 'id,order_id,product_id,serial_number,visible',
  tests: 'id,order_item_id,tester_id,completed_at,passed,answers,snapshot,visible',
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
export async function saveRecord<K extends 'procedures' | 'products' | 'links'>(kind: K, record: Store[K][number]): Promise<void> {
  if (kind === 'procedures') validateProcedure(record as Procedure);
  if (kind === 'links') validateLink(record as Link);
  if (kind === 'products' && (!(record as Product).name.trim() || !(record as Product).code.trim())) throw new Error('Naziv in šifra artikla sta obvezna.');
  // Send only known writable fields; never forward server metadata.
  const clean = Object.fromEntries(fields[kind].split(',').map(k => [k, (record as unknown as Record<string, unknown>)[k]]));
  if (supabase) {
    const { error } = await supabase.from(tableMap[kind]).upsert(clean).select('id').single();
    if (error) throw new Error(error.message);
  } else {
    const store = readDemo();
    const rows = store[kind] as (Procedure | Product | Link)[];
    if (kind === 'links' && store.links.some(l => l.id !== record.id && l.product_id === (record as Link).product_id && l.procedure_id === (record as Link).procedure_id)) throw new Error('Ta postopek je že povezan z artiklom. Obnovite obstoječo povezavo.');
    if (kind !== 'links' && rows.some(r => r.id !== record.id && 'code' in r && r.code === (record as Procedure | Product).code)) throw new Error('Ta koda je že uporabljena.');
    const index = rows.findIndex(r => r.id === record.id);
    if (index < 0) rows.push(record); else rows[index] = record;
    writeDemo(store);
  }
}
export async function submitTest(id: string, itemId: string, testerId: string, answers: Answer[], snapshot: Step[]) {
  if (supabase) {
    const { error } = await supabase.rpc('rbo_submit_test', { p_id: id, p_item_id: itemId, p_answers: answers, p_expected_snapshot: snapshot });
    if (error) throw new Error(error.message);
    return;
  }
  const store = readDemo();
  const existing = store.tests.find(t => t.id === id);
  if (existing && existing.order_item_id === itemId && JSON.stringify(existing.answers) === JSON.stringify(answers)) return;
  if (existing) throw new Error('ID testa je že uporabljen.');
  if (store.tests.some(t => t.order_item_id === itemId && t.passed && t.visible)) throw new Error('Artikel je že uspešno testiran.');
  const item = store.items.find(i => i.id === itemId);
  if (!item) throw new Error('Artikel naloga ne obstaja.');
  const current = stepsForProduct(store, item.product_id);
  if (JSON.stringify(current) !== JSON.stringify(snapshot)) throw new Error('Postopek se je spremenil. Osvežite podatke in ponovite test.');
  if (!current.length || answers.length !== current.length || new Set(answers.map(a => a.link_id)).size !== current.length) throw new Error('Manjkajo rezultati.');
  for (const step of current) { const error = answerError(step, answers.find(a => a.link_id === step.link.id)); if (error) throw new Error(error); }
  const test: TestRun = { id, order_item_id: itemId, tester_id: testerId, completed_at: new Date().toISOString(), passed: current.every(s => answerPassed(s, answers.find(a => a.link_id === s.link.id)!)), answers, snapshot, visible: true };
  store.tests.push(test); writeDemo(store);
}
export async function updateProfile(id: string, role: string, visible: boolean) {
  if (!supabase) throw new Error('Pravice demo uporabnika se ne spreminjajo.');
  const { error } = await supabase.from('rbo_uporabniki').update({ role, visible }).eq('id', id).select('id').single();
  if (error) throw new Error(error.message);
}
