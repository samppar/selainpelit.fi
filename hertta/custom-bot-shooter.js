// custom-bot-shooter.js — ITSENÄINEN puhaltaja-botti liitettäväksi peliin.
// EI import-lauseita: kaikki apufunktiot tulevat view.util:sta.
// Liitä pelin alkuvalikossa kohtaan "Oma botti (liitä koodi)".
//
// Arvioi JO korttien vaihdossa, onko käsi puhalluskelpoinen (kuun ampuminen).
// Jos on: säilyttää voittajat ja pelaa hyökkäävästi kerätäkseen kaikki 26 pistettä.
// Muuten (tai jos puhallus katkeaa): pelaa ammattitason puolustusta.

export default {
  name: "Puhaltaja",

  passCards(view) {
    const { suitOf, rankOf } = view.util;
    const hand = view.hand;
    const counts = { C: 0, D: 0, S: 0, H: 0 };
    hand.forEach((c) => counts[suitOf(c)]++);

    // Puhalluskelpoinen käsi → pidä voittajat, anna pois matalat vuotokortit.
    if (counts.H >= 4 && shootStrength(hand, view.util) >= 10) {
      const keep = (c) => {
        if (c === "S12") return 100;
        if (rankOf(c) >= 13) return 90;
        if (suitOf(c) === "H") return 50 + rankOf(c);
        if (rankOf(c) >= 12) return 60;
        return rankOf(c);
      };
      return [...hand].sort((a, b) => keep(a) - keep(b)).slice(0, 3);
    }

    // Puolustava vaihto: luo tyhjä maa + säilytä suojattu patarouva.
    const spades = counts.S, keepQueen = spades >= 4;
    let voidSuit = null, best = 99;
    for (const s of ["C", "D"]) if (counts[s] > 0 && counts[s] <= 3 && counts[s] < best) { best = counts[s]; voidSuit = s; }
    const danger = (c) => {
      let d;
      if (c === "S12") d = keepQueen ? -10 : 100;
      else if (c === "S14") d = spades <= 3 ? 90 : 40;
      else if (c === "S13") d = spades <= 3 ? 82 : 38;
      else if (suitOf(c) === "S" && rankOf(c) <= 5 && keepQueen) d = -5;
      else if (suitOf(c) === "H") d = 30 + rankOf(c);
      else d = rankOf(c);
      if (voidSuit && suitOf(c) === voidSuit) d += 55;
      return d;
    };
    return [...hand].sort((a, b) => danger(b) - danger(a)).slice(0, 3);
  },

  playCard(view) {
    const { suitOf, rankOf, cardPoints } = view.util;
    const { hand, legalMoves: legal, trick, leader, playedCards, handPoints, seat, voids } = view;
    if (legal.length === 1) return legal[0];

    const asc = (a, b) => rankOf(a) - rankOf(b);
    const desc = (a, b) => rankOf(b) - rankOf(a);
    const seen = new Set([...hand, ...playedCards]);
    const higherUnseen = (s, rank) => { for (let r = rank + 1; r <= 14; r++) if (!seen.has(s + r)) return true; return false; };
    const isBoss = (c) => !higherUnseen(suitOf(c), rankOf(c));
    const order = [leader, (leader + 1) % 4, (leader + 2) % 4, (leader + 3) % 4];
    const after = order.slice(trick.length + 1);
    const mightBeBeaten = (su, rk) => after.some((st) => !voids[st][su] && higherUnseen(su, rk));

    // Yritetäänkö puhallusta juuri nyt?
    const others = handPoints.reduce((s, p, i) => (i !== seat ? s + p : s), 0);
    const shooting = others === 0 &&
      (handPoints[seat] > 0 ||
        (hand.filter((c) => suitOf(c) === "H").length >= 4 && shootStrength(hand, view.util) >= 10));

    if (shooting) {
      if (trick.length === 0) { const b = legal.filter(isBoss); return (b.length ? b : legal).sort(desc)[0]; }
      const led = suitOf(trick[0].card);
      const winRank = Math.max(...trick.filter((t) => suitOf(t.card) === led).map((t) => rankOf(t.card)));
      const follow = legal.filter((c) => suitOf(c) === led);
      if (follow.length) {
        const sure = follow.filter((c) => rankOf(c) > winRank && (trick.length === 3 || !mightBeBeaten(led, rankOf(c))));
        if (sure.length) return sure.sort(asc)[0];
        const any = follow.filter((c) => rankOf(c) > winRank);
        if (any.length) return any.sort(desc)[0];
        return follow.sort(asc)[0];
      }
      return [...legal].sort(asc)[0];
    }

    // ---- Puolustus (ammattitaso: korttilaskenta + tyhjät maat + kuun esto) ----
    const pts = handPoints.reduce((a, b) => a + b, 0);
    const collectors = handPoints.map((p, i) => (p > 0 ? i : -1)).filter((i) => i >= 0);
    const sole = collectors.length === 1 ? collectors[0] : -1;
    const moonThreat = sole >= 0 && sole !== seat && pts >= 6;
    const qPlayed = playedCards.includes("S12");
    const iHaveQ = hand.includes("S12");

    if (trick.length === 0) {
      const sp = legal.filter((c) => suitOf(c) === "S");
      const maxS = sp.reduce((m, c) => Math.max(m, rankOf(c)), 0);
      if (!qPlayed && !iHaveQ && sp.length && maxS < 12 && higherUnseen("S", 0)) return sp.sort(desc)[0];
      const score = (c) => { let s = rankOf(c); if (c === "S12") s += 500; if (suitOf(c) === "S" && rankOf(c) >= 13 && !qPlayed) s += 200; if (suitOf(c) === "H") s += 100; if (isBoss(c) && rankOf(c) >= 11) s += 60; return s; };
      return [...legal].sort((a, b) => score(a) - score(b))[0];
    }
    const led = suitOf(trick[0].card);
    const ledCards = trick.filter((t) => suitOf(t.card) === led);
    const winner = ledCards.reduce((w, t) => (rankOf(t.card) > rankOf(w.card) ? t : w), ledCards[0]);
    const winRank = rankOf(winner.card);
    const pointsIn = trick.reduce((s, t) => s + cardPoints(t.card), 0);
    const isLast = trick.length === 3;
    const runnerActive = sole >= 0 && (winner.seat === sole || !trick.some((t) => t.seat === sole));
    const follow = legal.filter((c) => suitOf(c) === led);
    if (follow.length) {
      const sureWin = follow.filter((c) => rankOf(c) > winRank && (isLast || !mightBeBeaten(led, rankOf(c))));
      const anyWin = follow.filter((c) => rankOf(c) > winRank);
      if (moonThreat && runnerActive && pointsIn > 0) { if (sureWin.length) return sureWin.sort(asc)[0]; if (anyWin.length) return anyWin.sort(desc)[0]; }
      const below = follow.filter((c) => rankOf(c) < winRank);
      if (below.length) return below.sort(desc)[0];
      if (isLast) return follow.sort(desc)[0];
      return follow.sort(asc)[0];
    }
    let pool = legal;
    if (moonThreat && runnerActive) { const np = legal.filter((c) => cardPoints(c) === 0); if (np.length) pool = np; }
    const discard = (c) => { if (c === "S12") return 1000; if (suitOf(c) === "S" && rankOf(c) >= 13 && !qPlayed) return 800 + rankOf(c); if (suitOf(c) === "H") return 400 + rankOf(c); return rankOf(c); };
    return [...pool].sort((a, b) => discard(b) - discard(a))[0];
  },
};

function shootStrength(hand, util) {
  const { suitOf, rankOf } = util;
  const hearts = hand.filter((c) => suitOf(c) === "H");
  const highHearts = hearts.filter((c) => rankOf(c) >= 12).length;
  const aces = hand.filter((c) => rankOf(c) === 14).length;
  const kings = hand.filter((c) => rankOf(c) === 13).length;
  const spadeCtrl = hand.filter((c) => suitOf(c) === "S" && rankOf(c) >= 12).length;
  return highHearts * 2 + Math.max(0, hearts.length - 3) + aces * 1.5 + kings + spadeCtrl;
}
