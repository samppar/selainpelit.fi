// claudeBot.js — vahva Hertta-botti (Claude).
// Perusta: perii Codexin koko vahvuuden (Pro-puolustus + kuun ampuminen).
// Lisäetu: void-tietoinen JOHTAMINEN — kun aloitan tikin enkä ammu kuuta,
// vältän johtamasta maata, jossa takanani oleva vastustaja on jo tyhjä
// (hän voisi pudottaa rouvan/hertan minun voittamaani tikkiin), ja suosin
// lyhyen sivumaan tyhjentämistä saadakseni pudotusvoimaa myöhemmin.

import codex from "./codexBot.js";
import { SUITS, suitOf, rankOf } from "../utils.js";

// Sama kuun-ampumisen arvio kuin Codexilla, jotta tiedämme milloin
// johtaminen kannattaa jättää Codexin (hyökkäävän) logiikan hoidettavaksi.
function shootStrength(hand) {
  const hearts = hand.filter((c) => suitOf(c) === "H");
  const highHearts = hearts.filter((c) => rankOf(c) >= 12).length;
  const aces = hand.filter((c) => rankOf(c) === 14).length;
  const kings = hand.filter((c) => rankOf(c) === 13).length;
  const queens = hand.filter((c) => rankOf(c) === 12).length;
  const spadeControl = hand.filter((c) => suitOf(c) === "S" && rankOf(c) >= 12).length;
  const longHearts = Math.max(0, hearts.length - 3);
  return highHearts * 2 + longHearts + aces * 1.5 + kings + queens * 0.35 + spadeControl;
}
function shootable(hand) {
  return hand.filter((c) => suitOf(c) === "H").length >= 4 && shootStrength(hand) >= 10;
}
function amShooting(view) {
  const others = view.handPoints.reduce((s, p, i) => (i === view.seat ? s : s + p), 0);
  if (others > 0) return false;
  if (view.handPoints[view.seat] > 0) return true;
  return shootable(view.hand);
}

export default {
  name: "Claude",

  passCards(view) {
    return codex.passCards(view);
  },

  playCard(view) {
    const { hand, legalMoves: legal, trick, playedCards, seat, voids } = view;
    if (legal.length === 1) return legal[0];

    // Vain oma johto + ei omaa kuun ampumista → sovella void-tietoista johtoa.
    // Muuten (seuranta, tai kun ammun kuuta) Codexin logiikka on jo vahva.
    if (trick.length !== 0 || amShooting(view)) return codex.playCard(view);

    const seen = new Set([...hand, ...playedCards]);
    const unseen = { C: [], D: [], S: [], H: [] };
    for (const s of SUITS) for (let r = 2; r <= 14; r++) if (!seen.has(s + r)) unseen[s].push(r);
    const higherUnseen = (s, rank) => unseen[s].some((r) => r > rank);
    const isBoss = (c) => !higherUnseen(suitOf(c), rankOf(c));

    const qPlayed = playedCards.includes("S12");
    const iHaveQ = hand.includes("S12");
    const counts = { C: 0, D: 0, S: 0, H: 0 };
    hand.forEach((c) => counts[suitOf(c)]++);
    const desc = (a, b) => rankOf(b) - rankOf(a);

    // Metsästä rouvaa turvallisesti (kuten Pro): jos en omista rouvaa, se on
    // yhä pelissä, ja patani ovat sen alapuolella → johda korkein pata.
    const spades = legal.filter((c) => suitOf(c) === "S");
    const maxS = spades.reduce((m, c) => Math.max(m, rankOf(c)), 0);
    if (!qPlayed && !iHaveQ && spades.length && maxS < 12 && higherUnseen("S", 11)) {
      return spades.sort(desc)[0];
    }

    // Void-tietoinen matala johto.
    const afterMe = [(seat + 1) % 4, (seat + 2) % 4, (seat + 3) % 4];
    const voidBehind = (s) => afterMe.filter((st) => voids[st][s]).length;
    const lead = (c) => {
      const s = suitOf(c);
      let score = rankOf(c);                       // pohjana: matala parempi
      if (c === "S12") score += 500;               // älä johda rouvaa
      if (s === "S" && rankOf(c) >= 13 && !qPlayed) score += 200; // ei K/A patoa jos rouva ulkona
      if (s === "H") score += 100;                 // vältä herttajohtoa
      if (isBoss(c) && rankOf(c) >= 11) score += 60; // säilytä hallintakortit
      // Takanani tyhjä maa → korttini voi jäädä voittamaan pudotetut pisteet.
      const vb = voidBehind(s);
      if (vb) score += 25 * vb + (isBoss(c) ? 30 : 0);
      // Suosi lyhyen sivumaan (1-2 korttia) tyhjentämistä → pudotusvoimaa.
      if ((s === "C" || s === "D") && counts[s] <= 2) score -= 6;
      return score;
    };
    return [...legal].sort((a, b) => lead(a) - lead(b))[0];
  },
};
