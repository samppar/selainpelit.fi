# Romuralli

Death Rally -henkinen, ylhäältä kuvattu aseellinen kilpa-ajopeli selaimeen.
Kaikki koodi ja grafiikka on tehty tähän projektiin alusta asti — peli ei
käytä alkuperäisen Death Rallyn koodia eikä pelitiedostoja.

## Pelin idea

- Neljä autoa kiertää proseduraalisesti luotua rataa (3–5 kierrosta).
- Konekivääri, turbopullo, kolarivauriot — romuttunut auto on ulkona kisasta.
- Radalta poimitaan rahasäkkejä, korjauksia, ammuksia ja turboa.
- Palkintorahoilla ostetaan autotallista päivityksiä: moottori, renkaat,
  panssari ja aseet (3 tasoa kutakin). Ura tallentuu selaimeen
  (`localStorage`).
- Kolme sarjaa: Romusarja (helppo), Katusarja ja Kuolonsarja — kovemmat
  vastustajat, isommat palkinnot.

## Rakenne

| Tiedosto | Rooli |
|----------|-------|
| `src/engine.js` | Puhdas pelilogiikka ilman DOM:ia: rata, fysiikka, AI, aseet, kierrokset, talous. Deterministinen seedillä. |
| `src/game.js` | Canvas-renderöinti, WebAudio-äänet, syötteet, ura ja valikot. |
| `src/style.css` | Ulkoasu. |
| `build.js` | Niputtaa yllä olevat yhdeksi itsenäiseksi `index.html`-tiedostoksi. |
| `test/run_tests.js` | Regressiotestit (`npm test`). |

## Komennot

```bash
npm test        # ytimen testit (Node, ei selainta)
npm run build   # kirjoittaa index.html:n
```

Selaimessa: `python3 -m http.server` repojuuressa ja avaa `/romuralli/`.

## Ohjaus

Nuolet/WASD ajaa, Välilyönti ampuu, Vaihto polttaa turboa, F koko ruutu,
Esc keskeyttää kisan. Kosketusnäytöllä ruudun alle ilmestyvät painikkeet.

## Smoke-testaus selaimessa

`window.RallyUI` paljastaa tilan: `RallyUI.startRace("helppo")`,
`RallyUI.setTestInput({steer:0,throttle:1,fire:false,turbo:false})`,
`RallyUI.state` (moottorin tila), `RallyUI.mode`.
