# Oman tuppipelaajan kirjoittaminen

Tämä on koko sopimus, jonka uusi tekoäly tarvitsee. Voit antaa tämän
tiedoston sellaisenaan toiselle tekoälylle ja pyytää sitä kirjoittamaan
pelaajan. Pelaaja on yksi `.js`-tiedosto, joka ei koske pelin ytimeen.

## Vähimmäisvaatimukset

1. Peri `TuppiPlayer`.
2. Toteuta `chooseShow(view)` → palauta merkkijono `"rami"` tai `"nolo"`.
3. Toteuta `playCard(view)` → palauta **kortti joukosta `view.legalMoves`**.
4. Vie oletusfunktio `createPlayer()`, joka palauttaa pelaajaolion.

Minimimalli (toimii sellaisenaan):

```js
import { TuppiPlayer } from "../src/index.js";

export class MyPlayer extends TuppiPlayer {
  static defaultName = "OmaBotti";

  chooseShow(view) {
    // "rami" = yritä kerätä kasoja (yli 6), "nolo" = vältä niitä
    return "nolo";
  }

  playCard(view) {
    // ON pakko palauttaa kortti joukosta view.legalMoves
    return view.legalMoves[0];
  }
}

export default function createPlayer() {
  return new MyPlayer();
}
```

Aja se:

```bash
node play.js --p0 ./players/myPlayer.js
```

## Tärkeät säännöt joita ytimen moottori valvoo

- `playCard` **on** palautettava kortti joukosta `view.legalMoves`. Jos maata
  on tunnustettava (maantuntopakko), `legalMoves` sisältää vain sen maan
  kortit. Laiton siirto keskeyttää pelin (tiukka tila).
- `chooseShow` palauttaa täsmälleen `"rami"` tai `"nolo"`.
- Näet vain oman kätesi + julkisen tiedon. Näkymät on jäädytetty
  (`Object.freeze`), joten tilaa ei voi muokata.

## `Card`-olio

| Kenttä / metodi | Tyyppi | Selitys |
|---|---|---|
| `card.rank`     | number | 2..14 (11=J, 12=Q, 13=K, 14=A). Ässä korkein. |
| `card.suit`     | number | `Suit.CLUBS=0`, `DIAMONDS=1`, `HEARTS=2`, `SPADES=3`. |
| `card.name`     | string | "A", "K", "10" jne. |
| `card.toString()` | string | esim. `"A♠"`. |

Kortit on internoitu: sama (rank, suit) on aina sama olio, joten `===`,
`Array.includes` ja `Set` toimivat arvopohjaisesti. Vertailu tapahtuu
`rank`-luvulla; valttia ei ole.

## `ShowView` (annetaan `chooseShow`-metodille)

| Kenttä | Tyyppi | Selitys |
|---|---|---|
| `view.seat`   | number | Oma paikkasi 0..3. |
| `view.hand`   | Card[] | 13 korttia. |
| `view.team`   | number | Oma joukkueesi (0 tai 1). |
| `view.partner`| number | Parikaverisi paikka (vastapäätä). |
| `view.match`  | MatchState | Ottelun tilanne (ks. alla). |

## `PlayView` (annetaan `playCard`-metodille)

| Kenttä / metodi | Tyyppi | Selitys |
|---|---|---|
| `view.seat` | number | Oma paikkasi. |
| `view.hand` | Card[] | Käsi juuri nyt. |
| `view.legalMoves` | Card[] | **Sallitut kortit** — palauta yksi näistä. |
| `view.gameType` | string | `"rami"` tai `"nolo"`. |
| `view.wantToWinTricks` | boolean | tosi ramissa (kerää), epätosi nolossa (vältä). |
| `view.ramaaja` | number\|null | Ramin näyttäjän paikka (null nolossa). |
| `view.leader` | number | Kuka aloitti tämän kierroksen. |
| `view.ledSuit` | number\|null | Aloitusmaa (null jos aloitat itse). |
| `view.currentTrick` | [seat, Card][] | Tähän kierrokseen lyödyt kortit. |
| `view.trickNumber` | number | 0..12. |
| `view.tricksByTeam` | {0,1} | Joukkueiden voittamat kasat. |
| `view.history` | trick[] | Valmiit kasat, kukin `[seat, Card][]`. |
| `view.team`, `view.partner` | number | Kuten yllä. |
| `view.cardsPlayed` | Set\<Card> | Kaikki jo pelatut kortit. |
| `view.currentWinnerSeat()` | number\|null | Kuka johtaa kesken kierrosta. |
| `view.partnerIsWinning()` | boolean | Johtaako parisi juuri nyt. |
| `view.match` | MatchState | Ottelun tilanne. |

