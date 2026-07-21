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
  handStrengthPreflop: handStrengthPreflop,
  handStrength: handStrength,
  byType: byType,
  clampBet: clampBet,
  fallbackAct: fallbackAct,
  isLimpSpot: isLimpSpot,
  canOpenBet: canOpenBet,
  avoidLimp: avoidLimp,
};
