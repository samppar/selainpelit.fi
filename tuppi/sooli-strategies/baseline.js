// Sooli-strategia: BASELINE — projektin oletusheuristiikka.
//
// Sooli-strategia toteuttaa NELJÄ funktiota. Kun se on SOOLAAJANA se käyttää
// gift/ret/soolaajaPlay; kun se PUOLUSTAA (ramaajana) se käyttää ramaajaPlay.
//
//   gift(view)        -> Card   soolaaja antaa parilleen (vaarallisin kortti)
//   ret(view)         -> Card   soolaajan pari palauttaa (pienin = paras)
//   soolaajaPlay(view)-> Card   soolaajan lyönti (vältä tikkiä; ässä pienin)
//   ramaajaPlay(view) -> Card   ramaajan lyönti (pakota soolaaja tikkiin)
//
// view on ShowView (gift/ret) tai PlayView (…Play), samat kuin pelaajilla.

import { sooliRank, pickSooliSoolaajaCard, pickSooliRamaajaCard } from "../src/index.js";

const bySooliLow = (a, b) => sooliRank(a) - sooliRank(b);

export function createSooliStrategy() {
  return {
    name: "baseline",

    // Soolaaja antaa korkeimman sooli-arvoisen kortin (kädestä tulee matala).
    gift(view) {
      return [...view.hand].sort(bySooliLow).at(-1);
    },

    // Pari palauttaa matalimman (ässä = paras duunikortti soolaajalle).
    ret(view) {
      return [...view.hand].sort(bySooliLow)[0];
    },

    soolaajaPlay(view) {
      return pickSooliSoolaajaCard(view);
    },

    ramaajaPlay(view) {
      return pickSooliRamaajaCard(view);
    },
  };
}

export default createSooliStrategy;
