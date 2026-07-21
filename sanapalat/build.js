#!/usr/bin/env node
// Sanapalat — niputtaja ilman riippuvuuksia.
// Kokoaa itsenäisen index.html:n osista (src/*) ja upottaa sanaston.
// Sanasto jaetaan sanasato-pelin kanssa (../sanasato/sanat.txt) — ei kopiota.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const engine = read("src/engine.js");
const game = read("src/game.js");
const css = read("src/style.css");
const words = fs.readFileSync(path.join(ROOT, "..", "sanasato", "sanat.txt"), "utf8").trim();
const safeWords = words.replace(/<\/script/gi, "<\\/script");

const html = `<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="description" content="Sanapalat \u2014 suomenkielinen laudanladontapeli tietokonetta vastaan.">
<title>Sanapalat \u2014 suomalainen sanalautapeli</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand"><h1>Sanapalat</h1><div class="tag">Lad\u00f6 sanat laudalle</div></div>
    <div class="hbtns">
      <button class="ghost" id="btnRules">S\u00e4\u00e4nn\u00f6t</button>
      <button class="ghost" id="btnNew">Uusi peli</button>
    </div>
  </header>

  <div id="game" class="hidden">
    <div class="hud">
      <div class="pscore" id="hudP0"><div class="nm"><span id="s0name">Sin\u00e4</span></div><div class="pt" id="s0">0</div><div class="lm" id="last0"></div></div>
      <div class="pscore" id="hudP1"><div class="nm"><span id="s1name">Tietokone</span></div><div class="pt" id="s1">0</div><div class="lm" id="last1"></div></div>
      <div class="bagbox"><div class="nm">Pussi</div><div class="pt" id="bag">0</div></div>
    </div>

    <div class="status" id="status"></div>
    <div class="board" id="board"></div>

    <div class="rackwrap"><div class="rack" id="rack"></div></div>
    <div class="ctrls">
      <button class="go" id="btnPlay">Pelaa</button>
      <button id="btnRecall">Palauta</button>
      <button id="btnShuffle">Sekoita</button>
      <button id="btnExchange">Vaihda</button>
      <button id="btnPass">Ohita vuoro</button>
    </div>
  </div>
</div>

<div id="ov"></div>
<div class="loading" id="loading">Ladataan sanastoa\u2026</div>

<script id="sanat" type="text/plain">
${safeWords}
</script>
<script>
${engine}
</script>
<script>
${game}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, "index.html"), html);
console.log("Kirjoitettu: index.html (" + (Buffer.byteLength(html) / 1024).toFixed(0) + " kB)");
console.log("Avaa index.html selaimessa \u2014 palvelinta ei tarvita.");
