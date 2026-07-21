// Korttilaskuri — seuraa pelattuja kortteja ja päättelee vastustajien maat.
//
// Rakentuu heuristisen pelaajan päälle mutta pelaa tarkemmin: tietää mitkä
// kovat kortit ovat vielä pelissä, mitkä omat kortit ovat "varmoja" (boss),
// ja mistä maasta kukin vastustaja on jo tyhjä (sakannut).

import { isBoss, unseenInSuit, voidsFromHistory } from "../src/analysis.js";
import { HeuristicPlayer } from "./heuristicPlayer.js";

function argmax(arr, key) {
  let best = arr[0];
  let bestK = key(best);
  for (let i = 1; i < arr.length; i++) {
    const k = key(arr[i]);
    if (k > bestK) {
      best = arr[i];
      bestK = k;
    }
  }
  return best;
}
function argmin(arr, key) {
  return argmax(arr, (x) => -key(x));
}

export class CountingPlayer extends HeuristicPlayer {
  static defaultName = "Laskuri";

  chooseShow(view) {
    // Hieman rohkeampi ramaaja kun on nousulla (rami ei voi karata).
    const threshold = view.match.upTeam === view.team ? 8.0 : 9.0;
    return this._ramiStrength(view.hand) >= threshold ? "rami" : "nolo";
  }

  // --- RAMI ---------------------------------------------------------- //
  _leadRami(view, moves) {
    // Lyö ensin varmat voittajat (boss-kortit) kärjestä.
    const bosses = moves.filter((c) => isBoss(view, c));
    if (bosses.length) return argmax(bosses, (c) => c.rank);
    // Muuten pyri vahvistamaan pisin maa: lyö sen korkein.
    const bySuit = this._bySuit(moves);
    let bestSuit = null;
    let bestKey = null;
    for (const [s, cards] of bySuit) {
      const key = cards.length * 100 + Math.max(...cards.map((c) => c.rank));
      if (bestKey === null || key > bestKey) {
        bestKey = key;
        bestSuit = s;
      }
    }
    return argmax(bySuit.get(bestSuit), (c) => c.rank);
  }

  // Pari johtaa turvallisesti jos takana olevat eivät voi ohittaa: joko he
  // ovat tyhjiä maasta tai kaikki korkeammat kortit on jo pelattu.
  _partnerSafe(view) {
    if (view.currentTrick.length === 0) return false;
    const led = view.currentTrick[0][1].suit;
    const cur = this._currentHighRank(view);
    const voids = voidsFromHistory(view);
    const seatsBehind = [];
    for (let k = 1; k < 4 - view.currentTrick.length; k++) {
      seatsBehind.push((view.seat + k) % 4);
    }
    const higherOut = unseenInSuit(view, led).filter((c) => c.rank > cur);
    for (const s of seatsBehind) {
      if (voids[s].has(led)) continue; // tyhjä -> ei uhkaa
      if (higherOut.length) return false; // joku voisi pitää korkeamman
    }
    return true;
  }

  // --- NOLO ---------------------------------------------------------- //
  _playNolo(view) {
    const moves = [...view.legalMoves];
    if (view.ledSuit === null) return this._leadNoloSafe(view, moves);
    return super._playNolo(view);
  }

  // Aloita maalla jossa on matalia kortteja JA jonka joku vastustaja voi
  // vielä ylittää (ettet jää itse kiinni). Vältä "riikosta" (maa jota muilla
  // ei ole -> jäät itse kiinni).
  _leadNoloSafe(view, moves) {
    const bySuit = this._bySuit(moves);
    // Pienin score voittaa: (ei-riikonen, matala kortti, pitkä maa).
    let bestSuit = null;
    let bestScore = null;
    for (const [s, cards] of bySuit) {
      const sorted = [...cards].sort((a, b) => a.rank - b.rank);
      const low = sorted[0].rank;
      const othersHave = unseenInSuit(view, s).length > 0;
      // score-tuple vertailu: [riikonen?, matala, -pituus]
      const score = [othersHave ? 0 : 1, low, -cards.length];
      if (bestScore === null || _lt(score, bestScore)) {
        bestScore = score;
        bestSuit = s;
      }
    }
    return argmin(bySuit.get(bestSuit), (c) => c.rank);
  }
}

// Leksikografinen "pienempi kuin" kolmikoille.
function _lt(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return false;
}

export default function createPlayer() {
  return new CountingPlayer();
}
