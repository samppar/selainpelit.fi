// Näkymät joita moottori antaa pelaajille.
//
// Pelaaja EI näe muiden käsiä. Se näkee vain oman kätensä + julkisen tiedon
// (pelatut kortit, kasatilanne, kuka nousulla jne). Näkymät jäädytetään
// (Object.freeze), joten pelaaja ei voi huijata muokkaamalla tilaa.

import { teamOf, partnerOf } from "./rules.js";

/** Ottelun tilanne (nousu/tuppi) näyttö- ja pelihetkellä. */
export class MatchState {
  constructor({ dealNumber, dealer, upTeam, upScore, banked, target }) {
    this.dealNumber = dealNumber;
    this.dealer = dealer;
    this.upTeam = upTeam; // nousulla oleva joukkue, null = pöytäpeli
    this.upScore = upScore; // nousulla olevan pistemäärä
    this.banked = banked; // { 0: n, 1: n } kokonaisnousupisteet (turnaus)
    this.target = target; // tuppiraja (52)
    Object.freeze(this.banked);
    Object.freeze(this);
  }
}

/** Näyttöpäätöstä (rami/nolo) varten. */
export class ShowView {
  constructor({ seat, hand, match }) {
    this.seat = seat;
    this.hand = Object.freeze(hand.slice());
    this.match = match;
    Object.freeze(this);
  }

  get team() {
    return teamOf(this.seat);
  }

  get partner() {
    return partnerOf(this.seat);
  }
}

/** Yhden kortin lyöntipäätöstä varten. */
export class PlayView {
  constructor({
    seat,
    hand,
    legalMoves,
    gameType,
    ramaaja,
    leader,
    currentTrick,
    ledSuit,
    trickNumber,
    tricksByTeam,
    history,
    match,
    sooli = false,
    soolaaja = null,
  }) {
    this.seat = seat;
    this.hand = Object.freeze(hand.slice()); // oma käsi juuri nyt
    this.legalMoves = Object.freeze(legalMoves.slice()); // sallitut kortit
    this.gameType = gameType; // 'rami' tai 'nolo'
    this.ramaaja = ramaaja; // ramin näyttäjä (null nolossa)
    this.sooli = sooli; // pelataanko soolia (ässä pienin, soolaaja viimeisenä)
    this.soolaaja = soolaaja; // soolaajan paikka (null jos ei soolia)
    this.leader = leader; // kuka aloitti tämän kierroksen
    this.currentTrick = Object.freeze(currentTrick.map((p) => Object.freeze(p.slice())));
    this.ledSuit = ledSuit; // aloitusmaa (null jos aloitat itse)
    this.trickNumber = trickNumber; // 0..12
    this.tricksByTeam = Object.freeze({ ...tricksByTeam }); // voitetut kasat
    this.history = Object.freeze(
      history.map((t) => Object.freeze(t.map((p) => Object.freeze(p.slice())))),
    );
    this.match = match;
    Object.freeze(this);
  }

  // --- mukavuusaputoiminnot ------------------------------------------- //
  get team() {
    return teamOf(this.seat);
  }

  get partner() {
    return partnerOf(this.seat);
  }

  /** Ramissa halutaan kasoja, nolossa vältetään. */
  get wantToWinTricks() {
    return this.gameType === "rami";
  }

  /** Kaikki tähän mennessä pelatut kortit (Set). */
  get cardsPlayed() {
    const played = new Set();
    for (const trick of this.history) for (const [, c] of trick) played.add(c);
    for (const [, c] of this.currentTrick) played.add(c);
    return played;
  }

  /** Kuka johtaa kesken olevaa kierrosta (tai null jos tyhjä)? */
  currentWinnerSeat() {
    if (this.currentTrick.length === 0) return null;
    const led = this.currentTrick[0][1].suit;
    let bestSeat = this.currentTrick[0][0];
    let bestRank = this.currentTrick[0][1].rank;
    for (let i = 1; i < this.currentTrick.length; i++) {
      const [seat, card] = this.currentTrick[i];
      if (card.suit === led && card.rank > bestRank) {
        bestSeat = seat;
        bestRank = card.rank;
      }
    }
    return bestSeat;
  }

  partnerIsWinning() {
    const w = this.currentWinnerSeat();
    return w !== null && w === this.partner;
  }
}
