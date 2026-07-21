// Väinö — "Tarkka". Laskee kortit ja pelaa samaa vankkaa perusstrategiaa, mutta
// tunnistaa VARMAN kakkoslopetuksen: jos laskenta osoittaa maan loppuneen
// muilta ja hän pitää sen kakkosta, hän lopettaa siihen kahdesta pisteestä.
// Ei jahtaa lopetusta spekulatiivisesti — ottaa vain ilmaisen tilaisuuden.
import { baseChoice, suitInfo, twoPlan, planChoice } from "./base.js";

export const vaino = {
  name: "Väinö",
  style: "Tarkka — laskee kortit, ottaa vain varman kakkoslopetuksen",
  chooseCard(view) {
    const info = suitInfo(view);
    const plan = twoPlan(view, info, "sure");   // vain committed (maa jo kuollut)
    if (plan) { const c = planChoice(view, info, plan); if (c) return c; }
    return baseChoice(view, info);
  }
};
