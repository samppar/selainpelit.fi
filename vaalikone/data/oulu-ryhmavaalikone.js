#!/usr/bin/env node
// Oulun valtuustokauden 2025–2026 äänestyksiin perustuva RYHMÄTASON
// vaalikone. Generoi jakolinkin: node data/oulu-ryhmavaalikone.js
//
// Äänestyslukemat on tarkistettu suoraan pöytäkirjoista 23.7.2026
// (ks. data/oulu-valtuusto-aanestykset-2025-2026.md/.json,
// data/hae-aanestystulokset.js). Ryhmien/yksittäisten esittäjien nimet
// tulevat pöytäkirjasta; ryhmän KOKO kannan (kaikki jäsenet samaa mieltä)
// tulkinta on likiarvo — vahvistettu käymällä läpi kaikki 63 pöytäkirja-
// asiaa, että Oulun kv:n äänestyksistä ei julkaista valtuutettukohtaisia
// nimilistoja, vain kokonaisluvut. Jos ryhmän kantaa ei voi luotettavasti
// päätellä (esim. montako nimeämätöntä äänesti mukana), se on "o"
// (ei kantaa) — engine jättää sen vertailun ulkopuolelle.
"use strict";
const V = require("../src/engine.js");

const compass = {
  title: "Oulun valtuusto 2025–2026: missä ryhmässä olisit ollut?",
  desc: "Väitteet perustuvat kaupunginvaltuuston oikeisiin äänestyksiin " +
    "kaudella 2025–2026, tarkistettu pöytäkirjoista. Ryhmien kannat on " +
    "pääteltävissä nimetyistä esittäjistä ja äänimääristä; jos ryhmän " +
    "kantaa ei voi luotettavasti päätellä, se on merkitty ”ei kantaa” " +
    "eikä vaikuta tulokseen. Epävirallinen harjoitus — ei kata kaikkia " +
    "äänestyksiä.",
  questions: [
    // 10.11.2025 §83: kh:n pohja (pysyy 8,10 %) 61 JAA vs. Huotarin (ps.) 7,90 % 5 EI.
    // Vain Huotari+Törmi nimetty; muu ps. ei tiedossa varmasti.
    "Kunnallisveroprosentin olisi pitänyt laskea 7,90 prosenttiin vuodelle 2026 (Huotarin esitys) sen 8,10 prosentissa pitämisen sijaan.",
    // 27.4.2026 §24: lähijuna 59–8, vastaan ps-ryhmä (eriävä mielipide) + Huotari/Aittakumpu nimetty
    "Oulun oli oikein lähteä mukaan lähijunaliikenteen käynnistämiseen Kempeleen ja Limingan kanssa.",
    // 8.6.2026 §38-56: palveluverkko, vastaesitykset kaatuivat (tyyp. 62–4), Huotari/ps nimetty esittäjäksi useimmissa
    "Palveluverkon leikkaukset — koulujen, päiväkotien ja kirjastojen lakkautuksia — olivat välttämättömiä kaupungin talouden vuoksi.",
    // 18.5.2026 §35: hyvinvointisuunnitelma, Huotarin (ps.) 12 muutosesitystä hylättiin 58-61 JAA / 4 EI
    "Hyvinvointisuunnitelma 2026–2029 oli hyvä sellaisenaan, ilman perussuomalaisten esittämiä muutoksia.",
    // 30.3.2026 §13: kaupunkistrategia, Huotari+Haho 8 muutosesitystä (ilmasto/kestävyys-mainintojen poisto) hylättiin 62-63 JAA / 4-5 EI
    "Kaupunkistrategian ilmasto- ja kestävyystavoitteita ei pitänyt lieventää.",
  ],
  candidates: [
    { name: "Perussuomalaiset", party: "valtuustoryhmä", answers: ["o", "e", "e", "e", "e"] },
    { name: "Kokoomus",         party: "valtuustoryhmä", answers: ["e", "k", "k", "k", "k"] },
    { name: "Vihreät",          party: "valtuustoryhmä", answers: ["e", "k", "k", "k", "k"] },
    { name: "Keskusta",         party: "valtuustoryhmä", answers: ["e", "k", "k", "k", "k"] },
    { name: "SDP",              party: "valtuustoryhmä", answers: ["e", "k", "k", "k", "k"] },
    { name: "Vasemmistoliitto", party: "valtuustoryhmä", answers: ["e", "k", "k", "k", "k"] },
  ],
};

(async () => {
  const errs = V.validateCompass(compass);
  if (errs.length) { console.error("VIRHE:", errs.join(" ")); process.exit(1); }
  const code = await V.encodeCompass(compass);
  console.log("Vastaajalinkki (tuotanto, kun vaalikone on julkaistu):\n");
  console.log("https://selainpelit.fi/vaalikone/#k=" + code);
  console.log("\nPaikallinen testaus: npm run build && npx http-server -p 8080,");
  console.log("avaa http://localhost:8080/#k=" + code.slice(0, 24) + "…");
  console.log("\nVK-koodi (liitä muokkaimen ”Avaa olemassa oleva vaalikone” -kenttään):\n");
  console.log(code);
})();
