import {
  RNG,
  SUITS,
  TuppiPlayer,
  fullDeck,
  legalMoves,
  removeCard,
  teamOf,
  trickWinner,
} from "../src/index.js";
import {
  cardsRemainingInHand,
  isBoss,
  unseenCards,
  unseenInSuit,
  voidsFromHistory,
} from "../src/analysis.js";

function minBy(arr, key) {
  let best = arr[0];
  let bestKey = key(best);
  for (let i = 1; i < arr.length; i++) {
    const k = key(arr[i]);
    if (k < bestKey) {
      best = arr[i];
      bestKey = k;
    }
  }
  return best;
}

function maxBy(arr, key) {
  return minBy(arr, (x) => -key(x));
}

function bySuit(cards) {
  const out = new Map();
  for (const c of cards) {
    if (!out.has(c.suit)) out.set(c.suit, []);
    out.get(c.suit).push(c);
  }
  return out;
}

function currentHighRank(trick, ledSuit) {
  let best = -1;
  for (const [, c] of trick) {
    if (c.suit === ledSuit && c.rank > best) best = c.rank;
  }
  return best;
}

function partialWinner(trick) {
  if (!trick.length) return null;
  const led = trick[0][1].suit;
  let bestSeat = trick[0][0];
  let bestRank = trick[0][1].rank;
  for (let i = 1; i < trick.length; i++) {
    const [seat, card] = trick[i];
    if (card.suit === led && card.rank > bestRank) {
      bestSeat = seat;
      bestRank = card.rank;
    }
  }
  return bestSeat;
}

export class CodexPlayer extends TuppiPlayer {
  static defaultName = "Codex";

  constructor(name = null, { simulations = 42, seed = 20260705 } = {}) {
    super(name);
    this.simulations = simulations;
    this.rng = new RNG(seed);
  }

  chooseShow(view) {
    const strength = this._ramiStrength(view.hand);
    const ownUp = view.match.upTeam === view.team;
    const oppUp = view.match.upTeam === 1 - view.team;
    const pressure = oppUp && view.match.upScore >= view.match.target - 16 ? -0.35 : 0;
    const threshold = ownUp ? 8.0 : 9.0 + pressure;
    return strength >= threshold ? "rami" : "nolo";
  }

  playCard(view) {
    const moves = [...view.legalMoves];
    if (moves.length === 1) return moves[0];

    const tactical = view.wantToWinTricks
      ? this._tacticalRami(view, moves)
      : this._tacticalNolo(view, moves);

    if (moves.length <= 2 || view.trickNumber >= 10) return tactical;

    const searched = this._searchMove(view, moves);
    return searched ?? tactical;
  }

  _ramiStrength(hand) {
    const suits = bySuit(hand);
    let points = 0;
    for (const s of SUITS) {
      const cards = [...(suits.get(s) ?? [])].sort((a, b) => b.rank - a.rank);
      const ranks = new Set(cards.map((c) => c.rank));
      for (const c of cards) {
        if (c.rank === 14) points += 3.4;
        else if (c.rank === 13) points += 2.1;
        else if (c.rank === 12) points += 1.15;
        else if (c.rank === 11) points += 0.45;
      }
      if (ranks.has(14) && ranks.has(13)) points += 0.8;
      if (ranks.has(14) && ranks.has(13) && ranks.has(12)) points += 0.7;
      if (cards.length >= 5) points += (cards.length - 4) * 1.25;
      if (cards.length <= 1) points += 0.8;
      if (cards.length === 0) points += 0.4;
    }
    return points;
  }

  _tacticalRami(view, moves) {
    if (view.ledSuit === null) return this._leadRami(view, moves);

    if (view.partnerIsWinning() && this._partnerLeadLooksSafe(view)) {
      return minBy(moves, (c) => this._saveValue(view, c));
    }

    const winners = moves.filter((c) => this._beatsCurrent(view, c));
    if (winners.length) {
      const bossWinners = winners.filter((c) => isBoss(view, c));
      if (bossWinners.length && view.currentTrick.length >= 3) {
        return minBy(bossWinners, (c) => c.rank);
      }
      return minBy(winners, (c) => c.rank + (isBoss(view, c) ? 1.5 : 0));
    }

    return minBy(moves, (c) => this._saveValue(view, c));
  }

