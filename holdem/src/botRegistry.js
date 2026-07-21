// botRegistry.js — kaikki käytettävissä olevat botit (kuten hertta).
// LISÄÄ OMA BOTTISI: require + rivi BOTS-listaan.
"use strict";

var random = require("./bots/randomBot.js");
var basic = require("./bots/basicBot.js");
var normal = require("./bots/normalBot.js");
var hard = require("./bots/hardBot.js");
var template = require("./bots/templateBot.js");

var BOTS = [
  { id: "hard", name: "Hard (vaikea)", bot: hard },
  { id: "normal", name: "Normal (normaali)", bot: normal },
  { id: "basic", name: "Basic (helppo)", bot: basic },
  { id: "random", name: "Random (satunnainen)", bot: random },
  { id: "template", name: "Template (pohja)", bot: template },
  // { id: "minun", name: "Minun bottini", bot: require("./bots/minunBot.js") },
];

// UI-vaikeus → botti-id
var DIFFICULTY_TO_BOT = {
  helppo: "basic",
  normaali: "normal",
  vaikea: "hard",
};

function getBot(id) {
  var row = BOTS.find(function (b) { return b.id === id; });
  return (row || BOTS[0]).bot;
}

function botForDifficulty(diff) {
  return getBot(DIFFICULTY_TO_BOT[diff] || "normal");
}

module.exports = {
  BOTS: BOTS,
  getBot: getBot,
  botForDifficulty: botForDifficulty,
  DIFFICULTY_TO_BOT: DIFFICULTY_TO_BOT,
};
