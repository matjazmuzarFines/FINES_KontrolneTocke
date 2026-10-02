import type { Answer, Link, Procedure, Step, Store } from './types';

export function dateToday() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Ljubljana' }).format(new Date()); }
function measurementValue(value: string) {
  const text = value.trim();
  return /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(text) ? Number(text.replace(',', '.')) : Number.NaN;
}
export function stepsForProduct(store: Store, productId: string, today = dateToday()): Step[] {
  return store.links.filter(l => l.product_id === productId && l.visible && l.active && (!l.valid_from || l.valid_from <= today) && (!l.valid_to || l.valid_to >= today))
    .flatMap(link => {
      const procedure = store.procedures.find(p => p.id === link.procedure_id && p.visible && p.active && p.procedure_status === 'AKTIVEN');
      return procedure ? [{ link, procedure }] : [];
    }).sort((a, b) => a.link.sort_order - b.link.sort_order || a.procedure.code.localeCompare(b.procedure.code));
}
export function answerError(step: Step, answer: Answer | undefined): string | null {
  if (answer?.skipped) return step.link.required || step.link.poka_yoke ? 'Ta korak je obvezen.' : null;
  if (!answer?.value.trim()) return 'Vnesite rezultat ali preskočite neobvezni korak.';
  if (step.link.photo_required) return 'Ta korak zahteva fotografijo. Nalaganje fotografij v tej različici še ni omogočeno.';
  if (step.procedure.input_type === 'MERITEV' && !Number.isFinite(measurementValue(answer.value))) return 'Vnesite veljavno številčno meritev.';
  if (step.procedure.input_type === 'DA_NE' && !['DA', 'NE'].includes(answer.value)) return 'Izberite DA ali NE.';
  if (step.procedure.input_type === 'OK_NOK' && !['OK', 'NOK'].includes(answer.value)) return 'Izberite OK ali NOK.';
  if (step.link.poka_yoke && !answerPassed(step, answer)) return 'Poka-yoke: nadaljevanje zahteva ustrezen rezultat.';
  return null;
}
export function answerPassed(step: Step, answer: Answer): boolean {
  if (answer.skipped) return !step.link.required && !step.link.poka_yoke;
  if (step.procedure.input_type === 'OK_NOK') return answer.value === 'OK';
  if (step.procedure.input_type === 'DA_NE') return answer.value === 'DA';
  if (step.procedure.input_type === 'MERITEV') {
    const value = measurementValue(answer.value);
    return Number.isFinite(value) && (step.link.min_value === null || value >= step.link.min_value) && (step.link.max_value === null || value <= step.link.max_value);
  }
  return Boolean(answer.value.trim());
}
export function validateProcedure(p: Procedure) {
  if (!p.name.trim() || !p.code.trim() || !p.instruction.trim()) throw new Error('Naziv, koda in navodilo so obvezni.');
  if (![p.default_order, p.sequence_number].every(n => Number.isInteger(n) && n >= 0)) throw new Error('Vrstni red in zaporedna številka morata biti nenegativni celi števili.');
}
export function validateLink(l: Link) {
  if (!Number.isInteger(l.sort_order) || l.sort_order < 0) throw new Error('Vrstni red mora biti nenegativno celo število.');
  for (const n of [l.min_value, l.max_value, l.nominal_value]) if (n !== null && !Number.isFinite(n)) throw new Error('Meje morajo biti veljavne številke.');
  if (l.min_value !== null && l.max_value !== null && l.min_value > l.max_value) throw new Error('Minimum ne sme presegati maksimuma.');
  if (l.nominal_value !== null && ((l.min_value !== null && l.nominal_value < l.min_value) || (l.max_value !== null && l.nominal_value > l.max_value))) throw new Error('Nominalna vrednost mora biti znotraj mej.');
  if (l.valid_from && l.valid_to && l.valid_from > l.valid_to) throw new Error('Začetek veljavnosti mora biti pred koncem.');
}
