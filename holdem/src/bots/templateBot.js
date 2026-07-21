// templateBot.js — POHJA omalle botille.
// Kopioi (esim. bots/minunBot.js), toteuta act(), rekisteröi botRegistry.js:ssä.
//
// ── RAJAPINTA ────────────────────────────────────────────────
// act(view) → yksi laillinen toiminto view.legal:sta.
//
// view = {
//   seat, hole, board, street, pot, currentBet, myBet, myChips,
//   toCall, minRaise, sb, bb, legal: [{type, amount?, min?, max?}],
//   opponents: [{seat, chips, bet, folded, allIn}],
//   rng: function () → [0,1),   // siemenetty; käytä tätä älä Math.randomia
//   evaluateHand: function(cards) → {category, name, vector}, // moottorin arvio
// }
//
// Toimintotyypit: fold | check | call | bet | raise
// HUOM: näet vain oman kätesi. Laiton/kaatuminen → moottori valitsee safeAct.
"use strict";

var U = require("../botUtil.js");

module.exports = {
  name: "Template",

  act: function (view) {
    // TODO: oma strategia. Oletus: check/call, muuten fold.
    return U.fallbackAct(view);
  },
};
