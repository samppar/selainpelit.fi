// Palikat — selainsovellus (DOM). Ydin: globalThis.PalikatEngine.
(function () {
  "use strict";
  var E = globalThis.PalikatEngine;
  var HUMAN = E.HUMAN;
  var AI = E.AI;
  var SIZE = E.SIZE;

  var els = {
    board: document.getElementById("board"),
    tray: document.getElementById("tray"),
    phase: document.getElementById("phase"),
    message: document.getElementById("message"),
    humanStats: document.getElementById("humanStats"),
    aiStats: document.getElementById("aiStats"),
    playerHuman: document.getElementById("playerHuman"),
    playerAi: document.getElementById("playerAi"),
    starter: document.getElementById("starter"),
    difficulty: document.getElementById("difficulty"),
    btnRotate: document.getElementById("btnRotate"),
    btnFlip: document.getElementById("btnFlip"),
    btnHint: document.getElementById("btnHint"),
    btnUndo: document.getElementById("btnUndo"),
    btnNew: document.getElementById("btnNew"),
    toast: document.getElementById("toast")
  };

  var cells = [];
  var st = null;
  var selectedId = null;
  var orientIndex = 0;
  var winner = 0;
  var lastCells = null;
  var history = [];
  var hintCells = null;
  var thinking = false;
  var hinting = false;
  var aiTimer = null;
  var toastTimer = null;
  var nextAltStarter = HUMAN;
  var hoverBase = null;

  function clearTimers() {
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  }

  function aiTimeMs() {
    return parseInt(els.difficulty.value, 10) || 1000;
  }

  function resolveStarter() {
    var mode = els.starter.value;
    if (mode === "human") return HUMAN;
    if (mode === "computer") return AI;
    var s = nextAltStarter;
    nextAltStarter = E.opp(nextAltStarter);
    return s;
  }

  function showToast(text) {
    els.toast.textContent = text;
    els.toast.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      els.toast.classList.remove("show");
    }, 1700);
  }

  function effectiveOrient(pieceId) {
    var n = E.orientCount(pieceId);
    if (!n) return 0;
    return ((orientIndex % n) + n) % n;
  }

  function statsLine(side) {
    var pts = E.scoreOf(st, side);
    var left = E.remainingSquares(st, side);
    var pcs = st.remaining[side].length;
    return pts + " pistettä · " + pcs + " palaa (" + left + " ruutua)";
  }

  function statusMessage() {
    if (st.over) {
      var h = E.scoreOf(st, HUMAN);
      var a = E.scoreOf(st, AI);
      if (winner === HUMAN) return "Voitit " + h + "–" + a + "!";
      if (winner === AI) return "Tietokone voitti " + a + "–" + h + ".";
      return "Tasapeli " + h + "–" + a + ".";
    }
    if (thinking) return "Tietokone miettii sijoitusta…";
    if (hinting) return "Etsitään vihjettä…";
    if (st.turn === HUMAN) {
      if (!selectedId) {
        if (st.first[HUMAN]) {
          return "Valitse pala ja peitä aloitusruutu (korostettu).";
        }
        return "Valitse pala tarjottimelta — uuden palan pitää koskettaa omaa palaa kulmasta.";
      }
      return "Kierrä palaa tarvittaessa ja klikkaa laudan kohtaa.";
    }
    return "Tietokoneen vuoro.";
  }

  function buildBoard() {
    els.board.innerHTML = "";
    cells = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var sq = E.rc(r, c);
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cell";
        btn.dataset.sq = String(sq);
        btn.dataset.r = String(r);
        btn.dataset.c = String(c);
        btn.setAttribute("aria-label", E.sqLabel(sq));
        btn.addEventListener("click", onCellClick);
        btn.addEventListener("mouseenter", onCellEnter);
        btn.addEventListener("mouseleave", onCellLeave);
        els.board.appendChild(btn);
        cells[sq] = btn;
      }
    }
  }

  function miniPieceSvg(shape, cls) {
    var maxR = 0;
    var maxC = 0;
    var i;
    for (i = 0; i < shape.length; i++) {
      if (shape[i][0] > maxR) maxR = shape[i][0];
      if (shape[i][1] > maxC) maxC = shape[i][1];
    }
    var wrap = document.createElement("div");
    wrap.className = "mini-piece " + (cls || "");
    wrap.style.gridTemplateColumns = "repeat(" + (maxC + 1) + ", 1fr)";
    wrap.style.gridTemplateRows = "repeat(" + (maxR + 1) + ", 1fr)";
    var map = {};
    for (i = 0; i < shape.length; i++) map[shape[i][0] + "," + shape[i][1]] = true;
    for (var r = 0; r <= maxR; r++) {
      for (var c = 0; c <= maxC; c++) {
        var d = document.createElement("span");
        d.className = map[r + "," + c] ? "mini-on" : "mini-off";
        wrap.appendChild(d);
      }
    }
    return wrap;
  }

  function buildTray() {
    els.tray.innerHTML = "";
    var rem = st.remaining[HUMAN];
    // järjestä koon mukaan suurimmasta
    var ids = rem.slice().sort(function (a, b) {
      return E.PIECE_BY_ID[b].size - E.PIECE_BY_ID[a].size || a.localeCompare(b);
    });
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tray-piece" + (selectedId === id ? " selected" : "");
      btn.dataset.id = id;
      btn.title = "Pala " + id + " (" + E.PIECE_BY_ID[id].size + " ruutua)";
      btn.setAttribute("aria-label", "Pala " + id);
      btn.appendChild(miniPieceSvg(E.piecePreview(id, 0), "human"));
      btn.addEventListener("click", onTrayClick);
      els.tray.appendChild(btn);
    }
    if (!ids.length) {
      var empty = document.createElement("p");
      empty.className = "tray-empty";
      empty.textContent = "Kaikki palat käytetty!";
      els.tray.appendChild(empty);
    }
  }

  function clearGhost() {
    for (var sq = 0; sq < cells.length; sq++) {
      if (cells[sq]) cells[sq].classList.remove("ghost-ok", "ghost-bad");
    }
    hoverBase = null;
  }

  function showGhostAt(baseR, baseC) {
    clearGhost();
    if (!selectedId || st.turn !== HUMAN || st.over || thinking) return;
    var shape = E.piecePreview(selectedId, effectiveOrient(selectedId));
    var cellsPos = [];
    var i, r, c, ok = true;
    for (i = 0; i < shape.length; i++) {
      r = baseR + shape[i][0];
      c = baseC + shape[i][1];
      cellsPos.push([r, c]);
      if (!E.inBounds(r, c)) ok = false;
    }
    if (ok) ok = E.canPlace(st, HUMAN, cellsPos);
    for (i = 0; i < cellsPos.length; i++) {
      if (!E.inBounds(cellsPos[i][0], cellsPos[i][1])) continue;
      var sq = E.rc(cellsPos[i][0], cellsPos[i][1]);
      cells[sq].classList.add(ok ? "ghost-ok" : "ghost-bad");
    }
    hoverBase = { r: baseR, c: baseC, ok: ok };
  }

  function render() {
    var startH = E.START[HUMAN];
    var startA = E.START[AI];
    var legalMap = {};
    var i;

    if (selectedId && st.turn === HUMAN && !st.over && !thinking) {
      var targets = E.legalTargets(st, selectedId, effectiveOrient(selectedId));
      for (i = 0; i < targets.length; i++) {
        for (var j = 0; j < targets[i].cells.length; j++) {
          legalMap[E.rc(targets[i].cells[j][0], targets[i].cells[j][1])] = true;
        }
      }
    }

    for (var sq = 0; sq < cells.length; sq++) {
      var btn = cells[sq];
      btn.className = "cell";
      var v = st.board[sq];
      if (v === HUMAN) btn.classList.add("human");
      else if (v === AI) btn.classList.add("ai");
      if (sq === startH && st.first[HUMAN]) btn.classList.add("start-human");
      if (sq === startA && st.first[AI]) btn.classList.add("start-ai");
      if (legalMap[sq]) btn.classList.add("legal");
      if (lastCells && lastCells[sq]) btn.classList.add("last");
      if (hintCells && hintCells[sq]) btn.classList.add("hint");
    }

    if (hoverBase) showGhostAt(hoverBase.r, hoverBase.c);

    buildTray();

    els.humanStats.textContent = statsLine(HUMAN);
    els.aiStats.textContent = statsLine(AI);
    els.playerHuman.classList.toggle("active", st.turn === HUMAN && !st.over);
    els.playerAi.classList.toggle("active", st.turn === AI && !st.over);

    if (st.over) {
      els.phase.textContent = winner === HUMAN ? "Voitto!" : winner === AI ? "Häviö" : "Tasapeli";
    } else if (thinking) {
      els.phase.textContent = "Tietokone miettii…";
    } else if (st.turn === HUMAN) {
      els.phase.textContent = "Sinun vuorosi";
    } else {
      els.phase.textContent = "Tietokoneen vuoro";
    }
    els.message.textContent = statusMessage();

    var busy = thinking || hinting || st.over || st.turn !== HUMAN;
    els.btnRotate.disabled = busy || !selectedId;
    els.btnFlip.disabled = busy || !selectedId;
    els.btnHint.disabled = busy;
    els.btnUndo.disabled = thinking || hinting || history.length === 0;
  }

  function pushHistory() {
    history.push({
      st: E.cloneState(st),
      lastCells: lastCells ? Object.assign({}, lastCells) : null,
      selectedId: selectedId,
      orientIndex: orientIndex
    });
    if (history.length > 40) history.shift();
  }

  function markLast(cellsArr) {
    lastCells = {};
    if (!cellsArr) return;
    for (var i = 0; i < cellsArr.length; i++) {
      lastCells[E.rc(cellsArr[i][0], cellsArr[i][1])] = true;
    }
  }

  function afterHumanMove(mv) {
    pushHistory();
    st = E.applyMove(st, mv);
    markLast(mv.cells);
    hintCells = null;
    selectedId = null;
    orientIndex = 0;
    clearGhost();

    var size = mv.size;
    if (size >= 5) showToast("Iso pala! +" + size);
    else if (st.usedAll[HUMAN]) showToast("Kaikki palat pelattu! +15");
    else showToast("+" + size + " ruutua");

    if (st.over) {
      winner = E.winnerOf(st);
      render();
      if (winner === HUMAN) showToast("Voitit!");
      else if (winner === AI) showToast("Tietokone voitti");
      else showToast("Tasapeli");
      return;
    }
    render();
    if (st.turn === AI) scheduleAi();
  }

  function onTrayClick(ev) {
    if (thinking || st.over || st.turn !== HUMAN) return;
    var id = ev.currentTarget.dataset.id;
    if (selectedId === id) {
      selectedId = null;
    } else {
      selectedId = id;
      orientIndex = 0;
    }
    hintCells = null;
    clearGhost();
    render();
  }

  function onCellEnter(ev) {
    if (!selectedId || st.turn !== HUMAN || st.over || thinking) return;
    var r = parseInt(ev.currentTarget.dataset.r, 10);
    var c = parseInt(ev.currentTarget.dataset.c, 10);
    // ankkuroi hiiren ruutu palan (0,0)-soluun — parempi UX: etsi läheisin laillinen
    showGhostAt(r, c);
  }

  function onCellLeave() {
    clearGhost();
  }

  function onCellClick(ev) {
    if (!selectedId || st.turn !== HUMAN || st.over || thinking) return;
    var r = parseInt(ev.currentTarget.dataset.r, 10);
    var c = parseInt(ev.currentTarget.dataset.c, 10);
    var shape = E.piecePreview(selectedId, effectiveOrient(selectedId));

    // kokeile ankkurointia hiiren ruutuun eri muodon soluihin
    var mv = null;
    for (var i = 0; i < shape.length; i++) {
      var br = r - shape[i][0];
      var bc = c - shape[i][1];
      var trial = E.placementAt(st, selectedId, effectiveOrient(selectedId), br, bc);
      if (trial) {
        // varmista että klikattu ruutu kuuluu sijoitukseen
        var hit = false;
        for (var k = 0; k < trial.cells.length; k++) {
          if (trial.cells[k][0] === r && trial.cells[k][1] === c) { hit = true; break; }
        }
        if (hit) { mv = trial; break; }
      }
    }
    if (!mv) {
      showToast("Laiton sijoitus");
      return;
    }
    afterHumanMove(mv);
  }

  function scheduleAi() {
    thinking = true;
    render();
    clearTimers();
    aiTimer = setTimeout(runAi, 80);
  }

  function runAi() {
    var mv = E.bestMove(st, aiTimeMs());
    thinking = false;
    history.push({
      st: E.cloneState(st),
      lastCells: lastCells ? Object.assign({}, lastCells) : null,
      selectedId: null,
      orientIndex: 0
    });
    if (history.length > 40) history.shift();

    if (!mv) {
      st = E.applyMove(st, null);
      showToast("Tietokone ohittaa");
    } else {
      st = E.applyMove(st, mv);
      markLast(mv.cells);
      showToast("Tietokone: +" + mv.size);
    }
    hintCells = null;
    if (st.over) {
      winner = E.winnerOf(st);
      if (winner === HUMAN) showToast("Voitit!");
      else if (winner === AI) showToast("Tietokone voitti");
      else showToast("Tasapeli");
    }
    render();
    if (!st.over && st.turn === AI) scheduleAi();
  }

  function newGame() {
    clearTimers();
    thinking = false;
    hinting = false;
    selectedId = null;
    orientIndex = 0;
    winner = 0;
    lastCells = null;
    hintCells = null;
    history = [];
    clearGhost();
    st = E.initState(resolveStarter());
    render();
    if (st.turn === AI) scheduleAi();
    else showToast("Uusi peli");
  }

  function undo() {
    if (thinking || hinting || !history.length) return;
    clearTimers();
    thinking = false;
    var snap = history.pop();
    // jos viimeisin on AI:n jälkeinen välitila, palaa vielä yksi (ihmiseen)
    st = snap.st;
    lastCells = snap.lastCells;
    selectedId = snap.selectedId;
    orientIndex = snap.orientIndex;
    hintCells = null;
    winner = st.over ? E.winnerOf(st) : 0;
    // jos vuorossa AI heti undon jälkeen, undo vielä kerran jos mahdollista
    if (st.turn === AI && history.length && !st.over) {
      snap = history.pop();
      st = snap.st;
      lastCells = snap.lastCells;
      selectedId = snap.selectedId;
      orientIndex = snap.orientIndex;
      winner = st.over ? E.winnerOf(st) : 0;
    }
    clearGhost();
    render();
    showToast("Siirto peruttu");
  }

  function rotate() {
    if (!selectedId) return;
    orientIndex += 1;
    hintCells = null;
    clearGhost();
    render();
  }

  function flip() {
    if (!selectedId) return;
    // peilaus: hyppää orientoinneissa — allOrientations tuottaa peilatut
    var n = E.orientCount(selectedId);
    if (n <= 1) {
      showToast("Pala on symmetrinen");
      return;
    }
    // siirry peilattuun "ryhmään": yleensä n/2 jos peilit eroavat
    var half = Math.max(1, (n / 2) | 0);
    orientIndex = (orientIndex + half) % n;
    hintCells = null;
    clearGhost();
    render();
  }

  function hint() {
    if (thinking || hinting || st.over || st.turn !== HUMAN) return;
    hinting = true;
    render();
    setTimeout(function () {
      var mv = E.bestMove(st, Math.min(aiTimeMs(), 1200));
      hinting = false;
      if (!mv) {
        showToast("Ei laillisia siirtoja");
        render();
        return;
      }
      selectedId = mv.pieceId;
      var n = E.orientCount(mv.pieceId);
      orientIndex = 0;
      var minR = Infinity, minC = Infinity, i;
      for (i = 0; i < mv.cells.length; i++) {
        if (mv.cells[i][0] < minR) minR = mv.cells[i][0];
        if (mv.cells[i][1] < minC) minC = mv.cells[i][1];
      }
      var sk = mv.cells.map(function (c) {
        return (c[0] - minR) + "," + (c[1] - minC);
      }).sort().join(";");
      for (var o = 0; o < n; o++) {
        var shape = E.piecePreview(mv.pieceId, o);
        var so = shape.map(function (c) { return c[0] + "," + c[1]; }).sort().join(";");
        if (sk === so) {
          orientIndex = o;
          break;
        }
      }
      hintCells = {};
      for (var h = 0; h < mv.cells.length; h++) {
        hintCells[E.rc(mv.cells[h][0], mv.cells[h][1])] = true;
      }
      showToast("Vihje: pala " + mv.pieceId);
      render();
    }, 30);
  }

  // keyboard
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "r" || ev.key === "R") { rotate(); ev.preventDefault(); }
    if (ev.key === "f" || ev.key === "F") { flip(); ev.preventDefault(); }
  });

  els.btnRotate.addEventListener("click", rotate);
  els.btnFlip.addEventListener("click", flip);
  els.btnHint.addEventListener("click", hint);
  els.btnUndo.addEventListener("click", undo);
  els.btnNew.addEventListener("click", newGame);

  buildBoard();
  newGame();
})();
