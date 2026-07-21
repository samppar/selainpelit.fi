#!/usr/bin/env node
// Tuottaa sanat.txt Kotuksen Nykysuomen sanalistasta (CC BY 4.0).
//
// Käyttö:
//   1) Lataa lähdeaineisto (ei versionhallinnassa suuren koon vuoksi):
//        curl -sSL -o raw/nykysuomensanalista2024.txt \
//          https://kaino.kotus.fi/lataa/nykysuomensanalista2024.txt
//   2) node tools/make-wordlist.js
//
// Suodatus: pelkät suomen kirjaimet (a–ö), pituus 3–16, pienaakkoset, uniikit.
// Taivutusmuodot eivät ole listalla — peli hyväksyy perusmuodot.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "raw", "nykysuomensanalista2024.txt");
if (!fs.existsSync(SRC)) {
  console.error("Lähdetiedostoa ei löytynyt.\nLataa ensin:\n  curl -sSL -o raw/nykysuomensanalista2024.txt https://kaino.kotus.fi/lataa/nykysuomensanalista2024.txt");
  process.exit(1);
}

const raw = fs.readFileSync(SRC, "utf8").split(/\r?\n/);
const set = new Set();
let header = true;
for (const line of raw) {
  if (!line) continue;
  if (header) { header = false; continue; } // otsikkorivi
  const w = line.split("\t")[0].toLowerCase();
  if (w.length < 3 || w.length > 16) continue;
  if (!/^[a-zäöå]+$/.test(w)) continue;
  set.add(w);
}
const words = [...set].sort();
fs.writeFileSync(path.join(ROOT, "sanat.txt"), words.join("\n") + "\n");
console.log("Kirjoitettu sanat.txt:", words.length, "sanaa");
