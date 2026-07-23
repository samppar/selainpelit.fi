# Moottori-Mania

Elasto Mania -henkinen ajopeli yhtenä itsenäisenä `index.html`-tiedostona.
Fysiikka on portattu uskollisesti Action SuperCrossin (elastomania/across,
CC BY‑NC‑SA 4.0) julkaistusta lähdekoodista — tämä on ei-kaupallinen
harrastusprojekti, kentät ja grafiikka omia. Lisenssihuomautus näkyy myös
pelin aloitusruudussa.

Kerää kentän omenat ja aja maaliin kaatamatta pyörää päälaelleen. 10 kenttää,
vaikeus kasvaa progressiivisesti.

## Pelaaminen

```bash
python3 -m http.server
# avaa index.html selaimessa
```

- **Ohjaus:** ylä/ala-nuoli = kaasu/jarru, vasen/oikea = voltti (impulssi),
  välilyönti = käännä ajosuunta, S tai 1–5 = pyörän ulkoasu, K = kenttävalikko,
  M = mallisuoritus (demo).
- **Kosketus:** ruudun alalaidan painikkeet.

## Kehitys

Katso [`CLAUDE.md`](CLAUDE.md) — fysiikan mitatut vakiot, botin säännöt ja
kenttäsuunnittelun opitut asiat. **Fysiikkaan ei kosketa** ilman erittäin
hyvää syytä (portattu alkuperäisestä moottorista).

| Polku | Sisältö |
|-------|---------|
| `index.html` | Koko peli: fysiikka, logiikka, valikko, piirto, upotetut mallisuoritukset (DEMOS) |
| `tools/bot.js` | Regressiobotti: ajaa kaikki 10 kenttää ilman ihmistä (`npm test`) |
| `tools/trace.js` | Botti + kuolinruutujen/lentoratojen tulostus (diagnostiikka) |
| `tools/embed.js` | Nauhoittaa demot ja upottaa ne `index.html`:n DEMOS-vakioon |
| `tools/verify.js` | Toistaa upotetut demot ja tarkistaa että ne yhä vievät maaliin |

```bash
npm test                           # botti kaikki 10 kenttää (CI-portti: pitää löytää läpäisy jokaiselle)
node tools/bot.js 7                 # yksi kenttä
node tools/trace.js 7               # kuolemaa edeltävät ruudut
node tools/embed.js && npm run verify-demos   # demot uusiksi kenttämuutoksen jälkeen
```

**Huom CI:stä:** `npm test` ajaa vain `bot.js`:n (löytyykö läpäisy — tämä on
arkkitehtuurin/kenttien oikea regressiotesti, deterministinen ruutumäärältään).
`verify-demos` (upotettujen demojen bittitarkka toisto) **ei** ole CI:ssä,
koska pitkän kaoottisen fysiikkasimulaation liukulukutulos ei ole taattu
identtinen eri CPU-arkkitehtuurien/JS-moottorien välillä (havaittu: samat
upotetut demot toistuivat eri lopputuloksella macOS/arm64-kehityskoneella ja
Linux/x86_64 CI-ajurilla, vaikka botin oma haku on ruutumäärältään
deterministinen). Aja `verify-demos` paikallisesti samalla koneella jolla
`embed.js` ajettiin.
