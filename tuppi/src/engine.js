// Pelimoottori: jaon kulku, näyttö, kasat, pisteet ja ottelun nousu/tuppi.
//
// Moottori on ainoa taho joka näkee kaikki kortit. Pelaajille annetaan vain
// rajatut näkymät (views.js), joten pelaajat eivät voi huijata.

import { deal as dealCards, removeCard, RNG } from "./cards.js";
import {
  CARDS_PER_HAND,
  TUPPI_TARGET,
  legalMoves,
  scoreDeal,
  pickSooliRamaajaCard,
  teamOf,
  trickWinner,
  opponentsOf,
  partnerOf,
} from "./rules.js";
import { runSooliDeal } from "./sooliMatch.js";
import { MatchState, PlayView, ShowView } from "./views.js";

export class IllegalMove extends Error {}

export class TuppiEngine {
  /**
   * @param {import('./player.js').TuppiPlayer[]} players tasan 4 pelaajaa
   * @param {object} [opts]
   * @param {number|null} [opts.seed]
   * @param {number} [opts.target] tuppiraja (oletus 52)
   * @param {boolean} [opts.verbose] tulostaako tapahtumat
   * @param {boolean} [opts.strict] laiton siirto = poikkeus (muuten korjataan)
   */
  constructor(players, { seed = null, target = TUPPI_TARGET, verbose = false, strict = true } = {}) {
    if (players.length !== 4) throw new Error("tarvitaan tasan 4 pelaajaa");
    this.players = players;
    this.rng = new RNG(seed);
    this.target = target;
    this.verbose = verbose;
    this.strict = strict;
    // ottelun tila
    this.upTeam = null; // nousulla oleva joukkue, null = pöytäpeli
    this.upScore = 0;
    this.banked = { 0: 0, 1: 0 };
  }

  _log(...args) {
    if (this.verbose) console.log(...args);
  }

  _matchState(dealNumber, dealer) {
    return new MatchState({
      dealNumber,
      dealer,
      upTeam: this.upTeam,
      upScore: this.upScore,
      banked: { ...this.banked },
      target: this.target,
    });
  }

  // ------------------------------------------------------------------ //
  //  NÄYTTÖ (rami/nolo)                                                 //
  // ------------------------------------------------------------------ //
  // Palauta { gameType, ramaaja, leader }.
  // Näyttö alkaa jakajasta seuraavasta (etukäsi) ja kiertää myötäpäivään.
  // Ensimmäinen 'rami' voittaa -> ramaaja. Muuten nolo.
  _runShow(hands, dealer, mstate) {
    const firstShower = (dealer + 1) % 4; // etukäsi
    for (let i = 0; i < 4; i++) {
      const seat = (firstShower + i) % 4;
      const view = new ShowView({ seat, hand: hands[seat], match: mstate });
      let choice = this.players[seat].chooseShow(view);
      if (choice !== "rami" && choice !== "nolo") {
        if (this.strict) throw new IllegalMove(`paikka ${seat}: virheellinen näyttö ${choice}`);
        choice = "nolo";
      }
      if (choice === "rami") {
        const leader = (seat + 3) % 4; // ramaajasta EDELLINEN aloittaa
        return { gameType: "rami", ramaaja: seat, leader };
      }
    }
    return { gameType: "nolo", ramaaja: null, leader: firstShower };
  }

  // ------------------------------------------------------------------ //
  //  SOOLI-TARJOUS                                                      //
  // ------------------------------------------------------------------ //
  // Kysytään rami-näytön jälkeen kummaltakin puolustajalta (ramaajan
  // vastaparilta), haluaako pelata soolon. Ensimmäinen 'true' ryhtyy
  // soolaajaksi. Kysytään ramaajasta seuraavasta myötäpäivään.
  _runSooliOffer(hands, ramaaja, mstate) {
    const defenders = opponentsOf(ramaaja); // [ramaaja+1, ramaaja+3]
    for (let i = 0; i < 4; i++) {
      const seat = (ramaaja + 1 + i) % 4;
      if (!defenders.includes(seat)) continue;
      const view = new ShowView({ seat, hand: hands[seat], match: mstate });
      if (this.players[seat].chooseSooli(view) === true) return seat;
    }
    return null;
  }

