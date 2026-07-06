# AGENTS.md

Ohjeet **koodausagentille**, joka tuottaa Hearts-pelibotin tähän projektiin.
Ihmiselle tarkoitettu yleiskuvaus on `README.md`. Tämä tiedosto on toimintaohje:
lue tämä, tuota yksi botti-tiedosto, verifioi se, äläkä muuta muuta koodia.

## Tehtävä

Kirjoita yksi tekoälybotti, joka pelaa Heartsia. Botti on **politiikka**
(valitsee siirron havainnosta); pelisäännöt hoitaa moottori (`src/engine.js`).
Botti saa vain **havainnon** (`view`): oman kätensä ja julkisen pelihistorian.
Se **ei näe muiden pelaajien kortteja** — älä yritä päätellä niitä muuten kuin
julkisesta historiasta.

## Botin muoto (sopimus)

Botti on ES-moduuli, joka vie oletuksena olion:

```js
export default {
  name: "Botin nimi",          // merkkijono
  passCards(view) { /* ... */ }, // palauta TASAN 3 korttia view.hand:ista
  playCard(view)  { /* ... */ }, // palauta YKSI kortti view.legalMoves:ista
};
```

Molempien metodien on oltava **puhtaita ja synkronisia**: sama `view` → sama
paluuarvo, ei sivuvaikutuksia, ei `await`, ei globaalia tilaa, ei satunnaisuuden
tallennusta pelien välillä. Botti on tilaton — kaikki tarvittava johdetaan
`view`:stä joka kutsulla (esim. korttilaskenta `view.playedCards`-historiasta).

## Kortti- ja pistemalli

Kortti on merkkijono: maakirjain + arvo.
- Maat: `C`=risti, `D`=ruutu, `S`=pata, `H`=hertta.
- Arvot: `2`–`14` (11=J, 12=Q, 13=K, 14=A).
- Esim. `"C2"` = ristikakkonen, `"S12"` = patarouva, `"H14"` = hertta-ässä.

Pisteet (tavoite: kerätä mahdollisimman **vähän**):
- jokainen hertta = 1 piste,
- patarouva `"S12"` = 13 pistettä,
- **kuun ampuminen**: jos kerää kaikki 26, saa itse 0 ja muut 26.

## view-skeema

`playCard(view)`:

| kenttä | tyyppi | selitys |
|---|---|---|
| `seat` | number 0–3 | oma paikka |
| `hand` | string[] | omat kortit (lajiteltu) |
| `legalMoves` | string[] | kortit jotka saa pelata nyt (säännöt tarkistettu) |
| `trick` | `{seat:number, card:string}[]` | tähän tikkiin jo pelatut, pelijärjestyksessä |
| `leader` | number 0–3 | tikin aloittajan paikka |
| `leadSuit` | `"C"\|"D"\|"S"\|"H"\|null` | aloitusmaa; `null` jos aloitat itse |
| `heartsBroken` | boolean | onko hertta murrettu |
| `trickNumber` | number 0–12 | monesko tikki |
| `playedCards` | string[] | KAIKKI jaossa pelatut kortit (korttilaskentaan) |
| `scores` | number[4] | pelin kokonaispisteet per paikka |
| `handPoints` | number[4] | tässä jaossa kerätyt pisteet per paikka |
| `voids` | `{C,D,S,H}[4]` | päätellyt tyhjät maat: `voids[paikka][maa]===true` ⇒ ei sitä maata |
| `util` | object | apufunktiot: `suitOf(c)`, `rankOf(c)`, `cardPoints(c)` |

`passCards(view)`: `{ seat, hand, direction, scores, util }`, missä
`direction` ∈ `"left" | "right" | "across"` (vaihdon suunta).

`util`-esimerkit: `util.suitOf("S12")==="S"`, `util.rankOf("S12")===12`,
`util.cardPoints("S12")===13`.

## Kovat rajoitteet

1. `playCard` palauttaa arvon, joka on **täsmälleen** yksi `view.legalMoves`:in
   alkio. Älä keksi omia sallittuja siirtoja — moottori on jo laskenut ne.
2. `passCards` palauttaa **tasan 3 eri korttia**, jotka kaikki ovat
   `view.hand`:issa.
3. **Älä lue muiden käsiä.** Käytä vain `view`:ä. Ei globaaleja, ei tiedostoja,
   ei verkkoa.
