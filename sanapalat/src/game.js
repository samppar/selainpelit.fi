// Sanapalat — selainsovellus (DOM). Ydin: globalThis.SanapalatEngine.
// Sanasto luetaan <script id="sanat" type="text/plain"> -lohkosta.
(function () {
  "use strict";
  var E = globalThis.SanapalatEngine;
  var el = function (id) { return document.getElementById(id); };
  var ov = el("ov");
  var SIZE = E.SIZE;
  function inb(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

  var WORDS = el("sanat").textContent.split("\n").filter(Boolean);
  var TRIE = null;

  var G = null; // pelitila
  var AI_DELAY = 550;
  var NAMES = ["Sinä", "Tietokone"];

  // ---- Pelin aloitus -------------------------------------------------------
  function newGame(seed) {
    var rng = E.makeRNG((seed >>> 0) || ((Math.random() * 1e9) | 0));
    var bag = E.buildBag(rng);
    G = {
      bag: bag, board: E.emptyBoard(), rng: rng,
      racks: [drawTiles(bag, 7), drawTiles(bag, 7)],
      scores: [0, 0], turn: 0,
      tentative: [], selRack: null, exchangeMode: false, exchangeSel: {},
      passes: 0, over: false, lastMove: [null, null],
      cursor: { r: 7, c: 7 }, dir: { dr: 0, dc: 1 },
    };
    el("game").classList.remove("hidden");
    closeOverlay();
    render();
    setStatus("Sinun vuorosi \u2014 lad\u00f6 sana laudalle (n\u00e4pp\u00e4imist\u00f6 tai hiiri).");
  }
  function drawTiles(bag, n) {
    var out = [];
    for (var i = 0; i < n && bag.length; i++) out.push(bag.pop());
    return out;
  }

  // ---- Renderöinti ---------------------------------------------------------
  function render() {
    renderBoard();
    renderRack();
    renderHud();
    renderControls();
  }

  function renderBoard() {
    var host = el("board");
    if (!host._built) {
      host.style.setProperty("--n", SIZE);
      host.innerHTML = "";
      for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) {
        var d = document.createElement("div");
        d.className = "cell";
        d.dataset.r = r; d.dataset.c = c;
        host.appendChild(d);
      }
      host._built = true;
      host.addEventListener("click", onBoardClick);
    }
    var tentMap = {};
    G.tentative.forEach(function (t) { tentMap[t.r + "," + t.c] = t; });
    var cells = host.children;
    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var r = +cell.dataset.r, c = +cell.dataset.c;
      var pr = E.premiumAt(r, c);
      var tile = G.board[r][c];
      var tent = tentMap[r + "," + c];
      cell.className = "cell" + premClass(pr);
      if (G.cursor && G.cursor.r === r && G.cursor.c === c && G.turn === 0 && !G.over)
        cell.classList.add("cursor");
      cell.innerHTML = "";
      if (tile) cell.appendChild(tileEl(tile.l, tile.blank, false));
      else if (tent) { var te = tileEl(tent.l, tent.blank, true); cell.appendChild(te); }
      else if (pr !== ".") { var s = document.createElement("span"); s.className = "prem"; s.textContent = premLabel(pr); cell.appendChild(s); }
    }
  }
  function premClass(p) {
    return p === "T" ? " tw" : p === "D" ? " dw" : p === "t" ? " tl" : p === "d" ? " dl" : p === "*" ? " center" : "";
  }
  function premLabel(p) {
    return p === "T" ? "3\u00d7S" : p === "D" ? "2\u00d7S" : p === "t" ? "3\u00d7K" : p === "d" ? "2\u00d7K" : p === "*" ? "\u2605" : "";
  }
  function tileEl(letter, blank, tentative) {
    var d = document.createElement("div");
    d.className = "tile" + (blank ? " blank" : "") + (tentative ? " tent" : "");
    d.innerHTML = '<span class="l">' + letter.toUpperCase() + '</span><span class="v">' + E.letterValue(letter, blank) + "</span>";
    return d;
  }

  function renderRack() {
    var host = el("rack");
    host.innerHTML = "";
    var used = {};
    G.tentative.forEach(function (t) { used[t.rackIdx] = true; });
    for (var i = 0; i < G.racks[0].length; i++) {
      var letter = G.racks[0][i];
      var slot = document.createElement("div");
      slot.className = "rslot";
      if (used[i]) { slot.classList.add("empty"); host.appendChild(slot); continue; }
      var t = tileEl(letter === "?" ? " " : letter, letter === "?", false);
      if (letter === "?") t.querySelector(".l").textContent = "";
      if (G.exchangeMode && G.exchangeSel[i]) t.classList.add("exsel");
      if (!G.exchangeMode && G.selRack === i) t.classList.add("sel");
      (function (idx) { t.onclick = function () { onRackClick(idx); }; })(i);
      slot.appendChild(t);
      host.appendChild(slot);
    }
  }

  function renderHud() {
    el("s0name").textContent = NAMES[0];
    el("s1name").textContent = NAMES[1];
    el("s0").textContent = G.scores[0];
    el("s1").textContent = G.scores[1];
    el("hudP0").classList.toggle("turn", G.turn === 0 && !G.over);
    el("hudP1").classList.toggle("turn", G.turn === 1 && !G.over);
    el("bag").textContent = G.bag.length;
    el("last0").textContent = G.lastMove[0] || "";
    el("last1").textContent = G.lastMove[1] || "";
  }

  function renderControls() {
    var myTurn = G.turn === 0 && !G.over;
    el("btnPlay").disabled = !myTurn || G.tentative.length === 0 || G.exchangeMode;
    el("btnRecall").disabled = G.tentative.length === 0;
    el("btnShuffle").disabled = !myTurn;
    el("btnExchange").disabled = !myTurn || (G.tentative.length > 0 && !G.exchangeMode) || G.bag.length === 0;
    el("btnPass").disabled = !myTurn || G.exchangeMode;
    el("btnExchange").textContent = G.exchangeMode
      ? ("Vaihda valitut (" + Object.keys(G.exchangeSel).length + ")")
      : "Vaihda";
    el("btnPass").textContent = G.exchangeMode ? "Peruuta" : "Ohita vuoro";
  }

  // ---- Vuorovaikutus -------------------------------------------------------
  function onRackClick(i) {
    if (G.turn !== 0 || G.over) return;
    if (G.exchangeMode) {
      if (G.exchangeSel[i]) delete G.exchangeSel[i]; else G.exchangeSel[i] = true;
      renderRack(); renderControls(); return;
    }
    G.selRack = (G.selRack === i ? null : i);
    renderRack();
  }

  function onBoardClick(e) {
    if (G.turn !== 0 || G.over || G.exchangeMode) return;
    var cell = e.target.closest(".cell");
    if (!cell) return;
    var r = +cell.dataset.r, c = +cell.dataset.c;
    G.cursor = { r: r, c: c };
    // klikkaa väliaikaista palaa -> palauta rackiin
    var ti = G.tentative.findIndex(function (t) { return t.r === r && t.c === c; });
    if (ti >= 0) { G.tentative.splice(ti, 1); render(); return; }
    if (G.board[r][c]) { render(); return; } // varattu — vain kursori
    if (G.selRack == null) { render(); setStatus("Valitse pala telineest\u00e4 tai kirjoita kirjain."); return; }
    placeRackAt(G.selRack, r, c);
  }

  function usedRack() {
    var used = {};
    G.tentative.forEach(function (t) { used[t.rackIdx] = true; });
    return used;
  }

  function findRackIdx(letter) {
    var used = usedRack();
    for (var i = 0; i < G.racks[0].length; i++) {
      if (!used[i] && G.racks[0][i] === letter) return i;
    }
    return -1;
  }

  function cellOccupied(r, c) {
    if (G.board[r][c]) return true;
    return G.tentative.some(function (t) { return t.r === r && t.c === c; });
  }

  function advanceCursor() {
    var r = G.cursor.r + G.dir.dr, c = G.cursor.c + G.dir.dc;
    // ohita jo täytetyt ruudut (kiinteät + väliaikaiset) saman rivin/sarakkeen suuntaan
    while (inb(r, c) && cellOccupied(r, c)) {
      r += G.dir.dr; c += G.dir.dc;
    }
    if (inb(r, c)) G.cursor = { r: r, c: c };
  }

  function placeRackAt(rackIdx, r, c) {
    if (rackIdx == null || rackIdx < 0) return false;
    if (!inb(r, c) || cellOccupied(r, c)) return false;
    var letter = G.racks[0][rackIdx];
    if (letter === "?") { pickBlank(rackIdx, r, c); return true; }
    G.tentative.push({ r: r, c: c, l: letter, blank: false, rackIdx: rackIdx });
    G.selRack = null;
    G.cursor = { r: r, c: c };
    advanceCursor();
    render();
    return true;
  }

  function pickBlank(rackIdx, r, c) {
    var alpha = "abcdefghijklmnoprstuvyäö".split("");
    var grid = alpha.map(function (L) { return '<button class="bl" data-l="' + L + '">' + L.toUpperCase() + "</button>"; }).join("");
    openOverlay('<div class="panel sm"><h2>Jokerin kirjain</h2><p>Valitse mit\u00e4 kirjainta jokeri edustaa (0 p). Voit my\u00f6s kirjoittaa kirjaimen.</p><div class="blgrid">' + grid + "</div></div>");
    function choose(L) {
      G._blankPick = null;
      G.tentative.push({ r: r, c: c, l: L, blank: true, rackIdx: rackIdx });
      G.selRack = null; G.cursor = { r: r, c: c }; advanceCursor();
      closeOverlay(); render();
    }
    ov.querySelectorAll(".bl").forEach(function (b) {
      b.onclick = function () { choose(b.dataset.l); };
    });
    G._blankPick = choose;
  }

  function recall() { G.tentative = []; G.selRack = null; render(); }

  function removeAtCursor() {
    var ti = G.tentative.findIndex(function (t) { return t.r === G.cursor.r && t.c === G.cursor.c; });
    if (ti < 0 && G.tentative.length) {
      var last = G.tentative[G.tentative.length - 1];
      G.cursor = { r: last.r, c: last.c };
      ti = G.tentative.length - 1;
    }
    if (ti < 0) return;
    G.tentative.splice(ti, 1);
    G.selRack = null;
    render();
  }

  function onKey(e) {
    if (!G || G.over) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;

    // jokerivalinta overlayssa: kirjain valitsee
    if (G._blankPick && ov.innerHTML) {
      if (k === "Escape") { e.preventDefault(); G._blankPick = null; closeOverlay(); return; }
      if (k.length === 1) {
        var bl = k.toLowerCase();
        if (/^[a-zäöå]$/.test(bl)) { e.preventDefault(); var fn = G._blankPick; G._blankPick = null; fn(bl === "å" ? "a" : bl); }
      }
      return;
    }
    if (ov.innerHTML !== "") {
      if (k === "Escape") { e.preventDefault(); closeOverlay(); }
      return;
    }
    if (G.turn !== 0) return;

    if (k === "Enter") { e.preventDefault(); if (G.exchangeMode) doExchange(); else if (G.tentative.length) submit(); return; }
    if (k === "Escape") {
      e.preventDefault();
      if (G.exchangeMode) { G.exchangeMode = false; G.exchangeSel = {}; render(); setStatus("Vaihto peruttu."); }
      else if (G.tentative.length) recall();
      return;
    }
    if (k === "Backspace") { e.preventDefault(); removeAtCursor(); return; }
    if (k === " " || k === "Spacebar") { e.preventDefault(); if (!G.tentative.length && !G.exchangeMode) shuffleRack(); return; }

    if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown") {
      e.preventDefault();
      var dr = k === "ArrowUp" ? -1 : k === "ArrowDown" ? 1 : 0;
      var dc = k === "ArrowLeft" ? -1 : k === "ArrowRight" ? 1 : 0;
      // Suunta vaihtuu vasta kun sanaa on jo alettu latoa (tai Shift painettuna).
      // Muuten nuoli vain siirtää kursoria — muuten vasemmalle meneminen
      // kääntäisi kirjoituksen väärään suuntaan.
      if (G.tentative.length > 0 || e.shiftKey) G.dir = { dr: dr, dc: dc };
      var nr = G.cursor.r + dr, nc = G.cursor.c + dc;
      if (inb(nr, nc)) G.cursor = { r: nr, c: nc };
      renderBoard();
      return;
    }

    if (k.length !== 1) return;
    var ch = k.toLowerCase();
    if (ch === "å") ch = "a";

    // vaihto-tila: kirjain merkitsee telineestä
    if (G.exchangeMode) {
      e.preventDefault();
      var want = (k === "?" || ch === "?") ? "?" : ch;
      if (want !== "?" && !/^[a-zäö]$/.test(want)) return;
      var usedX = usedRack();
      for (var xi = 0; xi < G.racks[0].length; xi++) {
        if (usedX[xi]) continue;
        if (G.racks[0][xi] === want) {
          if (G.exchangeSel[xi]) delete G.exchangeSel[xi]; else G.exchangeSel[xi] = true;
          renderRack(); renderControls(); return;
        }
      }
      return;
    }

    if (ch === "?" || k === "?") {
      e.preventDefault();
      var bi = findRackIdx("?");
      if (bi < 0) { setStatus("Ei jokeria telineess\u00e4.", true); return; }
      if (!placeRackAt(bi, G.cursor.r, G.cursor.c))
        setStatus("Ruutu on varattu \u2014 siirr\u00e4 kursoria nuolin\u00e4pp\u00e4imill\u00e4.", true);
      return;
    }
    if (!/^[a-zäö]$/.test(ch)) return;
    e.preventDefault();
    var idx = findRackIdx(ch);
    if (idx < 0) {
      setStatus("Ei palaa \"" + ch.toUpperCase() + "\" telineess\u00e4.", true);
      return;
    }
    if (!placeRackAt(idx, G.cursor.r, G.cursor.c)) {
      setStatus("Ruutu on varattu \u2014 siirr\u00e4 kursoria nuolin\u00e4pp\u00e4imill\u00e4.", true);
    }
  }

  function shuffleRack() {
    E.shuffle(G.racks[0], G.rng);
    // väliaikaisten rackIdx viittaukset menevät sekaisin -> palauta ne
    G.tentative = []; G.selRack = null; render();
  }

  function submit() {
    var placements = G.tentative.map(function (t) { return { r: t.r, c: t.c, l: t.l, blank: t.blank }; });
    var res = E.validateAndScore(G.board, placements, TRIE);
    if (!res.ok) { setStatus("\u26a0\ufe0f " + res.error, true); return; }
    applyMove(0, placements, res);
    // täydennä käsi
    var usedIdx = G.tentative.map(function (t) { return t.rackIdx; }).sort(function (a, b) { return b - a; });
    usedIdx.forEach(function (idx) { G.racks[0].splice(idx, 1); });
    G.racks[0] = G.racks[0].concat(drawTiles(G.bag, 7 - G.racks[0].length));
    G.tentative = []; G.selRack = null; G.passes = 0;
    G.lastMove[0] = res.words.map(function (w) { return w.word.toUpperCase(); }).join(", ") + " (+" + res.score + ")";
    render();
    if (checkEnd()) return;
    G.turn = 1; render();
    setStatus("Tietokone miettii\u2026");
    setTimeout(aiTurn, AI_DELAY);
  }

  function applyMove(pi, placements, res) {
    placements.forEach(function (p) { G.board[p.r][p.c] = { l: p.l, blank: p.blank }; });
    G.scores[pi] += res.score;
  }

  function aiTurn() {
    if (G.over) return;
    var mv = E.bestMove(G.board, G.racks[1], TRIE);
    if (mv) {
      applyMove(1, mv.placements, { score: mv.score });
      // poista käytetyt palat AI:n telineestä
      mv.placements.forEach(function (p) {
        var want = p.blank ? "?" : p.l;
        var idx = G.racks[1].indexOf(want);
        if (idx >= 0) G.racks[1].splice(idx, 1);
      });
      G.racks[1] = G.racks[1].concat(drawTiles(G.bag, 7 - G.racks[1].length));
      G.passes = 0;
      G.lastMove[1] = mv.words.map(function (w) { return w.word.toUpperCase(); }).join(", ") + " (+" + mv.score + ")";
      setStatus("Tietokone pelasi: " + G.lastMove[1] + ". Sinun vuorosi.");
    } else {
      // ei siirtoa: vaihda paloja jos pussissa on, muuten ohita
      if (G.bag.length > 0) {
        var n = Math.min(G.racks[1].length, G.bag.length);
        var giveBack = G.racks[1].splice(0, n);
        G.racks[1] = G.racks[1].concat(drawTiles(G.bag, n));
        giveBack.forEach(function (t) { G.bag.unshift(t); });
        E.shuffle(G.bag, G.rng);
        G.lastMove[1] = "vaihtoi paloja";
        setStatus("Tietokone vaihtoi paloja. Sinun vuorosi.");
      } else {
        G.passes++;
        G.lastMove[1] = "ohitti";
        setStatus("Tietokone ohitti vuoron. Sinun vuorosi.");
      }
    }
    G.turn = 0; render();
    checkEnd();
  }

  function doExchange() {
    if (!G.exchangeMode) {
      G.exchangeMode = true; G.exchangeSel = {}; G.selRack = null;
      setStatus("Valitse vaihdettavat palat ja paina Vaihda uudelleen.");
      render(); return;
    }
    var idxs = Object.keys(G.exchangeSel).map(Number).sort(function (a, b) { return b - a; });
    if (idxs.length === 0) { // peruuta
      G.exchangeMode = false; render(); setStatus("Vaihto peruttu."); return;
    }
    var give = [];
    idxs.forEach(function (idx) { give.push(G.racks[0][idx]); G.racks[0].splice(idx, 1); });
    G.racks[0] = G.racks[0].concat(drawTiles(G.bag, give.length));
    give.forEach(function (t) { G.bag.unshift(t); });
    E.shuffle(G.bag, G.rng);
    G.exchangeMode = false; G.exchangeSel = {}; G.passes++;
    G.lastMove[0] = "vaihtoi " + give.length + " palaa";
    render();
    if (checkEnd()) return;
    G.turn = 1; render(); setStatus("Tietokone miettii\u2026"); setTimeout(aiTurn, AI_DELAY);
  }

  function pass() {
    if (G.exchangeMode) { G.exchangeMode = false; G.exchangeSel = {}; render(); setStatus("Vaihto peruttu."); return; }
    G.passes++; G.lastMove[0] = "ohitti"; recall();
    if (checkEnd()) return;
    G.turn = 1; render(); setStatus("Tietokone miettii\u2026"); setTimeout(aiTurn, AI_DELAY);
  }

  // ---- Pelin loppu ---------------------------------------------------------
  function rackValue(rack) {
    var s = 0; rack.forEach(function (t) { s += t === "?" ? 0 : (E.VALUES[t] || 0); }); return s;
  }
  function checkEnd() {
    var out = G.bag.length === 0 && (G.racks[0].length === 0 || G.racks[1].length === 0);
    var stalled = G.passes >= 4;
    if (!out && !stalled) return false;
    G.over = true;
    var r0 = rackValue(G.racks[0]), r1 = rackValue(G.racks[1]);
    G.scores[0] -= r0; G.scores[1] -= r1;
    if (G.racks[0].length === 0) G.scores[0] += r1;
    if (G.racks[1].length === 0) G.scores[1] += r0;
    var win = G.scores[0] === G.scores[1] ? -1 : (G.scores[0] > G.scores[1] ? 0 : 1);
    render();
    var title = win < 0 ? "Tasapeli!" : (win === 0 ? "Voitit! \ud83c\udf89" : "Tietokone voitti");
    openOverlay('<div class="panel"><h2>' + title + '</h2>' +
      '<div class="endrow"><span>' + NAMES[0] + '</span><b>' + G.scores[0] + '</b></div>' +
      '<div class="endrow"><span>' + NAMES[1] + '</span><b>' + G.scores[1] + '</b></div>' +
      '<p style="margin-top:10px">Jäljelle jääneet palat vähennettiin pisteistä.</p>' +
      '<button class="primary" id="endNew">Uusi peli</button></div>');
    el("endNew").onclick = function () { newGame(); };
    return true;
  }

  // ---- Overlayt & status ---------------------------------------------------
  function openOverlay(html, onBackdrop) {
    ov.innerHTML = '<div class="overlay">' + html + "</div>";
    var o = ov.querySelector(".overlay");
    if (onBackdrop) o.onclick = function (e) { if (e.target === o) onBackdrop(); };
  }
  function closeOverlay() { ov.innerHTML = ""; }
  var statusTimer = null;
  function setStatus(msg, warn) {
    var s = el("status"); s.textContent = msg; s.className = "status" + (warn ? " warn" : "");
    if (warn) { clearTimeout(statusTimer); statusTimer = setTimeout(function () { if (G && G.turn === 0) s.className = "status"; }, 3200); }
  }

  function openRules() {
    openOverlay('<div class="panel"><h2>S\u00e4\u00e4nn\u00f6t</h2><ul class="rules-list">' +
      "<li>Lad\u00f6 paloja telineest\u00e4 laudalle muodostaen suomen sanoja (vaaka/pysty).</li>" +
      "<li><b>Aloitussana</b> on asetettava keskiruudun (\u2605) kautta \u2014 se on <b>kaksinkertainen sana</b>.</li>" +
      "<li>Uusien sanojen on <b>liityt\u00e4v\u00e4</b> laudalla oleviin paloihin. Kaikkien syntyvien sanojen on oltava kelvollisia.</li>" +
      "<li>Bonusruudut: <b>2\u00d7K/3\u00d7K</b> kaksin-/kolminkertainen kirjain, <b>2\u00d7S/3\u00d7S</b> sana. Bonus vain uusille paloille.</li>" +
      "<li>Kaikki 7 palaa kerralla = <b>+50 bonus</b>.</li>" +
      "<li>Jokeri (tyhj\u00e4 pala) on 0 p ja edustaa mit\u00e4 tahansa kirjainta.</li>" +
      "<li>Voit <b>vaihtaa</b> paloja tai <b>ohittaa</b> vuoron. Peli p\u00e4\u00e4ttyy kun pussi on tyhj\u00e4 ja toisen teline tyhjenee.</li>" +
      "<li><b>N\u00e4pp\u00e4imist\u00f6:</b> nuolet siirt\u00e4v\u00e4t kursoria, kirjain asettaa palan, Backspace poistaa, Enter pelaa, Esc palauttaa, v\u00e4lily\u00f6nti sekoittaa.</li>" +
      "</ul><button class=\"primary\" id=\"rClose\">Selv\u00e4</button></div>", closeOverlay);
    el("rClose").onclick = closeOverlay;
  }

  // ---- Sidonta -------------------------------------------------------------
  el("btnPlay").onclick = submit;
  el("btnRecall").onclick = recall;
  el("btnShuffle").onclick = shuffleRack;
  el("btnExchange").onclick = doExchange;
  el("btnPass").onclick = pass;
  el("btnNew").onclick = function () { newGame(); };
  el("btnRules").onclick = openRules;
  document.addEventListener("keydown", onKey);

  setTimeout(function () {
    TRIE = E.buildTrie(WORDS);
    el("loading").style.display = "none";
    newGame();
  }, 30);
})();
