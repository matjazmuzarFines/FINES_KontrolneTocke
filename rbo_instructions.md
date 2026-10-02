# Navodila in smernice za izdelavo aplikacije

## Generalne smernice
- Vse komponente morajo biti standardne in enotne - (enake oblike, enake barve, enake velikost, enako osenčenje za vsako posamezno komponento - dropdown, score, button, tabela)
- Vsaka stran mora imeti Fines logo, gumb nazaj (razen homepage), gumb izhod oz. close app
- GUI mora biti izdelan in variabilno nastavljen tako, da se komponente lepo zlagajo in prikažejo tako za katere koli velikosti monitor, televizijo in prav tako za tablico in telefon.


## Barve
Uporabljaj izključno barve podjetja Fines d.o.o.
- Primary: Temno oranžna
- Secondary: Temno siva ali odtenki sive, bela, črna

Razni funkcijski gumbi in opozorila so seveda druge barve.
- Add gumb / potrdi / shrani je živo zelen
- Izbriši, odstrani je rdeč
- Razna opozorila rumena
- Razni synki in ostali funkcijski gumbi ki kličejo zunanje funkcije izven vercel appa so modri

## Baza SQL
- Podatkov se ne sme brisati. Posložujemo se visible = true/false. Če bo potrebno brisanje bo to izrecno povedano
- Slike se v večini morajo brisati, zaradi prostora in synca
- Vsaka tabela mora imeti svoje IDje zaradi povezav. V primeru večih tabel na isti komponenti je potrebno narediti tudi povezovalno tabelo
- tabele se morajo imenovati: kp_......, povezovalne tabele so: ln_kp_...