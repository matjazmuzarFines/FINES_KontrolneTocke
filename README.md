# FINES – Kontrolne točke

Lokalni projekt React + TypeScript + Vite, pripravljen za Supabase in Vercel. Navodila v [kp_instructions.md](kp_instructions.md) veljajo za vse nadaljnje spremembe; nanje opozarja tudi `AGENTS.md`.

## Lokalni zagon

Potrebujete Node.js 22.12 ali novejši.

```sh
npm install
npm run dev
```

Odprite `http://localhost:5173`. Brez okolijskih spremenljivk aplikacija deluje v **demonstracijskem načinu**. Podatki iz CSV in spremembe se shranijo samo v lokalno shrambo trenutnega brskalnika. Demo način ni namenjen proizvodnim rezultatom in se ne sinhronizira v Supabase.

V tem delovnem okolju je prenosni Node.js tudi v `.tools/node-v22.23.3-win-x64` (mapa je izključena iz Git). Če Node ni v PATH, lahko uporabite PowerShell:

```powershell
$env:Path = (Join-Path (Get-Location) '.tools/node-v22.23.3-win-x64') + ';' + $env:Path
& ./.tools/node-v22.23.3-win-x64/npm.cmd run dev
```

## Supabase – SQL v tem vrstnem redu

1. Ustvarite Supabase projekt in odprite SQL Editor.
2. Izvedite celotno [supabase/001_schema.sql](supabase/001_schema.sql), **enkrat**. Ustvari tabele, relacije, omejitve, RLS, uporabniške profile in funkcijo za shranjevanje testa. Ponoven zagon sheme je namenoma zavrnjen, da ne prepiše obstoječe baze.
3. Izvedite [supabase/002_seed.sql](supabase/002_seed.sql). Uvozi **10 postopkov, 4 artikle in 1 povezavo**, brez izmišljenih proizvodnih podatkov. Skripto za uvoz lahko ponovite: obstoječih zapisov ne prepiše. Obe skripti sta transakcijski.
4. Izvedite [supabase/003_sifranti.sql](supabase/003_sifranti.sql), **enkrat** in **po** `002`. Ustvari šifrante za dropdowne (tip vnosa, skupina, pripadnost, faza testa, status), besedilne vrednosti postopkov pretvori v ID-je šifrantov in posodobi `kp_submit_test`. Neznane obstoječe vrednosti doda v šifrant, zato se noben podatek ne izgubi. Po tej migraciji `002` ni več mogoče ponovno zagnati.
5. Izvedite [supabase/004_pripadnosti_meritve.sql](supabase/004_pripadnosti_meritve.sql), **enkrat**. Doda tip vnosa »Več meritev«, povezovalno tabelo pripadnosti `ln_kp_postopki_pripadnost` (obstoječa pripadnost se prenese), tabelo `kp_meritve` in posodobi `kp_submit_test`.
6. Izvedite [supabase/005_uvoz_postopkov.sql](supabase/005_uvoz_postopkov.sql). Uvozi 284 postopkov iz obrazca Končni preizkus (`data/2209120930AN_...xlsm`). KP-0001 do KP-0010 posodobi in ohrani njihove povezave, ostale doda. Skripto lahko ponovite.
7. Izvedite [supabase/006_stevilcni_id.sql](supabase/006_stevilcni_id.sql), **enkrat** in **po** `005`. Vse ID-je pretvori v številke 1, 2, 3 … (postopki po kodi: KP-0007 = 7, šifranti po vrstnem redu) in ohrani vse podatke ter povezave. Izjemi sta `kp_uporabniki.id` (UUID iz Supabase Auth) in `kp_testi.submission_id` (ključ za varno ponovitev oddaje testa).
8. V Authentication → Users ustvarite potrjen račun za prvega administratorja. Profil se ustvari samodejno z vlogo `tester`.
9. V SQL Editor izvedite spodnjo poizvedbo s svojo dejansko e-pošto:

```sql
UPDATE public.kp_uporabniki
SET role = 'admin'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'vasa.eposta@fines.si'
);
```

10. Kopirajte `.env.example` v `.env.local` in izpolnite:

```dotenv
VITE_SUPABASE_URL=https://VAS-PROJEKT.supabase.co
VITE_SUPABASE_ANON_KEY=VAS-JAVNI-PUBLISHABLE-ALI-ANON-KLJUC
```

Uporabite **publishable / anon** ključ. `service_role` ali `sb_secret_...` ključa nikoli ne vnašajte v Vite spremenljivke, ker je vse z `VITE_` vidno v brskalniku. Javni ključ je zaščiten z RLS. Ponovno zaženite razvojni strežnik po spremembi okolja. Če je nastavljena samo ena spremenljivka, aplikacija pokaže napako konfiguracije.

