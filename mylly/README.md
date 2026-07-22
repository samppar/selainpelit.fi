# Mylly

Klassinen **Mylly** (Nine Men's Morris) tietokonetta vastaan.

## Pelaaminen

```bash
npm run build
# avaa index.html selaimessa (tai python3 -m http.server)
```

## Kehitys

| Polku | Sisältö |
|-------|---------|
| `src/engine.js` | Säännöt + minimax-tekoäly (Node-testattava) |
| `src/game.js` | DOM-käyttöliittymä |
| `src/style.css` | Ulkoasu |
| `build.js` | Niputtaa yhden `index.html`:n |
| `test/run_tests.js` | `npm test` |

## Ominaisuudet

- Asettelu, siirto, lento (3 nappulaa), myllyn poistot
- Vaikeustasot (Nopea / Vahva / Erittäin vahva)
- Vihje, peruutus, vuorotteleva aloittaja
- Laillisten siirtojen ja poistettavien korostus
