#!/usr/bin/env node
// Mylly — niputtaja ilman riippuvuuksia → itsenäinen index.html.
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
<meta name="description" content="Mylly — klassinen suomalainen lautapeli tietokonetta vastaan.">
<title>Mylly — selainpelit.fi</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,500;6..96,600&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<main class="shell">
  <section class="board-col" aria-label="Mylly-pelilauta">
    <div class="brand">
      <h1>MYLLY</h1>
      <p>Aseta · myllytä · siirrä</p>
    </div>
    <div class="board-wrap">
      <svg id="boardSvg" class="board-svg" aria-hidden="true"></svg>
      <div id="points" class="points" role="group" aria-label="24 risteyksen pelilauta"></div>
    </div>
  </section>

  <aside class="side" aria-live="polite">
    <div class="status-box">
      <p id="phase" class="phase">Asetteluvaihe</p>
      <p id="message" class="message">Sinun vuorosi: aseta nappula tyhjään risteykseen.</p>
    </div>

    <div class="players">
      <div id="playerLight" class="player active">
        <span class="sample light" aria-hidden="true"></span>
        <div>
          <strong>Sinä</strong>
          <span id="lightStats">9 varastossa, 0 laudalla</span>
        </div>
      </div>
      <div id="playerDark" class="player">
        <span class="sample dark" aria-hidden="true"></span>
        <div>
          <strong>Tietokone</strong>
          <span id="darkStats">9 varastossa, 0 laudalla</span>
        </div>
      </div>
    </div>

    <div class="rules">
      <h2>Pelin kulku</h2>
      <p>Aseta yhdeksän nappulaa vuorotellen. Kolme omaa suoralle viivalle = mylly → poista vastustajan nappula.</p>
      <p>Sitten siirrä viereiseen risteykseen. Kolmella nappulalla saa lentää mihin tahansa tyhjään. Häviät, jos nappuloita on alle kolme tai et voi liikkua.</p>
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
          <option value="400">Nopea</option>
          <option value="1200" selected>Vahva</option>
          <option value="3000">Erittäin vahva</option>
        </select>
      </label>
      <div class="actions">
        <button id="btnHint" class="hint" type="button">Vihje</button>
        <button id="btnUndo" type="button">Peru siirto</button>
        <button id="btnNew" class="primary" type="button">Uusi peli</button>
      </div>
    </div>
  </aside>
</main>
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
