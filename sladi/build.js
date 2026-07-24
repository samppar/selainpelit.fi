#!/usr/bin/env node
// Kokoaa Sladin yhdeksi itsenäiseksi index.html-tiedostoksi.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const engine = read("src/engine.js");
const game = read("src/game.js");
const css = read("src/style.css");

const html = `<!DOCTYPE html><html lang="fi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Sladi — Slicks 'n Slide -henkinen ylhäältä kuvattu kaahailu: koko rata näkyvissä, autot sladaavat. 1–2 pelaajaa ja botit.">
<meta name="theme-color" content="#0e141c"><title>Sladi — selainpelit.fi</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
<style>${css}</style></head><body><main class="shell">
<section class="board-col" aria-label="Sladi-kilparata">
  <div class="brand"><h1>Sladi</h1><p>Koko radan liukukaahailu — <a href="/">selainpelit.fi</a></p></div>
  <div class="stage">
    <div id="boardFrame" class="board-frame">
      <canvas id="board" width="1680" height="1050" role="img" aria-label="Kilparata ylhäältä kuvattuna"></canvas>
      <div id="scorebar" class="scorebar" aria-hidden="true"></div>
      <button id="btnSnd" class="snd-corner" type="button" title="Äänet (M)" aria-label="Äänet">♪</button>
      <button id="btnFsCorner" class="fs-corner" type="button" title="Koko ruutu (F)" aria-label="Koko ruutu">⛶</button>
      <div id="countWrap" class="count" aria-hidden="true"></div>
      <div id="overlay" class="overlay show" role="dialog" aria-modal="true">
        <div id="menuCard" class="overlay-card">
          <h2>Sladi</h2>
          <p>Ylhäältä kuvattu kaahailu, jossa koko rata näkyy kerralla ja autot sladaavat mutkissa. Neljä kierrosta — nopein voittaa.</p>
          <div id="trackPicker" class="track-picker" aria-label="Valitse rata"></div>
          <div id="vehPicker" class="veh-picker" aria-label="Valitse ajoneuvo"></div>
          <div class="mode-picker" aria-label="Valitse pelimuoto">
            <button type="button" data-mode="1p" data-skill="rento">Yksin · rennot botit<small>hyvä ensimmäiseen kisaan</small></button>
            <button type="button" data-mode="1p" data-skill="kova">Yksin · kovat botit<small>botit jarruttavat myöhään</small></button>
            <button type="button" data-mode="2p" data-skill="rento" class="alt">Kaksin samalla näppäimistöllä<small>P1: nuolet · P2: WASD · + 2 bottia</small></button>
          </div>
        </div>
        <div id="resultCard" class="overlay-card" style="display:none">
          <h2 id="resultTitle">Maali!</h2>
          <div id="resultRows" class="results"></div>
          <div class="again-row">
            <button id="btnAgain" type="button">Uusinta</button>
            <button id="btnMenu" type="button" class="alt">Valikkoon</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="touchbar" aria-label="Kosketusohjaimet">
    <button id="tLeft" type="button" aria-label="Käänny vasemmalle">◀</button>
    <button id="tRight" type="button" aria-label="Käänny oikealle">▶</button>
    <button id="tBrake" class="brk" type="button" aria-label="Jarruta">JARRU</button>
    <button id="tGas" class="gas" type="button" aria-label="Kaasuta">KAASU</button>
  </div>
</section>
<aside class="side">
  <p id="phase" class="phase">Valitse rata ja pelimuoto</p>
  <p id="message" class="message" aria-live="polite">Kaasuta suorilla ja anna perän sladata mutkissa.</p>
  <h2>Sijoitukset</h2>
  <div id="standings" class="standings" aria-live="off"></div>
  <h2>Omat ajat</h2>
  <div class="laptimes">
    <div class="laptime"><b id="lapNow">–</b><span>Kierros</span></div>
    <div class="laptime"><b id="speedNow">0 km/h</b><span>Vauhti</span></div>
    <div class="laptime"><b id="lapLast">–</b><span>Viime kierros</span></div>
    <div class="laptime"><b id="lapBest">–</b><span>Paras kierros</span></div>
  </div>
  <h2>Ohjaus</h2>
  <p class="help"><strong>P1:</strong> nuolinäppäimet — <kbd>▲</kbd> kaasu, <kbd>▼</kbd> jarru/pakki.<br>
  <strong>P2:</strong> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> kaksinpelissä.<br>
  <kbd>F</kbd> koko ruutu · <kbd>M</kbd> äänet.<br>
  Keltaiset nuolet = turbo. Öljy vie pidon, ruskea muta hidastaa,
  sininen vesi upottaa lähes pysähdyksiin. Väistä rengaskasoja —
  ja Kahdeksikossa alempi tie kulkee sillan alitse!</p>
  <p class="footer-note">Kunnianosoitus 90-luvun suomalaisklassikoille · <a href="/">selainpelit.fi</a></p>
</aside>
</main>
<script>${engine}<\/script>
<script>${game}<\/script>
</body></html>
`;

fs.writeFileSync(path.join(ROOT, "index.html"), html);
console.log("index.html kirjoitettu (" + (html.length / 1024).toFixed(0) + " KiB)");
