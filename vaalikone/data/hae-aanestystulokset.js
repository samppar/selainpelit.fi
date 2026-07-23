#!/usr/bin/env node
// Hakee Oulun kaupunginvaltuuston pöytäkirjoista (asiakirjat.ouka.fi,
// KTweb-julkaisujärjestelmä) äänestysten KOKONAISLUKEMAT (jaa/ei/tyhjä/
// poissa) suoraan pöytäkirjatekstistä.
//
//   node data/hae-aanestystulokset.js [pvm1 pvm2]
//   (oletus pvm1=01.06.2025 pvm2=<tänään>)
//
// HUOM — tärkeä havainto (vahvistettu 23.7.2026 tätä skriptiä ajamalla):
// Oulun kaupunginvaltuuston (n. 67 jäsentä) äänestyksistä EI julkaista
// valtuutettukohtaista jaa/ei/tyhjä/poissa-nimilistaa tässä arkistossa.
// Pöytäkirjan päätösteksti sisältää AINA VAIN kokonaisluvut, esim.
// "Suoritetussa äänestyksessä äänet jakautuivat seuraavasti: JAA 61,
// EI 5, tyhjää 0, poissa 1." — ei ketään nimeltä. Tarkistettu käymällä
// läpi kaikki 63 pöytäkirja-asiaa neljästä kokouksesta (10.11.2025,
// 27.4.2026, 18.5.2026, 8.6.2026): 23 äänestystä, 0 nimilistaa. Myös
// asian liitteet (”N kpl” -linkit) on tarkistettu — mikään liite ei ole
// nimeltään "äänestysliite" tai sisällä nimitason ääniä.
// Poikkeus: kaupunginhallituksen (13 jäsentä) pöytäkirjoissa nimet
// mainitaan silloin tällöin proosassa (”äänin 7-6, JAA: Husso, ...”),
// koska ryhmä on niin pieni että se kirjataan sanallisesti — tämä EI
// koske valtuustoa.
//
// Tästä seuraa: data/valtuutetut-vaalikone.js (yksilötason vaalikone)
// ei voi täyttyä oikealla Oulun valtuustodatalla tästä lähteestä millään
// määrällä hakuyrityksiä — dataa ei yksinkertaisesti ole julkaistuna.
// Työkalu on silti hyödyllinen, jos joskus saa käsiinsä nimitason
// äänestysdatan muualta (esim. tietopyynnöllä kirjaamo@ouka.fi, tai
// toisen kunnan avoimemmasta järjestelmästä).
//
// Riippuvuudet: pdfjs-dist tekstinpurkuun (npm i --no-save pdfjs-dist).
// Ei tarvita headless-selainta — haku- ja listasivut ovat tavallista
// palvelinpuolen HTML:ää (KTweb), joten pelkkä HTTP GET/POST riittää.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

const BASE = "http://asiakirjat.ouka.fi";
const KV_TOIMIELIN = "695"; // Kaupunginvaltuusto
const OUT_DIR = process.env.OUT_DIR || path.join(__dirname, "aanestystulokset");

function isoToday() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(u, {
      method: opts.method || "GET",
      headers: opts.headers || {},
      timeout: 60000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchUrl(new URL(res.headers.location, url).toString(), opts));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function findMeetings(pvm1, pvm2) {
  const body = `oper=where&kirjaamo=${KV_TOIMIELIN}&pvm1=${encodeURIComponent(pvm1)}&pvm2=${encodeURIComponent(pvm2)}`;
  const buf = await fetchUrl(BASE + "/ktwebscr/pk_kokl_tweb.htm", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) },
    body,
  });
  const html = buf.toString("latin1");
  const re = /<td class="data">([\d.]+\.\d{4}) \d{1,2}:\d{2}<\/a>/g; // fallback unused
  const rowRe = /pk_asil_tweb\.htm\?bid=(\d+)">([\d.]+\.\d{4}) \d{1,2}:\d{2}<\/a>/g;
  const meetings = [];
  let m;
  while ((m = rowRe.exec(html))) meetings.push({ bid: m[1], date: m[2] });
  return meetings;
}

async function fetchAgenda(bid) {
  const buf = await fetchUrl(`${BASE}/ktwebscr/pk_asil_tweb.htm?bid=${bid}`);
  const html = buf.toString("latin1");
  const rowRe = /<tr class="data[01]">\s*<td class="data"\s*>([^<]*)<\/td>\s*<td class="data"\s*><a\s+href="\/ktwebscr\/fileshow\?doctype=3&docid=(\d+)">([^<]*)<\/a><\/td>/g;
  const items = [];
  let m;
  while ((m = rowRe.exec(html))) {
    items.push({ pykala: m[1].trim(), docid: m[2], title: m[3].trim() });
  }
  return items;
}

