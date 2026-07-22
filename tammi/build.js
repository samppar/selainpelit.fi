#!/usr/bin/env node
// Tammi — niputtaja ilman riippuvuuksia → itsenäinen index.html.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const engine = read("src/engine.js");
const session = read("src/session.js");
const game = read("src/game.js");
const css = read("src/style.css");

const html = `<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Tammi — klassinen lautapeli tietokonetta vastaan.">
<title>Tammi — selainpelit.fi</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<main class="shell">
  <section class="board-col" aria-label="Tammi-pelilauta">
    <div class="brand">
      <h1>TAMMI</h1>
      <p>Siirrä · syö · daami</p>
    </div>
    <div class="board-frame">
      <div id="board" class="board" role="grid" aria-label="8×8 tammilauta"></div>
    </div>
  </section>

  <aside class="side" aria-live="polite">
    <div class="status-box">
      <p id="phase" class="phase">Sinun vuorosi</p>
      <p id="message" class="message">Valitse nappula ja siirrä vinottain eteenpäin.</p>
    </div>

    <div class="players">
      <div id="playerLight" class="player active">
        <span class="sample light" aria-hidden="true"></span>
        <div>
          <strong>Sinä</strong>
          <span id="lightStats">12 nappulaa</span>
        </div>
      </div>
      <div id="playerDark" class="player">
        <span class="sample dark" aria-hidden="true"></span>
        <div>
          <strong>Tietokone</strong>
          <span id="darkStats">12 nappulaa</span>
        </div>
      </div>
    </div>

    <div class="rules">
      <h2>Pelin kulku</h2>
      <p>Siirrä nappuloita vinottain tummilla ruuduilla eteenpäin. Hyppää vastustajan yli tyhjään ruutuun syödäksesi — syönti on pakollinen.</p>
      <p>Vastapäähän päässyt nappula nousee daamiksi ja liikkuu kaikkiin vinottaissuuntiin. Voitat, kun vastustajalla ei ole laillista siirtoa.</p>
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
${session}
</script>
<script>
${game}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, "index.html"), html);
console.log("Kirjoitettu: index.html (" + (Buffer.byteLength(html) / 1024).toFixed(0) + " kB)");
