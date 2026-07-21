// Sooli-strategia: TEMPLATE — kopioi tämä ja kirjoita oma sooli-tekoälysi.
//
// Tavoitteet:
//   SOOLAAJANA  et saa ottaa yhtään tikkiä (ässä on PIENIN, pelaat viimeisenä).
//   PUOLUSTAJANA pakota soolaaja ottamaan tikki (pidä pöytä matalana).
//
// Testaa itsesi:
//   node sooli-eval.js sooli-strategies/template.js
//   node sooli-tournament.mjs template baseline --deals 3000
//
// Vinkkejä view'sta (PlayView):
//   view.legalMoves     sallitut kortit (maantuntopakko)
//   view.ledSuit        aloitusmaa (null jos aloitat — soolaaja ei koskaan)
//   view.currentTrick   pöydässä olevat [seat, card] ennen sinua
//   view.sooli === true, view.soolaaja = soolaajan paikka
//   sooliRank(card): ässä -> 1, muut ennallaan.

import { sooliRank } from "../src/index.js";

const low = (a, b) => sooliRank(a) - sooliRank(b);

export function createSooliStrategy() {
  return {
    name: "template",

    // Soolaaja antaa parilleen yhden kortin (vaihdossa saa matalan tilalle).
    gift(view) {
      return [...view.hand].sort(low).at(-1); // anna vaarallisin (korkein)
    },

    // Soolaajan pari palauttaa yhden kortin (yritä antaa pienin).
    ret(view) {
      return [...view.hand].sort(low)[0];
    },

    // Soolaajan lyönti: vältä tikkiä.
    soolaajaPlay(view) {
      // TODO: oma logiikka. Yksinkertainen: pelaa matalin sallittu.
      return [...view.legalMoves].sort(low)[0];
    },

    // Ramaajan lyönti: pakota soolaaja tikkiin.
    ramaajaPlay(view) {
      // TODO: oma logiikka. Yksinkertainen: pelaa matalin sallittu.
      return [...view.legalMoves].sort(low)[0];
    },
  };
}

export default createSooliStrategy;
