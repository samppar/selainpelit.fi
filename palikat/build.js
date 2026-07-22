#!/usr/bin/env node
// Palikat — niputtaja ilman riippuvuuksia → itsenäinen index.html.
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
<meta name="description" content="Palikat — Blokus-tyylinen palapeli tietokonetta vastaan.">
<title>Palikat — selainpelit.fi</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Syne:wght@600;700;800&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<main class="shell">
  <section class="board-col" aria-label="Palikat-pelilauta">
    <div class="brand">
      <h1>PALIKAT</h1>
      <p>Kulma · peitä · pisteet</p>
    </div>
    <div class="board-frame">
      <div id="board" class="board" role="grid" aria-label="14×14 pelilauta"></div>
    </div>
    <div class="tray-wrap">
      <h2>Omat palat</h2>
      <div id="tray" class="tray" aria-label="Palatarjotin"></div>
    </div>
  </section>

  <aside class="side" aria-live="polite">
    <div class="status-box">
      <p id="phase" class="phase">Sinun vuorosi</p>
      <p id="message" class="message">Valitse pala ja peitä aloitusruutu.</p>
    </div>

    <div class="players">
      <div id="playerHuman" class="player active">
        <span class="sample human" aria-hidden="true"></span>
        <div>
          <strong>Sinä</strong>
          <span id="humanStats">0 pistettä</span>
        </div>
      </div>
      <div id="playerAi" class="player">
        <span class="sample ai" aria-hidden="true"></span>
        <div>
          <strong>Tietokone</strong>
          <span id="aiStats">0 pistettä</span>
        </div>
      </div>
    </div>

    <div class="rules">
      <h2>Pelin kulku</h2>
      <p>Aseta polyominopaloja 14×14-laudalle. Ensimmäisen palan on peitettävä aloituspisteesi. Seuraavat omat palat saavat koskettaa toisiaan vain kulmasta — ei reunasta.</p>
      <p>Pisteitä saat peitetyistä ruuduista. Jos käytät kaikki 21 palaa, saat +15 (ja +5 jos viimeinen oli yhden ruudun pala). Enemmän pisteitä voittaa.</p>
    </div>

    <div class="controls">
      <label class="field" for="starter">
        Aloittaja
        <select id="starter">
          <option value="alternate" selected>Vuorotellen</option>
          <option value="human">Sinä</option>
          <option value="computer">Tietokone</option>
        </select>
      </label>
      <label class="field" for="difficulty">
        Vaikeus
        <select id="difficulty">
          <option value="350">Nopea</option>
          <option value="1000" selected>Vahva</option>
          <option value="2500">Erittäin vahva</option>
        </select>
      </label>
      <div class="actions">
        <button id="btnRotate" class="orient" type="button" title="R (kierrä)">Kierrä</button>
        <button id="btnFlip" class="orient" type="button" title="F (peilaa)">Peilaa</button>
        <button id="btnHint" class="hint" type="button">Vihje</button>
        <button id="btnUndo" type="button">Peru siirto</button>
        <button id="btnNew" class="primary" type="button">Uusi peli</button>
      </div>
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
