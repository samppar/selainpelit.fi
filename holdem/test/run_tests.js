// Hold'em — ytimen testit (node test/run_tests.js).
const E = require("../src/engine.js");

let pass = 0, fail = 0;
function ok(c, m) {
  if (c) pass++;
  else { fail++; console.error("  FAIL:", m); }
}

console.log("Hold'em — testit");

// ---- Pakka & parse ---------------------------------------------------------
const deck = E.buildDeck();
ok(deck.length === 52, "pakka 52, oli " + deck.length);
ok(E.parseCard("As").rank === 14 && E.parseCard("As").suit === "s", "parse As");
ok(E.parseCard("Td").rank === 10 && E.parseCard("Td").suit === "d", "parse Td");
ok(E.parseCard("7h").rank === 7, "parse 7h");
ok(E.cardLabel(E.parseCard("Kh")) === "K♥", "label Kh");

// ---- Käsiarvio: kategoriat -------------------------------------------------
function hand(strs) { return E.evaluateHand(E.parseCards(strs)); }

ok(hand(["As", "Kh", "9d", "3c", "2s"]).category === 0, "korkea kortti");
ok(hand(["As", "Ad", "9d", "3c", "2s"]).category === 1, "pari");
ok(hand(["As", "Ad", "9d", "9c", "2s"]).category === 2, "kaksi paria");
ok(hand(["As", "Ad", "Ac", "3c", "2s"]).category === 3, "kolmoset");
ok(hand(["9s", "8h", "7d", "6c", "5s"]).category === 4, "suora");
ok(hand(["As", "2h", "3d", "4c", "5s"]).category === 4, "pyöräsuora A-5");
ok(hand(["As", "2h", "3d", "4c", "5s"]).vector[1] === 5, "pyörä high=5");
ok(hand(["As", "Ks", "9s", "3s", "2s"]).category === 5, "väri");
ok(hand(["As", "Ad", "Ac", "2c", "2s"]).category === 6, "full house");
ok(hand(["As", "Ad", "Ac", "Ah", "2s"]).category === 7, "neloset");
ok(hand(["9s", "8s", "7s", "6s", "5s"]).category === 8, "värisuora");
ok(hand(["As", "Ks", "Qs", "Js", "Ts"]).category === 9, "kuninkaallinen");

ok(E.compareHands(
  E.parseCards(["As", "Ad", "Kh", "9c", "2s"]),
  E.parseCards(["Ks", "Kd", "Ah", "9c", "2s"])
) > 0, "AA > KK");

ok(E.compareHands(
  E.parseCards(["As", "2h", "3d", "4c", "5s"]),
  E.parseCards(["9s", "8h", "7d", "6c", "5h"])
) < 0, "pyörä < 9-high suora");

// 7 korttia → paras 5
const seven = hand(["As", "Ad", "Ac", "Kh", "Kd", "2c", "3s"]);
ok(seven.category === 6, "7 korttia → full house");
ok(seven.name === "väri+kolmoset", "full house nimi");

const sf7 = hand(["9s", "8s", "7s", "6s", "5s", "As", "Ad"]);
ok(sf7.category === 8, "7 korttia → värisuora voittaa parin");

// ---- Sivupotit -------------------------------------------------------------
const pots = E.computeSidePots([
  { folded: false, contrib: 100 },
  { folded: false, contrib: 50 },
  { folded: true, contrib: 50 },
  { folded: false, contrib: 100 },
]);
ok(pots.length >= 2, "sivupotteja ≥2, oli " + pots.length);
const main = pots[0];
ok(main.amount === 200, "pääpotti 200 (4×50), oli " + main.amount);
ok(main.eligible.length === 2 || main.eligible.indexOf(1) >= 0, "all-in pelaaja eligible pääpotissa");

// ---- Uusi peli / jako ------------------------------------------------------
const G = E.newGame({ seed: 42, startingStack: 500, sb: 5, bb: 10 });
ok(G.players.length === 4, "4 pelaajaa");
ok(G.players[0].isHuman, "seat 0 human");
ok(G.players.every((p) => p.hole.length === 2 || p.folded), "hole 2 korttia");
ok(G.street === "preflop", "preflop");
ok(G.potTotal === 15, "blindit 5+10 = 15, oli " + G.potTotal);
ok(G.phase === "playing", "playing");
ok(G.toAct >= 0, "joku toimii");