async function pdfToText(buf) {
  const root = path.join(__dirname, "..", "node_modules", "pdfjs-dist");
  const pdfjs = await import(path.join(root, "legacy/build/pdf.mjs"));
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buf),
    standardFontDataUrl: path.join(root, "standard_fonts") + path.sep,
  }).promise;
  let out = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let last = null;
    for (const it of tc.items) {
      const y = it.transform ? it.transform[5] : null;
      if (last !== null && y !== null && Math.abs(y - last) > 2) out += "\n";
      else if (out && !out.endsWith("\n")) out += " ";
      out += it.str;
      if (y !== null) last = y;
    }
    out += "\n\f\n";
  }
  return out;
}

// Poimi kaikki "JAA x, EI y[, tyhjää z][, poissa w]" -kokonaislukemat
// tekstistä, mahdollisesti useita per §  ("Äänestys 1: ... Äänestys 2: ...").
// Molemmat sanajärjestykset esiintyvät pöytäkirjoissa:
//   "JAA 61, EI 5"          (yleisin)
//   "61 JAA, ... 5 EI"      (esim. kun JAA/EI viittaavat nimettyihin esityksiin)
function parseTallies(text) {
  const out = [];
  const seen = new Set();
  const add = (jaa, ei, tyhja, poissa, nro) => {
    const key = `${jaa}|${ei}|${tyhja}|${poissa}`;
    if (seen.has(key)) return; // sama lukema löytyi molemmilla säännöillä
    seen.add(key);
    out.push({ aanestysNro: nro || out.length + 1, jaa: Number(jaa), ei: Number(ei),
      tyhja: tyhja !== undefined && tyhja !== null ? Number(tyhja) : null,
      poissa: poissa !== undefined && poissa !== null ? Number(poissa) : null });
  };
  const reA = /(?:Äänestys\s*(\d+)\s*:\s*)?(?:KH\s*)?JAA\s*(\d+)[,\s]+(?:[^E\n]{0,60}?)?EI\s*(\d+)(?:[,\s]+tyhj\w*\s*(\d+))?(?:[,\s]+poissa\s*(\d+))?/gi;
  let m;
  while ((m = reA.exec(text))) add(m[2], m[3], m[4], m[5], m[1] && Number(m[1]));
  const reB = /(\d+)\s*JAA[,\s]+(?:[^\d\n]{0,80}?)(\d+)\s*EI(?:[,\s]+tyhj\w*\s*(\d+))?(?:[,\s]+poissa\s*(\d+))?/gi;
  while ((m = reB.exec(text))) add(m[1], m[2], m[3], m[4]);
  out.sort((a, b) => a.aanestysNro - b.aanestysNro);
  return out;
}

(async () => {
  const pvm1 = process.argv[2] || "01.06.2025";
  const pvm2 = process.argv[3] || isoToday();
  console.log(`Haetaan kaupunginvaltuuston kokoukset ${pvm1}–${pvm2} ...`);
  const meetings = await findMeetings(pvm1, pvm2);
  console.log(`Löytyi ${meetings.length} kokousta.`);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const all = [];
  for (const mtg of meetings) {
    const items = await fetchAgenda(mtg.bid);
    const withVotes = [];
    for (const it of items) {
      let buf;
      const cacheFile = path.join(OUT_DIR, ".cache", `${it.docid}.pdf`);
      if (fs.existsSync(cacheFile)) {
        buf = fs.readFileSync(cacheFile);
      } else {
        try {
          buf = await fetchUrl(`${BASE}/ktwebscr/fileshow?doctype=3&docid=${it.docid}`);
          fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
          fs.writeFileSync(cacheFile, buf);
        } catch (e) { console.warn(`  ${it.docid} lataus epäonnistui: ${e.message}`); continue; }
      }
      if (buf.slice(0, 4).toString() !== "%PDF") continue;
      let text;
      try { text = await pdfToText(buf); } catch (e) { console.warn(`  ${it.docid} purku epäonnistui: ${e.message}`); continue; }
      if (!/äänestys|äänestet|äänin \d/i.test(text)) continue;
      const tallies = parseTallies(text);
      if (!tallies.length) continue;
      withVotes.push({
        pykala: it.pykala,
        title: it.title,
        docUrl: `${BASE}/ktwebscr/fileshow?doctype=3&docid=${it.docid}`,
        tallies,
      });
      console.log(`  ${mtg.date} §${it.pykala} ${it.title}: ${tallies.map((t) => `JAA ${t.jaa}-EI ${t.ei}`).join(", ")}`);
    }
    all.push({ date: mtg.date, bid: mtg.bid, items: withVotes });
  }

  fs.writeFileSync(path.join(OUT_DIR, "kaikki.json"), JSON.stringify(all, null, 2));
  const total = all.reduce((n, m) => n + m.items.length, 0);
  console.log(`\nÄänestyksiä joissa lukema löytyi: ${total} pykälässä. Tallennettu: ${path.join(OUT_DIR, "kaikki.json")}`);
  console.log("\nHUOM: nämä ovat KOKONAISLUKEMIA (jaa/ei/tyhjä/poissa), ei valtuutettukohtaisia ääniä —");
  console.log("tätä lähdettä (asiakirjat.ouka.fi) ei julkaista nimitasolla kaupunginvaltuuston osalta.");
})().catch((e) => { console.error("VIRHE:", e); process.exit(1); });
