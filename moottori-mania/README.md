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
npm test                          # botti kaikki kentät + upotettujen demojen toisto (10/10)
node tools/bot.js 7                # yksi kenttä
node tools/trace.js 7              # kuolemaa edeltävät ruudut
node tools/embed.js && node tools/verify.js   # demot uusiksi kenttämuutoksen jälkeen
```
