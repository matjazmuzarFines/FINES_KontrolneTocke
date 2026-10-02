import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import seed from './seed.json';

const db = new PGlite();
const tester = '10000000-0000-4000-8000-000000000001';
const developer = '10000000-0000-4000-8000-000000000002';
const admin = '10000000-0000-4000-8000-000000000003';
const order = '20000000-0000-4000-8000-000000000001';
const item = '30000000-0000-4000-8000-000000000001';
const secondItem = '30000000-0000-4000-8000-000000000002';
const runId = '40000000-0000-4000-8000-000000000001';
const snapshot = [{link:seed.links[0],procedure:seed.procedures[0]}];
const answers = [{link_id:seed.links[0].id,value:'DA',note:'SQL verification',skipped:false}];
async function asUser<T>(id: string, fn: () => Promise<T>) {
  await db.exec('SET ROLE authenticated');
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)",[id]);
  try { return await fn(); } finally { await db.exec('RESET ROLE'); }
}
beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    GRANT USAGE ON SCHEMA auth, public TO authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
  `);
  await db.exec(readFileSync(new URL('../supabase/001_schema.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/002_seed.sql',import.meta.url),'utf8'));
  await db.query('INSERT INTO auth.users(id,email) VALUES ($1,$2),($3,$4),($5,$6)',[tester,'tester@fines.test',developer,'developer@fines.test',admin,'admin@fines.test']);
  await db.query("UPDATE public.rbo_uporabniki SET role = 'developer' WHERE id = $1",[developer]);
  await db.query("UPDATE public.rbo_uporabniki SET role = 'admin' WHERE id = $1",[admin]);
  await db.query('INSERT INTO public.rbo_delovni_nalogi(id,code,customer,due_date) VALUES ($1,$2,$3,$4)',[order,'SQL-TEST','Local SQL verification','2026-10-09']);
  await db.query('INSERT INTO public.tl_rbo_nalog_artikli(id,order_id,product_id,serial_number) VALUES ($1,$2,$3,$4),($5,$2,$3,$6)',[item,order,seed.products[0].id,'SQL-001',secondItem,'SQL-002']);
},30000);
afterAll(async () => { await db.close(); });

describe('Supabase SQL schema, RLS and transactional results (local PostgreSQL)', () => {
  it('imports all CSV records and seed can repeat without duplication', async () => {
    await db.exec(readFileSync(new URL('../supabase/002_seed.sql',import.meta.url),'utf8'));
    const {rows} = await db.query<{count:number}>('SELECT count(*)::int AS count FROM public.rbo_postopki');
    expect(rows[0].count).toBe(10);
    expect((await db.query<{count:number}>('SELECT count(*)::int AS count FROM public.rbo_artikli')).rows[0].count).toBe(4);
    expect((await db.query<{count:number}>('SELECT count(*)::int AS count FROM public.tl_rbo_artikel_postopki')).rows[0].count).toBe(1);
  });
  it('denies anonymous reads and tester edits or privilege escalation', async () => {
    await db.exec('SET ROLE anon');
    try { await expect(db.query('SELECT * FROM public.rbo_postopki')).rejects.toThrow('permission denied'); } finally { await db.exec('RESET ROLE'); }
    await asUser(tester,async () => {
      const result = await db.query<{id:string}>('UPDATE public.rbo_postopki SET name = $1 WHERE id = $2 RETURNING id',['FORGED',seed.procedures[0].id]);
      expect(result.rows).toHaveLength(0);
      const promoted = await db.query<{id:string}>("UPDATE public.rbo_uporabniki SET role = 'admin' WHERE id = $1 RETURNING id",[tester]);
      expect(promoted.rows).toHaveLength(0);
      await expect(db.query("INSERT INTO public.rbo_postopki(name,code,input_type,instruction) VALUES ('Fake','FAKE','OK_NOK','Fake')")).rejects.toThrow('row-level security');
      await expect(db.query('DELETE FROM public.rbo_postopki WHERE id = $1',[seed.procedures[0].id])).rejects.toThrow('permission denied');
    });
  });
  it('developer can hide and restore but cannot physically delete even as postgres', async () => {
    await asUser(developer,async () => {
      expect((await db.query('UPDATE public.rbo_postopki SET visible = false WHERE id = $1 RETURNING id',[seed.procedures[1].id])).rows).toHaveLength(1);
      await db.query('UPDATE public.rbo_postopki SET visible = true WHERE id = $1',[seed.procedures[1].id]);
    });
    await expect(db.query('DELETE FROM public.rbo_postopki WHERE id = $1',[seed.procedures[1].id])).rejects.toThrow('visible = false');
  });
  it('rejects incomplete test and writes no partial rows', async () => {
    await asUser(tester,async () => {
      await expect(db.query('SELECT public.rbo_submit_test($1,$2,$3::jsonb,$4::jsonb)',[runId,item,'[]',JSON.stringify(snapshot)])).rejects.toThrow('število rezultatov');
    });
    expect((await db.query<{count:number}>('SELECT count(*)::int AS count FROM public.rbo_testi')).rows[0].count).toBe(0);
    expect((await db.query<{count:number}>('SELECT count(*)::int AS count FROM public.tl_rbo_test_rezultati')).rows[0].count).toBe(0);
  });
  it('rejects a changed snapshot and required skip', async () => {
    await asUser(tester,async () => {
      await expect(db.query('SELECT public.rbo_submit_test($1,$2,$3::jsonb,$4::jsonb)',[runId,item,JSON.stringify(answers),'[]'])).rejects.toThrow('spremenil');
      await expect(db.query('SELECT public.rbo_submit_test($1,$2,$3::jsonb,$4::jsonb)',[runId,item,JSON.stringify([{...answers[0],skipped:true}]),JSON.stringify(snapshot)])).rejects.toThrow('Obveznega');
    });
  });
  it('saves test and results together with verified tester and idempotent retries', async () => {
    await asUser(tester,async () => {
      for (let attempt = 0; attempt < 2; attempt++) await db.query('SELECT public.rbo_submit_test($1,$2,$3::jsonb,$4::jsonb)',[runId,item,JSON.stringify(answers),JSON.stringify(snapshot)]);
      await expect(db.query('SELECT public.rbo_submit_test($1,$2,$3::jsonb,$4::jsonb)',['40000000-0000-4000-8000-000000000002',item,JSON.stringify(answers),JSON.stringify(snapshot)])).rejects.toThrow('že uspešno');
      await expect(db.query('INSERT INTO public.rbo_testi(order_item_id,tester_id,passed,answers,snapshot) VALUES ($1,$2,true,$3::jsonb,$4::jsonb)',[secondItem,tester,JSON.stringify(answers),JSON.stringify(snapshot)])).rejects.toThrow('permission denied');
    });
    const {rows} = await db.query<{tester_id:string;passed:boolean;count:number}>('SELECT t.tester_id,t.passed,(SELECT count(*)::int FROM public.tl_rbo_test_rezultati WHERE test_id=t.id) AS count FROM public.rbo_testi t');
    expect(rows).toEqual([{tester_id:tester,passed:true,count:1}]);
  });
  it('allows a failed test and a subsequent successful retest', async () => {
    await asUser(tester,async () => {
      await db.query('SELECT public.rbo_submit_test($1,$2,$3::jsonb,$4::jsonb)',['40000000-0000-4000-8000-000000000003',secondItem,JSON.stringify([{...answers[0],value:'NE'}]),JSON.stringify(snapshot)]);
      await db.query('SELECT public.rbo_submit_test($1,$2,$3::jsonb,$4::jsonb)',['40000000-0000-4000-8000-000000000004',secondItem,JSON.stringify(answers),JSON.stringify(snapshot)]);
    });
    const {rows} = await db.query<{passed:boolean}>('SELECT passed FROM public.rbo_testi WHERE order_item_id=$1 ORDER BY id',[secondItem]);
    expect(rows.map(r => r.passed)).toEqual([false,true]);
  });
  it('admin can manage another user and disabling a user removes business access', async () => {
    await asUser(admin,async () => {
      const self = await db.query("UPDATE public.rbo_uporabniki SET role = 'tester' WHERE id = $1 RETURNING id",[admin]);
      expect(self.rows).toHaveLength(0);
      await db.query('UPDATE public.rbo_uporabniki SET visible=false WHERE id=$1',[tester]);
    });
    await asUser(tester,async () => {
      expect((await db.query('SELECT id FROM public.rbo_postopki')).rows).toHaveLength(0);
      await expect(db.query('SELECT public.rbo_submit_test($1,$2,$3::jsonb,$4::jsonb)',[runId,item,JSON.stringify(answers),JSON.stringify(snapshot)])).rejects.toThrow('Ni dovoljenja');
    });
  });
});