4. Jos botti liitetään pelin "Oma botti (liitä koodi)" -kentän kautta, se **ei
   saa sisältää `import`-lauseita** — käytä `view.util`-apufunktioita. (Projektin
   `bots/`-kansion tiedostot saavat importata `../utils.js`:stä.)
5. Turvaverkko on olemassa mutta älä nojaa siihen: jos botti palauttaa laittoman
   siirron tai heittää poikkeuksen, moottori valitsee turvallisen laillisen
   siirron (`safePlay`/`safePass` tiedostossa `src/engine.js`). Tavoittele silti
   aina laillista paluuarvoa.

## Mihin botti lisätään

Valitse toinen tapa:

**A. Pysyvä (tiedosto + rekisteri).**
1. Luo `src/bots/<nimi>Bot.js` yllä olevan sopimuksen mukaan. Saa importata
   `import { suitOf, rankOf, cardPoints } from "../utils.js";`.
2. Rekisteröi `src/botRegistry.js`:ssä: lisää `import` ja rivi `BOTS`-listaan
   muodossa `{ id: "<id>", name: "<Nimi>", bot: <moduuli> }`.

**B. Liitettävä (yksi itsenäinen tiedosto, ei importteja).**
Tuota yksi moduuli, joka käyttää vain `view.util`:a. Käyttäjä liittää sen pelin
alkuvalikon "Oma botti (liitä koodi)" -kenttään. Malli: `custom-bot-example.js`.

## Suositeltu strategia (tiiviisti)

Vahva botti: väistä pistetikit (pelaa korkein varmasti häviävä kortti); kun on
pakko voittaa eikä ole viimeinen, pelaa **matalin** voittava kortti, jotta perässä
pelaava voi ohittaa; pudota patarouva turvallisesti tyhjään maahan tai tikkiin,
jonka joku muu vie; älä aloita herttaa liian aikaisin; hyödynnä `playedCards`- ja
`voids`-tietoa (mm. tiedätkö onko `"S12"` jo pelattu, ja kuka voi vielä lyödä
tikin). Kuun ampuminen kannattaa vain poikkeuksellisen vahvalla kädellä.
Vertailukohdat: `src/bots/proBot.js` (puolustus), `src/bots/shooterBot.js`
(puhallus).

## Verifiointi (pakollinen ennen valmista)

Aja nämä ja varmista, ettei botti tuota laittomia siirtoja eikä kaadu:

```bash
npm install
npm run tournament   # muokkaa src/tournament.mjs:n lineup sisältämään uusi botti
```

Tai käytä pelin alkuvalikon **"Bottitesti"**-nappia (ajaa 200 peliä ja näyttää
voittoprosentit). Odotettu tulos vahvalle botille: voittaa Random- ja Basic-botit
selvästi ja on kilpailukykyinen Pro-bottia vastaan.

Nopea headless-tarkistus (Node):

```js
import { playMatch } from "./src/match.js";
import mine from "./src/bots/<nimi>Bot.js";
import pro from "./src/bots/proBot.js";
const r = playMatch([mine, pro, pro, pro]);   // ei saa heittää poikkeusta
console.log(r.scores, r.winner);
```

## Itsetarkistuslista

- [ ] `export default` sisältää `name`, `passCards`, `playCard`.
- [ ] `passCards` palauttaa aina 3 eri korttia kädestä.
- [ ] `playCard` palauttaa aina alkion `view.legalMoves`:ista.
- [ ] Ei muiden käsien lukemista, ei importteja liitettävässä versiossa.
- [ ] Ei kaatumisia sadan pelin ajossa; ei laittomia siirtoja.
- [ ] Jos lisäsit `bots/`-tiedoston, rekisteröit sen `botRegistry.js`:ssä.
- [ ] Et muuttanut `engine.js`/`match.js`/`utils.js`-tiedostoja.

## Projektin kartta

```
src/engine.js       pelisäännöt, pisteytys, view-rakentajat, turvakäärimet
src/match.js        kokonaisen pelin ajo (turnaukset)
src/utils.js        suitOf/rankOf/cardPoints/sortHand
src/botRegistry.js  lista boteista (lisää omasi tähän)
src/bots/           botit (proBot, shooterBot, basicBot, randomBot, templateBot)
src/App.jsx         käyttöliittymä (ei muokattavaa botin lisäämiseksi)
custom-bot-*.js     itsenäiset, importtivapaat pohjat liitettäväksi
```
