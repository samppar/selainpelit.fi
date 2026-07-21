// Vapaaehtoisia apufunktioita pelaajille.
//
// Nämä on rakennettu VAIN julkisesta tiedosta (oma käsi + pelatut kortit),
// joten niiden käyttö on täysin sallittua. Pelaajien ei ole pakko käyttää
// näitä — voit kirjoittaa oman analyysin.

import { fullDeck } from "./cards.js";

/**
 * Kortit joita et näe: eivät kädessäsi eivätkä pelattuja.
 * Nämä ovat vastustajien + parin piilossa olevat kortit. Palauttaa Setin.
 */
export function unseenCards(view) {
  const seen = new Set(view.hand);
  for (const c of view.cardsPlayed) seen.add(c);
  const out = new Set();
  for (const c of fullDeck()) if (!seen.has(c)) out.add(c);
  return out;
}

/** Näkymättömät kortit annetussa maassa, korkeimmasta matalimpaan. */
export function unseenInSuit(view, suit) {
  const cards = [...unseenCards(view)].filter((c) => c.suit === suit);
  cards.sort((a, b) => b.rank - a.rank);
  return cards;
}

/**
 * Onko kortti korkein jäljellä oleva (näkymätön) kyseisessä maassa? Ts.
 * voittaako se varmasti jos sillä aloittaa.
 */
export function isBoss(view, card) {
  for (const c of unseenCards(view)) {
    if (c.suit === card.suit && c.rank > card.rank) return false;
  }
  return true;
}

/**
 * Päättele mistä maasta kukin paikka on tyhjä: jos pelaaja sakkasi
 * (ei tunnustanut aloitusmaata), hänellä ei ole sitä maata.
 * Palauttaa { seat: Set<suit> }.
 */
export function voidsFromHistory(view) {
  const voids = { 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set() };
  const tricks = [...view.history];
  if (view.currentTrick.length) tricks.push(view.currentTrick);
  for (const trick of tricks) {
    if (!trick.length) continue;
    const led = trick[0][1].suit;
    for (const [seat, card] of trick) {
      if (card.suit !== led) voids[seat].add(led);
    }
  }
  return voids;
}

/** Montako korttia annetulla paikalla on vielä kädessä. */
export function cardsRemainingInHand(view, seat) {
  let played = 0;
  for (const trick of view.history) for (const [s] of trick) if (s === seat) played++;
  for (const [s] of view.currentTrick) if (s === seat) played++;
  return 13 - played;
}

/**
 * Johtaisiko 'card' kierrosta heti lyönnin jälkeen? Ts. lyötkö tähän
 * mennessä korkeimman aloitusmaan kortin. (Perässä tulevat voivat vielä
 * ohittaa, mutta tämä kertoo tilanteen juuri nyt.)
 */
export function leadsAfterPlaying(currentTrick, card, seat) {
  const hypo = [...currentTrick, [seat, card]];
  const led = hypo[0][1].suit;
  let bestSeat = hypo[0][0];
  let bestRank = hypo[0][1].rank;
  for (let i = 1; i < hypo.length; i++) {
    const [s, c] = hypo[i];
    if (c.suit === led && c.rank > bestRank) {
      bestSeat = s;
      bestRank = c.rank;
    }
  }
  return bestSeat === seat;
}
