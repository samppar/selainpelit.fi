#!/usr/bin/env node
// Niputtaja ilman riippuvuuksia.
//
// Lukee pelin ytimen ja botit (samat ES-moduulitiedostot joita testit ja
// komentorivi käyttävät) ja tuottaa:
//   dist/tuppi.bundle.js   — pieni CommonJS-nippu (Node/other voi vaatia)
//   tuppi.html             — itsenäinen peli, jonka voi AVATA ILMAN PALVELINTA
//
// Näin botit, bottitestit ja selainpeli jakavat yhden ja saman lähteen:
// muokkaat bottia players/-kansiossa, ajat "node build.js", ja sekä testit
// (node eval.js) että selainpeli (tuppi.html) käyttävät samaa koodia.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Käännökseen otettavat moduulit. HumanPlayer jätetään pois (se käyttää
// node:fs:ää; selaimessa ihmisen syöte tulee DOM:sta).
const FILES = [
  "src/cards.js",
  "src/rules.js",
  "src/views.js",
  "src/player.js",
  "src/analysis.js",
  "src/sooliMatch.js",
  "src/engine.js",
  "src/index.js",
  "players/randomPlayer.js",
  "players/heuristicPlayer.js",
  "players/countingPlayer.js",
  "players/championPlayer.js",
  "players/codexPlayer.js",
  "players/strategyPlayer.js",
  "players/probabilityPlayer.js",
];

