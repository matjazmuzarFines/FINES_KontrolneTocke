-- FINES Kontrolne točke. Execute in Supabase SQL Editor as postgres.
-- Schema intentionally fails if applied twice; apply migrations once, in order.
BEGIN;

CREATE TABLE public.kp_uporabniki (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  display_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'tester' CHECK (role IN ('tester','developer','admin')),
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.kp_postopki (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  default_order integer NOT NULL DEFAULT 10 CHECK (default_order >= 0),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  code text NOT NULL UNIQUE CHECK (length(btrim(code)) > 0),
  input_type text NOT NULL CHECK (input_type IN ('DA_NE','OK_NOK','MERITEV','BESEDILO')),
  instruction text NOT NULL CHECK (length(btrim(instruction)) > 0),
  default_unit text,
  group_name text NOT NULL DEFAULT 'Funkcija',
  active boolean NOT NULL DEFAULT true,
  internal_note text,
  affiliation text NOT NULL DEFAULT 'ALL',
  sequence_number integer NOT NULL DEFAULT 1 CHECK (sequence_number >= 0),
  test_phase text NOT NULL DEFAULT 'PRIPRAVA _0',
  keywords text,
  procedure_status text NOT NULL DEFAULT 'AKTIVEN' CHECK (procedure_status IN ('AKTIVEN','OSNUTEK','ARHIVIRAN')),
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.kp_artikli (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  code text NOT NULL UNIQUE CHECK (length(btrim(code)) > 0),
  active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'manual',
  last_synced_at timestamptz,
  sync_status text,
  manually_locked boolean NOT NULL DEFAULT false,
  note text,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ln_kp_artikel_postopki (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT '',
  product_id uuid NOT NULL REFERENCES public.kp_artikli(id),
  procedure_id uuid NOT NULL REFERENCES public.kp_postopki(id),
  sort_order integer NOT NULL DEFAULT 10 CHECK (sort_order >= 0),
  required boolean NOT NULL DEFAULT true,
  min_value numeric, max_value numeric, nominal_value numeric,
  photo_required boolean NOT NULL DEFAULT false,
  poka_yoke boolean NOT NULL DEFAULT false,
  unit_override text, instruction_override text,
  active boolean NOT NULL DEFAULT true,
  valid_from date, valid_to date,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, procedure_id),
  CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value),
  CHECK (nominal_value IS NULL OR min_value IS NULL OR nominal_value >= min_value),
  CHECK (nominal_value IS NULL OR max_value IS NULL OR nominal_value <= max_value),
  CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to)
);

CREATE TABLE public.kp_delovni_nalogi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  customer text NOT NULL DEFAULT '',
  due_date date NOT NULL,
  external_id text UNIQUE,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ln_kp_nalog_artikli (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.kp_delovni_nalogi(id),
  product_id uuid NOT NULL REFERENCES public.kp_artikli(id),
  serial_number text NOT NULL CHECK (length(btrim(serial_number)) > 0),
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id, serial_number)
);

CREATE TABLE public.kp_testi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL REFERENCES public.ln_kp_nalog_artikli(id),
  tester_id uuid NOT NULL REFERENCES public.kp_uporabniki(id),
  completed_at timestamptz NOT NULL DEFAULT now(),
  passed boolean NOT NULL,
  answers jsonb NOT NULL,
  snapshot jsonb NOT NULL,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX kp_one_passed_test_per_item ON public.kp_testi(order_item_id) WHERE passed AND visible;

CREATE TABLE public.ln_kp_test_rezultati (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.kp_testi(id),
  link_id uuid NOT NULL REFERENCES public.ln_kp_artikel_postopki(id),
  value text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  skipped boolean NOT NULL DEFAULT false,
  passed boolean NOT NULL,
  snapshot jsonb NOT NULL,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(test_id, link_id)
);
CREATE INDEX ON public.ln_kp_artikel_postopki(product_id);
CREATE INDEX ON public.ln_kp_artikel_postopki(procedure_id);
CREATE INDEX ON public.ln_kp_nalog_artikli(order_id);
CREATE INDEX ON public.ln_kp_nalog_artikli(product_id);
CREATE INDEX ON public.kp_testi(order_item_id);
CREATE INDEX ON public.kp_testi(tester_id);
CREATE INDEX ON public.ln_kp_test_rezultati(link_id);

CREATE FUNCTION public.kp_touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
CREATE FUNCTION public.kp_prevent_delete() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'Podatkov ni dovoljeno brisati. Uporabite visible = false.'; END;
$$;
CREATE FUNCTION public.kp_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT role FROM public.kp_uporabniki WHERE id = auth.uid() AND visible;
$$;
REVOKE ALL ON FUNCTION public.kp_role() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kp_role() TO authenticated;

