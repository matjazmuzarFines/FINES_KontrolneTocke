import uvoz from './uvoz-postopki.json';
import { byCode, codeNumber, nextId } from './lookups';
import type { Lookup, LookupKind, Procedure, ProcedureAffiliation } from './types';

/** One procedure from the test form "Končni preizkus" (data/2209120930AN_...xlsm); see supabase/005_uvoz_postopkov.sql. */
export type ImportRow = (typeof uvoz)[number];
export const importRows: ImportRow[] = uvoz;

/**
 * Demo-mode equivalent of 005_uvoz_postopkov.sql: updates existing procedures with the same code
 * (keeping their ID and links) and adds the others. Affiliations are replaced by the ones from the form.
 */
export function applyImport(procedures: Procedure[], affiliations: ProcedureAffiliation[], lookups: Record<LookupKind, Lookup[]>, rows = importRows) {
  const id = (kind: LookupKind, code: string) => {
    const row = byCode(lookups[kind], code);
    if (!row) throw new Error(`Šifrant ${kind} nima vrednosti ${code}.`);
    return row.id;
  };
  for (const r of rows) {
    const values = {
      name: r.name, instruction: r.instruction, input_type_id: id('inputTypes', r.input_type), default_unit: r.default_unit, group_id: id('groups', r.group),
      test_phase_id: id('phases', r.phase), status_id: id('statuses', r.status), default_order: r.default_order, sequence_number: r.no, internal_note: r.internal_note, active: true, visible: true,
    };
    let p = procedures.find(p => p.code === r.code);
    if (p) Object.assign(p, values);
    else { const n = codeNumber(r.code); p = { id: procedures.some(x => x.id === n) ? nextId(procedures) : n, code: r.code, keywords: null, ...values }; procedures.push(p); }
    const wanted = new Set(r.affiliations.map(code => id('affiliations', code)));
    for (const a of affiliations.filter(a => a.id_postopka === p.id)) a.visible = wanted.delete(a.id_pripadnosti);
    for (const affiliation of wanted) affiliations.push({ id: nextId(affiliations), id_postopka: p.id, id_pripadnosti: affiliation, visible: true });
  }
}
