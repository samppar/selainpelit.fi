// Aino — "Rohkea". Laskee kortit ja METSÄSTÄÄ kakkoslopetuksia. Kun hän pitää
// kakkosta ja saman maan huippukorttia ja maa vaikuttaa tyhjennettävältä, hän
// ajaa maata korkeilla korteillaan, suojelee kakkosta ja yrittää lopettaa
// siihen — vaikka se on riskialtista ja maksaa joskus tavallisen tikin.
import { baseChoice, suitInfo, twoPlan, planChoice } from "./base.js";

export const aino = {
  name: "Aino",
  style: "Rohkea — laskee kortit ja tavoittelee aktiivisesti kakkoslopetusta",
  chooseCard(view) {
    const info = suitInfo(view);
    const plan = twoPlan(view, info, "hunt");   // sekä varma että tavoitteleva
    if (plan) { const c = planChoice(view, info, plan); if (c) return c; }
    return baseChoice(view, info);
  }
};
