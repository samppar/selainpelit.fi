# Kolmitaso

Triplane Turmoil -henkinen sivusta kuvattu ilmataistelupeli. Oma toteutus
(koodi ja grafiikka tehty tähän repoon alusta asti); pelimekaniikan esikuvana
on suomalainen klassikko [Triplane Turmoil](https://triplane.sourceforge.net/).

Nouse omalta kentältä, tuhoa vihollisen hallit, varikot ja it-tykit ja käy
välillä laskeutumassa huoltoon: pysähtynyt kone tankataan, korjataan ja
pommitetaan täyteen. Tehtävä on voitettu, kun kaikki maalit ovat raunioina —
ja hävitty, kun kolme konetta on menetetty.

## Rakenne

| Polku | Mitä |
|-------|------|
| `src/engine.js` | Pelin ydin: lentofysiikka (sakkauksineen), aseet, it-tykit, vihollis-AI, tehtävät. Puhdas JS, ei DOM:ia, deterministinen seedillä. |
| `src/game.js` | Käyttöliittymä: canvas-renderöinti, HUD, äänet (WebAudio), syötteet, valikot. |
| `src/style.css` | Ulkoasu. |
| `build.js` | Niputtaa yllä olevat yhdeksi itsenäiseksi `index.html`-tiedostoksi. |
| `test/run_tests.js` | Regressiotestit ytimelle. |

## Komennot

```sh
npm test        # ytimen testit (Node, ei riippuvuuksia)
npm run build   # generoi index.html
```

## Ohjaus

- `←`/`→` (tai `A`/`D`) — koneen kierto
- `↑`/`↓` (tai `W`/`S`) — kaasu suuremmalle / pienemmälle
- `Väli` — konekivääri, `B` — pommi, `X` — rullaus (kone ympäri)
- `F` — koko ruutu, `Esc` — keskeytä

Kosketuslaitteilla ruudun alle ilmestyvät ohjauspainikkeet.

## Suunnitteluperiaatteet

Ydin on erotettu käyttöliittymästä, jotta säännöt ja fysiikka ovat
testattavissa Nodella: `createMission` + `step(state, input)` + seedattu
`mulberry32`-RNG tekevät simulaatiosta deterministisen. Selain-smoke käyttää
`window.KolmitasoUI`-rajapintaa (`startMission`, `setTestInput`).
