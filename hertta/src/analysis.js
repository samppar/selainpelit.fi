// analysis.js — jaetut, VAIN julkiseen tietoon perustuvat apufunktiot boteille.
// (Inspiroitu tuppi-js/src/analysis.js:stä.) Nämä johtavat kaiken omasta
// kädestä + pelatuista korteista, joten käyttö on täysin sallittua eikä paljasta
// muiden käsiä. Botin ei ole pakko käyttää näitä.

import { SUITS, suitOf, rankOf } from "./utils.js";

/** Kortit joita et näe: eivät kädessäsi eivätkä pelattuja (= muiden piilossa). */
export function unseenCards(view) {
  const seen = new Set([...view.hand, ...view.playedCards]);
  const out = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) { const c = s + r; if (!seen.has(c)) out.push(c); }
  return out;
}

/** Näkymättömät kortit annetussa maassa, korkeimmasta matalimpaan. */
export function unseenInSuit(view, suit) {
  return unseenCards(view).filter((c) => suitOf(c) === suit).sort((a, b) => rankOf(b) - rankOf(a));
}

/** Onko korkeampi kortti samassa maassa vielä näkymättä (= voi hävitä sille)? */
export function higherUnseen(view, suit, rank) {
  const seen = new Set([...view.hand, ...view.playedCards]);
  for (let r = rank + 1; r <= 14; r++) if (!seen.has(suit + r)) return true;
  return false;
}

/** Onko kortti korkein jäljellä oleva maassaan (= "boss", voittaa varmasti)? */
export function isBoss(view, card) {
  return !higherUnseen(view, suitOf(card), rankOf(card));
}

/** Montako korttia annetulla paikalla on vielä kädessä juuri nyt. */
export function cardsRemaining(view, seat) {
  const inTrick = view.trick.some((t) => t.seat === seat) ? 1 : 0;
  return 13 - view.trickNumber - inTrick;
}

/** Rakenna view.analysis-olio, jonka metodit on sidottu tähän näkymään.
 *  Näin myös liitetyt (import-vapaat) botit saavat samat apurit valmiina. */
export function makeAnalysis(view) {
  return {
    unseenCards: () => unseenCards(view),
    unseenInSuit: (suit) => unseenInSuit(view, suit),
    higherUnseen: (suit, rank) => higherUnseen(view, suit, rank),
    isBoss: (card) => isBoss(view, card),
    cardsRemaining: (seat) => cardsRemaining(view, seat),
  };
}
