// proBot.js — ammattitason tekoäly.
// Käyttää korttien seurantaa (näkymättömät kortit) ja vastustajien tyhjien
// maiden päättelyä (view.voids) varmoihin väistöihin, rouvan turvalliseen
// pudotukseen sekä kuun hallintaan. Näkee vain reilun näkymän.

import { SUITS, suitOf, rankOf, cardPoints } from "../utils.js";

export default {
  name: "Pro",

  passCards(view) {
    const hand = view.hand;
    const counts = { C: 0, D: 0, S: 0, H: 0 };
    hand.forEach((c) => counts[suitOf(c)]++);
    const spades = counts.S;
    const keepQueen = spades >= 4; // tarpeeksi matalia patoja suojaamaan rouvaa

    let voidSuit = null, best = 99;
    for (const s of ["C", "D"]) {
      if (counts[s] > 0 && counts[s] <= 3 && counts[s] < best) {
        best = counts[s]; voidSuit = s;
      }
    }
    const danger = (c) => {
      let d;
      if (c === "S12") d = keepQueen ? -10 : 100;
      else if (c === "S14") d = spades <= 3 ? 90 : 40;
      else if (c === "S13") d = spades <= 3 ? 82 : 38;
      else if (suitOf(c) === "S" && rankOf(c) <= 5 && keepQueen) d = -5;
      else if (suitOf(c) === "H") d = 30 + rankOf(c);
      else d = rankOf(c);
      if (voidSuit && suitOf(c) === voidSuit) d += 55; // tyhjennä lyhyt maa
      return d;
    };
    return [...hand].sort((a, b) => danger(b) - danger(a)).slice(0, 3);
  },

  playCard(view) {
    const { hand, legalMoves: legal, trick, leader, trickNumber,
      playedCards, handPoints, seat, voids } = view;
    if (legal.length === 1) return legal[0];

    const seen = new Set([...hand, ...playedCards]);
    const unseen = { C: [], D: [], S: [], H: [] };
    for (const s of SUITS) for (let r = 2; r <= 14; r++) if (!seen.has(s + r)) unseen[s].push(r);
    const higherUnseen = (s, rank) => unseen[s].some((r) => r > rank);
    const isBoss = (c) => !higherUnseen(suitOf(c), rankOf(c));

    const order = [leader, (leader + 1) % 4, (leader + 2) % 4, (leader + 3) % 4];
    const after = order.slice(trick.length + 1);
    const canBeat = (st, su, rk) => !voids[st][su] && higherUnseen(su, rk);
    const mightBeBeaten = (su, rk) => after.some((st) => canBeat(st, su, rk));

    const pts = handPoints.reduce((a, b) => a + b, 0);
    const collectors = handPoints.map((p, i) => (p > 0 ? i : -1)).filter((i) => i >= 0);
    const sole = collectors.length === 1 ? collectors[0] : -1;
    const moonThreat = sole >= 0 && sole !== seat && pts >= 6;
    const iAmShooting = sole === seat && pts >= 10 &&
      hand.filter((c) => rankOf(c) >= 12).length >= 2;
    const qPlayed = playedCards.includes("S12");
    const iHaveQ = hand.includes("S12");
    const asc = (a, b) => rankOf(a) - rankOf(b);
    const desc = (a, b) => rankOf(b) - rankOf(a);

    // ---- ALOITUS ----
    if (trick.length === 0) {
      if (iAmShooting) {
        const b = legal.filter(isBoss).sort(desc);
        return b[0] || [...legal].sort(desc)[0];
      }
      const spades = legal.filter((c) => suitOf(c) === "S");
      const maxS = spades.reduce((m, c) => Math.max(m, rankOf(c)), 0);
      if (!qPlayed && !iHaveQ && spades.length && maxS < 12 && higherUnseen("S", 0)) {
        return spades.sort(desc)[0]; // metsästä rouvaa turvallisesti
      }
      const score = (c) => {
        let s = rankOf(c);
        if (c === "S12") s += 500;
        if (suitOf(c) === "S" && rankOf(c) >= 13 && !qPlayed) s += 200;
        if (suitOf(c) === "H") s += 100;
        if (isBoss(c) && rankOf(c) >= 11) s += 60;
        return s;
      };
      return [...legal].sort((a, b) => score(a) - score(b))[0];
    }

    // ---- SEURANTA ----
    const led = suitOf(trick[0].card);
    const ledCards = trick.filter((t) => suitOf(t.card) === led);
    const winner = ledCards.reduce((w, t) => (rankOf(t.card) > rankOf(w.card) ? t : w), ledCards[0]);
    const winRank = rankOf(winner.card);
    const pointsIn = trick.reduce((s, t) => s + cardPoints(t.card), 0);
    const isLast = trick.length === 3;
    const runnerActive = sole >= 0 &&
      (winner.seat === sole || !trick.some((t) => t.seat === sole));

    const follow = legal.filter((c) => suitOf(c) === led);
    if (follow.length) {
      const sureWin = follow.filter((c) => rankOf(c) > winRank &&
        (isLast || !mightBeBeaten(led, rankOf(c))));
      const anyWin = follow.filter((c) => rankOf(c) > winRank);

      if (moonThreat && runnerActive && pointsIn > 0) {
        if (sureWin.length) return sureWin.sort(asc)[0];
        if (anyWin.length) return anyWin.sort(desc)[0];
      }
      if (iAmShooting) {
        if (sureWin.length) return sureWin.sort(asc)[0];
        if (anyWin.length) return anyWin.sort(desc)[0];
      }
      // Muuten: vältä tikin ottamista
      const below = follow.filter((c) => rankOf(c) < winRank);
      if (below.length) return below.sort(desc)[0]; // väistä korkeimmalla varmasti häviävällä (myös rouvan pudotus)
      if (isLast) return follow.sort(desc)[0];      // otan tikin joka tapauksessa → pudota korkein rasite
      return follow.sort(asc)[0];                   // en viimeinen → matalin voittava, jotta joku takana ohittaa
    }

    // ---- TYHJÄ MAA: pudota ----
    let pool = legal;
    if (moonThreat && runnerActive) {
      const np = legal.filter((c) => cardPoints(c) === 0);
      if (np.length) pool = np;
    }
    const discard = (c) => {
      if (c === "S12") return 1000;
      if (suitOf(c) === "S" && rankOf(c) >= 13 && !qPlayed) return 800 + rankOf(c);
      if (suitOf(c) === "H") return 400 + rankOf(c);
      return rankOf(c);
    };
    return [...pool].sort((a, b) => discard(b) - discard(a))[0];
  },
};
