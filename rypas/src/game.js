// Rypäs — selainsovellus (DOM). Ydin: globalThis.RypasEngine.
(function () {
  "use strict";
  var E = globalThis.RypasEngine;
  var el = function (id) { return document.getElementById(id); };

  var NAMES = ["Sinä", "Tietokone"];
  var AI_DELAY = 650;

  var G = null;
  var snap = null; // vuoron alku
  var workBoard = null;
  var workRack = null;
  var pool = []; // pöydältä puretut (työalue)
  var sel = {}; // id -> true
  var selSet = null;
  var busy = false;

  function toast(msg) {
    var t = el("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._tm);
    toast._tm = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  function setStatus(msg, kind) {
    var s = el("status");
    s.textContent = msg || "";
    s.className = "status" + (kind ? " " + kind : "");
  }

  function openOverlay(html) {
    el("ovBody").innerHTML = html;
    el("ov").classList.remove("hidden");
  }
  function closeOverlay() {
    el("ov").classList.add("hidden");
  }

  function startScreen() {
    var rackOpts = E.RACK_SIZE_CHOICES.map(function (n) {
      var checked = n === E.RACK_SIZE ? " checked" : "";
      return "<label><input type=\"radio\" name=\"rack\" value=\"" + n + "\"" + checked + "> " + n + "</label>";
    }).join("");
    openOverlay(
      "<h2>Rypäs</h2>" +
      "<p class=\"lead\">Muodosta numerorypäitä, tyhjennä telineesi ja kerää ottelupisteitä — ensimmäinen " + E.MATCH_TARGET + " pisteeseen voittaa.</p>" +
      "<p>Ryhmä = sama numero, eri värit (3–4). Jono = sama väri, peräkkäiset (≥3). Avaus ≥30 pistettä.</p>" +
      "<div class=\"field-label\">Aloituspalat telineeseen</div>" +
      "<div class=\"diff\">" + rackOpts + "</div>" +
      "<div class=\"field-label\">Vaikeus</div>" +
      "<div class=\"diff\">" +
      "<label><input type=\"radio\" name=\"diff\" value=\"helppo\"> Helppo</label>" +
      "<label><input type=\"radio\" name=\"diff\" value=\"normaali\" checked> Normaali</label>" +
      "</div>" +
      "<div class=\"ov-actions\">" +
      "<button class=\"go\" id=\"ovStart\">Aloita peli</button>" +
      "<button class=\"ghost\" id=\"ovRules\">Säännöt</button>" +
      "</div>"
    );
    el("ovStart").onclick = function () {
      var d = document.querySelector("input[name=diff]:checked");
      var r = document.querySelector("input[name=rack]:checked");
      newGame({
        difficulty: d ? d.value : "normaali",
        rackSize: r ? +r.value : E.RACK_SIZE,
      });
    };
    el("ovRules").onclick = showRules;
  }

  function showRules() {
    openOverlay(
      "<h2>Säännöt</h2>" +
      "<ul>" +
      "<li><strong>Ottelu:</strong> pelataan eriä, kunnes joku saavuttaa " + E.MATCH_TARGET + " pistettä.</li>" +
      "<li><strong>Erä:</strong> tyhjennä telineesi ensimmäisenä — saat vastustajan jäljellä olevat pisteet (hänelle miinus).</li>" +
      "<li><strong>Aloitus:</strong> valitse montako palaa kumpikin saa telineeseen (7, 10 tai 14).</li>" +
      "<li><strong>Ryhmä:</strong> sama numero, eri värit, 3–4 palaa.</li>" +
      "<li><strong>Jono:</strong> sama väri, peräkkäiset numerot, vähintään 3.</li>" +
      "<li><strong>Jokerit</strong> korvaavat minkä tahansa palan. Kädessä jokerin sakko on 30.</li>" +
      "<li><strong>Avaus:</strong> ensimmäisellä siirrolla vähintään 30 pistettä omista paloista (pöytää ei saa vielä järjestellä).</li>" +
      "<li>Avauksen jälkeen voit purkaa ja järjestellä pöydän rypäitä, kunhan vuoron lopussa kaikki rypäät kelpaavat ja olet pelannut vähintään yhden uuden palan.</li>" +
      "<li>Jos et pelaa, <strong>nosta</strong> yksi pala.</li>" +
      "</ul>" +
      "<div class=\"ov-actions\">" +
      "<button class=\"go\" id=\"ovBack\">Takaisin</button>" +
      "</div>"
    );
    el("ovBack").onclick = function () {
      if (G && !G.over) closeOverlay();
      else startScreen();
    };
  }

  function newGame(opts) {
    G = E.newGame(opts || {});
    busy = false;
    el("game").classList.remove("hidden");
    closeOverlay();
    beginHumanTurn();
    setStatus("Sinun vuorosi — valitse paloja ja muodosta rypäs (avaus ≥30 p).");
    toast(G.round > 1
      ? "Erä " + G.round + " — tyhjennä telineesi!"
      : "Ottelu " + G.matchTarget + " pisteeseen — tyhjennä telineesi!");
  }

  // Agentti-/smoke-testaus: window.RypasUI.newGame({ seed: 3 })
  globalThis.RypasUI = {
    newGame: newGame,
    startScreen: startScreen,
  };

  function startFromQuery() {
    var m = /(?:\?|&)seed=(\d+)/.exec(location.search || "");
    if (m) {
      newGame({ seed: +m[1], difficulty: "normaali" });
      return;
    }
    startScreen();
  }

  function beginHumanTurn() {
    snap = {
      board: E.cloneBoard(G.board),
      rack: G.racks[0].map(E.cloneTile),
    };
    workBoard = E.cloneBoard(G.board);
    workRack = G.racks[0].map(E.cloneTile);
    pool = [];
    sel = {};
    selSet = null;
    render();
  }

  function selectedTiles() {
    var out = [];
    workRack.forEach(function (t) { if (sel[t.id]) out.push(t); });
    pool.forEach(function (t) { if (sel[t.id]) out.push(t); });
    return out;
  }

  function removeSelectedFromSources() {
    var ids = sel;
    workRack = workRack.filter(function (t) { return !ids[t.id]; });
    pool = pool.filter(function (t) { return !ids[t.id]; });
    sel = {};
  }

  function tileEl(t, clickable) {
    var d = document.createElement("div");
    var cls = "tile" + (t.joker ? " joker" : " " + t.color);
    if (sel[t.id]) cls += " selected";
    if (clickable) cls += " clickable";
    d.className = cls;
    d.dataset.id = t.id;
    if (t.joker) {
      d.innerHTML = '<span class="v">☺</span><span class="c">jokeri</span>';
      d.title = "Jokeri";
    } else {
      d.innerHTML = '<span class="v">' + t.value + '</span><span class="c">' +
        (E.COLOR_NAMES[t.color] || "") + "</span>";
      d.title = t.value + " " + (E.COLOR_NAMES[t.color] || "");
    }
    if (clickable) {
      d.onclick = function (e) {
        e.stopPropagation();
        if (busy || G.turn !== 0 || G.over) return;
        sel[t.id] = !sel[t.id];
        render();
      };
    }
    return d;
  }

  function render() {
    renderHud();
    renderGoal();
    renderTable();
    renderPool();
    renderRack();
    renderControls();
  }

  function renderHud() {
    for (var p = 0; p < 2; p++) {
      var hud = el("hudP" + p);
      hud.className = "pscore" + (G.turn === p && !G.over ? " turn" : "");
      el("s" + p + "name").textContent = NAMES[p];
      el("m" + p).textContent = G.matchScores[p];
      el("s" + p).textContent = G.racks[p].length;
      var la = G.lastAction[p];
      var lm = el("last" + p);
      if (!la) lm.textContent = G.hasMelded[p] ? "Avattu" : "Ei avattu";
      else if (la.type === "draw") lm.textContent = "Nosti";
      else if (la.type === "pass") lm.textContent = "Ohitti";
      else if (la.type === "play") lm.textContent = "Pelasi " + la.count;
    }
    if (G.turn === 0 && !G.over) el("s0").textContent = workRack.length;
    el("bag").textContent = G.bag.length;
  }

  function renderGoal() {
    var g = el("goal");
    var matchLine = "<strong>Ottelu " + G.matchTarget + " p</strong> · Erä " + G.round +
      " · " + G.matchScores[0] + "–" + G.matchScores[1];
    if (G.over) {
      g.innerHTML = matchLine + (G.matchOver ? " · <strong>Ottelu ohi</strong>" : " · <strong>Erä ohi</strong>");
      return;
    }
    var meld = G.hasMelded[0]
      ? '<span class="meld-ok">Avaus tehty</span>'
      : '<span class="meld-need">Avaus ≥' + E.INITIAL_MELD + " p</span>";
    g.innerHTML = matchLine + " · " + meld +
      " · Vuoro: <strong>" + NAMES[G.turn] + "</strong>";
  }

  function renderTable() {
    var host = el("table");
    host.innerHTML = "";
    host.className = "table";
    if (!workBoard.length) {
      host.classList.add("empty-hint");
      host.textContent = "Pöytä tyhjä — muodosta ensimmäinen rypäs telineestä.";
      return;
    }
    workBoard.forEach(function (set, idx) {
      var row = document.createElement("div");
      row.className = "set" + (selSet === idx ? " selected" : "");
      set.forEach(function (t) { row.appendChild(tileEl(t, false)); });
      var actions = document.createElement("div");
      actions.className = "set-actions";
      var canBreak = G.hasMelded[0] || isNewSet(idx);
      if (canBreak && G.turn === 0 && !G.over && !busy) {
        var b = document.createElement("button");
        b.textContent = "Pura";
        b.onclick = function (e) {
          e.stopPropagation();
          breakSet(idx);
        };
        actions.appendChild(b);
      }
      row.appendChild(actions);
      row.onclick = function () {
        if (busy || G.turn !== 0 || G.over) return;
        onSetClick(idx);
      };
      host.appendChild(row);
    });
  }

  function isNewSet(idx) {
    var sig = workBoard[idx].map(function (t) { return t.id; }).sort(function (a, b) { return a - b; }).join(",");
    for (var i = 0; i < snap.board.length; i++) {
      var s2 = snap.board[i].map(function (t) { return t.id; }).sort(function (a, b) { return a - b; }).join(",");
      if (s2 === sig) return false;
    }
    return true;
  }

  function breakSet(idx) {
    var set = workBoard[idx];
    workBoard.splice(idx, 1);
    set.forEach(function (t) { pool.push(t); });
    selSet = null;
    setStatus("Rypäs purettu työalueelle — muodosta uudet rypäät.");
    render();
  }

  function onSetClick(idx) {
    if (busy || G.turn !== 0 || G.over) return;
    var tiles = selectedTiles();
    if (tiles.length) {
      if (!G.hasMelded[0] && !isNewSet(idx)) {
        setStatus("Ennen avausta et voi lisätä pöydän vanhoihin rypäisiin.", "warn");
        toast("Tee ensin oma avaus (≥30 p)");
        return;
      }
      var trial = workBoard[idx].concat(tiles);
      if (!E.isValidSet(trial)) {
        setStatus("Valitut palat eivät sovi tähän rypääseen.", "warn");
        toast("Ei sovi rypääseen");
        return;
      }
      workBoard[idx] = trial;
      removeSelectedFromSources();
      selSet = null;
      setStatus("Palat lisätty rypääseen.");
      toast("+" + tiles.length + " palaa rypääseen");
      render();
      return;
    }
    selSet = selSet === idx ? null : idx;
    render();
  }

  function renderPool() {
    var wrap = el("poolWrap");
    if (!pool.length && !(G.hasMelded[0] && G.turn === 0)) {
      wrap.classList.add("hidden");
      return;
    }
    wrap.classList.remove("hidden");
    var host = el("pool");
    host.innerHTML = "";
    host.dataset.empty = "Työalue tyhjä";
    pool.forEach(function (t) { host.appendChild(tileEl(t, G.turn === 0 && !busy)); });
  }

  function renderRack() {
    var host = el("rack");
    host.innerHTML = "";
    host.dataset.empty = "Teline tyhjä — voitit?";
    var sorted = E.sortRack(workRack);
    // pidä workRack-järjestys synkassa sorttauksen kanssa vain näytössä
    sorted.forEach(function (t) {
      host.appendChild(tileEl(t, G.turn === 0 && !G.over && !busy));
    });
  }

  function renderControls() {
    var human = G.turn === 0 && !G.over && !busy;
    el("btnForm").disabled = !human || selectedTiles().length < 3;
    el("btnConfirm").disabled = !human;
    el("btnReset").disabled = !human;
    el("btnDraw").disabled = !human;
  }

  function formSet() {
    var tiles = selectedTiles();
    if (tiles.length < 3) {
      setStatus("Valitse vähintään 3 palaa.", "warn");
      return;
    }
    if (!E.isValidSet(tiles)) {
      setStatus("Valinta ei ole kelvollinen ryhmä eikä jono.", "warn");
      toast("Ei kelvollinen rypäs");
      return;
    }
    workBoard.push(tiles.map(E.cloneTile));
    removeSelectedFromSources();
    setStatus("Rypäs muodostettu — vahvista vuoro tai jatka.");
    toast("Rypäs valmis (" + tiles.length + ")");
    render();
  }

  function resetTurn() {
    workBoard = E.cloneBoard(snap.board);
    workRack = snap.rack.map(E.cloneTile);
    pool = [];
    sel = {};
    selSet = null;
    setStatus("Vuoro palautettu.");
    render();
  }

  function confirmTurn() {
    if (pool.length) {
      setStatus("Työalueella on vielä paloja — muodosta niistä rypäät tai pura takaisin.", "warn");
      toast("Tyhjennä työalue ensin");
      return;
    }
    var res = E.validatePlay(
      { board: snap.board, racks: [snap.rack, G.racks[1]], turn: 0, hasMelded: G.hasMelded },
      workBoard,
      workRack
    );
    if (!res.ok) {
      setStatus(res.error, "warn");
      toast(res.error);
      return;
    }
    // Synkaa G:n rack[0] snapista ennen applya
    G.board = E.cloneBoard(snap.board);
    G.racks[0] = snap.rack.map(E.cloneTile);
    var applied = E.applyPlay(G, workBoard, workRack);
    if (!applied.ok) {
      setStatus(applied.error, "warn");
      return;
    }
    toast(applied.won ? "Tyhjensit telineen — voitit!" : "Pelasit " + applied.played.length + " palaa");
    if (G.over) {
      endGame();
      return;
    }
    setStatus("Tietokoneen vuoro…");
    render();
    busy = true;
    setTimeout(runAI, AI_DELAY);
  }

  function doDraw() {
    if (pool.length) {
      setStatus("Palauta työalue ennen nostoa (tai vahvista siirto).", "warn");
      return;
    }
    // Palauta työpöytä ennen nostoa
    G.board = E.cloneBoard(snap.board);
    G.racks[0] = snap.rack.map(E.cloneTile);
    E.drawOne(G);
    toast("Nostit palan");
    setStatus("Tietokoneen vuoro…");
    render();
    busy = true;
    setTimeout(runAI, AI_DELAY);
  }

  function runAI() {
    if (G.over) { busy = false; endGame(); return; }
    var before = G.racks[1].length;
    var res = E.aiTurn(G);
    busy = false;
    if (res && res.drew) toast("Tietokone nosti");
    else if (res && res.played) toast("Tietokone pelasi " + res.played.length + " palaa");
    else if (res && res.ok && !res.drew) {
      var after = G.racks[1].length;
      if (after < before) toast("Tietokone pelasi " + (before - after) + " palaa");
    }
    if (G.over) { endGame(); return; }
    beginHumanTurn();
    setStatus("Sinun vuorosi.");
  }

  function fmtDelta(n) {
    return (n > 0 ? "+" : "") + n;
  }

  function endGame() {
    E.settleRound(G);
    render();
    var roundMsg;
    if (G.winner === 0) roundMsg = "Tyhjensit telineesi — voitit erän.";
    else if (G.winner === 1) roundMsg = "Tietokone tyhjensi telineensä.";
    else roundMsg = "Erä päättyi tasapeliin (pussi / telineet).";

    var scoreLine = "Erä: " + fmtDelta(G.scores[0]) + " / " + fmtDelta(G.scores[1]) +
      " · Ottelu: <strong>" + G.matchScores[0] + "–" + G.matchScores[1] + "</strong> / " + G.matchTarget;

    if (G.matchOver) {
      var title = G.matchWinner === 0 ? "Otteluvoititto!" : G.matchWinner === 1 ? "Otteluhäviö" : "Ottelutasapeli";
      var lead = G.matchWinner === 0
        ? "Saavutit " + G.matchTarget + " pistettä."
        : G.matchWinner === 1
          ? "Tietokone ehti " + G.matchTarget + " pisteeseen."
          : "Molemmilla sama pistemäärä.";
      openOverlay(
        "<h2>" + title + "</h2>" +
        "<p class=\"lead\">" + lead + "</p>" +
        "<p>" + roundMsg + "</p>" +
        "<p>" + scoreLine + "</p>" +
        "<div class=\"ov-actions\">" +
        "<button class=\"go\" id=\"ovAgain\">Uusi ottelu</button>" +
        "</div>"
      );
      el("ovAgain").onclick = function () { startScreen(); };
      return;
    }

    openOverlay(
      "<h2>Erä " + G.round + " ohi</h2>" +
      "<p class=\"lead\">" + roundMsg + "</p>" +
      "<p>" + scoreLine + "</p>" +
      "<p>Jatketaan, kunnes joku saavuttaa " + G.matchTarget + " pistettä.</p>" +
      "<div class=\"ov-actions\">" +
      "<button class=\"go\" id=\"ovNext\">Seuraava erä</button>" +
      "<button class=\"ghost\" id=\"ovQuit\">Lopeta ottelu</button>" +
      "</div>"
    );
    el("ovNext").onclick = function () {
      var next = E.nextRound(G);
      if (!next) { startScreen(); return; }
      G = next;
      busy = false;
      closeOverlay();
      beginHumanTurn();
      setStatus("Erä " + G.round + " — sinun vuorosi.");
      toast("Erä " + G.round);
    };
    el("ovQuit").onclick = function () { startScreen(); };
  }

  // ---- Bindings ------------------------------------------------------------
  el("btnForm").onclick = formSet;
  el("btnConfirm").onclick = confirmTurn;
  el("btnReset").onclick = resetTurn;
  el("btnDraw").onclick = doDraw;
  el("btnRules").onclick = showRules;
  el("btnNew").onclick = function () { startScreen(); };

  startFromQuery();
})();
