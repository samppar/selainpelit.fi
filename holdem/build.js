#!/usr/bin/env node
// Hold'em — niputtaja ilman riippuvuuksia → yksi index.html.
// Niputtaa engine + botUtil + bots + registry + game (sama lähde kuin Node-testit).
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function wrapCjs(label, code) {
  return `
/* ---- ${label} ---- */
(function(){
  var module = { exports: {} };
  var exports = module.exports;
  var require = function(req) {
    if (req === "./engine.js" || req === "../engine.js") return globalThis.HoldemEngine;
    if (req === "./botUtil.js" || req === "../botUtil.js") return globalThis.HoldemBotUtil;
    if (req.indexOf("preflopEquity") >= 0) return globalThis.HoldemPreflopEquity;
    if (req.indexOf("randomBot") >= 0) return globalThis.__HoldemBotFiles.random;
    if (req.indexOf("basicBot") >= 0) return globalThis.__HoldemBotFiles.basic;
    if (req.indexOf("normalBot") >= 0) return globalThis.__HoldemBotFiles.normal;
    if (req.indexOf("hardBot") >= 0) return globalThis.__HoldemBotFiles.hard;
    if (req.indexOf("templateBot") >= 0) return globalThis.__HoldemBotFiles.template;
    if (req.indexOf("botRegistry") >= 0) return globalThis.HoldemRegistry;
    throw new Error("bundle require: " + req);
  };
  ${code}
  return module.exports;
})()`;
}

const engine = read("src/engine.js");
const preflopEquityCode = read("src/preflopEquity.js");
const botUtilCode = read("src/botUtil.js");
const bots = {
  random: read("src/bots/randomBot.js"),
  basic: read("src/bots/basicBot.js"),
  normal: read("src/bots/normalBot.js"),
  hard: read("src/bots/hardBot.js"),
  template: read("src/bots/templateBot.js"),
};
const registryCode = read("src/botRegistry.js");
const game = read("src/game.js");
const css = read("src/style.css");

const botBundle = `
globalThis.__HoldemBotFiles = {};
globalThis.HoldemPreflopEquity = ${wrapCjs("preflopEquity", preflopEquityCode)};
globalThis.HoldemBotUtil = ${wrapCjs("botUtil", botUtilCode)};
globalThis.__HoldemBotFiles.random = ${wrapCjs("randomBot", bots.random)};
globalThis.__HoldemBotFiles.basic = ${wrapCjs("basicBot", bots.basic)};
globalThis.__HoldemBotFiles.normal = ${wrapCjs("normalBot", bots.normal)};
globalThis.__HoldemBotFiles.hard = ${wrapCjs("hardBot", bots.hard)};
globalThis.__HoldemBotFiles.template = ${wrapCjs("templateBot", bots.template)};
globalThis.HoldemRegistry = ${wrapCjs("botRegistry", registryCode)};
`;

const html = `<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="description" content="Texas Hold'em — pokeri tietokonetta vastaan. Kerää chippejä, paras käsi voittaa.">
<title>Hold'em — Texas Hold'em</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@600;700;800&family=Fraunces:opsz,wght@9..144,700&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">
      <h1>Hold'em</h1>
      <div class="tag">Texas · pokeri · chipit</div>
    </div>
    <div class="hbtns">
      <button class="ghost" id="btnRules" type="button">Säännöt</button>
      <button class="ghost" id="btnNew" type="button">Uusi peli</button>
    </div>
  </header>

  <div id="game" class="hidden">
    <div class="hud">
      <div class="goal" id="goal">Kerää chipit</div>
      <div class="potbox">
        <div class="nm">Potti</div>
        <div class="chip-stack" id="potChips" aria-hidden="true"></div>
        <div class="pt" id="pot">0</div>
      </div>
      <div class="meta">
        <div id="handNum">Jako #1</div>
        <div id="street">Preflop</div>
        <div id="blinds">Blindit 5/10</div>
      </div>
    </div>

    <div class="status" id="status"></div>
    <div class="action-banner" id="actionBanner" aria-live="polite"></div>

    <div class="table-wrap">
      <div class="felt" id="felt">
        <div class="board" id="board"></div>
        <div id="seats"></div>
      </div>
    </div>

    <div class="hand-name" id="handName"></div>
    <div class="hero-cards" id="heroCards"></div>

    <div class="ctrls" id="ctrls"></div>
  </div>
</div>

<div class="ov hidden" id="ov" role="dialog" aria-modal="true">
  <div class="ov-card" id="ovBody"></div>
</div>
<div class="toast" id="toast" role="status"></div>

<script>
${engine}
</script>
<script>
${botBundle}
</script>
<script>
${game}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, "index.html"), html);
console.log("Wrote index.html (" + (html.length / 1024).toFixed(1) + " KiB)");
