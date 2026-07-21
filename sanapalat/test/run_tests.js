// Sanapalat — ytimen testit (node test/run_tests.js).
const fs = require("node:fs");
const path = require("node:path");
const E = require("../src/engine.js");

// Sanasto jaetaan sanasato-pelin kanssa.
const DICT = path.join(__dirname, "..", "..", "sanasato", "sanat.txt");
const words = fs.readFileSync(DICT, "utf8").split(/\r?\n/).filter(Boolean);

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error("  FAIL:", m); } }

const trie = E.buildTrie(words);
console.log("Sanoja:", words.length);

// Palasarja summautuu 100 palaan + 2 jokeria
let total = 0, blanks = 0; E.TILE_BAG.forEach(t => { total += t[1]; if (t[0] === "?") blanks += t[1]; });
ok(total === 100 && blanks === 2, "palasarja 100 palaa (98 kirjainta + 2 jokeria), oli " + total);

// Bonuslauta 15x15, keskiruutu on kaksinkert. sana
ok(E.PREMIUM.length === 15 && E.PREMIUM[0].length === 15, "lauta 15x15");
ok(E.premiumAt(7, 7) === "*" && E.wordMult("*") === 2, "keskiruutu = 2x sana");
// symmetria
ok(E.premiumAt(0, 0) === E.premiumAt(14, 14) && E.premiumAt(0, 14) === E.premiumAt(14, 0), "kulmat symmetriset");

// Aloitussiirto: "talo" vaakaan keskiruudun kautta (7,6)-(7,9)
const bd = E.emptyBoard();
const place = [
  { r: 7, c: 6, l: "t" }, { r: 7, c: 7, l: "a" }, { r: 7, c: 8, l: "l" }, { r: 7, c: 9, l: "o" },
];
const res = E.validateAndScore(bd, place, trie);
ok(res.ok, "aloitus 'talo' kelpaa: " + (res.error || ""));
// talo = t1+a1+l1+o1 = 4, keskiruutu 2x sana -> 8
ok(res.score === 8, "talo pisteet 8 (2x keskiruutu), oli " + res.score);

// Aloitus joka ei kata keskiruutua -> virhe
const bad = E.validateAndScore(bd, [{ r: 0, c: 0, l: "t" }, { r: 0, c: 1, l: "e" }, { r: 0, c: 2, l: "e" }], trie);
ok(!bad.ok, "aloitus ilman keskiruutua hylätään");

// Ei-sana hylätään
const bad2 = E.validateAndScore(bd, [{ r: 7, c: 7, l: "x" }, { r: 7, c: 8, l: "q" }, { r: 7, c: 9, l: "z" }], trie);
ok(!bad2.ok, "ei-sana hylätään");

// Aseta 'talo' pysyvästi ja liitä siihen uusi sana pystyyn: 'lato' tms.
place.forEach(p => bd[p.r][p.c] = { l: p.l, blank: false });
// pystyyn kirjaimesta o (7,9): 'osa' alas
const cross = E.validateAndScore(bd, [{ r: 8, c: 9, l: "s" }, { r: 9, c: 9, l: "a" }], trie);
ok(cross.ok, "liitossana 'osa' kelpaa: " + (cross.error || ""));

// AI löytää aloitussiirron tyhjällä laudalla annetulla rackilla
const bd2 = E.emptyBoard();
const rack = ["t", "a", "l", "o", "s", "i", "e"];
const t0 = Date.now();
const mv = E.bestMove(bd2, rack, trie);
console.log("AI-aloitussiirto:", Date.now() - t0, "ms");
ok(mv && mv.placements.length >= 2, "AI löytää aloitussiirron");
if (mv) {
  const check = E.validateAndScore(bd2, mv.placements, trie);
  ok(check.ok, "AI-siirto on laillinen: " + (check.error || ""));
  console.log("  AI pelaisi:", mv.words.map(w => w.word).join(","), "=", mv.score, "p");
}

// AI löytää jatkosiirron kun laudalla on 'talo'
const bd3 = E.emptyBoard();
[["t",7,6],["a",7,7],["l",7,8],["o",7,9]].forEach(([l,r,c]) => bd3[r][c] = { l, blank: false });
const t1 = Date.now();
const mv2 = E.bestMove(bd3, ["s", "i", "n", "a", "k", "e", "m"], trie);
console.log("AI-jatkosiirto:", Date.now() - t1, "ms");
ok(mv2 && mv2.placements.length >= 1, "AI löytää jatkosiirron");
if (mv2) {
  const check2 = E.validateAndScore(bd3, mv2.placements, trie);
  ok(check2.ok, "AI-jatkosiirto laillinen: " + (check2.error || ""));
  console.log("  AI jatkaisi:", mv2.words.map(w => w.word).join(","), "=", mv2.score, "p");
}

console.log("\n" + pass + " ok, " + fail + " fail");
process.exit(fail ? 1 : 0);
