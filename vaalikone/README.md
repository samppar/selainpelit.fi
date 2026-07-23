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

## Esimerkkidata: Oulun valtuusto 2025–2026

`data/`-kansiossa on Oulun kaupunginvaltuuston tämän kauden äänestyksistä
koottu aineisto — **kokonaisluvut suoraan pöytäkirjoista** (asiakirjat.ouka.fi,
haettu 23.7.2026), täydennetty uutislähteillä taustaksi:

- `data/hae-aanestystulokset.js` — hakee kaupunginvaltuuston pöytäkirjoista
  äänestysten kokonaislukemat (jaa/ei/tyhjä/poissa) automaattisesti:
  `node data/hae-aanestystulokset.js [pvm1 pvm2]`. Ei tarvitse selainta —
  KTweb-julkaisujärjestelmä on tavallista palvelinpuolen HTML:ää, pelkkä
  HTTP riittää; PDF-tekstinpurkuun `npm i --no-save pdfjs-dist`. Tulokset:
  `data/aanestystulokset/kaikki.json`.
- `data/oulu-valtuusto-aanestykset-2025-2026.json` / `.md` — käsin
  kirjoitettu, ihmisluettava yhteenveto edellisen skriptin tuloksista:
  äänestykset, tulokset ja lähteet (fileshow-linkit pöytäkirjoihin).
- `data/oulu-ryhmavaalikone.js` — generoi aineistosta ryhmätason
  vaalikoneen jakolinkin: `node data/oulu-ryhmavaalikone.js`.
  Ryhmätason likiarvo: kanta merkitty vain, jos se on lähteistä
  todennettavissa; muuten ”ei kantaa”.
- `data/valtuutetut-vaalikone.js` — yksilötason vaalikone: täytä
  valtuutettujen äänet CSV:hen (malli `data/valtuutetut.csv.esimerkki`) ja
  aja `node data/valtuutetut-vaalikone.js`. **HUOM (vahvistettu
  23.7.2026):** Oulun kaupunginvaltuuston pöytäkirjoissa
  (asiakirjat.ouka.fi) ei julkaista valtuutettukohtaisia äänestystietoja —
  vain kokonaislukemat (jaa/ei/tyhjä/poissa). Tämä on tarkistettu käymällä
  läpi kaikki kauden 2025–2026 pöytäkirja-asiat, ks.
  `data/oulu-valtuusto-aanestykset-2025-2026.md`. Työkalu jää siis Oulun
  osalta esimerkkidatalle; se on hyödyllinen, jos nimitason data saadaan
  joskus muualta (tietopyyntö, toinen kunta, kokousvideon litterointi).

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
