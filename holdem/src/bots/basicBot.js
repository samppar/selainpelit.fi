// basicBot.js — passiivinen / "helppo". Foldaa harvoin, harvoin korottaa.
"use strict";

var U = require("../botUtil.js");

module.exports = {
  name: "Basic",

  act: function (view) {
    var t = U.byType(view.legal);
    var strength = U.handStrength(view.hole, view.board, view.evaluateHand);
    var pot = view.pot || 1;
    var toCall = view.toCall || 0;
    var potOdds = toCall / (pot + toCall);
    var rng = view.rng || Math.random;
    var roll = rng();

    if (t.check) {
      if (strength > 0.75 && t.bet && roll < 0.25) {
        return { type: "bet", amount: U.clampBet(t.bet, Math.floor(pot * 0.4)) };
      }
      return { type: "check" };
    }

    // Foldaa vain hyvin heikolla + pahat odds
    if (t.fold && strength < 0.2 && strength < potOdds - 0.1) {
      return { type: "fold" };
    }
    if (t.call) return { type: "call", amount: t.call.amount };
    if (t.raise && strength > 0.85 && roll < 0.2) {
      return { type: "raise", amount: U.clampBet(t.raise, t.raise.min) };
    }
    return U.fallbackAct(view);
  },
};
