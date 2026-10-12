// Version history shown behind the "i" icon. Newest first.
// Small fixes raise the minor number (1.01 -> 1.02); a new feature or page raises the major number (1.xx -> 2.01).
export type Release = { version: string; date: string; title: string; changes: string[] };
export const changelog: Release[] = [
  {
    version: '5.04', date: '2026-10-12', title: 'Vrsta HTB za OC-B',
    changes: [
      'Nova vrsta HTB: vse OC-B peči z nazivom na HTB (HTB5, HTB10, HTBM-60 …). Na voljo je v filtru Vrsta, pri testnih postopkih in v urejanju artikla.',
      'HTB ima prednost pred S, D2 in M2 (HTB10-D2 je vrsta HTB).',
    ],
  },
  {
    version: '5.03', date: '2026-10-12', title: 'Vrsta CL za OC-B',
    changes: [
      'Nova vrsta CL velja samo za OC-B peči z nazivom na FB (npr. FB5-S CL E1); CL ima prednost pred S.',
      'CL je na voljo samo pri tipu OC-B (testni postopki, dodajanje postopkov, urejanje artikla).',
      'Oznaka D brez 2 se ne uporablja več in se ne prepozna kot vrsta.',
    ],
  },
  {
    version: '5.02', date: '2026-10-12', title: 'Tip in vrsta peči iz naziva',
    changes: [
      'Tipi peči so OC-B (FB, HTB), OC-A (FBM), OD-C (FD), PV-B (HTBP), OP-D (ES660) in SCH (SCH-660). Tip se samodejno prepozna iz začetka naziva peči.',
      'Vrste peči S Smart, D2 Digital in M2 Manual se prepoznajo iz oznake v nazivu (npr. FD68H1/1 D2, HTBP16-M).',
      'Na seznamu Artikli sta preprosta filtra Tip peči in Vrsta; izbira OD-C prikaže vse FD peči (S, D2, M2).',
      'Testni postopki peči: levo okence Tip peči, pod njim okence Vrsta (Vse vrste, S, D2, M2). Postopki za »Vse vrste« veljajo za vse peči tipa, ostali samo za izbrano vrsto.',
      'Tip in vrsto lahko v urejanju artikla izberete tudi ročno; nove peči ob shranjevanju dobijo testni postopek, »Uskladi peči« ga doda obstoječim.',
      'Nova migracija supabase/009_vrste_peci.sql; peči in testni postopki iz 5.01 se prenesejo na nov tip in vrsto.',
    ],
  },
  {
    version: '5.01', date: '2026-10-08', title: 'Tipi peči in testni postopki',
    changes: [
      'Tipi peči (pripadnosti): OC-B S, OC-B CL, OC-A S, OC-A S CL, OD-C S, OD-C D2, OP-D M, OP-D D2, PV-B S, PV-B D2 in SCH. Vsak ima svoj testni postopek.',
      'Vsaka peč (šifra) ima tip; nastavi se v urejanju artikla ali z gumbom »Tip peči« za več izbranih šifer. Peč ob tem dobi vse postopke testnega postopka tipa.',
      'Dodaj postopke ima izbiro »Tipe peči«: postopki se dodajo v testni postopek izbranih tipov in vsem njihovim pečem.',
      'Nova stran Testni postopki peči: pregled postopkov in peči vsakega tipa, dodajanje, odstranjevanje in »Uskladi peči«.',
      'Filter Pripadnost na seznamu Artikli je zamenjan s filtrom po tipu peči (z možnostjo »Brez tipa«).',
      'Nova migracija supabase/008_tipi_peci.sql.',
    ],
  },
  {
    version: '4.02', date: '2026-10-08', title: 'Hitrejše urejanje šifer',
    changes: [
      'Kopiraj postopke: vse postopke druge šifre z vrstnim redom, mejami, navodili in meritvami prenese na odprto ali na vse izbrane šifre. Obstoječi postopki ostanejo nespremenjeni.',
      'Dodaj postopke: več postopkov naenkrat, z iskanjem ter filtrom po pripadnosti (vključno z ALL) in skupini; »Izberi vse prikazane« izbere npr. vse postopke za OCA.',
      'Pripravljeno za več šifer: z izbranimi šiframi gumb potrdi vse šifre s statusom V delu; šifre brez postopkov preskoči.',
    ],
  },
  {
    version: '4.01', date: '2026-10-08', title: 'Status šifer za proizvodnjo',
    changes: [
      'Vsaka šifra ima status: Manjka (rdeč, brez kontrolnih postopkov), V delu (rumen, postopki so v izdelavi) in Pripravljeno (zelen, potrjeno za proizvodnjo).',
      'Šifre brez postopkov so označene s klicajem in prikazane na vrhu seznama; opozorilo nad seznamom pove, koliko jih je. Nove šifre iz sinhronizacije bodo tako takoj vidne.',
      'Gumb »Pripravljeno« potrdi šifro za proizvodnjo, »Vrni v delo« potrditev prekliče. Šifre brez postopkov ni mogoče potrditi.',
      'Seznam Artikli ima filter po statusu s številom šifer v vsakem statusu.',
      'Nova migracija supabase/007_status_artikla.sql doda stolpec ready_for_production v kp_artikli.',
    ],
  },
  {
    version: '3.06', date: '2026-10-06', title: 'Pregledno drsenje artiklov',
    changes: [
      'Seznam Artikli prikaže 4 artikle hkrati; ostali so dosegljivi z drsenjem.',
      'Vse vrstice so enako visoke, drsenje se poravna na začetek artikla; šifra in pripadnost sta v eni vrstici.',
      'Med artikli se lahko premikate s puščicama gor in dol; izbrani artikel ostane viden v seznamu.',
      'Tabela Kontrolni postopki prikaže 3 postopke hkrati, ostali so dosegljivi z drsenjem; glava tabele ostane vidna, ob naslovu je število postopkov.',
    ],
  },
  {
    version: '3.05', date: '2026-10-06', title: 'Drsenje seznama artiklov',
    changes: [
      'Okno Artikli se prilagodi višini zaslona in ostane vidno ob pomikanju strani; seznam artiklov se drsi znotraj okna.',
      'Seznam artiklov ima stalno višino in vedno viden drsnik, tudi kadar je artiklov malo.',
      'Senca na vrhu in dnu seznama nakaže, da je artiklov več.',
      'V nogi okna je prikazano število prikazanih in izbranih artiklov.',
    ],
  },
  {
    version: '3.04', date: '2026-10-06', title: 'Filter artiklov po pripadnosti',
    changes: [
      'Na seznamu Artikli je filter po pripadnosti z izbiro več vrednosti hkrati (prikaže artikle z vsaj eno izbrano pripadnostjo).',
      'Pripadnost artikla izhaja iz povezanih kontrolnih postopkov (kp_pripadnosti prek ln_kp_postopki_pripadnost) in je izpisana pod šifro artikla.',
    ],
  },
  {
    version: '3.03', date: '2026-10-06', title: 'Izbira več artiklov hkrati',
    changes: [
      'Na seznamu Artikli lahko z potrditvenimi polji označite več artiklov (peči) hkrati ali vse prikazane.',
      'Gumb »Dodaj postopek« z izbranimi artikli poveže isti postopek z vsemi naenkrat; artikli, ki ga že imajo, ostanejo nespremenjeni.',
      'Seznam artiklov je kompaktnejši in se pri večjem številu artiklov pomika znotraj okna.',
      'Gumb »Dodaj postopek« je premaknjen v glavo artikla desno spodaj.',
    ],
  },
  {
    version: '3.02', date: '2026-10-03', title: 'Številčni ID-ji v bazi',
    changes: [
      'Vse tabele imajo ID-je 1, 2, 3 … namesto dolgih UUID oznak (migracija supabase/006_stevilcni_id.sql); vsi podatki in povezave ostanejo.',
      'Postopki imajo ID enak številki kode (KP-0007 = 7), šifranti so oštevilčeni po vrstnem redu.',
      'Izjemi: kp_uporabniki.id ostane UUID iz Supabase prijave; kp_testi.submission_id varuje pred podvojeno oddajo testa.',
      'Uvoz postopkov (005) je en sam ukaz, ki deluje tudi v Supabase SQL Editorju.',
    ],
  },
  {
    version: '3.01', date: '2026-10-03', title: 'Več pripadnosti, več meritev in uvoz postopkov',
    changes: [
      'Postopek ima lahko več pripadnosti (nova povezovalna tabela ln_kp_postopki_pripadnost); izbira z gumbi v obrazcu, nov stolpec in filter Pripadnost v tabeli.',
      'Nov tip vnosa »Več meritev«: meritve (ime, enota, nominalno, min, max) se določijo na povezavi postopka z artiklom (tabela kp_meritve), izvajalec jih vnese v testu.',
      'Pri tipu »Meritev« se na artiklu vnese tudi ime meritve.',
      'Uvoz 284 kontrolnih postopkov iz obrazca Končni preizkus (supabase/005_uvoz_postopkov.sql); KP-0001 do KP-0010 so posodobljeni.',
      'ID postopka je zaklenjen. Odstranjena sta polje Zaporedna številka in kljukica Aktiven; o uporabi odloča samo status.',
      'Vrstni red se ne sme podvojiti; shranjevanje s podvojeno številko je zavrnjeno.',
    ],
  },
  {
    version: '2.01', date: '2026-10-03', title: 'Šifranti v bazi in premikanje vrstnega reda',
    changes: [
      'Tip vnosa, skupina, pripadnost, faza testa in status imajo svoje SQL tabele (kp_tipi_vnosa, kp_skupine, kp_pripadnosti, kp_faze_testa, kp_statusi_postopkov); postopki se nanje vežejo z ID-ji.',
      'Nov tip vnosa Foto in nove faze Avtomatski test 400, Kontrola 600 in Zaključek 800.',
      'Vrstni red postopkov se spremeni z vlečenjem vrstice ali s puščicami gor/dol ob izbrani vrstici.',
      'Ikona »i« z zgodovino sprememb in verzij.',
      'Vsi gumbi imajo opis ob prehodu z miško.',
      'Manjši odmiki in naslovi, drobtinice v obliki puščic, modri gumb Osveži podatke, oznake DA/NE in faze brez velikih črk.',
    ],
  },
  {
    version: '1.02', date: '2026-10-03', title: 'Nova stran Definicija kontrolnih postopkov',
    changes: [
      'Filtri po ID-ju, nazivu, vrstnem redu, skupini in fazi.',
      'Tabela postopkov (75 %) in desni del z vsemi podrobnostmi in urejanjem; na tablici in telefonu se podrobnosti odprejo čez stran.',
      'Kopiranje postopka na dno tabele in brisanje s skrivanjem (visible = false).',
    ],
  },
  {
    version: '1.01', date: '2026-10-02', title: 'Osnovna spletna verzija',
    changes: ['Prenos iz PowerApps: kontrola kakovosti, definicija postopkov, povezave postopkov in izdelkov, administracija, prijava in demo način.'],
  },
];
export const currentVersion = changelog[0].version;
