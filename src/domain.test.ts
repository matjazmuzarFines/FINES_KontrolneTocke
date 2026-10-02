import { describe, expect, it } from 'vitest';
import seed from './seed.json';
import { answerError, answerPassed, stepsForProduct, validateLink } from './domain';
import type { Answer, Step, Store } from './types';

const store = { ...seed, orders: [], items: [], tests: [], profiles: [] } as Store;
const base = stepsForProduct(store,store.products[0].id,'2026-10-02')[0];
function measurement(): Step { return { procedure: {...base.procedure,input_type:'MERITEV'}, link: {...base.link,min_value:390,max_value:410,nominal_value:400} }; }
const answer = (value: string, skipped = false): Answer => ({link_id:base.link.id,value,note:'',skipped});
describe('CSV mapping and valid procedures', () => {
  it('preserves original records and resolves the legacy ID to KP-0001', () => {
    expect(store.procedures).toHaveLength(10); expect(store.products).toHaveLength(4); expect(store.links).toHaveLength(1);
    expect(base.procedure.code).toBe('KP-0001'); expect(base.link.valid_from).toBe('2026-08-08');
    expect(store.products[3].code).toBe('100-201.000010');
  });
  it('honors dates, active status, visibility and draft status', () => {
    expect(stepsForProduct(store,store.products[0].id,'2026-08-07')).toHaveLength(0);
    for (const change of [{visible:false},{active:false},{procedure_status:'OSNUTEK'}]) {
      const modified = structuredClone(store); Object.assign(modified.procedures[0],change);
      expect(stepsForProduct(modified,modified.products[0].id,'2026-10-02')).toHaveLength(0);
    }
    const modified = structuredClone(store); modified.links[0].valid_to = '2026-10-01';
    expect(stepsForProduct(modified,modified.products[0].id,'2026-10-02')).toHaveLength(0);
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
