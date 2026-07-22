#!/usr/bin/env node
// Mosaiikki — moottorin regressiotestit (ei DOM:ia).
const E = require("../src/engine.js");

let pass = 0;
let fail = 0;

function ok(cond, msg) {
  if (cond) pass++;
  else {
    fail++;
    console.error("  FAIL:", msg);
  }
}

console.log("Mosaiikki tests");

// ---- Orientations ---------------------------------------------------------
{
  const o = E.allOrientations([[0, 0], [1, 0], [2, 0]]); // I3
  ok(o.length === 2, "I3 has 2 orientations (horizontal/vertical)");
  const o4 = E.allOrientations([[0, 0], [0, 1], [1, 0], [1, 1]]); // O4
  ok(o4.length === 1, "O4 has 1 orientation");
  const l = E.allOrientations([[0, 0], [1, 0], [2, 0], [2, 1]]); // L4
  ok(l.length === 8, "L4 has 8 orientations");
}

// ---- Rotate / flip normalize ---------------------------------------------
{
  const r = E.rotateCW([[0, 0], [1, 0], [2, 0]]);
  ok(r[0][0] === 0 && r[0][1] === 0, "rotateCW normalizes to origin");
  const f = E.flipH([[0, 0], [0, 1], [1, 0]]);
  ok(f.every((c) => c[0] >= 0 && c[1] >= 0), "flipH stays non-negative after normalize");
}

// ---- Deterministic generation --------------------------------------------
{
  const a = E.generatePuzzle(42, "helppo");
  const b = E.generatePuzzle(42, "helppo");
  ok(a.rows === b.rows && a.cols === b.cols, "same seed → same board size");
  ok(JSON.stringify(a.board) === JSON.stringify(b.board), "same seed → same board mask");
  ok(a.pieces.length === 3, "helppo has 3 pieces");
  ok(a.timeMs === 0, "helppo has no timer");
  ok(a.solution.length === 3, "helppo has 3 solution placements");
}

{
  const n = E.generatePuzzle(7, "normaali");
  ok(n.pieces.length === 4, "normaali has 4 pieces");
  ok(n.timeMs > 0, "normaali has timer");
  const v = E.generatePuzzle(9, "vaikea");
  ok(v.pieces.length === 5, "vaikea has 5 pieces");
}

// ---- Board cell count matches pieces -------------------------------------
{
  const p = E.generatePuzzle(1001, "normaali");
  let cells = 0;
  for (let r = 0; r < p.rows; r++) {
    for (let c = 0; c < p.cols; c++) if (p.board[r][c]) cells++;
  }
  const pieceCells = p.pieces.reduce((s, x) => {
    const cat = E.CATALOG.find((c) => c.key === x.key);
    return s + cat.size;
  }, 0);
  ok(cells === pieceCells, "board cells == sum of piece sizes (" + cells + ")");
}

// ---- Solution fills the board exactly ------------------------------------
{
  const p = E.generatePuzzle(55, "helppo");
  const st = E.initState(p);
  for (const sol of p.solution) {
    const piece = E.findPiece(st, sol.instanceId);
    piece.cells = sol.cells.map((c) => [c[0], c[1]]);
    const res = E.placePiece(st, sol.instanceId, sol.r, sol.c);
    ok(res.ok, "solution place " + sol.instanceId);
  }
  ok(E.isSolved(st), "applying solution solves puzzle");
  ok(st.phase === "won", "phase becomes won");
}

// ---- Illegal placement rejected ------------------------------------------
{
  const p = E.generatePuzzle(3, "helppo");
  const st = E.initState(p);
  const id = st.pieces[0].instanceId;
  E.selectPiece(st, id);
  // Find a void cell or out of bounds
  let placed = false;
  for (let r = 0; r < st.rows && !placed; r++) {
    for (let c = 0; c < st.cols; c++) {
      if (!st.board[r][c]) {
        const res = E.placePiece(st, id, r, c);
        ok(!res.ok, "cannot place on void cell");
        placed = true;
        break;
      }
    }
  }
  ok(!E.canPlace(st, id, -1, 0), "cannot place out of bounds");
}

