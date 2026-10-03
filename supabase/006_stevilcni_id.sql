-- FINES Kontrolne točke 3.02: human-readable numeric IDs (1, 2, 3 …) instead of UUIDs.
-- Execute ONCE in Supabase SQL Editor after 005_uvoz_postopkov.sql. One DO block = one atomic statement: on error nothing changes.
-- All rows and relations are kept; every table gets new numbers in a fixed order:
--   šifranti by sort_order, postopki and artikli by code (KP-0001 -> 1 …), povezave by their parent, other tables by created_at.
-- Exceptions: kp_uporabniki.id stays the Supabase Auth UUID (and kp_testi.tester_id with it);
-- kp_testi.submission_id keeps the UUID that the browser sends, so a repeated submit after a network error is recognised.
-- Snapshots of finished tests (kp_testi.snapshot/answers) are history and keep the IDs from the time of the test.
DO $migracija$
DECLARE
  t text;
  -- table, column, referenced table (all these columns are NOT NULL)
  fks text[][] := ARRAY[
    ['kp_postopki','input_type_id','kp_tipi_vnosa'], ['kp_postopki','group_id','kp_skupine'],
    ['kp_postopki','test_phase_id','kp_faze_testa'], ['kp_postopki','status_id','kp_statusi_postopkov'],
    ['ln_kp_artikel_postopki','product_id','kp_artikli'], ['ln_kp_artikel_postopki','procedure_id','kp_postopki'],
    ['ln_kp_nalog_artikli','order_id','kp_delovni_nalogi'], ['ln_kp_nalog_artikli','product_id','kp_artikli'],
    ['kp_testi','order_item_id','ln_kp_nalog_artikli'],
    ['ln_kp_test_rezultati','test_id','kp_testi'], ['ln_kp_test_rezultati','link_id','ln_kp_artikel_postopki'],
    ['ln_kp_postopki_pripadnost','id_postopka','kp_postopki'], ['ln_kp_postopki_pripadnost','id_pripadnosti','kp_pripadnosti'],
    ['kp_meritve','link_id','ln_kp_artikel_postopki']];
  tables text[] := ARRAY['kp_tipi_vnosa','kp_skupine','kp_pripadnosti','kp_faze_testa','kp_statusi_postopkov','kp_postopki','kp_artikli',
    'ln_kp_artikel_postopki','kp_delovni_nalogi','ln_kp_nalog_artikli','kp_testi','ln_kp_test_rezultati','ln_kp_postopki_pripadnost','kp_meritve'];
  i integer;
