#!/usr/bin/env node
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
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Labyrintti — kallistettava kuulapeli. Vie kuula maaliin, vältä reiät.">
<meta name="theme-color" content="#2a1c12">
<title>Labyrintti — selainpelit.fi</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<main class="shell">
  <section class="board-col" aria-label="Labyrintti-lauta">
    <div class="brand">
      <h1>Labyrintti</h1>
      <p>Kallista · väistä · maaliin</p>
    </div>
    <div class="stage">
      <button id="btnFsCorner" class="fs-corner" type="button" aria-label="Koko ruutu" title="Koko ruutu (F)">⛶</button>
      <div id="boardTilt" class="board-tilt">
        <div class="board-frame">
          <canvas id="board" width="500" height="460" role="img" aria-label="Pelilauta"></canvas>
          <div id="overlay" class="overlay" role="dialog" aria-modal="true">
            <div class="overlay-card">
              <h2 id="overlayTitle">Labyrintti</h2>
              <p id="overlayText"></p>
              <button id="overlayBtn" type="button">Aloita</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="hud" aria-live="polite">
      <div class="stat"><strong id="statLevel">1</strong><span>Taso</span></div>
      <div class="stat"><strong id="statProgress">0%</strong><span>Reitti</span></div>
      <div class="stat"><strong id="statAttempts">0</strong><span>Yritykset</span></div>
      <div class="stat"><strong id="statTime">0:00</strong><span>Aika</span></div>
    </div>
  </section>

  <aside class="side">
    <p id="phase" class="phase">Valmis lähtöön</p>
    <p id="message" class="message">Vie kuula START-pisteestä FINISH-pisteeseen.</p>

    <h2>Kallistus</h2>
    <div class="tilt-meter" aria-hidden="true"><span id="tiltDot"></span></div>

    <h2>Ohjaus</h2>
    <p>Nuolinäppäimet tai WASD. Puhelimella kallistus. <strong>F</strong> = koko ruutu.</p>
    <div class="hint-keys" aria-hidden="true">
      <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd><kbd>F</kbd>
    </div>

    <h2>Vaikeustaso</h2>
    <div class="diff-row" role="group" aria-label="Vaikeustaso">
      <button id="diffEasy" class="diff" type="button" aria-pressed="false">Helppo</button>
      <button id="diffNormal" class="diff" type="button" aria-pressed="true">Keskitaso</button>
      <button id="diffHard" class="diff" type="button" aria-pressed="false">Vaikea</button>
    </div>
    <p class="diff-note">Vaikeampi = suurempi sokkelo, enemmän reikiä, herkemmät reiät ja nopeampi kuula.</p>

    <h2>Säännöt</h2>
    <p>Seuraa mustaa viivaa. Tipahdus reikään palauttaa viimeiseen tarkistuspisteeseen (vihreä piste). Maaliin päästyä taso vaihtuu vaikeammaksi.</p>

    <div class="controls">
      <button id="btnStart" class="primary" type="button">Aloita</button>
      <button id="btnRetry" type="button">Uusi yritys</button>
      <button id="btnNew" type="button">Uusi peli</button>
      <button id="btnFullscreen" type="button">Koko ruutu</button>
      <button id="btnSound" type="button" aria-pressed="true">Ääni: päällä</button>
    </div>
  </aside>
</main>
<div id="toast" class="toast" role="status"></div>
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
