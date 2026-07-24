// botUtil.js — jaetut apufunktiot bottien politiikoille (ei pelisääntöjä).
// Tyylivihjeitä Pluribus-artikkelista (Wikipedia / Science 2019): ei limppiä,
// donk-bettiä useammin — EI täyttä Pluribus-algoritmia (lähdekoodia ei julkaistu).
"use strict";

function handStrengthPreflop(hole) {
  if (!hole || hole.length < 2) return 0;
  var a = hole[0].rank;
  var b = hole[1].rank;
  var hi = Math.max(a, b);
  var lo = Math.min(a, b);
  var suited = hole[0].suit === hole[1].suit;
  var pair = a === b;
  if (pair) return 0.55 + (hi - 2) * 0.03;
  var score = (hi - 2) * 0.035 + (lo - 2) * 0.015;
  if (suited) score += 0.08;
  if (hi - lo <= 2) score += 0.05;
  if (hi === 14) score += 0.08;
  return Math.min(0.85, Math.max(0.05, score));
}

var CAT = [0.15, 0.35, 0.5, 0.62, 0.72, 0.8, 0.88, 0.94, 0.98, 1];

var SUITS = ["s", "h", "d", "c"];

function compareVec(a, b) {
  var len = Math.max(a.length, b.length);
  for (var i = 0; i < len; i++) {
    var av = a[i] || 0;
    var bv = b[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/**
 * Monte Carlo -equity: todennäköisyys voittaa showdown aktiivisia vastustajia
 * vastaan, kun loput kortit jaetaan satunnaisesti. Deterministinen view.rng:llä.
 * Range-suodatus: tällä kadulla panostaneelle/korottaneelle ei arvota täyttä
 * roskaa, vaan käsi arvotaan uudelleen (rejection sampling) kunnes
 * preflop-vahvuus ylittää kynnyksen. Palauttaa [0,1]; satunnaiskäden
 * equity ≈ 1/(vastustajat+1).
 */
var AGGRO_FLOOR = 0.3; // korottajan simuloidun käden preflop-vahvuusminimi

function estimateEquity(view, opts) {
  opts = opts || {};
  var iters = opts.iterations || 160;
  var rng = view.rng || Math.random;
  var evalHand = view.evaluateHand;
  if (typeof evalHand !== "function" || !view.hole || view.hole.length < 2) {
    return handStrength(view.hole, view.board, evalHand);
  }
  var board = view.board || [];
  var actives = (view.opponents || []).filter(function (o) {
    return !o.folded;
  });
  var opps = actives.length || 1;
  var bb = view.bb || 10;
  var cur = view.currentBet || 0;
  // Kadun aggressori: preflopissa korottanut yli BB:n, muuten panostanut.
  var floors = actives.map(function (o) {
    var aggro = view.street === "preflop"
      ? cur > bb && o.bet >= cur
      : cur > 0 && o.bet >= cur;
    return aggro ? AGGRO_FLOOR : 0;
  });
  if (!floors.length) floors = [0];

  var known = {};
  view.hole.concat(board).forEach(function (c) { known[c.rank + c.suit] = true; });
  var deck = [];
  for (var si = 0; si < SUITS.length; si++) {
    for (var r = 2; r <= 14; r++) {
      if (!known[r + SUITS[si]]) deck.push({ rank: r, suit: SUITS[si] });
    }
  }

  var need = 5 - board.length;
  var score = 0;
  for (var it = 0; it < iters; it++) {
    for (var i = deck.length - 1; i > 0; i--) {
      var j = (rng() * (i + 1)) | 0;
      var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    var fullBoard = board.concat(deck.slice(0, need));
    var mine = evalHand(view.hole.concat(fullBoard)).vector;
    var beaten = false;
    var tied = 0;
    var p = need;
    for (var o = 0; o < opps; o++) {
      var hole = [deck[p], deck[p + 1]];
      p += 2;
      var tries = 0;
      while (
        floors[o] > 0 && tries < 6 && p + 1 < deck.length &&
        handStrengthPreflop(hole) < floors[o]
      ) {
        hole = [deck[p], deck[p + 1]];
        p += 2;
        tries++;
      }
      if (beaten) continue;
      var c = compareVec(evalHand(hole.concat(fullBoard)).vector, mine);
      if (c > 0) beaten = true;
      else if (c === 0) tied++;
    }
    if (!beaten) score += 1 / (1 + tied);
  }
  return score / iters;
}

function handStrength(hole, board, evaluateHand) {
  if (!board || board.length === 0) return handStrengthPreflop(hole);
  if (typeof evaluateHand !== "function") {
    return handStrengthPreflop(hole);
  }
  var ev = evaluateHand(hole.concat(board));
  return CAT[ev.category] || 0.2;
}

function byType(legal) {
  var m = {};
  (legal || []).forEach(function (a) { m[a.type] = a; });
  return m;
}

function clampBet(info, amount) {
  return Math.min(info.max, Math.max(info.min, amount));
}

function fallbackAct(view) {
  var legal = view.legal || [];
  if (!legal.length) return null;
  var t = byType(legal);
  if (t.check) return { type: "check" };
  if (t.call) return { type: "call", amount: t.call.amount };
  if (t.fold) return { type: "fold" };
  if (t.bet) return { type: "bet", amount: t.bet.min };
  if (t.raise) return { type: "raise", amount: t.raise.min };
  return { type: legal[0].type, amount: legal[0].amount || legal[0].min };
}

/** Preflop avauslimppi: maksa vain BB, kukaan ei ole korottanut. */
function isLimpSpot(view) {
  if (!view || view.street !== "preflop") return false;
  var bb = view.bb || 10;
  return view.toCall > 0 && view.toCall <= bb && view.currentBet <= bb;
}

/** Ensimmäinen toimija streetillä (voi donkata / avata panoksen). */
function canOpenBet(view, t) {
  return !!(t && t.bet && (view.toCall || 0) === 0);
}

/** Pluribus-tyylinen open: limpin sijaan raise tai fold. */
function avoidLimp(view, t, strength, raiseThreshold) {
  raiseThreshold = raiseThreshold != null ? raiseThreshold : 0.32;
  if (!isLimpSpot(view) || !t.call) return null;
  if (t.raise && strength >= raiseThreshold) {
    var pot = view.pot || 1;
    var amt = clampBet(t.raise, Math.floor(t.raise.min + pot * 0.5));
    return { type: "raise", amount: amt };
  }
  if (t.fold && strength < raiseThreshold) return { type: "fold" };
  return null;
}

module.exports = {
  estimateEquity: estimateEquity,
  handStrengthPreflop: handStrengthPreflop,
  handStrength: handStrength,
  byType: byType,
  clampBet: clampBet,
  fallbackAct: fallbackAct,
  isLimpSpot: isLimpSpot,
  canOpenBet: canOpenBet,
  avoidLimp: avoidLimp,
};
