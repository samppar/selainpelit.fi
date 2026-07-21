#!/usr/bin/env node
// Hold'em — bottiturnaus / areena (kuten hertta tournament + tuppi compare).
// Käyttö:
//   npm run arena
//   node test/arena.js hard basic --seeds 30 --hands 40
const Match = require("../src/match.js");
const Registry = require("../src/botRegistry.js");

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  if (i < 0) return def;
  return process.argv[i + 1];
}

const a = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : "hard";
const b = process.argv[3] && !process.argv[3].startsWith("-") ? process.argv[3] : "basic";
const seeds = +arg("seeds", 24);
const hands = +arg("hands", 30);
const stack = +arg("stack", 500);
const seed0 = +arg("seed0", 1000);

const ids = Registry.BOTS.map((x) => x.id).join(", ");
if (!Registry.BOTS.some((x) => x.id === a) || !Registry.BOTS.some((x) => x.id === b)) {
  console.error("Tuntematon botti. Saatavilla: " + ids);
  process.exit(1);
}

console.log("Hold'em areena: " + a + " vs " + b);
console.log("  seeds=" + seeds + " hands/peli=" + hands + " stack=" + stack + " (peilatut HU)");
console.log("  botit: " + ids);

const t0 = Date.now();
const r = Match.compareBots(a, b, { seeds, hands, startingStack: stack, seed0 });
const ms = Date.now() - t0;

console.log("  " + r.a + " chipit: " + r.aChips + "  (voittoja " + r.aWins + ")");
console.log("  " + r.b + " chipit: " + r.bChips + "  (voittoja " + r.bWins + ")");
console.log("  tasapelit: " + r.ties);
console.log("  " + r.a + " share: " + (100 * r.aShare).toFixed(1) + "%");
console.log("  aika: " + ms + " ms");

if (r.aShare < 0.45) {
  console.error("VAROITUS: " + r.a + " share < 45% — tarkista politiikka.");
  process.exitCode = 1;
}
