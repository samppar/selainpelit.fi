# Hold'em

Texas Hold'em -pokeri tietokonetta vastaan. Neljä pelaajaa (sinä + 3 bottia),
blindit, panostuskierrokset, showdown ja sivupotit. Yksi itsenäinen
`index.html` — ei palvelinta, ei riippuvuuksia.

Tekoäly on erillään säännöistä (**hertta**/`tuppi`-malli): botit
`src/bots/`, rekisteri, `match.js`, peilattu areena.

## Pelaaminen

```bash
npm run build
python3 -m http.server 8742
# http://localhost:8742/index.html
```

### Säännöt lyhyesti

- **Tavoite:** kerää chipit; viimeinen pystyssä oleva voittaa.
- 2 taskukorttia + flop / turn / river.
- Toiminnot: luovuta, passaa, maksa, panosta, korota.
- Vaikeus: helppo (Basic) / normaali (Normal) / vaikea (Hard).

## Tekninen rakenne

```
holdem/
├── src/
│   ├── engine.js       # säännöt, botView, safeAct
│   ├── match.js        # playMatch, compareBots
│   ├── botRegistry.js
│   ├── botUtil.js
│   ├── bots/           # random, basic, normal, hard, template
│   ├── game.js
│   └── style.css
├── test/
│   ├── run_tests.js
│   └── arena.js
├── AGENTS.md           # bottisopimus agentille
├── build.js
└── index.html
```

## Kehitys & tekoälytestaus

```bash
npm test                 # säännöt + AI
npm run arena            # hard vs basic (peilattu HU)
npm run arena -- hard random --seeds 30
npm run build
```

Uusi botti: kopioi `src/bots/templateBot.js` → rekisteröi
`botRegistry.js` → `npm test` / `npm run arena`. Ohje: [`AGENTS.md`](./AGENTS.md).

Älä keksi bottimallia tyhjästä — sama sopimus on jo repossa:
[`hertta/AGENTS.md`](../hertta/AGENTS.md),
[`tuppi/WRITING_A_PLAYER.md`](../tuppi/WRITING_A_PLAYER.md)
([GitHub](https://github.com/samppar/selainpelit.fi)).

Selain-smoke: `?seed=42`, yksi maksa/passaa. Agentti-API:
`window.HoldemUI.newGame({ seed })`, `.act(…)`, `.getState()`.
