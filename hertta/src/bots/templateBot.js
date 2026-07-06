// templateBot.js — POHJA omalle botille.
// Kopioi tämä tiedosto (esim. bots/minunBot.js), toteuta logiikka ja
// rekisteröi se botRegistry.js:ssä. Botti toimii sellaisenaan (pelaa
// laillisesti) kunnes korvaat oletuslogiikan omallasi.
//
// ── RAJAPINTA ────────────────────────────────────────────────
// Kortti: maakirjain + arvo. Maat C/D/S/H, arvot 2..14 (11=J..14=A).
// Pisteet: jokainen hertta (H..) = 1, patarouva "S12" = 13.
//
// passCards(view) → palauta TÄSMÄLLEEN 3 korttia view.hand:ista.
//   view = { seat, hand, direction: "left"|"right"|"across", scores }
//
// playCard(view) → palauta YKSI kortti view.legalMoves:ista.
//   view = {
//     seat,           // oma paikkasi 0..3
//     hand,           // omat korttisi (lajiteltu)
//     legalMoves,     // kortit jotka saat pelata NYT
//     trick,          // [{seat, card}] tähän tikkiin jo pelatut
//     leader,         // tikin aloittajan paikka
//     leadSuit,       // aloitusmaa tai null jos aloitat itse
//     heartsBroken,   // onko hertta jo murrettu
//     trickNumber,    // 0..12
//     playedCards,    // kaikki jaossa pelatut kortit (korttien laskentaan)
//     scores,         // pelin kokonaispisteet [4]
//     handPoints,     // tässä jaossa kerätyt pisteet [4]
//     voids,          // [{C,D,S,H}] päätellyt tyhjät maat per paikka
//   }
//
// HUOM: näet vain oman kätesi — et muiden. Jos palautat laittoman
// siirron tai kaadut, moottori valitsee turvallisen laillisen siirron.

import { suitOf, rankOf } from "../utils.js";

export default {
  name: "Template",

  passCards(view) {
    // TODO: oma vaihtostrategiasi. Oletus: 3 korkeinta korttia.
    return [...view.hand].sort((a, b) => rankOf(b) - rankOf(a)).slice(0, 3);
  },

  playCard(view) {
    // TODO: oma pelistrategiasi. Oletus: matalin laillinen kortti.
    return [...view.legalMoves].sort((a, b) => rankOf(a) - rankOf(b))[0];
  },
};
