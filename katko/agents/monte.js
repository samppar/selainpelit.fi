// Martta — "Laskennallinen". Monte Carlo / PIMC: ei käsinkoodattuja
// lopetussääntöjä, vaan simuloi. Jokaiselle lailliselle siirrolle se arpoo
// vastustajien piilokädet johdonmukaisesti (kunnioittaen historiasta
// pääteltyjä tyhjentyneitä maita = voids), pelaa jaon loppuun asti nopealla
// perusheuristiikalla ja valitsee siirron, joka tuottaa parhaan keskimääräisen
// oman pistesaaliin. "Vain viimeinen tikki tuottaa" -sääntö tekee arvioinnista
// suoraa: rollout palauttaa 0, 1 tai 2 pistettä.
//
// Yhteiset satunnaismaailmat (common random numbers): kaikki ehdokassiirrot
// arvioidaan SAMOISSA arvotuissa maailmoissa, jolloin kohina kumoutuu ja paras
// siirto erottuu harvemmilla otoksilla.

import { baseChoice } from "./base.js";
import { SUIT_KEYS, RANKS, trickWinner, trickPoints, buildView } from "../engine.js";

// Maailmoja per päätös. Selaimessa 120 (vahva, ~kymmeniä ms). Node-evalissa/
// turnauksessa voi keventää: KATKO_MC_SAMPLES=40 node tournament.mjs ...
const SAMPLES = (typeof process !== "undefined" && Number(process.env.KATKO_MC_SAMPLES)) || 120;

function lowest(legal) { let lo = legal[0]; for (const c of legal) if (c.v < lo.v) lo = c; return lo; }

// Kortit joita en näe: eivät kädessäni enkä pelattujen joukossa. HUOM: Katkossa
// jaetaan vain 20/52 korttia, joten tämä joukko sisältää sekä vastustajien
// kädet ETTÄ jakamattoman pakan (~32 korttia). Determinisoinnissa vastustajille
// jaetaan vain handCounts verran; loput jäävät jakamattomaan pakkaan.
function unseenCards(view) {
  const seen = new Set();
  for (const c of view.hand) seen.add(c.suit + c.v);
  for (const c of view.played) seen.add(c.suit + c.v);
  const out = [];
  for (const s of SUIT_KEYS) for (const v of RANKS) if (!seen.has(s + v)) out.push({ suit: s, v });
  return out;
}

function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Arvo yksi johdonmukainen maailma: jaa kullekin vastustajalle handCounts[p]
// korttia näkymättömistä (kunnioittaen voids-rajoitteita); loput näkymättömät
// jäävät jakamattomaan pakkaan eikä niitä pelata. Palauttaa hands[4] tai null.
function sampleWorld(view) {
  const me = view.me;
  const voids = view.voids || [{}, {}, {}, {}];
  // rajoitetuimmat paikat (eniten voideja) täytetään ensin
  const seats = [0, 1, 2, 3].filter(p => p !== me && view.handCounts[p] > 0)
    .sort((a, b) => Object.keys(voids[b]).length - Object.keys(voids[a]).length);

  for (let attempt = 0; attempt < 20; attempt++) {
    const pool = shuffleInPlace(unseenCards(view));
    const hands = [[], [], [], []];
    hands[me] = view.hand.map(c => ({ suit: c.suit, v: c.v }));
    let ok = true;
    for (const p of seats) {
      let got = 0;
      const need = view.handCounts[p];
      for (let i = 0; i < pool.length && got < need; i++) {
        const card = pool[i];
        if (card && !voids[p][card.suit]) { hands[p].push(card); pool[i] = null; got++; }
      }
      if (got < need) { ok = false; break; }   // voids ei sallinut täyttöä -> retry
    }
    if (ok) return hands;                        // loput poolissa = jakamaton pakka
  }
  return null;
}

const MATCH_WIN = 100, MATCH_LOSS = -100;   // ottelun ratkeaminen dominoi jaon pisteitä

// Pelaa annetusta osittaistilasta jaon loppuun perusheuristiikalla ja palauttaa
// ARVON `me`:lle. Ottelupohjaisessa pelissä (target asetettu) arvo huomioi
// ratkeaako ottelu: viimeisen tikin voitto joka yltää targetiin = MATCH_WIN;
// jos vastustaja yltää targetiin = MATCH_LOSS; muuten jaon pisteet. Ilman
// targetia palautetaan pelkät jaon pisteet (0/1/2).
function rollout(hands, turn, trickNumber, trick, ledSuit, played, kakko, me, scores, target) {
  while (true) {
    while (trick.length < 4) {
      const view = buildView({ hands, trick, ledSuit, trickNumber, kakko, played }, turn, false);
      let card = baseChoice(view);
      if (!view.legal.some(c => c.suit === card.suit && c.v === card.v)) card = lowest(view.legal);
      const h = hands[turn];
      const idx = h.findIndex(c => c.suit === card.suit && c.v === card.v);
      h.splice(idx, 1);
      trick.push({ p: turn, card });
      played.push({ suit: card.suit, v: card.v });
      if (trick.length === 1) ledSuit = card.suit;
      turn = (turn + 1) % 4;
    }
    const win = trickWinner(trick, ledSuit);
    if (trickNumber === 5) {
      const pts = trickPoints(win.card, kakko);
      if (win.p === me) return (target && scores[me] + pts >= target) ? MATCH_WIN : pts;
      return (target && scores[win.p] + pts >= target) ? MATCH_LOSS : 0;
    }
    trickNumber++; turn = win.p; trick = []; ledSuit = null;
  }
}

export const monte = {
  name: "Martta",
  style: "Laskennallinen — Monte Carlo, simuloi eikä arvaa",
  chooseCard(view) {
    const legal = view.legal;
    if (legal.length <= 1) return legal[0] || view.hand[0];

    const me = view.me;
    const N = view._mcSamples || SAMPLES;
    const totals = new Array(legal.length).fill(0);
    let usable = 0;

    for (let s = 0; s < N; s++) {
      const world = sampleWorld(view);
      if (!world) continue;
      usable++;
      // sama maailma kaikille ehdokassiirroille (common random numbers)
      for (let li = 0; li < legal.length; li++) {
        const card = legal[li];
        const hands = world.map(h => h.map(c => ({ suit: c.suit, v: c.v })));
        const mh = hands[me];
        mh.splice(mh.findIndex(c => c.suit === card.suit && c.v === card.v), 1);
        const trick = view.trick.map(t => ({ p: t.p, card: { suit: t.card.suit, v: t.card.v } }));
        trick.push({ p: me, card: { suit: card.suit, v: card.v } });
        const ledSuit = view.ledSuit || card.suit;
        const played = view.played.map(c => ({ suit: c.suit, v: c.v }));
        played.push({ suit: card.suit, v: card.v });
        totals[li] += rollout(hands, (me + 1) % 4, view.trickNumber, trick, ledSuit, played,
                              view.kakko, me, view.scores, view.target);
      }
    }
    if (!usable) return baseChoice(view);   // determinisointi ei onnistunut -> heuristiikka

    let best = 0;
    for (let i = 1; i < legal.length; i++) if (totals[i] > totals[best]) best = i;
    return legal[best];
  },
};
