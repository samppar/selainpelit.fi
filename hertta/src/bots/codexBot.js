// codexBot.js — opportunistinen vahva botti.
// Puolustaa Pro-logiikalla, mutta yrittää kuun ampumista, kun käsi on siihen sopiva.

import pro from "./proBot.js";
import { suitOf, rankOf } from "../utils.js";

const SHOOT_THRESHOLD = 10;

const asc = (a, b) => rankOf(a) - rankOf(b);
const desc = (a, b) => rankOf(b) - rankOf(a);

function shootStrength(hand) {
  const hearts = hand.filter((c) => suitOf(c) === "H");
  const highHearts = hearts.filter((c) => rankOf(c) >= 12).length;
  const aces = hand.filter((c) => rankOf(c) === 14).length;
  const kings = hand.filter((c) => rankOf(c) === 13).length;
  const queens = hand.filter((c) => rankOf(c) === 12).length;
  const spadeControl = hand.filter((c) => suitOf(c) === "S" && rankOf(c) >= 12).length;
  const longHearts = Math.max(0, hearts.length - 3);
  return highHearts * 2 + longHearts + aces * 1.5 + kings + queens * 0.35 + spadeControl;
}

function shootable(hand) {
  return hand.filter((c) => suitOf(c) === "H").length >= 4 &&
    shootStrength(hand) >= SHOOT_THRESHOLD;
}

function decideShooting(view) {
  const others = view.handPoints.reduce((sum, p, i) => (i === view.seat ? sum : sum + p), 0);
  if (others > 0) return false;
  if (view.handPoints[view.seat] > 0) return true;
  return shootable(view.hand);
}

function unseenTracker(hand, playedCards) {
  const seen = new Set([...hand, ...playedCards]);
  return {
    higherUnseen(suit, rank) {
      for (let r = rank + 1; r <= 14; r++) if (!seen.has(suit + r)) return true;
      return false;
    },
  };
}

export default {
  name: "Codex",

  passCards(view) {
    const hand = view.hand;
    if (!shootable(hand)) return pro.passCards(view);

    const keepScore = (c) => {
      if (c === "S12") return 120;
      if (rankOf(c) === 14) return 110;
      if (rankOf(c) === 13) return 95;
      if (suitOf(c) === "H") return 70 + rankOf(c);
      if (suitOf(c) === "S" && rankOf(c) >= 12) return 88 + rankOf(c);
      if (rankOf(c) === 12) return 48;
      return rankOf(c);
    };

    return [...hand].sort((a, b) => keepScore(a) - keepScore(b) || asc(a, b)).slice(0, 3);
  },

  playCard(view) {
    if (!decideShooting(view)) return pro.playCard(view);

    const { hand, legalMoves: legal, trick, leader, playedCards, voids } = view;
    if (legal.length === 1) return legal[0];

    const { higherUnseen } = unseenTracker(hand, playedCards);
    const isBoss = (c) => !higherUnseen(suitOf(c), rankOf(c));
    const order = [leader, (leader + 1) % 4, (leader + 2) % 4, (leader + 3) % 4];
    const after = order.slice(trick.length + 1);
    const mightBeBeaten = (suit, rank) =>
      after.some((seat) => !voids[seat][suit] && higherUnseen(suit, rank));

    if (trick.length === 0) {
      const bosses = legal.filter(isBoss);
      const pool = bosses.length ? bosses : legal;
      return [...pool].sort(desc)[0];
    }

    const led = suitOf(trick[0].card);
    const ledRanks = trick.filter((t) => suitOf(t.card) === led).map((t) => rankOf(t.card));
    const winRank = Math.max(...ledRanks);
    const follow = legal.filter((c) => suitOf(c) === led);

    if (follow.length) {
      const sureWins = follow.filter((c) =>
        rankOf(c) > winRank && (trick.length === 3 || !mightBeBeaten(led, rankOf(c))));
      if (sureWins.length) return sureWins.sort(asc)[0];

      const anyWins = follow.filter((c) => rankOf(c) > winRank);
      if (anyWins.length) return anyWins.sort(desc)[0];

      return follow.sort(asc)[0];
    }

    return [...legal].sort((a, b) => {
      const pa = codexDiscardScore(a);
      const pb = codexDiscardScore(b);
      return pa - pb || asc(a, b);
    })[0];
  },
};

function codexDiscardScore(c) {
  if (suitOf(c) === "H") return 100 + rankOf(c);
  if (c === "S12") return 90;
  if (rankOf(c) >= 13) return 70 + rankOf(c);
  return rankOf(c);
}