const legal = E.legalActions(G);
ok(legal.some((a) => a.type === "fold"), "fold laillinen");
ok(legal.some((a) => a.type === "call") || legal.some((a) => a.type === "check"), "call/check");

// ---- Forced cards (testattavuus) -------------------------------------------
const F = E.newGame({
  seed: 1,
  startingStack: 200,
  sb: 5,
  bb: 10,
  forcedCards: {
    holes: [
      ["As", "Ad"],
      ["Kh", "Kd"],
      ["2c", "3c"],
      ["7h", "8h"],
    ],
    // board jaetaan normaalisti pakasta (ilman näitä)
  },
});
ok(F.players[0].hole[0].rank === 14 && F.players[0].hole[1].rank === 14, "forced AA");
ok(F.players[1].hole[0].rank === 13, "forced KK");

// Human callaa / botit pelaavat loppuun
const callBot = {
  name: "CallStation",
  act(view) {
    const t = {};
    view.legal.forEach((a) => { t[a.type] = a; });
    if (t.check) return { type: "check" };
    if (t.call) return { type: "call", amount: t.call.amount };
    if (t.fold) return { type: "fold" };
    return view.legal[0];
  },
};
E.playHandToEnd(F, {
  humanPolicy(s) {
    const acts = E.legalActions(s);
    const call = acts.find((a) => a.type === "call");
    if (call) return { type: "call", amount: call.amount };
    const chk = acts.find((a) => a.type === "check");
    if (chk) return { type: "check" };
    return { type: "fold" };
  },
  bots: [null, callBot, callBot, callBot],
});
ok(F.phase === "handOver" || F.street === "showdown", "käsi päättyy, phase=" + F.phase);
ok(F.board.length === 5 || F.lastHand.foldWin, "board 5 tai fold-voitto, board=" + F.board.length);

// ---- Fold-voitto -----------------------------------------------------------
const FoldG = E.newGame({
  seed: 9,
  startingStack: 100,
  sb: 5,
  bb: 10,
  playerCount: 2,
  names: ["Sinä", "Botti"],
});
// Heads-up: force fold from bot via human raise all-in then... simpler:
// Apply folds from everyone except human when it's their turn — simulate:
let guard = 0;
while (FoldG.phase === "playing" && guard++ < 40) {
  const seat = FoldG.toAct;
  if (seat < 0) break;
  const acts = E.legalActions(FoldG);
  if (FoldG.players[seat].isHuman) {
    const c = acts.find((a) => a.type === "call") || acts.find((a) => a.type === "check");
    E.applyAction(FoldG, c ? { type: c.type, amount: c.amount } : { type: "fold" });
  } else {
    E.applyAction(FoldG, { type: "fold" });
  }
}
ok(FoldG.phase === "handOver", "fold-voitto handOver");
ok(FoldG.lastHand && FoldG.lastHand.foldWin, "foldWin lippu");
ok(FoldG.winners && FoldG.winners.indexOf(0) >= 0, "human voittaa foldilla");

// ---- Laiton siirto hylätään ------------------------------------------------
const L = E.newGame({ seed: 3, startingStack: 200 });
const bad = E.applyAction(L, { type: "bet", amount: 1 });
ok(!bad.ok, "liian pieni bet hylätään");

// ---- Check / bet / raise -kierto flopille ----------------------------------
const S = E.newGame({
  seed: 100,
  startingStack: 1000,
  sb: 5,
  bb: 10,
  playerCount: 2,
  names: ["Sinä", "Botti"],
});
// Pelaa kunnes flop tai handOver — human call/check, bot fold always after call once
{
  let steps = 0;
  while (S.phase === "playing" && S.street === "preflop" && steps++ < 20) {
    const seat = S.toAct;
    const acts = E.legalActions(S);
    if (S.players[seat].isHuman) {
      const c = acts.find((a) => a.type === "call");
      if (c) E.applyAction(S, { type: "call", amount: c.amount });
      else E.applyAction(S, { type: "check" });
    } else {
      const c = acts.find((a) => a.type === "call");
      const ch = acts.find((a) => a.type === "check");
      if (c) E.applyAction(S, { type: "call", amount: c.amount });
      else if (ch) E.applyAction(S, { type: "check" });
      else E.applyAction(S, { type: "fold" });
    }
  }
  ok(S.street === "flop" || S.phase === "handOver", "preflop→flop, street=" + S.street);
  if (S.street === "flop") ok(S.board.length === 3, "flop 3 korttia");
}

