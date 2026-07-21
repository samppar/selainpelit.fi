#!/usr/bin/env node
// Sooli-turnaus: aseta kaksi sooli-strategiaa vastakkain MOLEMMISSA rooleissa.
//
//   node sooli-tournament.mjs [A] [B] [--deals N] [--seed S]
//
// A ja B ovat sooli-strategioita: nimi (sooli-strategies/NIMI.js) tai polku
// .js-tiedostoon joka vie createSooliStrategy(). Oletus: baseline vs random.
//
// Jokaisella jaolla pelataan KAKSI soolia samoilla korteilla:
//   1) A soolaa, B puolustaa   -> selvisikö A?
//   2) B soolaa, A puolustaa   -> selvisikö B?
// Reilua: kumpikin saa saman käden soolattavaksi. "Sooli-vahvuus" = kuinka
// usein selviät soolaajana + kuinka usein pysäytät vastustajan soolaajana.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deal, RNG, ShowView, MatchState, partnerOf } from "./src/index.js";
import { runSooliDeal } from "./src/sooliMatch.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

async function loadStrategy(nameOrPath) {
  const p = nameOrPath.endsWith(".js") || nameOrPath.includes("/")
    ? path.resolve(ROOT, nameOrPath)
    : path.join(ROOT, "sooli-strategies", `${nameOrPath}.js`);
  const mod = await import(pathToFileURL(p).href);
  const factory = mod.default || mod.createSooliStrategy;
  if (typeof factory !== "function") throw new Error(`Strategia ${nameOrPath}: ei createSooliStrategy-vientiä`);
  return factory;
}

// --- Argumentit -------------------------------------------------------- //
const argv = process.argv.slice(2);
let deals = 2000, seed0 = 1;
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--deals") deals = Number(argv[++i]);
  else if (argv[i] === "--seed") seed0 = Number(argv[++i]);
  else positional.push(argv[i]);
}
const nameA = positional[0] || "baseline";
const nameB = positional[1] || "random";

const RAMAAJA = 0, SOOLAAJA = 1; // paikat: soolaaja 1, ramaajat 0 & 2, sivussa 3
const MSTATE = new MatchState({ dealNumber: 1, dealer: 3, upTeam: null, upScore: 0, banked: { 0: 0, 1: 0 }, target: 52 });

// Aja yksi sooli: soolStrat soolaa (paikka SOOLAAJA), defStrat puolustaa.
function playOne(hands, soolStrat, defStrat) {
  const h = hands.map((x) => x.slice()); // älä mutatoi alkuperäistä
  const soolPartner = partnerOf(SOOLAAJA);
  // Kortinvaihto: soolaaja antaa, pari palauttaa.
  const gift = soolStrat.gift(new ShowView({ seat: SOOLAAJA, hand: h[SOOLAAJA], match: MSTATE }));
  const gi = h[SOOLAAJA].indexOf(gift); if (gi < 0) return null;
  const ret = soolStrat.ret(new ShowView({ seat: soolPartner, hand: h[soolPartner], match: MSTATE }));
  const ri = h[soolPartner].indexOf(ret); if (ri < 0) return null;
  h[SOOLAAJA].splice(gi, 1); h[SOOLAAJA].push(ret);
  h[soolPartner].splice(ri, 1); h[soolPartner].push(gift);

  const res = runSooliDeal({
    hands: h, ramaaja: RAMAAJA, soolaaja: SOOLAAJA, mstate: MSTATE,
    getCard: (seat, view) => (seat === SOOLAAJA ? soolStrat.soolaajaPlay(view) : defStrat.ramaajaPlay(view)),
  });
  return !res.soolaajaTookTrick; // true = soolaaja selvisi (voitti)
}

const facA = await loadStrategy(nameA);
const facB = await loadStrategy(nameB);

let aSurvived = 0, bSurvived = 0, played = 0;
for (let g = 0; g < deals; g++) {
  const hands = deal(new RNG(seed0 + g));
  const A = facA(seed0 + g), B = facB(seed0 + g * 7 + 3);
  const rA = playOne(hands, A, B); // A soolaa, B puolustaa
  const rB = playOne(hands, B, A); // B soolaa, A puolustaa
  if (rA === null || rB === null) continue;
  played++;
  if (rA) aSurvived++;
  if (rB) bSurvived++;
}

const pct = (n) => ((100 * n) / played).toFixed(1) + "%";
// Sooli-vahvuus = selviäminen soolaajana + pysäytys puolustajana.
const aTrap = played - bSurvived; // A pysäytti B:n soolan
const bTrap = played - aSurvived;
const aStrength = aSurvived + aTrap, bStrength = bSurvived + bTrap;

console.log(`\nSooli-turnaus: ${nameA}  vs  ${nameB}   (${played} jakoa, siemen ${seed0})`);
console.log("─".repeat(58));
console.log(`  Soolaajana selvisi:   ${nameA} ${pct(aSurvived)}   |   ${nameB} ${pct(bSurvived)}`);
console.log(`  Puolustajana pysäytti: ${nameA} ${pct(aTrap)}   |   ${nameB} ${pct(bTrap)}`);
console.log("─".repeat(58));
console.log(`  Sooli-vahvuus (selviä+pysäytä): ${nameA} ${(50 * aStrength / played).toFixed(1)}  |  ${nameB} ${(50 * bStrength / played).toFixed(1)}  (max 100)`);
const winner = aStrength > bStrength ? nameA : bStrength > aStrength ? nameB : "tasan";
console.log(`  → Parempi sooli-malli: ${winner}\n`);
