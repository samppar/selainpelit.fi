# Tammi

Klassinen **Tammi** (8×8, englantilaiset säännöt) tietokonetta vastaan.

## Pelaaminen

```bash
npm run build
# avaa index.html selaimessa (tai python3 -m http.server)
```

## Kehitys

| Polku | Sisältö |
|-------|---------|
| `src/engine.js` | Säännöt + minimax-tekoäly (Node-testattava) |
| `src/session.js` | UI-tilakone ilman DOM:ia |
| `src/game.js` | DOM-sidos + `TammiUI` |
| `src/style.css` | Ulkoasu |
| `build.js` | Niputtaa yhden `index.html`:n |
| `test/run_tests.js` | `npm test` |

## Ominaisuudet

- Pakollinen syönti ja ketjusyönnit
- Daami (kuningas) molempiin vinottaissuuntiin
- Vaikeustasot (Nopea / Vahva / Erittäin vahva)
- Vihje, peruutus, vuorotteleva aloittaja
- Laillisten nappuloiden ja kohderuutujen korostus

## Testattavuus

| Kerros | API | Esimerkki |
|--------|-----|-----------|
| Säännöt | `makeState`, `moveKeys`, `findMove` | `moveKeys(st) → ["c5xe7"]` |
| AI | `bestMove(st, { now, maxDepth, timeMs })` | pakotettu syönti / voitto-1 |
| UI | `TammiSession.createSession` (Node) / `TammiUI` (selain) | `play("a3-b4")`, `getView()` |

```js
const S = require("./src/session.js");
const sess = S.createSession({
  engine: E, aiDelayMs: 0, flashMs: 0,
  aiOpts: { timeMs: 50, maxDepth: 4, now: () => 1e6 },
});
sess.newGame({ starterMode: "human" });
sess.play("c3-d4");
sess.getView(); // phase, message, movable, targets, toast…
```

Selain-smoke: `TammiUI.play("a3-b4")`, `TammiUI.getView()`.
