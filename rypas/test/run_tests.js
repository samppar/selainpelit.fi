// Rypäs — ytimen testit (node test/run_tests.js).
const E = require("../src/engine.js");

let pass = 0, fail = 0;
function ok(c, m) {
  if (c) pass++;
  else { fail++; console.error("  FAIL:", m); }
}

console.log("Rypäs — testit");

// Pussi: 104 + 2 jokeria
E.resetIds();
const bag = E.buildBag(E.makeRNG(1));
ok(bag.length === 106, "pussi 106 palaa, oli " + bag.length);
ok(bag.filter((t) => t.joker).length === 2, "2 jokeria");
ok(bag.filter((t) => !t.joker && t.color === "K").length === 26, "26 mustaa");

// Ryhmä
const g = [
  E.tile("K", 7, false), E.tile("S", 7, false), E.tile("P", 7, false),
];
ok(E.isValidGroup(g), "ryhmä 7 kolmella värillä");
ok(E.isValidSet(g), "ryhmä on rypäs");
ok(!E.isValidGroup(g.slice(0, 2)), "2 palaa ei ryhmä");

const gBad = [
  E.tile("K", 7, false), E.tile("S", 7, false), E.tile("K", 8, false),
];
ok(!E.isValidGroup(gBad), "eri arvot → ei ryhmä");

const gJoker = [
  E.tile("K", 5, false), E.tile("S", 5, false), E.tile(null, 0, true),
];
ok(E.isValidGroup(gJoker), "ryhmä jokerilla");

// Jono
const run = [
  E.tile("P", 3, false), E.tile("P", 4, false), E.tile("P", 5, false),
];
ok(E.isValidRun(run), "jono 3-4-5 punainen");
ok(E.setKind(run) === "run", "setKind = run");

const runGap = [
  E.tile("S", 10, false), E.tile(null, 0, true), E.tile("S", 12, false),
];
ok(E.isValidRun(runGap), "jono jokerilla keskellä");

const runBad = [
  E.tile("S", 1, false), E.tile("S", 2, false), E.tile("P", 3, false),
];
ok(!E.isValidRun(runBad), "eri värit → ei jono");

const wrap = [
  E.tile("K", 12, false), E.tile("K", 13, false), E.tile("K", 1, false),
];
ok(!E.isValidRun(wrap), "ei kiertoa 13→1");

// Lauta
ok(E.validateBoard([g, run]).ok, "kaksi kelvollista rypästä");
ok(!E.validateBoard([g.slice(0, 2)]).ok, "vajaa rypäs hylätään");

// Uusi peli
const G = E.newGame({ seed: 42 });
ok(G.racks[0].length === 14 && G.racks[1].length === 14, "kummallakin 14 palaa");
ok(G.bag.length === 106 - 28, "pussissa 78, oli " + G.bag.length);
ok(G.rackSize === 14, "oletus rackSize 14");

const G7 = E.newGame({ seed: 42, rackSize: 7 });
ok(G7.racks[0].length === 7 && G7.racks[1].length === 7, "rackSize 7 → kummallakin 7");
ok(G7.bag.length === 106 - 14, "pussi 92 kun 7+7, oli " + G7.bag.length);
ok(E.clampRackSize(99) === 20, "liian suuri rackSize → max 20");
ok(E.clampRackSize(3) === 14, "liian pieni rackSize → oletus 14");
ok(E.clampRackSize("x") === 14, "roska-rackSize → oletus 14");
const G20 = E.newGame({ seed: 42, rackSize: 20 });
ok(G20.racks[0].length === 20, "rackSize 20 toimii");
ok(G.board.length === 0, "pöytä tyhjä");
ok(!G.hasMelded[0] && !G.hasMelded[1], "ei avattu");

