# Labyrintti

Kallistettava **kuulalabyrintti**: seuraa mustaa viivaa START → FINISH ja
vältä reiät. Alussa valitaan vaikeustaso, joka määrää sekä lähtötason koon
että kuulan fysiikan armottomuuden:

- **Rento** — taso 1, pieni lauta, lempeä kuula
- **Haastava** — taso 6, isompi lauta, tiheämpi sokkelo
- **Mestari** — taso 11, suurin lauta, armoton veto

Jokainen läpäisty taso arvotaan edellistä vaikeammaksi (enemmän käytäviä,
kapeammat aukot, lisää reikiä).

## Pelaaminen

```bash
npm test
npm run build
python3 -m http.server
```

- **Tietokone:** nuolinäppäimet / WASD
- **Puhelin:** laitteen kallistus
- **Koko ruutu:** nappi tai **F**

## Ominaisuudet

- **Proseduraaliset sokkelotasot** — recursive-backtracker-sokkelo: mutkitteleva reitti START→FINISH, umpikujia ja lyhyitä tappeja joka suuntaan. Toistettava (sama tason numero = sama lauta). Reitin varren reiissä on taattu kuulan levyinen ohitusaukko; umpikujissa on ansareikiä.
- **Nopeuteen sidottu putoaminen** — hitaana reikä nappaa herkästi, vauhdilla voi kiitää reunan ohi (kuten aidossa laudassa).
- **Tarkistuspisteet** — tipahdus palauttaa viimeiseen tarkistuspisteeseen, ei aina alkuun.
- **Vaikeustason valinta** — alussa valittava lähtötaso + fysiikan armottomuus (rento/haastava/mestari).
- **Etenevä vaikeus** — maaliin päästyä seuraava, suurempi sokkelo avautuu automaattisesti.
- **Äänipalaute** — seinäkosketus, putoaminen, tarkistuspiste ja maali (voi vaimentaa).

## Kehitys

| Polku | Sisältö |
|-------|---------|
| `src/engine.js` | Fysiikka + tasogeneraattori |
| `src/game.js` | Canvas-UI + syöte + äänet + fullscreen |
| `src/style.css` | Ulkoasu |
| `src/variant.css` | Vaikeustason valintanäkymän tyylit |
| `build.js` | Niputtaa `index.html` (tekee myös game.js:ään pienet muokkaukset aloitustason valintaa varten) |
| `test/run_tests.js` | `npm test` (validoi fysiikan ja vaikeustasot) |

## Arkisto

Pelin aiempi versio (kiinteä 36-reiän rata ilman vaikeustason valintaa) on
arkistoitu kansioon [`../arkisto/labyrintti/`](../arkisto/labyrintti/README.md).
Se ei ole enää osa julkaistua sivustoa eikä CI:tä.
