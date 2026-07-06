// shooterBot.js — puhallushakuinen tekoäly.
// Arvioi JO korttien vaihdossa, onko käsi puhalluskelpoinen (kuun ampuminen).
// Jos on: säilyttää korkeat voittajat ja hertat, antaa pois matalat "vuotokortit",
// ja pelaa tikkivaiheessa hyökkäävästi kerätäkseen kaikki 26 pistettä.
// Jos ei (tai puhallus katkeaa): puolustaa Pro-botin logiikalla.

import pro from "./proBot.js";
import { suitOf, rankOf } from "../utils.js";

const THRESH = 10; // puhalluskelpoisuuden kynnys (viritetty simulaatiolla: ~43% pelivoittoja 3 Prota vastaan)

function shootStrength(hand) {
  const hearts = hand.filter((c) => suitOf(c) === "H");
  const highHearts = hearts.filter((c) => rankOf(c) >= 12).length; // Q,K,A hertat
  const aces = hand.filter((c) => rankOf(c) === 14).length;
  const kings = hand.filter((c) => rankOf(c) === 13).length;
  const spadeCtrl = hand.filter((c) => suitOf(c) === "S" && rankOf(c) >= 12).length;
  return highHearts * 2 + Math.max(0, hearts.length - 3) + aces * 1.5 + kings + spadeCtrl;
}

function shootable(hand) {
  const hearts = hand.filter((c) => suitOf(c) === "H").length;
  return hearts >= 4 && shootStrength(hand) >= THRESH;
}

// Yritetäänkö puhallusta juuri nyt? Pääteltävä pelkästä näkymästä joka kutsulla.
function decideShooting(view) {
  const others = view.handPoints.reduce((s, p, i) => (i !== view.seat ? s + p : s), 0);
  if (others > 0) return false;          // joku muu sai pisteen → mahdotonta
  if (view.handPoints[view.seat] > 0) return true; // olen ainoa kerääjä → jatka
  return shootable(view.hand);           // ei vielä pisteitä → päätä käden mukaan
}

export default {
  name: "Shooter",

  passCards(view) {
    const hand = view.hand;
    if (!shootable(hand)) return pro.passCards(view); // ei puhallusta → puolustus

    // Puhallustila: pidä voittajat (A/K, hertat, patarouva), anna pois matalat.
    const keepScore = (c) => {
      if (c === "S12") return 100;                 // patarouva: pidä (voitat sillä)
      if (rankOf(c) >= 13) return 90;              // A, K
      if (suitOf(c) === "H") return 50 + rankOf(c);// hertat: pidä kaikki
      if (rankOf(c) >= 12) return 60;              // Q
      return rankOf(c);
    };
    return [...hand].sort((a, b) => keepScore(a) - keepScore(b)).slice(0, 3);
  },

  playCard(view) {
    if (!decideShooting(view)) return pro.playCard(view); // puolustus Pro-logiikalla

    const { hand, legalMoves: legal, trick, leader, playedCards, voids } = view;
    if (legal.length === 1) return legal[0];

    const seen = new Set([...hand, ...playedCards]);
    const higherUnseen = (s, rank) => {
      for (let r = rank + 1; r <= 14; r++) if (!seen.has(s + r)) return true;
      return false;
    };
    const isBoss = (c) => !higherUnseen(suitOf(c), rankOf(c));
    const order = [leader, (leader + 1) % 4, (leader + 2) % 4, (leader + 3) % 4];
    const after = order.slice(trick.length + 1);
    const mightBeBeaten = (su, rk) => after.some((st) => !voids[st][su] && higherUnseen(su, rk));
    const asc = (a, b) => rankOf(a) - rankOf(b);
    const desc = (a, b) => rankOf(b) - rankOf(a);

    // Aloitus: johda varma voittaja (boss), muuten korkein.
    if (trick.length === 0) {
      const bosses = legal.filter(isBoss);
      return (bosses.length ? bosses : legal).sort(desc)[0];
    }

    // Seuranta: voita tikki, jotta pisteet päätyvät minulle.
    const led = suitOf(trick[0].card);
    const winRank = Math.max(...trick.filter((t) => suitOf(t.card) === led).map((t) => rankOf(t.card)));
    const follow = legal.filter((c) => suitOf(c) === led);
    if (follow.length) {
      const sure = follow.filter((c) => rankOf(c) > winRank && (trick.length === 3 || !mightBeBeaten(led, rankOf(c))));
      if (sure.length) return sure.sort(asc)[0]; // halvin varma voittaja (säästä korkeat)
      const any = follow.filter((c) => rankOf(c) > winRank);
      if (any.length) return any.sort(desc)[0];  // paras yritys: korkein
      return follow.sort(asc)[0];                // ei voi voittaa → matalin
    }
    return [...legal].sort(asc)[0]; // tyhjä maa: ei voi voittaa → matalin
  },
};
