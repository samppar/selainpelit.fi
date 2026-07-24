#!/usr/bin/env node
// Kokoaa Romurallin yhdeksi itsenäiseksi index.html-tiedostoksi.
const fs = require("node:fs");
const path = require("node:path");
const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const engine = read("src/engine.js");
const game = read("src/game.js");
const css = read("src/style.css");

const html = `<!DOCTYPE html><html lang="fi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Romuralli — ylhäältä kuvattu aseellinen kilpa-ajopeli: konekivääri, turbo, palkintorahat ja autotalli.">
<meta name="theme-color" content="#111318"><title>Romuralli — selainpelit.fi</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Russo+One&family=Chakra+Petch:wght@400;600&display=swap" rel="stylesheet">
<style>${css}</style></head><body><main class="shell">
<section class="board-col" aria-label="Romuralli-kilparata">
  <div class="brand"><h1>Romuralli</h1><p>Aja, ammu ja päivitä — vanhan koulun romukisat</p></div>
  <div class="stage">
    <div class="board-frame">
      <canvas id="board" width="960" height="600" role="img" aria-label="Kilparata ylhäältä kuvattuna"></canvas>
      <button id="btnFsCorner" class="fs-corner" type="button" title="Koko ruutu" aria-label="Koko ruutu">⛶</button>
      <div id="overlay" class="overlay" role="dialog" aria-modal="true">
        <div class="overlay-card">
          <div id="menuSection">
            <h2>Romuralli</h2>
            <p class="sub">Neljä autoa, kolme kaartuvaa kierrosta ja konekiväärit. Aja palkintorahoille ja rakenna autostasi romukasan kuningas.</p>
            <div class="wallet"><span>Kassa</span><b id="mMoney">$0</b></div>
            <div id="tierPicker" class="tier-picker" aria-label="Valitse kisasarja">
              <button type="button" data-tier="helppo">
                <span class="t-name">Romusarja<small>rauhalliset vastustajat · 3 kierrosta</small><small class="t-best"></small></span>
                <span class="t-prize">$120<small>1. palkinto</small></span>
              </button>
              <button type="button" data-tier="keski">
                <span class="t-name">Katusarja<small>kovemmat kuskit · 4 kierrosta</small><small class="t-best"></small></span>
                <span class="t-prize">$260<small>1. palkinto</small></span>
              </button>
              <button type="button" data-tier="vaikea">
                <span class="t-name">Kuolonsarja<small>armottomat ammattilaiset · 5 kierrosta</small><small class="t-best"></small></span>
                <span class="t-prize">$520<small>1. palkinto</small></span>
              </button>
            </div>
            <p class="menu-hint">Ohjaus: <kbd>←</kbd><kbd>→</kbd> kääntyy, <kbd>↑</kbd> kaasu, <kbd>↓</kbd> jarru · <kbd>Väli</kbd> ampuu · <kbd>Vaihto</kbd> turbo</p>
          </div>
          <div id="resultsSection" style="display:none">
            <p id="resTitle" class="res-place">—</p>
            <div id="resRows" class="res-rows"></div>
            <div id="resOrder" class="res-order"></div>
            <div class="btn-row">
              <button id="btnAgain" class="big" type="button">Uusi kisa</button>
              <button id="btnResMenu" class="big ghost" type="button">Valikkoon</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="touchbar" aria-label="Kosketusohjaimet">
    <div class="grp">
      <button id="tLeft" type="button" aria-label="Käänny vasemmalle">◀</button>
      <button id="tRight" type="button" aria-label="Käänny oikealle">▶</button>
    </div>
    <div class="grp">
      <button id="tBrake" type="button" aria-label="Jarruta">▼</button>
      <button id="tGas" type="button" aria-label="Kaasuta">▲</button>
    </div>
    <div class="grp">
      <button id="tTurbo" class="boost" type="button" aria-label="Turbo">TURBO</button>
      <button id="tFire" class="fire" type="button" aria-label="Ammu">AMMU</button>
    </div>
  </div>
</section>
<aside class="side">
  <h2>Kassa</h2>
  <div class="money-chip"><b id="money">$0</b><span>palkinnot &amp; romutukset</span></div>
  <div id="trackChip">—</div>
  <h2>Sijoitukset</h2>
  <div id="standings" class="standings" aria-live="polite"></div>
  <h2>Autotalli</h2>
  <div id="garage" class="garage"></div>
  <h2>Ohjaus</h2>
  <p>Nuolet/WASD: kaasu, jarru ja kääntyminen. <strong>Välilyönti</strong> ampuu konekiväärillä, <strong>Vaihto</strong> polttaa turboa. <strong>F</strong> koko ruutu, <strong>Esc</strong> keskeyttää kisan.</p>
  <div class="hint-keys" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>Väli</kbd><kbd>Vaihto</kbd></div>
  <h2>Radalta</h2>
  <p><strong>$</strong> rahasäkki · <strong>+</strong> korjaus · patruunalaatikko täydentää lippaat · salama lataa turboa. Vastustajan romuttamisesta saa $60 — mutta kolarit syövät omaakin kuntoa.</p>
  <div class="controls">
    <button id="btnMenuOpen" type="button">Valikko</button>
    <button id="btnAbort" class="warn" type="button">Keskeytä kisa</button>
    <button id="btnFullscreen" type="button">Koko ruutu</button>
    <button id="btnSound" type="button" aria-pressed="true">Ääni: päällä</button>
  </div>
</aside>
</main><div id="toast" class="toast" role="status"></div>
<script>${engine}</script><script>${game}</script></body></html>`;

fs.writeFileSync(path.join(ROOT, "index.html"), html);
console.log("Kirjoitettu index.html (" + Math.round(Buffer.byteLength(html) / 1024) + " kB)");
