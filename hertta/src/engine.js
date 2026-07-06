// engine.js — puhdas Hertta-moottori (ei riipu Reactista).
// Sisältää säännöt, pisteytyksen, "reilun näkymän" botteja varten ja
// turvakäärimet, jotka estävät vialliselta botilta pelin kaatumisen.

import { SUITS, suitOf, rankOf, cardPoints, sortHand } from "./utils.js";
import { makeAnalysis } from "./analysis.js";

const VIEW_UTIL = { suitOf, rankOf, cardPoints };

export function newDeck() {
  const d = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push(s + r);
  return d;
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function deal() {
  const d = shuffle(newDeck());
  return [0, 1, 2, 3].map((i) => sortHand(d.slice(i * 13, i * 13 + 13)));
}

// Sallitut siirrot. trick = [{ seat, card }] pelijärjestyksessä.
export function getLegalMoves(hand, trick, heartsBroken, isFirstTrick) {
  if (trick.length === 0) {
    if (isFirstTrick && hand.includes("C2")) return ["C2"];
    const nonH = hand.filter((c) => suitOf(c) !== "H");
    if (heartsBroken || nonH.length === 0) return [...hand];
    return nonH;
  }
  const led = suitOf(trick[0].card);
  const inSuit = hand.filter((c) => suitOf(c) === led);
  let legal = inSuit.length ? inSuit : [...hand];
  if (isFirstTrick) {
    const noPts = legal.filter((c) => cardPoints(c) === 0);
    if (noPts.length) legal = noPts;
  }
  return legal;
}

export function trickWinner(trick) {
  const led = suitOf(trick[0].card);
  return trick
    .filter((t) => suitOf(t.card) === led)
    .reduce((w, t) => (rankOf(t.card) > rankOf(w.card) ? t : w)).seat;
}

export function trickPoints(trick) {
  return trick.reduce((s, t) => s + cardPoints(t.card), 0);
}

export const PASS_DIRS = ["left", "right", "across", "hold"];
export function passTarget(dir, i) {
  return dir === "left" ? (i + 1) % 4
    : dir === "right" ? (i + 3) % 4
    : dir === "across" ? (i + 2) % 4
    : i;
}

// Jaon pisteytys mukaan lukien kuun ampuminen.
export function scoreHand(handPoints) {
  const shooter = handPoints.findIndex((p) => p === 26);
  if (shooter >= 0) return handPoints.map((_, i) => (i === shooter ? 0 : 26));
  return [...handPoints];
}

// Tyhjien maiden päättely pelihistoriasta.
// allPlays = lista tikkejä, joista kukin on [{ seat, card }].
export function computeVoids(allPlays) {
  const v = [0, 1, 2, 3].map(() => ({ C: false, D: false, S: false, H: false }));
  for (const plays of allPlays) {
    if (!plays || !plays.length) continue;
    const led = suitOf(plays[0].card);
    for (let k = 1; k < plays.length; k++) {
      if (suitOf(plays[k].card) !== led) v[plays[k].seat][led] = true;
    }
  }
  return v;
}

// ---- Reilu simulaattori boteille (determinisointi + jaon simulointi) ----
// Antaa hakupohjaisille boteille (ISMCTS / PIMC) mahdollisuuden arpoa
// vastustajien käsiä ja pelata jako loppuun MOOTTORIN säännöillä — paljastamatta
// piilotettua tietoa. Botti näkee vain oman kätensä; sim ARPOO muiden kädet niin,
// että ne ovat yhteensopivia pelatun historian ja pääteltyjen tyhjien maiden kanssa.
//
//   const world = view.sim.sampleWorld();            // { hands: [4][] } yksi mahdollinen jako
//   const r = view.sim.playout(world, chooseCard);   // { handPoints, score } jaon loppuun
//   const avg = view.sim.evaluate(card, opts);       // keskimääräinen oma pistesaldo, jos pelaan `card`
//
// chooseCard(seat, simView) palauttaa laillisen kortin. Oletuspolitiikka:
// view.sim.defaultPolicy (nopea, pisteitä välttävä).
export function makeSim({ seat, hand, playedCards, currentTrick, leader,
  heartsBroken, trickNumber, handPoints, scores, voids }) {
  const seen = new Set([...hand, ...playedCards]);
  const unseen = newDeck().filter((c) => !seen.has(c));
  const inTrick = new Set(currentTrick.map((t) => t.seat));
  // Montako korttia kukin vastustaja pitää kädessään juuri nyt.
  const counts = [0, 1, 2, 3].map((s) =>
    s === seat ? hand.length : 13 - trickNumber - (inTrick.has(s) ? 1 : 0));

  // Rajoittuneisuus: montako muuta paikkaa on TYHJÄ tämän kortin maassa (mitä
  // useampi, sitä harvemmalle kortti sopii). McBrain-tyylinen preGenSample:
  // sijoitetaan rajoittuneimmat kortit ensin, kun paikkoja on vielä vapaana →
  // kelvollinen jako syntyy lähes aina yhdellä yrityksellä.
  const constraint = (c) => {
    const su = suitOf(c);
    let n = 0;
    for (let s = 0; s < 4; s++) if (s !== seat && voids[s][su]) n++;
    return n;
  };
  const ordered = [...unseen].sort((a, b) => constraint(b) - constraint(a));

  function sampleWorld() {
    for (let attempt = 0; attempt < 40; attempt++) {
      const hands = [[], [], [], []];
      hands[seat] = [...hand];
      const need = counts.slice(); need[seat] = 0;
      let ok = true;
      // Rajoittuneimmat ensin (kiinteä järjestys); paikan satunnaisuus tuo
      // vaihtelun eri maailmojen välille.
      for (const c of ordered) {
        const su = suitOf(c);
        const elig = [];
        for (let s = 0; s < 4; s++) if (s !== seat && need[s] > 0 && !voids[s][su]) elig.push(s);
        if (!elig.length) { ok = false; break; }
        const s = elig[(Math.random() * elig.length) | 0];
        hands[s].push(c); need[s]--;
      }
      if (ok && need.every((n) => n === 0)) return { hands };
    }
    // Varasuunnitelma: jaa tyhjät maat huomiotta (takaa terminoinnin).
    const pool = shuffle(unseen);
    const hands = [[], [], [], []]; hands[seat] = [...hand];
    let idx = 0;
    for (let s = 0; s < 4; s++) {
      if (s === seat) continue;
      for (let k = 0; k < counts[s]; k++) hands[s].push(pool[idx++]);
    }
    return { hands };
  }

  function simView(s, sHand, legal, cur, ld, hb, tn, played, hp, history) {
    const leadSuit = cur.length ? suitOf(cur[0].card) : null;
    const v = {
      seat: s, hand: sortHand(sHand), legalMoves: sortHand(legal),
      trick: cur.map((t) => ({ seat: t.seat, card: t.card })),
      leader: ld, leadSuit, heartsBroken: hb, trickNumber: tn,
      playedCards: played, scores: scores || [0, 0, 0, 0], handPoints: hp,
      util: VIEW_UTIL,
    };
    // Laiska voids: lasketaan vain jos rollout-politiikka sitä lukee (nopea oletus ei lue).
    let _voids;
    Object.defineProperty(v, "voids", {
      enumerable: true,
      get() { return _voids || (_voids = computeVoids([...history, cur])); },
    });
    return v;
  }

  // Nopea, pisteitä välttävä oletuspolitiikka rolloutteihin.
  function defaultPolicy(s, v) {
    const legal = v.legalMoves;
    if (legal.length === 1) return legal[0];
    if (v.trick.length === 0) {
      const nonH = legal.filter((c) => suitOf(c) !== "H");
      const pool = nonH.length ? nonH : legal;
      return pool.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a));
    }
    const led = suitOf(v.trick[0].card);
    const winRank = Math.max(...v.trick.filter((t) => suitOf(t.card) === led).map((t) => rankOf(t.card)));
    const follow = legal.filter((c) => suitOf(c) === led);
    if (follow.length) {
      const below = follow.filter((c) => rankOf(c) < winRank);
      if (below.length) return below.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a));
      return follow.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a));
    }
    // Tyhjä maa → pudota kallein (rouva, hertat, korkeat).
    return legal.reduce((a, b) => (cardPoints(b) + rankOf(b) / 100 > cardPoints(a) + rankOf(a) / 100 ? b : a));
  }

  function playout(world, chooseCard = defaultPolicy) {
    const hands = world.hands.map((h) => [...h]);
    let hb = heartsBroken, tn = trickNumber, ld = leader;
    const hp = [...handPoints];
    const played = [...playedCards];
    const history = [];
    let cur = currentTrick.map((t) => ({ ...t }));
    while (tn < 13) {
      while (cur.length < 4) {
        const s = (ld + cur.length) % 4;
        const legal = getLegalMoves(hands[s], cur, hb, tn === 0);
        let card = chooseCard(s, simView(s, hands[s], legal, cur, ld, hb, tn, played, hp, history));
        if (!legal.includes(card)) card = [...legal].sort((a, b) => rankOf(a) - rankOf(b))[0];
        hands[s] = hands[s].filter((c) => c !== card);
        cur.push({ seat: s, card });
        played.push(card);
        if (suitOf(card) === "H" || card === "S12") hb = true;
      }
      const w = trickWinner(cur);
      hp[w] += trickPoints(cur);
      history.push(cur);
      ld = w; tn++; cur = [];
    }
    return { handPoints: hp, score: scoreHand(hp) };
  }

  // Arvioi oman siirron `card`: pelaa se nyt, muut oletuspolitiikalla, ja
  // palauta keskimääräinen OMA jaon lopun pistesaldo (pienempi = parempi).
  function evaluate(card, { samples = 20, policy = defaultPolicy } = {}) {
    let sum = 0;
    for (let i = 0; i < samples; i++) {
      const world = sampleWorld();
      const forced = (s, v) => (s === seat && v.trick.length === currentTrick.length
        && v.trickNumber === trickNumber && v.legalMoves.includes(card) ? card : policy(s, v));
      sum += playout(world, forced).score[seat];
    }
    return sum / samples;
  }

  return { unseen, counts, sampleWorld, playout, evaluate, defaultPolicy };
}

