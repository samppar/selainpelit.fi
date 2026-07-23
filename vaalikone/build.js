#!/usr/bin/env node
// Vaalikone — niputtaja ilman riippuvuuksia.
// Kokoaa itsenäisen index.html:n osista (src/*).
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const engine = read("src/engine.js");
const app = read("src/app.js");
const css = read("src/style.css");

const html = `<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Tee oma vaalikone ja jaa se linkkinä. Kyllä/ei-kysymykset, ohitus ja painoarvot — ilman tilejä ja palvelimia.">
<meta name="theme-color" content="#1a120c">
<meta property="og:title" content="Vaalikone — tee oma ja jaa linkkinä">
<meta property="og:description" content="Kyllä/ei-kysymykset, ehdokkaat ja tulokset. Vastaaja voi ohittaa kysymyksen ja painottaa tärkeitä.">
<meta property="og:type" content="website">
<title>Vaalikone — tee oma ja jaa linkkinä · selainpelit.fi</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<div id="app"></div>
<script>
${engine}
</script>
<script>
${app}
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, "index.html"), html);
console.log("Kirjoitettu: index.html (" + (Buffer.byteLength(html) / 1024).toFixed(0) + " kB)");
console.log("Avaa index.html selaimessa — palvelinta ei tarvita.");