  // ------------------------------------------------------------------ //
  //  SOOLI-JAKO                                                         //
  // ------------------------------------------------------------------ //
  // Soolaaja pelaa yksin kahta ramaajaa vastaan. Ässä on pienin, soolaaja
  // pelaa aina viimeisenä, soolaajan pari ei pelaa. Ramaaja aloittaa. Jos
  // soolaaja ottaa yhdenkin tikin, ramaajat voittavat; muuten soolipari.
  _playSooliDeal(dealNumber, dealer, hands, ramaaja, soolaaja, mstate) {
    // Kortinvaihto: soolaaja antaa yhden kortin parilleen ja saa yhden.
    const soolPartner = partnerOf(soolaaja);
    const giftView = new ShowView({ seat: soolaaja, hand: hands[soolaaja], match: mstate });
    let gift = this.players[soolaaja].chooseSooliGift(giftView);
    if (!hands[soolaaja].includes(gift)) gift = hands[soolaaja][0];
    const retView = new ShowView({ seat: soolPartner, hand: hands[soolPartner], match: mstate });
    let ret = this.players[soolPartner].chooseSooliReturn(retView);
    if (!hands[soolPartner].includes(ret)) ret = hands[soolPartner][0];
    // gift ja ret ovat aina eri kortteja (eri käsistä, kortit internoituja).
    removeCard(hands[soolaaja], gift);
    removeCard(hands[soolPartner], ret);
    hands[soolaaja].push(ret);
    hands[soolPartner].push(gift);

    for (let seat = 0; seat < 4; seat++) this.players[seat].onSooli(soolaaja);

    const otherRamaaja = partnerOf(ramaaja);
    this._log(
      `\n--- Jako ${dealNumber} | jakaja ${dealer} | SOOLI` +
        ` (soolaaja ${soolaaja} vs ramaajat ${ramaaja}&${otherRamaaja}) | aloittaa ${ramaaja} ---`,
    );

    // Jaettu ydin ajaa tikit. Ramaajat ajetaan dedikoidulla sooli-puolustuksella
    // (botit eivät osaa soolia); soolaaja tekee omat päätöksensä (ihminen/oma pelaaja).
    const { soolaajaTookTrick, winnerTeam, points, tricksByTeam } = runSooliDeal({
      hands, ramaaja, soolaaja, mstate,
      getCard: (seat, view) =>
        seat === soolaaja ? this.players[seat].playCard(view) : pickSooliRamaajaCard(view),
      onTrick: (trick, w) => {
        for (let seat = 0; seat < 4; seat++) this.players[seat].onTrickComplete(trick, w);
        this._log("  " + trick.map(([s, c]) => `${s}:${c}`).join("  ") + `  -> tikki paikalle ${w}`);
      },
    });
    for (let seat = 0; seat < 4; seat++) this.players[seat].onDealEnd({ ...tricksByTeam }, winnerTeam, points);
    this._log(
      `  Sooli: soolaaja ${soolaajaTookTrick ? "OTTI tikin" : "selvisi tikeittä"} -> ` +
        `joukkue ${winnerTeam} voittaa ${points}p`,
    );

    return {
      gameType: "sooli", ramaaja, soolaaja, leader: ramaaja,
      tricksByTeam: { ...tricksByTeam }, winnerTeam, points, steal: false,
      soolaajaTookTrick,
    };
  }

  // ------------------------------------------------------------------ //
  //  YKSI JAKO                                                          //
  // ------------------------------------------------------------------ //
  playDeal(dealNumber, dealer) {
    const hands = dealCards(this.rng);
    const mstate = this._matchState(dealNumber, dealer);

    for (let seat = 0; seat < 4; seat++) {
      this.players[seat].onDealStart(new ShowView({ seat, hand: hands[seat], match: mstate }));
    }

    const { gameType, ramaaja, leader } = this._runShow(hands, dealer, mstate);
    for (let seat = 0; seat < 4; seat++) {
      this.players[seat].onShowResult(gameType, ramaaja);
    }

    // Rami-näytön jälkeen puolustaja voi ryhtyä soolaajaksi.
    if (gameType === "rami") {
      const soolaaja = this._runSooliOffer(hands, ramaaja, mstate);
      if (soolaaja !== null) {
        return this._playSooliDeal(dealNumber, dealer, hands, ramaaja, soolaaja, mstate);
      }
    }

    this._log(
      `\n--- Jako ${dealNumber} | jakaja ${dealer} | ${gameType.toUpperCase()}` +
        (ramaaja !== null ? ` (ramaaja ${ramaaja})` : "") +
        ` | aloittaa ${leader} ---`,
    );

    const tricksByTeam = { 0: 0, 1: 0 };
    const history = [];
    let current = leader;

    for (let trickNo = 0; trickNo < CARDS_PER_HAND; trickNo++) {
      const trick = [];
      let ledSuit = null;
      for (let j = 0; j < 4; j++) {
        const seat = (current + j) % 4;
        const moves = legalMoves(hands[seat], ledSuit);
        const view = new PlayView({
          seat,
          hand: hands[seat],
          legalMoves: moves,
          gameType,
          ramaaja,
          leader: current,
          currentTrick: trick,
          ledSuit,
          trickNumber: trickNo,
          tricksByTeam,
          history,
          match: mstate,
        });
        let card = this.players[seat].playCard(view);
        card = this._validate(card, moves, seat);
        removeCard(hands[seat], card);
        if (ledSuit === null) ledSuit = card.suit;
        trick.push([seat, card]);
      }

      const w = trickWinner(trick);
      tricksByTeam[teamOf(w)] += 1;
      history.push(trick);
      for (let seat = 0; seat < 4; seat++) {
        this.players[seat].onTrickComplete(trick.map((p) => p.slice()), w);
      }
      this._log(
        "  " + trick.map(([s, c]) => `${s}:${c}`).join("  ") +
          `  -> kasa paikalle ${w} (joukkue ${teamOf(w)})`,
      );
      current = w;
    }

    const ramaajaTeam = ramaaja !== null ? teamOf(ramaaja) : null;
    const { winner: winnerTeam, points, steal } = scoreDeal(tricksByTeam, gameType, ramaajaTeam);
    for (let seat = 0; seat < 4; seat++) {
      this.players[seat].onDealEnd({ ...tricksByTeam }, winnerTeam, points);
    }

    this._log(
      `  Kasat: joukkue0=${tricksByTeam[0]} joukkue1=${tricksByTeam[1]} -> ` +
        `joukkue ${winnerTeam} voittaa ${points}p` + (steal ? "  [RYÖSTÖ!]" : ""),
    );

    return {
      gameType,
      ramaaja,
      leader,
      tricksByTeam: { ...tricksByTeam },
      winnerTeam,
      points,
      steal,
    };
  }