// ---- All-in lyhyt pino -----------------------------------------------------
const Reg = require("../src/botRegistry.js");
const U = require("../src/botUtil.js");
const Match = require("../src/match.js");
const normal = Reg.getBot("normal");

const A = E.newGame({
  seed: 55,
  startingStack: 25,
  sb: 5,
  bb: 10,
  playerCount: 2,
  names: ["Sinä", "Botti"],
});
E.playHandToEnd(A, { bots: [normal, normal] });
ok(A.phase === "handOver" || A.phase === "gameOver", "lyhyt pino päättyy");
ok(A.players.reduce((s, p) => s + p.chips, 0) === 50, "chipit säilyvät (25×2)");

// ---- Julkinen tila peittää botin kortit ------------------------------------
const P = E.newGame({ seed: 7 });
const pub = E.publicState(P);
ok(pub.players[0].hole[0] !== null, "human hole näkyy");
ok(pub.players[1].hole[0] === null, "bot hole piilossa");
ok(Array.isArray(pub.legal), "legal listattu");

// ---- Botti safeAct palauttaa laillisen siirron -----------------------------
const B = E.newGame({ seed: 11 });
B.players.forEach((p) => { p.isHuman = false; });
if (B.toAct >= 0) {
  const view = E.botView(B, B.toAct);
  const act = E.safeAct(normal, view);
  ok(act && act.type, "safeAct tyyppi " + (act && act.type));
  ok(E.isLegalDecision(view, act), "safeAct laillinen");
  const r = E.applyAction(B, act);
  ok(r.ok, "botin siirto ok");
} else {
  ok(true, "ei toAct (skip)");
}

// ---- Useita käsiä peräkkäin (ei kaadu) -------------------------------------
const M = E.newGame({ seed: 99, startingStack: 200, playerCount: 3, names: ["Sinä", "A", "B"] });
let hands = 0;
for (let h = 0; h < 8; h++) {
  if (M.phase === "gameOver") break;
  E.playHandToEnd(M, { bots: [normal, normal, normal] });
  hands++;
  const endSum = M.players.reduce((s, p) => s + p.chips, 0);
  ok(endSum === 600, "käsi " + (h + 1) + " chip-summa 600, oli " + endSum);
  if (M.phase === "handOver") E.nextHand(M);
}
ok(hands >= 1, "pelattiin ≥1 kättä, oli " + hands);
const live = M.players.reduce((s, p) => s + p.chips, 0) + (M.phase === "playing" ? M.potTotal : 0);
ok(live === 600, "chipit+potti = 600, oli " + live);

// ---- Voittoehdon selkeys: gameOver kun yksi jäljellä -----------------------
const W = E.newGame({
  seed: 2,
  startingStack: 30,
  sb: 5,
  bb: 10,
  playerCount: 2,
  names: ["Sinä", "Botti"],
});
for (let i = 0; i < 20; i++) {
  if (W.phase === "gameOver") break;
  E.playHandToEnd(W, { bots: [normal, normal] });
  if (W.phase === "handOver") E.nextHand(W);
}
ok(W.phase === "gameOver" || W.players.filter((p) => p.chips > 0).length === 1,
  "peli päättyy / yksi pino jäljellä");

// ---- Tekoäly: botView / act / skenaariot / areena --------------------------
console.log("\nHold'em — tekoäly (hertta/tuppi-malli)");

ok(U.handStrengthPreflop(E.parseCards(["As", "Ad"])) >
   U.handStrengthPreflop(E.parseCards(["7h", "2c"])), "AA > 72o preflop");

ok(U.handStrength(E.parseCards(["As", "Ad"]), E.parseCards(["Ah", "Kd", "2c"]), E.evaluateHand) >
   U.handStrength(E.parseCards(["7h", "2c"]), E.parseCards(["Ah", "Kd", "2c"]), E.evaluateHand),
  "set > high card flopilla");

ok(Reg.BOTS.length >= 4, "rekisterissä ≥4 bottia");
ok(Reg.botForDifficulty("vaikea").name === "Hard", "vaikea → Hard");
ok(Reg.botForDifficulty("helppo").name === "Basic", "helppo → Basic");

// Skenaario: AA vs bet → ei fold (normal)
const aa = E.scenario({
  seed: 1,
  holes: [["As", "Ad"], ["7h", "2c"]],
  bets: [0, 40],
  chips: [960, 960],
  pot: 55,
  currentBet: 40,
  toAct: 0,
  acted: [false, true],
});
const aaView = E.botView(aa, 0);
ok(aaView.legal.some((a) => a.type === "call") || aaView.legal.some((a) => a.type === "raise"),
  "AA: call/raise laillinen");
