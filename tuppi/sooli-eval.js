#!/usr/bin/env node
// Sooli-strategian itsetesti: laillisuus + vahvuus baselinea vastaan.
//
//   node sooli-eval.js [strategia] [--deals N]
//
// Ajaa strategian molemmissa rooleissa BASELINEA vastaan ja raportoi:
//   - laittomat lyönnit (pitää olla 0)
//   - selviäminen soolaajana (%)   vs baseline-puolustus
//   - pysäytys puolustajana (%)    vs baseline-soolaaja
// Paluukoodi 1 jos laittomia siirtoja -> sopii tekoälyn edit-run-silmukkaan.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deal, RNG, ShowView, MatchState, partnerOf } from "./src/index.js";
import { runSooliDeal } from "./src/sooliMatch.js";
import { createSooliStrategy as makeBaseline } from "./sooli-strategies/baseline.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
let deals = 1000; const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--deals") deals = Number(argv[++i]); else positional.push(argv[i]);
}
const name = positional[0] || "baseline";
const p = name.endsWith(".js") || name.includes("/") ? path.resolve(ROOT, name) : path.join(ROOT, "sooli-strategies", `${name}.js`);
const mod = await import(pathToFileURL(p).href);
const factory = mod.default || mod.createSooliStrategy;

const RAMAAJA = 0, SOOLAAJA = 1;
const MSTATE = new MatchState({ dealNumber: 1, dealer: 3, upTeam: null, upScore: 0, banked: { 0: 0, 1: 0 }, target: 52 });
let illegal = 0;

// Käärii strategian lyönnit laillisuustarkistukseen.
function guard(fn) {
  return (view) => {
    const c = fn(view);
    if (!view.legalMoves.includes(c)) { illegal++; return view.legalMoves[0]; }
    return c;
  };
}

function playOne(hands, soolStrat, defStrat) {
  const h = hands.map((x) => x.slice());
  const soolPartner = partnerOf(SOOLAAJA);
  const gift = soolStrat.gift(new ShowView({ seat: SOOLAAJA, hand: h[SOOLAAJA], match: MSTATE }));
  const gi = h[SOOLAAJA].indexOf(gift); if (gi < 0) { illegal++; return null; }
  const ret = soolStrat.ret(new ShowView({ seat: soolPartner, hand: h[soolPartner], match: MSTATE }));
  const ri = h[soolPartner].indexOf(ret); if (ri < 0) { illegal++; return null; }
  h[SOOLAAJA].splice(gi, 1); h[SOOLAAJA].push(ret);
  h[soolPartner].splice(ri, 1); h[soolPartner].push(gift);
  const sPlay = guard(soolStrat.soolaajaPlay.bind(soolStrat));
  const dPlay = guard(defStrat.ramaajaPlay.bind(defStrat));
  const res = runSooliDeal({
    hands: h, ramaaja: RAMAAJA, soolaaja: SOOLAAJA, mstate: MSTATE,
    getCard: (seat, view) => (seat === SOOLAAJA ? sPlay(view) : dPlay(view)),
  });
  return !res.soolaajaTookTrick;
}

let survivedAsSool = 0, trappedAsDef = 0, n = 0;
for (let g = 0; g < deals; g++) {
  const hands = deal(new RNG(g + 1));
  const S = factory(g + 1), base = makeBaseline();
  const asSool = playOne(hands, S, base);        // S soolaa vs baseline-puolustus
  const baseSool = playOne(hands, base, S);      // baseline soolaa vs S-puolustus
  if (asSool === null || baseSool === null) continue;
  n++;
  if (asSool) survivedAsSool++;
  if (!baseSool) trappedAsDef++;                 // S pysäytti baseline-soolan
}

const pct = (x) => ((100 * x) / n).toFixed(1) + "%";
console.log(`\nSooli-eval: ${name}   (${n} jakoa vs baseline)`);
console.log(`  Laittomat lyönnit:      ${illegal}  ${illegal === 0 ? "✓" : "✗"}`);
console.log(`  Selvisi soolaajana:     ${pct(survivedAsSool)}`);
console.log(`  Pysäytti puolustajana:  ${pct(trappedAsDef)}\n`);
process.exit(illegal === 0 ? 0 : 1);