V Authentication nastavite Site URL na naslov aplikacije. Račune zaposlenih ustvarja administrator v Supabase Authentication; če aplikacijo uporabljajo samo zaposleni, izključite javno registracijo. Nadaljnje vloge in aktivnost računov lahko prvi administrator ureja v zavihku Admin. Svoje vloge ali dostopa ne more spreminjati prek aplikacije.

### Podatkovni model

| Tabela | Namen |
| --- | --- |
| `kp_postopki` | Definicije kontrolnih točk iz `KP_Postopki.csv`; dropdown vrednosti so ID-ji šifrantov |
| `kp_tipi_vnosa` | Šifrant tipov vnosa: DA/NE, OK/NOK, Meritev, Več meritev, Besedilo, Foto |
| `kp_skupine` | Šifrant skupin: Vizualno, Funkcija, Elektrika, Ročno delo |
| `kp_pripadnosti` | Šifrant pripadnosti: ALL, OCA, OCB, ODC, OPD, PV-B, SCH |
| `kp_faze_testa` | Šifrant faz: Priprava 0, Pred zagonom 100, Ročni test 200, Avtomatski test 400, Kontrola 600, Zaključek 800 |
| `kp_statusi_postopkov` | Šifrant statusov: Osnutek, Aktiven, Arhiviran |
| `ln_kp_postopki_pripadnost` | Pripadnosti postopka: `id`, `id_postopka`, `id_pripadnosti`; ena vrstica na pripadnost |
| `kp_meritve` | Meritve povezave artikel–postopek za tip »Več meritev«: ime, enota, nominalno, min, max |
| `kp_artikli` | Artikli iz `KP_Artikli.csv`; šifra ostane besedilo |
| `ln_kp_artikel_postopki` | Povezave iz `KP_ArtikelPostopki.csv`, vrstni red, meje, posebna navodila, veljavnost |
| `kp_uporabniki` | Profil, vloga in omogočen dostop; ID je Supabase Auth UUID |
| `kp_delovni_nalogi` | Pripravljeno za poznejši uvoz nalogov iz administrativne baze |
| `ln_kp_nalog_artikli` | Posamezni fizični izdelki naloga s serijsko številko |
| `kp_testi` | Zaključeni testi, izvajalec, rezultat in posnetek postopkov |
| `ln_kp_test_rezultati` | Rezultat in opomba za vsako kontrolno točko testa |

Vse tabele imajo številčni primarni ID (1, 2, 3 …; razen `kp_uporabniki`), `visible`, `created_at` in `updated_at`. Tabelne pravice in sprožilec preprečujejo brisanje zapisov. Aplikacija uporablja `visible = false`, ponuja prikaz skritih zapisov in obnovitev. `active` je ločena nastavitev za uporabo pri novih testih.

Prevod stolpcev je neposredno razviden iz [scripts/import-csv.ps1](scripts/import-csv.ps1). `Pravilno` pomeni `true`, prazne opcijske vrednosti pomenijo `NULL`, `8. 08. 2026` se pretvori v `2026-08-08`. Šifre, npr. `100-201.000010`, so besedilo. Vrstni red CSV postopkov se ohrani, vključno s KP-0010 pred KP-0009.

Izvoz povezav ima `Postopek = 1`, vendar izvoz postopkov ne vsebuje izvornih MS Lists ID-jev. Edino povezavo smo preverili tudi prek naslova `100-301|KP-0001` in kode artikla. Generator zavrne uvoz, če se naslov s tem preslikovanjem ne ujema. Za večji prihodnji uvoz bo treba izvoziti dejanske MS Lists ID-je.

Uvoz obrazca Končni preizkus: razvrstitev postopkov (naziv, tip vnosa, enota, skupina, faza, pripadnost) je v [src/uvoz-postopki.json](src/uvoz-postopki.json). Faza je določena po zaporedju v obrazcu, pripadnost iz stolpcev izdelkov (FD = ODC, HTBM = PV-B, HTB/FB = OCB, FBM = OCA, ES = OPD, SCH = SCH; Thermico in Condilux sta brez pripadnosti). Po spremembi JSON ponovno ustvarite SQL z `node scripts/generate-uvoz-sql.mjs`. Demo način uporablja isti JSON.

