// randomBot.js — satunnainen laillinen siirto. Nollataso-vertailukohta.

export default {
  name: "Random",

  passCards(view) {
    const h = [...view.hand];
    const picks = [];
    while (picks.length < 3) picks.push(h.splice((Math.random() * h.length) | 0, 1)[0]);
    return picks;
  },

  playCard(view) {
    const l = view.legalMoves;
    return l[(Math.random() * l.length) | 0];
  },
};
