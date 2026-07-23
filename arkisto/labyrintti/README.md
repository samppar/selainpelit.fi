# Labyrintti (arkistoitu)

> **Arkistoitu 2026-07-23.** Tämä on Labyrintti-pelin aiempi versio, jolla ei
> ollut vaikeustason valintaa (aina alkoi tasolta 1). Se on korvattu
> sivustolla ["Labyrintti 2":ksi kehitetyllä versiolla](../../labyrintti/README.md),
> joka siirrettiin osoitteeseen `/labyrintti/`. Tämä kansio ei ole enää osa
> julkaistua sivustoa eikä CI:tä (`test.yml` / `deploy.yml`).

Kallistettava **kuulalabyrintti**, jossa on loputtomasti tasoja: seuraa mustaa viivaa START → FINISH ja vältä reiät. Jokainen läpäisty taso arvotaan edellistä vaikeammaksi (enemmän käytäviä, kapeammat aukot, lisää reikiä).

## Pelaaminen

```bash
npm run build
# avaa index.html selaimessa (tai python3 -m http.server)
```

- **Tietokone:** nuolinäppäimet / WASD
- **Puhelin:** laitteen kallistus
- **Koko ruutu:** nappi tai **F**

## Ominaisuudet

- **Proseduraaliset sokkelotasot** — recursive-backtracker-sokkelo: mutkitteleva reitti START→FINISH, umpikujia ja lyhyitä tappeja joka suuntaan. Toistettava (sama tason numero = sama lauta). Reitin varren reiissä on taattu kuulan levyinen ohitusaukko; umpikujissa on ansareikiä.
- **Nopeuteen sidottu putoaminen** — hitaana reikä nappaa herkästi, vauhdilla voi kiitää reunan ohi (kuten aidossa laudassa).
- **Tarkistuspisteet** — tipahdus palauttaa viimeiseen tarkistuspisteeseen, ei aina alkuun.
- **Etenevä vaikeus** — maaliin päästyä seuraava, suurempi sokkelo avautuu automaattisesti.
- **Äänipalaute** — seinäkosketus, putoaminen, tarkistuspiste ja maali (voi vaimentaa).

## Kehitys

| Polku | Sisältö |
|-------|---------|
| `src/engine.js` | Fysiikka + tasogeneraattori |
| `src/game.js` | Canvas-UI + syöte + äänet + fullscreen |
| `src/style.css` | Ulkoasu |
| `build.js` | Niputtaa `index.html` |
| `test/run_tests.js` | `npm test` (validoi generaattorin tasot 1–8) |
