// normalBot.js — oletusvastustaja ("normaali"). Lievä anti-limp.
"use strict";

var U = require("../botUtil.js");

module.exports = {
  name: "Normal",

  act: function (view) {
    var t = U.byType(view.legal);
    var strength = U.handStrength(view.hole, view.board, view.evaluateHand);
    var pot = view.pot || 1;
    var toCall = view.toCall || 0;
    var potOdds = toCall / (pot + toCall);
    var rng = view.rng || Math.random;
    var roll = rng();

    var antiLimp = U.avoidLimp(view, t, strength, 0.38);
    if (antiLimp) return antiLimp;

    if (t.check) {
      if (strength > 0.55 && t.bet && roll < 0.55) {
        return {
          type: "bet",
          amount: U.clampBet(t.bet, Math.floor(pot * (0.4 + strength * 0.5))),
        };
      }
      return { type: "check" };
    }

    if (strength < potOdds - 0.05 && strength < 0.4 && t.fold) {
      return { type: "fold" };
    }

    if (strength > 0.7 && t.raise && roll < 0.65) {
      return {
        type: "raise",
        amount: U.clampBet(
          t.raise,
          Math.floor(toCall + pot * (0.5 + strength * 0.4))
        ),
      };
    }

    if (t.call) return { type: "call", amount: t.call.amount };
    return U.fallbackAct(view);
  },
};
