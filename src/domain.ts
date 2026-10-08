import type { Answer, Id, Link, Measurement, Procedure, Product, Step, Store, TypeProcedure } from './types';
import { lookupCode } from './lookups';
import { NEW_ID } from './types';

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
export type ProductStatus = 'missing' | 'in_progress' | 'ready';
/** Missing: no visible linked procedure (e.g. a new šifra from the sync). Ready: confirmed by development. Otherwise in progress. */
export function productStatus(store: Pick<Store, 'links'>, product: Product): ProductStatus {
  if (!store.links.some(l => l.product_id === product.id && l.visible)) return 'missing';
  return product.ready_for_production ? 'ready' : 'in_progress';
}
/** A new link with default settings, or the hidden link of the same pair restored (never a duplicate). */
export function linkFor(store: Pick<Store, 'links'>, product: Product, procedure: Procedure): Link {
  const old = store.links.find(l => l.product_id === product.id && l.procedure_id === procedure.id);
  return old ? { ...old, visible: true } : { id: NEW_ID, title: `${product.code}|${procedure.code}`, product_id: product.id, procedure_id: procedure.id, sort_order: procedure.default_order, required: true, min_value: null, max_value: null, nominal_value: null, photo_required: false, poka_yoke: false, unit_override: null, instruction_override: null, measurement_name: null, active: true, valid_from: null, valid_to: null, visible: true };
}
/**
 * Copies the visible procedures of the source product with all settings and measurements to the targets.
 * Procedures a target already has stay unchanged; hidden links are restored with the source settings and their old measurements hidden.
 * measurements[i] belong to links[i] and get its ID after the links are saved.
 */
export function copyLinksPlan(store: Pick<Store, 'links' | 'measurements' | 'procedures'>, sourceId: Id, targets: Product[]) {
  const source = store.links.filter(l => l.product_id === sourceId && l.visible);
  const links: Link[] = [], measurements: Measurement[][] = [], hidden: Measurement[] = [];
  for (const t of targets.filter(t => t.id !== sourceId)) for (const s of source) {
    const old = store.links.find(l => l.product_id === t.id && l.procedure_id === s.procedure_id);
    if (old?.visible) continue;
    const code = store.procedures.find(p => p.id === s.procedure_id)?.code ?? '';
    links.push({ ...s, id: old?.id ?? NEW_ID, title: `${t.code}|${code}`, product_id: t.id });
    if (old) hidden.push(...linkMeasurements(store, old.id).map(m => ({ ...m, visible: false })));
    measurements.push(linkMeasurements(store, s.id).map(m => ({ ...m, id: NEW_ID, link_id: NEW_ID })));
  }
  return { links, measurements, hidden };
}
/** Visible rows of the test procedure of an oven type, in their order. */
export function typeProcedureRows(store: Pick<Store, 'typeProcedures'>, typeId: Id) {
  return store.typeProcedures.filter(r => r.oven_type_id === typeId && r.visible).sort((a, b) => a.sort_order - b.sort_order || a.procedure_id - b.procedure_id);
}
/** Links an oven still needs from the test procedure of its type; new links take the order from the type. */
export function templateLinks(store: Pick<Store, 'links' | 'procedures' | 'typeProcedures'>, product: Product): Link[] {
  if (!product.oven_type_id) return [];
  return typeProcedureRows(store, product.oven_type_id).flatMap(r => {
    const p = store.procedures.find(x => x.id === r.procedure_id);
    if (!p || store.links.some(l => l.product_id === product.id && l.procedure_id === p.id && l.visible)) return [];
    const link = linkFor(store, product, p);
    return [link.id === NEW_ID ? { ...link, sort_order: r.sort_order } : link];
  });
}
/** Adds procedures to the test procedure of oven types and to every visible oven of those types (existing links stay unchanged). */
export function typeAddPlan(store: Pick<Store, 'links' | 'products' | 'typeProcedures'>, typeIds: Id[], procedures: Procedure[]) {
  const rows: TypeProcedure[] = [], links: Link[] = [];
  for (const typeId of typeIds) for (const p of procedures) {
    const old = store.typeProcedures.find(r => r.oven_type_id === typeId && r.procedure_id === p.id);
    if (!old?.visible) rows.push(old ? { ...old, visible: true } : { id: NEW_ID, oven_type_id: typeId, procedure_id: p.id, sort_order: p.default_order, visible: true });
    for (const oven of store.products.filter(x => x.visible && x.oven_type_id === typeId))
      if (!store.links.some(l => l.product_id === oven.id && l.procedure_id === p.id && l.visible)) links.push(linkFor(store, oven, p));
  }
  return { rows, links };
}
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
