#!/usr/bin/env node
// Vertaa perus-Mestaria Mestariin, joka ramaa vähemmän ALHAALLA
// (oma joukkue ei nousulla). Pelataan aina 52:een.
//
// Peilaus: jokaisella siemenellä pelataan KAKSI peliä samoilla jako-
// sekvensseillä — toisessa handRotate=1, jolloin joukkueen A kortit
// menevät joukkueelle B. Strategiat pysyvät paikoillaan → tuuri kumoutuu
// paremmin, tarvitaan vähemmän toistoja.
//
//   node compare-ram-down.mjs [--pairs N] [--sims S] [--bias a,b,c]
//
// Oletus: sims=60 (tuotanto), pairs=40 → 80 peliä / bias.

import { TuppiEngine } from "./src/index.js";
import { ChampionPlayer } from "./players/championPlayer.js";

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const PAIRS = Number(opt("--pairs", 40));
const SIMS = Number(opt("--sims", 60));
const BIASES = opt("--bias", "0.3,0.5,0.7").split(",").map(Number);

function makePlayers(downBias, seed, tallies) {
  // Joukkue 0 = varovainen alhaalla; joukkue 1 = perus (bias 0).
  const mk = (biasDown, s, tally) => {
    const p = new ChampionPlayer(null, {
      simulations: SIMS,
      seed: s,
      ramBias: 0,
      ramBiasDown: biasDown,
    });
    const orig = p.chooseShow.bind(p);
    p.chooseShow = (view) => {
      const d = orig(view);
      const key = view.match.upTeam === view.team ? "up" : "down";
      tally[key] = tally[key] || { rami: 0, nolo: 0 };
      tally[key][d] += 1;
      return d;
    };
    return p;
  };
  return [
    mk(downBias, seed, tallies.caut),
    mk(0, seed + 1, tallies.base),
    mk(downBias, seed + 2, tallies.caut),
    mk(0, seed + 3, tallies.base),
  ];
}

/** Yksi 52-peli. Palauttaa +1 jos joukkue0 (varovainen) voittaa. */
function playOne(downBias, seed, handRotate, tallies) {
  const eng = new TuppiEngine(makePlayers(downBias, seed, tallies), {
    seed,
    strict: true,
    handRotate,
  });
  const res = eng.playMatch({ maxDeals: 400 });
  if (res.winnerTeam === 0) return 1;
  if (res.winnerTeam === 1) return -1;
  return 0;
}

function ramPct(tally, situ) {
  const t = tally[situ] || { rami: 0, nolo: 0 };
  const n = t.rami + t.nolo;
  return n ? (100 * t.rami / n).toFixed(1) : "-.-";
}

console.log("Vertailu: perus-Mestari vs Mestari joka ramaa vähemmän ALHAALLA");
console.log(
  `(${PAIRS} peilattua paria = ${PAIRS * 2} peliä/bias, KOKONAISIA 52:een, sims=${SIMS})\n` +
    `Peilaus: sama siemen, handRotate 0 sitten 1 (joukkue A↔B kortit).\n`,
);
console.log(
  "bias↓ | caut ramaa-% alhaalla / ylhäällä | base sama | caut voitto-% | netto",
);
console.log("─".repeat(78));

const t0 = Date.now();
let lastPrint = t0;

for (const bias of BIASES) {
  const tallies = { caut: {}, base: {} };
  let cautWins = 0;
  let played = 0;
  let net = 0;

  for (let g = 0; g < PAIRS; g++) {
    if (Date.now() - lastPrint >= 60000) {
      lastPrint = Date.now();
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      const eta = played > 0
        ? ` ~${Math.round((Date.now() - t0) / played * (PAIRS * 2 - played) / 1000)}s jäljellä tällä biasilla`
        : "";
      console.log(
        `  [${el}s] bias↓ ${bias}  ${played}/${PAIRS * 2} | ` +
          `voitto-% ${played ? (100 * cautWins / played).toFixed(1) : "-"} | ` +
          `caut alhaalla ramaa ${ramPct(tallies.caut, "down")}%` + eta,
      );
    }
    const seed = 2000 + g * 4;
    // Peli A: normaalit kortit
    let d = playOne(bias, seed, 0, tallies);
    net += d;
    if (d > 0) cautWins++;
    played++;
    // Peli B: samat jaot, joukkueen A kortit → B
    d = playOne(bias, seed, 1, tallies);
    net += d;
    if (d > 0) cautWins++;
    played++;
  }

  console.log(
    `${bias.toFixed(1).padStart(4)}  | ` +
      `${ramPct(tallies.caut, "down").padStart(5)}% / ${ramPct(tallies.caut, "up").padStart(5)}%`.padEnd(28) +
      ` | ${ramPct(tallies.base, "down").padStart(5)}% / ${ramPct(tallies.base, "up").padStart(5)}%` +
      ` | ${(100 * cautWins / played).toFixed(1).padStart(6)}%` +
      ` | ${(net / played >= 0 ? "+" : "") + (net / played).toFixed(3)}`,
  );
}

console.log(
  "\n(voitto-% = varovaisen-alhaalla osuus peleistä 52:een; > 50% = muutos auttaa. " +
    "netto = (voitot−häviöt)/pelit)",
);
console.log(`Valmis ${((Date.now() - t0) / 1000).toFixed(0)} s.`);
