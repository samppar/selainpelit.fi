// Mylly (Nine Men's Morris) — pelimoottori + tekoäly (Node + selain).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MyllyEngine = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var HUMAN = 1;
  var AI = 2;

  var MILLS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14],
    [15, 16, 17], [18, 19, 20], [21, 22, 23],
    [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22],
    [8, 12, 17], [5, 13, 20], [2, 14, 23]
  ];

  var ADJ = [
    [1, 9], [0, 2, 4], [1, 14],
    [4, 10], [1, 3, 5, 7], [4, 13],
    [7, 11], [4, 6, 8], [7, 12],
    [0, 10, 21], [3, 9, 11, 18], [6, 10, 15],
    [8, 13, 17], [5, 12, 14, 20], [2, 13, 23],
    [11, 16], [15, 17, 19], [12, 16],
    [10, 19], [16, 18, 20, 22], [13, 19],
    [9, 22], [19, 21, 23], [14, 22]
  ];

  var COORD = [
    [0, 0], [3, 0], [6, 0],
    [1, 1], [3, 1], [5, 1],
    [2, 2], [3, 2], [4, 2],
    [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3],
    [2, 4], [3, 4], [4, 4],
    [1, 5], [3, 5], [5, 5],
    [0, 6], [3, 6], [6, 6]
  ];

  var MILLS_AT = (function () {
    var at = [];
    for (var i = 0; i < 24; i++) {
      at[i] = [];
      for (var m = 0; m < MILLS.length; m++) {
        if (MILLS[m].indexOf(i) >= 0) at[i].push(MILLS[m]);
      }
    }
    return at;
  })();

  function opp(p) { return 3 - p; }

  function count(board, p) {
    var c = 0;
    for (var i = 0; i < 24; i++) if (board[i] === p) c++;
    return c;
  }

  function inMill(board, i, p) {
    var lines = MILLS_AT[i];
    for (var n = 0; n < lines.length; n++) {
      var line = lines[n];
      if (board[line[0]] === p && board[line[1]] === p && board[line[2]] === p) return true;
    }
    return false;
  }

  function allInMills(board, p) {
    for (var i = 0; i < 24; i++) {
      if (board[i] === p && !inMill(board, i, p)) return false;
    }
    return true;
  }

  function removables(board, p) {
    var out = [];
    var all = allInMills(board, p);
    for (var i = 0; i < 24; i++) {
      if (board[i] === p && (all || !inMill(board, i, p))) out.push(i);
    }
    return out;
  }

  function initState(starter) {
    return {
      board: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      toPlace: [9, 9],
      turn: starter || HUMAN
    };
  }

  function cloneState(st) {
    return {
      board: st.board.slice(),
      toPlace: st.toPlace.slice(),
      turn: st.turn
    };
  }

  function isPlacing(st) {
    return st.toPlace[st.turn - 1] > 0;
  }

  function canFly(st, p) {
    return st.toPlace[0] === 0 && st.toPlace[1] === 0 && count(st.board, p) === 3;
  }

  function phaseOf(st) {
    if (st.toPlace[0] > 0 || st.toPlace[1] > 0) return "place";
    return "move";
  }

  function genMoves(st) {
    var b = st.board;
    var turn = st.turn;
    var moves = [];
    var placing = st.toPlace[turn - 1] > 0;
    var flying = !placing && count(b, turn) === 3;

    function tryMove(from, to) {
      b[to] = turn;
      if (from >= 0) b[from] = 0;
      if (inMill(b, to, turn)) {
        var rem = removables(b, opp(turn));
        if (rem.length === 0) {
          moves.push({ from: from, to: to, remove: -1 });
        } else {
          for (var r = 0; r < rem.length; r++) {
            moves.push({ from: from, to: to, remove: rem[r] });
          }
        }
      } else {
        moves.push({ from: from, to: to, remove: -1 });
      }
      b[to] = 0;
      if (from >= 0) b[from] = turn;
    }

    if (placing) {
      for (var i = 0; i < 24; i++) if (b[i] === 0) tryMove(-1, i);
    } else {
      for (var from = 0; from < 24; from++) {
        if (b[from] !== turn) continue;
        if (flying) {
          for (var j = 0; j < 24; j++) if (b[j] === 0) tryMove(from, j);
        } else {
          var nbs = ADJ[from];
          for (var k = 0; k < nbs.length; k++) {
            if (b[nbs[k]] === 0) tryMove(from, nbs[k]);
          }
        }
      }
    }
    return moves;
  }

  function applyMove(st, mv) {
    var next = cloneState(st);
    if (mv.from < 0) next.toPlace[st.turn - 1]--;
    else next.board[mv.from] = 0;
    next.board[mv.to] = st.turn;
    if (mv.remove >= 0) next.board[mv.remove] = 0;
    next.turn = opp(st.turn);
    return next;
  }

  function isLoss(st) {
    var p = st.turn;
    if (st.toPlace[p - 1] === 0 && count(st.board, p) < 3) return true;
    return genMoves(st).length === 0;
  }

  function legalTargets(st, from) {
    if (from < 0 || st.board[from] !== st.turn) return [];
    if (isPlacing(st)) return [];
    var out = [];
    if (canFly(st, st.turn)) {
      for (var i = 0; i < 24; i++) if (st.board[i] === 0) out.push(i);
      return out;
    }
    var nbs = ADJ[from];
    for (var k = 0; k < nbs.length; k++) {
      if (st.board[nbs[k]] === 0) out.push(nbs[k]);
    }
    return out;
  }

  function emptyCells(st) {
    var out = [];
    for (var i = 0; i < 24; i++) if (st.board[i] === 0) out.push(i);
    return out;
  }

  function evaluate(st, me) {
    var b = st.board;
    var you = opp(me);
    var myN = 0, opN = 0, myMob = 0, opMob = 0;
    for (var i = 0; i < 24; i++) {
      if (b[i] === me) {
        myN++;
        for (var a = 0; a < ADJ[i].length; a++) if (b[ADJ[i][a]] === 0) myMob++;
      } else if (b[i] === you) {
        opN++;
        for (var c = 0; c < ADJ[i].length; c++) if (b[ADJ[i][c]] === 0) opMob++;
      }
    }
    var myMills = 0, opMills = 0, myTwo = 0, opTwo = 0;
    for (var m = 0; m < MILLS.length; m++) {
      var line = MILLS[m];
      var mc = 0, oc = 0;
      for (var t = 0; t < 3; t++) {
        if (b[line[t]] === me) mc++;
        else if (b[line[t]] === you) oc++;
      }
      if (mc === 3) myMills++;
      else if (oc === 3) opMills++;
      if (mc === 2 && oc === 0) myTwo++;
      if (oc === 2 && mc === 0) opTwo++;
    }
    return 24 * (myN + st.toPlace[me - 1] - opN - st.toPlace[you - 1])
      + 30 * (myMills - opMills)
      + 9 * (myTwo - opTwo)
      + 2 * (myMob - opMob);
  }

  function search(st, depth, alpha, beta, me, deadline) {
    if (Date.now() > deadline) throw new Error("time");
    if (isLoss(st)) return st.turn === me ? -100000 - depth : 100000 + depth;
    if (depth === 0) return evaluate(st, me);

    var moves = genMoves(st);
    moves.sort(function (a, c) { return (c.remove >= 0) - (a.remove >= 0); });
    var maximizing = st.turn === me;
    var best = maximizing ? -Infinity : Infinity;

    for (var i = 0; i < moves.length; i++) {
      var v = search(applyMove(st, moves[i]), depth - 1, alpha, beta, me, deadline);
      if (maximizing) {
        if (v > best) best = v;
        if (v > alpha) alpha = v;
      } else {
        if (v < best) best = v;
        if (v < beta) beta = v;
      }
      if (beta <= alpha) break;
    }
    return best;
  }

  function bestMove(st, timeMs) {
    var me = st.turn;
    var deadline = Date.now() + (timeMs || 800);
    var moves = genMoves(st);
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];

    var best = moves[0];
    try {
      for (var depth = 2; depth <= 12; depth++) {
        var localBest = null;
        var localVal = -Infinity;
        var alpha = -Infinity;
        var ordered = [best];
        for (var i = 0; i < moves.length; i++) {
          if (moves[i] !== best) ordered.push(moves[i]);
        }
        for (var j = 0; j < ordered.length; j++) {
          var mv = ordered[j];
          var v = search(applyMove(st, mv), depth - 1, alpha, Infinity, me, deadline);
          if (v > localVal) {
            localVal = v;
            localBest = mv;
          }
          if (v > alpha) alpha = v;
        }
        if (localBest) best = localBest;
        if (localVal > 90000) break;
      }
    } catch (e) {
      /* aika loppui — käytetään viimeisin valmis syvyys */
    }
    return best;
  }

  function moveKey(mv) {
    return (mv.from == null ? -1 : mv.from) + ":" + mv.to + ":" + (mv.remove == null ? -1 : mv.remove);
  }

  return {
    HUMAN: HUMAN,
    AI: AI,
    MILLS: MILLS,
    ADJ: ADJ,
    COORD: COORD,
    opp: opp,
    count: count,
    inMill: inMill,
    removables: removables,
    initState: initState,
    cloneState: cloneState,
    isPlacing: isPlacing,
    canFly: canFly,
    phaseOf: phaseOf,
    genMoves: genMoves,
    applyMove: applyMove,
    isLoss: isLoss,
    legalTargets: legalTargets,
    emptyCells: emptyCells,
    evaluate: evaluate,
    bestMove: bestMove,
    moveKey: moveKey
  };
});