## `MatchState` (`view.match`)

| Kenttä | Tyyppi | Selitys |
|---|---|---|
| `dealNumber` | number | Monesko jako. |
| `dealer` | number | Jakajan paikka. |
| `upTeam` | number\|null | Nousulla oleva joukkue, `null` = pöytäpeli. |
| `upScore` | number | Nousulla olevan pistemäärä. |
| `banked` | {0,1} | Kertyneet nousupisteet (turnauslaskenta). |
| `target` | number | Tuppiraja (52). |

## Vapaaehtoiset apufunktiot (`src/analysis.js`)

Rakennettu vain julkisesta tiedosta, joten käyttö on sallittua.

```js
import {
  unseenCards, unseenInSuit, isBoss,
  voidsFromHistory, cardsRemainingInHand, leadsAfterPlaying,
} from "../src/analysis.js";
```

- `unseenCards(view)` → Set korteista joita et näe (vastustajilla/parilla).
- `unseenInSuit(view, suit)` → näkymättömät maassa, korkein ensin.
- `isBoss(view, card)` → onko kortti korkein jäljellä oleva maassaan.
- `voidsFromHistory(view)` → `{ seat: Set<suit> }` mistä kukin on tyhjä.
- `cardsRemainingInHand(view, seat)` → montako korttia paikalla on jäljellä.
- `leadsAfterPlaying(currentTrick, card, seat)` → johtaisiko kortti nyt.

## Vapaaehtoiset tapahtumakoukut

Voit ylikirjoittaa nämä pitääksesi omaa tilaa (oletuksena ei tee mitään):

```js
onDealStart(view) {}                 // uusi jako alkaa (ennen näyttöä)
onShowResult(gameType, ramaaja) {}   // näyttö ratkesi
onTrickComplete(trick, winnerSeat) {}// kasa lyöty loppuun
onDealEnd(tricksByTeam, winnerTeam, points) {} // jako päättyi
```

## Strategiavihjeitä

- **Rami** (kerää kasoja): aloita kovilla/varmoilla korteilla; jos parisi jo
  johtaa turvallisesti, säästä matala kortti; muuten voita mahdollisimman
  halvalla.
- **Nolo** (vältä kasoja): pelaa aloitusmaan korkein kortti joka **ei** voita
  (alita); jos et voi tunnustaa maata, sakkaa iso vaarallinen kortti pois.
- Muista parikaveri: älä syö parisi varmaa kasaa.

## Nopea itsetesti (Codex-työnkulku)

Kun olet kirjoittanut pelaajan, testaa se yhdellä komennolla — ei palvelinta:

```bash
node eval.js --player players/myPlayer.js
```

Ajuri (1) tarkistaa laillisuuden tiukassa tilassa — laiton siirto tai
kaatuminen = paluukoodi 1, (2) pelaa pelaajasi Mestaria vastaan ja raportoi
voitto-%:n, ja (3) mittaa siirron keston. Paluukoodi on 0 vain kun laillisuus
on kunnossa, joten tämän voi ajaa silmukassa: "korjaa kunnes läpi ja voitto-%
>= 55 Mestaria vastaan". Vaihda vertailua ja mittakaavaa:

```bash
node eval.js --player players/myPlayer.js --baseline heuristic --games 50
node eval.js --player players/myPlayer.js --deals 16 --games 40 --seed 1
```

Kun haluat pelata bottiasi vasten selaimessa (ei palvelinta), aja
`node build.js` ja avaa `tuppi.html`.

## Testaa pelaajasi käsin

```bash
# oma botti kaikilla paikoilla vs itsensä
node play.js --p0 ./players/myPlayer.js --p1 ./players/myPlayer.js \
             --p2 ./players/myPlayer.js --p3 ./players/myPlayer.js --deals 8

# omasi (paikat 0&2) vs Mestari (paikat 1&3), toistettava siemenellä
node play.js --p0 ./players/myPlayer.js --p1 champion \
             --p2 ./players/myPlayer.js --p3 champion --deals 20 --seed 1 --quiet
```
