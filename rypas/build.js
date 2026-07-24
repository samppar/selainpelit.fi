#!/usr/bin/env node
// Rypäs — niputtaja ilman riippuvuuksia → yksi index.html.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const engine = read("src/engine.js");
const game = read("src/game.js");
const css = read("src/style.css");

const html = `<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<meta name="description" content="Rypäs — numeropalaripeli tietokonetta vastaan. Muodosta ryhmiä ja jonoja, tyhjennä telineesi.">
<title>Rypäs — numeropalaripeli</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">
      <h1>Rypäs</h1>
      <div class="tag">Numerot · ryhmät · jonot</div>
    </div>
    <div class="hbtns">
      <button class="ghost" id="btnRules" type="button">Säännöt</button>
      <button class="ghost" id="btnNew" type="button">Uusi peli</button>
    </div>
  </header>

  <div id="game" class="hidden">
    <div class="hud" id="hud"></div>

    <div class="goal" id="goal"></div>
    <div class="status" id="status"></div>

    <div class="table-label">Pöytä</div>
    <div class="table" id="table"></div>

    <div class="section hidden" id="poolWrap">
      <div class="section-h">
        <div class="table-label">Työalue (puretut palat)</div>
      </div>
      <div class="pool" id="pool" data-empty="Työalue tyhjä"></div>
    </div>

    <div class="section">
      <div class="section-h">
        <div class="table-label">Telineesi <span class="sel-info" id="selInfo"></span></div>
        <div class="sortbtns">
          <button class="mini" id="btnSortVal" type="button" title="Järjestä numeron mukaan">1–13</button>
          <button class="mini" id="btnSortCol" type="button" title="Järjestä värin mukaan">Väri</button>
        </div>
      </div>
      <div class="rack" id="rack" data-empty="Teline tyhjä"></div>
    </div>

    <div class="ctrls">
      <button class="go" id="btnForm" type="button">Muodosta rypäs</button>
      <button id="btnConfirm" type="button">Vahvista vuoro</button>
      <button id="btnReset" type="button">Peru</button>
      <button class="danger" id="btnDraw" type="button">Nosta</button>
    </div>
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
${game}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, "index.html"), html);
console.log("Wrote index.html (" + (html.length / 1024).toFixed(1) + " KiB)");
