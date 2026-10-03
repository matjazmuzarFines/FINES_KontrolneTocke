import type { Answer, Id, Link, Measurement, Procedure, Step, Store } from './types';
import { lookupCode } from './lookups';

export function dateToday() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Ljubljana' }).format(new Date()); }
function measurementValue(value: string) {
  const text = value.trim();
  return /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(text) ? Number(text.replace(',', '.')) : Number.NaN;
}
const withinLimits = (value: number, limits: { min_value: number | null; max_value: number | null }) =>
  Number.isFinite(value) && (limits.min_value === null || value >= limits.min_value) && (limits.max_value === null || value <= limits.max_value);
/** Measurements of a link in the same order as the SQL snapshot (sort_order, id). */
export function linkMeasurements(store: Pick<Store, 'measurements'>, linkId: Id): Measurement[] {
  return store.measurements.filter(m => m.link_id === linkId && m.visible).sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
}
export function stepsForProduct(store: Store, productId: Id, today = dateToday()): Step[] {
  return store.links.filter(l => l.product_id === productId && l.visible && l.active && (!l.valid_from || l.valid_from <= today) && (!l.valid_to || l.valid_to >= today))
    .flatMap(link => {
      const procedure = store.procedures.find(p => p.id === link.procedure_id && procedureActive(store, p));
      return procedure ? [{ link, procedure, input_type: lookupCode(store.inputTypes, procedure.input_type_id), measurements: linkMeasurements(store, link.id) }] : [];
    }).sort((a, b) => a.link.sort_order - b.link.sort_order || a.procedure.code.localeCompare(b.procedure.code));
}
/** The status alone decides whether a procedure is used in new tests. */
export function procedureActive(store: Pick<Store, 'statuses'>, p: Procedure) { return p.visible && lookupCode(store.statuses, p.status_id) === 'AKTIVEN'; }
/** Affiliation IDs of a procedure (visible rows of ln_kp_postopki_pripadnost). */
export function procedureAffiliationIds(store: Pick<Store, 'procedureAffiliations'>, procedureId: Id) {
  return store.procedureAffiliations.filter(a => a.id_postopka === procedureId && a.visible).map(a => a.id_pripadnosti);
}
/** Input type code of a step; snapshots saved before version 2.01 kept it inside the procedure. */
export function stepType(step: Step): string { return step.input_type ?? (step.procedure as unknown as { input_type?: string }).input_type ?? ''; }
/** Readable summary of "Več meritev" values, saved as the answer value. */
export function measurementSummary(measurements: Measurement[], values: Record<string, string> = {}) {
  return measurements.map(m => `${m.name}=${values[m.id]?.trim() ?? ''}${m.unit ? ` ${m.unit}` : ''}`).join('; ');
}
export function answerError(step: Step, answer: Answer | undefined): string | null {
  if (answer?.skipped) return step.link.required || step.link.poka_yoke ? 'Ta korak je obvezen.' : null;
  if (stepType(step) === 'VEC_MERITEV') {
    if (!step.measurements?.length) return 'Za ta korak na artiklu niso določene meritve. Obvestite razvoj.';
    const missing = step.measurements.find(m => !Number.isFinite(measurementValue(answer?.values?.[m.id] ?? '')));
    if (missing) return `Vnesite veljavno številčno vrednost za meritev ${missing.name}.`;
  }
  if (!answer?.value.trim()) return 'Vnesite rezultat ali preskočite neobvezni korak.';
  if (step.link.photo_required || stepType(step) === 'FOTO') return 'Ta korak zahteva fotografijo. Nalaganje fotografij v tej različici še ni omogočeno.';
  if (stepType(step) === 'MERITEV' && !Number.isFinite(measurementValue(answer.value))) return 'Vnesite veljavno številčno meritev.';
  if (stepType(step) === 'DA_NE' && !['DA', 'NE'].includes(answer.value)) return 'Izberite DA ali NE.';
  if (stepType(step) === 'OK_NOK' && !['OK', 'NOK'].includes(answer.value)) return 'Izberite OK ali NOK.';
  if (step.link.poka_yoke && !answerPassed(step, answer)) return 'Poka-yoke: nadaljevanje zahteva ustrezen rezultat.';
  return null;
}
export function measurementPassed(m: Measurement, value: string | undefined) { return withinLimits(measurementValue(value ?? ''), m); }
export function answerPassed(step: Step, answer: Answer): boolean {
  if (answer.skipped) return !step.link.required && !step.link.poka_yoke;
  if (stepType(step) === 'OK_NOK') return answer.value === 'OK';
  if (stepType(step) === 'DA_NE') return answer.value === 'DA';
  if (stepType(step) === 'MERITEV') return withinLimits(measurementValue(answer.value), step.link);
  if (stepType(step) === 'VEC_MERITEV') return Boolean(step.measurements?.length) && step.measurements.every(m => measurementPassed(m, answer.values?.[m.id]));
  return Boolean(answer.value.trim());
}
export function validateProcedure(p: Procedure) {
  if (!p.name.trim() || !p.code.trim() || !p.instruction.trim()) throw new Error('Naziv, koda in navodilo so obvezni.');
  if (![p.input_type_id, p.group_id, p.test_phase_id, p.status_id].every(Boolean)) throw new Error('Izberite tip vnosa, skupino, fazo in status.');
  if (!Number.isInteger(p.default_order) || p.default_order < 0) throw new Error('Vrstni red mora biti nenegativno celo število.');
}
function validateLimits(l: { min_value: number | null; max_value: number | null; nominal_value: number | null }, label = '') {
  for (const n of [l.min_value, l.max_value, l.nominal_value]) if (n !== null && !Number.isFinite(n)) throw new Error(`${label}Meje morajo biti veljavne številke.`);
  if (l.min_value !== null && l.max_value !== null && l.min_value > l.max_value) throw new Error(`${label}Minimum ne sme presegati maksimuma.`);
  if (l.nominal_value !== null && ((l.min_value !== null && l.nominal_value < l.min_value) || (l.max_value !== null && l.nominal_value > l.max_value))) throw new Error(`${label}Nominalna vrednost mora biti znotraj mej.`);
}
export function validateLink(l: Link) {
  if (!Number.isInteger(l.sort_order) || l.sort_order < 0) throw new Error('Vrstni red mora biti nenegativno celo število.');
  validateLimits(l);
  if (l.valid_from && l.valid_to && l.valid_from > l.valid_to) throw new Error('Začetek veljavnosti mora biti pred koncem.');
}
export function validateMeasurement(m: Measurement) {
  if (!m.name.trim()) throw new Error('Vsaka meritev potrebuje ime.');
  validateLimits(m, `Meritev ${m.name}: `);
}
