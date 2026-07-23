#!/usr/bin/env node
// Oulun valtuustokauden 2025–2026 äänestyksiin perustuva RYHMÄTASON
// vaalikone. Generoi jakolinkin: node data/oulu-ryhmavaalikone.js
//
// Kannat on koottu uutislähteistä ryhmätasolla (ks. viitteet
// data/oulu-valtuusto-aanestykset-2025-2026.json). Jos ryhmän kantaa ei
// uutisoitu, se on "o" (ei kantaa) — engine jättää sen vertailun
// ulkopuolelle. HUOM: ryhmätason likiarvo, ei yksilötason data (esim.
// lähijunassa kolme kokoomuslaista äänesti ryhmänsä enemmistöä vastaan).
"use strict";
const V = require("../src/engine.js");

const compass = {
  title: "Oulun valtuusto 2025–2026: missä ryhmässä olisit ollut?",
  desc: "Väitteet perustuvat kaupunginvaltuuston oikeisiin äänestyksiin " +
    "kaudella 2025–2026. Ryhmien kannat on koottu uutislähteistä " +
    "(Yle, Kaleva, Mun Oulu, ouka.fi) ryhmätasolla; jos ryhmän kantaa ei " +
    "uutisoitu, se on merkitty ”ei kantaa” eikä vaikuta tulokseen. " +
    "Epävirallinen harjoitus — ei kata kaikkia äänestyksiä.",
  questions: [
    // 10.11.2025: kunnallisvero 7,9 -> 8,1 (vihr. esitti korotusta, kok. alennusta; 38–26 ja 36–30)
    "Kunnallisveron korotus 8,1 prosenttiin vuodelle 2026 oli oikea ratkaisu.",
    // 27.4.2026: lähijuna 59–8 (vastaan ps-ryhmä + 3 kok-valtuutettua)
    "Oulun oli oikein lähteä mukaan lähijunaliikenteen käynnistämiseen Kempeleen ja Limingan kanssa.",
    // 8.6.2026: palveluverkko, vastaesitykset kaatuivat (tyyp. 62–4), ps teki suurimman osan
    "Palveluverkon leikkaukset — koulujen, päiväkotien ja kirjastojen lakkautuksia — olivat välttämättömiä kaupungin talouden vuoksi.",
    // 18.5.2026: hyvinvointisuunnitelma, ps:n 12 muutosesitystä hylättiin
    "Hyvinvointisuunnitelma 2026–2029 oli hyvä sellaisenaan, ilman perussuomalaisten esittämiä muutoksia.",
  ],
  candidates: [
    { name: "Perussuomalaiset", party: "valtuustoryhmä", answers: ["o", "e", "e", "e"] },
    { name: "Kokoomus",         party: "valtuustoryhmä", answers: ["e", "k", "k", "k"] },
    { name: "Vihreät",          party: "valtuustoryhmä", answers: ["k", "k", "k", "k"] },
    { name: "Keskusta",         party: "valtuustoryhmä", answers: ["o", "k", "k", "k"] },
    { name: "SDP",              party: "valtuustoryhmä", answers: ["o", "k", "k", "k"] },
    { name: "Vasemmistoliitto", party: "valtuustoryhmä", answers: ["o", "k", "k", "k"] },
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