Za ponovno generiranje začetnih podatkov:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/import-csv.ps1
```

Generator ustvari `src/seed.json` in `supabase/002_seed.sql` v izvorni (besedilni) obliki; `003_sifranti.sql` oziroma demo način (`src/lookups.ts`) vrednosti pretvorita v ID-je šifrantov. Šifranti imajo `code` (stabilna oznaka, ki jo uporablja logika) in `name` (prikaz); ID-ji začetnih vrednosti so enaki v SQL in v `src/lookups.ts`. Izvornih CSV ali `.msapp` ne spreminja.

### Dostop in shranjevanje rezultatov

- **Izvajalec (`tester`)** bere postopke, izvede test in shrani rezultate.
- **Razvojnik (`developer`)** dodatno ureja postopke, artikle in njihove povezave.
- **Administrator (`admin`)** dodatno ureja druge uporabniške profile.

Pravice so uveljavljene v bazi, ne samo s skritimi gumbi. Anonimni uporabniki nimajo dostopa. Onemogočen uporabnik ne more brati poslovnih podatkov ali shraniti testa. Naloge in postavke za zdaj vstavi upravljavec v SQL Editorju; brskalnik nima dovoljenja za njihov vnos ali spreminjanje.

`kp_submit_test` preveri trenutne postopke, obvezne korake, tip rezultata, meje, poka-yoke in uporabnika. Celoten test in vse rezultate shrani v eni transakciji. Posnetek definicij ohrani zgodovino tudi po poznejši spremembi postopka. Če se definicije med testiranjem spremenijo, je zaključek zavrnjen in potreben nov test. Isti ID oddaje podpira ponovitev iste zahteve po omrežni napaki. Zaklep postavke in unikatni indeks preprečita dvojni uspešen zaključek istega fizičnega izdelka.

Neustrezen rezultat se lahko shrani in pozneje ponovi; uspešno testirani izdelki štejejo kot zaključeni. `DA` in `OK` pomenita ustrezen rezultat, `NE` in `NOK` neustrezen. Meritev je ustrezna znotraj vključenih meja; če meja ni določena, se ta stran ne omeji. Decimalna vejica je podprta. Poka-yoke zahteva ustrezen rezultat za nadaljevanje. Preskok je dovoljen samo pri neobvezni točki brez poka-yoke.

## Vercel

1. Potisnite projekt v svoj GitHub repozitorij.
2. V Vercel izberite Add New → Project in uvozite repozitorij.
3. Framework je **Vite**, build `npm run build`, output `dist`, Node.js **22.x**.
4. Pred objavo nastavite `VITE_SUPABASE_URL` in `VITE_SUPABASE_ANON_KEY` za ustrezna okolja. Če ju izpustite, se objavi demo način.
5. Objavite projekt. `vercel.json` vsebuje konfiguracijo gradnje in SPA fallback. Po spremembi okolijskih spremenljivk je potreben redeploy.

Po spremembah projekta objavite novo različico na Vercel. Aplikacija in Supabase morata uporabljati enaka imena tabel (`kp_...`, `ln_kp_...`) in funkcijo `kp_submit_test`. Osnova temelji na uradnih navodilih za [Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) in [prijavo z geslom](https://supabase.com/docs/reference/javascript/auth-signinwithpassword).

## Preverjanje

```sh
npm run build
npm test
npm run test:e2e
```

Brskalniški testi uporabljajo lokalno nameščen Google Chrome in preverijo namizni ter mobilni pogled. `npm test` vključuje tudi preverjanje SQL v lokalnem PostgreSQL (PGlite): to preveri shemo in pravila, ne nadomesti integracijskega preizkusa na vašem dejanskem Supabase projektu.

## Kaj je vključeno in kaj sledi

Vključeno: FINES logotip, barvna shema iz navodil, stalna navigacija, Nazaj in Izhod, prilagodljiva postavitev, iskanje in filtri postopkov, ustvarjanje in urejanje, skrivanje in obnovitev, povezovanje z artikli, posebna navodila in meje, vodena kontrola, shranjevanje in pregled rezultatov, prijava in vloge.

Originalni logo je pridobljen iz `data/Fines - Kontrolni postopki.msapp`. Izvorni zasloni so `HomeScreen`, `NastavitvePostopkiScreen` in `NastavitvePovezaveScreen`. Preneseni so navigacija, oranžna `#CA5010`, artikli, postopki ter obrazec nastavitev povezav; web postavitev je prilagojena različnim zaslonom.

Naslednje faze: povezava z administrativno bazo, shranjevanje in upravljanje fotografij v Supabase Storage, nadaljevanje prekinjenega testa ter podrobnejša pravila ponovnega testiranja. Obvezna fotografija se že ohrani iz podatkov, vendar **prepreči zaključek koraka**, dokler nalaganje ni implementirano. Test se trenutno shrani šele ob zaključku; zapiranje ali prekinitev zavrže neshranjene odgovore s predhodnim opozorilom.

Gumb Izhod v povezanem načinu odjavi uporabnika. Brskalnik običajno ne dovoli zapiranja zavihka, ki ga aplikacija ni odprla, zato aplikacija prikaže stran »Aplikacija je zaprta«.
