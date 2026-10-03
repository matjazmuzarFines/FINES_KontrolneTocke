import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createDemoStore } from './data';
import { stepsForProduct } from './domain';
import { defaultLookups, lookupKinds, lookupTables } from './lookups';
import { importRows } from './uvoz';
import type { Store } from './types';

const db = new PGlite();
const tester = '10000000-0000-4000-8000-000000000001';
const developer = '10000000-0000-4000-8000-000000000002';
const admin = '10000000-0000-4000-8000-000000000003';
const submission = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sql = (file: string) => readFileSync(new URL(`../supabase/${file}`, import.meta.url), 'utf8');
const demo = createDemoStore();
let order = 0, item = 0, secondItem = 0;

async function asUser<T>(id: string, fn: () => Promise<T>) {
  await db.exec('SET ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id]);
  try { return await fn(); } finally { await db.exec('RESET ROLE'); }
}
/** Rows as the app receives them (JSON numbers, no timestamps). */
async function rows(table: string) {
  return (await db.query<{ r: Record<string, unknown> }>(`SELECT to_jsonb(t) - 'created_at' - 'updated_at' AS r FROM public.${table} t ORDER BY id`)).rows.map(x => x.r);
}
async function dbStore() {
  return { procedures: await rows('kp_postopki'), links: await rows('ln_kp_artikel_postopki'), measurements: await rows('kp_meritve'), inputTypes: await rows('kp_tipi_vnosa'), statuses: await rows('kp_statusi_postopkov') } as unknown as Store;
}
const count = async (q: string, params: unknown[] = []) => (await db.query<{ count: number }>(q, params)).rows[0].count;
const submit = (id: string, itemId: number, answers: unknown, snapshot: unknown) =>
  db.query<{ id: number }>('SELECT public.kp_submit_test($1,$2,$3::jsonb,$4::jsonb) AS id', [id, itemId, JSON.stringify(answers), JSON.stringify(snapshot)]);

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  `);
  // The documented order; 002 must be repeatable, 005 runs before 006.
  for (const file of ['001_schema.sql', '002_seed.sql', '002_seed.sql', '003_sifranti.sql', '004_pripadnosti_meritve.sql', '005_uvoz_postopkov.sql', '006_stevilcni_id.sql']) await db.exec(sql(file));
  await db.query('INSERT INTO auth.users(id,email) VALUES ($1,$2),($3,$4),($5,$6)', [tester, 'tester@fines.test', developer, 'developer@fines.test', admin, 'admin@fines.test']);
  await db.query("UPDATE public.kp_uporabniki SET role = 'developer' WHERE id = $1", [developer]);
  await db.query("UPDATE public.kp_uporabniki SET role = 'admin' WHERE id = $1", [admin]);
  order = (await db.query<{ id: number }>("INSERT INTO public.kp_delovni_nalogi(code,customer,due_date) VALUES ('SQL-TEST','Local SQL verification','2026-10-09') RETURNING id")).rows[0].id;
  const htb5 = (await db.query<{ id: number }>("SELECT id FROM public.kp_artikli WHERE code = '100-301'")).rows[0].id;
  [item, secondItem] = (await db.query<{ id: number }>("INSERT INTO public.ln_kp_nalog_artikli(order_id,product_id,serial_number) VALUES ($1,$2,'SQL-001'),($1,$2,'SQL-002') RETURNING id", [order, htb5])).rows.map(r => r.id);
}, 60000);
afterAll(async () => { await db.close(); });

describe('Supabase SQL schema, numeric IDs, RLS and transactional results (local PostgreSQL)', () => {
  it('gives every table plain numbers 1, 2, 3 … and keeps all records', async () => {
    expect(await count('SELECT count(*)::int AS count FROM public.kp_postopki')).toBe(importRows.length);
    expect(await count('SELECT count(*)::int AS count FROM public.kp_artikli')).toBe(4);
    expect(await count('SELECT count(*)::int AS count FROM public.ln_kp_artikel_postopki')).toBe(1);
    const kp = await db.query<{ id: number; code: string }>("SELECT id, code FROM public.kp_postopki WHERE code IN ('KP-0001','KP-0146','KP-0284') ORDER BY id");
    expect(kp.rows).toEqual([{ id: 1, code: 'KP-0001' }, { id: 146, code: 'KP-0146' }, { id: 284, code: 'KP-0284' }]);
    const link = await db.query<{ product: string; procedure: string }>('SELECT a.code AS product, p.code AS procedure FROM public.ln_kp_artikel_postopki l JOIN public.kp_artikli a ON a.id = l.product_id JOIN public.kp_postopki p ON p.id = l.procedure_id');
    expect(link.rows).toEqual([{ product: '100-301', procedure: 'KP-0001' }]);
    const types = await db.query<{ table_name: string }>("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'id' AND data_type <> 'bigint' ORDER BY table_name");
    expect(types.rows.map(r => r.table_name)).toEqual(['kp_uporabniki']);
  });
  it('has the same lookups, procedures, affiliations, products and links as the demo mode', async () => {
    for (const kind of lookupKinds) expect(await rows(lookupTables[kind])).toEqual(defaultLookups[kind]);
    expect(await rows('kp_postopki')).toEqual([...demo.procedures].sort((a, b) => a.id - b.id));
    expect(await rows('ln_kp_postopki_pripadnost')).toEqual(demo.procedureAffiliations);
    expect(await rows('kp_artikli')).toEqual(demo.products);
    expect(await rows('ln_kp_artikel_postopki')).toEqual(demo.links);
  });
  it('finds affiliations of a procedure with a simple query', async () => {
    const affiliations = await db.query<{ code: string }>('SELECT a.code FROM public.ln_kp_postopki_pripadnost l JOIN public.kp_pripadnosti a ON a.id = l.id_pripadnosti WHERE l.id_postopka = 1 AND l.visible ORDER BY a.id');
    expect(affiliations.rows.map(r => r.code)).toEqual(['OCA', 'OCB', 'ODC']);
  });
  it('continues numbering for new records and refuses a second run of 006', async () => {
    await asUser(developer, async () => {
      const inserted = await db.query<{ id: number }>("INSERT INTO public.kp_skupine(code,name,sort_order) VALUES ('HLAJENJE','Hlajenje',50) RETURNING id");
      expect(inserted.rows[0].id).toBe(5);
      await db.query("UPDATE public.kp_skupine SET visible = false WHERE code = 'HLAJENJE'");
    });
    await expect(db.exec(sql('006_stevilcni_id.sql'))).rejects.toThrow('že izvedena');
    await db.exec(sql('005_uvoz_postopkov.sql'));
    expect(await count('SELECT count(*)::int AS count FROM public.kp_postopki')).toBe(importRows.length);
    await expect(db.query("DELETE FROM public.kp_skupine WHERE code = 'HLAJENJE'")).rejects.toThrow('visible = false');
  });
  it('denies anonymous reads and tester edits or privilege escalation', async () => {
    await db.exec('SET ROLE anon');
    try { await expect(db.query('SELECT * FROM public.kp_postopki')).rejects.toThrow('permission denied'); } finally { await db.exec('RESET ROLE'); }
    await asUser(tester, async () => {
      expect((await db.query("UPDATE public.kp_postopki SET name = 'FORGED' WHERE id = 1 RETURNING id")).rows).toHaveLength(0);
      expect((await db.query("UPDATE public.kp_uporabniki SET role = 'admin' WHERE id = $1 RETURNING id", [tester])).rows).toHaveLength(0);
      await expect(db.query("INSERT INTO public.kp_postopki(name,code,instruction,input_type_id,group_id,test_phase_id,status_id) VALUES ('Fake','FAKE','Fake',1,1,1,1)")).rejects.toThrow('row-level security');
      await expect(db.query("INSERT INTO public.kp_skupine(code,name) VALUES ('TEST','Test')")).rejects.toThrow('row-level security');
      await expect(db.query('DELETE FROM public.kp_postopki WHERE id = 1')).rejects.toThrow('permission denied');
    });
  });
  it('developer can hide and restore but cannot physically delete even as postgres', async () => {
    await asUser(developer, async () => {
      expect((await db.query('UPDATE public.kp_postopki SET visible = false WHERE id = 2 RETURNING id')).rows).toHaveLength(1);
      await db.query('UPDATE public.kp_postopki SET visible = true WHERE id = 2');
    });
    await expect(db.query('DELETE FROM public.kp_postopki WHERE id = 2')).rejects.toThrow('visible = false');
  });
  it('rejects incomplete test, a changed snapshot and a required skip, writing no rows', async () => {
    const htb5 = (await db.query<{ product_id: number }>('SELECT product_id FROM public.ln_kp_nalog_artikli WHERE id = $1', [item])).rows[0].product_id;
    const steps = stepsForProduct(await dbStore(), htb5);
    const answers = [{ link_id: steps[0].link.id, value: 'DA', note: 'SQL verification', skipped: false }];
    await asUser(tester, async () => {
      await expect(submit(submission(1), item, [], steps)).rejects.toThrow('število rezultatov');
      await expect(submit(submission(1), item, answers, [])).rejects.toThrow('spremenil');
      await expect(submit(submission(1), item, [{ ...answers[0], skipped: true }], steps)).rejects.toThrow('Obveznega');
    });
    expect(await count('SELECT count(*)::int AS count FROM public.kp_testi')).toBe(0);
    expect(await count('SELECT count(*)::int AS count FROM public.ln_kp_test_rezultati')).toBe(0);
  });
  it('saves test and results together with numeric IDs, verified tester and idempotent retries', async () => {
    const htb5 = (await db.query<{ product_id: number }>('SELECT product_id FROM public.ln_kp_nalog_artikli WHERE id = $1', [item])).rows[0].product_id;
    const steps = stepsForProduct(await dbStore(), htb5);
    const answers = [{ link_id: steps[0].link.id, value: 'DA', note: 'SQL verification', skipped: false }];
    await asUser(tester, async () => {
      const ids = [];
      for (let attempt = 0; attempt < 2; attempt++) ids.push((await submit(submission(1), item, answers, steps)).rows[0].id);
      expect(ids).toEqual([1, 1]);
      await expect(submit(submission(2), item, answers, steps)).rejects.toThrow('že uspešno');
      await expect(db.query("INSERT INTO public.kp_testi(submission_id,order_item_id,tester_id,passed,answers,snapshot) VALUES ($1,$2,$3,true,'[]','[]')", [submission(3), secondItem, tester])).rejects.toThrow('permission denied');
    });
    const { rows: saved } = await db.query('SELECT t.id, t.submission_id, t.tester_id, t.passed, r.link_id, r.passed AS result FROM public.kp_testi t JOIN public.ln_kp_test_rezultati r ON r.test_id = t.id');
    expect(saved).toEqual([{ id: 1, submission_id: submission(1), tester_id: tester, passed: true, link_id: 1, result: true }]);
  });
  it('allows a failed test and a subsequent successful retest', async () => {
    const htb5 = (await db.query<{ product_id: number }>('SELECT product_id FROM public.ln_kp_nalog_artikli WHERE id = $1', [secondItem])).rows[0].product_id;
    const steps = stepsForProduct(await dbStore(), htb5);
    const answer = (value: string) => [{ link_id: steps[0].link.id, value, note: '', skipped: false }];
    await asUser(tester, async () => {
      await submit(submission(4), secondItem, answer('NE'), steps);
      await submit(submission(5), secondItem, answer('DA'), steps);
    });
    const { rows: tests } = await db.query<{ passed: boolean }>('SELECT passed FROM public.kp_testi WHERE order_item_id = $1 ORDER BY id', [secondItem]);
    expect(tests.map(r => r.passed)).toEqual([false, true]);
  });
  it('saves several measurements with the same snapshot as the app builds', async () => {
    let product = 0, link = 0;
    await asUser(developer, async () => {
      product = (await db.query<{ id: number }>("INSERT INTO public.kp_artikli(name,code) VALUES ('FD68 test','FD-TEST') RETURNING id")).rows[0].id;
      link = (await db.query<{ id: number }>('INSERT INTO public.ln_kp_artikel_postopki(product_id,procedure_id,sort_order) VALUES ($1,146,10) RETURNING id', [product])).rows[0].id;
      await db.query("INSERT INTO public.kp_meritve(link_id,name,unit,min_value,max_value,sort_order) VALUES ($1,'Bl','A',10,12.5,10),($1,'Br','A',10,12.5,10)", [link]);
    });
    expect([product, link]).toEqual([5, 2]);
    const multiItem = (await db.query<{ id: number }>("INSERT INTO public.ln_kp_nalog_artikli(order_id,product_id,serial_number) VALUES ($1,$2,'SQL-MULTI') RETURNING id", [order, product])).rows[0].id;
    const steps = stepsForProduct(await dbStore(), product);
    expect(steps.map(s => s.measurements.map(m => [m.id, m.name]))).toEqual([[[1, 'Bl'], [2, 'Br']]]);
    const answer = [{ link_id: link, value: 'Bl=11 A; Br=13 A', note: '', skipped: false, values: { 1: '11', 2: '13' } }];
    await asUser(admin, async () => {
      await expect(submit(submission(10), multiItem, [{ ...answer[0], values: { 1: '11' } }], steps)).rejects.toThrow('Manjka vrednost meritve Br');
      await submit(submission(11), multiItem, answer, steps);
    });
    const result = await db.query<{ passed: boolean }>('SELECT r.passed FROM public.ln_kp_test_rezultati r JOIN public.kp_testi t ON t.id = r.test_id WHERE t.submission_id = $1', [submission(11)]);
    expect(result.rows).toEqual([{ passed: false }]);
  });
  it('admin can manage another user and disabling a user removes business access', async () => {
    await asUser(admin, async () => {
      expect((await db.query("UPDATE public.kp_uporabniki SET role = 'tester' WHERE id = $1 RETURNING id", [admin])).rows).toHaveLength(0);
      await db.query('UPDATE public.kp_uporabniki SET visible=false WHERE id=$1', [tester]);
    });
    await asUser(tester, async () => {
      expect((await db.query('SELECT id FROM public.kp_postopki')).rows).toHaveLength(0);
      await expect(submit(submission(20), item, [], [])).rejects.toThrow('Ni dovoljenja');
    });
  });
});
