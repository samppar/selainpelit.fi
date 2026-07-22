// Mosaiikki — puhdas pelimoottori (ei DOM:ia).
// Sama tiedosto Nodessa (testit) ja selaimessa (build.js upottaa index.html:ään).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MosaiikkiEngine = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DIFFICULTIES = {
    helppo: { pieceCount: 3, timeMs: 0, pool: "small" },
    normaali: { pieceCount: 4, timeMs: 180000, pool: "mixed" },
    vaikea: { pieceCount: 5, timeMs: 120000, pool: "large" },
  };

  // Vapaat polyominot (koko 3–5). Solut suhteellisia [r, c].
  var CATALOG = [
    { key: "I3", size: 3, cells: [[0, 0], [1, 0], [2, 0]] },
    { key: "V3", size: 3, cells: [[0, 0], [1, 0], [1, 1]] },
    { key: "I4", size: 4, cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
    { key: "O4", size: 4, cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
    { key: "T4", size: 4, cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
    { key: "L4", size: 4, cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
    { key: "S4", size: 4, cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
    { key: "P5", size: 5, cells: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]] },
    { key: "U5", size: 5, cells: [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]] },
    { key: "V5", size: 5, cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]] },
    { key: "W5", size: 5, cells: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]] },
    { key: "X5", size: 5, cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]] },
    { key: "Y5", size: 5, cells: [[0, 1], [1, 1], [2, 0], [2, 1], [3, 1]] },
    { key: "N5", size: 5, cells: [[0, 1], [1, 1], [2, 0], [2, 1], [3, 0]] },
    { key: "L5", size: 5, cells: [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]] },
    { key: "T5", size: 5, cells: [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]] },
    { key: "F5", size: 5, cells: [[0, 1], [0, 2], [1, 0], [1, 1], [2, 1]] },
    { key: "Z5", size: 5, cells: [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]] },
  ];

  var COLORS = ["coral", "teal", "amber", "rose", "sky", "lime", "plum"];

  function makeRNG(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function cloneCells(cells) {
    return cells.map(function (c) { return [c[0], c[1]]; });
  }

  function normalize(cells) {
    var minR = Infinity, minC = Infinity;
    for (var i = 0; i < cells.length; i++) {
      if (cells[i][0] < minR) minR = cells[i][0];
      if (cells[i][1] < minC) minC = cells[i][1];
    }
    return cells.map(function (c) { return [c[0] - minR, c[1] - minC]; })
      .sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
  }

  function rotateCW(cells) {
    return normalize(cells.map(function (c) { return [c[1], -c[0]]; }));
  }

  function flipH(cells) {
    return normalize(cells.map(function (c) { return [c[0], -c[1]]; }));
  }

  function cellsKey(cells) {
    return normalize(cells).map(function (c) { return c[0] + "," + c[1]; }).join("|");
  }

  function allOrientations(cells) {
    var seen = Object.create(null);
    var out = [];
    var cur = normalize(cloneCells(cells));
    for (var flip = 0; flip < 2; flip++) {
      for (var rot = 0; rot < 4; rot++) {
        var key = cellsKey(cur);
        if (!seen[key]) {
          seen[key] = true;
          out.push(cloneCells(cur));
        }
        cur = rotateCW(cur);
      }
      cur = flipH(cur);
    }
    return out;
  }

  function bounding(cells) {
    var maxR = 0, maxC = 0;
    for (var i = 0; i < cells.length; i++) {
      if (cells[i][0] > maxR) maxR = cells[i][0];
      if (cells[i][1] > maxC) maxC = cells[i][1];
    }
    return { rows: maxR + 1, cols: maxC + 1 };
  }

  function catalogByPool(pool) {
    if (pool === "small") {
      return CATALOG.filter(function (p) { return p.size <= 4; });
    }
    if (pool === "large") {
      return CATALOG.filter(function (p) { return p.size >= 4; });
    }
    return CATALOG.slice();
  }

  function cellSet(cells) {
    var s = Object.create(null);
    for (var i = 0; i < cells.length; i++) s[cells[i][0] + "," + cells[i][1]] = true;
    return s;
  }

  function touches(occupied, cells, atR, atC) {
    if (!occupied.length) return true;
    var dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    var occ = cellSet(occupied);
    for (var i = 0; i < cells.length; i++) {
      var r = atR + cells[i][0];
      var c = atC + cells[i][1];
      for (var d = 0; d < 4; d++) {
        var nr = r + dirs[d][0];
        var nc = c + dirs[d][1];
        if (occ[nr + "," + nc]) return true;
      }
    }
    return false;
  }

  function overlaps(occupied, cells, atR, atC) {
    var occ = cellSet(occupied);
    for (var i = 0; i < cells.length; i++) {
      if (occ[(atR + cells[i][0]) + "," + (atC + cells[i][1])]) return true;
    }
    return false;
  }

  function candidatePlacements(occupied, orients, rng) {
    var candidates = [];
    var minR = 0, maxR = 0, minC = 0, maxC = 0;
    if (occupied.length) {
      minR = maxR = occupied[0][0];
      minC = maxC = occupied[0][1];
      for (var i = 1; i < occupied.length; i++) {
        var o = occupied[i];
        if (o[0] < minR) minR = o[0];
        if (o[0] > maxR) maxR = o[0];
        if (o[1] < minC) minC = o[1];
        if (o[1] > maxC) maxC = o[1];
      }
    }
    for (var oi = 0; oi < orients.length; oi++) {
      var cells = orients[oi];
      var b = bounding(cells);
      var r0 = minR - b.rows - 1;
      var r1 = maxR + 2;
      var c0 = minC - b.cols - 1;
      var c1 = maxC + 2;
      for (var r = r0; r <= r1; r++) {
        for (var c = c0; c <= c1; c++) {
          if (overlaps(occupied, cells, r, c)) continue;
          if (!touches(occupied, cells, r, c)) continue;
          candidates.push({ cells: cells, r: r, c: c });
        }
      }
    }
    shuffle(candidates, rng);
    return candidates;
  }

  function normalizeBoard(occupied, placements) {
    var minR = Infinity, minC = Infinity;
    for (var i = 0; i < occupied.length; i++) {
      if (occupied[i][0] < minR) minR = occupied[i][0];
      if (occupied[i][1] < minC) minC = occupied[i][1];
    }
    var normOcc = occupied.map(function (p) { return [p[0] - minR, p[1] - minC]; });
    var maxR = 0, maxC = 0;
    for (var j = 0; j < normOcc.length; j++) {
      if (normOcc[j][0] > maxR) maxR = normOcc[j][0];
      if (normOcc[j][1] > maxC) maxC = normOcc[j][1];
    }
    var board = [];
    for (var r = 0; r <= maxR; r++) {
      board[r] = [];
      for (var c = 0; c <= maxC; c++) board[r][c] = false;
    }
    for (var k = 0; k < normOcc.length; k++) {
      board[normOcc[k][0]][normOcc[k][1]] = true;
    }
    var solution = placements.map(function (p) {
      return {
        instanceId: p.instanceId,
        cells: cloneCells(p.cells),
        r: p.r - minR,
        c: p.c - minC,
      };
    });
    return { board: board, rows: maxR + 1, cols: maxC + 1, solution: solution };
  }

  function pickPieces(cfg, rng) {
    var pool = catalogByPool(cfg.pool);
    shuffle(pool, rng);
    var picked = [];
    var used = Object.create(null);
    for (var i = 0; i < pool.length && picked.length < cfg.pieceCount; i++) {
      if (used[pool[i].key]) continue;
      used[pool[i].key] = true;
      picked.push(pool[i]);
    }
    // Jos poolista ei riitä, täydennä koko katalogista.
    if (picked.length < cfg.pieceCount) {
      var rest = CATALOG.filter(function (p) { return !used[p.key]; });
      shuffle(rest, rng);
      while (picked.length < cfg.pieceCount && rest.length) {
        picked.push(rest.pop());
      }
    }
    return picked;
  }

  function generatePuzzle(seed, difficulty) {
    var diff = DIFFICULTIES[difficulty] || DIFFICULTIES.normaali;
    var rng = makeRNG(seed >>> 0);
    var attempts = 0;
    while (attempts < 40) {
      attempts++;
      var picked = pickPieces(diff, rng);
      var occupied = [];
      var placements = [];
      var ok = true;
      for (var i = 0; i < picked.length; i++) {
        var orients = allOrientations(picked[i].cells);
        var cands = candidatePlacements(occupied, orients, rng);
        if (!cands.length) { ok = false; break; }
        var place = cands[0];
        var instanceId = "p" + i;
        placements.push({
          instanceId: instanceId,
          key: picked[i].key,
          cells: cloneCells(place.cells),
          r: place.r,
          c: place.c,
          color: COLORS[i % COLORS.length],
        });
        for (var ci = 0; ci < place.cells.length; ci++) {
          occupied.push([place.r + place.cells[ci][0], place.c + place.cells[ci][1]]);
        }
      }
      if (!ok) continue;

      var norm = normalizeBoard(occupied, placements);
      // Satunnaiset lähtöorientaatiot pelaajalle (ei välttämättä ratkaisun oriento).
      var pieces = placements.map(function (p, idx) {
        var orients = allOrientations(CATALOG.find(function (c) { return c.key === p.key; }).cells);
        var start = orients[Math.floor(rng() * orients.length)];
        return {
          instanceId: p.instanceId,
          key: p.key,
          cells: cloneCells(start),
          color: p.color,
          placed: null,
        };
      });
      shuffle(pieces, rng);
      return {
        seed: seed >>> 0,
        difficulty: difficulty in DIFFICULTIES ? difficulty : "normaali",
        board: norm.board,
        rows: norm.rows,
        cols: norm.cols,
        pieces: pieces,
        solution: norm.solution,
        timeMs: diff.timeMs,
      };
    }
    throw new Error("Mosaiikki: puzzle generation failed for seed " + seed);
  }

  function emptyFill(rows, cols) {
    var fill = [];
    for (var r = 0; r < rows; r++) {
      fill[r] = [];
      for (var c = 0; c < cols; c++) fill[r][c] = null;
    }
    return fill;
  }

  function rebuildFill(state) {
    var fill = emptyFill(state.rows, state.cols);
    for (var i = 0; i < state.pieces.length; i++) {
      var p = state.pieces[i];
      if (!p.placed) continue;
      for (var j = 0; j < p.cells.length; j++) {
        var r = p.placed.r + p.cells[j][0];
        var c = p.placed.c + p.cells[j][1];
        fill[r][c] = p.instanceId;
      }
    }
    return fill;
  }

  function initState(puzzle) {
    var pieces = puzzle.pieces.map(function (p) {
      return {
        instanceId: p.instanceId,
        key: p.key,
        cells: cloneCells(p.cells),
        color: p.color,
        placed: null,
      };
    });
    var state = {
      seed: puzzle.seed,
      difficulty: puzzle.difficulty,
      board: puzzle.board.map(function (row) { return row.slice(); }),
      rows: puzzle.rows,
      cols: puzzle.cols,
      pieces: pieces,
      solution: puzzle.solution.map(function (s) {
        return { instanceId: s.instanceId, cells: cloneCells(s.cells), r: s.r, c: s.c };
      }),
      timeMs: puzzle.timeMs,
      selectedId: null,
      phase: "playing",
      history: [],
      fill: emptyFill(puzzle.rows, puzzle.cols),
    };
    return state;
  }

  function findPiece(state, instanceId) {
    for (var i = 0; i < state.pieces.length; i++) {
      if (state.pieces[i].instanceId === instanceId) return state.pieces[i];
    }
    return null;
  }

  function snapshot(state) {
    return {
      pieces: state.pieces.map(function (p) {
        return {
          instanceId: p.instanceId,
          cells: cloneCells(p.cells),
          placed: p.placed ? { r: p.placed.r, c: p.placed.c } : null,
        };
      }),
      selectedId: state.selectedId,
    };
  }

  function pushHistory(state) {
    state.history.push(snapshot(state));
    if (state.history.length > 40) state.history.shift();
  }

  function canPlace(state, instanceId, atR, atC) {
    if (state.phase !== "playing") return false;
    var piece = findPiece(state, instanceId);
    if (!piece) return false;
    for (var i = 0; i < piece.cells.length; i++) {
      var r = atR + piece.cells[i][0];
      var c = atC + piece.cells[i][1];
      if (r < 0 || c < 0 || r >= state.rows || c >= state.cols) return false;
      if (!state.board[r][c]) return false;
      var occ = state.fill[r][c];
      if (occ != null && occ !== instanceId) return false;
    }
    return true;
  }

  function legalAnchors(state, instanceId) {
    var out = [];
    if (state.phase !== "playing") return out;
    var piece = findPiece(state, instanceId);
    if (!piece) return out;
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) {
        if (canPlace(state, instanceId, r, c)) out.push({ r: r, c: c });
      }
    }
    return out;
  }

  function clearPieceFromFill(state, instanceId) {
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) {
        if (state.fill[r][c] === instanceId) state.fill[r][c] = null;
      }
    }
  }

  function placePiece(state, instanceId, atR, atC) {
    if (!canPlace(state, instanceId, atR, atC)) return { ok: false, reason: "illegal" };
    var piece = findPiece(state, instanceId);
    pushHistory(state);
    clearPieceFromFill(state, instanceId);
    piece.placed = { r: atR, c: atC };
    for (var i = 0; i < piece.cells.length; i++) {
      var r = atR + piece.cells[i][0];
      var c = atC + piece.cells[i][1];
      state.fill[r][c] = instanceId;
    }
    state.selectedId = instanceId;
    if (isSolved(state)) state.phase = "won";
    return { ok: true, solved: state.phase === "won" };
  }

  function removePiece(state, instanceId) {
    if (state.phase !== "playing") return { ok: false };
    var piece = findPiece(state, instanceId);
    if (!piece || !piece.placed) return { ok: false };
    pushHistory(state);
    clearPieceFromFill(state, instanceId);
    piece.placed = null;
    state.selectedId = instanceId;
    return { ok: true };
  }

  function selectPiece(state, instanceId) {
    if (state.phase !== "playing") return { ok: false };
    if (!findPiece(state, instanceId)) return { ok: false };
    state.selectedId = instanceId;
    return { ok: true };
  }

  function transformSelected(state, kind) {
    if (state.phase !== "playing") return { ok: false };
    var id = state.selectedId;
    if (!id) return { ok: false };
    var piece = findPiece(state, id);
    if (!piece || piece.placed) return { ok: false, reason: "placed" };
    pushHistory(state);
    piece.cells = kind === "flip" ? flipH(piece.cells) : rotateCW(piece.cells);
    return { ok: true, cells: cloneCells(piece.cells) };
  }

  function rotateSelected(state) { return transformSelected(state, "rotate"); }
  function flipSelected(state) { return transformSelected(state, "flip"); }

  function isSolved(state) {
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) {
        if (state.board[r][c] && state.fill[r][c] == null) return false;
      }
    }
    for (var i = 0; i < state.pieces.length; i++) {
      if (!state.pieces[i].placed) return false;
    }
    return true;
  }

  function filledCount(state) {
    var need = 0, have = 0;
    for (var r = 0; r < state.rows; r++) {
      for (var c = 0; c < state.cols; c++) {
        if (state.board[r][c]) {
          need++;
          if (state.fill[r][c] != null) have++;
        }
      }
    }
    return { have: have, need: need };
  }

  function undo(state) {
    if (state.phase === "lost") return { ok: false };
    if (!state.history.length) return { ok: false };
    var snap = state.history.pop();
    for (var i = 0; i < snap.pieces.length; i++) {
      var s = snap.pieces[i];
      var p = findPiece(state, s.instanceId);
      p.cells = cloneCells(s.cells);
      p.placed = s.placed ? { r: s.placed.r, c: s.placed.c } : null;
    }
    state.selectedId = snap.selectedId;
    state.fill = rebuildFill(state);
    if (state.phase === "won") state.phase = "playing";
    return { ok: true };
  }

  function applyHint(state) {
    if (state.phase !== "playing") return { ok: false };
    // Etsi ratkaisun pala joka ei ole oikein paikallaan.
    for (var i = 0; i < state.solution.length; i++) {
      var sol = state.solution[i];
      var piece = findPiece(state, sol.instanceId);
      var correct = piece.placed
        && piece.placed.r === sol.r
        && piece.placed.c === sol.c
        && cellsKey(piece.cells) === cellsKey(sol.cells);
      if (correct) continue;
      pushHistory(state);
      clearPieceFromFill(state, sol.instanceId);
      piece.cells = cloneCells(sol.cells);
      piece.placed = { r: sol.r, c: sol.c };
      for (var j = 0; j < piece.cells.length; j++) {
        var r = sol.r + piece.cells[j][0];
        var c = sol.c + piece.cells[j][1];
        // Poista mahdollinen päällekkäinen toinen pala.
        var other = state.fill[r][c];
        if (other && other !== sol.instanceId) {
          var op = findPiece(state, other);
          clearPieceFromFill(state, other);
          op.placed = null;
        }
        state.fill[r][c] = sol.instanceId;
      }
      state.selectedId = sol.instanceId;
      if (isSolved(state)) state.phase = "won";
      return { ok: true, instanceId: sol.instanceId, solved: state.phase === "won" };
    }
    return { ok: false, reason: "complete" };
  }

  function markLost(state) {
    if (state.phase === "playing") state.phase = "lost";
    return state;
  }

  function publicState(state) {
    return {
      seed: state.seed,
      difficulty: state.difficulty,
      rows: state.rows,
      cols: state.cols,
      board: state.board,
      fill: state.fill,
      phase: state.phase,
      selectedId: state.selectedId,
      timeMs: state.timeMs,
      pieces: state.pieces.map(function (p) {
        return {
          instanceId: p.instanceId,
          key: p.key,
          cells: cloneCells(p.cells),
          color: p.color,
          placed: p.placed ? { r: p.placed.r, c: p.placed.c } : null,
        };
      }),
      progress: filledCount(state),
    };
  }

  return {
    DIFFICULTIES: DIFFICULTIES,
    CATALOG: CATALOG,
    makeRNG: makeRNG,
    normalize: normalize,
    rotateCW: rotateCW,
    flipH: flipH,
    allOrientations: allOrientations,
    generatePuzzle: generatePuzzle,
    initState: initState,
    selectPiece: selectPiece,
    canPlace: canPlace,
    legalAnchors: legalAnchors,
    placePiece: placePiece,
    removePiece: removePiece,
    rotateSelected: rotateSelected,
    flipSelected: flipSelected,
    isSolved: isSolved,
    filledCount: filledCount,
    undo: undo,
    applyHint: applyHint,
    markLost: markLost,
    publicState: publicState,
    findPiece: findPiece,
  };
});
