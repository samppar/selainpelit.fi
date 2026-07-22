// Palikat — ytimen testit (node test/run_tests.js).
const E = require("../src/engine.js");

let pass = 0, fail = 0;
function ok(c, m) {
  if (c) pass++;
  else { fail++; console.error("  FAIL:", m); }
}

console.log("Palikat engine tests");

ok(E.SIZE === 14, "lauta 14×14");
ok(E.ALL_IDS.length === 21, "21 palaa");
ok(E.PIECE_DEFS.reduce((s, p) => s + p.size, 0) === 89, "yhteensä 89 ruutua per pelaaja");

let st = E.initState(E.HUMAN);
ok(st.board.length === 196, "196 ruutua");
ok(st.remaining[E.HUMAN].length === 21, "ihmisellä 21 palaa");
ok(st.remaining[E.AI].length === 21, "AI:lla 21 palaa");
ok(st.turn === E.HUMAN, "ihminen aloittaa");
ok(st.first[E.HUMAN] && st.first[E.AI], "molemmat ensimmäisessä siirrossa");

let moves = E.genMoves(st);
ok(moves.length > 0, "aloituksessa on laillisia siirtoja, oli " + moves.length);

// jokaisen aloitussiirron pitää peittää aloitusruutu
let start = E.START[E.HUMAN];
let sr = E.rowOf(start), sc = E.colOf(start);
ok(moves.every(function (mv) {
  return mv.cells.some(function (c) { return c[0] === sr && c[1] === sc; });
}), "kaikki aloitussiirrot peittävät (4,4)");

// mono aloitusruudulle
let mono = moves.find(function (m) { return m.pieceId === "1"; });
ok(!!mono, "yhden ruudun pala voi peittää aloituksen");
ok(mono.cells.length === 1 && mono.cells[0][0] === sr && mono.cells[0][1] === sc, "mono tarkalleen aloituksessa");

st = E.applyMove(st, mono);
ok(st.board[start] === E.HUMAN, "aloitusruutu peitetty");
ok(st.squares[E.HUMAN] === 1, "1 piste");
ok(!st.first[E.HUMAN], "ei enää ensimmäinen siirto");
ok(st.turn === E.AI, "AI:n vuoro");
ok(st.remaining[E.HUMAN].indexOf("1") < 0, "mono poistettu");

// AI:n ensimmäinen siirto peittää (9,9)
let aiMoves = E.genMoves(st);
let aiStart = E.START[E.AI];
let ar = E.rowOf(aiStart), ac = E.colOf(aiStart);
ok(aiMoves.length > 0, "AI:lla aloitussiirtoja");
ok(aiMoves.every(function (mv) {
  return mv.cells.some(function (c) { return c[0] === ar && c[1] === ac; });
}), "AI peittää (9,9)");

let aiMono = aiMoves.find(function (m) { return m.pieceId === "1"; });
st = E.applyMove(st, aiMono);
ok(st.board[aiStart] === E.AI, "AI aloitus peitetty");
ok(st.turn === E.HUMAN, "takaisin ihmiselle");

// kulmakosketus: domino kulmasta ihmisen monosta
let cornerMoves = E.genMovesForPiece(st, E.HUMAN, "2");
ok(cornerMoves.length > 0, "domino laillinen kulmasta, oli " + cornerMoves.length);

// reunakosketus samaan väriin kielletty — rakenna tilanne
let edgeIllegal = E.canPlace(st, E.HUMAN, [[sr, sc + 1]]);
ok(!edgeIllegal, "ei saa sijoittaa reunaan kiinni omaan palaan");

// tyhjä ruutu kaukana ilman kulmaa kielletty
ok(!E.canPlace(st, E.HUMAN, [[0, 0]]), "kaukainen sijoitus ilman kulmaa kielletty");

// orientoinnit
ok(E.orientCount("O4") === 1, "O4:llä 1 orientoituminen");
ok(E.orientCount("I4") === 2, "I4:llä 2 orientoitumista (vaaka/pysty)");
ok(E.orientCount("L4") >= 4, "L4:llä useita orientoitumisia");

// applyMove pass
let passSt = E.cloneState(st);
passSt = E.applyMove(passSt, null);
ok(passSt.passes === 1, "yksi pass");
passSt = E.applyMove(passSt, null);
ok(passSt.over === true, "kaksi passia päättää pelin");

// pisteytys + bonus
let bonusSt = E.initState(E.HUMAN);
bonusSt.squares[E.HUMAN] = 89;
bonusSt.usedAll[E.HUMAN] = true;
bonusSt.lastWasMono[E.HUMAN] = true;
bonusSt.remaining[E.HUMAN] = [];
ok(E.scoreOf(bonusSt, E.HUMAN) === 89 + 15 + 5, "täysi bonus 109");

bonusSt.squares[E.AI] = 50;
bonusSt.over = true;
ok(E.winnerOf(bonusSt) === E.HUMAN, "ihminen voittaa pisteillä");

// moveKey vakaa
let mvA = { pieceId: "V3", cells: [[1, 2], [1, 3], [2, 3]] };
let mvB = { pieceId: "V3", cells: [[2, 3], [1, 2], [1, 3]] };
ok(E.moveKey(mvA) === E.moveKey(mvB), "moveKey järjestysriippumaton");

// AI palauttaa laillisen siirron
st = E.initState(E.HUMAN);
let best = E.bestMove(st, 200);
ok(!!best, "bestMove palauttaa siirron");
let legalKeys = {};
E.genMoves(st).forEach(function (m) { legalKeys[E.moveKey(m)] = true; });
ok(legalKeys[E.moveKey(best)], "AI-siirto on laillinen");

// sijoitus placementAt
st = E.initState(E.HUMAN);
let place = E.placementAt(st, "1", 0, sr, sc);
ok(!!place && place.size === 1, "placementAt mono aloitukseen");
ok(!E.placementAt(st, "1", 0, 0, 0), "placementAt hylkää väärän paikan");

// genMovesForSelected
let sel = E.genMovesForSelected(st, "I5");
ok(sel.length > 0, "I5:lle aloitussiirtoja");
ok(sel.every(function (m) { return m.pieceId === "I5"; }), "vain I5");

// kloonaus ei jaa taulua
let c1 = E.initState(E.HUMAN);
let c2 = E.cloneState(c1);
c2.board[0] = E.HUMAN;
ok(c1.board[0] === E.EMPTY, "cloneState erottaa boardin");
c2.remaining[E.HUMAN].pop();
ok(c1.remaining[E.HUMAN].length === 21, "cloneState erottaa remaining");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
