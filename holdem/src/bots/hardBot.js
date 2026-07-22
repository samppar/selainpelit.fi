// hardBot.js — oletusvastustaja ("vaikea"). Julkisia Pluribus-tyylivihjeitä (ei limppiä, donk),
// ei MCCFR/blueprint-hakua (lähdekoodia ei julkaistu; selainpeliin liian raskas).
// Lähde: https://en.wikipedia.org/wiki/Pluribus_(poker_bot)
"use strict";

var U = require("../botUtil.js");

module.exports = {
  name: "Hard",

  act: function (view) {
    var t = U.byType(view.legal);
    var strength = U.handStrength(view.hole, view.board, view.evaluateHand);
    strength = Math.min(1, strength * 1.2);
    var pot = view.pot || 1;
    var toCall = view.toCall || 0;
    var potOdds = toCall / (pot + toCall);
    var rng = view.rng || Math.random;
    var roll = rng();

    // Pluribus: vältä limppiä (call BB ilman korotusta) → raise tai fold
    var antiLimp = U.avoidLimp(view, t, strength, 0.30);
    if (antiLimp) return antiLimp;

    // Bluffi / donk-painotus: avaa panos useammin myös keskivahvalla
    if (U.canOpenBet(view, t)) {
      var donkChance = strength > 0.45 ? 0.7 : strength > 0.32 ? 0.45 : 0.1;
      if (roll < donkChance) {
        return {
          type: "bet",
          amount: U.clampBet(t.bet, Math.floor(pot * (0.5 + strength * 0.4))),
        };
      }
      return { type: "check" };
    }

    if (strength < potOdds - 0.1 && strength < 0.35 && t.fold) {
      return { type: "fold" };
    }

    if (strength > 0.62 && t.raise && roll < 0.78) {
      return {
        type: "raise",
        amount: U.clampBet(
          t.raise,
          Math.floor(toCall + pot * (0.55 + strength * 0.45))
        ),
      };
    }

    if (t.call) return { type: "call", amount: t.call.amount };
    return U.fallbackAct(view);
  },
};
