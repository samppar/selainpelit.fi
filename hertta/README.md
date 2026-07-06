# Hertta — pelattava peli + pluggattavat tekoälybotit

Klassinen Hearts neljälle: sinä (paikka 0) kolmea tekoälybottia vastaan.
Pelisäännöt ja tekoälyt on **eriytetty toisistaan**, joten kuka tahansa (tai
mikä tahansa kielimalli) voi kirjoittaa oman bottinsa ja pudottaa sen peliin.

## Ajaminen

```bash
npm install
npm run dev          # avaa peli selaimessa
npm run tournament   # pelauta botteja toisiaan vastaan komentoriviltä
```

## Rakenne

```
src/
  utils.js         Korttien apufunktiot (jaettu kaikille)
  engine.js        Puhtaat pelisäännöt, pisteytys, reilut näkymät, turvakäärimet
  match.js         Kokonaisen pelin ajo ilman UI:ta (turnaukset)
  botRegistry.js   Lista käytettävissä olevista boteista  ← lisää omasi tähän
  bots/
    proBot.js      Ammattitason tekoäly (korttilaskenta + tyhjien maiden päättely)
    shooterBot.js  Puhaltaja: arvioi kuun ampumisen jo vaihdossa, pelaa hyökkäävästi
    basicBot.js    Yksinkertainen perusheuristiikka
    randomBot.js   Satunnainen (nollataso-vertailu)
    templateBot.js Pohja omalle botille
  App.jsx          Käyttöliittymä (valitse jokaiselle vastustajalle botti)
  tournament.mjs   Esimerkkiturnaus
```

## Korvaa yksi pelaaja jonkun toisen tekoälyllä (helpoin tapa)

Et tarvitse tähän tiedostojen muokkausta. Pelin **alkuvalikossa** valitse
jonkin vastustajan kohdalta pudotusvalikosta **"Oma botti (liitä koodi)"**,
liitä kaverin tai toisen kielimallin tekemä botti tekstikenttään ja paina
**"Lataa botti"**. Se astuu heti kyseisen pelaajan tilalle.

Liitettävä botti on **yksi itsenäinen moduuli ilman import-lauseita** — se saa
kaikki apufunktiot `view.util`-oliosta. Valmiit pohjat: `custom-bot-example.js`
(yksinkertainen) ja `custom-bot-shooter.js` (puhaltaja + ammattitason puolustus).

**Bottitesti:** alkuvalikon "Bottitesti"-napilla voit valita neljä bottia ja
ajaa niiden välillä 200 peliä suoraan selaimessa — näet kunkin voittoprosentin
ilman komentoriviä.

## Botin lisääminen pysyvästi (tiedostona)

1. Kopioi `bots/templateBot.js` → `bots/minunBot.js` ja toteuta logiikka.
2. Rekisteröi se `botRegistry.js`:ssä (`import` + rivi `BOTS`-listaan).
3. Valitse se pelin alkuvalikosta tai `tournament.mjs`:n kokoonpanosta.

Botti on tavallinen moduuli, joka vie oletuksena olion:

```js
export default {
  name: "Minun bottini",
  passCards(view) { /* palauta 3 korttia view.hand:ista */ },
  playCard(view)  { /* palauta 1 kortti view.legalMoves:ista */ },
};
```

## Rajapinta (mitä botti näkee)

Kortti = maakirjain + arvo: `C`=risti, `D`=ruutu, `S`=pata, `H`=hertta;
arvot `2`–`14` (11=J, 12=Q, 13=K, 14=A). Esim. `"C2"`, `"S12"` (patarouva), `"H14"`.
Pisteet: jokainen hertta = 1, patarouva `"S12"` = 13.

**Botti näkee vain oman kätensä ja julkisen tiedon — ei muiden kortteja.**

`passCards(view)` → tasan 3 korttia `view.hand`:ista. `view`:
`{ seat, hand, direction: "left"|"right"|"across", scores }`

`playCard(view)` → yksi kortti `view.legalMoves`:ista. `view`:

| kenttä | selitys |
|---|---|
| `seat` | oma paikka 0–3 |
| `hand` | omat kortit (lajiteltu) |
| `legalMoves` | kortit jotka saa pelata nyt (säännöt tarkistettu puolestasi) |
| `trick` | `[{seat, card}]` tähän tikkiin jo pelatut |
| `leader` | tikin aloittajan paikka |
| `leadSuit` | aloitusmaa tai `null` jos aloitat itse |
| `heartsBroken` | onko hertta murrettu |
| `trickNumber` | 0–12 |
| `playedCards` | kaikki jaossa pelatut kortit (korttien laskentaan) |
| `scores` | pelin kokonaispisteet `[4]` |
| `handPoints` | tässä jaossa kerätyt pisteet `[4]` |
| `voids` | `[{C,D,S,H}]` päätellyt tyhjät maat per paikka |
| `util` | apufunktiot `{ suitOf, rankOf, cardPoints }` (liitetyille boteille) |

**Turvallisuus:** jos botti palauttaa laittoman siirron tai heittää poikkeuksen,
moottori valitsee automaattisesti turvallisen laillisen siirron. Botti ei voi
kaataa peliä eikä huijata — se saa vain reilun näkymän.

## Kehote toiselle kielimallille

Anna alla oleva teksti mille tahansa mallille saadaksesi yhteensopivan botin:

> Kirjoita minulle Hearts-peliin tekoälybotti yhtenä itsenäisenä JavaScript-
> ES-moduulina ILMAN import-lauseita. Vie oletuksena olio, jolla on kentät
> `name` (merkkijono) sekä metodit `passCards(view)` ja `playCard(view)`.
> Kortti on merkkijono: maakirjain (C=risti, D=ruutu, S=pata, H=hertta) + arvo
> 2–14 (11=J,12=Q,13=K,14=A), esim. `"S12"` on patarouva. Pisteet: jokainen
> hertta 1, patarouva 13; tavoite on kerätä mahdollisimman vähän pisteitä.
> `passCards(view)` palauttaa tasan 3 korttia `view.hand`:ista.
> `view` = `{ seat, hand, direction, scores, util }`.
> `playCard(view)` palauttaa yhden kortin `view.legalMoves`:ista.
> `view` = `{ seat, hand, legalMoves, trick:[{seat,card}], leader, leadSuit,
> heartsBroken, trickNumber, playedCards, scores, handPoints, voids, util }`,
> missä `voids[paikka][maa]` kertoo tiedetyt tyhjät maat. Apufunktiot löytyvät
> `view.util`:sta: `util.suitOf("S12")==="S"`, `util.rankOf("S12")===12`,
> `util.cardPoints("S12")===13`. Botti näkee vain oman kätensä.
> Palauta VAIN moduulin koodi. Tee vahva pelaaja: väistä pisteet, pudota
> patarouva turvallisesti tyhjään maahan, älä aloita herttaa liian aikaisin,
> ja hyödynnä korttien laskentaa (`playedCards`) sekä `voids`-tietoa.

Tallenna vastaus tiedostoon `src/bots/`, rekisteröi `botRegistry.js`:ssä ja
pelauta se `pro`-bottia vastaan turnauksessa nähdäksesi kumpi on parempi.
