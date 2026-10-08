-- FINES Kontrolne točke 3.07: production readiness of a product (šifra).
-- Execute ONCE in Supabase SQL Editor after 006_stevilcni_id.sql.
-- The status shown in the app is derived:
--   Manjka       – the product has no visible linked procedure (new šifre from the sync start here),
--   V delu       – procedures are linked, development has not confirmed the product yet,
--   Pripravljeno – ready_for_production = true and at least one procedure is linked.
-- Only the confirmation is stored; existing products start as "V delu" or "Manjka".
DO $migracija$
BEGIN
  IF to_regclass('public.kp_meritve') IS NULL THEN RAISE EXCEPTION 'Najprej izvedite migracije 001 do 006.'; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'kp_artikli' AND column_name = 'ready_for_production') THEN
    RAISE EXCEPTION 'Migracija 007 je že izvedena.';
  END IF;
  ALTER TABLE public.kp_artikli ADD COLUMN ready_for_production boolean NOT NULL DEFAULT false;
  COMMENT ON COLUMN public.kp_artikli.ready_for_production IS 'Razvoj je potrdil, da so postopki šifre pripravljeni za proizvodnjo.';
END;
$migracija$;
