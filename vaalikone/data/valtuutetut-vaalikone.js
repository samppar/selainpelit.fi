#!/usr/bin/env node
// Rakentaa YKSILÖTASON vaalikoneen valtuutettujen äänestysdatasta.
//
//   node data/valtuutetut-vaalikone.js [csv-polku]
//
// CSV (oletus data/valtuutetut.csv, puolipiste-erotin, ks. esimerkki
// data/valtuutetut.csv.esimerkki):
//
//   nimi;puolue;v1;v2;...
//
// jossa v1..vN vastaavat alla olevan QUESTIONS-listan väitteitä
// järjestyksessä: k = kyllä (äänesti väitteen suuntaan), e = ei,
// o = poissa / tyhjä / ei tiedossa.
//
// HUOM. suunta: pöytäkirjan äänestyksessä "jaa" on yleensä pohjaesitys
// ja "ei" vastaesitys. Muotoile väite niin, että VÄITTEEN "kyllä"
// vastaa haluamaasi äänestysvaihtoehtoa, ja merkitse valtuutetun ääni
// samassa suunnassa. Kirjaa lähde (kokous + pykälä) QUESTIONS-listan
// kommenttiin, jotta data on tarkistettavissa.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const V = require("../src/engine.js");

const TITLE = "Oulun valtuusto 2025–2026: kuka äänesti kuten sinä?";
const DESC =
  "Väitteet perustuvat kaupunginvaltuuston oikeisiin äänestyksiin. " +
  "Valtuutetun kanta on hänen pöytäkirjaan kirjattu äänensä; poissaolo " +
  "tai tyhjä on merkitty ”ei kantaa” eikä vaikuta tulokseen. " +
  "Epävirallinen harjoitus.";

// Täytä väitteet samassa järjestyksessä kuin CSV:n sarakkeet v1..vN.
// Kommenttiin kokous ja pykälä (äänestysliite), josta äänet on poimittu.
const QUESTIONS = [
  // v1: kv 10.11.2025 § ___ — kunnallisveroprosentti 2026 (8,1 vs 7,9)
  "Kunnallisveron korotus 8,1 prosenttiin vuodelle 2026 oli oikea ratkaisu.",
  // v2: kv 27.4.2026 § ___ — lähijunaliikenteeseen osallistuminen
  "Oulun oli oikein lähteä mukaan lähijunaliikenteen käynnistämiseen Kempeleen ja Limingan kanssa.",
  // v3: kv 8.6.2026 § ___ — palveluverkon muutokset (kh:n esitys)
  "Palveluverkon leikkaukset — koulujen, päiväkotien ja kirjastojen lakkautuksia — olivat välttämättömiä kaupungin talouden vuoksi.",
  // v4: kv 18.5.2026 § ___ — hyvinvointisuunnitelma 2026–2029
  "Hyvinvointisuunnitelma 2026–2029 oli hyvä sellaisenaan, ilman perussuomalaisten esittämiä muutoksia.",
];

function parseCsv(text) {
  const rows = text.split(/\r?\n/).map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const out = [];
  for (const line of rows) {
    const cells = line.split(";").map((c) => c.trim());
    if (cells[0].toLowerCase() === "nimi") continue; // otsikkorivi
    const [name, party, ...votes] = cells;
    if (!name) continue;
    if (votes.length !== QUESTIONS.length) {
      throw new Error(
        "Rivillä '" + name + "' on " + votes.length + " ääntä, mutta väitteitä on " +
        QUESTIONS.length + ".");
    }
    for (const v of votes) {
      if (!["k", "e", "o"].includes(v)) {
        throw new Error("Rivillä '" + name + "' tuntematon ääni '" + v + "' (sallitut: k, e, o).");
      }
    }
    out.push({ name, party, answers: votes });
  }
  return out;
}

(async () => {
  const csvPath = process.argv[2] ||
    path.join(__dirname, "valtuutetut.csv");
  const usedPath = fs.existsSync(csvPath)
    ? csvPath
    : path.join(__dirname, "valtuutetut.csv.esimerkki");
  if (usedPath.endsWith(".esimerkki")) {
    console.log("HUOM: " + csvPath + " puuttuu — käytetään esimerkkidataa.\n");
  }
  const candidates = parseCsv(fs.readFileSync(usedPath, "utf8"));
  const compass = { title: TITLE, desc: DESC, questions: QUESTIONS, candidates };
  const errs = V.validateCompass(compass);
  if (errs.length) { console.error("VIRHE:", errs.join(" ")); process.exit(1); }
  const code = await V.encodeCompass(compass);
  console.log("Valtuutettuja: " + candidates.length + ", väitteitä: " + QUESTIONS.length);
  console.log("Linkin pituus: " + (41 + code.length) + " merkkiä\n");
  console.log("https://dev.selainpelit.fi/vaalikone/#k=" + code);
})().catch((e) => { console.error("VIRHE:", e.message); process.exit(1); });