  _leadRami(view, moves) {
    const bosses = moves.filter((c) => isBoss(view, c));
    if (bosses.length) return maxBy(bosses, (c) => c.rank * 10 + this._suitLength(view.hand, c.suit));

    const suits = bySuit(moves);
    let bestSuit = null;
    let bestScore = -Infinity;
    for (const [s, cards] of suits) {
      const high = Math.max(...cards.map((c) => c.rank));
      const hiddenHigher = unseenInSuit(view, s).filter((c) => c.rank > high).length;
      const score = cards.length * 2.2 + high * 0.75 - hiddenHigher * 1.7;
      if (score > bestScore) {
        bestScore = score;
        bestSuit = s;
      }
    }
    return maxBy(suits.get(bestSuit), (c) => c.rank);
  }

  _tacticalNolo(view, moves) {
    if (view.ledSuit === null) return this._leadNolo(view, moves);

    const follows = moves.filter((c) => c.suit === view.ledSuit);
    if (follows.length) {
      const cur = this._currentHigh(view);
      const under = follows.filter((c) => c.rank < cur);
      if (under.length) return maxBy(under, (c) => c.rank);

      const lastToAct = view.currentTrick.length === 3;
      const partnerLeads = view.partnerIsWinning();
      if (partnerLeads && !lastToAct) return minBy(follows, (c) => c.rank);
      return minBy(follows, (c) => this._dangerValue(view, c));
    }

    return maxBy(moves, (c) => this._dangerValue(view, c));
  }

  _leadNolo(view, moves) {
    const suits = bySuit(moves);
    let bestCard = moves[0];
    let bestScore = Infinity;
    for (const [s, cards] of suits) {
      const low = minBy(cards, (c) => c.rank);
      const unseen = unseenInSuit(view, s);
      const coverAbove = unseen.filter((c) => c.rank > low.rank).length;
      const ownLength = this._suitLength(view.hand, s);
      const bossPenalty = isBoss(view, low) ? 20 : 0;
      const score = low.rank * 1.4 - ownLength * 0.9 - Math.min(coverAbove, 3) * 1.6 + bossPenalty;
      if (score < bestScore) {
        bestScore = score;
        bestCard = low;
      }
    }
    return bestCard;
  }

  _searchMove(view, moves) {
    const unseen = [...unseenCards(view)];
    const voids = voidsFromHistory(view);
    const need = {};
    for (const s of [0, 1, 2, 3]) {
      if (s !== view.seat) need[s] = cardsRemainingInHand(view, s);
    }

    let best = null;
    let bestScore = view.wantToWinTricks ? -Infinity : Infinity;
    for (const card of moves) {
      let total = 0;
      let used = 0;
      for (let i = 0; i < this.simulations; i++) {
        const hands = this._dealHidden(view, unseen, need, voids);
        if (!hands) continue;
        const tricks = this._rolloutFrom(view, hands, card);
        total += tricks[view.team];
        used++;
      }
      if (!used) continue;
      const avg = total / used;
      if (
        best === null ||
        (view.wantToWinTricks ? avg > bestScore + 0.01 : avg < bestScore - 0.01)
      ) {
        best = card;
        bestScore = avg;
      }
    }
    return best;
  }

  _dealHidden(view, unseen, need, voids) {
    const seats = Object.keys(need).map(Number);
    for (let attempt = 0; attempt < 10; attempt++) {
      const pool = [...unseen];
      this.rng.shuffle(pool);
      const hands = { [view.seat]: [...view.hand] };
      const capacity = { ...need };
      for (const s of seats) hands[s] = [];

      pool.sort((a, b) => this._allowedSeats(a, seats, capacity, voids).length -
        this._allowedSeats(b, seats, capacity, voids).length);

      let ok = true;
      for (const card of pool) {
        const allowed = this._allowedSeats(card, seats, capacity, voids);
        if (!allowed.length) {
          ok = false;
          break;
        }
        const seat = this.rng.choice(allowed);
        hands[seat].push(card);
        capacity[seat]--;
      }
      if (ok && seats.every((s) => capacity[s] === 0)) return hands;
    }
    return null;
  }

  _allowedSeats(card, seats, capacity, voids) {
    return seats.filter((s) => capacity[s] > 0 && !voids[s].has(card.suit));
  }

