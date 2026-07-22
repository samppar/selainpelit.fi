# Palikat

Blokus Duo -tyylinen polyominopeli tietokonetta vastaan (14×14, 21 palaa).

## Ajo

```bash
npm test
npm run build
# avaa index.html selaimessa
```

## Rakenne

| Tiedosto | Rooli |
|----------|--------|
| `src/engine.js` | Säännöt, sijoitusvalidointi, tekoäly (Node + selain) |
| `src/game.js` | DOM-UI |
| `src/style.css` | Ulkoasu |
| `build.js` | Niputtaa itsenäiseksi `index.html`:ksi |
| `test/run_tests.js` | Ytimen testit ilman DOM:ia |

## Säännöt (lyhyesti)

1. Ensimmäinen pala peittää oman aloitusruudun.
2. Omat palat koskettavat toisiaan vain kulmasta (ei reunasta).
3. Vastustajan paloihin saa koskettaa vapaasti.
4. Pisteet = peitetyt ruudut (+15 jos kaikki palat, +5 jos mono viimeisenä).
