// Heuristinen pelaaja — vankka sääntöpohjainen strategia.
//
// Osaa perusasiat: näyttöpäätöksen käden vahvuudesta, ramissa kasojen
// keräämisen ja nolossa niiden väistämisen (duck), parikaverin huomioinnin
// sekä hyvän sakkauksen (korkeiden korttien pudottamisen nolossa).

import { SUITS, TuppiPlayer } from "../src/index.js";

// Pieni apu: valitse taulukon alkio jolla annettu avain on suurin/pienin.
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

export class HeuristicPlayer extends TuppiPlayer {
  static defaultName = "Heuristi";

  // ------------------------------------------------------------------ //
  //  NÄYTTÖ                                                             //
  // ------------------------------------------------------------------ //
  chooseShow(view) {
    return this._ramiStrength(view.hand) >= 9 ? "rami" : "nolo";
  }

  // Karkea ramivahvuus. Ässät ja kuninkaat ovat kovia; pitkät maat ja
  // lyhyet maat (sakkausmahdollisuus) auttavat kasojen keräämisessä.
  _ramiStrength(hand) {
    let pts = 0;
    const bySuit = { 0: [], 1: [], 2: [], 3: [] };
    for (const c of hand) bySuit[c.suit].push(c.rank);
    for (const s of SUITS) {
      const ranks = bySuit[s];
      for (const r of ranks) {
        if (r === 14) pts += 3; // ässä
        else if (r === 13) pts += 2; // kuningas
        else if (r === 12) pts += 1; // rouva
      }
      const length = ranks.length;
      if (length >= 5) pts += (length - 4) * 1.5; // pitkä maa -> loppukasoja
      if (length <= 1) pts += 1.0; // lyhyt maa = sakkausvara
    }
    return pts;
  }

  // ------------------------------------------------------------------ //
  //  LYÖNTI                                                             //
  // ------------------------------------------------------------------ //
  playCard(view) {
    return view.wantToWinTricks ? this._playRami(view) : this._playNolo(view);
  }

  // --- RAMI: kerää kasoja ------------------------------------------- //
  _playRami(view) {
    const moves = [...view.legalMoves];
    if (view.ledSuit === null) return this._leadRami(view, moves);

    if (view.partnerIsWinning() && this._partnerSafe(view)) {
      // Pari johtaa turvallisesti -> säästä, lyö matalin.
      return argmin(moves, (c) => c.rank);
    }

    const winners = moves.filter((c) => this._beatsCurrent(view, c));
    if (winners.length) return argmin(winners, (c) => c.rank); // voita halvalla
    return argmin(moves, (c) => c.rank); // ei voi voittaa -> pudota matalin
  }

  _leadRami(view, moves) {
    const bySuit = new Map();
    for (const c of moves) {
      if (!bySuit.has(c.suit)) bySuit.set(c.suit, []);
      bySuit.get(c.suit).push(c);
    }
    // Suosi maata jossa on ässä/kuningas tai pisin maa.
    let bestSuit = null;
    let bestKey = null;
    for (const [s, cards] of bySuit) {
      const maxRank = Math.max(...cards.map((c) => c.rank));
      const key = maxRank * 100 + cards.length;
      if (bestKey === null || key > bestKey) {
        bestKey = key;
        bestSuit = s;
      }
    }
    return argmax(bySuit.get(bestSuit), (c) => c.rank);
  }

  // --- NOLO: vältä kasoja ------------------------------------------- //
  _playNolo(view) {
    const moves = [...view.legalMoves];
    if (view.ledSuit === null) {
      // Aloita matalalla pitkästä maasta.
      const bySuit = this._bySuit(moves);
      let bestSuit = null;
      let bestLen = -1;
      for (const [s, cards] of bySuit) {
        if (cards.length > bestLen) {
          bestLen = cards.length;
          bestSuit = s;
        }
      }
      return argmin(bySuit.get(bestSuit), (c) => c.rank);
    }

    const suitsInMoves = new Set(moves.map((c) => c.suit));
    if (suitsInMoves.has(view.ledSuit)) {
      // Voi tunnustaa maata: pelaa korkein joka EI voita (alita).
      const cur = this._currentHighRank(view);
      const under = moves.filter((c) => c.suit === view.ledSuit && c.rank < cur);
      if (under.length) return argmax(under, (c) => c.rank); // heitä iso turvaan
      // Kaikki voittaisivat -> pelaa matalin, ehkä joku ohittaa perässä.
      return argmin(
        moves.filter((c) => c.suit === view.ledSuit),
        (c) => c.rank,
      );
    }
    // Sakkaus nolossa on kultaa: pudota korkein vaarallinen kortti.
    return argmax(moves, (c) => c.rank * 100 + this._suitDanger(view, c.suit));
  }

  // ------------------------------------------------------------------ //
  //  APUT                                                               //
  // ------------------------------------------------------------------ //
  _bySuit(cards) {
    const bySuit = new Map();
    for (const c of cards) {
      if (!bySuit.has(c.suit)) bySuit.set(c.suit, []);
      bySuit.get(c.suit).push(c);
    }
    return bySuit;
  }

  _currentHighRank(view) {
    const led = view.ledSuit;
    let best = -1;
    for (const [, c] of view.currentTrick) {
      if (c.suit === led && c.rank > best) best = c.rank;
    }
    return best;
  }

  _beatsCurrent(view, card) {
    if (view.currentTrick.length === 0) return true;
    const led = view.currentTrick[0][1].suit;
    if (card.suit !== led) return false;
    return card.rank > this._currentHighRank(view);
  }

  // Onko parin johto turvallinen: onko takana enää pelaajia jotka voisivat
  // ohittaa? Jos olet 3. tai 4. lyöjä ja pari johtaa, on melko turvallista
  // säästää.
  _partnerSafe(view) {
    return view.currentTrick.length >= 2;
  }

  _suitDanger(view, suit) {
    // Enemmän omia kortteja maassa = vaarallisempi pitää -> pudota mieluummin.
    return view.hand.filter((c) => c.suit === suit).length;
  }
}

export default function createPlayer() {
  return new HeuristicPlayer();
}
