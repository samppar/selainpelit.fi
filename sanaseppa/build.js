#!/usr/bin/env node
// Sanaseppä — niputtaja ilman riippuvuuksia.
//
// Kokoaa itsenäisen index.html:n (avautuu ilman palvelinta) osista:
//   src/engine.js  — pelin puhdas ydin (myös test/-käytössä)
//   src/game.js    — selainsovellus (DOM)
//   src/style.css  — tyylit
//   sanat.txt      — suomen sanalista (upotetaan <script type="text/plain">)
//
// Muokkaat lähteitä src/-kansiossa, ajat "node build.js" ja saat index.html:n.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const engine = read("src/engine.js");
const game = read("src/game.js");
const css = read("src/style.css");
const words = read("sanat.txt").trim();

// Sanalista upotetaan text/plain-lohkoon: selain ei tulkitse sitä JS:ksi.
const safeWords = words.replace(/<\/script/gi, "<\\/script");

const html = `<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Sanaseppä \u2014 suomenkielinen sanalaattapeli: lad\u00f6 kirjaimista sanoja 15\u00d715-laudalle ja voita tietokone.">
<title>Sanaseppä \u2014 suomalainen sanalaattapeli</title>
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
    <div class="brand">
      <h1>Sanaseppä</h1>
      <div class="tag">Lad\u00f6 kirjaimista sanoja</div>
    </div>
    <div class="hbtns">
      <button class="ghost" id="btnRules">S\u00e4\u00e4nn\u00f6t</button>
      <button class="ghost" id="btnNew">Uusi peli</button>
    </div>
  </header>

  <div id="game" class="hidden">
    <div class="scoreboard" id="scoreboard"></div>
    <div class="statusline">
      <span class="turnl" id="turnLab">\u2013</span>
      <span class="lastplay" id="lastPlay"></span>
      <span class="bagl" id="bagLab">Pussi: 0</span>
    </div>

    <div class="stage"><div class="board" id="board" aria-label="Pelilauta"></div></div>

    <div class="ribbon"><span class="toast" id="toast"></span></div>

    <div class="rack" id="rack"></div>

    <div class="ctrls">
      <button id="btnPlay" class="primary">Pelaa sana <kbd>Enter</kbd></button>
      <button id="btnHint">Vihje <kbd>F1</kbd></button>
      <button id="btnRecall">Palauta <kbd>F2</kbd></button>
      <button id="btnShuffle">Sekoita <kbd>F3</kbd></button>
      <button id="btnExchange">Vaihda <kbd>F4</kbd></button>
      <button id="btnPass">Ohita <kbd>F5</kbd></button>
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
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log("Kirjoitettu: index.html (" + kb + " kB, " + words.split(/\n/).length + " sanaa)");
console.log("Avaa index.html selaimessa \u2014 palvelinta ei tarvita.");
