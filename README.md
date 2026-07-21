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

Each game is self-contained in its folder. See the README inside a game for run instructions.

**Agent / implementation rule:** all browser games must follow
[`AGENTS.md`](AGENTS.md) — what players value *and* how to make games engaging
in a healthy way (flow, short loops, fair uncertainty; no dark patterns).


