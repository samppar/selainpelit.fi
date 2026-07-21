#!/usr/bin/env node
// ============================================================================
//  Katko — päätön turnaus. Istuttaa neljä agenttia pöytään ja pelaa tuhansia
//  siemennettyjä jakoja, kiertäen sekä aloittajaa että istumapaikkoja (jotta
//  paikkaetu tasoittuu). Raportoi kunkin agentin voitto-%:n ja pisteet.
//
//    node tournament.mjs [--deals 4000] [--seed 12345] [--kakko true|false]
//
//  Vain tämä antaa objektiivisen vastauksen "onko Aino oikeasti Väinöä
//  parempi?" ja mahdollistaa base.js:n twoPlan-kynnysten virittämisen
//  mittaamalla arvailun sijaan.
// ============================================================================

import { playMatch, makeRng } from "./engine.js";
import { aino } from "./agents/aino.js";
import { eino } from "./agents/eino.js";
import { vaino } from "./agents/vaino.js";
import { monte } from "./agents/monte.js";

function parseArgs(argv) {
  const a = { matches: 2000, target: 10, seed: 12345, kakko: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--matches") a.matches = Number(argv[++i]);
    else if (k === "--target") a.target = Number(argv[++i]);
    else if (k === "--seed") a.seed = Number(argv[++i]);
    else if (k === "--kakko") a.kakko = argv[++i] !== "false";
    else if (k === "-h" || k === "--help") {
      console.log("Käyttö: node tournament.mjs [--matches 2000] [--target 10] [--seed 12345] [--kakko true|false]");
      process.exit(0);
    } else throw new Error(`tuntematon valitsin: ${k}`);
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));
const rnd = makeRng(args.seed);

// Rosteri: kolme heuristiikkaa + Monte Carlo. Pelataan TÄYSIÄ OTTELUITA
// targetiin (oletus 10) — mittari on otteluvoitot, ei per-jako-pisteet.
const roster = [aino, eino, vaino, monte];
const stats = new Map(roster.map(a => [a, { name: a.name, matches: 0, wins: 0 }]));

const t0 = performance.now();
let totalDeals = 0;
for (let m = 0; m < args.matches; m++) {
  const rot = m % 4;                                   // kierrätä paikkajako
  const seats = roster.map((_, i) => roster[(i + rot) % 4]);
  const res = playMatch(seats, args.target, args.kakko, rnd, m % 4);
  totalDeals += res.deals;
  for (let seat = 0; seat < 4; seat++) stats.get(seats[seat]).matches++;
  stats.get(seats[res.winner]).wins++;
}
const ms = performance.now() - t0;

const rows = [...stats.values()].sort((a, b) => b.wins - a.wins);
const line = "=".repeat(64);
console.log(line);
console.log(`KATKO-TURNAUS (ottelut ${args.target}p)   otteluita=${args.matches}  siemen=${args.seed}  kakko=${args.kakko}`);
console.log(line);
console.log("  agentti".padEnd(14) + "otteluvoitto-%".padStart(16) + "voitot".padStart(9) + "ottelut".padStart(9));
for (const r of rows) {
  const winPct = (100 * r.wins / r.matches).toFixed(1);
  console.log("  " + r.name.padEnd(12) + winPct.padStart(16) + String(r.wins).padStart(9) + String(r.matches).padStart(9));
}
console.log(line);
console.log(`  (tasapeli-odotus 25.0 %). ${(totalDeals / args.matches).toFixed(1)} jakoa/ottelu, ${(1000 * args.matches / ms).toFixed(0)} ottelua/s.`);
console.log(line);
