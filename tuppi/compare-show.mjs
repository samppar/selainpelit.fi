#!/usr/bin/env node
// Vertaa perus-Mestaria varovaiseen Mestariin (nostettu ramauskynnys).
// Hypoteesi: tekoälyt ramaavat liikaa -> varovaisempi näyttö menestyy paremmin.
//
//   node compare-show.mjs [--matches M] [--deals D] [--sims S] [--bias a,b,c]
//
// Jokaisella bias-arvolla pelataan M ottelua kummallakin puolella (reilu).
// Ottelu = D jakoa; voittaja = enemmän nousupisteitä (banked). Raportoi
// varovaisen mallin ramaus-%, otteluvoitto-% ja keskimääräinen pistemarginaali.

import { TuppiEngine } from "./src/index.js";
import { ChampionPlayer } from "./players/championPlayer.js";

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const MATCHES = Number(opt("--matches", 120));
const DEALS = Number(opt("--deals", 16));
const SIMS = Number(opt("--sims", 20));
const BIASES = opt("--bias", "0.4,0.7,1.0,1.5").split(",").map(Number);
// --to52: pelaa KOKONAISIA pelejä 52 pisteeseen (tuppi) fixed-deal sijaan.
// Silloin voittaja = 52:een päässyt joukkue, ja pudotus maksaa koko nousun.
const TO52 = argv.includes("--to52");

// Pelaaja joka laskee näyttöpäätöksensä (rami/nolo).
function tallyingChampion(bias, seed, tally) {
  const p = new ChampionPlayer(null, { simulations: SIMS, seed, ramBias: bias });
  const orig = p.chooseShow.bind(p);
  p.chooseShow = (view) => { const d = orig(view); tally[d] = (tally[d] || 0) + 1; return d; };
  return p;
}

// Yksi ottelu: joukkue0 = bias b0, joukkue1 = bias b1.
// Palauttaa joukkueen0 "hyödyn": to52-tilassa +1/-1/0 (voitto/häviö/tasan),
// muuten banked-pistemarginaali. Päivittää ram-tallyt.
function match(b0, b1, seed, t0, t1) {
  const players = [
    tallyingChampion(b0, seed, t0), tallyingChampion(b1, seed + 1, t1),
    tallyingChampion(b0, seed + 2, t0), tallyingChampion(b1, seed + 3, t1),
  ];
  const eng = new TuppiEngine(players, { seed, strict: true });
  if (TO52) {
    const res = eng.playMatch({ maxDeals: 400 }); // pelaa kunnes joku tekee tupen
    return res.winnerTeam === 0 ? 1 : res.winnerTeam === 1 ? -1 : 0;
  }
  const res = eng.playMatch({ fixedDeals: DEALS });
  return res.banked[0] - res.banked[1];
}

const UNIT = TO52 ? "" : " p";
console.log(`Vertailu: perus-Mestari (bias 0) vs varovainen Mestari`);
console.log(TO52
  ? `(${MATCHES} peliä/puoli, KOKONAISIA pelejä 52:een, ${SIMS} simulaatiota)\n`
  : `(${MATCHES} ottelua/puoli, ${DEALS} jakoa/ottelu, ${SIMS} simulaatiota)\n`);
console.log("bias  | varov. ramaa-%  perus ramaa-%  | varov. voitto-%  " + (TO52 ? "netto-voittosuhde" : "ka-marginaali"));
console.log("─".repeat(74));

const t0 = Date.now();
let lastPrint = t0;
for (const bias of BIASES) {
  const tBase = {}, tCaut = {};
  let cautWins = 0, played = 0, marginSum = 0;
  for (let g = 0; g < MATCHES; g++) {
    // Väliaikatulos 10 s välein: juokseva tilanne meneillään olevalle biasille.
    if (Date.now() - lastPrint >= 10000) {
      lastPrint = Date.now();
      const el = ((Date.now() - t0) / 1000).toFixed(0);
      const ramPct = (t) => { const r = t.rami || 0, n = t.nolo || 0; return r + n ? (100 * r / (r + n)).toFixed(1) : "-.-"; };
      console.log(
        `  [${el}s] bias ${bias.toFixed(2)}  ${played}/${MATCHES * 2} peliä | ` +
        `varov. ramaa ${ramPct(tCaut)}% | voitto-% ${played ? (100 * cautWins / played).toFixed(1) : "-"} | ` +
        `marginaali ${played ? (marginSum / played >= 0 ? "+" : "") + (marginSum / played).toFixed(2) : "-"}${UNIT}`,
      );
    }
    // Pariutettu vertailu: SAMA siemen (samat jaot) molemmilla puolilla, vain
    // strategia vaihtaa joukkuetta -> jakojen tuuri kumoutuu, jäljelle jää
    // pelkkä ramauskynnyksen vaikutus.
    const seed = 1000 + g * 4;
    // Puoli A: joukkue0 = perus, joukkue1 = varovainen
    let d = match(0, bias, seed, tBase, tCaut);
    marginSum += -d; // varovaisen (joukkue1) marginaali
    if (-d > 0) cautWins++; played++;
    // Puoli B: joukkue0 = varovainen, joukkue1 = perus (samat jaot)
    d = match(bias, 0, seed, tCaut, tBase);
    marginSum += d; // varovaisen (joukkue0) marginaali
    if (d > 0) cautWins++; played++;
  }
  const ramPct = (t) => { const r = t.rami || 0, n = t.nolo || 0; return (100 * r / (r + n)).toFixed(1); };
  console.log(
    `${bias.toFixed(1).padStart(4)}  |   ${ramPct(tCaut).padStart(5)}%        ${ramPct(tBase).padStart(5)}%       |   ` +
    `${(100 * cautWins / played).toFixed(1).padStart(5)}%          ${(marginSum / played >= 0 ? "+" : "") + (marginSum / played).toFixed(2)}${UNIT}`,
  );
}
console.log(TO52
  ? "\n(voitto-% = varovaisen osuus voitetuista peleistä 52:een; > 50% = varovainen parempi. netto = (voitot−häviöt)/pelit)"
  : "\n(ka-marginaali = varovaisen nousupisteet − perus-Mestarin, per ottelu; > 0 = varovainen parempi)");
