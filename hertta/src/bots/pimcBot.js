// pimcBot.js — hakupohjainen botti (PIMC = Perfect Information Monte Carlo).
// Käyttää moottorin REILUA simulaattoria (view.sim): arpoo useita mahdollisia
// vastustajien käsiä (yhteensopivia pelatun historian ja tyhjien maiden kanssa),
// pelaa jaon loppuun jokaisella ehdokas­siirrolla ja valitsee siirron, joka
// tuottaa keskimäärin pienimmän oman pistesaldon. Näkee vain reilun näkymän.
//
// Vaatii moottorin, joka tarjoaa view.sim:n (sampleWorld / playout / evaluate).
// Jakovaiheessa nojaa Pron todistettuun heuristiikkaan (haku sopii pelivaiheeseen).

import pro from "./proBot.js";
import { suitOf, rankOf } from "../utils.js";

export default {
  name: "PIMC (haku)",

  passCards(view) {
    return pro.passCards(view);
  },

  playCard(view) {
    const legal = view.legalMoves;
    if (legal.length === 1) return legal[0];

    // Ei simulaattoria saatavilla (vanha moottori) → turvallinen fallback Prohon.
    if (!view.sim || typeof view.sim.evaluate !== "function") return pro.playCard(view);

    // Skaalaa näytemäärä: enemmän näytteitä loppupelissä (halvempi rollout) ja
    // kun vaihtoehtoja on vähän. Rajaa laskenta järkeväksi turnauksissa.
    const base = view.trickNumber >= 8 ? 38 : view.trickNumber >= 4 ? 28 : 20;
    const samples = Math.max(10, Math.round(base / Math.max(1, legal.length / 3)));

    // Kevyt, nopea rollout-politiikka (moottorin oletus) → moninkertaisesti
    // enemmän näytteitä samassa ajassa. Haun arvo tulee näytteiden määrästä.
    const policy = view.sim.defaultPolicy;

    let best = legal[0], bestVal = Infinity;
    for (const c of legal) {
      const val = view.sim.evaluate(c, { samples, policy });
      if (val < bestVal - 1e-9) { bestVal = val; best = c; }
    }
    return best;
  },
};
