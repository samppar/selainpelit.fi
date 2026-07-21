// Sooli-jaon jaettu ydin (ilman UI:ta). Sekä moottori että sooli-turnaus
// käyttävät tätä, jotta tikkien kulku, ässä-pienin-vertailu ja lopetusehto
// ovat yhdessä paikassa.
//
// Soolaaja pelaa yksin kahta ramaajaa vastaan: ässä on pienin, soolaaja
// pelaa aina viimeisenä, soolaajan pari ei pelaa. Ramaaja aloittaa. Jos
// soolaaja ottaa yhdenkin tikin, ramaajat voittavat; muuten soolipari.

import { CARDS_PER_HAND, legalMoves, sooliTrickWinner, teamOf, partnerOf, scoreSooli } from "./rules.js";
import { PlayView } from "./views.js";

/**
 * Aja sooli-jaon tikit. Kädet (hands) mutatoidaan.
 *
 * @param {object} p
 * @param {import('./cards.js').Card[][]} p.hands  neljä kättä (vaihto jo tehty)
 * @param {number} p.ramaaja   ramin näyttäjän paikka (aloittaa)
 * @param {number} p.soolaaja  soolaajan paikka
 * @param {object} p.mstate    MatchState PlayView'ta varten
 * @param {(seat:number, view:PlayView)=>Card} p.getCard  palauta pelattava kortti
 * @param {(trick, winnerSeat)=>void} [p.onTrick]  valinnainen tapahtumakoukku
 * @returns {{soolaajaTookTrick, winnerTeam, points, tricksByTeam, history}}
 */
export function runSooliDeal({ hands, ramaaja, soolaaja, mstate, getCard, onTrick = null }) {
  const otherRamaaja = partnerOf(ramaaja);
  const tricksByTeam = { 0: 0, 1: 0 };
  const history = [];
  let leader = ramaaja; // ramaaja aloittaa
  let soolaajaTookTrick = false;

  for (let trickNo = 0; trickNo < CARDS_PER_HAND; trickNo++) {
    // Lyöntijärjestys: johtava ramaaja, toinen ramaaja, soolaaja viimeisenä.
    const order = leader === ramaaja ? [ramaaja, otherRamaaja, soolaaja] : [otherRamaaja, ramaaja, soolaaja];
    const trick = [];
    let ledSuit = null;
    for (const seat of order) {
      const moves = legalMoves(hands[seat], ledSuit);
      const view = new PlayView({
        seat, hand: hands[seat], legalMoves: moves, gameType: "rami", ramaaja,
        leader, currentTrick: trick, ledSuit, trickNumber: trickNo,
        tricksByTeam, history, match: mstate, sooli: true, soolaaja,
      });
      let card = getCard(seat, view);
      if (!moves.includes(card)) card = moves[0]; // turvakääre: laiton -> ensimmäinen sallittu
      const idx = hands[seat].indexOf(card);
      hands[seat].splice(idx, 1);
      if (ledSuit === null) ledSuit = card.suit;
      trick.push([seat, card]);
    }
    const w = sooliTrickWinner(trick);
    tricksByTeam[teamOf(w)] += 1;
    history.push(trick);
    if (onTrick) onTrick(trick.map((p) => p.slice()), w);
    if (w === soolaaja) { soolaajaTookTrick = true; break; }
    leader = w;
  }

  const { winner, points } = scoreSooli(teamOf(soolaaja), teamOf(ramaaja), soolaajaTookTrick);
  return { soolaajaTookTrick, winnerTeam: winner, points, tricksByTeam, history };
}
