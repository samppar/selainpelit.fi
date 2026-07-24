# Sladi

Slicks 'n Slide -henkinen, ylhäältä kuvattu liukukaahailu selaimeen. Koko rata
näkyy kerralla yhdessä ruudussa — siksi samalla näppäimistöllä voi kisata
useampi pelaaja. Leveät tiet, sladaavat autot, turbonuolet, öljyläikät, muta,
vesialtaat, rengaskasat, violetit seinäesteet ja Kahdeksikon silta.
Kaikki koodi ja grafiikka on tehty tähän peliin alusta asti — klassikko toimii
vain hengen antajana.

## Pelaaminen

- **P1:** nuolinäppäimet (▲ kaasu, ▼ jarru/pakki)
- **P2:** WASD (kaksinpelissä)
- **F** koko ruutu · **M** äänet
- Kosketusnäytöllä ruudun alle ilmestyvät ohjaimet (1 pelaaja)

Neljä ajoneuvoluokkaa: **Formula** (nopein, arka hiekalle), **Sportti**
(tasapainoinen), **Ralli** (kulkee hiekalla ja nurmella) ja **Paku**
(hidas ja raskas — voittaa kolarit; massa vaikuttaa törmäyksiin).

Kolme rataa (Rengasrata, Serpentiini/hiekka, Kahdeksikko sillalla), neljä
kierrosta. Portit lasketaan järjestyksessä, joten oikominen ei kartuta
kierroksia. Kun ensimmäinen ihminen on maalissa, muilla on 30 sekunnin
armonaika. Pinnat: asfaltti, nurmi/hiekka, öljy (pito katoaa), muta
(hidastaa) ja vesi (upottaa lähes pysähdyksiin). Kahdeksikon silta erottaa
tasot: kannella ja alittavalla tiellä ajavat eivät törmää toisiinsa.

## Rakenne

| Tiedosto | Rooli |
|----------|-------|
| `src/engine.js` | Puhdas pelimoottori: fysiikka, radat, portit, botit. Ei DOM:ia, ei `Date.now`/`Math.random` — deterministinen 120 Hz kiintein askelin. |
| `src/game.js` | Canvas-renderöinti, syötteet, HUD, valikot, äänet (WebAudio). |
| `src/style.css` | Ulkoasu. |
| `build.js` | Niputtaa yllä olevat yhdeksi itsenäiseksi `index.html`:ksi. |
| `test/run_tests.js` | Regressiotestit: fysiikka, portit/kierrokset, botit joka radalla, determinismi. |

```sh
npm test    # ytimen testit (Node, ei riippuvuuksia)
npm run build   # kirjoittaa index.html:n
```

`window.SladiUI` tarjoaa selain-smokelle ohjelmallisen rajapinnan
(`startRace`, `getState`, `pressKey`, `fastForward`).
