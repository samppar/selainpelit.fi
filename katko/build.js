#!/usr/bin/env node
// ============================================================================
//  Katko — niputtaja ilman riippuvuuksia → itsenäinen dist/index.html.
//  --------------------------------------------------------------------------
//  Kehityksessä index.html lataa engine.js:n ja agents/-moduulit ES-moduuleina
//  (vaatii paikallisen palvelimen). Tuotantoon deploy kopioi VAIN yhden
//  html-tiedoston, joten moduulit inlinetaan tähän: import-rivit poistetaan,
//  export-etuliitteet riisutaan ja kaikki kääritään yhteen klassiseen
//  <script>-IIFE:en. UI-koodin omat sisäkkäiset nimet (SUITS, RANKS,
//  legalCards, buildView) varjostavat ulommat turvallisesti oman IIFE:nsä
//  sisällä; engine-aliakset (engineLegal, engineView) määritellään erikseen.
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// ES-moduuli → klassinen skripti: pois import-lauseet, pois export-etuliitteet.
function inline(src) {
  return src
    .replace(/^import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?\s*$/gm, "")
    .replace(/^export\s+/gm, "");
}

const modules = [
  "engine.js",
  "agents/base.js",
  "agents/aino.js",
  "agents/eino.js",
  "agents/vaino.js",
  "agents/monte.js",
].map(p => `// ---- ${p} ----\n${inline(read(p))}`).join("\n");

const html = read("index.html");

// Poimi UI-skripti ja korvaa moduulilataus inlinetulla nipulla.
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) { console.error("build: <script type=\"module\"> ei löytynyt index.html:stä"); process.exit(1); }
const ui = inline(m[1]);

const bundled = html.replace(m[0],
  `<script>\n"use strict";\n(() => {\n${modules}\n` +
  `// index.html:n UI-skriptin engine-aliakset\n` +
  `const engineLegal = legalCards;\nconst engineView = buildView;\n${ui}\n})();\n</script>`);

// Vahvistus: nippuun ei saa jäädä moduulisyntaksia.
if (/^\s*(import|export)\s/m.test(bundled.replace(/<!--[\s\S]*?-->/g, ""))) {
  console.error("build: nippuun jäi import/export-lauseita");
  process.exit(1);
}

mkdirSync(join(ROOT, "dist"), { recursive: true });
writeFileSync(join(ROOT, "dist/index.html"), bundled);
console.log(`build ok: dist/index.html (${(bundled.length / 1024).toFixed(1)} kt)`);
