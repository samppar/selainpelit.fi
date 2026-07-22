// Tammi — DOM-sidos. Tilakone: TammiSession. Smoke: window.TammiUI.
(function () {
  "use strict";
  var E = globalThis.TammiEngine;
  var Session = globalThis.TammiSession;
  var SIZE = E.SIZE;

  var els = {
    board: document.getElementById("board"),
    phase: document.getElementById("phase"),
    message: document.getElementById("message"),
    lightStats: document.getElementById("lightStats"),
    darkStats: document.getElementById("darkStats"),
    playerLight: document.getElementById("playerLight"),
    playerDark: document.getElementById("playerDark"),
    starter: document.getElementById("starter"),
    difficulty: document.getElementById("difficulty"),
    btnHint: document.getElementById("btnHint"),
    btnUndo: document.getElementById("btnUndo"),
    btnNew: document.getElementById("btnNew"),
    toast: document.getElementById("toast")
  };

  var cells = [];
  var toastTimer = null;

  function aiOptsFromUi() {
    return { timeMs: parseInt(els.difficulty.value, 10) || 1000 };
  }

  var session = Session.createSession({
    engine: E,
    aiOpts: aiOptsFromUi(),
    onChange: render
  });

  function showToast(text) {
    if (!text) return;
    els.toast.textContent = text;
    els.toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove("show");
    }, 1600);
  }

  function buildBoard() {
    els.board.innerHTML = "";
    cells = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var sq = E.rc(r, c);
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cell " + (E.isDark(r, c) ? "dark" : "light");
        btn.dataset.sq = String(sq);
        btn.setAttribute("aria-label", E.sqLabel(sq));
        if (!E.isDark(r, c)) {
          btn.disabled = true;
          btn.tabIndex = -1;
        } else {
          btn.addEventListener("click", onCellClick);
        }
        els.board.appendChild(btn);
        cells[sq] = btn;
      }
    }
  }

  function pieceEl(piece) {
    var el = document.createElement("span");
    el.className = "piece " + (E.sideOf(piece) === E.HUMAN ? "human" : "ai");
    if (E.isKing(piece)) {
      el.classList.add("king");
      el.setAttribute("aria-label", "daami");
    }
    return el;
  }

  function render() {
    var v = session.getView();
    if (!v.board) return;

    var movable = {};
    var targets = {};
    var i;
    for (i = 0; i < v.movable.length; i++) movable[E.parseSq(v.movable[i])] = true;
    for (i = 0; i < v.targets.length; i++) targets[E.parseSq(v.targets[i])] = true;

    var selected = v.selected ? E.parseSq(v.selected) : -1;
    var lastFrom = -1, lastTo = -1;
    if (v.lastMove) {
      var lm = parseLast(v.lastMove);
      if (lm) { lastFrom = lm.from; lastTo = lm.to; }
    }
    var hintFrom = -1, hintTo = -1;
    if (v.hint) {
      var hp = parseLast(v.hint);
      if (hp) { hintFrom = hp.from; hintTo = hp.to; }
    }
    var flash = {};
    for (i = 0; i < v.captureFlash.length; i++) flash[E.parseSq(v.captureFlash[i])] = true;

    for (var sq = 0; sq < cells.length; sq++) {
      var btn = cells[sq];
      if (!btn) continue;
      btn.innerHTML = "";
      btn.classList.remove("movable", "selected", "target", "last-from", "last-to", "hint-from", "hint-to", "flash");

      var piece = v.board[sq];
      if (piece) btn.appendChild(pieceEl(piece));

      if (sq === lastFrom) btn.classList.add("last-from");
      if (sq === lastTo) btn.classList.add("last-to");
      if (sq === hintFrom) btn.classList.add("hint-from");
      if (sq === hintTo) btn.classList.add("hint-to");
      if (flash[sq]) btn.classList.add("flash");

      if (!v.winner && !v.thinking && v.turn === E.HUMAN) {
        if (selected === sq) btn.classList.add("selected");
        if (movable[sq]) btn.classList.add("movable");
        if (targets[sq]) btn.classList.add("target");
      }
    }

    els.phase.textContent = v.phase;
    els.message.textContent = v.message;
    els.lightStats.textContent = v.humanStats;
    els.darkStats.textContent = v.aiStats;
    els.playerLight.classList.toggle("active", !v.winner && v.turn === E.HUMAN);
    els.playerDark.classList.toggle("active", !v.winner && (v.turn === E.AI || v.thinking));
    els.btnUndo.disabled = !v.canUndo;
    els.btnHint.disabled = !v.canHint;
    if (v.toast) showToast(v.toast);
  }

  function parseLast(notation) {
    // lastMove säilytetään formatMove-muodossa; findMove tarvitsee vuoron.
    // Puretaan from/to algebrasta: "a3-b4" | "c5xe7" | "c5xe7xg3"
    var m = /^([a-h][1-8])(?:-|x)([a-h][1-8])(?:x[a-h][1-8])*$/i.exec(notation);
    if (!m) return null;
    var from = E.parseSq(m[1]);
    var parts = notation.toLowerCase().split(/[-x]/);
    var to = E.parseSq(parts[parts.length - 1]);
    return { from: from, to: to };
  }

  function onCellClick(ev) {
    session.click(parseInt(ev.currentTarget.dataset.sq, 10));
  }

  function newGameFromUi() {
    session.setAiOpts(aiOptsFromUi());
    session.newGame({ starterMode: els.starter.value });
  }

  els.btnNew.addEventListener("click", newGameFromUi);
  els.btnUndo.addEventListener("click", function () { session.undo(); });
  els.btnHint.addEventListener("click", function () { session.hint(); });
  els.difficulty.addEventListener("change", function () {
    session.setAiOpts(aiOptsFromUi());
  });

  // Agentti-/smoke-API (kuten HoldemUI)
  globalThis.TammiUI = {
    newGame: function (opts) {
      opts = opts || {};
      session.setAiOpts(opts.aiOpts || aiOptsFromUi());
      return session.newGame(opts);
    },
    click: function (sq) { return session.click(sq); },
    play: function (notation) { return session.play(notation); },
    undo: function () { return session.undo(); },
    hint: function () { return session.hint(); },
    stepAI: function () { return session.stepAI(); },
    getView: function () { return session.getView(); },
    getState: function () { return session.getState(); }
  };

  buildBoard();
  newGameFromUi();
})();
