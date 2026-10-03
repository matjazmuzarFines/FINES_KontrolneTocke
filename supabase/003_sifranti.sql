-- FINES Kontrolne točke 2.01: šifranti (lookup tables) for all dropdowns of kp_postopki.
-- Execute ONCE in Supabase SQL Editor after 001_schema.sql and 002_seed.sql. Transactional.
-- Existing text values are converted to IDs; unknown values are added to the lookup, so no data is lost.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.kp_tipi_vnosa') IS NOT NULL THEN RAISE EXCEPTION 'Migracija 003 je že izvedena. Nadaljujte z 004_pripadnosti_meritve.sql.'; END IF;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['kp_tipi_vnosa','kp_skupine','kp_pripadnosti','kp_faze_testa','kp_statusi_postopkov'] LOOP
    EXECUTE format($f$
      CREATE TABLE public.%I (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code text NOT NULL UNIQUE CHECK (length(btrim(code)) > 0),
        name text NOT NULL CHECK (length(btrim(name)) > 0),
        sort_order integer NOT NULL DEFAULT 0,
        visible boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )$f$, t);
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

-- IDs match src/lookups.ts (demo mode).
INSERT INTO public.kp_tipi_vnosa(id, code, name, sort_order) VALUES
  ('00000000-0000-4000-8000-000100000001','DA_NE','DA/NE',10),
  ('00000000-0000-4000-8000-000100000002','OK_NOK','OK/NOK',20),
  ('00000000-0000-4000-8000-000100000003','MERITEV','Meritev',30),
  ('00000000-0000-4000-8000-000100000004','BESEDILO','Besedilo',40),
  ('00000000-0000-4000-8000-000100000005','FOTO','Foto',50);
INSERT INTO public.kp_skupine(id, code, name, sort_order) VALUES
  ('00000000-0000-4000-8000-000200000001','VIZUALNO','Vizualno',10),
  ('00000000-0000-4000-8000-000200000002','FUNKCIJA','Funkcija',20),
  ('00000000-0000-4000-8000-000200000003','ELEKTRIKA','Elektrika',30),
  ('00000000-0000-4000-8000-000200000004','ROCNO_DELO','Ročno delo',40);
INSERT INTO public.kp_pripadnosti(id, code, name, sort_order) VALUES
  ('00000000-0000-4000-8000-000300000001','ALL','ALL',10),
  ('00000000-0000-4000-8000-000300000002','OCA','OCA',20),
  ('00000000-0000-4000-8000-000300000003','OCB','OCB',30),
  ('00000000-0000-4000-8000-000300000004','ODC','ODC',40),
  ('00000000-0000-4000-8000-000300000005','OPD','OPD',50),
  ('00000000-0000-4000-8000-000300000006','PV-B','PV-B',60),
  ('00000000-0000-4000-8000-000300000007','SCH','SCH',70);
INSERT INTO public.kp_faze_testa(id, code, name, sort_order) VALUES
  ('00000000-0000-4000-8000-000400000001','PRIPRAVA_0','Priprava 0',0),
  ('00000000-0000-4000-8000-000400000002','PRED_ZAGONOM_100','Pred zagonom 100',100),
  ('00000000-0000-4000-8000-000400000003','ROCNI_TEST_200','Ročni test 200',200),
  ('00000000-0000-4000-8000-000400000004','AVTOMATSKI_TEST_400','Avtomatski test 400',400),
  ('00000000-0000-4000-8000-000400000005','KONTROLA_600','Kontrola 600',600),
  ('00000000-0000-4000-8000-000400000006','ZAKLJUCEK_800','Zaključek 800',800);
INSERT INTO public.kp_statusi_postopkov(id, code, name, sort_order) VALUES
  ('00000000-0000-4000-8000-000500000001','OSNUTEK','Osnutek',10),
  ('00000000-0000-4000-8000-000500000002','AKTIVEN','Aktiven',20),
  ('00000000-0000-4000-8000-000500000003','ARHIVIRAN','Arhiviran',30);

