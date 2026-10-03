// Version history shown behind the "i" icon. Newest first.
// Small fixes raise the minor number (1.01 -> 1.02); a new feature or page raises the major number (1.xx -> 2.01).
export type Release = { version: string; date: string; title: string; changes: string[] };
export const changelog: Release[] = [
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
