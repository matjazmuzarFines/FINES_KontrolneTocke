-- FINES Kontrolne točke 3.01: more affiliations per procedure, input type "Več meritev" and measurements per product link.
-- Execute ONCE in Supabase SQL Editor after 003_sifranti.sql. Transactional.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.ln_kp_postopki_pripadnost') IS NOT NULL THEN RAISE EXCEPTION 'Migracija 004 je že izvedena. Nadaljujte z 005_uvoz_postopkov.sql.'; END IF;
END;
$$;

INSERT INTO public.kp_tipi_vnosa(id, code, name, sort_order) VALUES ('00000000-0000-4000-8000-000100000006','VEC_MERITEV','Več meritev',35);

-- One row per affiliation of a procedure. Removing an affiliation sets visible = false.
CREATE TABLE public.ln_kp_postopki_pripadnost (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_postopka uuid NOT NULL REFERENCES public.kp_postopki(id),
  id_pripadnosti uuid NOT NULL REFERENCES public.kp_pripadnosti(id),
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id_postopka, id_pripadnosti)
);
CREATE INDEX ON public.ln_kp_postopki_pripadnost(id_pripadnosti);
INSERT INTO public.ln_kp_postopki_pripadnost(id_postopka, id_pripadnosti) SELECT id, affiliation_id FROM public.kp_postopki;
ALTER TABLE public.kp_postopki DROP COLUMN affiliation_id;

