// basicBot.js — yksinkertainen perusheuristiikka. Hyvä vertailukohta.

import { suitOf, rankOf, cardPoints } from "../utils.js";

export default {
  name: "Basic",

  passCards(view) {
    // Vaihda 3 korkeinta korttia.
    return [...view.hand].sort((a, b) => rankOf(b) - rankOf(a)).slice(0, 3);
  },

  playCard(view) {
    const { legalMoves: legal, trick } = view;
    if (legal.length === 1) return legal[0];

    if (trick.length === 0) {
      // Johda matalin kortti.
      return [...legal].sort((a, b) => rankOf(a) - rankOf(b))[0];
    }

    const led = suitOf(trick[0].card);
    const winRank = Math.max(...trick.filter((t) => suitOf(t.card) === led).map((t) => rankOf(t.card)));
    const follow = legal.filter((c) => suitOf(c) === led);

    if (follow.length) {
      const losing = follow.filter((c) => rankOf(c) < winRank);
      if (losing.length) return losing.sort((a, b) => rankOf(b) - rankOf(a))[0]; // korkein häviävä
      return follow.sort((a, b) => rankOf(a) - rankOf(b))[0]; // pakko voittaa → matalin
    }

    // Tyhjä maa: pudota rouva, sitten korkeat hertat, sitten korkein.
    const rank = (c) => (c === "S12" ? 100 : suitOf(c) === "H" ? 40 + rankOf(c) : rankOf(c));
    return [...legal].sort((a, b) => rank(b) - rank(a))[0];
  },
};
