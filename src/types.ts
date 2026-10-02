export type Role = 'tester' | 'developer' | 'admin';
export type InputType = 'DA_NE' | 'OK_NOK' | 'MERITEV' | 'BESEDILO';
export type Procedure = {
  id: string; default_order: number; name: string; code: string; input_type: InputType;
  instruction: string; default_unit: string | null; group_name: string; active: boolean;
  internal_note: string | null; affiliation: string; sequence_number: number;
  test_phase: string; keywords: string | null; procedure_status: 'AKTIVEN' | 'OSNUTEK' | 'ARHIVIRAN';
  visible: boolean;
};
export type Product = {
  id: string; name: string; code: string; active: boolean; source: string;
  last_synced_at: string | null; sync_status: string | null; manually_locked: boolean;
  note: string | null; visible: boolean;
};
export type Link = {
  id: string; title: string; product_id: string; procedure_id: string; sort_order: number;
  required: boolean; min_value: number | null; max_value: number | null; nominal_value: number | null;
  photo_required: boolean; poka_yoke: boolean; unit_override: string | null; instruction_override: string | null;
  active: boolean; valid_from: string | null; valid_to: string | null; visible: boolean;
};
export type Profile = { id: string; display_name: string; role: Role; visible: boolean };
export type Order = { id: string; code: string; customer: string; due_date: string; visible: boolean };
export type OrderItem = { id: string; order_id: string; product_id: string; serial_number: string; visible: boolean };
export type Step = { link: Link; procedure: Procedure };
export type Answer = { link_id: string; value: string; note: string; skipped: boolean };
export type TestRun = { id: string; order_item_id: string; tester_id: string; completed_at: string; passed: boolean; answers: Answer[]; snapshot: Step[]; visible: boolean };
export type Store = { procedures: Procedure[]; products: Product[]; links: Link[]; orders: Order[]; items: OrderItem[]; tests: TestRun[]; profiles: Profile[] };
