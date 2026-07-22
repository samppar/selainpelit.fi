# Mosaiikki

Täytä tumma muoto värikkäillä paloilla. Kierrä ja peilaa paloja kunnes jokainen
ruutu on peitetty — klassinen sommittelupulma selaimessa.

## Ajo

```bash
npm test          # moottorin regressiot
npm run build     # kirjoittaa index.html
```

Avaa `index.html` tai tarjoile kansio:

```bash
python3 -m http.server 8765 --directory .
# http://localhost:8765/?seed=42&difficulty=helppo&timer=0
```

## URL-parametrit (Playwright-ystävälliset)

| Parametri | Merkitys |
|-----------|----------|
| `seed` | Deterministinen pulma |
| `difficulty` | `helppo` \| `normaali` \| `vaikea` |
| `timer` | `0` / `off` poistaa kellon; tai sekunnit |

## Playwright / selaintestaus

Jokaisella interaktiivisella elementillä on `data-testid`. Lisäksi:

```js
window.__MOSAIKKI__.getState()
window.__MOSAIKKI__.select('p0')
window.__MOSAIKKI__.rotate()
window.__MOSAIKKI__.place('p0', row, col)
window.__MOSAIKKI__.hint()
window.__MOSAIKKI__.solve()       // asettaa ratkaisun
window.__MOSAIKKI__.newPuzzle({ seed: 42, difficulty: 'helppo', timeOverride: 0 })
```

Esimerkki smoke-kulusta:

1. Avaa `/?seed=42&difficulty=helppo&timer=0`
2. Odota `[data-testid="game-shell"][data-phase="playing"]`
3. `await page.evaluate(() => window.__MOSAIKKI__.solve())`
4. Tarkista overlay: `[data-testid="overlay"][data-open="1"]`