// ---- Reilut näkymät: botti näkee VAIN oman kätensä ja julkisen tiedon ----
export function buildPlayView(state, seat) {
  const { hands, currentTrick, heartsBroken, trickNumber, playedCards,
    scores, handPoints, leader, tricks } = state;
  const leadSuit = currentTrick.length ? suitOf(currentTrick[0].card) : null;
  const legalMoves = getLegalMoves(hands[seat], currentTrick, heartsBroken, trickNumber === 0);
  const voids = computeVoids([...tricks.map((t) => t.plays), currentTrick]);
  const view = {
    seat,
    hand: sortHand(hands[seat]),
    legalMoves: sortHand(legalMoves),
    trick: currentTrick.map((t) => ({ seat: t.seat, card: t.card })),
    leader,
    leadSuit,
    heartsBroken,
    trickNumber,
    playedCards: [...playedCards],
    scores: [...scores],
    handPoints: [...handPoints],
    voids,
    util: VIEW_UTIL,
  };
  view.sim = makeSim({
    seat, hand: view.hand, playedCards: view.playedCards, currentTrick,
    leader, heartsBroken, trickNumber, handPoints: view.handPoints,
    scores: view.scores, voids,
  });
  view.analysis = makeAnalysis(view); // jaetut julkisen tiedon apurit
  return freezeView(view);
}

