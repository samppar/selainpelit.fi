import { SUITS, suitOf, rankOf, cardPoints } from "../utils.js";

// Helper for unseen cards
function unseenTracker(hand, playedCards) {
  const seen = new Set([...hand, ...playedCards]);
  return {
    higherUnseen(suit, rank) {
      for (let r = rank + 1; r <= 14; r++) {
        if (!seen.has(suit + r)) return true;
      }
      return false;
    }
  };
}

export default {
  name: "Antigravity",

  passCards(view) {
    const { hand } = view;
    const counts = { C: 0, D: 0, S: 0, H: 0 };
    hand.forEach(c => counts[suitOf(c)]++);
    
    // Consider shooting the moon if hand is very strong
    const hearts = hand.filter(c => suitOf(c) === "H");
    const highHearts = hearts.filter(c => rankOf(c) >= 12).length;
    const aces = hand.filter(c => rankOf(c) === 14).length;
    const kings = hand.filter(c => rankOf(c) === 13).length;
    const spadeControl = hand.filter(c => suitOf(c) === "S" && rankOf(c) >= 12).length;
    const shootScore = highHearts * 2 + Math.max(0, hearts.length - 3) + aces * 1.5 + kings + spadeControl;
    
    const isShooting = hearts.length >= 4 && shootScore >= 9;

    const danger = (c) => {
      const s = suitOf(c);
      const r = rankOf(c);
      
      if (isShooting) {
         // Keep high cards, pass low cards
         if (r < 10) return 100 - r; 
         return -r;
      }

      let d = r;
      if (c === "S12") {
        d = counts.S >= 4 ? -20 : 150;
      } else if (c === "S14" || c === "S13") {
        d = counts.S <= 3 ? 90 + r : 40 + r;
      } else if (s === "H") {
        d = 30 + r;
      } else if (s === "S") {
        d = counts.S >= 4 ? -r : r;
      }
      
      // Voiding bonus
      if ((s === "C" || s === "D") && counts[s] > 0 && counts[s] <= 3) {
        d += 40 - counts[s] * 10;
      }
      
      return d;
    };
    
    return [...hand].sort((a, b) => danger(b) - danger(a)).slice(0, 3);
  },

  playCard(view) {
    const { hand, legalMoves: legal, trick, playedCards, handPoints, seat, voids, leader } = view;
    if (legal.length === 1) return legal[0];

    const asc = (a, b) => rankOf(a) - rankOf(b);
    const desc = (a, b) => rankOf(b) - rankOf(a);

    const { higherUnseen } = unseenTracker(hand, playedCards);
    const isBoss = (c) => !higherUnseen(suitOf(c), rankOf(c));

    const qPlayed = playedCards.includes("S12");
    const iHaveQ = hand.includes("S12");
    
    const pts = handPoints.reduce((a, b) => a + b, 0);
    const collectors = handPoints.map((p, i) => p > 0 ? i : -1).filter(i => i >= 0);
    const sole = collectors.length === 1 ? collectors[0] : -1;
    const moonThreat = sole >= 0 && sole !== seat && pts >= 5;
    
    // Am I shooting?
    const iAmShooting = sole === seat && pts >= 8 && hand.filter(c => rankOf(c) >= 12).length >= 1;

    // --- LEADING ---
    if (trick.length === 0) {
      if (iAmShooting) {
         const bosses = legal.filter(isBoss);
         if (bosses.length > 0) return bosses.sort(desc)[0];
         return [...legal].sort(desc)[0];
      }

      // Safe leading
      const spades = legal.filter(c => suitOf(c) === "S");
      if (!qPlayed && !iHaveQ && spades.length > 0 && higherUnseen("S", 0)) {
         const safeSpades = spades.filter(c => rankOf(c) < 12);
         if (safeSpades.length > 0) return safeSpades.sort(desc)[0];
      }

      const scoreLead = (c) => {
        let s = rankOf(c);
        if (c === "S12") s += 1000;
        if (suitOf(c) === "H") s += 200;
        if (suitOf(c) === "S" && rankOf(c) >= 12 && !qPlayed) s += 300;
        if (isBoss(c) && rankOf(c) >= 11) s += 50;
        return s;
      };
      
      return [...legal].sort((a, b) => scoreLead(a) - scoreLead(b))[0];
    }

    // --- FOLLOWING / SLOUGHING ---
    const led = suitOf(trick[0].card);
    const follow = legal.filter(c => suitOf(c) === led);
    const ledCards = trick.filter(t => suitOf(t.card) === led);
    const winner = ledCards.reduce((w, t) => rankOf(t.card) > rankOf(w.card) ? t : w, ledCards[0]);
    const winRank = rankOf(winner.card);
    const isLast = trick.length === 3;

    // Check if anyone behind us might beat a given rank
    const order = [leader, (leader + 1) % 4, (leader + 2) % 4, (leader + 3) % 4];
    const after = order.slice(trick.length + 1);
    const mightBeBeaten = (suit, rank) => after.some(st => !voids[st][suit] && higherUnseen(suit, rank));

    if (follow.length > 0) {
      const sureWin = follow.filter(c => rankOf(c) > winRank && (isLast || !mightBeBeaten(led, rankOf(c))));
      const anyWin = follow.filter(c => rankOf(c) > winRank);

      if (iAmShooting || (moonThreat && winner.seat !== sole)) {
         if (sureWin.length > 0) return sureWin.sort(asc)[0];
         if (anyWin.length > 0) return anyWin.sort(desc)[0];
      }

      const below = follow.filter(c => rankOf(c) < winRank);
      if (below.length > 0) {
         // Duck with highest possible safe card
         return below.sort(desc)[0];
      }
      
      if (isLast) {
         return follow.sort(desc)[0];
      } else {
         return follow.sort(asc)[0];
      }
    }

    // --- SLOUGHING ---
    let pool = legal;
    if (moonThreat) {
       const winnerSeat = winner.seat;
       if (winnerSeat !== sole) {
          // DO NOT GIVE POINTS TO NON-SHOOTER!
          const safeDump = legal.filter(c => cardPoints(c) === 0);
          if (safeDump.length > 0) pool = safeDump;
       }
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
