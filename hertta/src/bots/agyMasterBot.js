import { SUITS, suitOf, rankOf, cardPoints } from "../utils.js";

export default {
  name: "AGY Master",

  passCards(view) {
    const { hand } = view;
    const counts = { C: 0, D: 0, S: 0, H: 0 };
    hand.forEach(c => counts[suitOf(c)]++);
    
    // Check if we can shoot the moon
    const highHearts = hand.filter(c => suitOf(c) === "H" && rankOf(c) >= 11).length;
    const isShooting = hand.filter(c => suitOf(c) === "H").length >= 4 && highHearts >= 3 && counts.S >= 2;
    
    const danger = (c) => {
      const s = suitOf(c);
      const r = rankOf(c);
      if (isShooting) return -r;

      if (c === "S12") return counts.S >= 4 ? -20 : 150;
      if (c === "S14" || c === "S13") return counts.S <= 3 ? 90 + r : 40 + r;
      if (s === "H") return 30 + r;
      
      // Voiding bonus
      if ((s === "C" || s === "D") && counts[s] > 0 && counts[s] <= 3) {
        return r + (50 - counts[s] * 10);
      }
      return r;
    };
    
    return [...hand].sort((a, b) => danger(b) - danger(a)).slice(0, 3);
  },

  playCard(view) {
    const { hand, legalMoves: legal, trick, leader, playedCards, handPoints, seat, voids } = view;
    if (legal.length === 1) return legal[0];

    const seen = new Set([...hand, ...playedCards]);
    const unseen = { C: [], D: [], S: [], H: [] };
    for (const s of SUITS) for (let r = 2; r <= 14; r++) if (!seen.has(s + r)) unseen[s].push(r);
    const higherUnseen = (s, rank) => unseen[s].some(r => r > rank);
    const isBoss = (c) => !higherUnseen(suitOf(c), rankOf(c));

    const order = [leader, (leader + 1) % 4, (leader + 2) % 4, (leader + 3) % 4];
    const after = order.slice(trick.length + 1);
    const canBeat = (st, su, rk) => !voids[st][su] && higherUnseen(su, rk);
    const mightBeBeaten = (su, rk) => after.some(st => canBeat(st, su, rk));

    const pts = handPoints.reduce((a, b) => a + b, 0);
    const collectors = handPoints.map((p, i) => p > 0 ? i : -1).filter(i => i >= 0);
    const sole = collectors.length === 1 ? collectors[0] : -1;
    const moonThreat = sole >= 0 && sole !== seat && pts >= 5;
    const iAmShooting = sole === seat && pts >= 8 && hand.filter(c => rankOf(c) >= 12).length >= 1;
    
    const qPlayed = playedCards.includes("S12");
    const iHaveQ = hand.includes("S12");
    const asc = (a, b) => rankOf(a) - rankOf(b);
    const desc = (a, b) => rankOf(b) - rankOf(a);

    // --- LEADING ---
    if (trick.length === 0) {
      if (iAmShooting) {
         const bosses = legal.filter(isBoss);
         if (bosses.length > 0) return bosses.sort(desc)[0];
         return [...legal].sort(desc)[0];
      }

      const spades = legal.filter(c => suitOf(c) === "S");
      if (!qPlayed && !iHaveQ && spades.length > 0 && higherUnseen("S", 0)) {
         const safeSpades = spades.filter(c => rankOf(c) < 12);
         if (safeSpades.length > 0) return safeSpades.sort(desc)[0];
      }

      const scoreLead = (c) => {
        let s = rankOf(c);
        if (c === "S12") s += 1000;
        if (suitOf(c) === "S" && rankOf(c) >= 12 && !qPlayed) s += 300;
        if (suitOf(c) === "H") s += 200;
        if (isBoss(c) && rankOf(c) >= 11) s += 50;
        return s;
      };
      return [...legal].sort((a, b) => scoreLead(a) - scoreLead(b))[0];
    }

    // --- FOLLOWING ---
    const led = suitOf(trick[0].card);
    const ledCards = trick.filter(t => suitOf(t.card) === led);
    const winner = ledCards.reduce((w, t) => rankOf(t.card) > rankOf(w.card) ? t : w, ledCards[0]);
    const winRank = rankOf(winner.card);
    const pointsIn = trick.reduce((s, t) => s + cardPoints(t.card), 0);
    const isLast = trick.length === 3;
    const runnerActive = sole >= 0 && (winner.seat === sole || !trick.some(t => t.seat === sole));

    const follow = legal.filter(c => suitOf(c) === led);
    if (follow.length > 0) {
      const sureWin = follow.filter(c => rankOf(c) > winRank && (isLast || !mightBeBeaten(led, rankOf(c))));
      const anyWin = follow.filter(c => rankOf(c) > winRank);

      if (moonThreat && runnerActive && pointsIn > 0) {
         if (sureWin.length > 0) return sureWin.sort(asc)[0];
         if (anyWin.length > 0) return anyWin.sort(desc)[0];
      }
      if (iAmShooting) {
         if (sureWin.length > 0) return sureWin.sort(asc)[0];
         if (anyWin.length > 0) return anyWin.sort(desc)[0];
      }

      const below = follow.filter(c => rankOf(c) < winRank);
      if (below.length > 0) return below.sort(desc)[0]; 
      if (isLast) return follow.sort(desc)[0]; 
      return follow.sort(asc)[0]; 
    }

    // --- SLOUGHING ---
    let pool = legal;
    if (moonThreat && runnerActive) {
       const safeDump = legal.filter(c => cardPoints(c) === 0);
       if (safeDump.length > 0) pool = safeDump;
    }

    const sloughScore = (c) => {
      if (c === "S12") return 1000;
      if (suitOf(c) === "S" && rankOf(c) >= 13 && !qPlayed) return 800 + rankOf(c);
      if (suitOf(c) === "H") return 400 + rankOf(c);
      return rankOf(c);
    };

    return [...pool].sort((a, b) => sloughScore(b) - sloughScore(a))[0];
  }
};
