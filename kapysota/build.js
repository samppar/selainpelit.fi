#!/usr/bin/env node
// Kokoaa Käpysodan yhdeksi itsenäiseksi index.html-tiedostoksi.
const fs = require("node:fs");
const path = require("node:path");
const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const engine = read("src/engine.js");
const game = read("src/game.js");
const css = read("src/style.css");

const svgSinko = `<svg viewBox="0 0 24 24" fill="none" stroke="#4a3018" stroke-width="1.4"><ellipse cx="12" cy="12" rx="5" ry="8" fill="#8a5a2e"/><path d="M9 6.5q3 1.5 6 0M8 9.5q4 2 8 0M8 12.5q4 2 8 0M8.5 15.5q3.5 2 7 0M10 18.2q2 1.2 4 0" stroke="#5e3d1f"/></svg>`;
const svgTerho = `<svg viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="14" rx="5.5" ry="7" fill="#a9743a"/><ellipse cx="12" cy="8.5" rx="6.5" ry="3.4" fill="#6d4a26"/><rect x="11" y="3" width="2" height="4" rx="1" fill="#6d4a26"/></svg>`;
const svgMarja = `<svg viewBox="0 0 24 24" fill="none"><circle cx="9" cy="14" r="4.5" fill="#b5262f"/><circle cx="15.5" cy="12" r="4" fill="#c8353c"/><circle cx="12" cy="7.5" r="3.4" fill="#b5262f"/><circle cx="8" cy="12.6" r="1" fill="#fff" opacity="0.6"/><circle cx="14.6" cy="10.8" r="0.9" fill="#fff" opacity="0.6"/></svg>`;

