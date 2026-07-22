// Tammi (English draughts / American checkers) — pelimoottori + tekoäly (Node + selain).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TammiEngine = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var HUMAN = 1;
  var AI = 2;
  var SIZE = 8;
  var EMPTY = 0;
  var MAN = 1;
  var KING = 2;

  // board[sq] = 0 | (side | (type << 2))  side 1|2, type 1=man 2=king
  function pack(side, type) { return side | (type << 2); }
  function sideOf(p) { return p & 3; }
  function typeOf(p) { return p >> 2; }
  function isKing(p) { return typeOf(p) === KING; }
  function opp(p) { return 3 - p; }

  function rc(r, c) { return r * SIZE + c; }
  function rowOf(sq) { return (sq / SIZE) | 0; }
  function colOf(sq) { return sq % SIZE; }
  function onBoard(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
  function isDark(r, c) { return ((r + c) & 1) === 1; }

  var DIRS_N = [[-1, -1], [-1, 1]];
  var DIRS_S = [[1, -1], [1, 1]];
  var DIRS_ALL = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  function manDirs(side) {
    return side === HUMAN ? DIRS_N : DIRS_S;
  }

  function pieceDirs(piece) {
    return isKing(piece) ? DIRS_ALL : manDirs(sideOf(piece));
  }

  function initBoard() {
    var b = new Array(SIZE * SIZE);
    var i;
    for (i = 0; i < b.length; i++) b[i] = EMPTY;
    // AI ylhäällä (rivit 0–2), ihminen alhaalla (5–7) — tummilla ruuduilla
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (isDark(r, c)) b[rc(r, c)] = pack(AI, MAN);
      }
    }
    for (r = 5; r < 8; r++) {
      for (c = 0; c < SIZE; c++) {
        if (isDark(r, c)) b[rc(r, c)] = pack(HUMAN, MAN);
      }
    }
    return b;
  }

  function emptyBoard() {
    var b = new Array(SIZE * SIZE);
    for (var i = 0; i < b.length; i++) b[i] = EMPTY;
    return b;
  }

  function initState(starter) {
    return {
      board: initBoard(),
      turn: starter || HUMAN
    };
  }

  function cloneState(st) {
    return {
      board: st.board.slice(),
      turn: st.turn
    };
  }

  // "c5" / "a1" → ruutuindeksi (a1 = alavasen ihmisen näkökulmasta)
  function parseSq(label) {
    if (typeof label !== "string" || label.length < 2) throw new Error("bad square: " + label);
    var c = label.toLowerCase().charCodeAt(0) - 97;
    var r = 8 - parseInt(label.slice(1), 10);
    if (!onBoard(r, c)) throw new Error("off board: " + label);
    return rc(r, c);
  }

  function sqLabel(sq) {
    return String.fromCharCode(97 + colOf(sq)) + String(8 - rowOf(sq));
  }

  // Merkintä: o/O = ihminen mies/daami, x/X = AI mies/daami, . = tyhjä tumma
  // Annetaan joko { c5: "o", d6: "x" } tai 8-rivinen ASCII (rivi 8 ylinnä).
  function parseBoard(spec) {
    var b = emptyBoard();
    function put(label, ch) {
      var sq = parseSq(label);
      if (!isDark(rowOf(sq), colOf(sq))) throw new Error("light square: " + label);
      if (ch === "." || ch === " ") return;
      if (ch === "o") b[sq] = pack(HUMAN, MAN);
      else if (ch === "O") b[sq] = pack(HUMAN, KING);
      else if (ch === "x") b[sq] = pack(AI, MAN);
      else if (ch === "X") b[sq] = pack(AI, KING);
      else throw new Error("bad piece '" + ch + "' at " + label);
    }
    if (typeof spec === "string") {
      var rows = spec.trim().split(/\n/).map(function (line) {
        return line.replace(/\s+/g, "");
      });
      if (rows.length !== SIZE) throw new Error("board must have 8 rows");
      for (var r = 0; r < SIZE; r++) {
        if (rows[r].length !== SIZE) throw new Error("row " + (8 - r) + " length");
        for (var c = 0; c < SIZE; c++) {
          var ch = rows[r][c];
          if (ch === "-") continue; // vaalea ruutu
          put(sqLabel(rc(r, c)), ch);
        }
      }
    } else {
      var keys = Object.keys(spec);
      for (var i = 0; i < keys.length; i++) put(keys[i], spec[keys[i]]);
    }
    return b;
  }

  function makeState(opts) {
    opts = opts || {};
    var board;
    if (opts.board == null) board = initBoard();
    else if (typeof opts.board === "string" || (opts.board && !Array.isArray(opts.board))) {
      board = parseBoard(opts.board);
    } else {
      board = opts.board.slice();
    }
    return {
      board: board,
      turn: opts.turn || HUMAN
    };
  }

  // Siirtoavaimet testeihin: "a3-b4", "c5xe3", "c5xe3xg3" (path + overs päätellään)
  function findMove(st, notation) {
    var key = String(notation).toLowerCase().replace(/\s+/g, "");
    var moves = genMoves(st);
    for (var i = 0; i < moves.length; i++) {
      if (formatMove(moves[i]) === key || moveKey(moves[i]) === key) return moves[i];
    }
    return null;
  }

  function formatMove(mv) {
    if (!mv.overs.length) return sqLabel(mv.from) + "-" + sqLabel(mv.to);
    var s = sqLabel(mv.from);
    for (var i = 0; i < mv.overs.length; i++) {
      s += "x" + sqLabel(mv.path[i]);
    }
    return s;
  }

  function moveKeys(st) {
    return genMoves(st).map(formatMove).sort();
  }

  function countSide(board, side) {
    var n = 0, k = 0;
    for (var i = 0; i < board.length; i++) {
      if (sideOf(board[i]) === side) {
        n++;
        if (isKing(board[i])) k++;
      }
    }
    return { pieces: n, kings: k };
  }

  function promoteRank(side) {
    return side === HUMAN ? 0 : SIZE - 1;
  }

  function shouldPromote(side, sq, piece) {
    if (isKing(piece)) return false;
    return rowOf(sq) === promoteRank(side);
  }

  // Kerää yksi hyppyaskel: { to, over }
  function singleJumps(board, from, piece) {
    var side = sideOf(piece);
    var dirs = pieceDirs(piece);
    var out = [];
    var r0 = rowOf(from);
    var c0 = colOf(from);
    for (var d = 0; d < dirs.length; d++) {
      var mr = r0 + dirs[d][0];
      var mc = c0 + dirs[d][1];
      var lr = r0 + dirs[d][0] * 2;
      var lc = c0 + dirs[d][1] * 2;
      if (!onBoard(lr, lc)) continue;
      var mid = rc(mr, mc);
      var land = rc(lr, lc);
      if (sideOf(board[mid]) === opp(side) && board[land] === EMPTY) {
        out.push({ to: land, over: mid });
      }
    }
    return out;
  }

  function quietMovesFrom(board, from, piece) {
    var dirs = pieceDirs(piece);
    var out = [];
    var r0 = rowOf(from);
    var c0 = colOf(from);
    for (var d = 0; d < dirs.length; d++) {
      var r = r0 + dirs[d][0];
      var c = c0 + dirs[d][1];
      if (!onBoard(r, c)) continue;
      var to = rc(r, c);
      if (board[to] === EMPTY) out.push({ from: from, to: to, path: [to], overs: [] });
    }
    return out;
  }

  // DFS: englantilaiset säännöt — korotus keskeyttää ketjun
  function captureSequences(board, from, piece) {
    var results = [];
    function dfs(b, cur, pie, path, overs) {
      var jumps = singleJumps(b, cur, pie);
      if (jumps.length === 0) {
        if (overs.length > 0) {
          results.push({ from: from, to: cur, path: path.slice(), overs: overs.slice() });
        }
        return;
      }
      var progressed = false;
      for (var i = 0; i < jumps.length; i++) {
        var j = jumps[i];
        // Älä hyppää samaa nappulaa uudestaan samassa ketjussa
        if (overs.indexOf(j.over) >= 0) continue;
        progressed = true;
        var nb = b.slice();
        nb[cur] = EMPTY;
        nb[j.over] = EMPTY;
        var landed = pie;
        var crowned = false;
        if (shouldPromote(sideOf(pie), j.to, pie)) {
          landed = pack(sideOf(pie), KING);
          crowned = true;
        }
        nb[j.to] = landed;
        path.push(j.to);
        overs.push(j.over);
        if (crowned) {
          results.push({ from: from, to: j.to, path: path.slice(), overs: overs.slice() });
        } else {
          dfs(nb, j.to, landed, path, overs);
        }
        path.pop();
        overs.pop();
      }
      if (!progressed && overs.length > 0) {
        results.push({ from: from, to: cur, path: path.slice(), overs: overs.slice() });
      }
    }
    dfs(board, from, piece, [], []);
    return results;
  }

  function genMoves(st) {
    var b = st.board;
    var turn = st.turn;
    var captures = [];
    var quiet = [];
    var sq, i, j, caps, q;
    for (sq = 0; sq < b.length; sq++) {
      if (sideOf(b[sq]) !== turn) continue;
      caps = captureSequences(b, sq, b[sq]);
      for (i = 0; i < caps.length; i++) captures.push(caps[i]);
    }
    // Pakollinen syönti
    if (captures.length > 0) return captures;
    for (sq = 0; sq < b.length; sq++) {
      if (sideOf(b[sq]) !== turn) continue;
      q = quietMovesFrom(b, sq, b[sq]);
      for (j = 0; j < q.length; j++) quiet.push(q[j]);
    }
    return quiet;
  }

  function applyMove(st, mv) {
    var next = cloneState(st);
    var b = next.board;
    var piece = b[mv.from];
    b[mv.from] = EMPTY;
    for (var i = 0; i < mv.overs.length; i++) b[mv.overs[i]] = EMPTY;
    var landed = piece;
    if (shouldPromote(sideOf(piece), mv.to, piece)) {
      landed = pack(sideOf(piece), KING);
    }
    b[mv.to] = landed;
    next.turn = opp(st.turn);
    return next;
  }

  function isLoss(st) {
    return genMoves(st).length === 0;
  }

  function movesFrom(st, from) {
    return genMoves(st).filter(function (m) { return m.from === from; });
  }

  function movableSquares(st) {
    var moves = genMoves(st);
    var seen = {};
    var out = [];
    for (var i = 0; i < moves.length; i++) {
      var f = moves[i].from;
      if (!seen[f]) {
        seen[f] = true;
        out.push(f);
      }
    }
    return out;
  }

  function evaluate(st, me) {
    var b = st.board;
    var you = opp(me);
    var score = 0;
    var myP = 0, opP = 0;
    for (var sq = 0; sq < b.length; sq++) {
      var p = b[sq];
      if (p === EMPTY) continue;
      var s = sideOf(p);
      var r = rowOf(sq);
      var c = colOf(sq);
      var val = isKing(p) ? 45 : 10;
      // eteneminen / kuningasrivin läheisyys
      if (!isKing(p)) {
        if (s === HUMAN) val += (7 - r);
        else val += r;
      } else {
        // kuninkaat keskellä vahvempia
        val += 3 - Math.min(Math.abs(r - 3.5), Math.abs(c - 3.5));
      }
      // reunan heikkous miehille
      if (!isKing(p) && (c === 0 || c === 7)) val -= 0.5;
      if (s === me) {
        score += val;
        myP++;
      } else {
        score -= val;
        opP++;
      }
    }
    if (myP === 0) return -100000;
    if (opP === 0) return 100000;
    // liikkuvuus (ei mutatoi st:tä)
    var myMoves = genMoves({ board: b, turn: me }).length;
    var opMoves = genMoves({ board: b, turn: you }).length;
    score += 0.35 * (myMoves - opMoves);
    return score;
  }

  function moveSortKey(mv) {
    return mv.overs.length * 10 + (mv.path ? mv.path.length : 0);
  }

  function search(st, depth, alpha, beta, me, deadline, now) {
    if (now() > deadline) throw new Error("time");
    if (isLoss(st)) return st.turn === me ? -100000 - depth : 100000 + depth;
    if (depth === 0) return evaluate(st, me);

    var moves = genMoves(st);
    moves.sort(function (a, c) { return moveSortKey(c) - moveSortKey(a); });
    var maximizing = st.turn === me;
    var best = maximizing ? -Infinity : Infinity;

    for (var i = 0; i < moves.length; i++) {
      var v = search(applyMove(st, moves[i]), depth - 1, alpha, beta, me, deadline, now);
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

  function sameMove(a, b) {
    if (!a || !b || a.from !== b.from || a.to !== b.to) return false;
    if (a.overs.length !== b.overs.length) return false;
    for (var i = 0; i < a.overs.length; i++) {
      if (a.overs[i] !== b.overs[i]) return false;
    }
    return true;
  }

  // opts: { timeMs, now, maxDepth } — now injektoitava testeihin
  function bestMove(st, timeMsOrOpts) {
    var opts = typeof timeMsOrOpts === "object" && timeMsOrOpts
      ? timeMsOrOpts
      : { timeMs: timeMsOrOpts };
    var timeMs = opts.timeMs == null ? 800 : opts.timeMs;
    var now = opts.now || Date.now;
    var maxDepth = opts.maxDepth == null ? 10 : opts.maxDepth;
    var me = st.turn;
    var deadline = now() + timeMs;
    var moves = genMoves(st);
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];

    moves.sort(function (a, c) { return moveSortKey(c) - moveSortKey(a); });
    var best = moves[0];
    try {
      for (var depth = 2; depth <= maxDepth; depth++) {
        var localBest = null;
        var localVal = -Infinity;
        var alpha = -Infinity;
        var ordered = [best];
        for (var i = 0; i < moves.length; i++) {
          if (!sameMove(moves[i], best)) ordered.push(moves[i]);
        }
        for (var j = 0; j < ordered.length; j++) {
          var mv = ordered[j];
          var v = search(applyMove(st, mv), depth - 1, alpha, Infinity, me, deadline, now);
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
      /* aika loppui */
    }
    return best;
  }

  function moveKey(mv) {
    return formatMove(mv);
  }

  return {
    HUMAN: HUMAN,
    AI: AI,
    SIZE: SIZE,
    EMPTY: EMPTY,
    MAN: MAN,
    KING: KING,
    pack: pack,
    sideOf: sideOf,
    typeOf: typeOf,
    isKing: isKing,
    opp: opp,
    rc: rc,
    rowOf: rowOf,
    colOf: colOf,
    isDark: isDark,
    emptyBoard: emptyBoard,
    initState: initState,
    cloneState: cloneState,
    makeState: makeState,
    parseBoard: parseBoard,
    parseSq: parseSq,
    sqLabel: sqLabel,
    formatMove: formatMove,
    findMove: findMove,
    moveKeys: moveKeys,
    countSide: countSide,
    genMoves: genMoves,
    applyMove: applyMove,
    isLoss: isLoss,
    movesFrom: movesFrom,
    movableSquares: movableSquares,
    evaluate: evaluate,
    bestMove: bestMove,
    moveKey: moveKey
  };
});
