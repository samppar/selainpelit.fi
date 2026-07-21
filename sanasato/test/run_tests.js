// Sanasato — kevyet ydintestit (node test/run_tests.js).
const fs = require("node:fs");
const path = require("node:path");
const E = require("../src/engine.js");

const words = fs
  .readFileSync(path.join(__dirname, "..", "sanat.txt"), "utf8")
  .split(/\r?\n/)
  .filter(Boolean);

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; } else { fail++; console.error("  FAIL:", msg); }
}

console.log("Sanoja sanastossa:", words.length);
const t0 = Date.now();
const trie = E.buildTrie(words);
console.log("Trie rakennettu:", Date.now() - t0, "ms");

// Trie-haku
ok(E.trieHas(trie, words[1000]), "trieHas löytää tunnetun sanan");
ok(!E.trieHas(trie, "xyzq"), "trieHas hylkää tuntemattoman");

// Naapuruus & polun laillisuus (4x4)
ok(E.isAdjacent(0, 1, 4) && E.isAdjacent(0, 5, 4) && !E.isAdjacent(0, 2, 4), "isAdjacent");
ok(E.isValidPath([0, 1, 2, 3], 4), "suora rivi laillinen");
ok(!E.isValidPath([0, 2], 4), "loikkaus laiton");
ok(!E.isValidPath([0, 1, 0], 4), "ruudun toisto laiton");

// Pisteytys
ok(E.scoreWord("kis") === 1 && E.scoreWord("talot") === 2 && E.scoreWord("kirjasto") === 11, "scoreWord");

// Ratkaisija tunnetulla laudalla: "talo" pitää löytyä poluista.
// Lauta 2x... teemme 4x4 jossa t-a-l-o vierekkäin.
const b = ["t", "a", "x", "x", "l", "o", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x"];
const sol = E.solve(b, 4, trie, { minLen: 3 });
ok(sol.has("talo"), "ratkaisija löytää 'talo'");

// findPath: löytää polun tunnetulle sanalle, hylkää mahdottoman
const fp = E.findPath(b, 4, "talo");
ok(fp && E.pathWord(fp, b) === "talo" && E.isValidPath(fp, 4), "findPath löytää 'talo'");
ok(E.findPath(b, 4, "tab") === null, "findPath hylkää mahdottoman sanan (kirjain puuttuu)");

// Deterministinen arvonta: sama siemen -> sama lauta
const g1 = E.generateBoard(4, trie, E.makeRNG(20260721), { maxTries: 200 });
const g2 = E.generateBoard(4, trie, E.makeRNG(20260721), { maxTries: 200 });
ok(g1.board.join("") === g2.board.join(""), "sama siemen -> sama lauta");
ok(g1.words >= 10, "arvottu 4x4-lauta tuottaa sanoja (" + g1.words + ")");

// Kaikki ratkaisijan sanat ovat sanastossa ja polut laillisia
let allValid = true;
g1.solution.forEach((p, w) => {
  if (!E.trieHas(trie, w)) allValid = false;
  if (!E.isValidPath(p, 4)) allValid = false;
  if (E.pathWord(p, g1.board) !== w) allValid = false;
});
ok(allValid, "ratkaisijan sanat & polut ovat päteviä");

console.log("Esimerkkilauta (4x4), sanoja", g1.words, "maxpisteet", E.maxScore(g1.solution));
console.log(g1.board.slice(0, 4).join(" "));
console.log(g1.board.slice(4, 8).join(" "));
console.log(g1.board.slice(8, 12).join(" "));
console.log(g1.board.slice(12, 16).join(" "));

// 5x5 nopeus
const t1 = Date.now();
const g5 = E.generateBoard(5, trie, E.makeRNG(12345), { maxTries: 200 });
console.log("5x5 arvonta+ratkaisu:", Date.now() - t1, "ms, sanoja", g5.words);
ok(g5.words >= 20, "5x5 tuottaa runsaasti sanoja (" + g5.words + ")");

console.log("\n" + pass + " ok, " + fail + " fail");
process.exit(fail ? 1 : 0);