ok(!("hole" in (aaView.opponents[0] || {})), "view opponents ilman hole");
const aaAct = E.safeAct(normal, aaView);
ok(aaAct && aaAct.type !== "fold", "AA ei foldaa: " + (aaAct && aaAct.type));
ok(E.isLegalDecision(aaView, aaAct), "AA-siirto laillinen");

// Pluribus-tyyli: hard ei limppää avauksessa (raise/fold, ei call BB)
const limpSpot = E.scenario({
  seed: 5,
  holes: [["As", "Kd"], ["7h", "2c"]],
  bets: [0, 10],
  chips: [990, 990],
  pot: 15,
  currentBet: 10,
  toAct: 0,
  sb: 5,
  bb: 10,
  acted: [false, true],
});
const limpView = E.botView(limpSpot, 0);
ok(U.isLimpSpot(limpView), "limp-spot tunnistuu");
const hard = Reg.getBot("hard");
const limpAct = E.safeAct(hard, limpView);
ok(limpAct.type !== "call", "hard ei limppää: " + limpAct.type);

// 72o vs iso bet → fold (normal/hard)
const weak = E.scenario({
  seed: 2,
  holes: [["7h", "2c"], ["As", "Kd"]],
  bets: [0, 200],
  chips: [800, 800],
  pot: 230,
  currentBet: 200,
  toAct: 0,
  acted: [false, true],
});
const weakAct = E.safeAct(normal, E.botView(weak, 0));
ok(weakAct && weakAct.type === "fold", "72o foldaa ison betin: " + (weakAct && weakAct.type));

// Determinismi: sama view + sama rng-tila
function actTwice(bot, state) {
  const s1 = E.scenario({
    seed: state.seed,
    holes: [["As", "Kd"], ["7h", "2c"]],
    bets: [0, 0],
    chips: [1000, 1000],
    pot: 0,
    currentBet: 0,
    toAct: 0,
    board: [],
  });
  const s2 = E.scenario({
    seed: state.seed,
    holes: [["As", "Kd"], ["7h", "2c"]],
    bets: [0, 0],
    chips: [1000, 1000],
    pot: 0,
    currentBet: 0,
    toAct: 0,
    board: [],
  });
  return [E.safeAct(bot, E.botView(s1, 0)), E.safeAct(bot, E.botView(s2, 0))];
}
const [d1, d2] = actTwice(normal, { seed: 42 });
ok(d1.type === d2.type && d1.amount === d2.amount, "safeAct deterministinen samalla seedillä");

// Fuzz: safeAct ei koskaan laiton; illegal bot → fallback
const badBot = { name: "Bad", act() { return { type: "raise", amount: 1 }; } };
let illegal = 0;
for (let s = 0; s < 40; s++) {
  const g = E.newGame({ seed: 500 + s, playerCount: 3, names: ["A", "B", "C"] });
  g.players.forEach((p) => { p.isHuman = false; });
  let steps = 0;
  while (g.phase === "playing" && steps++ < 80) {
    const seat = g.toAct;
    if (seat < 0) break;
    const view = E.botView(g, seat);
    const bot = steps % 7 === 0 ? badBot : Reg.getBot(s % 2 === 0 ? "hard" : "normal");
    const act = E.safeAct(bot, view);
    if (!act || !E.isLegalDecision(view, act)) { illegal++; break; }
    const r = E.applyAction(g, act);
    if (!r.ok) { illegal++; break; }
  }
}
ok(illegal === 0, "fuzz: 0 laitonta, oli " + illegal);

// Match + peilattu areena: hard ≥ basic
const m = Match.playMatch(["hard", "basic"], { seed: 9, hands: 20, startingStack: 400 });
ok(m.chips.reduce((a, b) => a + b, 0) === 800, "match chip-summa 800");

const cmp = Match.compareBots("hard", "basic", {
  seeds: 12,
  hands: 25,
  startingStack: 400,
  seed0: 7000,
});
ok(cmp.aShare >= 0.42, "hard ei häviä pahasti basicille (share=" + cmp.aShare.toFixed(3) + ")");
console.log("  areena hard vs basic: share=" + cmp.aShare.toFixed(3) +
  " wins " + cmp.aWins + "/" + cmp.seeds);

console.log("\n" + pass + " ok, " + fail + " fail");
process.exit(fail ? 1 : 0);
