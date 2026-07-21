// Sanaseppä — kevyet ydintestit (node test/run_tests.js).
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

// --- Pussi: 100 laattaa, 2 tyhjää ---
const bag = E.createBag(E.makeRNG(1));
ok(bag.length === 100, "pussissa 100 laattaa (" + bag.length + ")");
ok(bag.filter((x) => x === E.BLANK).length === 2, "pussissa 2 tyhjää");
let sumVals = 0;
Object.keys(E.BAG_COUNTS).forEach((ch) => { sumVals += E.BAG_COUNTS[ch]; });
ok(sumVals === 98, "kirjainlaattoja 98 (" + sumVals + ")");

// Sama siemen -> sama pussi (deterministinen).
const b1 = E.createBag(E.makeRNG(42)).join("");
const b2 = E.createBag(E.makeRNG(42)).join("");
ok(b1 === b2, "sama siemen -> sama pussi");

// --- Kerroinlauta: keskiruutu on tuplasana, symmetrinen ---
ok(E.premiumAt(7, 7) === "2W", "keskiruutu = tuplasana");
ok(E.premiumAt(0, 0) === "3W", "kulma = kolmesana");
ok(E.premiumAt(4, 4) === "2W" && E.premiumAt(4, 10) === "2W", "vinot mid-game-tuplasanat");
ok(E.premiumAt(0, 7) === "" && E.premiumAt(7, 0) === "", "sivujen keskipisteet eivät ole tuplasanoja");
ok(E.premiumAt(1, 5) === "3L" && E.premiumAt(5, 1) === "3L", "kolmekirjaimet toisen kehän paikoilla");
ok(E.premiumAt(0, 3) === "" && E.premiumAt(3, 0) === "", "vanhat reuna-3L poistettu");
ok(E.premiumAt(7, 5) === "" && E.premiumAt(5, 7) === "", "avausakseli ei sisällä 3×K");
let symOk = true, n2W = 0, n3L = 0;
for (let r = 0; r < 15; r++)
  for (let c = 0; c < 15; c++) {
    if (E.premiumAt(r, c) !== E.premiumAt(r, 14 - c)) symOk = false;
    if (E.premiumAt(r, c) !== E.premiumAt(14 - r, c)) symOk = false;
    if (E.premiumAt(r, c) === "2W") n2W++;
    if (E.premiumAt(r, c) === "3L") n3L++;
  }
ok(symOk, "kerroinlauta symmetrinen molempien akselien suhteen");
ok(n2W === 5, "tuplasanaruituja vain 5 (" + n2W + ")");
ok(n3L === 8, "kolmekirjainruutuja 8 (" + n3L + ")");

// Avaus keskiakselilla ei osu vinottaisiin 2×S-ruutuihin (ei ×4).
ok(E.premiumAt(7, 3) === "" && E.premiumAt(7, 11) === "", "keskiakselilla ei ylimääräisiä tuplasanoja");

// --- Trie ---
ok(E.trieHas(trie, "talo"), "trieHas löytää 'talo'");
ok(!E.trieHas(trie, "xyzq"), "trieHas hylkää tuntemattoman");

// --- Ensisiirto: keskiruudun kautta ---
let board = E.emptyBoard();
// "talo" vaakaan keskeltä: (7,7)(7,8)(7,9)(7,10)
let placed = [
  { r: 7, c: 7, ch: "t" }, { r: 7, c: 8, ch: "a" },
  { r: 7, c: 9, ch: "l" }, { r: 7, c: 10, ch: "o" },
];
let res = E.validateMove(board, placed, trie);
ok(res.ok, "ensisiirto 'talo' laillinen: " + (res.reason || ""));
// (7,7)=2W -> koko sana ×2. t1+a1+l2+o2 = 6, ×2 = 12.
ok(res.score === 12, "ensisiirron pisteet 12 (" + res.score + ")");

// Ensisiirto keskiruudun ohi -> laiton.
let bad = E.validateMove(board, [
  { r: 0, c: 0, ch: "t" }, { r: 0, c: 1, ch: "a" },
  { r: 0, c: 2, ch: "l" }, { r: 0, c: 3, ch: "o" },
], trie);
ok(!bad.ok, "ensisiirto keskiruudun ohi hylätään");

// Aseta 'talo' laudalle ja jatka siihen liittyvällä sanalla.
placed.forEach((p) => { board[E.idx(p.r, p.c)] = { ch: p.ch, blank: false }; });

// Ei-ensisiirto joka ei liity -> laiton.
let disc = E.validateMove(board, [
  { r: 0, c: 0, ch: "k" }, { r: 0, c: 1, ch: "i" }, { r: 0, c: 2, ch: "s" }, { r: 0, c: 3, ch: "a" },
], trie);
ok(!disc.ok, "irrallinen sana hylätään");

// Epäsana -> hylätään.
let non = E.validateMove(board, [{ r: 6, c: 7, ch: "x" }, { r: 8, c: 7, ch: "z" }], trie);
ok(!non.ok, "epäsana hylätään");