// Jäädytä näkymä: botti ei voi huijata muokkaamalla tilaa (tuppi-oppi).
// Turvakäärimet (safePlay) nappaavat poikkeukset, joten jäädytys ei kaada peliä.
function freezeView(view) {
  for (const k of ["hand", "legalMoves", "playedCards", "scores", "handPoints", "trick", "voids"]) {
    if (Array.isArray(view[k])) Object.freeze(view[k]);
  }
  return Object.freeze(view);
}

export function buildPassView(state, seat, direction) {
  const view = {
    seat,
    hand: sortHand(state.hands[seat]),
    direction,
    scores: [...state.scores],
    util: VIEW_UTIL,
  };
  return freezeView(view);
}

// ---- Turvakäärimet: viallinen/väärän siirron palauttava botti ei kaada peliä ----
// Async-tuki: `await` sallii sekä synkroniset että asynkroniset botit
// (esim. Web Worker- tai raskaan haun / verkon takana olevat).
export async function safePlay(bot, view) {
  try {
    const c = await bot.playCard(view);
    if (view.legalMoves.includes(c)) return c;
  } catch (e) {
    /* fall through */
  }
  const noPts = view.legalMoves.filter((c) => cardPoints(c) === 0);
  const pool = noPts.length ? noPts : view.legalMoves;
  return [...pool].sort((a, b) => rankOf(a) - rankOf(b))[0]; // matalin turvallinen
}

export async function safePass(bot, view) {
  try {
    const p = await bot.passCards(view);
    if (Array.isArray(p) && p.length === 3 && new Set(p).size === 3 &&
      p.every((c) => view.hand.includes(c))) return p;
  } catch (e) {
    /* fall through */
  }
  return [...view.hand].sort((a, b) => rankOf(b) - rankOf(a)).slice(0, 3);
}