const html = `<!DOCTYPE html><html lang="fi"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Käpysota — vuoropohjainen oravien tykistöpeli: käpysinko, terhokranaatti ja tuhoutuva metsämaasto.">
<meta name="theme-color" content="#1c3122"><title>Käpysota — selainpelit.fi</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
<style>${css}</style></head><body><main class="shell">
<section class="board-col" aria-label="Käpysota-taistelukenttä">
  <div class="brand"><h1>Käpysota</h1><p>Oravalaumojen vuoropohjainen tykistötaistelu</p></div>
  <div class="teambars" aria-live="polite">
    <div id="teambar0" class="teambar t0"><div class="tb-head"><b>Punaiset</b><span id="tbAlive0">3/3</span></div><div class="tb-track"><div id="tbFill0" class="tb-fill" style="width:100%"></div></div></div>
    <div id="teambar1" class="teambar t1"><div class="tb-head"><b>Harmaat</b><span id="tbAlive1">3/3</span></div><div class="tb-track"><div id="tbFill1" class="tb-fill" style="width:100%"></div></div></div>
  </div>
  <div class="stage">
    <div class="board-frame">
      <canvas id="board" width="960" height="540" role="img" aria-label="Metsäinen taistelukenttä"></canvas>
      <button id="btnFsCorner" class="fs-corner" type="button" title="Koko ruutu" aria-label="Koko ruutu">⛶</button>
      <div id="overlay" class="overlay show" role="dialog" aria-modal="true"><div class="overlay-card">
        <h2 id="overlayTitle">Käpysota</h2>
        <p id="overlayText">Kaksi oravalaumaa, yksi metsä. Kaada vastustajan oravat kävyillä, terhoilla ja marjoilla — tuhoutuvassa maastossa.</p>
        <div id="modePicker" class="mode-picker" aria-label="Valitse pelimuoto">
          <button type="button" data-mode="ai" data-ailevel="helppo">Konetta vastaan · rento<small>kone tähtää huolimattomasti</small></button>
          <button type="button" data-mode="ai" data-ailevel="tarkka">Konetta vastaan · tarkka<small>kone laskee lentoradat</small></button>
          <button type="button" data-mode="hotseat">Kaksi pelaajaa<small>vuorotellen samalla laitteella</small></button>
        </div>
        <div id="againRow" style="display:none;flex-direction:column;gap:0.5rem">
          <button id="btnAgain" class="again" type="button">Revanssi</button>
          <button id="btnMenu" class="again" type="button" style="background:rgba(246,238,218,0.15);color:#f3e6c4">Valikkoon</button>
        </div>
      </div></div>
    </div>
  </div>
  <div class="touchbar" aria-label="Kosketusohjaimet">
    <button id="tLeft" type="button" aria-label="Liiku vasemmalle">◀</button>
    <button id="tRight" type="button" aria-label="Liiku oikealle">▶</button>
    <button id="tJump" type="button" aria-label="Hyppää">⤴</button>
    <button id="tUp" type="button" aria-label="Tähtää ylös">＋</button>
    <button id="tDown" type="button" aria-label="Tähtää alas">－</button>
    <button id="tFire" class="fire-btn" type="button" aria-label="Pidä pohjassa ja vapauta ampuaksesi">AMMU</button>
  </div>
  <div class="hud" aria-live="polite">
    <div class="stat" id="statTurn"><strong id="statTurnV">—</strong><span>Vuorossa</span></div>
    <div class="stat" id="statTimer"><strong id="statTimerV">45 s</strong><span>Aikaa</span></div>
    <div class="stat"><strong id="statWindV">·</strong><span>Tuuli</span></div>
    <div class="stat"><strong id="statRoundV">1</strong><span>Kierros</span></div>
  </div>
</section>
<aside class="side">
  <p id="phase" class="phase">Valitse pelimuoto</p>
  <p id="message" class="message">Kaada vastustajan kaikki kolme oravaa.</p>
  <h2>Ase</h2>
  <div class="weapons" aria-label="Asevalinta">
    <button class="weapon active" type="button" data-weapon="sinko"><span class="wicon">${svgSinko}</span><span><span class="wname">Käpysinko</span><span class="wdesc">suora rakettikäpy — tuuli vie</span></span><kbd>1</kbd></button>
    <button class="weapon" type="button" data-weapon="terho"><span class="wicon">${svgTerho}</span><span><span class="wname">Terhokranaatti</span><span class="wdesc">pomppii · räjähtää 3 s</span></span><kbd>2</kbd></button>
    <button class="weapon" type="button" data-weapon="marja"><span class="wicon">${svgMarja}</span><span><span class="wname">Marjapommi</span><span class="wdesc">hajoaa viideksi marjaksi</span></span><kbd>3</kbd></button>
  </div>
  <h2>Ohjaus</h2>
  <p>Nuolet/WASD: liiku ja tähtää. <strong>Välilyönti pohjassa</strong> lataa voimaa, vapautus ampuu. <strong>X</strong> hyppää, <strong>F</strong> koko ruutu. Hiirellä: osoita tähdätäksesi, pidä nappi pohjassa ja vapauta.</p>
  <div class="hint-keys" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>Väli</kbd><kbd>X</kbd></div>
  <h2>Tavoite</h2>
  <p>Pudota vastustajan oravat kartalta tai nollaa niiden voimat. Räjähdykset kaivavat maastoa — järveen pudonnut orava hukkuu. Tuuli kääntyy joka vuoro.</p>
  <div class="controls">
    <button id="btnSkip" type="button">Ohita vuoro</button>
    <button id="btnNew" class="primary" type="button">Uusi peli</button>
    <button id="btnFullscreen" type="button">Koko ruutu</button>
    <button id="btnSound" type="button" aria-pressed="true">Ääni: päällä</button>
  </div>
</aside>
</main><div id="toast" class="toast" role="status"></div>
<script>${engine}</script><script>${game}</script></body></html>`;

fs.writeFileSync(path.join(ROOT, "index.html"), html);
console.log("Kirjoitettu index.html (" + Math.round(Buffer.byteLength(html) / 1024) + " kB)");
