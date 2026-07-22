// Mylly — selainsovellus (DOM). Ydin: globalThis.MyllyEngine.
(function () {
  "use strict";
  var E = globalThis.MyllyEngine;
  var HUMAN = E.HUMAN;
  var AI = E.AI;

  var S = 560;
  var M = 50;
  var G = (S - 2 * M) / 6;
  function px(c) { return M + c * G; }

  var els = {
    boardSvg: document.getElementById("boardSvg"),
    points: document.getElementById("points"),
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
    btnNew: document.getElementById("btnNew")
  };

  var pointButtons = [];
  var st = null;
  var selected = -1;
  var removing = null; // { from, to } odottaa poistoa; lautaa ei vielä muutettu
  var winner = 0;
  var lastMove = null;
  var history = [];
  var hint = null;
  var thinking = false;
  var hinting = false;
  var eatenAt = -1;
  var aiTimer = null;
  var eatenTimer = null;
  var nextAltStarter = HUMAN;

  function clearTimers() {
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    if (eatenTimer) { clearTimeout(eatenTimer); eatenTimer = null; }
  }

  function aiTimeMs() {
    return parseInt(els.difficulty.value, 10) || 1200;
  }

  function resolveStarter() {
    var mode = els.starter.value;
    if (mode === "human") return HUMAN;
    if (mode === "computer") return AI;
    var s = nextAltStarter;
    nextAltStarter = E.opp(nextAltStarter);
    return s;
  }

  function displayBoard() {
    var b = st.board.slice();
    if (removing) {
      if (removing.from >= 0) b[removing.from] = 0;
      b[removing.to] = st.turn;
    }
    return b;
  }

  function displayStock(p) {
    var n = st.toPlace[p - 1];
    if (removing && removing.from < 0 && st.turn === p) n = Math.max(0, n - 1);
    return n;
  }

  function phaseLabel() {
    if (winner) return "Peli päättyi";
    if (removing) return "Mylly";
    return E.phaseOf(st) === "place" ? "Asetteluvaihe" : "Siirtovaihe";
  }

  function statusMessage() {
    if (winner) {
      return winner === HUMAN
        ? "Voitit — vastustajalla ei ole enää mahdollisuutta."
        : "Tietokone voitti.";
    }
    if (eatenAt >= 0) {
      return "Tietokone söi nappulasi risteyksestä " + (eatenAt + 1) + ".";
    }
    if (thinking) return "Tietokone miettii siirtoaan…";
    if (removing) {
      return "Teit myllyn. Poista tietokoneen nappula.";
    }
    if (E.isPlacing(st)) {
      return (st.turn === HUMAN ? "Sinun vuorosi" : "Tietokoneen vuoro") +
        ": aseta nappula tyhjään risteykseen.";
    }
    if (E.canFly(st, st.turn)) {
      return (st.turn === HUMAN ? "Sinun vuorosi" : "Tietokoneen vuoro") +
        ": lennä tyhjään risteykseen.";
    }
    return (st.turn === HUMAN ? "Sinun vuorosi" : "Tietokoneen vuoro") +
      ": valitse nappula ja siirrä se viereen.";
  }

  function pushHistory() {
    history.push({
      st: E.cloneState(st),
      removing: removing ? { from: removing.from, to: removing.to } : null,
      winner: winner,
      lastMove: lastMove
    });
    if (history.length > 100) history.shift();
  }

  function finishMove(mv) {
    pushHistory();
    var prevTurn = st.turn;
    var next = E.applyMove(st, mv);
    lastMove = mv;
    selected = -1;
    removing = null;
    hint = null;
    eatenAt = -1;

    if (E.isLoss(next)) {
      winner = prevTurn;
      st = next;
      render();
      return;
    }
    st = next;
    render();
  }

  function scheduleAi() {
    if (winner || thinking || removing || st.turn !== AI || aiTimer) return;
    thinking = true;
    render();
    aiTimer = setTimeout(function () {
      aiTimer = null;
      var mv = E.bestMove(st, aiTimeMs());
      thinking = false;
      if (!mv || winner || st.turn !== AI) {
        render();
        return;
      }
      if (mv.remove >= 0) {
        pushHistory();
        var mid = E.cloneState(st);
        if (mv.from < 0) mid.toPlace[AI - 1]--;
        else mid.board[mv.from] = 0;
        mid.board[mv.to] = AI;
        st = mid;
        lastMove = { from: mv.from, to: mv.to, remove: -1 };
        eatenAt = mv.remove;
        thinking = true;
        render();
        eatenTimer = setTimeout(function () {
          eatenTimer = null;
          var after = E.cloneState(st);
          after.board[mv.remove] = 0;
          after.turn = HUMAN;
          lastMove = mv;
          eatenAt = -1;
          thinking = false;
          if (E.isLoss(after)) {
            winner = AI;
            st = after;
            render();
            return;
          }
          st = after;
          render();
        }, 900);
        return;
      }
      finishMove(mv);
    }, 70);
  }

  function clickPoint(i) {
    if (winner || thinking || st.turn !== HUMAN) return;

    if (removing) {
      var ghost = displayBoard();
      var rem = E.removables(ghost, AI);
      if (ghost[i] === AI && rem.indexOf(i) >= 0) {
        finishMove({ from: removing.from, to: removing.to, remove: i });
      }
      return;
    }

    if (E.isPlacing(st)) {
      if (st.board[i] !== 0) return;
      var trial = st.board.slice();
      trial[i] = HUMAN;
      if (E.inMill(trial, i, HUMAN) && E.removables(trial, AI).length > 0) {
        selected = -1;
        removing = { from: -1, to: i };
        hint = null;
        render();
        return;
      }
      finishMove({ from: -1, to: i, remove: -1 });
      return;
    }

    if (st.board[i] === HUMAN) {
      selected = selected === i ? -1 : i;
      hint = null;
      render();
      return;
    }

    if (selected >= 0 && st.board[i] === 0) {
      var targets = E.legalTargets(st, selected);
      if (targets.indexOf(i) < 0) return;
      var b2 = st.board.slice();
      b2[selected] = 0;
      b2[i] = HUMAN;
      if (E.inMill(b2, i, HUMAN) && E.removables(b2, AI).length > 0) {
        removing = { from: selected, to: i };
        selected = -1;
        hint = null;
        render();
        return;
      }
      finishMove({ from: selected, to: i, remove: -1 });
    }
  }

  function showHint() {
    if (winner || thinking || hinting || removing || st.turn !== HUMAN) return;
    hinting = true;
    render();
    setTimeout(function () {
      hint = E.bestMove(st, aiTimeMs());
      hinting = false;
      render();
    }, 20);
  }

  function undo() {
    if (thinking || history.length === 0) return;
    clearTimers();
    thinking = false;
    eatenAt = -1;
    hint = null;
    selected = -1;

    if (removing) {
      removing = null;
      render();
      return;
    }

    var snap = history.pop();
    while (snap && snap.st.turn !== HUMAN && !snap.removing && history.length > 0) {
      snap = history.pop();
    }
    if (!snap) {
      render();
      return;
    }
    st = snap.st;
    removing = snap.removing;
    winner = 0;
    lastMove = snap.lastMove;
    if (st.turn !== HUMAN && !removing && history.length > 0) {
      snap = history.pop();
      st = snap.st;
      removing = snap.removing;
      lastMove = snap.lastMove;
    }
    render();
  }

  function resetGame() {
    clearTimers();
    thinking = false;
    hinting = false;
    eatenAt = -1;
    selected = -1;
    removing = null;
    winner = 0;
    lastMove = null;
    history = [];
    hint = null;
    st = E.initState(resolveStarter());
    render();
  }

  function createBoard() {
    var lines = "";
    for (var r = 0; r < 3; r++) {
      var x = px(r);
      var w = (6 - 2 * r) * G;
      lines += '<rect x="' + x + '" y="' + x + '" width="' + w + '" height="' + w +
        '" fill="none" stroke="#c9a876" stroke-width="3" opacity="0.85"/>';
    }
    var segs = [[3, 0, 3, 2], [3, 4, 3, 6], [0, 3, 2, 3], [4, 3, 6, 3]];
    for (var s = 0; s < segs.length; s++) {
      var a = segs[s];
      lines += '<line x1="' + px(a[0]) + '" y1="' + px(a[1]) +
        '" x2="' + px(a[2]) + '" y2="' + px(a[3]) +
        '" stroke="#c9a876" stroke-width="3" opacity="0.85"/>';
    }
    els.boardSvg.innerHTML = lines;
    els.boardSvg.setAttribute("viewBox", "0 0 " + S + " " + S);

    for (var i = 0; i < 24; i++) {
      var c = E.COORD[i];
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "point";
      btn.style.left = ((px(c[0]) / S) * 100) + "%";
      btn.style.top = ((px(c[1]) / S) * 100) + "%";
      btn.dataset.index = String(i);
      btn.addEventListener("click", (function (idx) {
        return function () { clickPoint(idx); };
      })(i));
      els.points.appendChild(btn);
      pointButtons.push(btn);
    }
  }

  function render() {
    var board = displayBoard();
    var remSet = null;
    if (removing) remSet = E.removables(board, AI);
    else if (eatenAt >= 0) remSet = [eatenAt];

    var targets = [];
    if (!winner && !thinking && st.turn === HUMAN && !removing) {
      if (E.isPlacing(st)) targets = E.emptyCells(st);
      else if (selected >= 0) targets = E.legalTargets(st, selected);
    }

    for (var i = 0; i < 24; i++) {
      var btn = pointButtons[i];
      var owner = board[i];
      var cls = ["point"];
      if (owner === HUMAN) cls.push("piece", "light");
      else if (owner === AI) cls.push("piece", "dark");
      if (selected === i) cls.push("selected");
      if (targets.indexOf(i) >= 0) {
        cls.push(E.isPlacing(st) ? "place-target" : "legal-target");
      }
      if (remSet && remSet.indexOf(i) >= 0) cls.push("removable");
      if (eatenAt === i) cls.push("eaten");
      if (lastMove && (lastMove.to === i || lastMove.from === i) && eatenAt < 0 && !removing) {
        cls.push("last");
      }
      if (hint) {
        if (hint.from === i) cls.push("hint-from");
        if (hint.to === i) cls.push("hint-to");
        if (hint.remove === i) cls.push("hint-remove");
      }
      btn.className = cls.join(" ");
      btn.disabled = Boolean(winner || thinking);
      var label = "Risteys " + (i + 1);
      if (owner === HUMAN) label += ", vaalea nappula";
      else if (owner === AI) label += ", tumma nappula";
      else label += ", tyhjä";
      btn.setAttribute("aria-label", label);
    }

    els.phase.textContent = phaseLabel();
    els.message.textContent = statusMessage();
    els.message.className = "message" +
      (winner || removing || eatenAt >= 0 ? (winner ? " win" : " alert") : "");

    els.lightStats.textContent =
      displayStock(HUMAN) + " varastossa, " +
      E.count(board, HUMAN) + " laudalla";
    els.darkStats.textContent =
      displayStock(AI) + " varastossa, " +
      E.count(board, AI) + " laudalla";

    els.playerLight.classList.toggle("active", st.turn === HUMAN && !winner);
    els.playerDark.classList.toggle("active", (st.turn === AI || thinking) && !winner);

    els.btnUndo.disabled = thinking || (history.length === 0 && !removing);
    els.btnHint.disabled = winner || thinking || hinting || removing || st.turn !== HUMAN;
    els.btnHint.textContent = hinting ? "Lasketaan…" : "Vihje";

    scheduleAi();
  }

  els.btnNew.addEventListener("click", resetGame);
  els.btnUndo.addEventListener("click", undo);
  els.btnHint.addEventListener("click", showHint);
  els.starter.addEventListener("change", resetGame);

  createBoard();
  resetGame();
})();
