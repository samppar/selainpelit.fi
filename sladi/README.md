# Sladi

Slicks 'n Slide -henkinen, ylhäältä kuvattu liukukaahailu selaimeen. Koko rata
näkyy kerralla, autot sladaavat mutkissa, turbonuolet kiihdyttävät ja
öljyläikät vievät pidon. 1–2 pelaajaa samalla näppäimistöllä + botit.
Kaikki koodi ja grafiikka on tehty tähän peliin alusta asti — klassikko toimii
vain hengen antajana.

## Pelaaminen

- **P1:** nuolinäppäimet (▲ kaasu, ▼ jarru/pakki)
- **P2:** WASD (kaksinpelissä)
- **F** koko ruutu · **M** äänet
- Kosketusnäytöllä ruudun alle ilmestyvät ohjaimet (1 pelaaja)

Kolme rataa (Rengasrata, Serpentiini, Kahdeksikko), neljä kierrosta.
Portit lasketaan järjestyksessä, joten oikominen nurmen poikki ei kartuta
kierroksia. Kun ensimmäinen ihminen on maalissa, muilla on 30 sekunnin
armonaika.

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
