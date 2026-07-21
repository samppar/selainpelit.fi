#!/usr/bin/env node
// Tuppi-pelin ajuri.
//
// Lataa neljä pelaajaa (kukin omasta tiedostostaan) ja pelaa ottelun.
// Jokainen pelaajatiedosto vie oletusfunktion createPlayer() -> TuppiPlayer.
//
// Esimerkkejä:
//   # oletusottelu: neljä eri tekoälyä vastakkain, pelataan tuppeen asti
//   node play.js
//
//   # valitse pelaajat paikoille 0..3 (paikat 0&2 vs 1&3)
//   node play.js --p0 champion --p1 heuristic --p2 champion --p3 counting
//
//   # anna oma tiedosto polulla
//   node play.js --p1 ./players/myPlayer.js
//
//   # nopea turnaus (16 jakoa) ja vähemmän tulostusta
//   node play.js --deals 16 --quiet
//
//   # pelaa itse paikassa 0 tekoälyjä vastaan
//   node play.js --p0 human

import path from "node:path";
import { pathToFileURL } from "node:url";
import { TuppiEngine } from "./src/index.js";

// lyhytnimet -> tiedostot players-kansiossa
const ALIASES = {
  random: "./players/randomPlayer.js",
  heuristic: "./players/heuristicPlayer.js",
  counting: "./players/countingPlayer.js",
  champion: "./players/championPlayer.js",
  human: "./players/humanPlayer.js",
};
const DEFAULTS = ["champion", "counting", "heuristic", "random"];

async function loadPlayer(spec, seat) {
  let target;
  if (spec in ALIASES) {
    target = new URL(ALIASES[spec], import.meta.url).href;
  } else {
    // moduulipolku / tiedostopolku
    target = pathToFileURL(path.resolve(spec)).href;
  }
  const mod = await import(target);
  const factory = mod.default ?? mod.createPlayer;
  if (typeof factory !== "function") {
    throw new Error(`Tiedostosta ${spec} puuttuu createPlayer() (oletusvienti)`);
  }
  return factory();
}

function parseArgs(argv) {
  const args = {
    p0: DEFAULTS[0],
    p1: DEFAULTS[1],
    p2: DEFAULTS[2],
    p3: DEFAULTS[3],
    seed: null,
    deals: null,
    maxDeals: 500,
    quiet: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--p0": case "--p1": case "--p2": case "--p3":
        args[a.slice(2)] = argv[++i];
        break;
      case "--seed":
        args.seed = Number(argv[++i]);
        break;
      case "--deals":
        args.deals = Number(argv[++i]);
        break;
      case "--max-deals":
        args.maxDeals = Number(argv[++i]);
        break;
      case "--quiet":
        args.quiet = true;
        break;
      case "-h": case "--help":
        console.log("Käyttö: node play.js [--p0 nimi] [--p1 ...] [--seed n] [--deals n] [--quiet]");
        process.exit(0);
        break;
      default:
        throw new Error(`tuntematon valitsin: ${a}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const specs = [args.p0, args.p1, args.p2, args.p3];
  const players = [];
  for (let i = 0; i < 4; i++) players.push(await loadPlayer(specs[i], i));

  console.log("=".repeat(60));
  console.log("NELJÄN TUPPI");
  console.log(`  Joukkue 0 (paikat 0 & 2): ${players[0].name} + ${players[2].name}`);
  console.log(`  Joukkue 1 (paikat 1 & 3): ${players[1].name} + ${players[3].name}`);
  console.log("=".repeat(60));

  const engine = new TuppiEngine(players, { seed: args.seed, verbose: !args.quiet });
  const result = engine.playMatch({ maxDeals: args.maxDeals, fixedDeals: args.deals });

  console.log("\n" + "=".repeat(60));
  if (result.winnerTeam === null) {
    console.log(
      `Tasapeli ${result.dealsPlayed} jaon jälkeen. ` +
        `Pankki: {0:${result.banked[0]}, 1:${result.banked[1]}}`,
    );
  } else {
    const w = result.winnerTeam;
    const how = result.byTuppi ? "TUPPI" : "enemmän nousupisteitä";
    const names = `${players[w].name} + ${players[(w + 2) % 4].name}`;
    console.log(`VOITTO joukkue ${w} (${names}) — ${how}`);
    console.log(`Jakoja: ${result.dealsPlayed} | pankki: {0:${result.banked[0]}, 1:${result.banked[1]}}`);
  }
  console.log("=".repeat(60));
}

main().catch((e) => {
  console.error("Virhe:", e.message);
  process.exit(1);
});
