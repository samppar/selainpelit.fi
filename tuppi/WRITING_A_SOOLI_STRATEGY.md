# Kilpailevien sooli-tekoälyjen testaus

Kyllä — soolille voi kirjoittaa kilpailevia malleja ja mitata ne toisiaan
vastaan täsmälleen kuten peruspelin botit. Sooli-tekoäly on **oma pieni
moduulinsa** `sooli-strategies/`-kansiossa, ja kaksi valmista harnessia
ajaa ne toisiaan vastaan.

## Sooli lyhyesti

Rami-näytön jälkeen puolustaja voi pelata **yksin** kahta ramaajaa vastaan.
Ässä on **pienin**, soolaaja pelaa aina **viimeisenä**, soolaajan pari ei
pelaa. Soolaaja vaihtaa yhden kortin parinsa kanssa (pari antaa pienimmän).
**Soolaaja ei saa ottaa yhtään tikkiä** (24p onnistuu / 24p vastustajille
epäonnistuu).

## Malli = neljä funktiota

Kopioi `sooli-strategies/template.js`. Strategia vie `createSooliStrategy()`
joka palauttaa olion:

```js
{
  name,
  gift(view)         // SOOLAAJANA: minkä kortin annan parilleni?
  ret(view)          // parina: minkä kortin palautan soolaajalle? (pienin)
  soolaajaPlay(view) // SOOLAAJANA: lyönti — vältä tikkiä
  ramaajaPlay(view)  // PUOLUSTAJANA: lyönti — pakota soolaaja tikkiin
}
```

Sama malli osaa siis molemmat roolit. `view` on samat näkymät kuin
pelaajilla (`ShowView` vaihdossa, `PlayView` lyönnissä); `sooliRank(card)`
antaa ässälle arvon 1.

## Aja ne vastakkain

```bash
# Kaksintaistelu molemmissa rooleissa, samoilla korteilla (reilu):
npm run sooli-tournament -- baseline random --deals 3000
node sooli-tournament.mjs oma baseline           # nimi tai polku .js-tiedostoon

# Yhden mallin itsetesti baselinea vastaan (laillisuus + vahvuus):
npm run sooli-eval -- oma
```

Turnaus raportoi kummankin **selviämis-%** soolaajana ja **pysäytys-%**
puolustajana, sekä yhdistetyn *sooli-vahvuuden*. Eval palauttaa
paluukoodin 1 jos malli tekee laittoman lyönnin — sopii tekoälyn
edit-run-silmukkaan.

## Valmiit mallit

| Tiedosto | Kuvaus |
|---|---|
| `sooli-strategies/baseline.js` | Oletusheuristiikka: johda/seuraa matalalla, sakkaa korkein; soolaaja duckaa korkeimmalla häviävällä. Sama koodi ajaa selainpelin ramaajapuolustuksen. |
| `sooli-strategies/random.js`   | Nollataso-vertailu (satunnainen laillinen). |
| `sooli-strategies/template.js` | Pohja omalle mallille. |

Esimerkkitulos (`baseline` vs `random`, 2000 jakoa): baseline selviää
soolaajana ~32 %, random ~0 %; baseline pysäyttää ~99.8 %. Baselinea vastaan
baseline-soolaaja selviää ~10 % — sooli on tarkoituksella uhkarohkea veto.
