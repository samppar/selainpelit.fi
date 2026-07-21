// Mestari — determinoitu Monte Carlo -haku (PIMC). Ammattilaistason tekoäly.
//
// Idea: emme näe vastustajien kortteja, mutta tiedämme mitkä kortit ovat
// vielä pelissä ja mistä maasta kukin on tyhjä (sakannut). Jokaista laillista
// siirtoa kohti arvomme monta mahdollista korttijakoa vastustajille (voidit
// huomioiden) ja pelaamme jaon loppuun nopealla järkevällä politiikalla.
// Valitsemme siirron joka tuottaa parhaan keskimääräisen tuloksen omalle
// joukkueelle (ramissa max kasat, nolossa min kasat).

import {
  Card,
  RNG,
  SUITS,
  TuppiPlayer,
  fullDeck,
  removeCard,
  teamOf,
  trickWinner,
} from "../src/index.js";
import {
  cardsRemainingInHand,
  unseenCards,
  voidsFromHistory,
} from "../src/analysis.js";

export class ChampionPlayer extends TuppiPlayer {
  static defaultName = "Mestari";

  constructor(name = null, { simulations = 60, seed = null, ramBias = 0, ramBiasDown = 0.5 } = {}) {
    super(name);
    this.sims = simulations;
    this.rng = new RNG(seed);
    // ramBias nostaa ramauskynnystä aina -> valitsee noloa useammin.
    this.ramBias = ramBias;
    // ramBiasDown nostaa kynnystä vain alhaalla (oma joukkue EI nousulla).
    // 0.5 mitattu paremmaksi vs perus (~57.5 % voitto-osuus, sims=60).
    this.ramBiasDown = ramBiasDown;
  }

  // ------------------------------------------------------------------ //
  //  NÄYTTÖ: kevyt simulaatio käden voimasta                            //
  // ------------------------------------------------------------------ //
  chooseShow(view) {
    const myTeam = view.team;
    const seatsOthers = [0, 1, 2, 3].filter((s) => s !== view.seat);
    const handSet = new Set(view.hand);
    const unseen = fullDeck().filter((c) => !handSet.has(c));
    let total = 0;
    const trials = Math.max(20, Math.floor(this.sims / 2));
    for (let t = 0; t < trials; t++) {
      this.rng.shuffle(unseen);
      const hands = { [view.seat]: [...view.hand] };
      seatsOthers.forEach((s, i) => {
        hands[s] = unseen.slice(i * 13, (i + 1) * 13);
      });
      const tricks = _rollout(hands, (view.match.dealer + 1) % 4, "rami", this.rng);
      total += tricks[myTeam];
    }
    const avg = total / trials;
    // ~6.5 on tasapeli; vaadi selvä etu ennen ramia, rohkeampi nousulla.
    // ramBias aina; ramBiasDown vain kun ei olla nousulla (alhaalla / pöytä).
    const up = view.match.upTeam === myTeam;
    const need = (up ? 6.6 : 7.1) + this.ramBias + (up ? 0 : this.ramBiasDown);
    return avg >= need ? "rami" : "nolo";
  }

  // ------------------------------------------------------------------ //
  //  LYÖNTI: PIMC                                                       //
  // ------------------------------------------------------------------ //
  playCard(view) {
    const moves = [...view.legalMoves];
    if (moves.length === 1) return moves[0];

    const myTeam = view.team;
    const unseen = [...unseenCards(view)];
    const need = {};
    for (const s of [0, 1, 2, 3]) {
      if (s !== view.seat) need[s] = cardsRemainingInHand(view, s);
    }
    const voids = voidsFromHistory(view);
    const maximize = view.wantToWinTricks; // rami: enemmän kasoja parempi

    let bestCard = moves[0];
    let bestVal = null;
    for (const card of moves) {
      let total = 0;
      for (let i = 0; i < this.sims; i++) {
        const hands = this._determinize(view, unseen, need, voids);
        if (hands === null) continue;
        const tricks = this._simulateFromHere(view, hands, card);
        total += tricks[myTeam];
      }
      const val = total; // jaettu samalla sims-määrällä -> vertailukelpoinen
      if (bestVal === null || (maximize ? val > bestVal : val < bestVal)) {
        bestVal = val;
        bestCard = card;
      }
    }
    return bestCard;
  }

  // ------------------------------------------------------------------ //
  //  Jaa näkymättömät kortit vastustajille voidit huomioiden            //
  // ------------------------------------------------------------------ //
  _determinize(view, unseen, need, voids) {
    const seats = Object.keys(need).map(Number);
    for (let attempt = 0; attempt < 8; attempt++) {
      const pool = [...unseen];
      this.rng.shuffle(pool);
      const capacity = { ...need };
      const assign = {};
      for (const s of seats) assign[s] = [];

      const allowed = (card) =>
        seats.filter((s) => capacity[s] > 0 && !voids[s].has(card.suit));

      // sijoita rajoitetuimmat kortit ensin
      pool.sort((a, b) => allowed(a).length - allowed(b).length);
      let ok = true;
      for (const card of pool) {
        const cand = allowed(card);
        if (cand.length === 0) {
          ok = false;
          break;
        }
        const s = this.rng.choice(cand);
        assign[s].push(card);
        capacity[s] -= 1;
      }
      if (ok && seats.every((s) => capacity[s] === 0)) {
        assign[view.seat] = [...view.hand];
        return assign;
      }
    }
    // varajako ilman voideja (harvinainen)
    const pool = [...unseen];
    this.rng.shuffle(pool);
    const assign = { [view.seat]: [...view.hand] };
    let idx = 0;
    for (const s of seats) {
      assign[s] = pool.slice(idx, idx + need[s]);
      idx += need[s];
    }
    return assign;
  }

