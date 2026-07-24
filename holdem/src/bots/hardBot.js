// hardBot.js — oletusvastustaja ("vaikea"). Monte Carlo -equity (botUtil.estimateEquity)
// verrattuna pot oddseihin; skaalautuu vastustajamäärään. Pluribus-tyylivihjeet säilyvät:
// ei limppiä (raise tai fold), donk/avauspanoksia myös keskivahvalla, satunnaisia bluffeja.
// Ei MCCFR/blueprint-hakua. Lähde: https://en.wikipedia.org/wiki/Pluribus_(poker_bot)
"use strict";

var U = require("../botUtil.js");

module.exports = {
  name: "Hard",

  act: function (view) {
    var t = U.byType(view.legal);
    var pot = view.pot || 1;
    var toCall = view.toCall || 0;
    var potOdds = toCall / (pot + toCall);
    var rng = view.rng || Math.random;

    var opps = (view.opponents || []).filter(function (o) {
      return !o.folded;
    }).length || 1;
    var avg = 1 / (opps + 1); // satunnaiskäden equity tätä pöytää vastaan

    var eq = U.estimateEquity(view, {
      iterations: view.street === "preflop" ? 120 : 160,
    });
    var roll = rng();

    var strong = eq > Math.min(0.72, avg * 1.45);
    var decent = eq > avg * 1.15;

    // Pluribus: vältä limppiä (call BB ilman korotusta) → raise tai fold
    if (U.isLimpSpot(view) && t.call) {
      if (t.raise && decent) {
        return {
          type: "raise",
          amount: U.clampBet(t.raise, Math.floor(t.raise.min + pot * (0.5 + eq * 0.5))),
        };
      }
      if (t.fold) return { type: "fold" };
    }

    // Avauspanos / donk: panosta vahvalla, keskivahvalla usein, joskus bluffina
    if (U.canOpenBet(view, t)) {
      var betChance = strong ? 0.85 : decent ? 0.5 : 0.12;
      if (roll < betChance) {
        return {
          type: "bet",
          amount: U.clampBet(t.bet, Math.floor(pot * (0.45 + eq * 0.45))),
        };
      }
      return { type: "check" };
    }

    // Panosta vastaan: value-raise vahvalla
    if (strong && t.raise && roll < 0.8) {
      return {
        type: "raise",
        amount: U.clampBet(t.raise, Math.floor(toCall + pot * (0.55 + eq * 0.45))),
      };
    }

    // Maksa kun equity riittää pot oddseihin (pieni implied odds -marginaali)
    if (t.call && eq > potOdds - 0.03) {
      return { type: "call", amount: t.call.amount };
    }

    if (t.fold) return { type: "fold" };
    return U.fallbackAct(view);
  },
};
