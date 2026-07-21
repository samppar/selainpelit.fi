// Sanaseppä — selainsovellus (DOM). Ydin: globalThis.SanaseppaEngine (engine.js).
// Sanasto luetaan <script id="sanat" type="text/plain"> -lohkosta.
//
// 1 ihminen + 0–3 tietokonevastustajaa yhdellä jaetulla laudalla ja pussilla.
// Vuorojärjestys: Sinä → Kone 1 → … → takaisin. Laatat asetetaan napauttamalla:
// valitse laatta telineeltä, napauta tyhjää ruutua; napauta asetettua (ei vielä
// vahvistettua) laattaa palauttaaksesi sen.
//
// Suunnittelu nojaa pelaajien arvostamiin asioihin (SDT, flow, epävarmuus/
// läheltä piti, ESA:n motivaatioklusterit) — ks. README.md tutkimustaulukko.
(function () {
  "use strict";
  var E = globalThis.SanaseppaEngine;
  var el = function (id) { return document.getElementById(id); };
  var ov = el("ov");

  var WORDS = el("sanat").textContent.split("\n").filter(Boolean);
  var TRIE = null;

  var SIZE = E.SIZE, BLANK = E.BLANK;
  function rackSize() { return (S && S.cfg && S.cfg.rackSize) || E.RACK; }
  var CH_LETTERS = "abcdefghijklmnopqrstuvwxyzäö".split("");

  var HUMAN_COLOR = "#6ee7b7";
  // Nimetyt vastustajat, joilla omat värit ja kevyet luonteet (relatedness).
  var CPU_PROFILES = [
    { key: "aapo", name: "Aapo", color: "#fca5a5", flavor: "pelaa varman p\u00e4\u00e4lle", quip: "varman p\u00e4\u00e4lle" },
    { key: "bea", name: "Bea", color: "#fcd34d", flavor: "rakastaa pitki\u00e4 sanoja", quip: "pitk\u00e4ll\u00e4 sanalla" },
    { key: "cesar", name: "Cesar", color: "#a5b4fc", flavor: "ottaa riskej\u00e4", quip: "rohkeasti" },
  ];

  var LS_SETTINGS = "sanaseppa.settings";
  var LS_TIP = "sanaseppa.tip.v1";

  function lsGet(k, d) {
    try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  var S = null;      // pelin tila
  var busy = false;  // syöte lukossa (tietokoneen vuoro / animaatio)

  // ---- Apurit --------------------------------------------------------------
  function tileValue(ch, blank) { return blank ? 0 : E.letterValue(ch); }
  function idx(r, c) { return r * SIZE + c; }
  function human() { return S.players[0]; }
  function current() { return S.players[S.turnIdx]; }
  function isHumanTurn() { return S && !S.finished && !busy && current().isHuman; }

  function premiumClass(r, c) {
    if (r === E.CENTER && c === E.CENTER) return "pc";
    return { "3W": "p3w", "2W": "p2w", "3L": "p3l", "2L": "p2l" }[E.premiumAt(r, c)] || "";
  }
  function premiumLabel(r, c) {
    if (r === E.CENTER && c === E.CENTER) return "\u2605";
    return { "3W": "3\u00d7S", "2W": "2\u00d7S", "3L": "3\u00d7K", "2L": "2\u00d7K" }[E.premiumAt(r, c)] || "";
  }

  // ---- Pelin aloitus -------------------------------------------------------
  function newGame(cfg) {
    cfg = cfg || {};
    cfg.computers = cfg.computers | 0;
    cfg.rackSize = cfg.rackSize || E.RACK;
    cfg.level = cfg.level || "normaali";
    lsSet(LS_SETTINGS, { level: cfg.level, computers: cfg.computers, rackSize: cfg.rackSize });

    var seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    var rng = E.makeRNG(seed);
    var bag = E.createBag(rng);

    var players = [{ isHuman: true, name: "Sinä", color: HUMAN_COLOR, rack: [], score: 0 }];
    for (var i = 0; i < cfg.computers; i++) {
      var pr = CPU_PROFILES[i];
      players.push({ isHuman: false, name: pr.name, color: pr.color, key: pr.key, flavor: pr.flavor, quip: pr.quip, rack: [], score: 0 });
    }
    for (var j = 0; j < players.length; j++) E.refill(players[j].rack, bag, cfg.rackSize);

    S = {
      cfg: cfg,
      board: E.emptyBoard(),
      bag: bag,
      players: players,
      turnIdx: 0,
      pending: [],
      selected: null,
      exchange: null,
      hint: null,
      cursor: { r: E.CENTER, c: E.CENTER },
      placeDir: null,
      awaitBlank: false,
      lastMove: [], lastBy: 0,
      lastPlayText: "",
      scoreless: 0,
      finished: false,
      bestMissed: null,
    };
    closeOverlay();
    ovMode = null;
    el("game").classList.remove("hidden");
    buildBoard();
    render();
    if (cfg.computers === 0) {
      toast("Harjoittelu yksin \u2014 kirjoita sanat laudalle omaan tahtiin.", "ok");
    } else {
      var names = players.slice(1).map(function (p) { return p.name; }).join(", ");
      toast("Sin\u00e4 aloitat \u2014 ensimm\u00e4inen sana keskiruudun kautta. Vastassa: " + names + ".", "ok");
    }
    maybeShowTip();
  }

  function maybeShowTip() {
    if (lsGet(LS_TIP, false)) return;
    setTimeout(function () {
      if (!S || S.finished || ov.classList.contains("on")) return;
      ovMode = "tip";
      openOverlay(
        '<div class="card tipcard" data-mode="tip">' +
        "<h2>Pikaohje</h2>" +
        "<p class=\"lead\">Vie kursori nuolilla ruutuun ja <b>kirjoita sana</b> \u2014 jokainen kirjain asettaa laatan ja etenee. <b>Enter</b> pelaa, <b>Askelpalautin</b> peruu.</p>" +
        '<div class="row"><button class="primary" id="tipOk">Selv\u00e4</button></div></div>'
      );
      el("tipOk").addEventListener("click", function () {
        lsSet(LS_TIP, true);
        ovMode = null;
        closeOverlay();
      });
      el("tipOk").focus();
    }, 450);
  }

  // ---- Laudan rakennus (kerran) -------------------------------------------
  function buildBoard() {
    var board = el("board");
    board.innerHTML = "";
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var d = document.createElement("div");
        d.className = "cell " + premiumClass(r, c);
        d.dataset.r = r; d.dataset.c = c;
        var lab = premiumLabel(r, c);
        if (lab) { var s = document.createElement("span"); s.className = "plab"; s.textContent = lab; d.appendChild(s); }
        d.addEventListener("click", onCellClick);
        board.appendChild(d);
      }
    }
  }

  // ---- Renderöinti ---------------------------------------------------------
  function pendingAt(r, c) {
    for (var i = 0; i < S.pending.length; i++)
      if (S.pending[i].r === r && S.pending[i].c === c) return S.pending[i];
    return null;
  }
  function usedRackIndices() {
    var u = {};
    for (var i = 0; i < S.pending.length; i++) u[S.pending[i].ri] = 1;
    return u;
  }

  function render() {
    var cells = el("board").children;
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var d = cells[idx(r, c)];
        var old = d.querySelector(".tile");
        if (old) d.removeChild(old);
        d.classList.remove("last", "pend", "hintcell", "cursor");
        d.style.removeProperty("--last");
        var committed = S.board[idx(r, c)];
        var pend = pendingAt(r, c);
        var hintC = S.hint && S.hint.map[idx(r, c)];
        if (committed) {
          d.appendChild(makeTile(committed.ch, committed.blank, false, !!(S.justPlaced && S.justPlaced[idx(r, c)])));
          if (isLast(r, c)) { d.classList.add("last"); d.style.setProperty("--last", S.players[S.lastBy].color); }
        } else if (pend) {
          d.appendChild(makeTile(pend.ch, pend.blank, true, !!(S.justPlaced && S.justPlaced[idx(r, c)])));
          d.classList.add("pend");
        } else if (hintC) {
          var g = makeTile(hintC.ch, hintC.blank, false);
          g.classList.add("ghost");
          d.appendChild(g);
          d.classList.add("hintcell");
        }
        if (S.cursor && S.cursor.r === r && S.cursor.c === c) {
          d.classList.add("cursor");
          var dir = effectiveDir();
          if (dir) d.classList.add(dirClass(dir));
        }
      }
    }
    renderRack();
    renderScoreboard();
    el("bagLab").textContent = "Pussi: " + S.bag.length;
    var lp = el("lastPlay");
    if (lp) lp.textContent = S.lastPlayText || "";
    var tl = el("turnLab");
    if (S.finished) tl.textContent = "Peli p\u00e4\u00e4ttyi";
    else if (current().isHuman) tl.textContent = "Sinun vuorosi";
    else tl.textContent = current().name + " miettii\u2026";
    tl.style.color = S.finished ? "" : current().color;

    var ht = isHumanTurn();
    el("btnPlay").disabled = !(ht && S.pending.length > 0 && !S.exchange);
    el("btnHint").disabled = !(ht && !S.exchange && S.pending.length === 0);
    el("btnLetter").disabled = !TRIE;
    el("btnRecall").disabled = !(ht && S.pending.length > 0 && !S.exchange);
    el("btnShuffle").disabled = !(ht && !S.exchange);
    el("btnPass").disabled = !ht;
    el("btnExchange").innerHTML = S.exchange ? "Vahvista" : 'Vaihda <kbd>F4</kbd>';
    el("btnExchange").disabled = !ht || (!S.exchange && S.bag.length === 0);
    S.justPlaced = null;
  }

  function makeTile(ch, blank, pending, settle) {
    var t = document.createElement("div");
    t.className = "tile" + (blank ? " blank" : "") + (pending ? " ptile" : "") + (settle ? " settle" : "");
    var l = document.createElement("span"); l.className = "let"; l.textContent = ch.toUpperCase();
    t.appendChild(l);
    var v = document.createElement("span"); v.className = "pts"; v.textContent = tileValue(ch, blank);
    t.appendChild(v);
    return t;
  }

  function renderRack() {
    var rack = el("rack");
    rack.innerHTML = "";
    rack.style.gridTemplateColumns = "repeat(" + rackSize() + ", 1fr)";
    var used = usedRackIndices();
    var hr = human().rack;
    for (var i = 0; i < hr.length; i++) {
      var slot = document.createElement("div");
      slot.className = "rslot";
      var isUsed = used[i];
      var isBlank = hr[i] === BLANK;
      if (S.exchange) {
        if (S.exchange[i]) slot.classList.add("xsel");
      } else if (S.selected === i && !isUsed) slot.classList.add("sel");
      if (isUsed && !S.exchange) {
        slot.classList.add("empty");
      } else {
        var t = document.createElement("div");
        t.className = "tile" + (isBlank ? " blank" : "");
        var l = document.createElement("span"); l.className = "let";
        l.textContent = isBlank ? "" : hr[i].toUpperCase();
        t.appendChild(l);
        if (!isBlank) { var v = document.createElement("span"); v.className = "pts"; v.textContent = tileValue(hr[i], false); t.appendChild(v); }
        slot.appendChild(t);
      }
      slot.dataset.ri = i;
      slot.addEventListener("click", onRackClick);
      rack.appendChild(slot);
    }
  }

  function renderScoreboard() {
    var sb = el("scoreboard");
    sb.innerHTML = "";
    var ranked = ranking();
    var placeOf = {};
    for (var k = 0; k < ranked.length; k++) placeOf[ranked[k].i] = ranked[k].rank;
    var h = human();
    var above = null, leaderGap = null;
    for (k = 0; k < S.players.length; k++) {
      var pp = S.players[k];
      if (pp.isHuman) continue;
      if (pp.score > h.score) {
        var g = pp.score - h.score;
        if (above == null || g < above) above = g;
      }
    }
    var topScore = ranked[0] ? ranked[0].p.score : 0;
    if (placeOf[0] > 1) leaderGap = topScore - h.score;

    for (var i = 0; i < S.players.length; i++) {
      var p = S.players[i];
      var place = placeOf[i] || (i + 1);
      var chip = document.createElement("div");
      chip.className = "chip" + (i === S.turnIdx && !S.finished ? " on" : "") + (p.isHuman ? " me" : "");
      chip.style.setProperty("--pc", p.color);
      var top = document.createElement("div"); top.className = "ctop";
      var nm = document.createElement("span"); nm.className = "cname";
      nm.textContent = place + ". " + p.name;
      var sc = document.createElement("span"); sc.className = "cscore"; sc.textContent = p.score;
      top.appendChild(nm); top.appendChild(sc);
      chip.appendChild(top);
      var sub = document.createElement("div"); sub.className = "csub";
      if (p.isHuman) {
        if (S.players.length === 1) sub.textContent = "harjoittelu";
        else if (place === 1) sub.textContent = "k\u00e4rjess\u00e4";
        else if (leaderGap != null) sub.textContent = "+" + leaderGap + " k\u00e4rkeen";
        else sub.textContent = (above == null ? "k\u00e4rjess\u00e4" : "+" + above + " seuraavaan");
      } else sub.textContent = p.flavor;
      chip.appendChild(sub);
      sb.appendChild(chip);
    }
  }

  function isLast(r, c) {
    for (var i = 0; i < S.lastMove.length; i++) if (S.lastMove[i].r === r && S.lastMove[i].c === c) return true;
    return false;
  }

  // ---- Syöte: teline & lauta ----------------------------------------------
  function effectiveDir() {
    return S.placeDir || { dr: 0, dc: 1 }; // oletus: vaakasuora oikealle
  }
  function dirClass(dir) {
    if (!dir) return "";
    if (dir.dr === 0 && dir.dc === 1) return "dir-e";
    if (dir.dr === 0 && dir.dc === -1) return "dir-w";
    if (dir.dr === 1 && dir.dc === 0) return "dir-s";
    if (dir.dr === -1 && dir.dc === 0) return "dir-n";
    return "";
  }

  function paintCursor() {
    if (!S || !S.cursor) return;
    var cells = el("board").children;
    for (var i = 0; i < cells.length; i++) {
      cells[i].classList.remove("cursor", "dir-e", "dir-w", "dir-s", "dir-n");
    }
    var d = cells[idx(S.cursor.r, S.cursor.c)];
    if (!d) return;
    d.classList.add("cursor");
    var dir = effectiveDir();
    var dc = dirClass(dir);
    if (dc) d.classList.add(dc);
  }

  function onRackClick(e) {
    if (!isHumanTurn()) return;
    var ri = e.currentTarget.dataset.ri | 0;
    if (S.exchange) {
      if (S.exchange[ri]) delete S.exchange[ri]; else S.exchange[ri] = 1;
      renderRack();
      return;
    }
    if (usedRackIndices()[ri]) return;
    S.selected = (S.selected === ri) ? null : ri;
    S.awaitBlank = false;
    renderRack();
  }

  function onCellClick(e) {
    if (!isHumanTurn() || S.exchange) return;
    var r = e.currentTarget.dataset.r | 0, c = e.currentTarget.dataset.c | 0;
    S.cursor = { r: r, c: c };
    // Hiiri: jos telineessä valinta, aseta/palauta; muuten vain synkronoi kursori.
    if (S.selected != null || pendingAt(r, c)) interactAt(r, c);
    else { S.awaitBlank = false; paintCursor(); }
  }

  // Hiiriasetus (valittu teline-laatta + klikattu ruutu).
  function interactAt(r, c) {
    if (S.hint) { S.hint = null; }
    var pend = pendingAt(r, c);
    if (pend) {
      S.pending = S.pending.filter(function (p) { return !(p.r === r && p.c === c); });
      if (S.pending.length < 2) { /* suunta säilyy nuolilukituksena */ }
      render();
      return;
    }
    if (S.board[idx(r, c)]) { render(); return; }
    if (S.selected == null) { toast("Valitse laatta telineest\u00e4 tai kirjoita kirjain.", "warn"); render(); return; }
    var ch = human().rack[S.selected];
    if (ch === BLANK) {
      openBlankPicker(r, c, S.selected);
    } else {
      placeTile(r, c, ch, false, S.selected);
    }
  }

  // Seuraava tyhj\u00e4 ruutu suuntaan (hyppää vahvistettujen yli).
  function nextEmptyFrom(r, c, dir) {
    var nr = r + dir.dr, nc = c + dir.dc;
    while (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
      if (!S.board[idx(nr, nc)]) return { r: nr, c: nc };
      nr += dir.dr; nc += dir.dc;
    }
    return null;
  }

  function advanceCursor() {
    var dir = effectiveDir();
    var n = nextEmptyFrom(S.cursor.r, S.cursor.c, dir);
    if (n) S.cursor = n;
  }

  function ensurePlaceableCell() {
    // Jos kursori on vahvistetulla laatalla, hyppää eteenpäin tyhjään.
    if (S.board[idx(S.cursor.r, S.cursor.c)]) {
      var n = nextEmptyFrom(S.cursor.r, S.cursor.c, effectiveDir());
      if (n) S.cursor = n;
      else return false;
    }
    return true;
  }

  function findUnusedRackIndex(want) {
    var used = usedRackIndices(), hr = human().rack;
    for (var i = 0; i < hr.length; i++) {
      if (!used[i] && hr[i] === want) return i;
    }
    return -1;
  }

  function placeTile(r, c, ch, blank, ri) {
    S.pending.push({ r: r, c: c, ch: ch, blank: blank, ri: ri });
    S.selected = null;
    S.awaitBlank = false;
    if (!S.placeDir && S.pending.length >= 2) {
      var a = S.pending[S.pending.length - 2], b = S.pending[S.pending.length - 1];
      var dr = Math.sign(b.r - a.r), dc = Math.sign(b.c - a.c);
      if ((dr === 0) !== (dc === 0)) S.placeDir = { dr: dr, dc: dc };
    }
    S.cursor = { r: r, c: c };
    S.justPlaced = {};
    S.justPlaced[idx(r, c)] = 1;
    advanceCursor();
    render();
  }

  // Kirjoitusasettelu: kirjain = aseta + etene.
  function typePlaceLetter(L) {
    if (!ensurePlaceableCell()) { toast("Ei tyhj\u00e4\u00e4 ruutua t\u00e4ss\u00e4 suunnassa.", "warn"); return; }
    var r = S.cursor.r, c = S.cursor.c;
    if (pendingAt(r, c)) {
      toast("Ruudussa on jo asettamasi laatta \u2014 Askelpalautin poistaa.", "warn");
      return;
    }
    var ri = findUnusedRackIndex(L);
    if (ri < 0) {
      toast("Ei kirjainta \u201c" + L.toUpperCase() + "\u201d telineess\u00e4.", "warn");
      return;
    }
    placeTile(r, c, L, false, ri);
  }

  function typePlaceBlankAs(L) {
    if (!ensurePlaceableCell()) { toast("Ei tyhj\u00e4\u00e4 ruutua t\u00e4ss\u00e4 suunnassa.", "warn"); return; }
    var r = S.cursor.r, c = S.cursor.c;
    if (pendingAt(r, c)) {
      toast("Ruudussa on jo asettamasi laatta \u2014 Askelpalautin poistaa.", "warn");
      return;
    }
    var ri = findUnusedRackIndex(BLANK);
    if (ri < 0) { toast("Ei tyhj\u00e4\u00e4 laattaa telineess\u00e4.", "warn"); S.awaitBlank = false; return; }
    placeTile(r, c, L, true, ri);
  }

  function undoLastPending() {
    if (!S.pending.length) return;
    var last = S.pending.pop();
    S.cursor = { r: last.r, c: last.c };
    S.awaitBlank = false;
    render();
  }

  var blankCtx = null; // { r, c, ri } kun tyhjän laatan valitsin auki (hiiri)

  function openBlankPicker(r, c, ri) {
    blankCtx = { r: r, c: c, ri: ri };
    var html = '<div class="card blankcard" data-mode="blank"><h2>Valitse tyhj\u00e4n laatan kirjain</h2>' +
      '<p class="lead" style="margin-bottom:10px">Kirjoita kirjain, tai nuolet + Enter. Esc peruu.</p><div class="letters">';
    for (var i = 0; i < CH_LETTERS.length; i++)
      html += '<button class="lbtn" data-l="' + CH_LETTERS[i] + '" tabindex="0">' + CH_LETTERS[i].toUpperCase() + "</button>";
    html += '</div><div class="row"><button class="ghost" id="blankCancel">Peruuta</button></div></div>';
    openOverlay(html);
    ov.querySelectorAll(".lbtn").forEach(function (b) {
      b.addEventListener("click", function () { assignBlank(b.dataset.l); });
    });
    el("blankCancel").addEventListener("click", function () { blankCtx = null; closeOverlay(); });
    var first = ov.querySelector(".lbtn");
    if (first) first.focus();
  }

  function assignBlank(L) {
    if (!blankCtx) return;
    var ctx = blankCtx; blankCtx = null;
    closeOverlay();
    placeTile(ctx.r, ctx.c, L, true, ctx.ri);
  }

  function recall() {
    S.pending = []; S.selected = null; S.hint = null; S.placeDir = null; S.awaitBlank = false;
    if (E.isBoardEmpty(S.board)) S.cursor = { r: E.CENTER, c: E.CENTER };
    render();
  }

  function shuffleRack() {
    recall();
    E.shuffle(human().rack, E.makeRNG((Math.random() * 1e9) >>> 0));
    render();
  }

  function moveCursor(dr, dc) {
    if (!S || !S.cursor) return;
    // Lukitse asettelusuunta nuolella (vaaka/pysty).
    if ((dr === 0) !== (dc === 0)) S.placeDir = { dr: dr, dc: dc };
    var nr = Math.max(0, Math.min(SIZE - 1, S.cursor.r + dr));
    var nc = Math.max(0, Math.min(SIZE - 1, S.cursor.c + dc));
    S.cursor = { r: nr, c: nc };
    S.awaitBlank = false;
    paintCursor();
  }

  // ---- Vihje (epävarmuus / läheltä piti) -----------------------------------
  function showHint() {
    if (!isHumanTurn() || S.pending.length) return;
    var moves = E.generateMoves(S.board, human().rack, TRIE);
    if (!moves.length) { toast("Ei laillista siirtoa \u2014 vaihda tai ohita.", "warn"); return; }
    var best = moves[0];
    var map = {};
    for (var i = 0; i < best.cells.length; i++) { var c = best.cells[i]; map[idx(c.r, c.c)] = c; }
    S.hint = { map: map, word: best.main, score: best.score, cells: best.cells };
    render();
    toast("Vihje: \u201c" + best.main.toUpperCase() + "\u201d toisi " + best.score + " p. Napauta lautaa piilottaaksesi.", "ok");
  }

  // ---- Kirjaimen sisältävät sanat ------------------------------------------
  var LETTER_BROWSER_LIMIT = 80;
  var letterBrowserCh = null;

  function wordsContainingLetter(ch, limit) {
    ch = String(ch).toLowerCase();
    var hits = [];
    for (var i = 0; i < WORDS.length; i++) {
      if (WORDS[i].indexOf(ch) >= 0) hits.push(WORDS[i]);
    }
    hits.sort(function (a, b) {
      function band(w) { return (w.length >= 4 && w.length <= 8) ? 0 : (w.length < 4 ? 2 : 1); }
      var ba = band(a), bb = band(b);
      if (ba !== bb) return ba - bb;
      if (a.length !== b.length) return a.length - b.length;
      return a < b ? -1 : (a > b ? 1 : 0);
    });
    return { total: hits.length, words: hits.slice(0, limit) };
  }

  function playableMovesWithLetter(ch) {
    if (!S || !isHumanTurn()) return [];
    ch = String(ch).toLowerCase();
    var moves = E.generateMoves(S.board, human().rack, TRIE);
    var out = [], seen = {};
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var uses = false;
      for (var j = 0; j < m.cells.length; j++) if (m.cells[j].ch === ch) { uses = true; break; }
      if (!uses) continue;
      var key = m.main + ":" + m.score;
      if (seen[key]) continue;
      seen[key] = 1;
      out.push(m);
      if (out.length >= 24) break;
    }
    return out;
  }

  function showLetterBrowser(initialCh) {
    if (!TRIE) { toast("Sanasto latautuu viel\u00e4\u2026", "warn"); return; }
    letterBrowserCh = initialCh || letterBrowserCh || null;
    // Jos telineessä on valittu kirjain, käytä sitä oletuksena
    if (!letterBrowserCh && S && S.selected != null && human()) {
      var sel = human().rack[S.selected];
      if (sel && sel !== BLANK) letterBrowserCh = sel;
    }
    renderLetterBrowser();
  }

  function renderLetterBrowser() {
    ovMode = "letter";
    var ch = letterBrowserCh;
    var html = '<div class="card lettercard" data-mode="letter"><h2>Kirjaimen sanat</h2>' +
      '<p class="lead">Valitse kirjain \u2014 n\u00e4et sanalistan osumat' +
      (S && isHumanTurn() ? " ja mahdolliset siirtosi, joissa kirjainta k\u00e4ytet\u00e4\u00e4n" : "") +
      ".</p>";

    // Telineen kirjaimet pikavalintana
    if (S && human()) {
      var rackLetters = [], seenR = {};
      human().rack.forEach(function (t) {
        if (t === BLANK || seenR[t]) return;
        seenR[t] = 1; rackLetters.push(t);
      });
      if (rackLetters.length) {
        html += '<div class="optlab">Telineest\u00e4si</div><div class="letters racklets">';
        rackLetters.forEach(function (L) {
          html += '<button type="button" class="lbtn' + (ch === L ? " on" : "") + '" data-l="' + L + '">' + L.toUpperCase() + "</button>";
        });
        html += "</div>";
      }
    }

    html += '<div class="optlab">Aakkoset</div><div class="letters">';
    for (var i = 0; i < CH_LETTERS.length; i++) {
      var L = CH_LETTERS[i];
      html += '<button type="button" class="lbtn' + (ch === L ? " on" : "") + '" data-l="' + L + '">' + L.toUpperCase() + "</button>";
    }
    html += "</div>";

    if (ch) {
      var playable = playableMovesWithLetter(ch);
      if (playable.length) {
        html += '<div class="optlab">Pelattavissa nyt (' + playable.length + (playable.length >= 24 ? "+" : "") + ")</div>" +
          '<div class="wordlist playable">';
        playable.forEach(function (m, ix) {
          html += '<button type="button" class="wchip play" data-pi="' + ix + '">' +
            m.main.toUpperCase() + ' <span class="wp">' + m.score + " p</span></button>";
        });
        html += "</div>";
        // stash for click handlers
        showLetterBrowser._playable = playable;
      } else {
        showLetterBrowser._playable = [];
      }

      var res = wordsContainingLetter(ch, LETTER_BROWSER_LIMIT);
      html += '<div class="optlab">Sanalistassa \u201c' + ch.toUpperCase() + "\u201d (" +
        Math.min(res.total, LETTER_BROWSER_LIMIT) + (res.total > LETTER_BROWSER_LIMIT ? " / " + res.total : "") +
        ")</div><div class=\"wordlist dict\">";
      if (!res.words.length) html += '<span class="empty">Ei osumia.</span>';
      else res.words.forEach(function (w) {
        html += '<span class="wchip">' + w.toUpperCase() + "</span>";
      });
      html += "</div>";
    } else {
      html += '<p class="lead" style="margin-top:8px">Valitse kirjain yllä.</p>';
    }

    html += '<div class="row"><button class="primary" id="letterClose">Sulje</button></div></div>';
    openOverlay(html);

    ov.querySelectorAll(".lbtn").forEach(function (b) {
      b.addEventListener("click", function () {
        letterBrowserCh = b.dataset.l;
        renderLetterBrowser();
      });
    });
    ov.querySelectorAll(".wchip.play").forEach(function (b) {
      b.addEventListener("click", function () {
        var m = showLetterBrowser._playable[b.dataset.pi | 0];
        if (!m || !S) return;
        var map = {};
        for (var i = 0; i < m.cells.length; i++) { var c = m.cells[i]; map[idx(c.r, c.c)] = c; }
        S.hint = { map: map, word: m.main, score: m.score, cells: m.cells };
        ovMode = null; closeOverlay();
        render();
        toast("N\u00e4ytet\u00e4\u00e4n \u201c" + m.main.toUpperCase() + "\u201d (+" + m.score + "). Napauta lautaa piilottaaksesi.", "ok");
      });
    });
    el("letterClose").addEventListener("click", function () { ovMode = null; closeOverlay(); });
  }

  // ---- Pelaajan siirto -----------------------------------------------------
  function playWord() {
    if (!isHumanTurn() || S.pending.length === 0) return;
    var placed = S.pending.map(function (p) { return { r: p.r, c: p.c, ch: p.ch, blank: p.blank }; });
    var res = E.validateMove(S.board, placed, TRIE, { rackSize: rackSize() });
    if (!res.ok) { toast(res.reason, "warn"); return; }
    // läheltä piti: paras mahdollinen siirto tällä telineellä vs. pelattu
    var best = E.generateMoves(S.board, human().rack, TRIE)[0];
    if (best && best.score > res.score) {
      var gap = best.score - res.score;
      if (!S.bestMissed || gap > S.bestMissed.gap)
        S.bestMissed = { word: best.main, score: best.score, got: res.score, gap: gap };
    }
    S.pending = []; S.selected = null; S.hint = null; S.placeDir = null; S.awaitBlank = false;
    commitMove(0, placed, res);
    afterMove();
  }

  function commitMove(pi, placed, res) {
    var p = S.players[pi];
    for (var i = 0; i < placed.length; i++) {
      var pc = placed[i];
      S.board[idx(pc.r, pc.c)] = { ch: pc.ch, blank: !!pc.blank };
      var want = pc.blank ? BLANK : pc.ch;
      var at = p.rack.indexOf(want);
      if (at >= 0) p.rack.splice(at, 1);
    }
    E.refill(p.rack, S.bag, rackSize());
    p.score += res.score;
    S.lastMove = placed.map(function (x) { return { r: x.r, c: x.c }; });
    S.lastBy = pi;
    S.scoreless = 0;
    S.justPlaced = {};
    for (i = 0; i < placed.length; i++) S.justPlaced[idx(placed[i].r, placed[i].c)] = 1;
    var wordsLabel = (res.words && res.words.length > 1)
      ? res.words.map(function (w) { return w.toUpperCase(); }).join(" + ")
      : res.main.toUpperCase();
    var who = p.isHuman ? "Sinä" : p.name;
    S.lastPlayText = who + ": " + wordsLabel + " +" + res.score + (res.bingo ? " BINGO" : "");
    var msg;
    if (p.isHuman) {
      msg = "Pelasit \u201c" + wordsLabel + "\u201d (+" + res.score + ")";
      if (res.bingo) msg += " \u2014 BINGO! +" + E.BINGO_BONUS;
      else if (placed.length === rackSize() - 1) msg += " \u2014 yksi laatta bingosta!";
    } else {
      msg = p.name + " pelasi " + (p.quip && Math.random() < 0.35 ? p.quip + " " : "") + "\u201c" + res.main.toUpperCase() + "\u201d (+" + res.score + ")";
      if (res.bingo) msg += " \u2014 BINGO!";
    }
    toast(msg, p.isHuman ? "ok" : "cpu");
    scorePop(placed, res.score, p.color);
    if (res.bingo) celebrate((p.isHuman ? "Sinä" : p.name) + " \u2014 BINGO! +" + E.BINGO_BONUS, p.color);
  }

  // ---- Vuorologiikka -------------------------------------------------------
  function afterMove() {
    if (checkGameOver()) { render(); showGameOver(); return; }
    S.turnIdx = (S.turnIdx + 1) % S.players.length;
    beginTurn();
  }

  function beginTurn() {
    if (S.finished) return;
    S.hint = null;
    if (current().isHuman) { busy = false; render(); }
    else { busy = true; render(); setTimeout(cpuTurn, 850); }
  }

  function cpuTurn() {
    if (S.finished) return;
    var p = current();
    var moves = E.generateMoves(S.board, p.rack, TRIE);
    if (moves.length > 0) {
      var pick = chooseMove(moves, p);
      commitMove(S.turnIdx, pick.cells, pick);
    } else if (S.bag.length > 0) {
      var n = Math.min(p.rack.length, S.bag.length);
      for (var i = 0; i < n; i++) S.bag.push(p.rack.pop());
      E.shuffle(S.bag, E.makeRNG((Math.random() * 1e9) >>> 0));
      E.refill(p.rack, S.bag, rackSize());
      S.scoreless++;
      toast(p.name + " vaihtoi laattoja.", "cpu");
    } else {
      S.scoreless++;
      toast(p.name + " ohitti vuoron.", "cpu");
    }
    afterMove();
  }

  // Vaikeustaso + luonne. Aapo=varma, Bea=pitkät sanat, Cesar=riskit/vaihtelu.
  function chooseMove(moves, p) {
    var n = moves.length, lvl = S.cfg.level;
    if (p.key === "bea") {
      var slice = moves.slice(0, Math.max(1, Math.ceil(n * (lvl === "helppo" ? 0.5 : lvl === "normaali" ? 0.3 : 0.12))));
      slice.sort(function (a, b) { return b.cells.length - a.cells.length || b.score - a.score; });
      return slice[0];
    }
    if (lvl === "kova") return p.key === "cesar" ? moves[Math.floor(Math.random() * Math.min(4, n))] : moves[0];
    if (lvl === "normaali") {
      var top = Math.max(1, Math.ceil(n * (p.key === "cesar" ? 0.45 : 0.22)));
      return moves[Math.floor(Math.random() * top)];
    }
    var lo = Math.floor(n * (p.key === "cesar" ? 0.4 : 0.55));
    return moves[lo + Math.floor(Math.random() * (n - lo))];
  }

  // ---- Vaihto / ohitus -----------------------------------------------------
  function toggleExchange() {
    if (!isHumanTurn()) return;
    if (S.exchange) {
      var indices = Object.keys(S.exchange).map(Number).sort(function (a, b) { return b - a; });
      if (indices.length === 0) { S.exchange = null; render(); return; }
      if (indices.length > S.bag.length) { toast("Pussissa ei ole tarpeeksi laattoja.", "warn"); return; }
      var hr = human().rack;
      for (var i = 0; i < indices.length; i++) S.bag.push(hr[indices[i]]);
      for (i = 0; i < indices.length; i++) hr.splice(indices[i], 1);
      E.shuffle(S.bag, E.makeRNG((Math.random() * 1e9) >>> 0));
      E.refill(hr, S.bag, rackSize());
      S.exchange = null;
      S.scoreless++;
      toast("Vaihdoit " + indices.length + " laattaa.", "ok");
      afterMove();
    } else {
      recall();
      S.exchange = {};
      render();
      toast("Valitse vaihdettavat (kirjaimet) ja paina Enter / Vahvista. Esc peruu.", "warn");
    }
  }

  function passTurn() {
    if (!isHumanTurn()) return;
    recall();
    S.scoreless++;
    toast("Ohitit vuoron.", "warn");
    afterMove();
  }

  // ---- Pelin loppu ---------------------------------------------------------
  function checkGameOver() {
    var anyEmpty = false;
    for (var i = 0; i < S.players.length; i++) if (S.players[i].rack.length === 0) anyEmpty = true;
    var out = anyEmpty && S.bag.length === 0;
    var stuck = S.scoreless >= 2 * S.players.length;
    if (!out && !stuck) return false;
    S.finished = true;
    var goneOut = null, sumRemaining = 0;
    for (i = 0; i < S.players.length; i++) {
      var p = S.players[i];
      p.remaining = E.rackValue(p.rack);
      p.score -= p.remaining;
      sumRemaining += p.remaining;
      if (out && p.rack.length === 0 && !goneOut) goneOut = p;
    }
    if (goneOut) goneOut.score += sumRemaining; // omansa oli 0
    return true;
  }

  function ranking() {
    var arr = S.players.map(function (p, i) { return { p: p, i: i }; });
    arr.sort(function (a, b) { return b.p.score - a.p.score; });
    var rank = 0, prev = null;
    for (var k = 0; k < arr.length; k++) {
      if (prev == null || arr[k].p.score !== prev) { rank = k + 1; prev = arr[k].p.score; }
      arr[k].rank = rank;
    }
    return arr;
  }

  function shareText() {
    var arr = ranking();
    var lines = ["Sanaseppä \u2014 tulos:"];
    for (var k = 0; k < arr.length; k++) lines.push(arr[k].rank + ". " + arr[k].p.name + " " + arr[k].p.score);
    if (S.cfg) {
      var n = S.cfg.computers | 0;
      lines.push(n === 0 ? "Harjoittelu yksin" : (n + " vastustajaa · " + (S.cfg.level || "normaali")));
      lines.push("Teline: " + (S.cfg.rackSize || E.RACK));
    }
    return lines.join("\n");
  }

  function showGameOver() {
    ovMode = "gameover";
    var arr = ranking();
    var solo = S.players.length === 1;
    var winners = arr.filter(function (x) { return x.rank === 1; });
    var humanFirst = winners.some(function (x) { return x.p.isHuman; });
    var title;
    if (solo) title = "Harjoittelu p\u00e4\u00e4ttyi";
    else if (winners.length > 1)
      title = humanFirst ? "Tasapeli k\u00e4rjess\u00e4!" : "Tasapeli: " + winners.map(function (x) { return x.p.name; }).join(" & ");
    else title = winners[0].p.isHuman ? "Voitit!" : winners[0].p.name + " voitti.";

    var rows = arr.map(function (x) {
      return '<div class="rrow' + (x.p.isHuman ? " me" : "") + '" style="--pc:' + x.p.color + '">' +
        '<span class="rk">' + x.rank + ".</span><span class=\"rn\">" + x.p.name + "</span><b>" + x.p.score + "</b></div>";
    }).join("");

    // läheltä piti -tieto (epävarmuuden hallinta, kannustaa uuteen yritykseen)
    var near = "";
    var h = human();
    var top = arr[0].p.score;
    if (!solo && !winners.some(function (x) { return x.p.isHuman; })) {
      near += "<p class=\"near\">Voittoon olisi tarvittu viel\u00e4 <b>+" + (top - h.score) + "</b> pistett\u00e4.</p>";
    }
    if (S.bestMissed) {
      near += "<p class=\"near\">Paras ohittamasi siirto: \u201c" + S.bestMissed.word.toUpperCase() +
        "\u201d (" + S.bestMissed.score + " p) \u2014 j\u00e4it <b>" + S.bestMissed.gap + "</b> p siit\u00e4.</p>";
    }

    var cfg = S.cfg || { level: "normaali", computers: 1, rackSize: 7 };
    var html = '<div class="card" data-mode="gameover"><h2>' + title + '</h2>' +
      '<div class="ranklist">' + rows + "</div>" + near +
      '<div class="row"><button class="primary" id="goAgain">Sama asetus</button>' +
      '<button class="ghost" id="goNew">Uusi peli</button>' +
      '<button class="ghost" id="goShare">Kopioi tulos</button></div></div>';
    openOverlay(html);
    el("goAgain").addEventListener("click", function () {
      if (!TRIE) { toast("Sanasto latautuu viel\u00e4\u2026", "warn"); return; }
      ovMode = null;
      newGame({ level: cfg.level, computers: cfg.computers, rackSize: cfg.rackSize });
    });
    el("goNew").addEventListener("click", startScreen);
    el("goShare").addEventListener("click", function () {
      var txt = shareText();
      var done = function () { toast("Tulos kopioitu leikep\u00f6yd\u00e4lle.", "ok"); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
      else { fallbackCopy(txt); done(); }
    });
    el("goAgain").focus();
  }

  function fallbackCopy(txt) {
    try {
      var ta = document.createElement("textarea");
      ta.value = txt; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    } catch (e) {}
  }

  // ---- Palaute-animaatiot (pätevyys + välitön palaute) ---------------------
  function scorePop(placed, score, color) {
    if (!placed.length) return;
    var mid = placed[Math.floor(placed.length / 2)];
    var cell = el("board").children[idx(mid.r, mid.c)];
    if (!cell) return;
    var s = document.createElement("span");
    s.className = "scorepop"; s.textContent = "+" + score; s.style.color = color;
    cell.appendChild(s);
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 1500);
  }

  function celebrate(text, color) {
    var b = document.createElement("div");
    b.className = "bingo"; b.textContent = text; b.style.setProperty("--pc", color || "#fff");
    document.body.appendChild(b);
    setTimeout(function () { b.classList.add("out"); }, 1100);
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 1700);
  }

  // ---- Overlayt ------------------------------------------------------------
  function openOverlay(html) { ov.innerHTML = html; ov.classList.add("on"); }
  function closeOverlay() { ov.classList.remove("on"); ov.innerHTML = ""; blankCtx = null; }

  function segControl(id, label, opts, def) {
    var h = '<div class="opt"><div class="optlab">' + label + '</div><div class="seg" id="' + id + '">';
    for (var i = 0; i < opts.length; i++)
      h += '<button data-v="' + opts[i].v + '"' + (opts[i].v === def ? ' class="on"' : "") + ">" + opts[i].t + "</button>";
    return h + "</div></div>";
  }

  // Overlay-tila näppäimistölle: "start" | "rules" | "blank" | "gameover" | "letter" | null
  var ovMode = null;
  var startState = { level: "normaali", count: 2, rackSize: 7 };

  function startScreen() {
    ovMode = "start";
    var saved = lsGet(LS_SETTINGS, null) || {};
    var defCount = (saved.computers != null ? saved.computers : 2) | 0;
    if (defCount < 0) defCount = 0;
    if (defCount > 3) defCount = 3;
    var defRack = (saved.rackSize != null ? saved.rackSize : 7) | 0;
    if (defRack < 5 || defRack > 8) defRack = 7;
    var defLevel = saved.level || "normaali";
    if (defLevel !== "helppo" && defLevel !== "normaali" && defLevel !== "kova") defLevel = "normaali";
    startState = { level: defLevel, count: defCount, rackSize: defRack };

    var html = '<div class="card" data-mode="start"><h1 class="big">Sanaseppä</h1>' +
      '<p class="lead">Muodosta sanoja kirjainlaatoista 15\u00d715-laudalle. Sanat ristikoituvat kuten sanaristikossa. Keskiruudusta saa kaksinkertaiset sanapisteet. Valitse vastustajat (tai harjoittelu yksin), telineen koko ja taso \u2014 sinun pelisi, sinun s\u00e4\u00e4nt\u00f6si.</p>' +
      segControl("cpuCount", "Vastustajia", [{ v: "0", t: "0" }, { v: "1", t: "1" }, { v: "2", t: "2" }, { v: "3", t: "3" }], String(defCount)) +
      segControl("rackSize", "Laattoja telineess\u00e4", [{ v: "5", t: "5" }, { v: "6", t: "6" }, { v: "7", t: "7" }, { v: "8", t: "8" }], String(defRack)) +
      segControl("lvl", "Vastustajien taso", [{ v: "helppo", t: "Helppo" }, { v: "normaali", t: "Normaali" }, { v: "kova", t: "Kova" }], defLevel) +
      '<div class="row"><button class="primary" id="startBtn">Aloita peli</button>' +
      '<button class="ghost" id="rulesBtn2">S\u00e4\u00e4nn\u00f6t</button></div>' +
      '<p class="kbdhint">0 = harjoittelu yksin \u00b7 1\u20133 vastustajat \u00b7 5\u20138 teline \u00b7 Nuolet / Tab / Enter</p></div>';
    openOverlay(html);
    function wire(id, set) {
      ov.querySelectorAll("#" + id + " button").forEach(function (b) {
        b.addEventListener("click", function () {
          ov.querySelectorAll("#" + id + " button").forEach(function (x) { x.classList.remove("on"); });
          b.classList.add("on"); set(b.dataset.v);
        });
      });
    }
    wire("lvl", function (v) { startState.level = v; });
    wire("cpuCount", function (v) { startState.count = v | 0; syncLevelSeg(); });
    wire("rackSize", function (v) { startState.rackSize = v | 0; });
    function syncLevelSeg() {
      var lvl = ov.querySelector("#lvl");
      if (!lvl) return;
      lvl.classList.toggle("dim", startState.count === 0);
    }
    syncLevelSeg();
    el("startBtn").addEventListener("click", function () {
      if (!TRIE) { toast("Sanasto latautuu viel\u00e4\u2026", "warn"); return; }
      ovMode = null;
      newGame({ level: startState.level, computers: startState.count, rackSize: startState.rackSize });
    });
    el("rulesBtn2").addEventListener("click", showRules);
    el("startBtn").focus();
  }

  function showRules() {
    ovMode = "rules";
    var html = '<div class="card" data-mode="rules"><h2>S\u00e4\u00e4nn\u00f6t</h2><div class="rules">' +
      '<p><b>Tavoite.</b> Ker\u00e4\u00e4 enemm\u00e4n pisteit\u00e4 kuin vastustajasi. Voit pelata 1\u20133 nimetty\u00e4 tietokonevastustajaa vastaan (Aapo, Bea, Cesar) tai harjoitella yksin ilman vastustajia.</p>' +
      '<p><b>Vuorot.</b> Pelaajat pelaavat vuorotellen kiinte\u00e4ss\u00e4 j\u00e4rjestyksess\u00e4: Sin\u00e4 \u2192 vastustajat \u2192 takaisin. Jokaisella on oma teline (valittavissa 5\u20138 laattaa); lauta ja pussi ovat yhteiset.</p>' +
      '<p><b>Laattojen asettaminen.</b> Valitse laatta telineest\u00e4 ja aseta se tyhj\u00e4\u00e4n ruutuun (hiiri tai n\u00e4pp\u00e4imist\u00f6). Yhden vuoron laatat menev\u00e4t samalle riville tai sarakkeelle ja muodostavat yhten\u00e4isen sanan.</p>' +
      '<p><b>Vain koko pelin ensimm\u00e4inen sana</b> kulkee keskiruudun (\u2605) kautta.</p>' +
      '<p><b>Liittyminen.</b> My\u00f6hemm\u00e4t sanat koskettavat laudalla olevia laattoja, ja kaikkien muodostuvien sanojen (my\u00f6s ristiin) on l\u00f6ydytt\u00e4v\u00e4 sanalistasta.</p>' +
      '<p><b>Kerroinruudut.</b> 2\u00d7K / 3\u00d7K kaksin-/kolminkertaistavat yhden kirjaimen, 2\u00d7S / 3\u00d7S koko sanan. Kerroin p\u00e4tee vain kun laatta juuri asetetaan.</p>' +
      '<p><b>Koko teline</b> kerralla (kaikki laatat) tuo <b>+' + E.BINGO_BONUS + '</b> bonuspistett\u00e4. <b>Tyhj\u00e4 laatta</b> on mik\u00e4 tahansa kirjain (0 pistett\u00e4).</p>' +
      '<p><b>Vihje</b> paljastaa telineesi parhaan siirron. <b>Vaihda</b> palauttaa valitut laatat pussiin, <b>Ohita</b> luovuttaa vuoron.</p>' +
      '<p>Peli p\u00e4\u00e4ttyy, kun pussi on tyhj\u00e4 ja jonkun teline tyhjenee (tai kun kukaan ei etene). J\u00e4ljelle j\u00e4\u00e4neiden laattojen arvo v\u00e4hennet\u00e4\u00e4n pisteist\u00e4; ulos p\u00e4\u00e4ssyt saa muiden j\u00e4\u00e4nn\u00f6kset.</p>' +
      '<p><b>Nopea n\u00e4pp\u00e4imist\u00f6.</b> Vie kursori nuolilla aloitusruutuun (nuoli lukitsee suunnan; oletus on oikealle). Kirjoita sana: jokainen kirjain asettaa telineen laatan ja etenee automaattisesti (hyppää jo pelattujen yli). <b>Askelpalautin</b> peruu viimeksi asetetun, <b>Enter</b> pelaa sanan, <b>Esc</b> palauttaa kaiken. Tyhj\u00e4: <b>.</b> ja sitten kirjain. Toiminnot: <b>F1</b> Vihje, <b>F2</b> Palauta, <b>F3</b> Sekoita, <b>F4</b> Vaihda, <b>F5</b> Ohita, <b>F6</b> Kirjaimen sanat (tai <b>?</b> = Vihje).</p>' +
      '<p><b>Kirjain.</b> N\u00e4pp\u00e4in <b>F6</b> / nappi <b>Kirjain</b> avaa selain, jossa n\u00e4et valitun kirjaimen sis\u00e4lt\u00e4v\u00e4t sanat sanalistasta. Jos on vuorosi, n\u00e4et my\u00f6s mahdolliset siirtosi joissa kirjainta k\u00e4ytet\u00e4\u00e4n \u2014 napauta siirtoa n\u00e4ytt\u00e4\u00e4ksesi sen laudalla.</p>' +
      '</div><div class="row"><button class="primary" id="rulesClose">Sulje</button></div></div>';
    openOverlay(html);
    el("rulesClose").addEventListener("click", function () {
      if (S && !S.finished) { ovMode = null; closeOverlay(); }
      else startScreen();
    });
    el("rulesClose").focus();
  }

  // ---- Toast ---------------------------------------------------------------
  var toastTimer = null;
  function toast(msg, kind) {
    var t = el("toast");
    t.textContent = msg;
    t.className = "toast show " + (kind || "");
    clearTimeout(toastTimer);
    var ms = kind === "warn" ? 2600 : 4200;
    toastTimer = setTimeout(function () { t.className = "toast"; }, ms);
  }

  // ---- Näppäimistö ---------------------------------------------------------
  function focusableIn(root) {
    return Array.prototype.slice.call(root.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"))
      .filter(function (n) { return !n.disabled && n.offsetParent !== null; });
  }

  function cycleFocus(list, dir) {
    if (!list.length) return;
    var i = list.indexOf(document.activeElement);
    if (i < 0) i = dir > 0 ? -1 : 0;
    var n = (i + dir + list.length * 10) % list.length;
    list[n].focus();
  }

  function nudgeSeg(segId, dir) {
    var btns = Array.prototype.slice.call(ov.querySelectorAll("#" + segId + " button"));
    if (!btns.length) return;
    var i = btns.findIndex(function (b) { return b.classList.contains("on"); });
    i = Math.max(0, Math.min(btns.length - 1, i + dir));
    btns.forEach(function (b) { b.classList.remove("on"); });
    btns[i].classList.add("on");
    btns[i].click();
    btns[i].focus();
  }

  document.addEventListener("keydown", function (e) {
    var key = e.key;
    var overlayOn = ov.classList.contains("on");

    // --- Overlayt ---
    if (overlayOn) {
      // Tyhjän laatan valitsin: kirjoita kirjain suoraan
      if (blankCtx || (ov.querySelector && ov.querySelector(".blankcard"))) {
        if (key === "Escape") { e.preventDefault(); blankCtx = null; closeOverlay(); ovMode = null; return; }
        if (/^[a-zäö]$/i.test(key)) { e.preventDefault(); assignBlank(key.toLowerCase()); return; }
        if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
          e.preventDefault();
          var letters = focusableIn(ov.querySelector(".letters") || ov);
          var cols = 7;
          var i = letters.indexOf(document.activeElement);
          if (i < 0) { letters[0] && letters[0].focus(); return; }
          var d = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : key === "ArrowUp" ? -cols : cols;
          var ni = Math.max(0, Math.min(letters.length - 1, i + d));
          letters[ni].focus();
          return;
        }
        if (key === "Enter" && document.activeElement && document.activeElement.classList.contains("lbtn")) {
          e.preventDefault(); document.activeElement.click(); return;
        }
        return;
      }
      if (ovMode === "tip" || ov.querySelector('[data-mode="tip"]')) {
        if (key === "Escape" || key === "Enter") {
          e.preventDefault();
          var tok = el("tipOk"); if (tok) tok.click();
        }
        return;
      }
      if (ovMode === "letter" || ov.querySelector('[data-mode="letter"]')) {
        if (key === "Escape") { e.preventDefault(); ovMode = null; closeOverlay(); return; }
        if (/^[a-zäö]$/i.test(key)) {
          e.preventDefault();
          letterBrowserCh = key.toLowerCase();
          renderLetterBrowser();
          return;
        }
        return;
      }
      if (ovMode === "rules" || ov.querySelector('[data-mode="rules"]')) {
        if (key === "Escape" || key === "Enter") {
          e.preventDefault();
          var rc = el("rulesClose"); if (rc) rc.click();
        }
        return;
      }
      if (ovMode === "gameover" || ov.querySelector(".ranklist")) {
        if (key === "Escape") { e.preventDefault(); var ga = el("goAgain") || el("goNew"); if (ga) ga.click(); return; }
        if (key === "ArrowLeft" || key === "ArrowRight" || key === "Tab") {
          e.preventDefault();
          cycleFocus(focusableIn(ov), key === "ArrowLeft" || (key === "Tab" && e.shiftKey) ? -1 : 1);
          return;
        }
        if (key === "Enter" && document.activeElement && document.activeElement.tagName === "BUTTON") {
          e.preventDefault(); document.activeElement.click();
        }
        return;
      }
      // Aloitusnäyttö
      if (ovMode === "start" || ov.querySelector('[data-mode="start"]')) {
        if (key === "ArrowLeft") { e.preventDefault();
          if (document.activeElement && document.activeElement.closest("#cpuCount")) nudgeSeg("cpuCount", -1);
          else if (document.activeElement && document.activeElement.closest("#rackSize")) nudgeSeg("rackSize", -1);
          else if (document.activeElement && document.activeElement.closest("#lvl")) nudgeSeg("lvl", -1);
          else nudgeSeg("cpuCount", -1);
          return;
        }
        if (key === "ArrowRight") { e.preventDefault();
          if (document.activeElement && document.activeElement.closest("#cpuCount")) nudgeSeg("cpuCount", 1);
          else if (document.activeElement && document.activeElement.closest("#rackSize")) nudgeSeg("rackSize", 1);
          else if (document.activeElement && document.activeElement.closest("#lvl")) nudgeSeg("lvl", 1);
          else nudgeSeg("cpuCount", 1);
          return;
        }
        if (key === "ArrowUp") { e.preventDefault();
          var ae = document.activeElement;
          if (ae && ae.closest("#lvl")) { var rs = ov.querySelector("#rackSize button.on"); (rs || ov.querySelector("#rackSize button")).focus(); }
          else if (ae && ae.closest("#rackSize")) { var cu = ov.querySelector("#cpuCount button.on"); (cu || ov.querySelector("#cpuCount button")).focus(); }
          else { var cpuBtns = ov.querySelectorAll("#cpuCount button"); (cpuBtns[0] || el("startBtn")).focus(); }
          return;
        }
        if (key === "ArrowDown") { e.preventDefault();
          ae = document.activeElement;
          if (ae && ae.closest("#cpuCount")) { var rso = ov.querySelector("#rackSize button.on"); (rso || ov.querySelector("#rackSize button")).focus(); }
          else if (ae && ae.closest("#rackSize")) { var lo = ov.querySelector("#lvl button.on"); (lo || ov.querySelector("#lvl button")).focus(); }
          else { var lvlOn = ov.querySelector("#lvl button.on"); (lvlOn || el("startBtn")).focus(); }
          return;
        }
        if (key === "Tab") {
          e.preventDefault();
          cycleFocus(focusableIn(ov), e.shiftKey ? -1 : 1);
          return;
        }
        if (key === "Enter") {
          e.preventDefault();
          if (document.activeElement && document.activeElement.tagName === "BUTTON") document.activeElement.click();
          else { var sb = el("startBtn"); if (sb) sb.click(); }
          return;
        }
        if (key === "0" || key === "1" || key === "2" || key === "3") {
          e.preventDefault();
          var cb = ov.querySelector('#cpuCount button[data-v="' + key + '"]');
          if (cb) cb.click();
          return;
        }
        if (key === "5" || key === "6" || key === "7" || key === "8") {
          e.preventDefault();
          var rb = ov.querySelector('#rackSize button[data-v="' + key + '"]');
          if (rb) rb.click();
          return;
        }
        return;
      }
      // Tuntematon overlay: Esc sulkee jos mahdollista
      if (key === "Escape") { e.preventDefault(); closeOverlay(); ovMode = null; }
      return;
    }

    // --- Peli käynnissä ---
    if (!S || S.finished) return;

    // Vaihtotila
    if (S.exchange) {
      if (key === "Escape") { e.preventDefault(); S.exchange = null; render(); toast("Vaihto peruttu.", "warn"); return; }
      if (key === "Enter") { e.preventDefault(); toggleExchange(); return; }
      if (/^[a-zäö]$/i.test(key) || key === "." || key === "_") {
        e.preventDefault();
        var want = (key === "." || key === "_") ? BLANK : key.toLowerCase();
        var hr = human().rack;
        var matches = [];
        for (var xi = 0; xi < hr.length; xi++) if (hr[xi] === want) matches.push(xi);
        if (!matches.length) return;
        var unmarked = -1, lastMarked = -1;
        for (var mi = 0; mi < matches.length; mi++) {
          if (S.exchange[matches[mi]]) lastMarked = matches[mi];
          else if (unmarked < 0) unmarked = matches[mi];
        }
        if (unmarked >= 0) S.exchange[unmarked] = 1;
        else if (lastMarked >= 0) delete S.exchange[lastMarked];
        renderRack();
        return;
      }
      return;
    }

    // Kirjainselain toimii myös tietokoneen vuorolla
    if (key === "F6") { e.preventDefault(); showLetterBrowser(); return; }

    if (!isHumanTurn()) return;

    // F-näppäimet / ? — eivät vie telineen kirjaimia
    if (key === "F1" || key === "?") { e.preventDefault(); showHint(); return; }
    if (key === "F2") { e.preventDefault(); recall(); return; }
    if (key === "F3") { e.preventDefault(); shuffleRack(); return; }
    if (key === "F4") { e.preventDefault(); toggleExchange(); return; }
    if (key === "F5") { e.preventDefault(); passTurn(); return; }

    if (key === "ArrowUp") { e.preventDefault(); moveCursor(-1, 0); return; }
    if (key === "ArrowDown") { e.preventDefault(); moveCursor(1, 0); return; }
    if (key === "ArrowLeft") { e.preventDefault(); moveCursor(0, -1); return; }
    if (key === "ArrowRight") { e.preventDefault(); moveCursor(0, 1); return; }

    // Välilyönti: hiiripariteetti — aseta valittu / palauta pending kursorissa
    if (key === " " || key === "Spacebar") {
      e.preventDefault();
      if (pendingAt(S.cursor.r, S.cursor.c) || S.selected != null) interactAt(S.cursor.r, S.cursor.c);
      return;
    }

    if (key === "Enter") {
      e.preventDefault();
      if (S.pending.length) playWord();
      return;
    }

    if (key === "Backspace" || key === "Delete") {
      e.preventDefault();
      undoLastPending();
      return;
    }

    if (key === "Escape") { e.preventDefault(); recall(); return; }

    if (key === "." || key === "_") {
      e.preventDefault();
      if (findUnusedRackIndex(BLANK) < 0) { toast("Ei tyhj\u00e4\u00e4 laattaa telineess\u00e4.", "warn"); return; }
      S.awaitBlank = true;
      toast("Tyhj\u00e4: kirjoita seuraavaksi kirjain.", "ok");
      return;
    }

    if (/^[a-zäö]$/i.test(key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      var L = key.toLowerCase();
      if (S.awaitBlank) typePlaceBlankAs(L);
      else typePlaceLetter(L);
    }
  });

  // ---- Napit ---------------------------------------------------------------
  el("btnPlay").addEventListener("click", playWord);
  el("btnHint").addEventListener("click", showHint);
  el("btnLetter").addEventListener("click", function () { showLetterBrowser(); });
  el("btnRecall").addEventListener("click", recall);
  el("btnShuffle").addEventListener("click", shuffleRack);
  el("btnExchange").addEventListener("click", toggleExchange);
  el("btnPass").addEventListener("click", passTurn);
  el("btnRules").addEventListener("click", showRules);
  el("btnNew").addEventListener("click", startScreen);

  // ---- Käynnistys: rakenna trie maalauksen jälkeen -------------------------
  startScreen();
  el("btnLetter").disabled = true;
  setTimeout(function () {
    TRIE = E.buildTrie(WORDS);
    el("loading").style.display = "none";
    el("btnLetter").disabled = false;
  }, 30);
})();
