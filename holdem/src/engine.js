// Hold'em — Texas Hold'em -pelimoottori (Node + selain).
// Kortit, käsiarvio, panostuskierrokset, sivupotit, botView/safeAct.
// Politiikka: src/bots/ (kuten hertta/tuppi) — ei DOM:ia.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HoldemEngine = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SUITS = ["s", "h", "d", "c"]; // spadit, hertta, ruutu, risti
  var SUIT_SYMBOL = { s: "♠", h: "♥", d: "♦", c: "♣" };
  var SUIT_COLOR = { s: "black", h: "red", d: "red", c: "black" };
  var RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 14 = ässä
  var RANK_LABEL = {
    2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9",
    10: "10", 11: "J", 12: "Q", 13: "K", 14: "A",
  };

  var HAND_NAMES = [
    "korkea kortti", "pari", "kaksi paria", "kolmoset", "suora",
    "väri", "väri+kolmoset", "neloset", "värisuora", "kuninkaallinen värisuora",
  ];

  var STREET_ORDER = ["preflop", "flop", "turn", "river", "showdown"];
  var DEFAULT_STACK = 1000;
  var DEFAULT_SB = 5;
  var DEFAULT_BB = 10;
  var PLAYER_COUNT = 4;

  // ---- RNG -----------------------------------------------------------------

  function makeRNG(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = (rng() * (i + 1)) | 0;
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  // ---- Kortit --------------------------------------------------------------

  function card(rank, suit) {
    return { rank: rank, suit: suit };
  }

  function cardKey(c) {
    return RANK_LABEL[c.rank] + c.suit;
  }

  function cardLabel(c) {
    return RANK_LABEL[c.rank] + SUIT_SYMBOL[c.suit];
  }

  function parseCard(str) {
    // "As", "Td", "7h", "Kh" — A/K/Q/J/T/2-9 + s/h/d/c
    var m = /^([2-9TJQKA])([shdc])$/i.exec(String(str).trim());
    if (!m) throw new Error("virheellinen kortti: " + str);
    var rMap = { T: 10, J: 11, Q: 12, K: 13, A: 14 };
    var ch = m[1].toUpperCase();
    var rank = rMap[ch] || parseInt(ch, 10);
    return card(rank, m[2].toLowerCase());
  }

  function parseCards(strs) {
    return strs.map(parseCard);
  }

  function buildDeck() {
    var d = [];
    for (var si = 0; si < SUITS.length; si++) {
      for (var ri = 0; ri < RANKS.length; ri++) {
        d.push(card(RANKS[ri], SUITS[si]));
      }
    }
    return d;
  }

  function cloneCard(c) {
    return { rank: c.rank, suit: c.suit };
  }

  function cloneCards(arr) {
    return arr.map(cloneCard);
  }

  // ---- Käsiarvio (paras 5 seitsemästä) ------------------------------------

  function rankFive(cards) {
    // cards: 5 korttia. Palauttaa [category, ...kickers] (isompi = parempi).
    var ranks = cards.map(function (c) { return c.rank; }).sort(function (a, b) { return b - a; });
    var suits = cards.map(function (c) { return c.suit; });
    var counts = {};
    for (var i = 0; i < ranks.length; i++) counts[ranks[i]] = (counts[ranks[i]] || 0) + 1;
    var byCount = Object.keys(counts).map(Number).sort(function (a, b) {
      if (counts[b] !== counts[a]) return counts[b] - counts[a];
      return b - a;
    });

    var isFlush = suits.every(function (s) { return s === suits[0]; });
    var uniq = ranks.filter(function (r, i) { return ranks.indexOf(r) === i; });
    var isStraight = false;
    var straightHigh = 0;
    if (uniq.length === 5 && uniq[0] - uniq[4] === 4) {
      isStraight = true;
      straightHigh = uniq[0];
    } else if (uniq.length === 5 && uniq[0] === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2) {
      // A-2-3-4-5 (pyörä)
      isStraight = true;
      straightHigh = 5;
    }

    if (isStraight && isFlush) {
      return straightHigh === 14 ? [9, 14] : [8, straightHigh];
    }
    if (counts[byCount[0]] === 4) {
      return [7, byCount[0], byCount[1]];
    }
    if (counts[byCount[0]] === 3 && counts[byCount[1]] === 2) {
      return [6, byCount[0], byCount[1]];
    }
    if (isFlush) {
      return [5].concat(ranks);
    }
    if (isStraight) {
      return [4, straightHigh];
    }
    if (counts[byCount[0]] === 3) {
      return [3, byCount[0]].concat(byCount.slice(1));
    }
    if (counts[byCount[0]] === 2 && counts[byCount[1]] === 2) {
      var hi = Math.max(byCount[0], byCount[1]);
      var lo = Math.min(byCount[0], byCount[1]);
      return [2, hi, lo, byCount[2]];
    }
    if (counts[byCount[0]] === 2) {
      return [1, byCount[0]].concat(byCount.slice(1));
    }
    return [0].concat(ranks);
  }

  function compareRankVectors(a, b) {
    var n = Math.max(a.length, b.length);
    for (var i = 0; i < n; i++) {
      var av = a[i] || 0;
      var bv = b[i] || 0;
      if (av !== bv) return av > bv ? 1 : -1;
    }
    return 0;
  }

  function combinations(arr, k) {
    var out = [];
    function rec(start, chosen) {
      if (chosen.length === k) {
        out.push(chosen.slice());
        return;
      }
      for (var i = start; i < arr.length; i++) {
        chosen.push(arr[i]);
        rec(i + 1, chosen);
        chosen.pop();
      }
    }
    rec(0, []);
    return out;
  }

  function evaluateHand(cards) {
    if (!cards || cards.length < 5) {
      return { category: -1, name: "vajaa", vector: [-1], best: [] };
    }
    var bestVec = null;
    var bestFive = null;
    var combos = cards.length === 5 ? [cards] : combinations(cards, 5);
    for (var i = 0; i < combos.length; i++) {
      var vec = rankFive(combos[i]);
      if (!bestVec || compareRankVectors(vec, bestVec) > 0) {
        bestVec = vec;
        bestFive = combos[i];
      }
    }
    return {
      category: bestVec[0],
      name: HAND_NAMES[bestVec[0]],
      vector: bestVec,
      best: cloneCards(bestFive),
    };
  }

  function compareHands(cardsA, cardsB) {
    return compareRankVectors(evaluateHand(cardsA).vector, evaluateHand(cardsB).vector);
  }

  // ---- Sivupotit -----------------------------------------------------------

  function computeSidePots(players) {
    // players: { folded, contrib (total this hand) }
    // Palauttaa [{amount, eligible: seat[]}, ...]
    var levels = [];
    for (var i = 0; i < players.length; i++) {
      if (players[i].contrib > 0) levels.push(players[i].contrib);
    }
    levels = levels.filter(function (v, idx, a) { return a.indexOf(v) === idx; })
      .sort(function (a, b) { return a - b; });

    var pots = [];
    var prev = 0;
    for (var li = 0; li < levels.length; li++) {
      var level = levels[li];
      var layer = level - prev;
      if (layer <= 0) continue;
      var amount = 0;
      var eligible = [];
      for (var p = 0; p < players.length; p++) {
        if (players[p].contrib >= level) {
          amount += layer;
          if (!players[p].folded) eligible.push(p);
        } else if (players[p].contrib > prev) {
          amount += players[p].contrib - prev;
        }
      }
      if (amount > 0 && eligible.length > 0) {
        pots.push({ amount: amount, eligible: eligible });
      }
      prev = level;
    }
    return pots;
  }

  // ---- Pelitila ------------------------------------------------------------

  function defaultNames() {
    return ["Sinä", "Aino", "Eero", "Mika"];
  }

  function newGame(opts) {
    opts = opts || {};
    var seed = opts.seed != null ? opts.seed : ((Date.now() % 1e9) | 0);
    var rng = makeRNG(seed);
    var names = opts.names || defaultNames();
    var n = opts.playerCount || PLAYER_COUNT;
    var stack = opts.startingStack != null ? opts.startingStack : DEFAULT_STACK;
    var players = [];
    for (var i = 0; i < n; i++) {
      players.push({
        seat: i,
        name: names[i] || ("Pelaaja " + (i + 1)),
        chips: stack,
        hole: [],
        folded: false,
        allIn: false,
        bet: 0,
        contrib: 0,
        acted: false,
        isHuman: i === 0,
      });
    }
    var state = {
      seed: seed,
      rng: rng,
      players: players,
      deck: [],
      board: [],
      street: "idle",
      dealer: n - 1, // ensimmäinen jako: human SB heads-up -tyyliin; 4p: dealer viimeinen
      sb: opts.sb != null ? opts.sb : DEFAULT_SB,
      bb: opts.bb != null ? opts.bb : DEFAULT_BB,
      currentBet: 0,
      minRaise: 0,
      toAct: -1,
      potTotal: 0,
      handNumber: 0,
      difficulty: opts.difficulty || "normaali",
      winners: null,
      lastHand: null,
      phase: "playing", // playing | handOver | gameOver
      message: "",
      forcedCards: opts.forcedCards || null, // { holes: [[..],[..]], board: [...] } testeille
    };
    startHand(state);
    return state;
  }

  function aliveSeats(state) {
    return state.players.map(function (p, i) { return p.chips > 0 ? i : -1; })
      .filter(function (i) { return i >= 0; });
  }

  function activeInHand(state) {
    // Ei foldannut (mukana jaossa, voi olla all-in)
    return state.players
      .map(function (p, i) { return !p.folded && (p.chips > 0 || p.contrib > 0 || p.allIn || p.hole.length) ? i : -1; })
      .filter(function (i) { return i >= 0; })
      .filter(function (i) { return !state.players[i].folded; });
  }

  function canActSeats(state) {
    // Voi vielä panostaa tällä kierroksella
    return activeInHand(state).filter(function (i) {
      var p = state.players[i];
      return !p.allIn && p.chips > 0;
    });
  }

  function nextSeat(state, from, pred) {
    var n = state.players.length;
    for (var k = 1; k <= n; k++) {
      var i = (from + k) % n;
      if (pred(state.players[i], i)) return i;
    }
    return -1;
  }

  function dealFromDeck(state, n) {
    var out = [];
    for (var i = 0; i < n; i++) {
      if (!state.deck.length) throw new Error("pakka tyhjä");
      out.push(state.deck.pop());
    }
    return out;
  }

  function postBlind(state, seat, amount) {
    var p = state.players[seat];
    var pay = Math.min(amount, p.chips);
    p.chips -= pay;
    p.bet += pay;
    p.contrib += pay;
    if (p.chips === 0) p.allIn = true;
    state.potTotal += pay;
    return pay;
  }

  function startHand(state) {
    var withChips = aliveSeats(state);
    if (withChips.length < 2) {
      state.phase = "gameOver";
      state.street = "idle";
      state.toAct = -1;
      var champ = withChips[0];
      state.winners = champ != null ? [champ] : [];
      state.message = champ != null
        ? (state.players[champ].isHuman ? "Voitit pelin!" : state.players[champ].name + " voitti pelin.")
        : "Peli ohi.";
      return state;
    }

    state.handNumber++;
    state.phase = "playing";
    state.winners = null;
    state.board = [];
    state.potTotal = 0;
    state.currentBet = 0;
    state.minRaise = state.bb;
    state.message = "";

    // Siirrä button seuraavalle chips>0
    state.dealer = nextSeat(state, state.dealer, function (p) { return p.chips > 0; });
    if (state.dealer < 0) state.dealer = withChips[0];

    for (var i = 0; i < state.players.length; i++) {
      var p = state.players[i];
      p.hole = [];
      p.folded = p.chips === 0;
      p.allIn = false;
      p.bet = 0;
      p.contrib = 0;
      p.acted = false;
    }

    // Pakka
    if (state.forcedCards && state.forcedCards.deck) {
      state.deck = parseCards(state.forcedCards.deck).reverse();
    } else {
      state.deck = shuffle(buildDeck(), state.rng);
    }

    // Blindit: heads-up = button SB; muuten SB = dealer+1, BB = dealer+2
    var sbSeat, bbSeat;
    if (withChips.length === 2) {
      sbSeat = state.dealer;
      bbSeat = nextSeat(state, state.dealer, function (p) { return p.chips > 0; });
    } else {
      sbSeat = nextSeat(state, state.dealer, function (p) { return p.chips > 0; });
      bbSeat = nextSeat(state, sbSeat, function (p) { return p.chips > 0; });
    }
    postBlind(state, sbSeat, state.sb);
    postBlind(state, bbSeat, state.bb);
    state.currentBet = Math.max(state.players[sbSeat].bet, state.players[bbSeat].bet);
    state.minRaise = state.bb;

    // Hole cards
    if (state.forcedCards && state.forcedCards.holes) {
      for (var h = 0; h < state.players.length; h++) {
        if (state.players[h].folded) continue;
        if (state.forcedCards.holes[h]) {
          state.players[h].hole = parseCards(state.forcedCards.holes[h]);
        }
      }
      // Poista forced hole-kortit pakasta jos ne ovat siellä
      var used = {};
      state.players.forEach(function (pl) {
        pl.hole.forEach(function (c) { used[cardKey(c)] = true; });
      });
      state.deck = state.deck.filter(function (c) { return !used[cardKey(c)]; });
    } else {
      for (var round = 0; round < 2; round++) {
        var seat = nextSeat(state, state.dealer, function (p) { return !p.folded; });
        var first = seat;
        do {
          state.players[seat].hole.push(dealFromDeck(state, 1)[0]);
          seat = nextSeat(state, seat, function (p) { return !p.folded; });
        } while (seat !== first && seat >= 0);
      }
    }

    state.street = "preflop";
    // Ensimmäinen toimija: BB:n jälkeen
    state.toAct = nextSeat(state, bbSeat, function (p) {
      return !p.folded && !p.allIn && p.chips > 0;
    });
    // Jos kaikki all-in blindeissa
    if (state.toAct < 0 || bettingRoundComplete(state)) {
      advanceStreet(state);
    }
    // Kuluta forcedCards vain yhdessä kädessä
    state.forcedCards = null;
    return state;
  }

  function bettingRoundComplete(state) {
    var actors = canActSeats(state);
    if (actors.length === 0) return true;
    // Kaikkien pitää olla toimineet ja bet === currentBet (tai all-in)
    for (var i = 0; i < state.players.length; i++) {
      var p = state.players[i];
      if (p.folded || p.allIn) continue;
      if (p.chips === 0) continue;
      if (!p.acted) return false;
      if (p.bet < state.currentBet) return false;
    }
    // Erityistapaus: preflop BB ei ole "toiminut" jos kaikki vain callanneet —
    // meidän acted-lippu hoitaa: BB saa vuoron ja check/raise.
    return true;
  }

  function resetBetsForStreet(state) {
    for (var i = 0; i < state.players.length; i++) {
      state.players[i].bet = 0;
      state.players[i].acted = false;
    }
    state.currentBet = 0;
    state.minRaise = state.bb;
  }

  function dealBoard(state, n) {
    // burn one
    if (state.deck.length) state.deck.pop();
    var cards = dealFromDeck(state, n);
    state.board = state.board.concat(cards);
  }

  function advanceStreet(state) {
    var alive = activeInHand(state);
    if (alive.length === 1) {
      return awardPot(state, [alive[0]], false);
    }

    var idx = STREET_ORDER.indexOf(state.street);
    if (state.street === "preflop") {
      resetBetsForStreet(state);
      dealBoard(state, 3);
      state.street = "flop";
    } else if (state.street === "flop") {
      resetBetsForStreet(state);
      dealBoard(state, 1);
      state.street = "turn";
    } else if (state.street === "turn") {
      resetBetsForStreet(state);
      dealBoard(state, 1);
      state.street = "river";
    } else if (state.street === "river") {
      return showdown(state);
    } else {
      return state;
    }

    // Jos enintään yksi voi vielä panostaa → jaa loput kortit showdowniin
    var actors = canActSeats(state);
    if (actors.length <= 1) {
      return runOutBoard(state);
    }

    // Ensimmäinen toimija: dealer+1 (ensimmäinen aktiivinen)
    state.toAct = nextSeat(state, state.dealer, function (p) {
      return !p.folded && !p.allIn && p.chips > 0;
    });
    if (state.toAct < 0 || bettingRoundComplete(state)) {
      return advanceStreet(state);
    }
    return state;
  }

  function runOutBoard(state) {
    while (state.board.length < 5) {
      var need = state.board.length === 0 ? 3 : 1;
      if (state.board.length >= 3 && state.board.length < 5) need = 1;
      dealBoard(state, need);
    }
    state.street = "river";
    return showdown(state);
  }

  function showdown(state) {
    state.street = "showdown";
    state.toAct = -1;
    var contenders = activeInHand(state);
    var pots = computeSidePots(state.players.map(function (p) {
      return { folded: p.folded, contrib: p.contrib };
    }));

    var awards = {}; // seat -> chips
    var handInfo = {};
    contenders.forEach(function (i) {
      handInfo[i] = evaluateHand(state.players[i].hole.concat(state.board));
    });

    pots.forEach(function (pot) {
      var elig = pot.eligible.filter(function (i) { return contenders.indexOf(i) >= 0; });
      if (!elig.length) return;
      var best = elig[0];
      var winners = [best];
      for (var k = 1; k < elig.length; k++) {
        var cmp = compareRankVectors(handInfo[elig[k]].vector, handInfo[best].vector);
        if (cmp > 0) {
          best = elig[k];
          winners = [best];
        } else if (cmp === 0) {
          winners.push(elig[k]);
        }
      }
      var share = Math.floor(pot.amount / winners.length);
      var rem = pot.amount - share * winners.length;
      winners.forEach(function (w, wi) {
        awards[w] = (awards[w] || 0) + share + (wi === 0 ? rem : 0);
      });
    });

    var winnerSeats = Object.keys(awards).map(Number).filter(function (s) { return awards[s] > 0; });
    winnerSeats.forEach(function (s) {
      state.players[s].chips += awards[s];
    });

    state.winners = winnerSeats;
    state.phase = "handOver";
    state.lastHand = {
      winners: winnerSeats,
      awards: awards,
      hands: handInfo,
      board: cloneCards(state.board),
      holes: state.players.map(function (p) { return cloneCards(p.hole); }),
      folded: state.players.map(function (p) { return p.folded; }),
    };

    var names = winnerSeats.map(function (s) {
      var h = handInfo[s];
      return state.players[s].name + (h ? " (" + h.name + ")" : "");
    });
    state.message = names.length
      ? (names.join(", ") + " voittaa " + (winnerSeats.length === 1 ? awards[winnerSeats[0]] : "potin") + ".")
      : "Jako ohi.";
    return state;
  }

  function awardPot(state, seats, showdownFlag) {
    var total = state.potTotal;
    // Kerää jäljellä olevat betit potiin — potTotal jo ylläpidetty
    var share = Math.floor(total / seats.length);
    var rem = total - share * seats.length;
    var awards = {};
    seats.forEach(function (s, i) {
      var got = share + (i === 0 ? rem : 0);
      state.players[s].chips += got;
      awards[s] = got;
    });
    state.winners = seats;
    state.phase = "handOver";
    state.street = "showdown";
    state.toAct = -1;
    state.lastHand = {
      winners: seats,
      awards: awards,
      hands: {},
      board: cloneCards(state.board),
      holes: state.players.map(function (p) { return cloneCards(p.hole); }),
      folded: state.players.map(function (p) { return p.folded; }),
      foldWin: !showdownFlag,
    };
    state.message = state.players[seats[0]].name + " voittaa potin (" + total + ") — muut luovuttivat.";
    return state;
  }

  // ---- Lailliset toiminnot -------------------------------------------------

  function legalActions(state) {
    if (state.phase !== "playing" || state.toAct < 0) return [];
    var seat = state.toAct;
    var p = state.players[seat];
    if (!p || p.folded || p.allIn || p.chips <= 0) return [];

    var toCall = state.currentBet - p.bet;
    var actions = [];

    if (toCall <= 0) {
      actions.push({ type: "check", amount: 0 });
      // Bet: vähintään BB, enintään stack
      if (p.chips > 0) {
        var minBet = Math.min(state.bb, p.chips);
        actions.push({ type: "bet", min: minBet, max: p.chips });
      }
    } else {
      if (toCall >= p.chips) {
        actions.push({ type: "call", amount: p.chips, allIn: true });
      } else {
        actions.push({ type: "call", amount: toCall });
        // Raise: currentBet + minRaise ... stack
        var minRaiseTotal = state.currentBet + state.minRaise;
        var needForMinRaise = minRaiseTotal - p.bet;
        if (p.chips > toCall) {
          if (p.chips >= needForMinRaise) {
            actions.push({ type: "raise", min: needForMinRaise, max: p.chips, minTotal: minRaiseTotal });
          } else {
            // Alle min raisen all-in on silti sallittu (ei avaa uudelleen täysiin)
            actions.push({ type: "raise", min: p.chips, max: p.chips, minTotal: p.bet + p.chips, short: true });
          }
        }
      }
    }
    actions.push({ type: "fold", amount: 0 });
    return actions;
  }

  function applyAction(state, action) {
    if (state.phase !== "playing") return { ok: false, error: "ei pelivuoroa" };
    var seat = state.toAct;
    if (seat < 0) return { ok: false, error: "ei toimijaa" };
    var p = state.players[seat];
    var legal = legalActions(state);
    var match = null;
    for (var i = 0; i < legal.length; i++) {
      if (legal[i].type === action.type) { match = legal[i]; break; }
    }
    if (!match) return { ok: false, error: "laiton siirto: " + action.type };

    if (action.type === "fold") {
      p.folded = true;
      p.acted = true;
    } else if (action.type === "check") {
      p.acted = true;
    } else if (action.type === "call") {
      var pay = Math.min(match.amount, p.chips);
      p.chips -= pay;
      p.bet += pay;
      p.contrib += pay;
      state.potTotal += pay;
      if (p.chips === 0) p.allIn = true;
      p.acted = true;
    } else if (action.type === "bet" || action.type === "raise") {
      var amount = action.amount;
      if (amount == null) amount = match.min;
      if (amount < match.min - 0.001 || amount > match.max + 0.001) {
        return { ok: false, error: "summa " + amount + " ei välillä " + match.min + "–" + match.max };
      }
      amount = Math.min(Math.max(amount, match.min), match.max);
      amount = Math.min(amount, p.chips);
      var prevBet = state.currentBet;
      p.chips -= amount;
      p.bet += amount;
      p.contrib += amount;
      state.potTotal += amount;
      if (p.chips === 0) p.allIn = true;
      var raiseBy = p.bet - prevBet;
      if (raiseBy >= state.minRaise) {
        state.minRaise = raiseBy;
      }
      state.currentBet = p.bet;
      // Muut joutuvat toimimaan uudelleen
      for (var j = 0; j < state.players.length; j++) {
        if (j !== seat && !state.players[j].folded && !state.players[j].allIn) {
          state.players[j].acted = false;
        }
      }
      p.acted = true;
    } else {
      return { ok: false, error: "tuntematon siirto" };
    }

    // Jos vain yksi jäljellä
    var alive = activeInHand(state);
    if (alive.length === 1) {
      awardPot(state, alive, false);
      return { ok: true, state: state };
    }

    // Seuraava toimija
    var next = nextSeat(state, seat, function (pl) {
      return !pl.folded && !pl.allIn && pl.chips > 0 && (!pl.acted || pl.bet < state.currentBet);
    });

    if (next < 0 || bettingRoundComplete(state)) {
      advanceStreet(state);
    } else {
      state.toAct = next;
    }
    return { ok: true, state: state };
  }

  function nextHand(state) {
    if (state.phase !== "handOver" && state.phase !== "gameOver") {
      return { ok: false, error: "käsi kesken" };
    }
    // Nollaa nollachips-pelaajat
    startHand(state);
    return { ok: true, state: state };
  }

  // ---- Botti-havainto + turvaverkko (politiikka: src/bots/) -----------------

  // Havainto politiikalle: vain oma käsi + julkinen tieto + legal.
  // Sama idea kuin hertan buildPlayView / tupin PlayView.
  function botView(state, seat) {
    var p = state.players[seat];
    var acts = state.toAct === seat ? legalActions(state) : [];
    return {
      seat: seat,
      hole: cloneCards(p.hole),
      board: cloneCards(state.board),
      street: state.street,
      pot: state.potTotal,
      currentBet: state.currentBet,
      myBet: p.bet,
      myChips: p.chips,
      toCall: Math.max(0, state.currentBet - p.bet),
      minRaise: state.minRaise,
      sb: state.sb,
      bb: state.bb,
      legal: acts.map(function (a) {
        var copy = { type: a.type };
        if (a.amount != null) copy.amount = a.amount;
        if (a.min != null) copy.min = a.min;
        if (a.max != null) copy.max = a.max;
        if (a.minTotal != null) copy.minTotal = a.minTotal;
        if (a.allIn) copy.allIn = true;
        if (a.short) copy.short = true;
        return copy;
      }),
      opponents: state.players.map(function (op, i) {
        if (i === seat) return null;
        return {
          seat: i,
          chips: op.chips,
          bet: op.bet,
          folded: op.folded,
          allIn: op.allIn,
        };
      }).filter(Boolean),
      rng: state.rng,
      evaluateHand: evaluateHand,
    };
  }

  function isLegalDecision(view, action) {
    if (!action || !view || !view.legal) return false;
    for (var i = 0; i < view.legal.length; i++) {
      var a = view.legal[i];
      if (a.type !== action.type) continue;
      if (action.type === "fold" || action.type === "check") return true;
      if (action.type === "call") return action.amount === a.amount || action.amount == null;
      if (action.type === "bet" || action.type === "raise") {
        var amt = action.amount;
        if (amt == null) amt = a.min;
        return amt >= a.min && amt <= a.max;
      }
    }
    return false;
  }

  function safeFallback(view) {
    var legal = view.legal || [];
    if (!legal.length) return null;
    for (var i = 0; i < legal.length; i++) {
      if (legal[i].type === "check") return { type: "check" };
    }
    for (var j = 0; j < legal.length; j++) {
      if (legal[j].type === "call") return { type: "call", amount: legal[j].amount };
    }
    for (var k = 0; k < legal.length; k++) {
      if (legal[k].type === "fold") return { type: "fold" };
    }
    var a = legal[0];
    if (a.type === "bet" || a.type === "raise") return { type: a.type, amount: a.min };
    return { type: a.type, amount: a.amount };
  }

  // Kuten hertan safePlay: kutsu bottia, kelpaa vain laillinen.
  function safeAct(bot, view) {
    if (!view || !view.legal || !view.legal.length) return null;
    try {
      var act = bot && typeof bot.act === "function" ? bot.act(view) : null;
      if (act && isLegalDecision(view, act)) return act;
    } catch (e) { /* fall through */ }
    return safeFallback(view);
  }

  // Kiinteä päätöstilanne bottitesteille.
  function scenario(opts) {
    opts = opts || {};
    var holes = opts.holes || [];
    var n = holes.length || opts.playerCount || 2;
    var chips0 = opts.chips || [];
    var bets = opts.bets || [];
    var board = opts.board ? parseCards(opts.board) : [];
    var street = opts.street || (board.length === 0 ? "preflop" : board.length === 3 ? "flop" : board.length === 4 ? "turn" : "river");
    var seed = opts.seed != null ? opts.seed : 1;
    var players = [];
    for (var i = 0; i < n; i++) {
      var hole = holes[i] ? parseCards(holes[i]) : [];
      var bet = bets[i] != null ? bets[i] : 0;
      var ch = chips0[i] != null ? chips0[i] : 1000;
      players.push({
        seat: i,
        name: "P" + i,
        chips: ch,
        hole: hole,
        folded: !!(opts.folded && opts.folded[i]),
        allIn: ch === 0,
        bet: bet,
        contrib: (opts.contrib && opts.contrib[i] != null) ? opts.contrib[i] : bet,
        acted: !!(opts.acted && opts.acted[i]),
        isHuman: false,
      });
    }
    var state = {
      seed: seed,
      rng: makeRNG(seed),
      players: players,
      deck: shuffle(buildDeck(), makeRNG(seed + 99)),
      board: board,
      street: street,
      dealer: opts.dealer != null ? opts.dealer : 0,
      sb: opts.sb != null ? opts.sb : DEFAULT_SB,
      bb: opts.bb != null ? opts.bb : DEFAULT_BB,
      currentBet: opts.currentBet != null ? opts.currentBet : Math.max.apply(null, bets.concat([0])),
      minRaise: opts.minRaise != null ? opts.minRaise : (opts.bb != null ? opts.bb : DEFAULT_BB),
      toAct: opts.toAct != null ? opts.toAct : 0,
      potTotal: opts.pot != null ? opts.pot : bets.reduce(function (s, b) { return s + (b || 0); }, 0),
      handNumber: 1,
      difficulty: opts.difficulty || "normaali",
      winners: null,
      lastHand: null,
      phase: "playing",
      message: "",
      forcedCards: null,
    };
    var used = {};
    board.forEach(function (c) { used[cardKey(c)] = true; });
    players.forEach(function (pl) {
      pl.hole.forEach(function (c) { used[cardKey(c)] = true; });
    });
    state.deck = state.deck.filter(function (c) { return !used[cardKey(c)]; });
    return state;
  }

  // ---- Näkymäapurit testeille / UI:lle ------------------------------------

  function publicState(state) {
    return {
      seed: state.seed,
      handNumber: state.handNumber,
      street: state.street,
      phase: state.phase,
      dealer: state.dealer,
      toAct: state.toAct,
      potTotal: state.potTotal,
      currentBet: state.currentBet,
      minRaise: state.minRaise,
      sb: state.sb,
      bb: state.bb,
      board: cloneCards(state.board),
      message: state.message,
      winners: state.winners ? state.winners.slice() : null,
      difficulty: state.difficulty,
      players: state.players.map(function (p, i) {
        return {
          seat: i,
          name: p.name,
          chips: p.chips,
          bet: p.bet,
          contrib: p.contrib,
          folded: p.folded,
          allIn: p.allIn,
          isHuman: p.isHuman,
          hole: p.isHuman || state.phase === "handOver" || state.street === "showdown"
            ? cloneCards(p.hole)
            : p.hole.map(function () { return null; }),
          holeCount: p.hole.length,
        };
      }),
      legal: state.phase === "playing" && state.toAct === 0 ? legalActions(state) : [],
      lastHand: state.lastHand,
    };
  }

  // ---- Auto-play kokonainen käsi (testeille) ------------------------------

  function playHandToEnd(state, opts) {
    opts = opts || {};
    var humanPolicy = opts.humanPolicy || function () {
      var acts = legalActions(state);
      if (!acts.length) return null;
      for (var i = 0; i < acts.length; i++) {
        if (acts[i].type === "check") return { type: "check" };
        if (acts[i].type === "call") return { type: "call", amount: acts[i].amount };
      }
      return { type: "fold" };
    };
    var bots = opts.bots || null; // [bot|null, ...] per seat; null → humanPolicy if isHuman
    var guard = 0;
    while (state.phase === "playing" && guard < 200) {
      if (state.toAct < 0) break;
      var seat = state.toAct;
      var act;
      if (bots && bots[seat]) {
        act = safeAct(bots[seat], botView(state, seat));
      } else if (state.players[seat].isHuman) {
        act = humanPolicy(state);
      } else if (bots && bots[0]) {
        // fallback: use seat0 bot for all non-human if sparse array
        act = safeAct(bots[0], botView(state, seat));
      } else {
        break;
      }
      if (!act) break;
      var r = applyAction(state, act);
      if (!r.ok) break;
      guard++;
    }
    return state;
  }

  function playBotTurns(state, bots, maxSteps) {
    maxSteps = maxSteps || 50;
    var steps = 0;
    while (state.phase === "playing" && state.toAct >= 0 && !state.players[state.toAct].isHuman && steps < maxSteps) {
      var seat = state.toAct;
      var bot = (bots && bots[seat]) || (bots && bots[0]);
      if (!bot) break;
      var act = safeAct(bot, botView(state, seat));
      if (!act) break;
      var res = applyAction(state, act);
      if (!res.ok) break;
      steps++;
    }
    return state;
  }

  return {
    SUITS: SUITS,
    SUIT_SYMBOL: SUIT_SYMBOL,
    SUIT_COLOR: SUIT_COLOR,
    RANK_LABEL: RANK_LABEL,
    HAND_NAMES: HAND_NAMES,
    DEFAULT_STACK: DEFAULT_STACK,
    DEFAULT_SB: DEFAULT_SB,
    DEFAULT_BB: DEFAULT_BB,
    makeRNG: makeRNG,
    shuffle: shuffle,
    card: card,
    cardKey: cardKey,
    cardLabel: cardLabel,
    parseCard: parseCard,
    parseCards: parseCards,
    buildDeck: buildDeck,
    cloneCard: cloneCard,
    cloneCards: cloneCards,
    rankFive: rankFive,
    evaluateHand: evaluateHand,
    compareHands: compareHands,
    compareRankVectors: compareRankVectors,
    computeSidePots: computeSidePots,
    newGame: newGame,
    startHand: startHand,
    nextHand: nextHand,
    legalActions: legalActions,
    applyAction: applyAction,
    botView: botView,
    safeAct: safeAct,
    isLegalDecision: isLegalDecision,
    scenario: scenario,
    playBotTurns: playBotTurns,
    playHandToEnd: playHandToEnd,
    publicState: publicState,
    activeInHand: activeInHand,
  };
});
