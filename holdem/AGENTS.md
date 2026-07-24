# AGENTS.md — Hold'em

Ohjeet **koodausagentille**, joka tuottaa tai arvioi Hold'em-bottia.
Ihmisen yleiskuvaus: `README.md`. UX: juuren [`../AGENTS.md`](../AGENTS.md).

## Älä keksi pyörää uudestaan — katso monorepon matsku

Sama bottisopimus on jo hiottu muissa peleissä. **Lue nämä ensin** (sama repo,
GitHubissa [`samppar/selainpelit.fi`](https://github.com/samppar/selainpelit.fi)):

| Lähde | Mitä ottaa malliksi |
|-------|---------------------|
| [`hertta/AGENTS.md`](../hertta/AGENTS.md) | Politiikka vs säännöt, `view`, `safePlay`, rekisteri, turnaus |
| [`hertta/src/bots/templateBot.js`](../hertta/src/bots/templateBot.js) | Bottipohja + kommenttisopimus |
| [`hertta/src/match.js`](../hertta/src/match.js) + `tournament.mjs` | Headless match / areena |
| [`tuppi/WRITING_A_PLAYER.md`](../tuppi/WRITING_A_PLAYER.md) | “Anna tämä tiedosto toiselle agentille” -sopimus |
| [`tuppi/AGENTS.md`](../tuppi/AGENTS.md) | Vahvuustestit: peilatut pelit, ei yhtä onnekasta jakoa |
| [`tuppi/players/randomPlayer.js`](../tuppi/players/randomPlayer.js) | Minimibotti |

Hold'em noudattaa samaa jakoa: **moottori = säännöt**, **botti = `act(view)`**,
**match/areena = vahvuus**.

## Pluribus (tutkimusviite — ei kopioitava toteutus)

[Pluribus](https://en.wikipedia.org/wiki/Pluribus_(poker_bot)) (FAIR / CMU, Science
2019) oli ensimmäinen botti, joka löi ammattilaisia **monen pelaajan** no-limit
Texas Hold’emissa. Lähdekoodia **ei julkaistu** (huijausriski online-peleissä).

### Mitä Pluribus teki (tiivis)

- Offline **self-play** → blueprint-strategia; pelissä **reaaliaikainen haku**
- 2 pelaajan Nash ei riitä ≥3 pelaajalle → empiirinen self-play + search
- Tyylissä: **välttää limppiä**, tekee **donk-bettä** useammin kuin ihmiset

### Mitä me Emme tee selainpelissä

- Emme toteuta MCCFR-blueprintiä / depth-limited solvingia (raskas, ei lähdettä)
- Emme väitä “Pluribus-tasoa”

### Mitä otamme julkisista opeista

- `hardBot`: anti-limp (`avoidLimp`), aggressiivisempi open/donk (`canOpenBet`)
- Vahvuusmitta: peilattu `compareBots` / `npm run arena` (kuten tuppi)

Paperi: Brown & Sandholm, *Science* 2019 —
https://www.science.org/doi/10.1126/science.aay2400

## Tehtävä

Kirjoita / muokkaa botti, joka valitsee panostustoiminnon havainnosta.
**Pelisäännöt** (`legalActions`, potit, käsiarvio) hoitaa `src/engine.js`.
Botti saa vain **`botView`**: oman kätensä ja julkisen tiedon — ei muiden
taskukortteja.

## Botin muoto (sopimus)

```js
module.exports = {
  name: "Botin nimi",
  act(view) {
    // palauta YKSI toiminto view.legal:sta
    // { type: "fold"|"check"|"call"|"bet"|"raise", amount? }
  },
};
```

- Puhdas ja synkroninen: sama `view` (+ `view.rng`-sekvenssi) → sama tulos.
- Ei sivuvaikutuksia, ei globaalia tilaa pelien välillä.
- Käytä `view.rng()`, älä `Math.random()`a (determinismi testeissä).
- Pohja: `src/bots/templateBot.js` (sama idea kuin hertan template).

### view-skeema (`botView`)

| kenttä | selitys |
|--------|---------|
| `seat` | oma paikka |
| `hole` | omat 2 taskukorttia `{rank,suit}` |
| `board` | yhteisökortit |
| `street` | preflop/flop/turn/river |
| `pot`, `toCall`, `myBet`, `myChips`, `currentBet`, `minRaise` | panostus |
| `legal` | lailliset toiminnot (moottorin laskemat) |
| `opponents` | `{seat,chips,bet,folded,allIn}` — **ei hole** |
| `rng` | siemenetty `() => [0,1)` |
| `evaluateHand(cards)` | moottorin käsiarvio |

## Mihin botti lisätään

1. Luo `src/bots/<nimi>Bot.js` yllä olevan sopimuksen mukaan.
2. Rekisteröi `src/botRegistry.js`: require + `{ id, name, bot }` listaan.
3. Aja `npm test` ja `npm run arena`.
4. `npm run build` — selain niputtaa samat bottitiedostot.

UI-vaikeudet: `helppo→basic`, `normaali→normal`, `vaikea→hard`.

## Verifiointi (pakollinen)

```bash
npm test              # säännöt + AI-skenaariot + fuzz + pehmeä areena
npm run arena         # peilattu heads-up (oletus: hard vs basic)
npm run arena -- hard random --seeds 30 --hands 40
```

Headless:

```js
const Match = require("./src/match.js");
const r = Match.playMatch(["hard", "normal", "basic", "random"], { seed: 1, hands: 50 });
const c = Match.compareBots("hard", "basic", { seeds: 24, hands: 30 });
```

Kun väität “X on parempi kuin Y”: **peilatut** `compareBots`-ajot (sama seed,
paikat vaihdettu) — sama periaate kuin tupin `handRotate` / `compare-ram-down.mjs`.
Älä päättele vahvuutta yhdestä jaosta.

## Moottorin turvaverkko

`safeAct(bot, view)` — jos botti palauttaa laittoman tai heittää, moottori
valitsee turvallisen laillisen siirron (kuten hertan `safePlay`).

## Projektin kartta

```
src/engine.js       säännöt, botView, safeAct, scenario
src/match.js        playMatch, compareBots
src/botRegistry.js  BOTS + getBot + botForDifficulty
src/botUtil.js      strength-apurit politiikoille (mm. estimateEquity, pickPotFraction)
src/preflopEquity.js  GENEROITU 169 aloituskäden equity-taulukko (npm run gen:preflop)
tools/genPreflopEquity.js  taulukon generointi (aja jos moottorin käsiarvio muuttuu)
src/bots/           random, basic, normal, hard, template
src/game.js         selain-UI
test/run_tests.js   yksikkö + AI
test/arena.js       vahvuusareena
```

## Itsetarkistuslista

- [ ] Olet vilkuillut hertta/tuppi-AGENTS-sopimusta (yllä oleva taulukko)
- [ ] `act` palauttaa aina alkion / määrän `view.legal`:sta
- [ ] Ei muiden taskukorttien lukemista
- [ ] Rekisteröity `botRegistry.js`:ään
- [ ] `npm test` vihreä; areena ei varoita share < 45 % (jos väität vahvuutta)
- [ ] `npm run build` ok
- [ ] Et rikkonut sääntömoottoria turhaan politiikkamuutoksella