// Avaus alle 30 hylätään
const small = [
  E.tile("K", 1, false), E.tile("S", 1, false), E.tile("P", 1, false),
];
const stateSmall = {
  board: [],
  racks: [small.concat([E.tile("O", 2, false)]), []],
  turn: 0,
  hasMelded: [false, false],
};
const badMeld = E.validatePlay(stateSmall, [small], [E.tile("O", 2, false)]);
ok(!badMeld.ok, "avaus <30 hylätään: " + (badMeld.error || ""));

// Avaus ≥30 kelpaa (samat tile-oliot rackissa ja siirrossa)
const big = [
  E.tile("K", 11, false), E.tile("S", 11, false), E.tile("P", 11, false),
];
const leftover = E.tile("O", 2, false);
const stateBig = {
  board: [],
  racks: [big.concat([leftover]), []],
  turn: 0,
  hasMelded: [false, false],
};
const goodMeld = E.validatePlay(stateBig, [big], [leftover]);
ok(goodMeld.ok, "avaus 33 kelpaa: " + (goodMeld.error || ""));
ok(goodMeld.score === 33, "avauspisteet 33, oli " + goodMeld.score);

// applyPlay + voitto
const winState = E.newGame({ seed: 7 });
winState.racks[0] = [
  E.tile("K", 10, false), E.tile("S", 10, false), E.tile("P", 10, false),
];
winState.racks[1] = [E.tile("O", 5, false), E.tile("O", 6, false)];
winState.board = [];
winState.hasMelded = [false, false];
winState.turn = 0;
const win = E.applyPlay(winState, [winState.racks[0].slice()], []);
ok(win.ok && win.won, "tyhjä teline = voitto");
ok(winState.over && winState.winner === 0, "pelaaja 0 voitti");
ok(winState.settled, "erä settlattu");
ok(winState.matchScores[0] === winState.scores[0], "eräpisteet otteluun");
ok(winState.matchScores[0] > 0 && winState.matchScores[1] < 0, "voittaja +, häviäjä −");

// Ottelu 200 pisteeseen: seuraava erä säilyttää pistetilanteen
const mid = E.newGame({ seed: 11, matchScores: [180, 40], matchTarget: 200, round: 3 });
ok(mid.matchScores[0] === 180 && mid.round === 3, "ottelu jatkuu erästä 3");
mid.racks[0] = [E.tile("K", 11, false), E.tile("S", 11, false), E.tile("P", 11, false)];
// Vastustajalla 13+12 = 25 → 180+25 = 205 ≥ 200
mid.racks[1] = [E.tile("O", 13, false), E.tile("O", 12, false)];
mid.board = [];
mid.hasMelded = [false, false];
mid.turn = 0;
E.applyPlay(mid, [mid.racks[0].slice()], []);
ok(mid.matchOver && mid.matchWinner === 0, "180 + erä → otteluvoititto (≥200), match=" + mid.matchScores[0]);
ok(E.nextRound(mid) === null, "ei seuraavaa erää ottelun jälkeen");

const cont = E.newGame({ seed: 12, matchScores: [20, 10], matchTarget: 200, round: 1 });
cont.racks[0] = [E.tile("K", 10, false), E.tile("S", 10, false), E.tile("P", 10, false)];
cont.racks[1] = [E.tile("O", 5, false)];
cont.board = [];
cont.hasMelded = [false, false];
cont.turn = 0;
E.applyPlay(cont, [cont.racks[0].slice()], []);
ok(!cont.matchOver, "pieni erä ei päätä ottelua");
const nxt = E.nextRound(cont);
ok(nxt && nxt.round === 2 && nxt.matchScores[0] === cont.matchScores[0], "nextRound jatkaa ottelua");

// Nosto
const dState = E.newGame({ seed: 99 });
const before = dState.racks[0].length;
const bagBefore = dState.bag.length;
const dr = E.drawOne(dState);
ok(dr.ok && dState.racks[0].length === before + 1, "nosto lisää telineeseen");
ok(dState.bag.length === bagBefore - 1, "pussi vähenee");
ok(dState.turn === 1, "vuoro vaihtuu nostossa");

