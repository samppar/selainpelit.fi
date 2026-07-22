#!/usr/bin/env node
// Mosaiikki — niputtaja ilman riippuvuuksia → itsenäinen index.html.
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
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Mosaiikki — täytä muoto värikkäillä paloilla. Selaimessa pelattava sommittelupeli.">
<title>Mosaiikki — selainpelit.fi</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Sora:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<main id="shell" class="shell" data-testid="game-shell" data-phase="playing">
  <section class="stage" aria-label="Mosaiikki-pelilauta">
    <div class="brand">
      <h1 data-testid="brand">MOSAIIKKI</h1>
      <p>Kierrä · peilaa · täytä muoto</p>
    </div>

    <div id="boardFrame" class="board-frame">
      <div id="board" class="board" role="grid" data-testid="board" aria-label="Täytettävä muoto"></div>
    </div>

    <div id="tray" class="tray" data-testid="piece-tray" role="list" aria-label="Palat"></div>
  </section>

  <aside class="side" aria-live="polite">
    <div class="panel status-box">
      <p id="phase" class="phase" data-testid="status-phase">Valitse pala</p>
      <p id="message" class="message" data-testid="status-message">Täytä tumma muoto kaikilla paloilla.</p>
      <div class="progress" data-testid="progress">
        <div class="progress-track"><div id="progressFill" class="progress-fill"></div></div>
        <span id="progressLabel" class="progress-label" data-testid="progress-label">0 / 0</span>
      </div>
      <div id="timer" class="timer zen" data-testid="timer">
        <div class="timer-label">
          <span>Aika</span>
          <span id="timerText" data-testid="timer-text">Ei aikarajaa</span>
        </div>
        <div class="timer-track"><div id="timerFill" class="timer-fill" data-testid="timer-fill"></div></div>
      </div>
    </div>

    <div class="panel rules">
      <h2>Pelin kulku</h2>
      <p>Valitse pala, kierrä (R) tai peilaa (F) ja aseta se muotoon niin että jokainen ruutu täyttyy. Helppo-tasolla ei ole aikarajaa.</p>
    </div>

    <div class="panel controls">
      <label class="field" for="difficulty">
        Vaikeus
        <select id="difficulty" data-testid="difficulty">
          <option value="helppo">Helppo — 3 palaa, ei kelloa</option>
          <option value="normaali" selected>Normaali — 4 palaa</option>
          <option value="vaikea">Vaikea — 5 palaa, tiukka aika</option>
        </select>
      </label>
      <div class="actions">
        <button id="btnRotate" type="button" data-testid="btn-rotate">Kierrä</button>
        <button id="btnFlip" type="button" data-testid="btn-flip">Peilaa</button>
        <button id="btnHint" type="button" data-testid="btn-hint">Vihje</button>
        <button id="btnUndo" type="button" data-testid="btn-undo">Peru</button>
      </div>
      <div class="primary-row">
        <button id="btnNew" class="primary" type="button" data-testid="btn-new">Uusi peli</button>
      </div>
    </div>
  </aside>
</main>

<div id="overlay" class="overlay" data-testid="overlay" data-open="0" aria-hidden="true">
  <div class="overlay-card" role="dialog" aria-modal="true" aria-labelledby="ovTitle">
    <h2 id="ovTitle" data-testid="overlay-title">Valmis!</h2>
    <p id="ovBody" data-testid="overlay-body">Mosaiikki täyttyi.</p>
    <button id="btnNext" class="primary" type="button" data-testid="btn-next">Seuraava</button>
  </div>
</div>

<div id="toast" class="toast" data-testid="toast" role="status"></div>

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
