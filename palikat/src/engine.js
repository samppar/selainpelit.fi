// Palikat (Blokus Duo -tyylinen) — pelimoottori + tekoäly (Node + selain).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PalikatEngine = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var HUMAN = 1;
  var AI = 2;
  var EMPTY = 0;
  var SIZE = 14;
  var N = SIZE * SIZE;

  // Aloitusruudut (Blokus Duo): (4,4) ja (9,9)
  var START = {};
  START[HUMAN] = 4 * SIZE + 4;
  START[AI] = 9 * SIZE + 9;

  var ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

  // Kaikki vapaat polyominot koot 1–5 (21 kpl)
  var PIECE_DEFS = [
    { id: "1", size: 1, cells: [[0, 0]] },
    { id: "2", size: 2, cells: [[0, 0], [0, 1]] },
    { id: "I3", size: 3, cells: [[0, 0], [0, 1], [0, 2]] },
    { id: "V3", size: 3, cells: [[0, 0], [0, 1], [1, 1]] },
    { id: "I4", size: 4, cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
    { id: "O4", size: 4, cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
    { id: "T4", size: 4, cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
    { id: "L4", size: 4, cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
    { id: "S4", size: 4, cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
    { id: "F", size: 5, cells: [[0, 1], [0, 2], [1, 0], [1, 1], [2, 1]] },
    { id: "I5", size: 5, cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
    { id: "L5", size: 5, cells: [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]] },
    { id: "N", size: 5, cells: [[0, 1], [1, 1], [2, 0], [2, 1], [3, 0]] },
    { id: "P", size: 5, cells: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]] },
    { id: "T5", size: 5, cells: [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]] },
    { id: "U", size: 5, cells: [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]] },
    { id: "V5", size: 5, cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]] },
    { id: "W", size: 5, cells: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]] },
    { id: "X", size: 5, cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]] },
    { id: "Y", size: 5, cells: [[0, 1], [1, 0], [1, 1], [1, 2], [1, 3]] },
    { id: "Z5", size: 5, cells: [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]] }
  ];

  var PIECE_BY_ID = {};
  var ALL_IDS = [];
  for (var pi = 0; pi < PIECE_DEFS.length; pi++) {
    PIECE_BY_ID[PIECE_DEFS[pi].id] = PIECE_DEFS[pi];
    ALL_IDS.push(PIECE_DEFS[pi].id);
  }

  function opp(side) {
    return side === HUMAN ? AI : HUMAN;
  }

  function rc(r, c) {
    return r * SIZE + c;
  }

  function rowOf(sq) {
    return (sq / SIZE) | 0;
  }

  function colOf(sq) {
    return sq % SIZE;
  }

  function inBounds(r, c) {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  function normalizeShape(cells) {
    var minR = Infinity;
    var minC = Infinity;
    var i;
    for (i = 0; i < cells.length; i++) {
      if (cells[i][0] < minR) minR = cells[i][0];
      if (cells[i][1] < minC) minC = cells[i][1];
    }
    var out = [];
    for (i = 0; i < cells.length; i++) {
      out.push([cells[i][0] - minR, cells[i][1] - minC]);
    }
    out.sort(function (a, b) {
      return a[0] - b[0] || a[1] - b[1];
    });
    return out;
  }

  function shapeKey(cells) {
    var n = normalizeShape(cells);
    var parts = [];
    for (var i = 0; i < n.length; i++) parts.push(n[i][0] + "," + n[i][1]);
    return parts.join(";");
  }

  function rotate90(cells) {
    var out = [];
    for (var i = 0; i < cells.length; i++) out.push([cells[i][1], -cells[i][0]]);
    return normalizeShape(out);
  }

  function reflect(cells) {
    var out = [];
    for (var i = 0; i < cells.length; i++) out.push([cells[i][0], -cells[i][1]]);
    return normalizeShape(out);
  }

  function allOrientations(baseCells) {
    var seen = {};
    var orients = [];
    var cur = normalizeShape(baseCells);
    for (var flip = 0; flip < 2; flip++) {
      for (var rot = 0; rot < 4; rot++) {
        var key = shapeKey(cur);
        if (!seen[key]) {
          seen[key] = true;
          orients.push(cur);
        }
        cur = rotate90(cur);
      }
      cur = reflect(baseCells);
    }
    return orients;
  }

  var ORIENTS = {};
  for (var oi = 0; oi < PIECE_DEFS.length; oi++) {
    ORIENTS[PIECE_DEFS[oi].id] = allOrientations(PIECE_DEFS[oi].cells);
  }

  function cloneRemaining(rem) {
    return {
      1: rem[1].slice(),
      2: rem[2].slice()
    };
  }

  function initState(starter) {
    var board = new Array(N);
    for (var i = 0; i < N; i++) board[i] = EMPTY;
    return {
      board: board,
      remaining: { 1: ALL_IDS.slice(), 2: ALL_IDS.slice() },
      squares: { 1: 0, 2: 0 },
      usedAll: { 1: false, 2: false },
      lastWasMono: { 1: false, 2: false },
      first: { 1: true, 2: true },
      turn: starter || HUMAN,
      passes: 0,
      over: false
    };
  }

  function cloneState(st) {
    return {
      board: st.board.slice(),
      remaining: cloneRemaining(st.remaining),
      squares: { 1: st.squares[1], 2: st.squares[2] },
      usedAll: { 1: st.usedAll[1], 2: st.usedAll[2] },
      lastWasMono: { 1: st.lastWasMono[1], 2: st.lastWasMono[2] },
      first: { 1: st.first[1], 2: st.first[2] },
      turn: st.turn,
      passes: st.passes,
      over: st.over
    };
  }

  function hasRemaining(st, side, id) {
    return st.remaining[side].indexOf(id) >= 0;
  }

  function removePiece(st, side, id) {
    var arr = st.remaining[side];
    var idx = arr.indexOf(id);
    if (idx >= 0) arr.splice(idx, 1);
  }

  function coversStart(cells, side) {
    var start = START[side];
    var sr = rowOf(start);
    var sc = colOf(start);
    for (var i = 0; i < cells.length; i++) {
      if (cells[i][0] === sr && cells[i][1] === sc) return true;
    }
    return false;
  }

  function canPlace(st, side, cells) {
    var board = st.board;
    var i, r, c, sq, nr, nc, j;
    var touchesCorner = false;

    for (i = 0; i < cells.length; i++) {
      r = cells[i][0];
      c = cells[i][1];
      if (!inBounds(r, c)) return false;
      sq = rc(r, c);
      if (board[sq] !== EMPTY) return false;

      // saman värin reunakosketus kielletty
      for (j = 0; j < 4; j++) {
        nr = r + ORTHO[j][0];
        nc = c + ORTHO[j][1];
        if (inBounds(nr, nc) && board[rc(nr, nc)] === side) return false;
      }

      // kulmakosketus saman värin kanssa
      for (j = 0; j < 4; j++) {
        nr = r + DIAG[j][0];
        nc = c + DIAG[j][1];
        if (inBounds(nr, nc) && board[rc(nr, nc)] === side) touchesCorner = true;
      }
    }

    if (st.first[side]) return coversStart(cells, side);
    return touchesCorner;
  }

  function translateOrient(orient, baseR, baseC) {
    var cells = [];
    for (var i = 0; i < orient.length; i++) {
      cells.push([baseR + orient[i][0], baseC + orient[i][1]]);
    }
    return cells;
  }

  function moveKey(mv) {
    var parts = [mv.pieceId];
    var cells = mv.cells.slice().sort(function (a, b) {
      return a[0] - b[0] || a[1] - b[1];
    });
    for (var i = 0; i < cells.length; i++) {
      parts.push(cells[i][0] + "," + cells[i][1]);
    }
    return parts.join("|");
  }

  function genMovesForPiece(st, side, pieceId) {
    var orients = ORIENTS[pieceId];
    var moves = [];
    var seen = {};
    var o, r, c, cells, key, mv;
    for (o = 0; o < orients.length; o++) {
      var orient = orients[o];
      var maxR = 0;
      var maxC = 0;
      for (var k = 0; k < orient.length; k++) {
        if (orient[k][0] > maxR) maxR = orient[k][0];
        if (orient[k][1] > maxC) maxC = orient[k][1];
      }
      for (r = 0; r < SIZE - maxR; r++) {
        for (c = 0; c < SIZE - maxC; c++) {
          cells = translateOrient(orient, r, c);
          if (!canPlace(st, side, cells)) continue;
          key = moveKey({ pieceId: pieceId, cells: cells });
          if (seen[key]) continue;
          seen[key] = true;
          mv = {
            pieceId: pieceId,
            cells: cells,
            size: cells.length
          };
          moves.push(mv);
        }
      }
    }
    return moves;
  }

  function genMoves(st) {
    if (st.over) return [];
    var side = st.turn;
    var rem = st.remaining[side];
    var moves = [];
    for (var i = 0; i < rem.length; i++) {
      var part = genMovesForPiece(st, side, rem[i]);
      for (var j = 0; j < part.length; j++) moves.push(part[j]);
    }
    return moves;
  }

  function genMovesForSelected(st, pieceId) {
    if (!hasRemaining(st, st.turn, pieceId)) return [];
    return genMovesForPiece(st, st.turn, pieceId);
  }

  function applyMove(st, mv) {
    var next = cloneState(st);
    if (!mv) {
      // pass
      next.passes += 1;
      next.turn = opp(st.turn);
      if (next.passes >= 2) next.over = true;
      return next;
    }
    var side = st.turn;
    for (var i = 0; i < mv.cells.length; i++) {
      next.board[rc(mv.cells[i][0], mv.cells[i][1])] = side;
    }
    removePiece(next, side, mv.pieceId);
    next.squares[side] += mv.size;
    next.first[side] = false;
    next.lastWasMono[side] = mv.pieceId === "1";
    if (next.remaining[side].length === 0) {
      next.usedAll[side] = true;
    }
    next.passes = 0;
    next.turn = opp(side);

    // jos seuraavalla ei siirtoja → passaa automaattisesti kunnes joku voi tai peli päättyy
    var guard = 0;
    while (!next.over && genMoves(next).length === 0 && guard < 3) {
      next.passes += 1;
      next.turn = opp(next.turn);
      if (next.passes >= 2) next.over = true;
      guard++;
    }
    return next;
  }

  function scoreOf(st, side) {
    var s = st.squares[side];
    if (st.usedAll[side]) {
      s += 15;
      if (st.lastWasMono[side]) s += 5;
    }
    return s;
  }

  function winnerOf(st) {
    if (!st.over) return 0;
    var h = scoreOf(st, HUMAN);
    var a = scoreOf(st, AI);
    if (h > a) return HUMAN;
    if (a > h) return AI;
    return 0; // tasapeli
  }

  function remainingSquares(st, side) {
    var rem = st.remaining[side];
    var n = 0;
    for (var i = 0; i < rem.length; i++) n += PIECE_BY_ID[rem[i]].size;
    return n;
  }

  function countCorners(board, side) {
    var count = 0;
    var seen = {};
    for (var sq = 0; sq < N; sq++) {
      if (board[sq] !== side) continue;
      var r = rowOf(sq);
      var c = colOf(sq);
      for (var d = 0; d < 4; d++) {
        var nr = r + DIAG[d][0];
        var nc = c + DIAG[d][1];
        if (!inBounds(nr, nc)) continue;
        var nsq = rc(nr, nc);
        if (board[nsq] !== EMPTY || seen[nsq]) continue;
        // ei saa koskettaa saman värin reunaan
        var blocked = false;
        for (var o = 0; o < 4; o++) {
          var er = nr + ORTHO[o][0];
          var ec = nc + ORTHO[o][1];
          if (inBounds(er, ec) && board[rc(er, ec)] === side) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          seen[nsq] = true;
          count++;
        }
      }
    }
    return count;
  }

  function evaluateMove(st, mv, me) {
    var next = applyMove(st, mv);
    var you = opp(me);
    var score = mv.size * 12;
    score += (scoreOf(next, me) - scoreOf(st, me)) * 2;

    // keskeisyys
    var cx = 0;
    var cy = 0;
    for (var i = 0; i < mv.cells.length; i++) {
      cx += mv.cells[i][0];
      cy += mv.cells[i][1];
    }
    cx /= mv.size;
    cy /= mv.size;
    var dist = Math.abs(cx - 6.5) + Math.abs(cy - 6.5);
    score += (14 - dist) * 0.4;

    // kulma-avaukset
    score += countCorners(next.board, me) * 1.6;
    score -= countCorners(next.board, you) * 1.2;

    // jätä pienet palat loppuun — suosi isoja aikaisin
    var remLeft = st.remaining[me].length;
    if (remLeft > 10) score += mv.size * 3;
    else if (remLeft <= 4 && mv.size === 1) score += 8;

    if (next.usedAll[me]) score += 40;
    if (next.over) {
      var w = winnerOf(next);
      if (w === me) score += 500;
      else if (w === you) score -= 500;
    }
    return score;
  }

  function evaluate(st, me) {
    var you = opp(me);
    var score = scoreOf(st, me) * 10 - scoreOf(st, you) * 10;
    score += remainingSquares(st, you) - remainingSquares(st, me);
    score += countCorners(st.board, me) * 2;
    score -= countCorners(st.board, you) * 2;
    if (st.over) {
      var w = winnerOf(st);
      if (w === me) return 100000;
      if (w === you) return -100000;
      return 0;
    }
    return score;
  }

  function bestMove(st, timeMs) {
    var me = st.turn;
    var deadline = Date.now() + (timeMs || 800);
    var moves = genMoves(st);
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];

    // pisteytä siirrot
    var scored = [];
    for (var i = 0; i < moves.length; i++) {
      if (Date.now() > deadline) break;
      scored.push({ mv: moves[i], val: evaluateMove(st, moves[i], me) });
    }
    // jos aika loppui kesken, pisteytä loput kevyesti koolla
    for (var j = scored.length; j < moves.length; j++) {
      scored.push({ mv: moves[j], val: moves[j].size * 10 });
    }
    scored.sort(function (a, b) { return b.val - a.val; });

    var best = scored[0].mv;
    var bestVal = scored[0].val;

    // yksi ply: top-kandidaateille vastustajan paras vastaus
    var topN = Math.min(scored.length, timeMs >= 2000 ? 28 : timeMs >= 900 ? 18 : 10);
    try {
      for (var t = 0; t < topN; t++) {
        if (Date.now() > deadline) throw new Error("time");
        var cand = scored[t].mv;
        var after = applyMove(st, cand);
        var reply = genMoves(after);
        var worst = scored[t].val;
        if (reply.length && !after.over) {
          var oppBest = -Infinity;
          var limit = Math.min(reply.length, 40);
          // pisteytä vastustajan siirrot karkeasti
          var oppScored = [];
          for (var r = 0; r < reply.length; r++) {
            oppScored.push({ mv: reply[r], val: reply[r].size * 12 + evaluateMove(after, reply[r], opp(me)) * 0.01 });
          }
          oppScored.sort(function (a, b) { return b.val - a.val; });
          limit = Math.min(oppScored.length, timeMs >= 2000 ? 16 : 10);
          for (var o = 0; o < limit; o++) {
            if (Date.now() > deadline) throw new Error("time");
            var v = -evaluate(applyMove(after, oppScored[o].mv), me);
            if (v > oppBest) oppBest = v;
          }
          worst = scored[t].val * 0.35 + (-oppBest) * 0.65;
        } else {
          worst = evaluate(after, me);
        }
        if (worst > bestVal) {
          bestVal = worst;
          best = cand;
        }
      }
    } catch (e) {
      /* aika loppui */
    }
    return best;
  }

  function piecePreview(pieceId, orientIndex) {
    var orients = ORIENTS[pieceId];
    if (!orients || !orients.length) return [];
    var idx = ((orientIndex % orients.length) + orients.length) % orients.length;
    return orients[idx];
  }

  function orientCount(pieceId) {
    return ORIENTS[pieceId] ? ORIENTS[pieceId].length : 0;
  }

  function legalTargets(st, pieceId, orientIndex) {
    var shape = piecePreview(pieceId, orientIndex);
    if (!shape.length || !hasRemaining(st, st.turn, pieceId)) return [];
    var maxR = 0;
    var maxC = 0;
    var k;
    for (k = 0; k < shape.length; k++) {
      if (shape[k][0] > maxR) maxR = shape[k][0];
      if (shape[k][1] > maxC) maxC = shape[k][1];
    }
    var out = [];
    for (var r = 0; r < SIZE - maxR; r++) {
      for (var c = 0; c < SIZE - maxC; c++) {
        var cells = translateOrient(shape, r, c);
        if (canPlace(st, st.turn, cells)) {
          out.push({ r: r, c: c, cells: cells });
        }
      }
    }
    return out;
  }

  function placementAt(st, pieceId, orientIndex, baseR, baseC) {
    var shape = piecePreview(pieceId, orientIndex);
    if (!shape.length) return null;
    var cells = translateOrient(shape, baseR, baseC);
    if (!canPlace(st, st.turn, cells)) return null;
    return { pieceId: pieceId, cells: cells, size: cells.length };
  }

  function sqLabel(sq) {
    return String.fromCharCode(97 + colOf(sq)) + String(SIZE - rowOf(sq));
  }

  return {
    HUMAN: HUMAN,
    AI: AI,
    EMPTY: EMPTY,
    SIZE: SIZE,
    START: START,
    PIECE_DEFS: PIECE_DEFS,
    PIECE_BY_ID: PIECE_BY_ID,
    ALL_IDS: ALL_IDS,
    ORIENTS: ORIENTS,
    opp: opp,
    rc: rc,
    rowOf: rowOf,
    colOf: colOf,
    inBounds: inBounds,
    initState: initState,
    cloneState: cloneState,
    canPlace: canPlace,
    genMoves: genMoves,
    genMovesForSelected: genMovesForSelected,
    genMovesForPiece: genMovesForPiece,
    applyMove: applyMove,
    scoreOf: scoreOf,
    winnerOf: winnerOf,
    remainingSquares: remainingSquares,
    evaluate: evaluate,
    evaluateMove: evaluateMove,
    bestMove: bestMove,
    moveKey: moveKey,
    piecePreview: piecePreview,
    orientCount: orientCount,
    legalTargets: legalTargets,
    placementAt: placementAt,
    sqLabel: sqLabel
  };
});
