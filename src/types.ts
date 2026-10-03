export type Role = 'tester' | 'developer' | 'admin';
/**
 * Table IDs are numbers 1, 2, 3 … (bigint identity, see supabase/006_stevilcni_id.sql).
 * NEW_ID marks a record that is not saved yet; the database (or demo store) gives it the next number.
 * Exceptions: Profile.id / TestRun.tester_id are Supabase Auth UUIDs and TestRun.submission_id is the browser's retry key.
 */
export type Id = number;
export const NEW_ID = 0;
// Dropdown values live in SQL tables (kp_tipi_vnosa, kp_skupine, ...). code is stable and used by logic, name is shown.
export type Lookup = { id: Id; code: string; name: string; sort_order: number; visible: boolean };
export type LookupKind = 'inputTypes' | 'groups' | 'affiliations' | 'phases' | 'statuses';
export type Procedure = {
  id: Id; default_order: number; name: string; code: string; input_type_id: Id;
  instruction: string; default_unit: string | null; group_id: Id; active: boolean;
  internal_note: string | null; sequence_number: number;
  test_phase_id: Id; keywords: string | null; status_id: Id;
  visible: boolean;
};
/** ln_kp_postopki_pripadnost: one row per affiliation of a procedure. */
export type ProcedureAffiliation = { id: Id; id_postopka: Id; id_pripadnosti: Id; visible: boolean };
/** kp_meritve: measurements of a product–procedure link with input type "Več meritev". */
export type Measurement = { id: Id; link_id: Id; name: string; unit: string | null; nominal_value: number | null; min_value: number | null; max_value: number | null; sort_order: number; visible: boolean };
export type Product = {
  id: Id; name: string; code: string; active: boolean; source: string;
  last_synced_at: string | null; sync_status: string | null; manually_locked: boolean;
  note: string | null; visible: boolean;
};
export type Link = {
  id: Id; title: string; product_id: Id; procedure_id: Id; sort_order: number;
  required: boolean; min_value: number | null; max_value: number | null; nominal_value: number | null;
  photo_required: boolean; poka_yoke: boolean; unit_override: string | null; instruction_override: string | null; measurement_name: string | null;
  active: boolean; valid_from: string | null; valid_to: string | null; visible: boolean;
};
export type Profile = { id: string; display_name: string; role: Role; visible: boolean };
export type Order = { id: Id; code: string; customer: string; due_date: string; visible: boolean };
export type OrderItem = { id: Id; order_id: Id; product_id: Id; serial_number: string; visible: boolean };
export type Step = { link: Link; procedure: Procedure; input_type: string; measurements: Measurement[] };
/** values: measurement ID -> entered value, only for "Več meritev"; value then holds a readable summary. */
export type Answer = { link_id: Id; value: string; note: string; skipped: boolean; values?: Record<string, string> };
export type TestRun = { id: Id; submission_id: string; order_item_id: Id; tester_id: string; completed_at: string; passed: boolean; answers: Answer[]; snapshot: Step[]; visible: boolean };
export type Store = { procedures: Procedure[]; products: Product[]; links: Link[]; orders: Order[]; items: OrderItem[]; tests: TestRun[]; profiles: Profile[]; procedureAffiliations: ProcedureAffiliation[]; measurements: Measurement[] } & Record<LookupKind, Lookup[]>;