BEGIN
  IF to_regclass('public.ln_kp_postopki_pripadnost') IS NULL THEN RAISE EXCEPTION 'Najprej izvedite 003_sifranti.sql in 004_pripadnosti_meritve.sql.'; END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kp_postopki' AND column_name = 'id') <> 'uuid' THEN
    RAISE EXCEPTION 'Migracija 006 je že izvedena.';
  END IF;
  DROP FUNCTION public.kp_submit_test(uuid, uuid, jsonb, jsonb);

  -- 1. New numbers.
  FOREACH t IN ARRAY tables LOOP EXECUTE format('ALTER TABLE public.%I ADD COLUMN new_id bigint', t); END LOOP;
  FOREACH t IN ARRAY ARRAY['kp_tipi_vnosa','kp_skupine','kp_pripadnosti','kp_faze_testa','kp_statusi_postopkov'] LOOP
    EXECUTE format('UPDATE public.%1$I x SET new_id = n.rn FROM (SELECT id, row_number() OVER (ORDER BY sort_order, code COLLATE "C") rn FROM public.%1$I) n WHERE n.id = x.id', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['kp_postopki','kp_artikli'] LOOP
    EXECUTE format('UPDATE public.%1$I x SET new_id = n.rn FROM (SELECT id, row_number() OVER (ORDER BY code COLLATE "C") rn FROM public.%1$I) n WHERE n.id = x.id', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['kp_delovni_nalogi','ln_kp_nalog_artikli','kp_testi','ln_kp_test_rezultati'] LOOP
    EXECUTE format('UPDATE public.%1$I x SET new_id = n.rn FROM (SELECT id, row_number() OVER (ORDER BY created_at, id::text) rn FROM public.%1$I) n WHERE n.id = x.id', t);
  END LOOP;
  UPDATE public.ln_kp_artikel_postopki x SET new_id = n.rn FROM (
    SELECT l.id, row_number() OVER (ORDER BY a.new_id, l.sort_order, p.new_id) rn FROM public.ln_kp_artikel_postopki l
    JOIN public.kp_artikli a ON a.id = l.product_id JOIN public.kp_postopki p ON p.id = l.procedure_id) n WHERE n.id = x.id;
  UPDATE public.ln_kp_postopki_pripadnost x SET new_id = n.rn FROM (
    SELECT l.id, row_number() OVER (ORDER BY p.new_id, a.new_id) rn FROM public.ln_kp_postopki_pripadnost l
    JOIN public.kp_postopki p ON p.id = l.id_postopka JOIN public.kp_pripadnosti a ON a.id = l.id_pripadnosti) n WHERE n.id = x.id;
  UPDATE public.kp_meritve x SET new_id = n.rn FROM (
    SELECT m.id, row_number() OVER (ORDER BY l.new_id, m.sort_order, m.created_at, m.id::text) rn FROM public.kp_meritve m
    JOIN public.ln_kp_artikel_postopki l ON l.id = m.link_id) n WHERE n.id = x.id;

  -- 2. Foreign keys point to the new numbers; old UUID columns are replaced.
  FOR i IN 1 .. array_length(fks, 1) LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN new_%s bigint', fks[i][1], fks[i][2]);
    EXECUTE format('UPDATE public.%1$I x SET new_%2$s = r.new_id FROM public.%3$I r WHERE r.id = x.%2$I', fks[i][1], fks[i][2], fks[i][3]);
  END LOOP;
  FOR i IN 1 .. array_length(fks, 1) LOOP
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN %I CASCADE', fks[i][1], fks[i][2]);
    EXECUTE format('ALTER TABLE public.%I RENAME COLUMN new_%s TO %I', fks[i][1], fks[i][2], fks[i][2]);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET NOT NULL', fks[i][1], fks[i][2]);
  END LOOP;

  -- 3. Primary keys: bigint identity (next number continues after the highest one).
  ALTER TABLE public.kp_testi DROP CONSTRAINT kp_testi_pkey;
  ALTER TABLE public.kp_testi RENAME COLUMN id TO submission_id;
  ALTER TABLE public.kp_testi ADD CONSTRAINT kp_testi_submission_id_key UNIQUE (submission_id);
  FOREACH t IN ARRAY tables LOOP
    IF t <> 'kp_testi' THEN EXECUTE format('ALTER TABLE public.%I DROP COLUMN id CASCADE', t); END IF;
    EXECUTE format('ALTER TABLE public.%I RENAME COLUMN new_id TO id', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ADD PRIMARY KEY (id)', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY', t);
    EXECUTE format('SELECT setval(pg_get_serial_sequence(%L, %L), coalesce((SELECT max(id) FROM public.%I), 0) + 1, false)', 'public.' || t, 'id', t);
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', pg_get_serial_sequence('public.' || t, 'id'));
  END LOOP;

  -- 4. Relations, unique rules and indexes again.
  FOR i IN 1 .. array_length(fks, 1) LOOP
    EXECUTE format('ALTER TABLE public.%I ADD FOREIGN KEY (%I) REFERENCES public.%I(id)', fks[i][1], fks[i][2], fks[i][3]);
    EXECUTE format('CREATE INDEX ON public.%I(%I)', fks[i][1], fks[i][2]);
  END LOOP;
  ALTER TABLE public.ln_kp_artikel_postopki ADD UNIQUE (product_id, procedure_id);
  ALTER TABLE public.ln_kp_nalog_artikli ADD UNIQUE (order_id, serial_number);
  ALTER TABLE public.ln_kp_test_rezultati ADD UNIQUE (test_id, link_id);
  ALTER TABLE public.ln_kp_postopki_pripadnost ADD UNIQUE (id_postopka, id_pripadnosti);
  CREATE UNIQUE INDEX kp_one_passed_test_per_item ON public.kp_testi(order_item_id) WHERE passed AND visible;

  -- 5. p_id is the submission UUID from the browser (idempotent retry); the function returns the new numeric test ID.
  EXECUTE $fn$
CREATE FUNCTION public.kp_submit_test(p_id uuid, p_item_id bigint, p_answers jsonb, p_expected_snapshot jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_product bigint; v_snapshot jsonb; v_step jsonb; v_answer jsonb; v_measurement jsonb; v_test_id bigint;
  v_link public.ln_kp_artikel_postopki; v_type text; v_value text; v_number numeric;
  v_pass boolean; v_all_pass boolean := true; v_passed jsonb := '{}'::jsonb; v_existing public.kp_testi;
  v_today date := (now() AT TIME ZONE 'Europe/Ljubljana')::date;
BEGIN
  IF public.kp_role() IS NULL THEN RAISE EXCEPTION 'Ni dovoljenja za shranjevanje testa.'; END IF;
  SELECT * INTO v_existing FROM public.kp_testi WHERE submission_id = p_id;
  IF FOUND THEN
    IF v_existing.tester_id = auth.uid() AND v_existing.order_item_id = p_item_id AND v_existing.answers = p_answers THEN RETURN v_existing.id; END IF;
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
            v_number := replace(v_answer->'values'->>(v_measurement->>'id'), ',', '.')::numeric;
            IF v_number::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Neveljavna vrednost meritve.'; END IF;
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
  INSERT INTO public.kp_testi(submission_id, order_item_id, tester_id, passed, answers, snapshot)
    VALUES (p_id, p_item_id, auth.uid(), v_all_pass, p_answers, v_snapshot) RETURNING id INTO v_test_id;
  FOR v_step IN SELECT * FROM jsonb_array_elements(v_snapshot) LOOP
    SELECT a INTO v_answer FROM jsonb_array_elements(p_answers) a WHERE a->>'link_id' = v_step->'link'->>'id';
    INSERT INTO public.ln_kp_test_rezultati(test_id, link_id, value, note, skipped, passed, snapshot)
      VALUES (v_test_id, (v_step->'link'->>'id')::bigint, coalesce(v_answer->>'value', ''), coalesce(v_answer->>'note',''), coalesce((v_answer->>'skipped')::boolean,false),
              (v_passed->>(v_step->'link'->>'id'))::boolean, v_step);
  END LOOP;
  RETURN v_test_id;
END;
$$;
  $fn$;
  EXECUTE 'REVOKE ALL ON FUNCTION public.kp_submit_test(uuid,bigint,jsonb,jsonb) FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.kp_submit_test(uuid,bigint,jsonb,jsonb) TO authenticated';
END;
$migracija$;
