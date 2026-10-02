# FINES – Kontrolne točke

Lokalni projekt React + TypeScript + Vite, pripravljen za Supabase in Vercel. Navodila v [rbo_instructions.md](rbo_instructions.md) veljajo za vse nadaljnje spremembe; nanje opozarja tudi `AGENTS.md`.

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
4. V Authentication → Users ustvarite potrjen račun za prvega administratorja. Profil se ustvari samodejno z vlogo `tester`.
5. V SQL Editor izvedite spodnjo poizvedbo s svojo dejansko e-pošto:

```sql
UPDATE public.kp_uporabniki
SET role = 'admin'
WHERE id = (
  SELECT id FROM auth.users WHERE email = 'vasa.eposta@fines.si'
);
```

6. Kopirajte `.env.example` v `.env.local` in izpolnite:

```dotenv
VITE_SUPABASE_URL=https://VAS-PROJEKT.supabase.co
VITE_SUPABASE_ANON_KEY=VAS-JAVNI-PUBLISHABLE-ALI-ANON-KLJUC
```

Uporabite **publishable / anon** ključ. `service_role` ali `sb_secret_...` ključa nikoli ne vnašajte v Vite spremenljivke, ker je vse z `VITE_` vidno v brskalniku. Javni ključ je zaščiten z RLS. Ponovno zaženite razvojni strežnik po spremembi okolja. Če je nastavljena samo ena spremenljivka, aplikacija pokaže napako konfiguracije.

V Authentication nastavite Site URL na naslov aplikacije. Račune zaposlenih ustvarja administrator v Supabase Authentication; če aplikacijo uporabljajo samo zaposleni, izključite javno registracijo. Nadaljnje vloge in aktivnost računov lahko prvi administrator ureja v zavihku Admin. Svoje vloge ali dostopa ne more spreminjati prek aplikacije.

### Podatkovni model

| Tabela | Namen |
| --- | --- |
| `kp_postopki` | Definicije kontrolnih točk iz `KP_Postopki.csv` |
| `kp_artikli` | Artikli iz `KP_Artikli.csv`; šifra ostane besedilo |
| `ln_kp_artikel_postopki` | Povezave iz `KP_ArtikelPostopki.csv`, vrstni red, meje, posebna navodila, veljavnost |
| `kp_uporabniki` | Profil, vloga in omogočen dostop; ID je Supabase Auth UUID |
| `kp_delovni_nalogi` | Pripravljeno za poznejši uvoz nalogov iz administrativne baze |
| `ln_kp_nalog_artikli` | Posamezni fizični izdelki naloga s serijsko številko |
| `kp_testi` | Zaključeni testi, izvajalec, rezultat in posnetek postopkov |
| `ln_kp_test_rezultati` | Rezultat in opomba za vsako kontrolno točko testa |

Vse tabele imajo primarni ID, `visible`, `created_at` in `updated_at`. Tabelne pravice in sprožilec preprečujejo brisanje zapisov. Aplikacija uporablja `visible = false`, ponuja prikaz skritih zapisov in obnovitev. `active` je ločena nastavitev za uporabo pri novih testih.

Prevod stolpcev je neposredno razviden iz [scripts/import-csv.ps1](scripts/import-csv.ps1). `Pravilno` pomeni `true`, prazne opcijske vrednosti pomenijo `NULL`, `8. 08. 2026` se pretvori v `2026-08-08`. Šifre, npr. `100-201.000010`, so besedilo. Vrstni red CSV postopkov se ohrani, vključno s KP-0010 pred KP-0009.

Izvoz povezav ima `Postopek = 1`, vendar izvoz postopkov ne vsebuje izvornih MS Lists ID-jev. Edino povezavo smo preverili tudi prek naslova `100-301|KP-0001` in kode artikla. Generator zavrne uvoz, če se naslov s tem preslikovanjem ne ujema. Za večji prihodnji uvoz bo treba izvoziti dejanske MS Lists ID-je.

Za ponovno generiranje začetnih podatkov:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/import-csv.ps1
```

Generator ustvari `src/seed.json` in `supabase/002_seed.sql`. Izvornih CSV ali `.msapp` ne spreminja.

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
