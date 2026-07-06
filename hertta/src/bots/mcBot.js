// mcBot.js — McBrain-henkinen hakubotti (yyjhao/html5-hearts, js/McBrain.js).
// Sama perusidea kuin PIMC:ssä, mutta ratkaiseva parannus: YHTEISARVONTA
// (common random numbers). Kussakin arvotussa maailmassa arvioidaan KAIKKI
// ehdokassiirrot samalla jaolla ja summataan. Koska kaikkia siirtoja verrataan
// identtisissä olosuhteissa, arvioiden välinen varianssi pienenee rajusti ja
// paras siirto erottuu selvemmin samalla laskentabudjetilla.
//
// Käyttää moottorin reilua simulaattoria (view.sim). Jakovaiheessa Pro.

import pro from "./proBot.js";

export default {
  name: "MC (yhteisarvonta)",

  passCards(view) {
    return pro.passCards(view);
  },

  playCard(view) {
    const legal = view.legalMoves;
    if (legal.length === 1) return legal[0];
    if (!view.sim || typeof view.sim.sampleWorld !== "function") return pro.playCard(view);

    const sim = view.sim;
    const policy = sim.defaultPolicy;
    const seat = view.seat;
    const rootTrickLen = view.trick.length;
    const rootTrickNo = view.trickNumber;

    // Sama laskentabudjetti kuin PIMC:llä (samples × legal rollouttia), mutta
    // yhteisarvonnan ansiosta tarkempi. Enemmän näytteitä loppupelissä.
    const base = view.trickNumber >= 8 ? 38 : view.trickNumber >= 4 ? 28 : 20;
    const samples = Math.max(10, Math.round(base / Math.max(1, legal.length / 3)));

    const totals = legal.map(() => 0);
    for (let s = 0; s < samples; s++) {
      const world = sim.sampleWorld(); // yksi jako — kaikille ehdokkaille sama
      for (let i = 0; i < legal.length; i++) {
        const c = legal[i];
        const forced = (st, v) =>
          (st === seat && v.trickNumber === rootTrickNo && v.trick.length === rootTrickLen
            && v.legalMoves.includes(c) ? c : policy(st, v));
        totals[i] += sim.playout(world, forced).score[seat];
      }
    }

    let best = 0;
    for (let i = 1; i < legal.length; i++) if (totals[i] < totals[best]) best = i;
    return legal[best];
  },
};
