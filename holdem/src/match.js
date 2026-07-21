// match.js — botti vs botti ilman UI:ta (kuten hertta/match.js).
"use strict";

var E = require("./engine.js");
var Registry = require("./botRegistry.js");

function resolveBot(spec) {
  if (!spec) return Registry.getBot("normal");
  if (typeof spec === "string") return Registry.getBot(spec);
  if (typeof spec.act === "function") return spec;
  if (spec.bot && typeof spec.bot.act === "function") return spec.bot;
  throw new Error("tuntematon botti: " + spec);
}

/**
 * Pelaa ottelun bottien kesken.
 * @param {Array} bots - botti-olioita, id-merkkijonoja, tai registry-rivejä
 * @param {object} [opts]
 * @returns {{ seed, handsPlayed, phase, chips, winners, players }}
 */
function playMatch(bots, opts) {
  opts = opts || {};
  var list = (bots || []).map(resolveBot);
  var n = list.length || opts.playerCount || 4;
  while (list.length < n) list.push(Registry.getBot("normal"));

  var stack = opts.startingStack != null ? opts.startingStack : E.DEFAULT_STACK;
  var seed = opts.seed != null ? opts.seed : 1;
  var maxHands = opts.hands != null ? opts.hands : 40;
  var names = opts.names || list.map(function (b, i) { return (b.name || "Botti") + i; });

  var state = E.newGame({
    seed: seed,
    playerCount: n,
    startingStack: stack,
    sb: opts.sb,
    bb: opts.bb,
    names: names,
  });
  for (var i = 0; i < n; i++) state.players[i].isHuman = false;

  var handsPlayed = 0;
  while (state.phase !== "gameOver" && handsPlayed < maxHands) {
    if (state.phase === "handOver") {
      E.nextHand(state);
      if (state.phase === "gameOver") break;
    }
    var guard = 0;
    while (state.phase === "playing" && guard++ < 300) {
      var seat = state.toAct;
      if (seat < 0) break;
      var act = E.safeAct(list[seat], E.botView(state, seat));
      if (!act) break;
      var r = E.applyAction(state, act);
      if (!r.ok) break;
    }
    handsPlayed++;
  }

  return {
    seed: seed,
    handsPlayed: handsPlayed,
    phase: state.phase,
    chips: state.players.map(function (p) { return p.chips; }),
    winners: state.winners,
    players: state.players.map(function (p) {
      return { name: p.name, chips: p.chips };
    }),
  };
}

/**
 * Peilattu heads-up vertailu (paikat vaihdettu, sama seed).
 * Vähentää korttuuria kuten tupin handRotate / hertan turnaus.
 */
function compareBots(a, b, opts) {
  opts = opts || {};
  var seeds = opts.seeds != null ? opts.seeds : 20;
  var hands = opts.hands != null ? opts.hands : 30;
  var stack = opts.startingStack != null ? opts.startingStack : 500;
  var seed0 = opts.seed0 != null ? opts.seed0 : 1000;
  var aChips = 0, bChips = 0, aWins = 0, bWins = 0;

  for (var s = 0; s < seeds; s++) {
    var seed = seed0 + s;
    var m1 = playMatch([a, b], {
      seed: seed, playerCount: 2, startingStack: stack, hands: hands,
      names: ["A", "B"], sb: opts.sb, bb: opts.bb,
    });
    var m2 = playMatch([b, a], {
      seed: seed, playerCount: 2, startingStack: stack, hands: hands,
      names: ["B", "A"], sb: opts.sb, bb: opts.bb,
    });
    var aTotal = m1.chips[0] + m2.chips[1];
    var bTotal = m1.chips[1] + m2.chips[0];
    aChips += aTotal;
    bChips += bTotal;
    if (aTotal > bTotal) aWins++;
    else if (bTotal > aTotal) bWins++;
  }

  return {
    a: typeof a === "string" ? a : (a.name || "A"),
    b: typeof b === "string" ? b : (b.name || "B"),
    seeds: seeds,
    hands: hands,
    aChips: aChips,
    bChips: bChips,
    aWins: aWins,
    bWins: bWins,
    ties: seeds - aWins - bWins,
    aShare: aChips / (aChips + bChips || 1),
  };
}

module.exports = {
  playMatch: playMatch,
  compareBots: compareBots,
  resolveBot: resolveBot,
};