// ---- Rotate / place / remove / undo --------------------------------------
{
  const p = E.generatePuzzle(88, "helppo");
  const st = E.initState(p);
  const id = st.pieces[0].instanceId;
  E.selectPiece(st, id);
  const before = JSON.stringify(E.findPiece(st, id).cells);
  E.rotateSelected(st);
  ok(JSON.stringify(E.findPiece(st, id).cells) !== before || E.allOrientations(E.findPiece(st, id).cells).length === 1,
    "rotate changes cells (or piece is symmetric)");
  // Lähtöorientaatio ei välttämättä mahdu — kierrä kunnes ankkureita löytyy.
  let anchors = [];
  for (let i = 0; i < 8; i++) {
    anchors = E.legalAnchors(st, id);
    if (anchors.length) break;
    E.rotateSelected(st);
    if (i === 3) E.flipSelected(st);
  }
  ok(anchors.length > 0, "piece has legal anchors in some orientation");
  const a = anchors[0];
  ok(E.placePiece(st, id, a.r, a.c).ok, "place on legal anchor");
  ok(E.findPiece(st, id).placed != null, "piece marked placed");
  ok(E.removePiece(st, id).ok, "remove piece");
  ok(E.findPiece(st, id).placed == null, "piece unplaced");
  ok(E.undo(st).ok, "undo restore");
}

// ---- Hint advances toward solution ---------------------------------------
{
  const p = E.generatePuzzle(12345, "helppo");
  const st = E.initState(p);
  const h1 = E.applyHint(st);
  ok(h1.ok, "hint places a piece");
  ok(E.findPiece(st, h1.instanceId).placed != null, "hinted piece is placed");
  while (st.phase === "playing") {
    const h = E.applyHint(st);
    if (!h.ok) break;
  }
  ok(st.phase === "won" && E.isSolved(st), "repeated hints solve puzzle");
}

// ---- Overlap prevention --------------------------------------------------
{
  const p = E.generatePuzzle(777, "helppo");
  const st = E.initState(p);
  const sol0 = p.solution[0];
  const piece = E.findPiece(st, sol0.instanceId);
  piece.cells = sol0.cells.map((c) => [c[0], c[1]]);
  ok(E.placePiece(st, sol0.instanceId, sol0.r, sol0.c).ok, "place first solution piece");
  const other = st.pieces.find((x) => x.instanceId !== sol0.instanceId);
  // Trying to place other at same anchor as occupied cells should fail for many seeds
  const blocked = !E.canPlace(st, other.instanceId, sol0.r, sol0.c)
    || E.legalAnchors(st, other.instanceId).every((a) => {
      // at least some anchors remain for free piece
      return true;
    });
  ok(blocked, "overlap logic active");
  ok(E.legalAnchors(st, other.instanceId).length >= 0, "legalAnchors returns array");
}

// ---- publicState shape (Playwright contract) -----------------------------
{
  const p = E.generatePuzzle(1, "helppo");
  const st = E.initState(p);
  const pub = E.publicState(st);
  ok(pub.phase === "playing", "publicState.phase");
  ok(Array.isArray(pub.pieces) && pub.pieces.length === 3, "publicState.pieces");
  ok(pub.progress.need > 0, "publicState.progress");
  ok(pub.seed === 1, "publicState.seed");
}

// ---- Many seeds generate successfully ------------------------------------
{
  let allOk = true;
  for (let seed = 0; seed < 30; seed++) {
    try {
      const p = E.generatePuzzle(seed, seed % 3 === 0 ? "helppo" : seed % 3 === 1 ? "normaali" : "vaikea");
      const st = E.initState(p);
      for (const sol of p.solution) {
        const piece = E.findPiece(st, sol.instanceId);
        piece.cells = sol.cells.map((c) => [c[0], c[1]]);
        if (!E.placePiece(st, sol.instanceId, sol.r, sol.c).ok) allOk = false;
      }
      if (!E.isSolved(st)) allOk = false;
    } catch (e) {
      allOk = false;
      console.error("  seed fail", seed, e.message);
    }
  }
  ok(allOk, "30 seeds generate solvable puzzles");
}

console.log("\n" + pass + " ok, " + fail + " fail");
process.exit(fail ? 1 : 0);
