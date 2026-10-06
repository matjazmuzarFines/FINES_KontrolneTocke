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

## Gumbi, Sliderji, Prikazovalniki

- Vsi gumbi, sliderji, ikonce, prikazovalniki morajo nujno imeti hover text, ki pove kaj točno bo ta gumb naredil. Maximum 6 do 8 besed. Recimo gumb "Dodaj" mora imeti hover "Dodaj nov kontrolni postopek" če gumb doda nov kontrolni postopek itd.

## Baza SQL
- Podatkov se ne sme brisati. Posložujemo se visible = true/false. Če bo potrebno brisanje bo to izrecno povedano
- Slike se v večini morajo brisati, zaradi prostora in synca
- Vsaka tabela mora imeti svoje IDje zaradi povezav. V primeru večih tabel na isti komponenti je potrebno narediti tudi povezovalno tabelo
- tabele se morajo imenovati: {ime projekta v 2 ali 3 črkah}_......, povezovalne tabele so: ln_{ime projekta v 2 ali 3 črkah}_{tabela 1}_{tabela 2}... Primer: Projekt Kontrolni postopki: kp_..., ln_kp_... Projekt Rabljena oprema: rbo_..., ln_rbo_....

## Spremembe
- App mora imeti v desnem zgornjem kotu ikonco "i" kot informacije. na klik se odpre popup kjer bova pisala vse spremembe in verzije. Vsakič ko narediš spremembe dodaj številko in summariziraj kaj je bilo spremenjeno in narejeno. Številke delaj 1.XX. Recimo 1.01, potem spremembe 1.02, ... in če narediva večje spremembe ali dodava kompletno novo funkcijo ali podstran je potrebno dvigniti številko na 2.01. in potem male spremembe naprej. Številko dvignejo, večje spremembe. Majhni popravki oblik, tekstov ne sodijo v večje spremembe.