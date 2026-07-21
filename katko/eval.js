#!/usr/bin/env node
// ============================================================================
//  Katko — agentin itsetesti (Node, ei palvelinta). Tarkoitettu ajettavaksi
//  kun olet kirjoittanut oman agentin (esim. tekoälyn tuottaman).
//
//    node eval.js --agent agents/oma.js [--baseline eino] [--deals 3000] [--seed 0]
//
//  Tekee kolme asiaa ja tulostaa selkeän yhteenvedon:
//    1) LAILLISUUS: palauttaako agentti aina kortin view.legal-joukosta eikä
//       kaadu?  Jos ei -> paluukoodi 1.
//    2) VAHVUUS: agenttisi (paikat 0 & 2) vs vertailuagentti (1 & 3), voitto-%.
//    3) NOPEUS: ms / chooseCard.
//  Paluukoodi on 0 vain kun laillisuus on kunnossa -> sopii edit-run-silmukkaan.
// ============================================================================

import path from "node:path";
import { pathToFileURL } from "node:url";
import { playMatch, makeRng } from "./engine.js";

const ALIASES = {
  aino: "./agents/aino.js",
  eino: "./agents/eino.js",
  vaino: "./agents/vaino.js",
};

// Poimi agenttiobjekti moduulista: default-vienti tai ensimmäinen chooseCard.
async function loadAgent(spec) {
  let target;
  if (spec in ALIASES) target = new URL(ALIASES[spec], import.meta.url).href;
  else if (spec === "random" || spec === "sattuma") return makeRandom();
  else target = pathToFileURL(path.resolve(spec)).href;
  const mod = await import(target);
  const cand = mod.default ?? Object.values(mod).find(x => x && typeof x.chooseCard === "function");
  if (!cand || typeof cand.chooseCard !== "function")
    throw new Error(`${spec}: moduulista ei löytynyt agenttia jolla on chooseCard(view)`);
  return cand;
}

function makeRandom(seed = 1) {
  const rnd = makeRng(seed);
  return { name: "Sattuma", style: "Satunnainen", chooseCard(v) { return v.legal[Math.floor(rnd() * v.legal.length)]; } };
}

// Kääre: mittaa laillisuuden, kaatumiset ja ajan, mutta pitää pelin käynnissä
// palauttamalla aina laillisen kortin (matalin) jos agentti mokaa.
function instrument(agent, rec) {
  return {
    name: agent.name,
    style: agent.style,
    chooseCard(view) {
      const t0 = performance.now();
      let c;
      try { c = agent.chooseCard(view); }
      catch (e) { rec.crashes++; rec.lastErr = `${e.name}: ${e.message}`; rec.ms += performance.now() - t0; rec.moves++; return low(view.legal); }
      rec.ms += performance.now() - t0;
      rec.moves++;
      if (!c || !view.legal.some(l => l.suit === c.suit && l.v === c.v)) { rec.illegal++; return low(view.legal); }
      return c;
    },
  };
}
function low(legal) { let lo = legal[0]; for (const c of legal) if (c.v < lo.v) lo = c; return lo; }

function parseArgs(argv) {
  const a = { agent: null, baseline: "eino", matches: 1000, target: 10, seed: 0, kakko: true };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--agent") a.agent = argv[++i];
    else if (k === "--baseline") a.baseline = argv[++i];
    else if (k === "--matches") a.matches = Number(argv[++i]);
    else if (k === "--target") a.target = Number(argv[++i]);
    else if (k === "--seed") a.seed = Number(argv[++i]);
    else if (k === "--kakko") a.kakko = argv[++i] !== "false";
    else if (k === "-h" || k === "--help") {
      console.log("Käyttö: node eval.js --agent <tiedosto|nimi> [--baseline eino] [--matches 1000] [--target 10] [--seed 0]");
      process.exit(0);
    } else throw new Error(`tuntematon valitsin: ${k}`);
  }
  if (!a.agent) throw new Error("--agent on pakollinen");
  return a;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tested = await loadAgent(args.agent);
  const base = await loadAgent(args.baseline);

  const line = "=".repeat(60);
  console.log(line);
  console.log(`ITSETESTI: ${tested.name}  vs  ${base.name}`);
  console.log(`  otteluita=${args.matches} (${args.target}p)  siemen=${args.seed}  kakko=${args.kakko}`);
  console.log(line);

  const rec = { moves: 0, ms: 0, illegal: 0, crashes: 0, lastErr: null };
  const rnd = makeRng(args.seed);
  // Testattava agentti paikoilla 0 & 2, vertailu paikoilla 1 & 3. Pelataan
  // TÄYSIÄ OTTELUITA targetiin; mittari = kumpi "puoli" voitti ottelun.
  let wins = 0, losses = 0;
  for (let m = 0; m < args.matches; m++) {
    const seats = [instrument(tested, rec), base, instrument(tested, rec), base];
    const res = playMatch(seats, args.target, args.kakko, rnd, m % 4);
    if (res.winner === 0 || res.winner === 2) wins++; else losses++;
  }
  const ties = 0;

  // [1] LAILLISUUS
  if (rec.illegal > 0 || rec.crashes > 0) {
    console.log("\n[1] LAILLISUUS: EPÄONNISTUI");
    if (rec.illegal) console.log(`    laittomia siirtoja: ${rec.illegal} (kortti ei ollut view.legal-joukossa)`);
    if (rec.crashes) console.log(`    kaatumisia: ${rec.crashes}  viimeisin: ${rec.lastErr}`);
    console.log("\nTULOS: HYLÄTTY — palauta aina kortti view.legal-joukosta äläkä heitä poikkeusta.");
    console.log(line);
    process.exit(1);
  }
  console.log("\n[1] LAILLISUUS: OK  (ei laittomia siirtoja, ei kaatumisia)");

  // [2] VAHVUUS (otteluvoitot)
  const played = wins + losses;
  const winPct = played ? (100 * wins) / played : 0;
  const verdict = winPct >= 55 ? "VAHVEMPI" : winPct >= 45 ? "TASAVÄKINEN" : "HEIKOMPI";
  console.log(`\n[2] VAHVUUS vs ${base.name} (täydet ottelut ${args.target}p, sinä paikoilla 0&2):`);
  console.log(`    otteluvoitot ${wins} | häviöt ${losses}   -> voitto-% ${winPct.toFixed(1)}`);
  console.log(`    arvio: agenttisi on ${verdict} kuin ${base.name}.`);

  // [3] NOPEUS
  const avgMs = rec.moves ? rec.ms / rec.moves : 0;
  console.log(`\n[3] NOPEUS: ${avgMs.toFixed(3)} ms / siirto (${rec.moves} siirtoa mitattu)`);
  console.log(line);
  console.log(played ? "TULOS: LÄPI." : "TULOS: ei otteluita.");
  console.log(line);
  process.exit(0);
}

main().catch(e => { console.error("Virhe:", e.message); process.exit(1); });