  _rolloutFrom(view, handsIn, firstCard) {
    const hands = {};
    for (const s of Object.keys(handsIn)) hands[s] = [...handsIn[s]];
    const tricks = { ...view.tricksByTeam };
    let trick = view.currentTrick.map(([s, c]) => [s, c]);
    let ledSuit = view.ledSuit;

    removeCard(hands[view.seat], firstCard);
    if (ledSuit === null) ledSuit = firstCard.suit;
    trick.push([view.seat, firstCard]);

    let seat = view.seat;
    while (trick.length < 4) {
      seat = (seat + 1) % 4;
      const card = rolloutPolicy(hands[seat], ledSuit, trick, seat, view.gameType);
      removeCard(hands[seat], card);
      trick.push([seat, card]);
    }

    let winner = trickWinner(trick);
    tricks[teamOf(winner)]++;
    let leader = winner;

    while (hands[view.seat].length > 0) {
      trick = [];
      ledSuit = null;
      for (let i = 0; i < 4; i++) {
        const s = (leader + i) % 4;
        const card = rolloutPolicy(hands[s], ledSuit, trick, s, view.gameType);
        removeCard(hands[s], card);
        if (ledSuit === null) ledSuit = card.suit;
        trick.push([s, card]);
      }
      winner = trickWinner(trick);
      tricks[teamOf(winner)]++;
      leader = winner;
    }

    return tricks;
  }

  _partnerLeadLooksSafe(view) {
    if (!view.currentTrick.length) return false;
    if (view.currentTrick.length >= 3) return true;

    const led = view.currentTrick[0][1].suit;
    const cur = this._currentHigh(view);
    const voids = voidsFromHistory(view);
    const higher = unseenInSuit(view, led).filter((c) => c.rank > cur);
    for (let offset = 1; offset < 4 - view.currentTrick.length; offset++) {
      const seat = (view.seat + offset) % 4;
      if (teamOf(seat) === view.team) continue;
      if (!voids[seat].has(led) && higher.length > 0) return false;
    }
    return true;
  }

  _beatsCurrent(view, card) {
    if (!view.currentTrick.length) return true;
    const led = view.currentTrick[0][1].suit;
    return card.suit === led && card.rank > this._currentHigh(view);
  }

  _currentHigh(view) {
    return currentHighRank(view.currentTrick, view.ledSuit);
  }

  _suitLength(hand, suit) {
    return hand.filter((c) => c.suit === suit).length;
  }

  _saveValue(view, card) {
    return card.rank + (isBoss(view, card) ? 8 : 0) + this._suitLength(view.hand, card.suit) * 0.25;
  }

  _dangerValue(view, card) {
    const higherHidden = unseenInSuit(view, card.suit).filter((c) => c.rank > card.rank).length;
    return card.rank * 2.2 + (isBoss(view, card) ? 10 : 0) - higherHidden * 0.8 +
      this._suitLength(view.hand, card.suit) * 0.5;
  }
}

function rolloutPolicy(hand, ledSuit, trick, seat, gameType) {
  const moves = legalMoves(hand, ledSuit);
  if (moves.length === 1) return moves[0];

  const wantWin = gameType === "rami";
  if (ledSuit === null || !trick.length) {
    const suits = bySuit(moves);
    if (wantWin) {
      let bestSuit = null;
      let bestScore = -Infinity;
      for (const [s, cards] of suits) {
        const score = cards.length * 2 + Math.max(...cards.map((c) => c.rank));
        if (score > bestScore) {
          bestScore = score;
          bestSuit = s;
        }
      }
      return maxBy(suits.get(bestSuit), (c) => c.rank);
    }
    let bestSuit = null;
    let bestScore = Infinity;
    for (const [s, cards] of suits) {
      const score = Math.min(...cards.map((c) => c.rank)) - cards.length * 0.7;
      if (score < bestScore) {
        bestScore = score;
        bestSuit = s;
      }
    }
    return minBy(suits.get(bestSuit), (c) => c.rank);
  }

  const cur = currentHighRank(trick, ledSuit);
  const winner = partialWinner(trick);
  const partnerLeads = winner !== null && teamOf(winner) === teamOf(seat);
  const follows = moves.filter((c) => c.suit === ledSuit);

  if (follows.length) {
    if (wantWin) {
      if (partnerLeads) return minBy(follows, (c) => c.rank);
      const wins = follows.filter((c) => c.rank > cur);
      if (wins.length) return minBy(wins, (c) => c.rank);
      return minBy(follows, (c) => c.rank);
    }
    const under = follows.filter((c) => c.rank < cur);
    if (under.length) return maxBy(under, (c) => c.rank);
    return minBy(follows, (c) => c.rank);
  }

  return wantWin ? minBy(moves, (c) => c.rank) : maxBy(moves, (c) => c.rank);
}

export default function createPlayer() {
  return new CodexPlayer();
}