  _validate(card, moves, seat) {
    if (moves.includes(card)) return card;
    const msg = `paikka ${seat} yritti laitonta siirtoa ${card}; sallitut: ${moves.join(", ")}`;
    if (this.strict) throw new IllegalMove(msg);
    this._log("  [VAROITUS] " + msg + " -> korjataan");
    return moves[0];
  }

  // ------------------------------------------------------------------ //
  //  NOUSU / TUPPI -PÄIVITYS                                            //
  // ------------------------------------------------------------------ //
  // Vain toinen joukkue voi olla nousulla kerrallaan.
  //  - Pöytäpeli (kukaan ei nousulla): voittaja nousee pisteillään.
  //  - Voittaja on jo nousulla: lisää pisteet.
  //  - Vastapari voittaa nousulla olevalta: nousulla ollut putoaa nollaan
  //    ja tulee pöytäpeli. Voittaja EI pankkaa.
  _applyNousu(winnerTeam, points) {
    if (this.upTeam === null) {
      this.upTeam = winnerTeam;
      this.upScore = points;
      this.banked[winnerTeam] += points;
    } else if (this.upTeam === winnerTeam) {
      this.upScore += points;
      this.banked[winnerTeam] += points;
    } else {
      this.upTeam = null;
      this.upScore = 0;
    }
  }

  // ------------------------------------------------------------------ //
  //  KOKO OTTELU                                                        //
  // ------------------------------------------------------------------ //
  /**
   * Oletus: pelataan kunnes joku tekee tupen (yhtäjaksoinen nousu >= 52)
   * tai maxDeals täyttyy (turvaraja). fixedDeals: pelaa tasan n jakoa
   * (turnaustyyli) ja voittaja = enemmän nousupisteitä kerännyt.
   */
  playMatch({ maxDeals = 500, fixedDeals = null } = {}) {
    const results = [];
    let dealNumber = 0;
    let byTuppi = false;
    let winnerTeam = null;

    const limit = fixedDeals !== null ? fixedDeals : maxDeals;
    while (dealNumber < limit) {
      dealNumber += 1;
      const dealer = (dealNumber - 1) % 4;
      const res = this.playDeal(dealNumber, dealer);
      results.push(res);
      this._applyNousu(res.winnerTeam, res.points);
      this._log(
        `  Tilanne: nousulla=${this.upTeam} (${this.upScore}) | ` +
          `pankki={0:${this.banked[0]}, 1:${this.banked[1]}}`,
      );

      if (fixedDeals === null && this.upScore >= this.target) {
        byTuppi = true;
        winnerTeam = this.upTeam;
        this._log(
          `\n*** TUPPI! Joukkue ${winnerTeam} vei joukkueen ${1 - winnerTeam} ` +
            `tuppeen (${this.upScore} p). ***`,
        );
        break;
      }
    }

    if (winnerTeam === null && this.banked[0] !== this.banked[1]) {
      winnerTeam = this.banked[0] > this.banked[1] ? 0 : 1;
    }

    return {
      winnerTeam,
      byTuppi,
      dealsPlayed: dealNumber,
      banked: { ...this.banked },
      dealResults: results,
    };
  }
}
