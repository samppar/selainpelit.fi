# selainpelit.fi

Monorepo for browser games hosted at selainpelit.fi.

## Games

| Folder | Game |
|--------|------|
| `hertta/` | Hertta (Hearts) — React/Vite bot arena |
| `tuppi/` | Tuppi — Finnish card game with AI players |
| `katko/` | Katko — tournament / engine experiments |
| `sanasato/` | Sanasato — Finnish word-grid game (research-driven design) |
| `sanaseppa/` | Sanaseppä — Finnish word-tile game vs. computer (15×15 crossword board) |
| `sanapalat/` | Sanapalat — Finnish tile-laying word game vs. computer (15×15 board) |
| `rypas/` | Rypäs — number-tile set game vs. computer (groups & runs) |
| `holdem/` | Hold'em — Texas Hold'em vs. computer (bot registry + arena) |
| `mylly/` | Mylly — Nine Men's Morris vs. computer |
| `tammi/` | Tammi — English draughts vs. computer |
| `mosaiikki/` | Mosaiikki — polyomino shape-filling puzzle |
| `palikat/` | Palikat — Blokus Duo -tyylinen polyominopeli vs. computer |
| `labyrintti/` | Labyrintti — kallistettava kuulalabyrintti, kolme vaikeustasoa |
| `moottori-mania/` | Moottori-Mania — Elasto Mania -henkinen ajopeli, portattu fysiikka |

Each game is self-contained in its folder. See the README inside a game for run instructions.

`arkisto/` contains retired game versions kept for reference (not built, tested, or deployed).

**Agent / implementation rule:** all browser games must follow
[`AGENTS.md`](AGENTS.md) — what players value *and* how to make games engaging
in a healthy way (flow, short loops, fair uncertainty; no dark patterns).

**Bot / AI pattern** (already documented in-repo — reuse, don’t reinvent):

- Hertta: [`hertta/AGENTS.md`](hertta/AGENTS.md), `src/bots/`, `match.js`, tournament
- Tuppi: [`tuppi/WRITING_A_PLAYER.md`](tuppi/WRITING_A_PLAYER.md), [`tuppi/AGENTS.md`](tuppi/AGENTS.md)
- Hold'em: [`holdem/AGENTS.md`](holdem/AGENTS.md) (same split: policy vs engine)


