// Satunnaispelaaja — pienin mahdollinen esimerkki.
//
// TÄMÄ ON MALLIPOHJA uudelle pelaajalle. Kopioi tämä tiedosto, nimeä
// luokka ja tiedosto uudelleen ja korvaa logiikka omallasi.
//
// Vaatimukset uudelle pelaajalle:
//   1. Peri TuppiPlayer.
//   2. Toteuta chooseShow(view) -> 'rami' | 'nolo'.
//   3. Toteuta playCard(view) -> Card (kortin ON oltava view.legalMoves).
//   4. Vie oletusfunktio createPlayer() -> TuppiPlayer.

import { RNG, TuppiPlayer } from "../src/index.js";

export class RandomPlayer extends TuppiPlayer {
  static defaultName = "Satku";

  constructor(name = null, seed = null) {
    super(name);
    this.rng = new RNG(seed);
  }

  chooseShow(view) {
    // Naiivi: näytä ramia jos kädessä on kovia kortteja, muuten nolo.
    const highs = view.hand.filter((c) => c.rank >= 13).length; // K, A
    return highs >= 3 ? "rami" : "nolo";
  }

  playCard(view) {
    // Lyö satunnainen sallittu kortti.
    return this.rng.choice(view.legalMoves);
  }
}

export default function createPlayer() {
  return new RandomPlayer();
}
