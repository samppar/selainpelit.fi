#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const engine = read("../labyrintti/src/engine.js");
let game = read("../labyrintti/src/game.js");
// Labyrintti 2 aloittaa valitulta tasolta ja vaikeudelta. v1:n game.js luo
// tilan aina tasolta 1 (E.createState(1, difficulty)); teemme aloitustason
// muuttuvaksi ja annamme pickerin asettaa myös difficultyn (v1:n oma muuttuja).
game = game.replace('"use strict";', '"use strict";\n  var selectedLevel = 1;');
const createCalls = game.match(/E\.createState\(1, difficulty\)/g) || [];
if (createCalls.length !== 3) {
  throw new Error("Odotettiin 3 kpl E.createState(1, difficulty) v1:n game.js:ssä, löytyi " + createCalls.length);
}
game = game.replace(/E\.createState\(1, difficulty\)/g, "E.createState(selectedLevel, difficulty)");
game = game.replace(
  "getState: function () { return E.getView(st); },",
  "getState: function () { return E.getView(st); },\n" +
  "    startAt: function (level, diff) { selectedLevel = Math.max(1, level | 0); if (diff && E.DIFFICULTY[diff]) difficulty = diff; begin(); },"
);

const css = read("../labyrintti/src/style.css") + "\n" + read("src/variant.css");
const choices = `
  <div class="difficulty-picker" aria-label="Valitse vaikeustaso">
    <button type="button" data-level="1" data-difficulty="easy">Rento<small>pieni lauta · lempeä kuula</small></button>
    <button type="button" data-level="6" data-difficulty="normal">Haastava<small>isompi lauta · tiheämpi sokkelo</small></button>
    <button type="button" data-level="11" data-difficulty="hard">Mestari<small>suurin lauta · armoton veto</small></button>
  </div>`;

const html = `<!DOCTYPE html><html lang="fi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Labyrintti 2 — kallista lautaa, vieritä kuula maaliin ja vältä reiät.">
<meta name="theme-color" content="#2a1c12"><title>Labyrintti 2 — selainpelit.fi</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
<style>${css}</style></head><body><main class="shell">
<section class="board-col" aria-label="Labyrintti-lauta"><div class="brand"><h1>Labyrintti 2</h1><p>Kallista · vieritä · vältä reiät</p></div>
<div class="stage"><div id="boardTilt" class="board-tilt"><div class="board-frame">
<canvas id="board" width="500" height="460" role="img" aria-label="Kuulalabyrintti"></canvas>
<div id="overlay" class="overlay show" role="dialog" aria-modal="true"><div class="overlay-card"><h2 id="overlayTitle">Valitse vaikeus</h2><p id="overlayText">Vie kuula START-pisteestä maaliin ja vältä reiät.</p>${choices}<button id="overlayBtn" type="button">Jatka</button></div></div>
</div></div></div><div class="hud" aria-live="polite"><div class="stat"><strong id="statLevel">1</strong><span>Taso</span></div><div class="stat"><strong id="statProgress">0%</strong><span>Reitti</span></div><div class="stat"><strong id="statAttempts">0</strong><span>Yritykset</span></div><div class="stat"><strong id="statTime">0:00</strong><span>Aika</span></div></div></section>
<aside class="side"><p id="phase" class="phase">Valitse vaikeus</p><p id="message" class="message">Kallista lautaa ja vältä mustat reiät.</p><h2>Kallistus</h2><div class="tilt-meter" aria-hidden="true"><span id="tiltDot"></span></div><h2>Ohjaus</h2><p>Nuolinäppäimet tai WASD. Puhelimella kallistus. <strong>F</strong> = koko ruutu.</p><div class="hint-keys" aria-hidden="true"><kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd><kbd>F</kbd></div><h2>Tavoite</h2><p>Vieritä metallikuula mustaa viivaa pitkin FINISH-pisteeseen. Reikään putoaminen palauttaa viimeiseen tarkistuspisteeseen.</p><div class="controls"><button id="btnStart" class="primary" type="button">Aloita</button><button id="btnRetry" type="button">Uusi yritys</button><button id="btnNew" type="button">Uusi peli</button><button id="btnFullscreen" type="button">Koko ruutu</button><button id="btnSound" type="button" aria-pressed="true">Ääni: päällä</button></div></aside>
</main><div id="toast" class="toast" role="status"></div><script>${engine}</script><script>${game}</script>
<script>document.querySelectorAll("[data-level]").forEach(function(button){button.addEventListener("click",function(){document.getElementById("overlay").classList.add("chosen");window.LabyrinttiUI.startAt(Number(button.dataset.level), button.dataset.difficulty);});});</script></body></html>`;

fs.writeFileSync(path.join(ROOT, "index.html"), html);
console.log("Kirjoitettu index.html (" + Math.round(Buffer.byteLength(html) / 1024) + " kB)");
