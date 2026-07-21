#!/usr/bin/env node
// Sanasato — niputtaja ilman riippuvuuksia.
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

// Sanalista upotetaan text/plain-lohkoon: selain ei tulkitse sit\u00e4 JS:ksi,
// eik\u00e4 lainausmerkkej\u00e4 tarvitse escapeta. Vain </script> pit\u00e4\u00e4 rikkoa.
const safeWords = words.replace(/<\/script/gi, "<\\/script");

const html = `<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="description" content="Sanasato \u2014 suomenkielinen sanapeli: kokoa sanat ruudukosta. Tutkimuspohjainen selainpeli.">
<title>Sanasato \u2014 suomalainen sanapeli</title>
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
      <h1>Sanasato</h1>
      <div class="tag">Kokoa sanat ruudukosta</div>
    </div>
    <div class="hbtns">
      <button class="ghost" id="btnRules">S\u00e4\u00e4nn\u00f6t</button>
      <button class="ghost" id="btnNew">Uusi peli</button>
    </div>
  </header>

  <div id="game" class="hidden">
    <div class="hud">
      <div class="stat"><div class="lab">Pisteet</div><div class="val" id="score">0</div><div class="sub" id="scoreSub"></div></div>
      <div class="stat streak"><div class="lab">Putki</div><div class="val" id="streak">0</div><div class="sub" id="streakSub">paras 0</div></div>
      <div class="stat"><div class="lab">Sanat</div><div class="val" id="wcount">0</div><div class="sub" id="wcountSub"></div></div>
    </div>
    <div class="rankbar">
      <div class="top"><span class="rk" id="rank">Aloittelija</span><span class="next" id="rankNext"></span></div>
      <div class="track"><i id="rankFill"></i></div>
    </div>
    <div class="timer" id="timer"><i id="timerFill"></i></div>

    <div class="stage" id="stage">
      <div class="board" id="board"></div>
      <svg class="linelayer" id="lines"><polyline points=""></polyline></svg>
    </div>

    <div class="ribbon"><span class="curword" id="curword"></span><span class="toast" id="toast"></span></div>
    <div class="ctrls">
      <button id="btnClear">Tyhjenn\u00e4</button>
      <button id="btnHint">Vihje (3)</button>
      <button id="btnFinish" style="display:none">Lopeta</button>
    </div>

    <div class="found">
      <h3><span>L\u00f6ydetyt sanat <span style="opacity:.6;text-transform:none;letter-spacing:0;font-weight:400">\u2014 napsauta n\u00e4hd\u00e4ksesi laudalla</span></span><span id="foundMeta"></span></h3>
      <div class="list" id="foundList"></div>
    </div>
  </div>
</div>

<div id="ov"></div>
<div class="loading" id="loading">Ladataan sanastoa<span class="dot">\u2026</span></div>

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