CREATE FUNCTION public.kp_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.kp_uporabniki(id, display_name) VALUES (NEW.id, coalesce(NEW.raw_user_meta_data->>'display_name', NEW.email, ''));
  RETURN NEW;
END;
$$;
CREATE TRIGGER kp_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.kp_new_user();
INSERT INTO public.kp_uporabniki(id, display_name) SELECT id, coalesce(raw_user_meta_data->>'display_name', email, '') FROM auth.users ON CONFLICT DO NOTHING;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['kp_uporabniki','kp_postopki','kp_artikli','ln_kp_artikel_postopki','kp_delovni_nalogi','ln_kp_nalog_artikli','kp_testi','ln_kp_test_rezultati'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.kp_touch_updated_at()', t);
    EXECUTE format('CREATE TRIGGER prevent_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.kp_prevent_delete()', t);
    IF t <> 'kp_uporabniki' THEN
      EXECUTE format('CREATE POLICY read_members ON public.%I FOR SELECT TO authenticated USING (public.kp_role() IS NOT NULL)', t);
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['kp_postopki','kp_artikli','ln_kp_artikel_postopki'] LOOP
    EXECUTE format('GRANT INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format('CREATE POLICY insert_developers ON public.%I FOR INSERT TO authenticated WITH CHECK (public.kp_role() IN (''developer'',''admin''))', t);
    EXECUTE format('CREATE POLICY update_developers ON public.%I FOR UPDATE TO authenticated USING (public.kp_role() IN (''developer'',''admin'')) WITH CHECK (public.kp_role() IN (''developer'',''admin''))', t);
  END LOOP;
END;
$$;
CREATE POLICY read_profiles ON public.kp_uporabniki FOR SELECT TO authenticated USING (id = auth.uid() OR public.kp_role() = 'admin');
GRANT UPDATE (role, display_name, visible) ON public.kp_uporabniki TO authenticated;
CREATE POLICY admin_profiles ON public.kp_uporabniki FOR UPDATE TO authenticated USING (public.kp_role() = 'admin' AND id <> auth.uid()) WITH CHECK (public.kp_role() = 'admin' AND id <> auth.uid());

-- Validate and save a whole test in ONE transaction. Browser cannot forge status,
-- tester, procedure snapshots or insert partial results.
CREATE FUNCTION public.kp_submit_test(p_id uuid, p_item_id uuid, p_answers jsonb, p_expected_snapshot jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_product uuid; v_snapshot jsonb; v_step jsonb; v_answer jsonb;
  v_link public.ln_kp_artikel_postopki; v_type text; v_value text; v_number numeric;
  v_pass boolean; v_all_pass boolean := true; v_existing public.kp_testi;
  v_today date := (now() AT TIME ZONE 'Europe/Ljubljana')::date;
BEGIN
  IF public.kp_role() IS NULL THEN RAISE EXCEPTION 'Ni dovoljenja za shranjevanje testa.'; END IF;
  SELECT * INTO v_existing FROM public.kp_testi WHERE id = p_id;
  IF FOUND THEN
    IF v_existing.tester_id = auth.uid() AND v_existing.order_item_id = p_item_id AND v_existing.answers = p_answers THEN RETURN p_id; END IF;
    RAISE EXCEPTION 'ID testa je že uporabljen.';
  END IF;
  SELECT i.product_id INTO v_product FROM public.ln_kp_nalog_artikli i
    JOIN public.kp_delovni_nalogi o ON o.id = i.order_id
    JOIN public.kp_artikli a ON a.id = i.product_id
    WHERE i.id = p_item_id AND i.visible AND o.visible AND a.visible AND a.active FOR UPDATE OF i;
  IF v_product IS NULL THEN RAISE EXCEPTION 'Artikel naloga ni na voljo.'; END IF;
  IF EXISTS (SELECT 1 FROM public.kp_testi WHERE order_item_id = p_item_id AND passed AND visible) THEN RAISE EXCEPTION 'Artikel je že uspešno testiran.'; END IF;
  SELECT jsonb_agg(jsonb_build_object('link', to_jsonb(l) - 'created_at' - 'updated_at', 'procedure', to_jsonb(p) - 'created_at' - 'updated_at') ORDER BY l.sort_order, p.code)
    INTO v_snapshot FROM public.ln_kp_artikel_postopki l JOIN public.kp_postopki p ON p.id = l.procedure_id
    WHERE l.product_id = v_product AND l.visible AND l.active AND p.visible AND p.active AND p.procedure_status = 'AKTIVEN'
    AND (l.valid_from IS NULL OR l.valid_from <= v_today) AND (l.valid_to IS NULL OR l.valid_to >= v_today);
  IF v_snapshot IS NULL THEN RAISE EXCEPTION 'Artikel nima veljavnih kontrolnih postopkov.'; END IF;
  IF v_snapshot IS DISTINCT FROM p_expected_snapshot THEN RAISE EXCEPTION 'Postopek se je med testiranjem spremenil. Osvežite podatke in ponovite test.'; END IF;
  IF jsonb_typeof(p_answers) <> 'array' OR jsonb_array_length(p_answers) <> jsonb_array_length(v_snapshot) THEN RAISE EXCEPTION 'Neustrezno število rezultatov.'; END IF;
  IF (SELECT count(DISTINCT a->>'link_id') FROM jsonb_array_elements(p_answers) a) <> jsonb_array_length(v_snapshot) THEN RAISE EXCEPTION 'Podvojeni ali manjkajoči rezultati.'; END IF;
  FOR v_step IN SELECT * FROM jsonb_array_elements(v_snapshot) LOOP
    SELECT * INTO v_link FROM jsonb_populate_record(NULL::public.ln_kp_artikel_postopki, v_step->'link');
    SELECT a INTO v_answer FROM jsonb_array_elements(p_answers) a WHERE a->>'link_id' = v_link.id::text;
    IF v_answer IS NULL THEN RAISE EXCEPTION 'Manjka rezultat kontrolne točke.'; END IF;
    v_value := coalesce(v_answer->>'value', '');
    v_type := v_step->'procedure'->>'input_type';
    IF coalesce((v_answer->>'skipped')::boolean, false) THEN
      IF v_link.required OR v_link.poka_yoke THEN RAISE EXCEPTION 'Obveznega koraka ni mogoče preskočiti.'; END IF;
      v_pass := true;
    ELSE
      IF v_link.photo_required THEN RAISE EXCEPTION 'Nalaganje obveznih fotografij še ni omogočeno.'; END IF;
      IF btrim(v_value) = '' THEN RAISE EXCEPTION 'Rezultat ne sme biti prazen.'; END IF;
      CASE v_type
        WHEN 'DA_NE' THEN
          IF v_value NOT IN ('DA','NE') THEN RAISE EXCEPTION 'Neveljaven DA/NE rezultat.'; END IF;
          v_pass := v_value = 'DA';
        WHEN 'OK_NOK' THEN
          IF v_value NOT IN ('OK','NOK') THEN RAISE EXCEPTION 'Neveljaven OK/NOK rezultat.'; END IF;
          v_pass := v_value = 'OK';
        WHEN 'MERITEV' THEN
          v_number := replace(v_value, ',', '.')::numeric;
          IF v_number::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Neveljavna meritev.'; END IF;
          v_pass := (v_link.min_value IS NULL OR v_number >= v_link.min_value) AND (v_link.max_value IS NULL OR v_number <= v_link.max_value);
        ELSE v_pass := true;
      END CASE;
      IF v_link.poka_yoke AND NOT v_pass THEN RAISE EXCEPTION 'Poka-yoke zahteva ustrezen rezultat.'; END IF;
    END IF;
    v_all_pass := v_all_pass AND v_pass;
  END LOOP;
  INSERT INTO public.kp_testi(id, order_item_id, tester_id, passed, answers, snapshot) VALUES(p_id, p_item_id, auth.uid(), v_all_pass, p_answers, v_snapshot);
  FOR v_step IN SELECT * FROM jsonb_array_elements(v_snapshot) LOOP
    SELECT a INTO v_answer FROM jsonb_array_elements(p_answers) a WHERE a->>'link_id' = v_step->'link'->>'id';
    v_value := coalesce(v_answer->>'value', '');
    v_type := v_step->'procedure'->>'input_type';
    v_pass := CASE
      WHEN coalesce((v_answer->>'skipped')::boolean,false) THEN true
      WHEN v_type = 'DA_NE' THEN v_value = 'DA'
      WHEN v_type = 'OK_NOK' THEN v_value = 'OK'
      WHEN v_type = 'MERITEV' THEN ((v_step->'link'->>'min_value') IS NULL OR replace(v_value,',','.')::numeric >= (v_step->'link'->>'min_value')::numeric) AND ((v_step->'link'->>'max_value') IS NULL OR replace(v_value,',','.')::numeric <= (v_step->'link'->>'max_value')::numeric)
      ELSE true END;
    INSERT INTO public.ln_kp_test_rezultati(test_id, link_id, value, note, skipped, passed, snapshot)
      VALUES (p_id, (v_step->'link'->>'id')::uuid, v_value, coalesce(v_answer->>'note',''), coalesce((v_answer->>'skipped')::boolean,false), v_pass, v_step);
  END LOOP;
  RETURN p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.kp_submit_test(uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kp_submit_test(uuid,uuid,jsonb,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.kp_new_user(), public.kp_prevent_delete(), public.kp_touch_updated_at() FROM PUBLIC, anon, authenticated;
COMMIT;
