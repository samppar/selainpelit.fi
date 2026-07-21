// randomBot.js — satunnainen laillinen siirto. Nollataso-vertailukohta.
"use strict";

var U = require("../botUtil.js");

module.exports = {
  name: "Random",

  act: function (view) {
    var legal = view.legal || [];
    if (!legal.length) return null;
    var rng = view.rng || Math.random;
    var pick = legal[(rng() * legal.length) | 0];
    if (pick.type === "bet" || pick.type === "raise") {
      var span = pick.max - pick.min;
      var amt = pick.min + ((rng() * (span + 1)) | 0);
      return { type: pick.type, amount: U.clampBet(pick, amt) };
    }
    if (pick.type === "call") return { type: "call", amount: pick.amount };
    return { type: pick.type };
  },
};
