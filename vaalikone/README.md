# Vaalikone

Tee oma vaalikone ja jaa se linkkinä — ilman tilejä, palvelimia tai
tallennusta. Koko vaalikone (kysymykset, ehdokkaat ja heidän kantansa)
pakataan deflate-algoritmilla URL-fragmenttiin, joten jakolinkki on
itsenäinen: sivusto vain tulkitsee sen.

## Ominaisuudet

- **Muokkain** — kirjoita kyllä/ei-väitteet, lisää ehdokkaat ja merkitse
  heidän kantansa (kyllä / ei / ei kantaa). Luonnos tallentuu selaimen
  localStorageen.
- **Vastaajalinkki** — vastaaja käy kysymykset läpi yksi kerrallaan:
  **kyllä / ei**, mahdollisuus **ohittaa** merkityksetön kysymys ja antaa
  jokaiselle kysymykselle **painoarvo** — pikavalinnat 1× / 2× / 3× tai
  oma paino pudotusvalikosta (½×–10×).
- **Ehdokaslinkki** — ehdokas vastaa itse ja saa vastauskoodin (`VE…`),
  jonka hän lähettää vaalikoneen tekijälle; tekijä tuo koodin muokkaimeen.
- **Tulokset** — ehdokkaat järjestettynä painotetun osuvuuden mukaan,
  kysymyskohtainen erittely avattavissa.

## Tuloslaskenta

Vertailussa ovat vain kysymykset, joihin sekä vastaaja että ehdokas
ottivat kantaa (ohitukset jäävät pois molempien painoista):

```
osuvuus-% = 100 × Σ(paino · samaa mieltä) / Σ(paino)
```

Jos yhteisiä vastattuja kysymyksiä ei ole, osuvuutta ei lasketa (–).

## Kehitys

```
npm test        # ytimen testit (Node, ei riippuvuuksia)
npm run build   # niputtaa itsenäisen index.html:n src/-osista
```

- `src/engine.js` — puhdas ydin: koodaus (VK/VE-koodit), validointi,
  vastaussessio, tuloslaskenta. Toimii sekä Nodessa että selaimessa.
- `src/app.js` — käyttöliittymä; reititys URL-fragmentista
  (`#k=` vastaaja, `#e=` ehdokas, muuten muokkain).
- `src/style.css` — sivuston yhteinen tumma ilme.
