#!/usr/bin/env node
// Pariutettu JAKOTASON vertailu pelimuodon mukaan eriteltynä.
//   node compare-by-type.mjs --a players/bridgePlayer.js [--b ...] [--deals 500] [--sims 60]
//
// Jokainen "pari" = yksi riippumaton pöytäpelijako (ei nousukertymää, joka
// sekoittaisi pariutuksen): samat kortit pelataan kahdesti, A joukkueessa 0 ja
// sitten A joukkueessa 1. Jaon tuuri kumoutuu. Kirjaa A:n pistemarginaalin
// (voitetut − hävityt) ERIKSEEN gameTypen (rami/nolo/sooli) mukaan.
//
// Näyttöpäätös on identtinen A:lla ja B:llä (Silta/Aavistus perivät Mestarin
// chooseShow'n) ja siemenet asetetaan paikkakohtaisesti samoiksi, joten sama
// jako saa saman gameTypen molemmin puolin -> puhdas ämpäröinti.

import { pathToFileURL } from "node:url";
import path from "node:path";
import { TuppiEngine } from "./src/index.js";

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const A = opt("--a", "players/bridgePlayer.js");
const B = opt("--b", "players/championPlayer.js");
const DEALS = Number(opt("--deals", 500));
const SIMS = Number(opt("--sims", 60));
const ASIG = opt("--asignal", null);

async function load(spec) {
  const mod = await import(pathToFileURL(path.resolve(spec)).href);
  return mod.default ?? mod.createPlayer;
}
const makeA = await load(A);
const makeB = await load(B);
const mk = (make, seed, sig = null) => {
  const p = make();
  if ("sims" in p) p.sims = SIMS;
  if (p.rng) p.rng = new (p.rng.constructor)(seed);
  if (sig !== null && "signalBand" in p) p.signalBand = Number(sig);
  return p;
};

// Yksi jako, palauta dealResult. seatSeeds[s] = paikan s pelaajan siemen.
function oneDeal(factories, seatSeeds, sigForA, aSeats, engineSeed) {
  const players = [0, 1, 2, 3].map((s) =>
    mk(factories[s], seatSeeds[s], aSeats.has(s) ? sigForA : null),
  );
  const res = new TuppiEngine(players, { seed: engineSeed, strict: true }).playMatch({ fixedDeals: 1 });
  return res.dealResults[0];
}

const buckets = {}; // gameType -> { margins: [] }
const add = (gt, m) => { (buckets[gt] ??= { margins: [] }).margins.push(m); };

const t0 = Date.now();
let mismatched = 0;
for (let g = 0; g < DEALS; g++) {
  const engineSeed = 90000 + g;
  const seatSeeds = [0, 1, 2, 3].map((s) => engineSeed * 4 + s);
  // Puoli 1: A joukkueessa 0 (paikat 0,2)
  const r1 = oneDeal([makeA, makeB, makeA, makeB], seatSeeds, ASIG, new Set([0, 2]), engineSeed);
  const m1 = r1.winnerTeam === 0 ? r1.points : -r1.points; // A:n (joukkue0) marginaali
  // Puoli 2: A joukkueessa 1 (paikat 1,3), samat kortit
  const r2 = oneDeal([makeB, makeA, makeB, makeA], seatSeeds, ASIG, new Set([1, 3]), engineSeed);
  const m2 = r2.winnerTeam === 1 ? r2.points : -r2.points; // A:n (joukkue1) marginaali

  if (r1.gameType !== r2.gameType) { mismatched++; continue; }
  add(r1.gameType, m1 + m2); // pariutettu marginaali (tuuri kumottu)
}

const el = ((Date.now() - t0) / 1000).toFixed(0);
console.log(`A=${A}${ASIG !== null ? ` (signalBand=${ASIG})` : ""}`);
console.log(`B=${B}`);
console.log(`jakoja=${DEALS} sims=${SIMS}  [${el}s]  (ohitettu erimuotoisia: ${mismatched})\n`);
console.log("gameType | jakoja | ka-marginaali (A:n pisteet, pariutettu) | SE | voitto-% (marginaali>0)");
console.log("─".repeat(84));
const order = ["rami", "nolo", "sooli"];
for (const gt of order) {
  const b = buckets[gt];
  if (!b) continue;
  const n = b.margins.length;
  const mean = b.margins.reduce((a, x) => a + x, 0) / n;
  const varr = b.margins.reduce((a, x) => a + (x - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
  const se = Math.sqrt(varr / n);
  const wins = b.margins.filter((x) => x > 0).length;
  const losses = b.margins.filter((x) => x < 0).length;
  const wr = wins + losses ? (100 * wins / (wins + losses)).toFixed(1) : "-";
  console.log(
    `${gt.padEnd(8)} | ${String(n).padStart(6)} | ${(mean >= 0 ? "+" : "") + mean.toFixed(2).padStart(6)} p` +
    `                          | ${se.toFixed(2)} | ${wr}%`,
  );
}
console.log("\n(ka-marginaali > 0 => A parempi ko. muodossa; ~2 SE = merkitsevä)");