  // ------------------------------------------------------------------ //
  //  Pelaa jaon loppuun annetusta tilasta, kun MINÄ lyön 'card'         //
  // ------------------------------------------------------------------ //
  _simulateFromHere(view, handsIn, card) {
    const hands = {};
    for (const s of Object.keys(handsIn)) hands[s] = [...handsIn[s]];
    const tricks = { ...view.tricksByTeam };
    let trick = view.currentTrick.map((p) => [p[0], p[1]]);
    let ledSuit = view.ledSuit;

    // MINÄ lyön valitun kortin
    removeCard(hands[view.seat], card);
    if (ledSuit === null) ledSuit = card.suit;
    trick.push([view.seat, card]);

    // loput saman kierroksen lyönnit
    let seat = view.seat;
    while (trick.length < 4) {
      seat = (seat + 1) % 4;
      const c = _policyPlay(hands[seat], ledSuit, trick, seat, view.gameType, this.rng);
      removeCard(hands[seat], c);
      trick.push([seat, c]);
    }

    let w = trickWinner(trick);
    tricks[teamOf(w)] += 1;
    let leader = w;

    // loput kierrokset
    const remaining = hands[view.seat].length;
    for (let r = 0; r < remaining; r++) {
      trick = [];
      ledSuit = null;
      for (let j = 0; j < 4; j++) {
        const s = (leader + j) % 4;
        const c = _policyPlay(hands[s], ledSuit, trick, s, view.gameType, this.rng);
        removeCard(hands[s], c);
        if (ledSuit === null) ledSuit = c.suit;
        trick.push([s, c]);
      }
      w = trickWinner(trick);
      tricks[teamOf(w)] += 1;
      leader = w;
    }
    return tricks;
  }
}

// ---------------------------------------------------------------------- //
//  Nopea moduulitason politiikka (jaettu rollouteissa)                    //
// ---------------------------------------------------------------------- //
function _legal(hand, ledSuit) {
  if (ledSuit === null) return hand;
  const same = hand.filter((c) => c.suit === ledSuit);
  return same.length ? same : hand;
}

function _currentHigh(trick, ledSuit) {
  if (!trick.length || ledSuit === null) return -1;
  let best = -1;
  for (const [, c] of trick) if (c.suit === ledSuit && c.rank > best) best = c.rank;
  return best;
}

function _partialWinner(trick) {
  const led = trick[0][1].suit;
  let bs = trick[0][0];
  let br = trick[0][1].rank;
  for (let i = 1; i < trick.length; i++) {
    const [s, c] = trick[i];
    if (c.suit === led && c.rank > br) {
      bs = s;
      br = c.rank;
    }
  }
  return bs;
}

function _minBy(arr, key) {
  let best = arr[0];
  let bk = key(best);
  for (let i = 1; i < arr.length; i++) {
    const k = key(arr[i]);
    if (k < bk) {
      best = arr[i];
      bk = k;
    }
  }
  return best;
}
function _maxBy(arr, key) {
  return _minBy(arr, (x) => -key(x));
}

// Kevyt mutta järkevä rollout-politiikka.
function _policyPlay(hand, ledSuit, trick, seat, gameType, rng) {
  const moves = _legal(hand, ledSuit);
  if (moves.length === 1) return moves[0];
  const wantWin = gameType === "rami";

  if (ledSuit === null || !trick.length) {
    // aloitus
    return wantWin ? _maxBy(moves, (c) => c.rank) : _minBy(moves, (c) => c.rank);
  }

  const cur = _currentHigh(trick, ledSuit);
  const winner = _partialWinner(trick);
  const partnerLeads = winner % 2 === seat % 2;
  const hasLed = moves.some((c) => c.suit === ledSuit);

  if (hasLed) {
    if (wantWin) {
      if (partnerLeads) return _minBy(moves, (c) => c.rank); // pari johtaa, säästä
      const wins = moves.filter((c) => c.suit === ledSuit && c.rank > cur);
      if (wins.length) return _minBy(wins, (c) => c.rank); // voita halvalla
      return _minBy(moves, (c) => c.rank);
    }
    // nolo: alita
    const under = moves.filter((c) => c.suit === ledSuit && c.rank < cur);
    if (under.length) return _maxBy(under, (c) => c.rank);
    return _minBy(
      moves.filter((c) => c.suit === ledSuit),
      (c) => c.rank,
    );
  }
  // sakkaus
  if (wantWin) return _minBy(moves, (c) => c.rank); // säästä kovat
  return _maxBy(moves, (c) => c.rank); // pudota vaaralliset
}

function _rollout(handsIn, leaderStart, gameType, rng) {
  const hands = {};
  for (const s of Object.keys(handsIn)) hands[s] = [...handsIn[s]];
  const tricks = { 0: 0, 1: 0 };
  let leader = leaderStart;
  for (let r = 0; r < 13; r++) {
    const trick = [];
    let ledSuit = null;
    for (let j = 0; j < 4; j++) {
      const s = (leader + j) % 4;
      const c = _policyPlay(hands[s], ledSuit, trick, s, gameType, rng);
      removeCard(hands[s], c);
      if (ledSuit === null) ledSuit = c.suit;
      trick.push([s, c]);
    }
    const w = trickWinner(trick);
    tricks[teamOf(w)] += 1;
    leader = w;
  }
  return tricks;
}

export default function createPlayer() {
  return new ChampionPlayer();
}