// AI löytää siirron tai nostaa ilman kaatumista
const aiG = E.newGame({ seed: 12345 });
let aiOk = true;
for (let i = 0; i < 40 && !aiG.over; i++) {
  try { E.aiTurn(aiG); }
  catch (e) { aiOk = false; console.error(e); break; }
}
ok(aiOk, "AI 40 vuoroa ilman poikkeusta");
ok(E.validateBoard(aiG.board).ok, "AI:n jälkeen lauta kelpaa");

// Koko peli loppuun
const full = E.newGame({ seed: 777 });
E.playToEnd(full, 800);
ok(full.over, "playToEnd päättyy (seed 777)");
ok(E.validateBoard(full.board).ok, "loppulauta kelpaa");

// Useita siemeniä
let ends = 0;
for (let s = 1; s <= 20; s++) {
  const g2 = E.newGame({ seed: s * 97 });
  E.playToEnd(g2, 800);
  if (g2.over) ends++;
  if (!E.validateBoard(g2.board).ok) {
    ok(false, "lauta rikki seed " + s);
  }
}
ok(ends === 20, "20/20 peliä päättyy, oli " + ends);

// findSetsInRack
E.resetIds();
const rack = [
  E.tile("K", 4, false), E.tile("S", 4, false), E.tile("P", 4, false),
  E.tile("O", 8, false), E.tile("O", 9, false), E.tile("O", 10, false),
];
const found = E.findSetsInRack(rack);
ok(found.length >= 2, "löytää ryhmän ja jonon, oli " + found.length);

// Avaus kun pöydällä on jo rypäitä — vanhoihin ei saa koskea
E.resetIds();
const existing = [
  E.tile("K", 2, false), E.tile("S", 2, false), E.tile("P", 2, false),
];
const openTiles = [
  E.tile("K", 12, false), E.tile("S", 12, false), E.tile("P", 12, false),
];
const keep = E.tile("O", 1, false);
const stBoard = {
  board: [existing],
  racks: [openTiles.concat([keep]), []],
  turn: 0,
  hasMelded: [false, false],
};
const openOk = E.validatePlay(stBoard, [existing, openTiles], [keep]);
ok(openOk.ok, "avaus omilla paloilla kun pöytä ei tyhjä: " + (openOk.error || ""));
const openTouch = E.validatePlay(stBoard, [openTiles], [keep].concat(existing));
ok(!openTouch.ok, "avauksessa ei saa ottaa pöydän paloja telineeseen");

// Säädettävä avausraja
ok(E.clampOpenMin(999) === 50, "openMin klampataan 50:een");
ok(E.clampOpenMin(-5) === 0, "openMin klampataan 0:aan");
ok(E.clampOpenMin(undefined) === 30, "openMin oletus 30");
ok(E.newGame({ seed: 1 }).openMin === 30, "newGame oletus-openMin 30");

// Avaus 3 pistettä: hylätään rajalla 30, kelpaa rajalla 0
const low = [
  E.tile("K", 1, false), E.tile("S", 1, false), E.tile("P", 1, false),
];
const lowKeep = E.tile("O", 2, false);
const st30 = {
  board: [], racks: [low.concat([lowKeep]), []], turn: 0,
  hasMelded: [false, false], openMin: 30,
};
ok(!E.validatePlay(st30, [low], [lowKeep]).ok, "3 p avaus hylätään rajalla 30");
const st0 = {
  board: [], racks: [low.concat([lowKeep]), []], turn: 0,
  hasMelded: [false, false], openMin: 0,
};
ok(E.validatePlay(st0, [low], [lowKeep]).ok, "3 p avaus kelpaa rajalla 0");

