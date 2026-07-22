#!/usr/bin/env node
// Pariutettu kahden pelaajatehtaan vertailu (play-to-52, matala varianssi).
//   node compare-players.mjs --a players/pluribusPlayer.js --b players/championPlayer.js
//                            [--pairs 40] [--sims 24] [--maxDeals 400]
// Jokainen pari: sama siemen, A istuu joukkueessa 0; sitten sama siemen, A
// istuu joukkueessa 1. Jakojen tuuri kumoutuu -> jäljelle jää pelaajaero.

import { pathToFileURL } from "node:url";
import path from "node:path";
import { TuppiEngine } from "./src/index.js";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const A = opt("--a", "players/pluribusPlayer.js");
const B = opt("--b", "players/championPlayer.js");
const PAIRS = Number(opt("--pairs", 40));
const SIMS = Number(opt("--sims", 24));
const MAXD = Number(opt("--maxDeals", 400));
const ASIG = opt("--asignal", null); // aseta A:n signalBand jos annettu

async function load(spec) {
  const mod = await import(pathToFileURL(path.resolve(spec)).href);
  return mod.default ?? mod.createPlayer;
}
const makeA = await load(A);
const makeB = await load(B);
// Injektoi sims + siemen jos tehdas tukee (championPlayer-perhe tukee).
const mk = (make, seed, sig = null) => {
  try {
    const p = make();
    if ("sims" in p) p.sims = SIMS;
    if (p.rng) p.rng = new (p.rng.constructor)(seed);
    if (sig !== null && "signalBand" in p) p.signalBand = Number(sig);
    return p;
  } catch { return make(); }
};

let aWins = 0, bWins = 0, ties = 0;
const t0 = Date.now();
let lastPrint = t0;
for (let g = 0; g < PAIRS; g++) {
  // Väliaikatulostus ~60 s välein (pitkät ajot näkyviksi).
  if (Date.now() - lastPrint >= 60000) {
    lastPrint = Date.now();
    const el = ((Date.now() - t0) / 1000).toFixed(0);
    const wr = aWins + bWins ? (100 * aWins / (aWins + bWins)).toFixed(1) : "-";
    console.log(`  [${el}s] ${g}/${PAIRS} paria | A ${aWins} – B ${bWins} (tasan ${ties}) | A voitto-% ${wr}`);
  }
  const seed = 5000 + g * 4;
  // Puoli 1: A joukkueessa 0
  {
    const players = [mk(makeA, seed, ASIG), mk(makeB, seed + 1), mk(makeA, seed + 2, ASIG), mk(makeB, seed + 3)];
    const res = new TuppiEngine(players, { seed, strict: true }).playMatch({ maxDeals: MAXD });
    if (res.winnerTeam === 0) aWins++; else if (res.winnerTeam === 1) bWins++; else ties++;
  }
  // Puoli 2: A joukkueessa 1 (samat jaot)
  {
    const players = [mk(makeB, seed), mk(makeA, seed + 1, ASIG), mk(makeB, seed + 2), mk(makeA, seed + 3, ASIG)];
    const res = new TuppiEngine(players, { seed, strict: true }).playMatch({ maxDeals: MAXD });
    if (res.winnerTeam === 1) aWins++; else if (res.winnerTeam === 0) bWins++; else ties++;
  }
}
const played = aWins + bWins + ties;
const el = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`A=${A}\nB=${B}\npairs=${PAIRS} (=${PAIRS * 2} pelia) sims=${SIMS}  [${el}s]`);
console.log(`A voitot: ${aWins} | B voitot: ${bWins} | tasan: ${ties}`);
console.log(`A voitto-% (ratkaistuista): ${(100 * aWins / (aWins + bWins || 1)).toFixed(1)}%`);
