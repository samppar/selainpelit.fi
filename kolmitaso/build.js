#!/usr/bin/env node
// Kokoaa Kolmitason yhdeksi itsenäiseksi index.html-tiedostoksi.
const fs = require("node:fs");
const path = require("node:path");
const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const engine = read("src/engine.js");
const game = read("src/game.js");
const css = read("src/style.css");

const html = `<!DOCTYPE html><html lang="fi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Kolmitaso — Triplane Turmoil -henkinen ilmataistelu: nouse, pommita vihollisen tukikohta ja laskeudu huoltoon omalle kentälle.">
<meta name="theme-color" content="#0f141d"><title>Kolmitaso — selainpelit.fi</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Staatliches&family=Barlow:wght@400;600;700&display=swap" rel="stylesheet">
<style>${css}</style></head><body><main class="shell">
<section class="board-col" aria-label="Kolmitaso-ilmataistelu">
  <div class="brand"><h1>Kolmitaso</h1><p>Nouse, pommita ja tuo kone ehjänä kotiin — kolmitasojen ilmasota</p></div>
  <div class="stage">
    <div class="board-frame">
      <canvas id="board" width="960" height="600" role="img" aria-label="Ilmataistelu sivusta kuvattuna"></canvas>
      <button id="btnFsCorner" class="fs-corner" type="button" title="Koko ruutu" aria-label="Koko ruutu">⛶</button>
      <div id="overlay" class="overlay" role="dialog" aria-modal="true">
        <div class="overlay-card">
          <div id="menuSection">
            <h2>Kolmitaso</h2>
            <p class="sub">Tuhoa vihollisen hallit, varikot ja it-tykit. Käy välillä omalla kentällä: laskeudu, niin mekaanikot tankkaavat, korjaavat ja ripustavat uudet pommit.</p>
            <div id="missionPicker" class="mission-picker" aria-label="Valitse tehtävä"></div>
            <p class="menu-hint">Ohjaus: <kbd>←</kbd><kbd>→</kbd> kierto · <kbd>↑</kbd><kbd>↓</kbd> kaasu · <kbd>Väli</kbd> konekivääri · <kbd>B</kbd> pommi · <kbd>X</kbd> rullaus</p>
          </div>
          <div id="resultsSection" style="display:none">
            <p id="resTitle" class="res-title">—</p>
            <p id="resSub" class="res-sub"></p>
            <div id="resRows" class="res-rows"></div>
            <div class="btn-row">
              <button id="btnAgain" class="big" type="button">Uusi yritys</button>
              <button id="btnNext" class="big" type="button" style="display:none">Seuraava tehtävä</button>
              <button id="btnResMenu" class="big ghost" type="button">Valikkoon</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="touchbar" aria-label="Kosketusohjaimet">
    <div class="grp">
      <button id="tCcw" type="button" aria-label="Kierrä vastapäivään">⟲</button>
      <button id="tCw" type="button" aria-label="Kierrä myötäpäivään">⟳</button>
    </div>
    <div class="grp">
      <button id="tPowDown" type="button" aria-label="Vähennä kaasua">▼</button>
      <button id="tPowUp" type="button" aria-label="Lisää kaasua">▲</button>
    </div>
    <div class="grp">
      <button id="tFlip" type="button" aria-label="Rullaus">⇅</button>
      <button id="tBomb" class="bomb" type="button" aria-label="Pudota pommi">POMMI</button>
      <button id="tFire" class="fire" type="button" aria-label="Ammu">AMMU</button>
    </div>
  </div>
</section>
<aside class="side">
  <h2>Tehtävä</h2>
  <div id="missionChip">—</div>
  <h2>Maalit</h2>
  <div id="targetList" class="targets" aria-live="polite"></div>
  <h2>Ohjaus</h2>
  <p><kbd>←</kbd><kbd>→</kbd> kiertävät konetta, <kbd>↑</kbd><kbd>↓</kbd> säätävät kaasua. <strong>Väli</strong> ampuu, <strong>B</strong> pudottaa pommin, <strong>X</strong> tekee rullauksen. <strong>F</strong> koko ruutu, <strong>Esc</strong> keskeyttää.</p>
  <h2>Kentältä</h2>
  <p>Laskeudu <strong>loivasti omalle kiitoradalle</strong> ja pysähdy: kone tankataan, korjataan ja pommitetaan täyteen. Pidä vauhti sakkausrajan yläpuolella — hidas kone tipahtaa nokka edellä.</p>
  <div class="controls">
    <button id="btnMenuOpen" type="button">Valikko</button>
    <button id="btnAbort" class="warn" type="button">Keskeytä</button>
    <button id="btnFullscreen" type="button">Koko ruutu</button>
    <button id="btnSound" type="button" aria-pressed="true">Ääni: päällä</button>
  </div>
</aside>
</main><div id="toast" class="toast" role="status"></div>
<script>${engine}</script><script>${game}</script></body></html>`;

fs.writeFileSync(path.join(ROOT, "index.html"), html);
console.log("Kirjoitettu index.html (" + Math.round(Buffer.byteLength(html) / 1024) + " kB)");