// --- ES-moduuli -> pieni CommonJS-muunnos ------------------------------ //
function transform(code) {
  const namedExports = [];
  const defaultExports = [];

  // import { a, b as c } from "P";  ->  const { a, b: c } = require("P");
  code = code.replace(
    /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?/g,
    (_m, names, p) => {
      const binds = names
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((n) => {
          const parts = n.split(/\s+as\s+/);
          return parts.length === 2 ? `${parts[0].trim()}: ${parts[1].trim()}` : n;
        })
        .join(", ");
      return `const { ${binds} } = require(${JSON.stringify(p)});`;
    },
  );

  // import X from "P";  ->  const X = require("P").default;
  code = code.replace(
    /import\s+(\w+)\s+from\s*["']([^"']+)["'];?/g,
    (_m, name, p) => `const ${name} = require(${JSON.stringify(p)}).default;`,
  );

  // export { a, b } from "P";  ->  kopioi nimet exports-olioon
  code = code.replace(
    /export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["'];?/g,
    (_m, names, p) => {
      const list = names.split(",").map((s) => s.trim()).filter(Boolean);
      const lines = list.map((n) => {
        const parts = n.split(/\s+as\s+/);
        const src = parts[0].trim();
        const dst = (parts[1] || parts[0]).trim();
        return `exports.${dst} = __x.${src};`;
      });
      return `{ const __x = require(${JSON.stringify(p)}); ${lines.join(" ")} }`;
    },
  );

  // export default function NAME  ->  function NAME  (+ exports.default)
  code = code.replace(/export\s+default\s+function\s+(\w+)/g, (_m, name) => {
    defaultExports.push(name);
    return `function ${name}`;
  });

  // export class/function NAME
  code = code.replace(/export\s+(class|function)\s+(\w+)/g, (_m, kind, name) => {
    namedExports.push(name);
    return `${kind} ${name}`;
  });

  // export const/let/var NAME
  code = code.replace(/export\s+(const|let|var)\s+(\w+)/g, (_m, kind, name) => {
    namedExports.push(name);
    return `${kind} ${name}`;
  });

  let footer = "\n";
  for (const n of namedExports) footer += `exports.${n} = ${n};\n`;
  for (const n of defaultExports) footer += `exports.default = ${n};\n`;
  return code + footer;
}

function buildBundle() {
  let out = "";
  out += "// AUTOMAATTISESTI TUOTETTU tiedostosta build.js — älä muokkaa käsin.\n";
  out += "(function (root) {\n";
  out += "  var __modules = {}, __cache = {};\n";
  out += "  function __norm(fromKey, rel) {\n";
  out += "    var dir = fromKey.split('/').slice(0, -1);\n";
  out += "    var parts = rel.split('/');\n";
  out += "    for (var i = 0; i < parts.length; i++) {\n";
  out += "      var p = parts[i];\n";
  out += "      if (p === '.' || p === '') continue;\n";
  out += "      if (p === '..') dir.pop(); else dir.push(p);\n";
  out += "    }\n";
  out += "    return dir.join('/');\n";
  out += "  }\n";
  out += "  function __load(key) {\n";
  out += "    if (__cache[key]) return __cache[key].exports;\n";
  out += "    var fn = __modules[key];\n";
  out += "    if (!fn) throw new Error('moduulia ei löydy: ' + key);\n";
  out += "    var module = { exports: {} };\n";
  out += "    __cache[key] = module;\n";
  out += "    var req = function (rel) { return __load(__norm(key, rel)); };\n";
  out += "    fn(module, module.exports, req);\n";
  out += "    return module.exports;\n";
  out += "  }\n\n";

  for (const rel of FILES) {
    const code = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const transformed = transform(code);
    out += `  __modules[${JSON.stringify(rel)}] = function (module, exports, require) {\n`;
    out += transformed.replace(/^/gm, "    ");
    out += "\n  };\n\n";
  }

  // Julkinen pinta: Tuppi.load(avain)
  out += "  var Tuppi = { load: __load, modules: Object.keys(__modules) };\n";
  out += "  if (typeof module !== 'undefined' && module.exports) module.exports = Tuppi;\n";
  out += "  root.Tuppi = Tuppi;\n";
  out += "})(typeof globalThis !== 'undefined' ? globalThis : this);\n";
  return out;
}

function buildHtml(bundle, appJs, css) {
  return `<!DOCTYPE html>
<html lang="fi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Neljän tuppi</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
<div id="app">
  <h1>Neljän tuppi <span class="sub">— pelaa botteja vastaan, ei palvelinta</span></h1>
  <div id="setup" class="panel">
    <label>Vastustajien taso:
      <select id="level">
        <option value="champion" selected>Mestari (kovin)</option>
        <option value="analyytikko">Analyytikko</option>
        <option value="codex">Codex</option>
        <option value="counting">Laskuri</option>
        <option value="seniori">Seniori</option>
        <option value="heuristic">Heuristi</option>
        <option value="random">Satku (helpoin)</option>
      </select>
    </label>
    <button id="start">Aloita jako</button>
  </div>
  <div id="board" class="hidden">
    <div id="score" class="scoreboard"></div>
    <div id="gametype" class="gametype"></div>
    <div id="tricks" class="tricks"></div>
    <div id="status" class="status"></div>
    <div id="table" class="table"></div>
    <div id="handLabel" class="handlabel"></div>
    <div id="hand" class="hand"></div>
    <details class="playedwrap">
      <summary>🂠 Pelatut kortit &amp; tyhjät maat</summary>
      <div id="played" class="played"></div>
    </details>
    <div id="log" class="log"></div>
  </div>
</div>
<script>
${bundle}
</script>
<script>
${appJs}
</script>
</body>
</html>
`;
}

const APP_JS = String.raw`
// --- Selainpeli: ihminen vs botit, sama ydin + samat botit kuin testeissä.
const T = globalThis.Tuppi;
const core = T.load("src/index.js");
const { Suit, deal, RNG, legalMoves, trickWinner, teamOf, partnerOf, opponentsOf, scoreDeal, scoreSooli, sooliTrickWinner, sooliRank, pickSooliRamaajaCard, pickSooliSoolaajaCard, estimateSooliSurvival, estimateSooliEV, suitSymbol } = core;
const cardStr = (c) => c.name + suitSymbol(c.suit);
const BOTS = {
  random: T.load("players/randomPlayer.js").default,
  heuristic: T.load("players/heuristicPlayer.js").default,
  counting: T.load("players/countingPlayer.js").default,
  champion: T.load("players/championPlayer.js").default,
  codex: T.load("players/codexPlayer.js").default,
  seniori: T.load("players/strategyPlayer.js").default,
  analyytikko: T.load("players/probabilityPlayer.js").default,
};
// Näkymäluokat samasta ytimestä (jotta botit saavat oikeat näkymät):
const views = T.load("src/views.js");
const { MatchState, ShowView, PlayView } = views;

const el = (id) => document.getElementById(id);
const SUIT_CLASS = { 0: "clubs", 1: "diamonds", 2: "hearts", 3: "spades" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Kädessä maat vuorotellen väreittäin, niin samanväriset maat eivät jää
// vierekkäin: risti(musta) hertta(puna) pata(musta) ruutu(puna).
const SUIT_ORDER = { 0: 0, 2: 1, 3: 2, 1: 3 };
const sortHand = (cards) =>
  [...cards].sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || b.rank - a.rank);

let humanResolver = null; // asetetaan kun odotetaan ihmisen korttia

function cardHTML(card, clickable) {
  const red = card.suit === Suit.DIAMONDS || card.suit === Suit.HEARTS;
  return '<span class="card ' + (red ? "red" : "black") + (clickable ? " playable" : "") +
    '" data-r="' + card.rank + '" data-s="' + card.suit + '">' +
    card.name + suitSymbol(card.suit) + "</span>";
}

function renderTable(trick, ledSuit) {
  // Oma paikka aina keskellä alhaalla; muut myötäpäivään. CSS asettaa
  // lapset ristiin: [ylä, oikea, ala, vasen] → [kaveri, +3, sinä, +1].
  const order = [(mySeat + 2) % 4, (mySeat + 3) % 4, mySeat, (mySeat + 1) % 4];
  const nameFor = (s) =>
    s === mySeat ? "Sinä" : teamOf(s) === teamOf(mySeat) ? "Kaveri" : "Vastustaja";
  const cells = order.map((s) => {
    const found = trick.find((p) => p[0] === s);
    const me = s === mySeat ? " me" : "";
    return '<div class="seatcell' + me + '"><div class="seatname">' + nameFor(s) +
      " · p" + s + "</div>" +
      (found ? cardHTML(found[1], false) : '<span class="empty">·</span>') + "</div>";
  });
  el("table").innerHTML = cells.join("");
}

function log(msg) {
  const l = el("log");
  l.innerHTML += msg + "<br>";
  l.scrollTop = l.scrollHeight;
}

let yourTeam = 0; // sinun joukkueesi (asetetaan jaon alussa paikan mukaan)
let mySeat = 0; // oma paikka — piirretään aina keskelle alas

// Puhu paikoista ja joukkueista sinuun nähden, ei numeroilla.
const seatName = (s) =>
  s === mySeat ? "Sinä" :
  s === (mySeat + 2) % 4 ? "Kaveri" :
  s === (mySeat + 1) % 4 ? "Vasen vastustaja" : "Oikea vastustaja";
const teamName = (t) => (t === yourTeam ? "Sinun joukkue" : "Vastustajat");

// Elävä kasalaskuri jaon aikana: montako tikkiä kummallakin joukkueella.
function renderTricks(t, gameType) {
  const mine = t[yourTeam] || 0;
  const opp = t[1 - yourTeam] || 0;
  const goal = gameType === "rami" ? " (voittoon yli 6)" : gameType === "nolo" ? " (vältä)" : gameType === "sooli" ? " (et saa ottaa yhtään)" : "";
  el("tricks").innerHTML =
    '<span class="tklabel">Kasat</span> Sinun joukkue <b>' + mine +
    "</b> – Vastustajat <b>" + opp + "</b>" +
    '<span class="tkgoal">' + goal + "</span>";
}

// Muistiapu: mitä kukin on pelannut ja mistä maasta on jo tyhjä (∅).
const RANKSTR = { 14: "A", 13: "K", 12: "Q", 11: "J" };
const rankStr = (r) => RANKSTR[r] || r;
const PLSUIT = { 0: "♣", 1: "♦", 2: "♥", 3: "♠" };
const PLRED = { 1: true, 2: true };
const seatShort = (s) =>
  s === mySeat ? "Sinä" :
  s === (mySeat + 2) % 4 ? "Kaveri" :
  s === (mySeat + 1) % 4 ? "Vasen" : "Oikea";

function renderPlayed(history, currentTrick) {
  const played = { 0: {}, 1: {}, 2: {}, 3: {} };
  const voids = { 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set() };
  const tricks = currentTrick && currentTrick.length ? history.concat([currentTrick]) : history;
  let any = false;
  for (const trick of tricks) {
    if (!trick.length) continue;
    any = true;
    const led = trick[0][1].suit;
    for (const [seat, card] of trick) {
      (played[seat][card.suit] = played[seat][card.suit] || []).push(card.rank);
      if (card.suit !== led) voids[seat].add(led);
    }
  }
  if (!any) { el("played").innerHTML = '<div class="plempty">Ei vielä pelattuja kortteja.</div>'; return; }
  const rows = [mySeat, (mySeat + 2) % 4, (mySeat + 1) % 4, (mySeat + 3) % 4];
  let html = '<table class="pltable"><thead><tr><th></th>';
  for (const s of [0, 1, 2, 3]) html += '<th class="' + (PLRED[s] ? "plred" : "") + '">' + PLSUIT[s] + "</th>";
  html += "</tr></thead><tbody>";
  for (const seat of rows) {
    html += '<tr><th class="plseat">' + seatShort(seat) + "</th>";
    for (const s of [0, 1, 2, 3]) {
      const ranks = (played[seat][s] || []).slice().sort((a, b) => b - a).map(rankStr).join(" ");
      const isVoid = voids[seat].has(s);
      const cls = (PLRED[s] ? "plred " : "") + (isVoid ? "plvoid" : "");
      const content = (ranks + (isVoid ? " ∅" : "")).trim() || "·";
      html += '<td class="' + cls.trim() + '">' + content + "</td>";
    }
    html += "</tr>";
  }
  html += "</tbody></table>";
  el("played").innerHTML = html;
}

// Näytä pelimuoto ja kuka ramasi (ja onko se sinä, kaverisi vai vastustaja).
function renderGameType(gameType, ramaaja, humanSeat) {
  if (gameType !== "rami" || ramaaja === null) {
    el("gametype").innerHTML = '<span class="gt-nolo">NOLO</span> — kaikki nolasivat';
    return;
  }
  const rel =
    ramaaja === humanSeat ? "sinä" :
    teamOf(ramaaja) === teamOf(humanSeat) ? "kaverisi" : "vastustaja";
  el("gametype").innerHTML =
    '<span class="gt-rami">RAMI</span> — ramasi: paikka ' + ramaaja + " (" + rel + ")";
}

// Pysyvä tilannenäyttö. Play-to-52-pelissä voitto tulee yhtäjaksoisesta
// noususta ≥ 52, joten pääpaino on siinä — ei kumulatiivisessa pankissa.
function renderScore() {
  const ms = matchState;
  let situ;
  if (ms.upTeam === null) {
    situ = "Pöytäpeli — ei nousua";
  } else {
    const who = ms.upTeam === yourTeam ? "Sinun joukkue" : "Vastustaja";
    situ = who + " nousulla — " + ms.upScore + " / 52";
  }
  let html =
    '<div class="scitem"><span class="sclabel">Jako</span><span class="scval">' + ms.dealNumber + "</span></div>" +
    '<div class="scitem" style="flex:2 1 14rem"><span class="sclabel">Tilanne</span><span class="scval">' + situ + "</span></div>";
  if (ms.lastDrop) {
    html +=
      '<div class="scitem"><span class="sclabel">Edellinen</span>' +
      '<span class="scval scdrop">' + ms.lastDrop + "</span></div>";
  }
  el("score").innerHTML = html;
}

// Ihmispelaaja joka odottaa klikkausta (Promise).
class BrowserHuman {
  constructor(name) { this.name = name; }
  chooseShow() { return "nolo"; } // yksinkertaisuuden vuoksi ihminen pelaa noloa/ramia botin logiikalla alla
  playCard(view) {
    return new Promise((resolve) => {
      humanResolver = resolve;
      renderHand(view);
      el("handLabel").textContent = view.wantToWinTricks
        ? "RAMI — kerää kasoja. Valitse kortti:"
        : "NOLO — vältä kasoja. Valitse kortti:";
    });
  }
}

function renderHand(view) {
  const legal = new Set(view.legalMoves);
  const sorted = sortHand(view.hand);
  el("hand").innerHTML = sorted.map((c) => cardHTML(c, legal.has(c))).join("");
  el("hand").querySelectorAll(".card.playable").forEach((node) => {
    node.onclick = () => {
      const r = +node.dataset.r, s = +node.dataset.s;
      const card = view.legalMoves.find((c) => c.rank === r && c.suit === s);
      if (card && humanResolver) {
        const res = humanResolver; humanResolver = null;
        el("hand").innerHTML = ""; el("handLabel").textContent = "";
        res(card);
      }
    };
  });
}

// Yhden jaon interaktiivinen ajo (ihminen + botit) samalla säännöstöllä.
async function playInteractiveDeal(humanSeat, level, rng, mstate) {
  // Rakenna pelaajat: ihminen omalle paikalleen, botit muualle.
  const players = [];
  for (let s = 0; s < 4; s++) {
    players.push(s === humanSeat ? new BrowserHuman("Sinä") : BOTS[level]());
  }
  const hands = deal(rng);

  // Tyhjennä pöytä ja edellisen jaon jäljet ENNEN näyttöä/soolia, jottei
  // edellisen jaon viimeinen tikki jää näkyviin ramaus-/soolipäätöksen ajaksi.
  el("table").innerHTML = "";
  el("played").innerHTML = "";
  el("status").textContent = "";

  // Näyttö: jakajasta seuraava, ensimmäinen "rami" ratkaisee.
  const dealer = mstate.dealer;
  const first = (dealer + 1) % 4;
  let gameType = "nolo", ramaaja = null, leader = first;
  for (let i = 0; i < 4; i++) {
    const seat = (first + i) % 4;
    const sv = new ShowView({ seat, hand: hands[seat], match: mstate });
    let choice = seat === humanSeat ? await askHumanShow(hands[seat]) : players[seat].chooseShow(sv);
    if (choice === "rami") { gameType = "rami"; ramaaja = seat; leader = (seat + 3) % 4; break; }
  }
  log("<b>Näyttö:</b> " + gameType.toUpperCase() + (ramaaja !== null ? " — ramaaja: " + seatName(ramaaja) : "") + ", aloittaa " + seatName(leader));
  renderGameType(gameType, ramaaja, humanSeat);

  // Rami-näytön jälkeen sooli on mahdollinen.
  if (gameType === "rami" && ramaaja !== null) {
    if (teamOf(humanSeat) !== teamOf(ramaaja)) {
      // Ihminen on puolustaja -> voi itse lähteä sooliin.
      const wantSooli = await askHumanSooli(hands[humanSeat], mstate, teamOf(humanSeat), teamOf(ramaaja));
      if (wantSooli) return await playSooliDeal(humanSeat, hands, players, ramaaja, mstate);
    } else {
      // Ihminen on ramaajan puolella -> puolustajabotti voi lähteä sooliin,
      // jolloin ihminen pelaa ramaajana soolaajaa vastaan.
      const defenders = opponentsOf(ramaaja);
      const defTeam = teamOf(defenders[0]);
      for (let i = 0; i < 4; i++) {
        const seat = (ramaaja + 1 + i) % 4;
        if (defenders.includes(seat) && botWantsSooli(hands[seat], mstate, defTeam, teamOf(ramaaja))) {
          return await playBotSooliDeal(humanSeat, hands, players, ramaaja, seat, mstate);
        }
      }
    }
  }

  const tricksByTeam = { 0: 0, 1: 0 };
  renderTricks(tricksByTeam, gameType);
  const history = [];
  let current = leader;
  for (let tn = 0; tn < 13; tn++) {
    const trick = [];
    let ledSuit = null;
    for (let j = 0; j < 4; j++) {
      const seat = (current + j) % 4;
      const moves = legalMoves(hands[seat], ledSuit);
      const pv = new PlayView({
        seat, hand: hands[seat], legalMoves: moves, gameType, ramaaja,
        leader: current, currentTrick: trick, ledSuit, trickNumber: tn,
        tricksByTeam, history, match: mstate,
      });
      el("status").textContent = "Jako " + mstate.dealNumber + " · kasa " + (tn + 1) +
        "/13 · vuorossa " + seatName(seat);
      renderTable(trick, ledSuit);
      renderPlayed(history, trick);
      let card = seat === humanSeat ? await players[seat].playCard(pv) : players[seat].playCard(pv);
      if (seat !== humanSeat) await sleep(250);
      const idx = hands[seat].indexOf(card);
      hands[seat].splice(idx, 1);
      if (ledSuit === null) ledSuit = card.suit;
      trick.push([seat, card]);
      renderTable(trick, ledSuit);
      renderPlayed(history, trick);
    }
    const w = trickWinner(trick);
    tricksByTeam[teamOf(w)] += 1;
    renderTricks(tricksByTeam, gameType);
    history.push(trick);
    log("Kasa " + (tn + 1) + ": " + trick.map((p) => seatName(p[0]) + " " + p[1].name + suitSymbol(p[1].suit)).join(", ") +
      " → " + seatName(w) + " voitti (" + teamName(teamOf(w)) + ")");
    current = w;
    await sleep(400);
  }
  const rt = ramaaja !== null ? teamOf(ramaaja) : null;
  const { winner, points, steal } = scoreDeal(tricksByTeam, gameType, rt);
  log("<b>Kasat:</b> " + teamName(yourTeam) + " " + tricksByTeam[yourTeam] + " – Vastustajat " + tricksByTeam[1 - yourTeam] +
    " → voittaja: " + teamName(winner) + " (+" + points + "p)" + (steal ? " [RYÖSTÖ!]" : ""));
  return { winner, points, tricksByTeam };
}

// Yleinen "valitse kortti" ihmiselle mielivaltaisella ohjetekstillä.
function askHumanPlay(view, labelText) {
  return new Promise((resolve) => {
    humanResolver = resolve;
    renderHand(view);
    el("handLabel").textContent = labelText;
  });
}

// Sooli-tarjous: vastustaja ramasi, kysy haluaako ihminen pelata soolon.
// Näyttää arvioidun selviämistodennäköisyyden ja ottelutilanteen (nousulla?).
function askHumanSooli(hand, mstate, myTeam, oppTeam) {
  return new Promise((resolve) => {
    const ev = estimateSooliEV(hand, mstate, myTeam, oppTeam);
    const surv = Math.round(ev.pSurvive * 100);
    let tilanne;
    if (mstate.upTeam === myTeam)
      tilanne = "<b>Olette nousulla (" + mstate.upScore + "/52)</b> — häviö pudottaa teidät nollaan, joten sooli on riski.";
    else if (mstate.upTeam === oppTeam)
      tilanne = "<b>Vastustaja on nousulla (" + mstate.upScore + "/52)</b> — sooli-voitto pudottaa heidät!";
    else
      tilanne = "Pöytäpeli — sooli-voitto aloittaa teidän nousun.";
    const suositus = ev.recommend
      ? '<b style="color:var(--gold)">Sooli näyttää kannattavan.</b>'
      : "Puolustus näyttää turvallisemmalta.";
    el("handLabel").innerHTML =
      "Vastustaja <b>ramasi</b>. Haluatko pelata <b>soolon</b> — yksin heitä vastaan? " +
      "Vaihdat yhden kortin kaverisi kanssa, ässä on pienin ja pelaat aina viimeisenä. " +
      "<b>Et saa ottaa yhtään tikkiä</b>: onnistut → +24p, epäonnistut → vastustajille 24p.<br>" +
      "Arvioitu selviäminen <b>~" + surv + "%</b>. Odotusarvo: sooli <b>" + ev.evSooli.toFixed(1) +
      "p</b> vs. puolustus <b>" + ev.evDefense.toFixed(1) + "p</b>. " + suositus + " " + tilanne +
      "<br><b>Kätesi:</b>";
    // Näytä käsi + päätösnapit (ennen nappeja peittivät kortit kokonaan).
    el("hand").innerHTML =
      sortHand(hand).map((c) => cardHTML(c, false)).join("") +
      '<div class="showbtns">' +
      '<button id="sooliYes">Pelaa sooli</button>' +
      '<button id="sooliNo" class="ghost">Ei, pelaa normaalisti</button></div>';
    const done = (v) => { el("hand").innerHTML = ""; el("handLabel").textContent = ""; resolve(v); };
    el("sooliYes").onclick = () => done(true);
    el("sooliNo").onclick = () => done(false);
  });
}

// Soolaaja antaa yhden kortin parilleen (klikkaa se).
function askHumanSooliGift(hand) {
  return new Promise((resolve) => {
    el("handLabel").innerHTML =
      "<b>SOOLI</b> — valitse kortti jonka <b>annat kaverillesi</b> (saat matalan tilalle):";
    el("hand").innerHTML = sortHand(hand).map((c) => cardHTML(c, true)).join("");
    el("hand").querySelectorAll(".card.playable").forEach((node) => {
      node.onclick = () => {
        const r = +node.dataset.r, s = +node.dataset.s;
        const card = hand.find((c) => c.rank === r && c.suit === s);
        el("hand").innerHTML = ""; el("handLabel").textContent = "";
        resolve(card);
      };
    });
  });
}

/** Näytä kortinvaihdon tulos: mitä annoit, mitä sait — odota "Jatka". */
function showSooliExchange(gift, received, handAfter) {
  return new Promise((resolve) => {
    const highlight = (c) =>
      '<span class="card ' +
      ((c.suit === Suit.DIAMONDS || c.suit === Suit.HEARTS) ? "red" : "black") +
      ' exchange-card">' + c.name + suitSymbol(c.suit) + "</span>";
    el("handLabel").innerHTML =
      "<b>Kortinvaihto</b> — annoit kaverillesi " + highlight(gift) +
      " ja sait häneltä " + highlight(received) + ".<br>" +
      "<b>Uusi kätesi</b> (saatu kortti korostettu):";
    el("hand").innerHTML =
      sortHand(handAfter).map((c) => {
        const isNew = c === received || (c.rank === received.rank && c.suit === received.suit);
        return cardHTML(c, false).replace(
          'class="card ',
          'class="card ' + (isNew ? "got-card " : ""),
        );
      }).join("") +
      '<div class="showbtns"><button id="sooliCont">Jatka sooliin</button></div>';
    el("sooliCont").onclick = () => {
      el("hand").innerHTML = "";
      el("handLabel").textContent = "";
      resolve();
    };
  });
}

// Yhden sooli-jaon interaktiivinen ajo: ihminen (soolaaja) yksin kahta
// ramaajabottia vastaan. Ässä pienin, soolaaja viimeisenä, pari ei pelaa.
async function playSooliDeal(humanSeat, hands, players, ramaaja, mstate) {
  const soolaaja = humanSeat;
  const soolPartner = partnerOf(soolaaja);
  const otherRamaaja = partnerOf(ramaaja);

  // Kortinvaihto: ihminen antaa kortin, pari palauttaa matalimman (paras duunikortti).
  const gift = await askHumanSooliGift(hands[soolaaja]);
  const ret = [...hands[soolPartner]].sort((a, b) => sooliRank(a) - sooliRank(b))[0];
  hands[soolaaja].splice(hands[soolaaja].indexOf(gift), 1); hands[soolaaja].push(ret);
  hands[soolPartner].splice(hands[soolPartner].indexOf(ret), 1); hands[soolPartner].push(gift);
  log("<b>Sooli!</b> Annoit kaverillesi " + cardStr(gift) + " ja sait " + cardStr(ret) + ". Kaverisi ei pelaa.");
  await showSooliExchange(gift, ret, hands[soolaaja]);
  el("gametype").innerHTML = '<span class="gt-sooli">SOOLI</span> — sinä yksin ramaajia vastaan (ässä pienin, pelaat viimeisenä)';

  const tricksByTeam = { 0: 0, 1: 0 };
  renderTricks(tricksByTeam, "sooli");
  const history = [];
  let leader = ramaaja; // ramaaja aloittaa
  let soolaajaTook = false;

  for (let tn = 0; tn < 13; tn++) {
    const order = leader === ramaaja ? [ramaaja, otherRamaaja, soolaaja] : [otherRamaaja, ramaaja, soolaaja];
    const trick = [];
    let ledSuit = null;
    for (const seat of order) {
      const moves = legalMoves(hands[seat], ledSuit);
      const pv = new PlayView({
        seat, hand: hands[seat], legalMoves: moves, gameType: "rami", ramaaja,
        leader, currentTrick: trick, ledSuit, trickNumber: tn,
        tricksByTeam, history, match: mstate, sooli: true, soolaaja,
      });
      el("status").textContent = "SOOLI · tikki " + (tn + 1) + "/13 · vuorossa " + seatName(seat);
      renderTable(trick, ledSuit);
      renderPlayed(history, trick);
      let card = seat === soolaaja
        ? await askHumanPlay(pv, "SOOLI — ÄLÄ ota tikkiä (ässä on pienin). Valitse kortti:")
        : pickSooliRamaajaCard(pv);
      if (seat !== soolaaja) await sleep(250);
      hands[seat].splice(hands[seat].indexOf(card), 1);
      if (ledSuit === null) ledSuit = card.suit;
      trick.push([seat, card]);
      renderTable(trick, ledSuit);
      renderPlayed(history, trick);
    }
    const w = sooliTrickWinner(trick);
    tricksByTeam[teamOf(w)] += 1;
    renderTricks(tricksByTeam, "sooli");
    history.push(trick);
    log("Tikki " + (tn + 1) + ": " + trick.map((p) => seatName(p[0]) + " " + cardStr(p[1])).join(", ") + " → " + seatName(w) + " voitti");
    await sleep(400);
    if (w === soolaaja) { soolaajaTook = true; log("<b>Otit tikin — sooli kaatui!</b>"); break; }
    leader = w;
  }

  const { winner, points } = scoreSooli(teamOf(soolaaja), teamOf(ramaaja), soolaajaTook);
  log("<b>Sooli:</b> " + (soolaajaTook ? "otit tikin → Vastustajat" : "selvisit tikeittä → Sinun joukkue") + " +" + points + "p");
  el("status").textContent = "Sooli päättyi.";
  return { winner, points, tricksByTeam };
}

// Päättääkö puolustajabotti lähteä sooliin? Vertaa soolin ODOTUSARVOA
// normaalin rami-puolustuksen odotusarvoon (huomioi nousutilanteen).
function botWantsSooli(hand, mstate, myTeam, oppTeam) {
  return estimateSooliEV(hand, mstate, myTeam, oppTeam).recommend;
}

// Sooli-jako jossa BOTTI soolaa ja ihminen pelaa RAMAAJANA (pakota tikki).
async function playBotSooliDeal(humanSeat, hands, players, ramaaja, soolaaja, mstate) {
  const soolPartner = partnerOf(soolaaja);
  const otherRamaaja = partnerOf(ramaaja);
  // Kortinvaihto piilossa (kortteja ei näytetä): botti antaa korkein, pari palauttaa pienin.
  const gift = [...hands[soolaaja]].sort((a, b) => sooliRank(b) - sooliRank(a))[0];
  const ret = [...hands[soolPartner]].sort((a, b) => sooliRank(a) - sooliRank(b))[0];
  hands[soolaaja].splice(hands[soolaaja].indexOf(gift), 1); hands[soolaaja].push(ret);
  hands[soolPartner].splice(hands[soolPartner].indexOf(ret), 1); hands[soolPartner].push(gift);
  log("<b>Sooli!</b> " + seatName(soolaaja) + " lähti soolaamaan yksin — sinä ja " + seatName(otherRamaaja) + " (ramaajat) yritätte pakottaa hänet tikkiin.");
  el("gametype").innerHTML = '<span class="gt-sooli">SOOLI</span> — ' + seatName(soolaaja) + " soolaa; pakota hänet ottamaan tikki (ässä pienin)";

  const tricksByTeam = { 0: 0, 1: 0 };
  renderTricks(tricksByTeam, "sooli");
  const history = [];
  let leader = ramaaja;
  let soolaajaTook = false;

  for (let tn = 0; tn < 13; tn++) {
    const order = leader === ramaaja ? [ramaaja, otherRamaaja, soolaaja] : [otherRamaaja, ramaaja, soolaaja];
    const trick = [];
    let ledSuit = null;
    for (const seat of order) {
      const moves = legalMoves(hands[seat], ledSuit);
      const pv = new PlayView({
        seat, hand: hands[seat], legalMoves: moves, gameType: "rami", ramaaja,
        leader, currentTrick: trick, ledSuit, trickNumber: tn,
        tricksByTeam, history, match: mstate, sooli: true, soolaaja,
      });
      el("status").textContent = "SOOLI · tikki " + (tn + 1) + "/13 · vuorossa " + seatName(seat);
      renderTable(trick, ledSuit);
      renderPlayed(history, trick);
      let card = seat === humanSeat
        ? await askHumanPlay(pv, "SOOLI (olet ramaaja) — PAKOTA soolaaja tikkiin: pelaa matalaa (ässä pienin). Valitse kortti:")
        : seat === soolaaja ? pickSooliSoolaajaCard(pv) : pickSooliRamaajaCard(pv);
      if (seat !== humanSeat) await sleep(250);
      hands[seat].splice(hands[seat].indexOf(card), 1);
      if (ledSuit === null) ledSuit = card.suit;
      trick.push([seat, card]);
      renderTable(trick, ledSuit);
      renderPlayed(history, trick);
    }
    const w = sooliTrickWinner(trick);
    tricksByTeam[teamOf(w)] += 1;
    renderTricks(tricksByTeam, "sooli");
    history.push(trick);
    log("Tikki " + (tn + 1) + ": " + trick.map((p) => seatName(p[0]) + " " + cardStr(p[1])).join(", ") + " → " + seatName(w) + " voitti");
    await sleep(400);
    if (w === soolaaja) { soolaajaTook = true; log("<b>Soolaaja otti tikin — te voititte!</b>"); break; }
    leader = w;
  }

  const { winner, points } = scoreSooli(teamOf(soolaaja), teamOf(ramaaja), soolaajaTook);
  log("<b>Sooli:</b> " + (soolaajaTook ? "pakotitte soolaajan tikkiin → Sinun joukkue" : "soolaaja selvisi tikeittä → Vastustaja") + " +" + points + "p");
  el("status").textContent = "Sooli päättyi.";
  return { winner, points, tricksByTeam };
}

function askHumanShow(hand) {
  return new Promise((resolve) => {
    const sorted = sortHand(hand);
    el("handLabel").innerHTML =
      "Näytä kortti kädestäsi (jää käteesi): " +
      "<b style=\"color:var(--red)\">punainen = RAMI</b> (kerää), " +
      "<b>musta = NOLO</b> (vältä).";
    // Kuten virallisesti: näytetään oikea pakan kortti, väri kertoo tarjouksen.
    el("hand").innerHTML = sorted.map((c) => cardHTML(c, true)).join("");
    el("hand").querySelectorAll(".card.playable").forEach((node) => {
      node.onclick = () => {
        const s = +node.dataset.s;
        const red = s === Suit.DIAMONDS || s === Suit.HEARTS;
        cleanup();
        resolve(red ? "rami" : "nolo");
      };
    });
    function cleanup() { el("hand").innerHTML = ""; el("handLabel").textContent = ""; }
  });
}

let matchState = { upTeam: null, upScore: 0, banked: { 0: 0, 1: 0 }, dealNumber: 0 };
let rng = null;

el("start").onclick = async () => {
  const level = el("level").value;
  const humanSeat = 0; // paikan valinta poistettu — pelaaja istuu aina paikalla 0
  yourTeam = teamOf(humanSeat);
  mySeat = humanSeat;
  if (!rng) rng = new RNG((Math.random() * 1e9) | 0);
  el("setup").classList.add("hidden");
  el("board").classList.remove("hidden");
  matchState.dealNumber += 1;
  const dealer = (matchState.dealNumber - 1) % 4;
  const mstate = new MatchState({
    dealNumber: matchState.dealNumber, dealer,
    upTeam: matchState.upTeam, upScore: matchState.upScore,
    banked: { ...matchState.banked }, target: 52,
  });
  renderScore();
  el("gametype").innerHTML = "";
  el("tricks").innerHTML = "";
  el("played").innerHTML = "";
  log("<hr><b>— Jako " + matchState.dealNumber + " (jakaja: " + seatName(dealer) + ") —</b>");
  const res = await playInteractiveDeal(humanSeat, level, rng, mstate);

  // Nousu/tuppi (sama sääntö kuin engine.js).
  const prevUp = matchState.upTeam, prevScore = matchState.upScore;
  if (matchState.upTeam === null) { matchState.upTeam = res.winner; matchState.upScore = res.points; matchState.banked[res.winner] += res.points; }
  else if (matchState.upTeam === res.winner) { matchState.upScore += res.points; matchState.banked[res.winner] += res.points; }
  else { matchState.upTeam = null; matchState.upScore = 0; }

  // Romahdus: nousulla ollut joukkue hävisi → putosi nollille.
  matchState.lastDrop =
    prevUp !== null && res.winner !== prevUp
      ? (prevUp === yourTeam ? "sinun joukkue" : "vastustaja") + " putosi " + prevScore + "→0"
      : "";

  renderScore();
  const upStr = matchState.upTeam === null
    ? "pöytäpeli — ei nousua"
    : teamName(matchState.upTeam) + " nousulla " + matchState.upScore + "/52";
  log("<b>Tilanne:</b> " + upStr + (matchState.lastDrop ? " · " + matchState.lastDrop : ""));
  el("status").textContent = "Jako päättyi.";

  if (matchState.upScore >= 52) {
    log("<b>*** TUPPI! Joukkue " + matchState.upTeam + " voitti ottelun. ***</b>");
    el("board").insertAdjacentHTML("beforeend", '<button onclick="location.reload()">Uusi ottelu</button>');
  } else {
    el("setup").classList.remove("hidden");
    el("start").textContent = "Pelaa seuraava jako";
  }
};
`;

const CSS = String.raw`
:root {
  color-scheme: dark;
  --bg: #0b1410;
  --ink: #eef2ee;
  --muted: #9fb3a6;
  --line: rgba(255,255,255,.08);
  --felt-1: #1f6f4c;
  --felt-2: #124a32;
  --gold: #e8c15a;
  --gold-soft: rgba(232,193,90,.5);
  --glass: rgba(20,32,26,.72);
  --red: #d1274b;
  --black: #1a2028;
}
* { box-sizing: border-box; }
body {
  font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  margin: 0; padding: clamp(1rem, 3vw, 2.2rem); color: var(--ink);
  background:
    radial-gradient(1200px 700px at 50% -10%, #123a2a 0%, transparent 60%),
    radial-gradient(900px 900px at 110% 120%, #0e2a1f 0%, transparent 55%),
    var(--bg);
  min-height: 100vh; -webkit-font-smoothing: antialiased;
}
#app { max-width: 820px; margin: 0 auto; }
h1 {
  font-family: "Fraunces", Georgia, serif; font-weight: 600;
  font-size: clamp(1.7rem, 4vw, 2.4rem); letter-spacing: -.01em;
  margin: 0 0 1.4rem; line-height: 1.1;
}
h1 .sub { display: block; font-family: "Inter", sans-serif; font-size: .82rem;
  font-weight: 500; letter-spacing: .04em; text-transform: uppercase;
  color: var(--muted); margin-top: .4rem; }

.panel {
  display: flex; gap: 1rem; flex-wrap: wrap; align-items: end;
  background: var(--glass); backdrop-filter: blur(8px);
  padding: 1.1rem 1.2rem; border-radius: 16px; margin-bottom: 1.2rem;
  border: 1px solid var(--line); box-shadow: 0 10px 30px rgba(0,0,0,.35);
}
label { display: flex; flex-direction: column; font-size: .72rem;
  font-weight: 600; letter-spacing: .05em; text-transform: uppercase;
  gap: .4rem; color: var(--muted); }
select, button { font: inherit; padding: .55rem .8rem; border-radius: 10px;
  border: 1px solid var(--line); background: rgba(0,0,0,.25); color: var(--ink);
  font-size: .95rem; text-transform: none; letter-spacing: 0; font-weight: 500; }
select:focus, button:focus-visible { outline: 2px solid var(--gold-soft); outline-offset: 2px; }
button {
  background: linear-gradient(180deg, #f2d074, var(--gold)); border: none;
  color: #2a1e00; cursor: pointer; font-weight: 700; letter-spacing: .01em;
  box-shadow: 0 4px 14px rgba(232,193,90,.28); transition: transform .12s, box-shadow .12s, filter .12s;
}
button:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(232,193,90,.4); filter: brightness(1.03); }
button:active { transform: translateY(0); }
.hidden { display: none; }

.scoreboard {
  display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: .9rem;
}
.scitem {
  display: flex; flex-direction: column; gap: .15rem; flex: 1 1 auto;
  min-width: 8rem; background: var(--glass); border: 1px solid var(--line);
  border-radius: 12px; padding: .5rem .8rem;
}
.sclabel {
  font-size: .6rem; font-weight: 700; letter-spacing: .12em;
  text-transform: uppercase; color: var(--muted);
}
.scval { font-size: .95rem; font-weight: 600; font-variant-numeric: tabular-nums; }
.gametype { font-size: .95rem; font-weight: 600; margin-bottom: .7rem; min-height: 1.2em; }
.gametype:empty { margin: 0; min-height: 0; }
.tricks {
  font-size: .95rem; font-weight: 600; color: var(--ink);
  margin-bottom: .6rem; font-variant-numeric: tabular-nums;
}
.tricks:empty { display: none; }
.tricks b { color: var(--gold); font-size: 1.05rem; }
.tklabel {
  font-size: .62rem; font-weight: 700; letter-spacing: .12em;
  text-transform: uppercase; color: var(--muted); margin-right: .5rem;
}
.tkgoal { color: var(--muted); font-weight: 400; font-size: .8rem; margin-left: .35rem; }
.gt-rami, .gt-nolo {
  font-weight: 800; letter-spacing: .05em; padding: .1rem .5rem;
  border-radius: 999px; font-size: .82rem;
}
.gt-rami { background: rgba(209,39,75,.18); color: #ff6b8a; }
.gt-nolo { background: rgba(255,255,255,.1); color: var(--ink); }
.gt-sooli { background: rgba(232,193,90,.2); color: var(--gold); }
button.ghost {
  background: rgba(0,0,0,.25); color: var(--ink); border: 1px solid var(--line);
  box-shadow: none; font-weight: 600;
}
button.ghost:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,.3); filter: none; }
.status {
  font-size: .82rem; letter-spacing: .03em; color: var(--muted);
  margin-bottom: .8rem; min-height: 1.2em; font-variant-numeric: tabular-nums;
}

/* Pöytä: neljä paikkaa ristin muotoon (0 ylä, 1 oikea, 2 ala, 3 vasen). */
.table {
  display: grid; grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, auto); gap: .5rem; place-items: center;
  border-radius: 20px; padding: 1.4rem; margin-bottom: 1.4rem; min-height: 260px;
  background:
    radial-gradient(120% 120% at 50% 30%, #2a8a5f 0%, var(--felt-1) 42%, #124a32 100%);
  border: 1px solid rgba(255,255,255,.1);
  box-shadow: inset 0 0 60px rgba(0,0,0,.35), 0 14px 40px rgba(0,0,0,.4);
}
.seatcell {
  text-align: center; display: flex; flex-direction: column; align-items: center;
  gap: .45rem; padding: .3rem;
}
.seatcell:nth-child(1) { grid-column: 2; grid-row: 1; }
.seatcell:nth-child(2) { grid-column: 3; grid-row: 2; }
.seatcell:nth-child(3) { grid-column: 2; grid-row: 3; }
.seatcell:nth-child(4) { grid-column: 1; grid-row: 2; }
.seatname {
  font-size: .62rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
  color: rgba(255,255,255,.6); background: rgba(0,0,0,.22);
  padding: .18rem .5rem; border-radius: 999px;
}
.empty {
  width: 2.9rem; height: 4rem; border-radius: 10px;
  border: 1.5px dashed rgba(255,255,255,.22); color: transparent;
  display: inline-block;
}

.handlabel { font-size: .95rem; font-weight: 500; margin-bottom: .7rem;
  min-height: 1.2em; color: var(--ink); }
.handlabel b { color: var(--gold); }
.hand { display: flex; flex-wrap: wrap; gap: .45rem; min-height: 4.4rem;
  padding: .2rem 0; }

.card {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 2.9rem; height: 4rem; border-radius: 10px;
  background: linear-gradient(170deg, #ffffff 0%, #eef0f6 100%);
  color: var(--black); font-weight: 700; font-size: 1.15rem;
  font-variant-numeric: lining-nums; border: 1px solid rgba(0,0,0,.14);
  box-shadow: 0 3px 8px rgba(0,0,0,.35); user-select: none;
  transition: transform .12s ease, box-shadow .12s ease;
}
.card.red { color: var(--red); }
.card.black { color: var(--black); }
.card.playable { cursor: pointer; box-shadow: 0 3px 8px rgba(0,0,0,.35), 0 0 0 2px var(--gold); }
.card.playable:hover { transform: translateY(-8px); box-shadow: 0 12px 22px rgba(0,0,0,.45), 0 0 0 2px var(--gold); }
.card.got-card { box-shadow: 0 0 0 3px var(--gold), 0 6px 16px rgba(232,193,90,.45); transform: translateY(-6px); }
.handlabel .exchange-card { display: inline-flex; vertical-align: middle; margin: 0 .15rem; height: 2.4rem; min-width: 1.9rem; font-size: .95rem; }
.table .card { height: 3.4rem; min-width: 2.5rem; font-size: 1.05rem; }

.seatcell.me .seatname { background: linear-gradient(180deg, #f2d074, var(--gold)); color: #2a1e00; }
.seatcell.me { filter: drop-shadow(0 0 10px rgba(232,193,90,.35)); }

.showbtns { display: flex; gap: .7rem; margin-top: 1rem; width: 100%; }
.scdrop { color: #ff6b8a; font-weight: 600; }

.playedwrap {
  margin: .2rem 0 1rem; border: 1px solid var(--line); border-radius: 12px;
  background: rgba(0,0,0,.22); overflow: hidden;
}
.playedwrap > summary {
  cursor: pointer; padding: .55rem .8rem; font-size: .82rem; font-weight: 600;
  color: var(--muted); list-style: none; user-select: none;
}
.playedwrap > summary::-webkit-details-marker { display: none; }
.playedwrap > summary::before { content: "▸ "; color: var(--gold); }
.playedwrap[open] > summary::before { content: "▾ "; }
.played { padding: .1rem .6rem .7rem; overflow-x: auto; }
.plempty { color: var(--muted); font-size: .8rem; padding: .3rem 0; }
.pltable {
  border-collapse: collapse; width: 100%; font-size: .82rem;
  font-variant-numeric: tabular-nums;
}
.pltable th, .pltable td {
  padding: .3rem .5rem; border-bottom: 1px solid var(--line); white-space: nowrap;
}
.pltable thead th { color: var(--muted); font-size: 1rem; text-align: center; }
.pltable .plseat { color: var(--ink); font-weight: 600; text-align: left; }
.pltable td { text-align: center; color: var(--ink); }
.pltable .plred { color: var(--red); }
.pltable td.plvoid {
  background: rgba(209,39,75,.2); color: var(--red); font-weight: 800;
}

.log {
  margin-top: 1.2rem; font-size: .78rem; line-height: 1.6;
  color: var(--muted); max-height: 240px; overflow: auto;
  background: rgba(0,0,0,.28); border: 1px solid var(--line);
  border-radius: 14px; padding: .9rem 1rem; font-variant-numeric: tabular-nums;
}
.log b { color: var(--ink); }
.log hr { border: none; border-top: 1px solid var(--line); margin: .6rem 0; }
`;

// --- Aja käännös ------------------------------------------------------- //
const bundle = buildBundle();
fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "dist", "tuppi.bundle.cjs"), bundle);
const html = buildHtml(bundle, APP_JS, CSS);
fs.writeFileSync(path.join(ROOT, "tuppi.html"), html);
console.log("Kirjoitettu: dist/tuppi.bundle.cjs ja tuppi.html");
console.log("Avaa tuppi.html selaimessa — ei palvelinta tarvita.");
