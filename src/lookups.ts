import type { Id, Lookup, LookupKind, Procedure, ProcedureAffiliation } from './types';

/** Next free number in a table (demo store and new lookup values). */
export const nextId = (rows: { id: Id }[]) => Math.max(0, ...rows.map(r => r.id)) + 1;
/** Plain string order like SQL COLLATE "C" (used for codes and the order of new IDs). */
export const byText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
// Initial dropdown values. IDs are 1, 2, 3 … in sort_order, the same as supabase/006_stevilcni_id.sql gives them.
const rows = (values: [code: string, name: string, order?: number][]): Lookup[] =>
  values.map(([code, name, order], i) => ({ code, name, sort_order: order ?? (i + 1) * 10, visible: true }))
    .sort((a, b) => a.sort_order - b.sort_order || byText(a.code, b.code)).map((l, i) => ({ id: i + 1, ...l }));
export const defaultLookups: Record<LookupKind, Lookup[]> = {
  inputTypes: rows([['DA_NE', 'DA/NE'], ['OK_NOK', 'OK/NOK'], ['MERITEV', 'Meritev'], ['BESEDILO', 'Besedilo'], ['FOTO', 'Foto'], ['VEC_MERITEV', 'Več meritev', 35]]),
  groups: rows([['VIZUALNO', 'Vizualno'], ['FUNKCIJA', 'Funkcija'], ['ELEKTRIKA', 'Elektrika'], ['ROCNO_DELO', 'Ročno delo']]),
  affiliations: rows([['ALL', 'ALL'], ['OCA', 'OCA'], ['OCB', 'OCB'], ['ODC', 'ODC'], ['OPD', 'OPD'], ['PV-B', 'PV-B'], ['SCH', 'SCH']]),
  phases: rows([['PRIPRAVA_0', 'Priprava 0', 0], ['PRED_ZAGONOM_100', 'Pred zagonom 100', 100], ['ROCNI_TEST_200', 'Ročni test 200', 200], ['AVTOMATSKI_TEST_400', 'Avtomatski test 400', 400], ['KONTROLA_600', 'Kontrola 600', 600], ['ZAKLJUCEK_800', 'Zaključek 800', 800]]),
  statuses: rows([['OSNUTEK', 'Osnutek'], ['AKTIVEN', 'Aktiven'], ['ARHIVIRAN', 'Arhiviran']]),
};
export const lookupKinds = Object.keys(defaultLookups) as LookupKind[];
export const lookupTables: Record<LookupKind, string> = { inputTypes: 'kp_tipi_vnosa', groups: 'kp_skupine', affiliations: 'kp_pripadnosti', phases: 'kp_faze_testa', statuses: 'kp_statusi_postopkov' };

export const findLookup = (list: Lookup[], id: Id) => list.find(l => l.id === id);
export const lookupName = (list: Lookup[], id: Id) => findLookup(list, id)?.name ?? '—';
export const lookupCode = (list: Lookup[], id: Id) => findLookup(list, id)?.code ?? '';
export const byCode = (list: Lookup[], code: string) => list.find(l => l.code === code);
/** Visible options in dropdown order; keeps the current value even if it was hidden later. */
export const lookupOptions = (list: Lookup[], current?: Id) => list.filter(l => l.visible || l.id === current).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'sl'));

// Same normalisation as the SQL migration: 'PRIPRAVA _0' -> 'PRIPRAVA_0', 'Ročno delo' -> 'ROCNO_DELO'.
export const toCode = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase().replace(/\s*_\s*/g, '_').replace(/\s+/g, '_');
type LegacyProcedure = Omit<Procedure, 'id' | 'input_type_id' | 'group_id' | 'test_phase_id' | 'status_id'> & { id: string; input_type: string; group_name: string; affiliation: string; test_phase: string; procedure_status: string };
/** Number of a procedure code: KP-0007 -> 7. */
export const codeNumber = (code: string) => Number(code.match(/(\d+)$/)?.[1] ?? 0);
/** Converts procedures from the CSV import (text values) to numeric IDs (KP-0007 -> 7), lookup IDs and affiliation rows, adding unknown lookup values. */
export function fromLegacy(legacy: LegacyProcedure[], lookups: Record<LookupKind, Lookup[]>) {
  const resolve = (kind: LookupKind, text: string) => {
    const code = toCode(text), list = lookups[kind];
    let row = byCode(list, code);
    if (!row) { row = { id: nextId(list), code, name: text.trim(), sort_order: 900, visible: true }; list.push(row); }
    return row.id;
  };
  const procedureAffiliations: ProcedureAffiliation[] = [];
  const procedures = legacy.map(({ id: _uuid, input_type, group_name, affiliation, test_phase, procedure_status, ...p }): Procedure => {
    const id = codeNumber(p.code);
    procedureAffiliations.push({ id: procedureAffiliations.length + 1, id_postopka: id, id_pripadnosti: resolve('affiliations', affiliation), visible: true });
    return { ...p, id, input_type_id: resolve('inputTypes', input_type), group_id: resolve('groups', group_name), test_phase_id: resolve('phases', test_phase), status_id: resolve('statuses', procedure_status) };
  });
  return { procedures, procedureAffiliations };
}
