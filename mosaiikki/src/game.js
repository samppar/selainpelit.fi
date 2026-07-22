// Mosaiikki — DOM-UI. Ydin: globalThis.MosaiikkiEngine.
// Playwright: data-testid + window.__MOSAIKKI__ test-API.
(function () {
  "use strict";

  var E = globalThis.MosaiikkiEngine;
  var el = function (id) { return document.getElementById(id); };

  var S = null;
  var timerId = null;
  var endsAt = 0;
  var previewAnchor = null;

  function qs() {
    try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(); }
  }

  function parseOpts() {
    var p = qs();
    var diff = p.get("difficulty") || el("difficulty").value || "normaali";
    if (!E.DIFFICULTIES[diff]) diff = "normaali";
    var seedParam = p.get("seed");
    var seed = seedParam != null && seedParam !== ""
      ? (Number(seedParam) >>> 0)
      : ((Math.random() * 0xffffffff) >>> 0);
    var timerParam = p.get("timer");
    var timeOverride = null;
    if (timerParam === "0" || timerParam === "off") timeOverride = 0;
    else if (timerParam && !isNaN(Number(timerParam))) timeOverride = Number(timerParam) * 1000;
    return { difficulty: diff, seed: seed, timeOverride: timeOverride };
  }

  function toast(msg, kind) {
    var t = el("toast");
    t.textContent = msg;
    t.className = "toast show" + (kind ? " " + kind : "");
    clearTimeout(toast._id);
    toast._id = setTimeout(function () { t.className = "toast"; }, 1600);
  }

  function stopTimer() {
    if (timerId) { clearInterval(timerId); timerId = null; }
  }

  function startTimer() {
    stopTimer();
    var box = el("timer");
    if (!S.timeMs) {
      box.className = "timer zen";
      el("timerText").textContent = "Ei aikarajaa";
      el("timerFill").style.width = "100%";
      return;
    }
    box.className = "timer";
    endsAt = Date.now() + S.timeLeft;
    timerId = setInterval(function () {
      S.timeLeft = Math.max(0, endsAt - Date.now());
      var frac = S.timeLeft / S.timeMs;
      el("timerFill").style.width = (frac * 100) + "%";
      el("timerText").textContent = formatMs(S.timeLeft);
      box.classList.toggle("warn", frac < 0.25);
      if (S.timeLeft <= 0) {
        stopTimer();
        E.markLost(S);
        render();
        openOverlay("Aika loppui", "Mosaiikki jäi kesken — kokeile uudelleen tai helpompaa tasoa.", "Uusi peli");
      }
    }, 100);
  }

  function formatMs(ms) {
    var s = Math.ceil(ms / 1000);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ":" + (r < 10 ? "0" : "") + r;
  }

  function cellSize(rows, cols) {
    var frame = el("boardFrame");
    var max = Math.min(frame.clientWidth - 36, 480);
    var gap = 5;
    var byW = Math.floor((max - (cols - 1) * gap) / cols);
    var byH = Math.floor((Math.min(window.innerHeight * 0.55, 480) - (rows - 1) * gap) / rows);
    return Math.max(28, Math.min(52, byW, byH));
  }

  function pieceBounds(cells) {
    var b = { rows: 0, cols: 0 };
    for (var i = 0; i < cells.length; i++) {
      if (cells[i][0] + 1 > b.rows) b.rows = cells[i][0] + 1;
      if (cells[i][1] + 1 > b.cols) b.cols = cells[i][1] + 1;
    }
    return b;
  }

  function renderPieceCard(piece) {
    var b = pieceBounds(piece.cells);
    var set = Object.create(null);
    for (var i = 0; i < piece.cells.length; i++) {
      set[piece.cells[i][0] + "," + piece.cells[i][1]] = true;
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "piece-card"
      + (S.selectedId === piece.instanceId ? " selected" : "")
      + (piece.placed ? " placed" : "");
    btn.dataset.testid = "piece-" + piece.instanceId;
    btn.setAttribute("data-piece-id", piece.instanceId);
    btn.setAttribute("data-placed", piece.placed ? "1" : "0");
    btn.setAttribute("aria-pressed", S.selectedId === piece.instanceId ? "true" : "false");
    btn.setAttribute("aria-label", "Pala " + piece.key + (piece.placed ? " (laudalla)" : ""));
    var grid = document.createElement("div");
    grid.className = "piece-grid";
    grid.style.gridTemplateColumns = "repeat(" + b.cols + ", 16px)";
    for (var r = 0; r < b.rows; r++) {
      for (var c = 0; c < b.cols; c++) {
        var cell = document.createElement("div");
        cell.className = "piece-cell " + (set[r + "," + c] ? piece.color : "empty");
        grid.appendChild(cell);
      }
    }
    btn.appendChild(grid);
    btn.addEventListener("click", function () {
      if (piece.placed) {
        E.removePiece(S, piece.instanceId);
        toast("Pala palautettu", "warn");
      } else {
        E.selectPiece(S, piece.instanceId);
      }
      previewAnchor = null;
      render();
    });
    return btn;
  }

  function legalSet() {
    var map = Object.create(null);
    if (!S || !S.selectedId) return map;
    var piece = E.findPiece(S, S.selectedId);
    if (!piece || piece.placed) return map;
    var anchors = E.legalAnchors(S, S.selectedId);
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      for (var j = 0; j < piece.cells.length; j++) {
        var r = a.r + piece.cells[j][0];
        var c = a.c + piece.cells[j][1];
        map[r + "," + c] = true;
      }
    }
    // Merkitse myös ankkurit erilleen previewtä varten.
    map.__anchors = anchors;
    return map;
  }

  // Klikattu/hoverattu ruutu → ankkuri, jossa pala peittää sen (tai suora ankkuri).
  function anchorForCell(instanceId, r, c) {
    if (E.canPlace(S, instanceId, r, c)) return { r: r, c: c };
    var piece = E.findPiece(S, instanceId);
    if (!piece || piece.placed) return null;
    var anchors = E.legalAnchors(S, instanceId);
    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      for (var j = 0; j < piece.cells.length; j++) {
        if (a.r + piece.cells[j][0] === r && a.c + piece.cells[j][1] === c) {
          return a;
        }
      }
    }
    return null;
  }

  function renderBoard() {
    var board = el("board");
    var size = cellSize(S.rows, S.cols);
    document.documentElement.style.setProperty("--cell", size + "px");
    board.style.gridTemplateColumns = "repeat(" + S.cols + ", var(--cell))";
    board.innerHTML = "";
    board.setAttribute("data-rows", String(S.rows));
    board.setAttribute("data-cols", String(S.cols));

    var legal = legalSet();
    var previewCells = Object.create(null);
    if (previewAnchor && S.selectedId) {
      var piece = E.findPiece(S, S.selectedId);
      var anc = piece && !piece.placed
        ? anchorForCell(S.selectedId, previewAnchor.r, previewAnchor.c)
        : null;
      if (anc) {
        for (var pi = 0; pi < piece.cells.length; pi++) {
          previewCells[(anc.r + piece.cells[pi][0]) + "," + (anc.c + piece.cells[pi][1])] = true;
        }
      }
    }

    for (var r = 0; r < S.rows; r++) {
      for (var c = 0; c < S.cols; c++) {
        var cell = document.createElement("div");
        var key = r + "," + c;
        var isSlot = !!S.board[r][c];
        var fillId = S.fill[r][c];
        cell.className = "cell " + (isSlot ? "slot" : "void");
        cell.dataset.testid = "cell-" + r + "-" + c;
        cell.dataset.r = String(r);
        cell.dataset.c = String(c);
        cell.dataset.slot = isSlot ? "1" : "0";
        cell.dataset.filled = fillId ? "1" : "0";
        if (fillId) cell.dataset.pieceId = fillId;

        if (isSlot && !fillId && legal[key]) cell.classList.add("legal");
        if (previewCells[key]) cell.classList.add("preview");

        if (fillId) {
          cell.classList.add("filled");
          var tile = document.createElement("div");
          var p = E.findPiece(S, fillId);
          tile.className = "tile " + (p ? p.color : "teal");
          tile.dataset.testid = "tile-" + r + "-" + c;
          cell.appendChild(tile);
        }

        (function (rr, cc, fid) {
          cell.addEventListener("mouseenter", function () {
            if (!S.selectedId) return;
            var sel = E.findPiece(S, S.selectedId);
            if (!sel || sel.placed) return;
            previewAnchor = { r: rr, c: cc };
            renderBoard();
            renderTray();
          });
          cell.addEventListener("click", function () {
            if (fid) {
              E.removePiece(S, fid);
              toast("Pala palautettu", "warn");
              previewAnchor = null;
              render();
              return;
            }
            if (!S.selectedId) {
              toast("Valitse ensin pala", "warn");
              return;
            }
            var anc = anchorForCell(S.selectedId, rr, cc);
            if (!anc) {
              toast("Ei mahdu tähän", "warn");
              return;
            }
            var res = E.placePiece(S, S.selectedId, anc.r, anc.c);
            if (!res.ok) {
              toast("Ei mahdu tähän", "warn");
              return;
            }
            previewAnchor = null;
            if (res.solved) {
              stopTimer();
              render();
              openOverlay("Valmis!", "Mosaiikki täyttyi — hieno sommitelma.", "Seuraava");
              toast("Kaikki palat paikallaan", "good");
            } else {
              toast("Pala asetettu", "good");
              render();
            }
          });
        })(r, c, fillId);

        board.appendChild(cell);
      }
    }
  }

  function renderTray() {
    var tray = el("tray");
    tray.innerHTML = "";
    for (var i = 0; i < S.pieces.length; i++) {
      tray.appendChild(renderPieceCard(S.pieces[i]));
    }
  }

  function renderStatus() {
    var prog = E.filledCount(S);
    el("progressFill").style.width = (prog.need ? (prog.have / prog.need) * 100 : 0) + "%";
    el("progressLabel").textContent = prog.have + " / " + prog.need;
    el("shell").dataset.phase = S.phase;
    el("shell").dataset.seed = String(S.seed);
    el("shell").dataset.difficulty = S.difficulty;

    if (S.phase === "won") {
      el("phase").textContent = "Valmis";
      el("message").textContent = "Kaikki palat täyttävät muodon. Aloita seuraava sommitelma.";
    } else if (S.phase === "lost") {
      el("phase").textContent = "Aika loppui";
      el("message").textContent = "Kokeile uudelleen tai valitse helpompi taso.";
    } else if (S.selectedId) {
      var p = E.findPiece(S, S.selectedId);
      el("phase").textContent = "Aseta pala";
      el("message").textContent = p && p.placed
        ? "Klikkaa palaa laudalla palauttaaksesi sen."
        : "Kierrä tai peilaa, sitten klikkaa laillista ruutua.";
    } else {
      el("phase").textContent = "Valitse pala";
      el("message").textContent = "Täytä tumma muoto kaikilla paloilla. Tavoite näkyy edistymispalkissa.";
    }

    var canTransform = !!(S.selectedId && E.findPiece(S, S.selectedId) && !E.findPiece(S, S.selectedId).placed && S.phase === "playing");
    el("btnRotate").disabled = !canTransform;
    el("btnFlip").disabled = !canTransform;
    el("btnUndo").disabled = !S.history.length || S.phase === "lost";
    el("btnHint").disabled = S.phase !== "playing";
  }

  function render() {
    if (!S) return;
    renderBoard();
    renderTray();
    renderStatus();
    syncTestApi();
  }

  function openOverlay(title, body, btnLabel) {
    el("ovTitle").textContent = title;
    el("ovBody").textContent = body;
    el("btnNext").textContent = btnLabel || "Uusi peli";
    el("overlay").classList.add("open");
    el("overlay").dataset.open = "1";
    el("overlay").setAttribute("aria-hidden", "false");
  }

  function closeOverlay() {
    el("overlay").classList.remove("open");
    el("overlay").dataset.open = "0";
    el("overlay").setAttribute("aria-hidden", "true");
  }

  function newPuzzle(opts) {
    opts = opts || parseOpts();
    el("difficulty").value = opts.difficulty;
    stopTimer();
    closeOverlay();
    var puzzle = E.generatePuzzle(opts.seed, opts.difficulty);
    if (opts.timeOverride != null) puzzle.timeMs = opts.timeOverride;
    S = E.initState(puzzle);
    S.timeLeft = S.timeMs || 0;
    previewAnchor = null;
    // Päivitä URL ilman reloadia (helpottaa Playwright-siemeniä).
    try {
      var url = new URL(location.href);
      url.searchParams.set("seed", String(S.seed));
      url.searchParams.set("difficulty", S.difficulty);
      if (opts.timeOverride === 0) url.searchParams.set("timer", "0");
      history.replaceState(null, "", url);
    } catch (e) {}
    render();
    startTimer();
    el("timerText").textContent = S.timeMs ? formatMs(S.timeMs) : "Ei aikarajaa";
  }

  function syncTestApi() {
    globalThis.__MOSAIKKI__ = {
      getState: function () { return S ? E.publicState(S) : null; },
      getSeed: function () { return S ? S.seed : null; },
      getPhase: function () { return S ? S.phase : null; },
      isSolved: function () { return S ? E.isSolved(S) : false; },
      select: function (id) {
        var r = E.selectPiece(S, id);
        render();
        return r;
      },
      rotate: function () {
        var r = E.rotateSelected(S);
        render();
        return r;
      },
      flip: function () {
        var r = E.flipSelected(S);
        render();
        return r;
      },
      place: function (id, r, c) {
        if (id) E.selectPiece(S, id);
        var res = E.placePiece(S, id || S.selectedId, r, c);
        if (res.ok && res.solved) {
          stopTimer();
          openOverlay("Valmis!", "Mosaiikki täyttyi — hieno sommitelma.", "Seuraava");
        }
        render();
        return res;
      },
      remove: function (id) {
        var r = E.removePiece(S, id);
        render();
        return r;
      },
      hint: function () {
        var r = E.applyHint(S);
        if (r.ok && r.solved) {
          stopTimer();
          openOverlay("Valmis!", "Mosaiikki täyttyi — hieno sommitelma.", "Seuraava");
        }
        render();
        return r;
      },
      undo: function () {
        var r = E.undo(S);
        render();
        return r;
      },
      newPuzzle: function (o) {
        newPuzzle(Object.assign(parseOpts(), o || {}));
      },
      solve: function () {
        // Aseta kaikki ratkaisun mukaan (Playwright-smoke / demo).
        while (S.phase === "playing") {
          var h = E.applyHint(S);
          if (!h.ok) break;
        }
        if (S.phase === "won") {
          stopTimer();
          openOverlay("Valmis!", "Mosaiikki täyttyi — hieno sommitelma.", "Seuraava");
        }
        render();
        return { ok: S.phase === "won" };
      },
      legalAnchors: function (id) {
        return E.legalAnchors(S, id || S.selectedId);
      },
    };
  }

  // ---- Events -------------------------------------------------------------
  el("btnRotate").addEventListener("click", function () {
    var r = E.rotateSelected(S);
    if (!r.ok) toast(r.reason === "placed" ? "Nosta pala ensin" : "Valitse pala", "warn");
    else render();
  });
  el("btnFlip").addEventListener("click", function () {
    var r = E.flipSelected(S);
    if (!r.ok) toast(r.reason === "placed" ? "Nosta pala ensin" : "Valitse pala", "warn");
    else render();
  });
  el("btnHint").addEventListener("click", function () {
    var r = E.applyHint(S);
    if (!r.ok) return;
    toast("Vihje asetettu", "good");
    if (r.solved) {
      stopTimer();
      openOverlay("Valmis!", "Mosaiikki täyttyi — hieno sommitelma.", "Seuraava");
    }
    render();
  });
  el("btnUndo").addEventListener("click", function () {
    if (E.undo(S).ok) render();
  });
  el("btnNew").addEventListener("click", function () {
    var opts = parseOpts();
    opts.seed = (Math.random() * 0xffffffff) >>> 0;
    opts.difficulty = el("difficulty").value;
    newPuzzle(opts);
  });
  el("difficulty").addEventListener("change", function () {
    var opts = parseOpts();
    opts.difficulty = el("difficulty").value;
    opts.seed = (Math.random() * 0xffffffff) >>> 0;
    newPuzzle(opts);
  });
  el("btnNext").addEventListener("click", function () {
    var opts = parseOpts();
    opts.seed = (S.seed + 1) >>> 0;
    opts.difficulty = el("difficulty").value;
    newPuzzle(opts);
  });

  document.addEventListener("keydown", function (e) {
    if (!S || S.phase !== "playing") return;
    if (e.key === "r" || e.key === "R") {
      E.rotateSelected(S); render();
    } else if (e.key === "f" || e.key === "F") {
      E.flipSelected(S); render();
    } else if (e.key === "z" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      E.undo(S); render();
    }
  });

  window.addEventListener("resize", function () {
    if (S) renderBoard();
  });

  // Käynnistä
  el("difficulty").value = parseOpts().difficulty;
  newPuzzle(parseOpts());
})();