-- Same normalisation as toCode() in src/lookups.ts: 'PRIPRAVA _0' -> 'PRIPRAVA_0', 'Ročno delo' -> 'ROCNO_DELO'.
CREATE FUNCTION pg_temp.kp_code(v text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(regexp_replace(upper(translate(btrim(v), 'čćšžđČĆŠŽĐ', 'ccszdCCSZD')), '\s*_\s*', '_', 'g'), '\s+', '_', 'g')
$$;
INSERT INTO public.kp_skupine(code, name, sort_order) SELECT DISTINCT pg_temp.kp_code(group_name), btrim(group_name), 900 FROM public.kp_postopki ON CONFLICT (code) DO NOTHING;
INSERT INTO public.kp_pripadnosti(code, name, sort_order) SELECT DISTINCT pg_temp.kp_code(affiliation), btrim(affiliation), 900 FROM public.kp_postopki ON CONFLICT (code) DO NOTHING;
INSERT INTO public.kp_faze_testa(code, name, sort_order) SELECT DISTINCT pg_temp.kp_code(test_phase), btrim(test_phase), 900 FROM public.kp_postopki ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.kp_postopki
  ADD COLUMN input_type_id uuid REFERENCES public.kp_tipi_vnosa(id),
  ADD COLUMN group_id uuid REFERENCES public.kp_skupine(id),
  ADD COLUMN affiliation_id uuid REFERENCES public.kp_pripadnosti(id),
  ADD COLUMN test_phase_id uuid REFERENCES public.kp_faze_testa(id),
  ADD COLUMN status_id uuid REFERENCES public.kp_statusi_postopkov(id);
UPDATE public.kp_postopki p SET
  input_type_id = (SELECT id FROM public.kp_tipi_vnosa WHERE code = p.input_type),
  group_id = (SELECT id FROM public.kp_skupine WHERE code = pg_temp.kp_code(p.group_name)),
  affiliation_id = (SELECT id FROM public.kp_pripadnosti WHERE code = pg_temp.kp_code(p.affiliation)),
  test_phase_id = (SELECT id FROM public.kp_faze_testa WHERE code = pg_temp.kp_code(p.test_phase)),
  status_id = (SELECT id FROM public.kp_statusi_postopkov WHERE code = p.procedure_status);
ALTER TABLE public.kp_postopki
  ALTER COLUMN input_type_id SET NOT NULL, ALTER COLUMN group_id SET NOT NULL, ALTER COLUMN affiliation_id SET NOT NULL,
  ALTER COLUMN test_phase_id SET NOT NULL, ALTER COLUMN status_id SET NOT NULL;
-- The text values now live in the lookup tables; the old columns are replaced by the ID columns above.
ALTER TABLE public.kp_postopki DROP COLUMN input_type, DROP COLUMN group_name, DROP COLUMN affiliation, DROP COLUMN test_phase, DROP COLUMN procedure_status;
CREATE INDEX ON public.kp_postopki(input_type_id);
CREATE INDEX ON public.kp_postopki(group_id);
CREATE INDEX ON public.kp_postopki(affiliation_id);
CREATE INDEX ON public.kp_postopki(test_phase_id);
CREATE INDEX ON public.kp_postopki(status_id);

-- Snapshot now carries the input type code next to link and procedure (see Step in src/types.ts).
CREATE OR REPLACE FUNCTION public.kp_submit_test(p_id uuid, p_item_id uuid, p_answers jsonb, p_expected_snapshot jsonb)
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
  SELECT jsonb_agg(jsonb_build_object('link', to_jsonb(l) - 'created_at' - 'updated_at', 'procedure', to_jsonb(p) - 'created_at' - 'updated_at', 'input_type', t.code) ORDER BY l.sort_order, p.code)
    INTO v_snapshot FROM public.ln_kp_artikel_postopki l
    JOIN public.kp_postopki p ON p.id = l.procedure_id
    JOIN public.kp_tipi_vnosa t ON t.id = p.input_type_id
    JOIN public.kp_statusi_postopkov s ON s.id = p.status_id
    WHERE l.product_id = v_product AND l.visible AND l.active AND p.visible AND p.active AND s.code = 'AKTIVEN'
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
    v_type := v_step->>'input_type';
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
COMMIT;
