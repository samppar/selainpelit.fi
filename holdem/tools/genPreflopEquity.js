#!/usr/bin/env node
// genPreflopEquity.js — laskee 169 aloituskäden Monte Carlo -equityn
// vs 1..3 satunnaista vastustajaa ja kirjoittaa src/preflopEquity.js.
// Ajo: npm run gen:preflop (kestää muutaman minuutin; tulos commitoidaan).
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const E = require("../src/engine.js");

const ITERS = 12000;
const SUITS = ["s", "h", "d", "c"];

function mulberry(seed) {
  let s = seed >>> 0;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function compareVec(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function equity(hole, opps, rng) {
  const known = {};
  hole.forEach((c) => { known[c.rank + c.suit] = true; });
  const deck = [];
  for (const s of SUITS) {
    for (let r = 2; r <= 14; r++) {
      if (!known[r + s]) deck.push({ rank: r, suit: s });
    }
  }
  let score = 0;
  for (let it = 0; it < ITERS; it++) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    const board = deck.slice(0, 5);
    const mine = E.evaluateHand(hole.concat(board)).vector;
    let beaten = false;
    let tied = 0;
    for (let o = 0; o < opps && !beaten; o++) {
      const oh = [deck[5 + o * 2], deck[6 + o * 2]];
      const c = compareVec(E.evaluateHand(oh.concat(board)).vector, mine);
      if (c > 0) beaten = true;
      else if (c === 0) tied++;
    }
    if (!beaten) score += 1 / (1 + tied);
  }
  return score / ITERS;
}

const table = {};
let done = 0;
for (let hi = 2; hi <= 14; hi++) {
  for (let lo = 2; lo <= hi; lo++) {
    const variants = hi === lo
      ? [["p", [{ rank: hi, suit: "s" }, { rank: lo, suit: "h" }]]]
      : [
          ["s", [{ rank: hi, suit: "s" }, { rank: lo, suit: "s" }]],
          ["o", [{ rank: hi, suit: "s" }, { rank: lo, suit: "h" }]],
        ];
    for (const [kind, hole] of variants) {
      const key = hi + "_" + lo + "_" + kind;
      const rng = mulberry(hi * 1000 + lo * 10 + kind.charCodeAt(0));
      table[key] = [1, 2, 3].map((opps) =>
        Math.round(equity(hole, opps, rng) * 1000) / 1000
      );
      done++;
      if (done % 20 === 0) console.log(done + "/169");
    }
  }
}

const out =
  "// preflopEquity.js — GENEROITU (tools/genPreflopEquity.js, " +
  ITERS + " iteraatiota/solu). Älä muokkaa käsin.\n" +
  "// Avain: hi_lo_p|s|o (p=pari, s=suited, o=offsuit); arvo: equity vs [1,2,3] satunnaista vastustajaa.\n" +
  "\"use strict\";\n" +
  "module.exports = " + JSON.stringify(table) + ";\n";

fs.writeFileSync(path.join(__dirname, "..", "src", "preflopEquity.js"), out);
console.log("Wrote src/preflopEquity.js (" + Object.keys(table).length + " kättä)");