-- Measurements of one product–procedure link ("Več meritev"); a single "Meritev" keeps using the link's own limits.
ALTER TABLE public.ln_kp_artikel_postopki ADD COLUMN measurement_name text;
CREATE TABLE public.kp_meritve (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES public.ln_kp_artikel_postopki(id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  unit text,
  nominal_value numeric, min_value numeric, max_value numeric,
  sort_order integer NOT NULL DEFAULT 10,
  visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (min_value IS NULL OR max_value IS NULL OR min_value <= max_value),
  CHECK (nominal_value IS NULL OR min_value IS NULL OR nominal_value >= min_value),
  CHECK (nominal_value IS NULL OR max_value IS NULL OR nominal_value <= max_value)
);
CREATE INDEX ON public.kp_meritve(link_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ln_kp_postopki_pripadnost','kp_meritve'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.kp_touch_updated_at()', t);
    EXECUTE format('CREATE TRIGGER prevent_delete BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.kp_prevent_delete()', t);
    EXECUTE format('CREATE POLICY read_members ON public.%I FOR SELECT TO authenticated USING (public.kp_role() IS NOT NULL)', t);
    EXECUTE format('CREATE POLICY insert_developers ON public.%I FOR INSERT TO authenticated WITH CHECK (public.kp_role() IN (''developer'',''admin''))', t);
    EXECUTE format('CREATE POLICY update_developers ON public.%I FOR UPDATE TO authenticated USING (public.kp_role() IN (''developer'',''admin'')) WITH CHECK (public.kp_role() IN (''developer'',''admin''))', t);
  END LOOP;
END;
$$;

-- The status alone decides whether a procedure is used. Inactive active procedures become drafts; the column stays for history.
UPDATE public.kp_postopki SET status_id = '00000000-0000-4000-8000-000500000001'
  WHERE NOT active AND status_id = '00000000-0000-4000-8000-000500000002';
UPDATE public.kp_postopki SET active = true WHERE NOT active;

-- Snapshot now also carries the measurements of each step; answers for "Več meritev" bring values per measurement ID.
CREATE OR REPLACE FUNCTION public.kp_submit_test(p_id uuid, p_item_id uuid, p_answers jsonb, p_expected_snapshot jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_product uuid; v_snapshot jsonb; v_step jsonb; v_answer jsonb; v_measurement jsonb;
  v_link public.ln_kp_artikel_postopki; v_type text; v_value text; v_number numeric;
  v_pass boolean; v_all_pass boolean := true; v_passed jsonb := '{}'::jsonb; v_existing public.kp_testi;
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
  SELECT jsonb_agg(jsonb_build_object(
      'link', to_jsonb(l) - 'created_at' - 'updated_at',
      'procedure', to_jsonb(p) - 'created_at' - 'updated_at',
      'input_type', t.code,
      'measurements', coalesce((SELECT jsonb_agg(to_jsonb(m) - 'created_at' - 'updated_at' ORDER BY m.sort_order, m.id) FROM public.kp_meritve m WHERE m.link_id = l.id AND m.visible), '[]'::jsonb)
    ) ORDER BY l.sort_order, p.code)
    INTO v_snapshot FROM public.ln_kp_artikel_postopki l
    JOIN public.kp_postopki p ON p.id = l.procedure_id
    JOIN public.kp_tipi_vnosa t ON t.id = p.input_type_id
    JOIN public.kp_statusi_postopkov s ON s.id = p.status_id
    WHERE l.product_id = v_product AND l.visible AND l.active AND p.visible AND s.code = 'AKTIVEN'
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
    v_type := v_step->>'input_type';
    IF coalesce((v_answer->>'skipped')::boolean, false) THEN
      IF v_link.required OR v_link.poka_yoke THEN RAISE EXCEPTION 'Obveznega koraka ni mogoče preskočiti.'; END IF;
      v_pass := true;
    ELSE
      IF v_link.photo_required OR v_type = 'FOTO' THEN RAISE EXCEPTION 'Nalaganje obveznih fotografij še ni omogočeno.'; END IF;
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
        WHEN 'VEC_MERITEV' THEN
          IF jsonb_array_length(v_step->'measurements') = 0 THEN RAISE EXCEPTION 'Za korak niso določene meritve.'; END IF;
          v_pass := true;
          FOR v_measurement IN SELECT * FROM jsonb_array_elements(v_step->'measurements') LOOP
            IF btrim(coalesce(v_answer->'values'->>(v_measurement->>'id'), '')) = '' THEN RAISE EXCEPTION 'Manjka vrednost meritve %.', v_measurement->>'name'; END IF;
            v_number := replace(coalesce(v_answer->'values'->>(v_measurement->>'id'), ''), ',', '.')::numeric;
            IF v_number IS NULL OR v_number::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Neveljavna vrednost meritve.'; END IF;
            v_pass := v_pass AND (v_measurement->>'min_value' IS NULL OR v_number >= (v_measurement->>'min_value')::numeric)
                             AND (v_measurement->>'max_value' IS NULL OR v_number <= (v_measurement->>'max_value')::numeric);
          END LOOP;
        ELSE v_pass := true;
      END CASE;
      IF v_link.poka_yoke AND NOT v_pass THEN RAISE EXCEPTION 'Poka-yoke zahteva ustrezen rezultat.'; END IF;
    END IF;
    v_passed := v_passed || jsonb_build_object(v_link.id::text, v_pass);
    v_all_pass := v_all_pass AND v_pass;
  END LOOP;
  INSERT INTO public.kp_testi(id, order_item_id, tester_id, passed, answers, snapshot) VALUES(p_id, p_item_id, auth.uid(), v_all_pass, p_answers, v_snapshot);
  FOR v_step IN SELECT * FROM jsonb_array_elements(v_snapshot) LOOP
    SELECT a INTO v_answer FROM jsonb_array_elements(p_answers) a WHERE a->>'link_id' = v_step->'link'->>'id';
    INSERT INTO public.ln_kp_test_rezultati(test_id, link_id, value, note, skipped, passed, snapshot)
      VALUES (p_id, (v_step->'link'->>'id')::uuid, coalesce(v_answer->>'value', ''), coalesce(v_answer->>'note',''), coalesce((v_answer->>'skipped')::boolean,false),
              (v_passed->>(v_step->'link'->>'id'))::boolean, v_step);
  END LOOP;
  RETURN p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.kp_submit_test(uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kp_submit_test(uuid,uuid,jsonb,jsonb) TO authenticated;
COMMIT;
