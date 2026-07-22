// Mylly — ytimen testit (node test/run_tests.js).
const E = require("../src/engine.js");

let pass = 0, fail = 0;
function ok(c, m) {
  if (c) pass++;
  else { fail++; console.error("  FAIL:", m); }
}

console.log("Mylly engine tests");

ok(E.MILLS.length === 16, "16 myllyviivaa");
ok(E.ADJ.length === 24 && E.COORD.length === 24, "24 pistettä");
ok(E.ADJ[0].length === 2 && E.ADJ[4].length === 4, "kulma 2 / risti 4 naapuria");

// Tyhjä peli: 24 asettelusiirtoa
let st = E.initState(E.HUMAN);
let moves = E.genMoves(st);
ok(moves.length === 24, "aloitus: 24 tyhjää asettelua, oli " + moves.length);
ok(moves.every((m) => m.from < 0 && m.remove < 0), "aloitussiirrot ilman poistoa");

// Aseta mylly riville 0-1-2
st = E.initState(E.HUMAN);
st = E.applyMove(st, { from: -1, to: 0, remove: -1 }); // H
st = E.applyMove(st, { from: -1, to: 21, remove: -1 }); // AI
st = E.applyMove(st, { from: -1, to: 1, remove: -1 }); // H
st = E.applyMove(st, { from: -1, to: 22, remove: -1 }); // AI
ok(st.turn === E.HUMAN, "ihmisen vuoro ennen myllyä");
moves = E.genMoves(st);
const millMoves = moves.filter((m) => m.to === 2 && m.remove >= 0);
ok(millMoves.length >= 1, "asettelu pisteeseen 2 tekee myllyn + poiston");
ok(millMoves.every((m) => m.remove === 21 || m.remove === 22), "poistaa AI:n nappulan");

// Myllyssä olevaa ei saa poistaa jos muita on
st = E.initState(E.HUMAN);
// H: 0,1,2 mill + AI: 21 mill-ish and 3 outside
st.board = [
  E.HUMAN, E.HUMAN, E.HUMAN, E.AI,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  E.AI, 0, 0
];
st.toPlace = [0, 0];
st.turn = E.HUMAN;
ok(E.inMill(st.board, 0, E.HUMAN), "0 on myllyssä");
let rem = E.removables(st.board, E.AI);
ok(rem.indexOf(3) >= 0, "AI:n nappula 3 poistettavissa");
// Tee AI-mylly 21,22,23 — sitten molemmat myllyssä tai ei
st.board[21] = E.AI;
st.board[22] = E.AI;
st.board[23] = E.AI;
st.board[3] = 0;
rem = E.removables(st.board, E.AI);
ok(rem.length === 3 && rem.every((i) => E.inMill(st.board, i, E.AI)),
  "kun kaikki myllyssä, kaikki poistettavissa");

// Siirtovaihe + lento
st = E.initState(E.HUMAN);
st.toPlace = [0, 0];
st.board[0] = E.HUMAN;
st.board[1] = E.HUMAN;
st.board[2] = E.HUMAN;
st.board[21] = E.AI;
st.board[22] = E.AI;
st.board[23] = E.AI;
st.turn = E.HUMAN;
ok(E.canFly(st, E.HUMAN), "3 nappulaa → lento");
moves = E.genMoves(st);
ok(moves.some((m) => m.from === 0 && m.to === 10), "lento ei-naapuriin");

// Häviö: alle 3
st = E.initState(E.AI);
st.toPlace = [0, 0];
st.board[0] = E.HUMAN;
st.board[1] = E.HUMAN;
st.board[21] = E.AI;
st.board[22] = E.AI;
st.turn = E.HUMAN;
ok(E.isLoss(st), "ihminen häviää <3 nappulalla");

// AI palauttaa laillisen siirron
st = E.initState(E.AI);
const mv = E.bestMove(st, 200);
ok(mv && mv.from < 0 && mv.to >= 0 && mv.to < 24, "AI löytää asettelusiirron");
const after = E.applyMove(st, mv);
ok(after.board[mv.to] === E.AI, "AI-siirto sovellettavissa");
ok(after.toPlace[1] === 8, "AI:n varasto vähenee");

// AI sulkee uhatun myllyn mieluiten
st = E.initState(E.AI);
st.board[0] = E.HUMAN;
st.board[1] = E.HUMAN;
st.toPlace = [7, 9];
st.turn = E.AI;
const block = E.bestMove(st, 400);
ok(block && block.to === 2, "AI estää myllyn pisteessä 2, oli to=" + (block && block.to));

console.log("\n" + pass + " ok, " + fail + " fail");
process.exit(fail ? 1 : 0);
