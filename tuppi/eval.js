#!/usr/bin/env node
// Pelaajan itsetesti — Node, ei palvelinta. Tarkoitettu tekoälyn (Codex)
// ajettavaksi kun se on kirjoittanut oman pelaajan.
//
//   node eval.js --player players/myPlayer.js
//
// Tekee kolme asiaa ja tulostaa selkeän yhteenvedon:
//   1) LAILLISUUS: pelaa jakoja tiukassa tilassa; laiton siirto tai kaatuminen
//      => paluukoodi 1.
//   2) VAHVUUS: pelaajasi (paikat 0 & 2) vs vertailupelaaja (1 & 3), voitto-%.
//   3) NOPEUS: ms / siirto.
// Paluukoodi on 0 vain kun laillisuus on kunnossa -> sopii silmukkaan.

import path from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import { TuppiEngine, TuppiPlayer, IllegalMove } from "./src/index.js";

const ALIASES = {
  random: "./players/randomPlayer.js",
  heuristic: "./players/heuristicPlayer.js",
  counting: "./players/countingPlayer.js",
  champion: "./players/championPlayer.js",
};

async function loadFactory(spec) {
  let target;
  if (spec in ALIASES) target = new URL(ALIASES[spec], import.meta.url).href;
  else target = pathToFileURL(path.resolve(spec)).href;
  const mod = await import(target);
  const f = mod.default ?? mod.createPlayer;
  if (typeof f !== "function") throw new Error(`${spec}: puuttuu createPlayer() (oletusvienti)`);
  return f;
}

// Kääre joka mittaa siirrot ja ajan mutta delegoi oikealle pelaajalle.
class CountingWrapper extends TuppiPlayer {
  constructor(inner) {
    super(inner.name);
    this.inner = inner;
    this.moves = 0;
    this.seconds = 0;
  }
  chooseShow(v) { return this.inner.chooseShow(v); }
  playCard(v) {
    const t0 = performance.now();
    const c = this.inner.playCard(v);
    this.seconds += (performance.now() - t0) / 1000;
    this.moves += 1;
    return c;
  }
  onDealStart(v) { this.inner.onDealStart(v); }
  onShowResult(g, r) { this.inner.onShowResult(g, r); }
  onTrickComplete(t, w) { this.inner.onTrickComplete(t, w); }
  onDealEnd(t, w, p) { this.inner.onDealEnd(t, w, p); }
}

function parseArgs(argv) {
  const a = { player: null, baseline: "champion", deals: 12, games: 30, seed: 0, tuppi: false, maxDeals: 200 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--player") a.player = argv[++i];
    else if (k === "--baseline") a.baseline = argv[++i];
    else if (k === "--deals") a.deals = Number(argv[++i]);
    else if (k === "--games") a.games = Number(argv[++i]);
    else if (k === "--seed") a.seed = Number(argv[++i]);
    else if (k === "--tuppi") a.tuppi = true; // pelaa oikeaan 52-tuppiin asti
    else if (k === "--max-deals") a.maxDeals = Number(argv[++i]);
    else if (k === "-h" || k === "--help") {
      console.log("Käyttö: node eval.js --player <tiedosto|nimi> [--baseline champion] [--deals 12] [--games 30] [--seed 0] [--tuppi] [--max-deals 200]");
      process.exit(0);
    } else throw new Error(`tuntematon valitsin: ${k}`);
  }
  if (!a.player) throw new Error("--player on pakollinen");
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const makePlayer = await loadFactory(args.player);
  const makeBase = await loadFactory(args.baseline);

  const line = "=".repeat(60);
  console.log(line);
  console.log(`ITSETESTI: ${makePlayer().name}  vs  ${makeBase().name}`);
  const modeStr = args.tuppi
    ? `oikea tuppi (nousu ≥ 52, max ${args.maxDeals} jakoa)`
    : `${args.deals} jakoa/ottelu (pankkivertailu)`;
  console.log(`  ottelut=${args.games}  muoto=${modeStr}  siemen=${args.seed}`);
  console.log(line);

  let wins = 0, losses = 0, ties = 0;
  let bankedFor = 0, bankedAgainst = 0;
  let testedMoves = 0, testedSeconds = 0;
  let illegal = null;

  for (let g = 0; g < args.games; g++) {
    const w0 = new CountingWrapper(makePlayer());
    const w2 = new CountingWrapper(makePlayer());
    const players = [w0, makeBase(), w2, makeBase()];
    const engine = new TuppiEngine(players, { seed: args.seed + g, verbose: false, strict: true });
    let result;
    try {
      result = args.tuppi
        ? engine.playMatch({ maxDeals: args.maxDeals })
        : engine.playMatch({ fixedDeals: args.deals });
    } catch (e) {
      illegal = e instanceof IllegalMove ? e.message : `${e.name}: ${e.message}`;
      break;
    }
    bankedFor += result.banked[0];
    bankedAgainst += result.banked[1];
    if (args.tuppi) {
      // Voitto = joukkue joka teki tupen (tai enemmän pankkia jos raja täyttyi).
      if (result.winnerTeam === 0) wins++;
      else if (result.winnerTeam === 1) losses++;
      else ties++;
    } else if (result.banked[0] > result.banked[1]) wins++;
    else if (result.banked[1] > result.banked[0]) losses++;
    else ties++;
    testedMoves += w0.moves + w2.moves;
    testedSeconds += w0.seconds + w2.seconds;
  }

  if (illegal !== null) {
    console.log("\n[1] LAILLISUUS: EPÄONNISTUI");
    console.log("    Pelaaja teki laittoman siirron tai kaatui:");
    console.log("    " + illegal);
    console.log("\nTULOS: HYLÄTTY — palauta aina kortti view.legalMoves-joukosta äläkä kaadu.");
    console.log(line);
    process.exit(1);
  }

  const played = wins + losses + ties;
  const winPct = played ? (100 * wins) / played : 0;
  const avgMs = testedMoves ? (1000 * testedSeconds) / testedMoves : 0;

  console.log("\n[1] LAILLISUUS: OK  (ei laittomia siirtoja, ei kaatumisia)");
  console.log(`\n[2] VAHVUUS vs ${makeBase().name}:`);
  console.log(`    voitot ${wins} | häviöt ${losses} | tasan ${ties}   -> voitto-% ${winPct.toFixed(1)}`);
  console.log(`    nousupisteet yhteensä: oma ${bankedFor} vs vastustaja ${bankedAgainst}`);
  const verdict = winPct >= 55 ? "VAHVEMPI" : winPct >= 45 ? "TASAVÄKINEN" : "HEIKOMPI";
  console.log(`    arvio: pelaajasi on ${verdict} kuin ${makeBase().name}.`);
  console.log(`\n[3] NOPEUS: ${avgMs.toFixed(2)} ms / siirto (${testedMoves} siirtoa mitattu)`);
  console.log(line);
  console.log(played ? "TULOS: LÄPI." : "TULOS: ei otteluita.");
  console.log(line);
  process.exit(0);
}

main().catch((e) => {
  console.error("Virhe:", e.message);
  process.exit(1);
});