// openMin säilyy seuraavaan erään
const om = E.newGame({ seed: 13, openMin: 15 });
om.racks[0] = [E.tile("K", 10, false), E.tile("S", 10, false), E.tile("P", 10, false)];
om.racks[1] = [E.tile("O", 5, false)];
om.board = [];
om.hasMelded = [false, false];
om.turn = 0;
E.applyPlay(om, [om.racks[0].slice()], []);
const omNext = E.nextRound(om);
ok(omNext && omNext.openMin === 15, "openMin 15 säilyy seuraavaan erään");

// Ottelutavoite säädettävissä + pikapeli (yksi erä)
ok(E.clampMatchTarget(999) === 500, "matchTarget klampataan 500:aan");
ok(E.clampMatchTarget(-10) === 0, "negatiivinen matchTarget → 0");
ok(E.clampMatchTarget(undefined) === 200, "matchTarget oletus 200");
ok(E.newGame({ seed: 1, matchTarget: 350 }).matchTarget === 350, "matchTarget 350 asettuu");

const quick = E.newGame({ seed: 21, matchTarget: 0 });
quick.racks[0] = [E.tile("K", 10, false), E.tile("S", 10, false), E.tile("P", 10, false)];
quick.racks[1] = [E.tile("O", 4, false)];
quick.board = [];
quick.hasMelded = [false, false];
quick.turn = 0;
E.applyPlay(quick, [quick.racks[0].slice()], []);
ok(quick.matchOver && quick.matchWinner === 0, "pikapeli: yksi erä päättää ottelun");
ok(E.nextRound(quick) === null, "pikapelissä ei seuraavaa erää");

// Useampi pelaaja
const G3 = E.newGame({ seed: 5, playerCount: 3 });
ok(G3.racks.length === 3 && G3.playerCount === 3, "3 pelaajaa → 3 telinettä");
ok(G3.bag.length === 106 - 3 * 14, "pussi 3 pelaajan jaon jälkeen, oli " + G3.bag.length);
ok(G3.hasMelded.length === 3 && G3.scores.length === 3 && G3.matchScores.length === 3, "tilataulukot 3 pelaajalle");
E.drawOne(G3);
ok(G3.turn === 1, "vuoro 0→1");
E.drawOne(G3);
ok(G3.turn === 2, "vuoro 1→2");
E.drawOne(G3);
ok(G3.turn === 0, "vuoro 2→0 (kierto)");
ok(E.clampPlayerCount(7) === 2, "virheellinen playerCount → oletus 2");

// 3 pelaajan voitto: voittaja saa molempien häviäjien pisteet
const w3 = E.newGame({ seed: 8, playerCount: 3 });
w3.racks[0] = [E.tile("K", 10, false), E.tile("S", 10, false), E.tile("P", 10, false)];
w3.racks[1] = [E.tile("O", 5, false)];
w3.racks[2] = [E.tile("O", 7, false), E.tile("K", 3, false)];
w3.board = [];
w3.hasMelded = [false, false, false];
w3.turn = 0;
E.applyPlay(w3, [w3.racks[0].slice()], []);
ok(w3.over && w3.winner === 0, "3p: pelaaja 0 voitti");
ok(w3.scores[0] === 15 && w3.scores[1] === -5 && w3.scores[2] === -10,
  "3p: pisteet 15/-5/-10, oli " + w3.scores.join("/"));

// 4 pelaajan peli loppuun useilla siemenillä
let ends4 = 0;
for (let s = 1; s <= 10; s++) {
  const g4 = E.newGame({ seed: s * 131, playerCount: 4 });
  E.playToEnd(g4, 1200);
  if (g4.over) ends4++;
  if (!E.validateBoard(g4.board).ok) ok(false, "4p lauta rikki seed " + s);
}
ok(ends4 === 10, "10/10 nelinpeliä päättyy, oli " + ends4);

console.log("\n" + pass + " ok, " + fail + " fail");
process.exit(fail ? 1 : 0);
