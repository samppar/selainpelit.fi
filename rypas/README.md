# Rypäs

Numeropalaripeli tietokonetta vastaan. Muodosta **rypäitä** — ryhmiä (sama
numero, eri värit) ja jonoja (sama väri, peräkkäiset) — ja tyhjennä telineesi
ennen vastustajaa. Sukua tunnetuille numerolaattapeleille, mutta oma suomenkielinen
käyttöliittymä ja täysin selaimessa toimiva vastustaja.

Peli on **yksi itsenäinen `index.html`** — ei palvelinta, ei riippuvuuksia,
toimii myös offline.

## Pelaaminen

```bash
npm run build
python3 -m http.server 8741
# http://localhost:8741/index.html
```

Tai avaa `index.html` suoraan selaimessa buildin jälkeen.

### Säännöt lyhyesti

- **Ottelu:** eriä pelataan, kunnes joku saavuttaa **200 pistettä**.
- **Erä:** tyhjennä telineesi ensimmäisenä — saat vastustajan jäljellä olevat
  pisteet (hänelle miinus).
- **Aloituspalat:** valitse alussa 7, 10 tai 14 palaa telineeseen (oletus 14).
- **Ryhmä:** sama numero, eri värit, 3–4 palaa.
- **Jono:** sama väri, peräkkäiset numerot (≥3). Ei kiertoa 13→1.
- **Avaus:** ensimmäisellä siirrolla ≥30 pistettä omista paloista.
- Avauksen jälkeen voit purkaa ja järjestellä pöytää; vuoron lopussa kaikkien
  rypäiden on kelvattava ja vähintään yksi uusi pala on pelattava.
- Jos et pelaa: **nosta** yksi pala pussista.
- Jokeri korvaa minkä tahansa palan (kädessä sakko 30).

### Käyttöliittymä

1. Valitse paloja telineestä (klikkaus).
2. **Muodosta rypäs** — tai klikkaa olemassa olevaa rypästä lisätäksesi palat.
3. **Pura** avaa rypään työalueelle (avauden jälkeen / omat uudet rypäät).
4. **Vahvista vuoro** tai **Nosta** / **Peru**.

## Tekninen rakenne

```
rypas/
├── src/
│   ├── engine.js   # ydin: pussi, validointi, vuorot, AI
│   ├── game.js     # selain: teline, pöytä, vuorot, overlayt
│   └── style.css
├── test/
│   └── run_tests.js
├── build.js
└── index.html      # generoitu
```

Ydin on puhdasta Nodella ajettavaa JavaScriptiä → `npm test` ilman selainta.

## Kehitys

```bash
npm test       # ydintestit
npm run build  # generoi index.html
```

Selain-smoke (agentti): `python3 -m http.server 8741`, avaa
`http://localhost:8741/index.html?seed=3` (seed 3:n avaus on valmis 13-ryhmä),
pelaa yksi vuoro / nosta, varmista ettei kaadu. Ohjelmallisesti:
`window.RypasUI.newGame({ seed: 3 })`.

Agentin testausvastuu: juuren [`../AGENTS.md`](../AGENTS.md) §4.