// --- Tekoälyn siirtogeneraattori ---
// Tyhjä lauta, teline jolla saa 'talo'.
let empty = E.emptyBoard();
let rack = ["t", "a", "l", "o", "k", "i", "s"];
let t1g = Date.now();
let moves = E.generateMoves(empty, rack, trie);
console.log("Ensisiirron generointi:", Date.now() - t1g, "ms, siirtoja", moves.length);
ok(moves.length > 0, "generaattori löytää ensisiirtoja (" + moves.length + ")");
// Kaikki generoidut siirrot ovat laillisia ja kulkevat keskiruudun kautta.
let allLegal = moves.every((m) => {
  let v = E.validateMove(empty, m.cells, trie);
  return v.ok && v.score === m.score;
});
ok(allLegal, "kaikki generoidut ensisiirrot laillisia");
let allCenter = moves.every((m) => m.cells.some((x) => x.r === 7 && x.c === 7));
ok(allCenter, "kaikki ensisiirrot keskiruudun kautta");
ok(moves[0].score >= moves[moves.length - 1].score, "siirrot laskevassa pistejärjestyksessä");

// Toinen siirto olemassa olevalle laudalle: liitä 'talo'-lautaan.
let board2 = E.emptyBoard();
[["t", 7, 7], ["a", 7, 8], ["l", 7, 9], ["o", 7, 10]].forEach(([ch, r, c]) => {
  board2[E.idx(r, c)] = { ch: ch, blank: false };
});
let rack2 = ["k", "i", "s", "a", "n", "e", "t"];
let t2g = Date.now();
let moves2 = E.generateMoves(board2, rack2, trie);
console.log("Jatkosiirron generointi:", Date.now() - t2g, "ms, siirtoja", moves2.length);
ok(moves2.length > 0, "generaattori löytää jatkosiirtoja (" + moves2.length + ")");
let allLegal2 = moves2.every((m) => E.validateMove(board2, m.cells, trie).ok);
ok(allLegal2, "kaikki jatkosiirrot laillisia");
// Jokaisen jatkosiirron on liityttävä olemassa olevaan (ei irrallisia).
let allConnected2 = moves2.every((m) => {
  return m.cells.every((x) => board2[E.idx(x.r, x.c)] == null); // ei päällekkäin
});
ok(allConnected2, "jatkosiirrot eivät mene olemassa olevien päälle");
if (moves2[0]) console.log("Paras jatkosiirto:", moves2[0].main, "=", moves2[0].score, "p");

// --- Bingo-bonus: 7 laattaa -> +50 (tarkistetaan että kenttä on tosi jos osuu) ---
let bingoMove = moves.find((m) => m.cells.length === 7);
if (bingoMove) ok(bingoMove.bingo === true, "7 laatan siirto merkitty bingoksi");

// Bingo rackSize-optiolla: 5 laatan bingolla kun rackSize=5
const mini5 = E.buildTrie(["aaaa", "aaaaa"]);
const mb5 = E.emptyBoard();
const mp5 = [7, 8, 9, 10, 11].map((c) => ({ r: 7, c: c, ch: "a" }));
const mr5 = E.validateMove(mb5, mp5, mini5, { rackSize: 5 });
// Keskiruutu 2W: 5×1 ×2 = 10 + bingo
ok(mr5.ok && mr5.bingo === true && mr5.score === 10 + E.BINGO_BONUS, "bingo rackSize=5 (" + (mr5.reason || mr5.score) + ")");
const mr5no = E.validateMove(mb5, mp5.slice(0, 4), mini5, { rackSize: 5 });
ok(mr5no.ok && mr5no.bingo === false, "4 laattaa ei ole bingo kun rackSize=5");

// refill kunnioittaa size-parametria
const bagR = E.createBag(E.makeRNG(9));
const rack5 = [];
E.refill(rack5, bagR, 5);
ok(rack5.length === 5, "refill(..., 5) nostaa 5 laattaa");
E.refill(rack5, bagR, 8);
ok(rack5.length === 8, "refill(..., 8) täyttää kahdeksaan");

// --- Kahden tuplasanaruudun kasautuminen: (4,4) ja (4,10) -> ×2×2 = ×4 ---
// Ei ensisiirto: laudalla on jo ankkuri (4,7), jotta yhteys täyttyy.
const mini = E.buildTrie(["aaaaaaa"]);
const mb = E.emptyBoard();
mb[E.idx(4, 7)] = { ch: "a", blank: false };
const mp = [4, 5, 6, 8, 9, 10].map((c) => ({ r: 4, c: c, ch: "a" }));
const mr = E.validateMove(mb, mp, mini);
ok(mr.ok && mr.score === 36, "kaksi tuplasanaruutua kasautuu ×4 (" + (mr.reason || mr.score) + ")");

// --- rackValue: tyhjä laatta 0, muut summautuvat ---
ok(E.rackValue(["a", "g", E.BLANK, "t"]) === 10, "rackValue laskee oikein (tyhjä = 0)");

console.log("\n" + pass + " ok, " + fail + " fail");
process.exit(fail ? 1 : 0);
