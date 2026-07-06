// custom-bot-example.js — ITSENÄINEN esimerkkibotti liitettäväksi peliin.
//
// Tämän voi antaa kenelle tahansa (tai kielimallille) täytettäväksi.
// EI import-lauseita: kaikki apufunktiot tulevat view.util:sta.
// Liitä valmis koodi pelin alkuvalikossa kohtaan "Oma botti (liitä koodi)".
//
// Kortti = maakirjain + arvo: C=risti D=ruutu S=pata H=hertta, 2..14 (11=J..14=A).
// Pisteet: jokainen hertta 1, patarouva "S12" 13. Tavoite: mahdollisimman vähän.

export default {
  name: "Esimerkkibotti",

  // Palauta TASAN 3 korttia view.hand:ista vaihdettavaksi.
  // view = { seat, hand, direction, scores, util }
  passCards(view) {
    const { rankOf } = view.util;
    // Vaihda 3 korkeinta korttia.
    return [...view.hand].sort((a, b) => rankOf(b) - rankOf(a)).slice(0, 3);
  },

  // Palauta YKSI kortti view.legalMoves:ista.
  // view = { seat, hand, legalMoves, trick:[{seat,card}], leader, leadSuit,
  //          heartsBroken, trickNumber, playedCards, scores, handPoints, voids, util }
  playCard(view) {
    const { legalMoves, trick, util } = view;
    const { suitOf, rankOf, cardPoints } = util;
    if (legalMoves.length === 1) return legalMoves[0];

    // Aloitus: johda matalin kortti.
    if (trick.length === 0) {
      return [...legalMoves].sort((a, b) => rankOf(a) - rankOf(b))[0];
    }

    // Seuranta: väistä pisteet.
    const led = suitOf(trick[0].card);
    const winRank = Math.max(...trick.filter((t) => suitOf(t.card) === led).map((t) => rankOf(t.card)));
    const follow = legalMoves.filter((c) => suitOf(c) === led);

    if (follow.length) {
      const losing = follow.filter((c) => rankOf(c) < winRank);
      if (losing.length) return losing.sort((a, b) => rankOf(b) - rankOf(a))[0]; // korkein häviävä
      return follow.sort((a, b) => rankOf(a) - rankOf(b))[0];                    // pakko voittaa → matalin
    }

    // Tyhjä maa: pudota vaarallisin (rouva, korkeat hertat, korkein).
    const danger = (c) => (c === "S12" ? 100 : suitOf(c) === "H" ? 40 + rankOf(c) : rankOf(c));
    return [...legalMoves].sort((a, b) => danger(b) - danger(a))[0];
  },
};
