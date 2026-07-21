// Sanasato — selainsovellus (DOM). Ydin: globalThis.SanasatoEngine (engine.js).
// Sanasto luetaan <script id="sanat" type="text/plain"> -lohkosta.
(function () {
  "use strict";
  var E = globalThis.SanasatoEngine;
  var el = function (id) { return document.getElementById(id); };
  var ov = el("ov");

  // ---- Sanasto & trie (raskas rakennus tehdään maalauksen jälkeen) --------
  var WORDS = el("sanat").textContent.split("\n").filter(Boolean);
  var TRIE = null;

  // ---- Arvoasteikko: osuus laudan maksimipisteistä ------------------------
  // Kynnykset on viritetty saavutettaviksi (SDT: pätevyys syntyy kun on
  // "säännöllisesti hallinnan alueella", ei jatkuvasti äärirajoilla).
  var RANKS = [
    { min: 0.00, name: "Aloittelija" },
    { min: 0.05, name: "Sananjyvä" },
    { min: 0.12, name: "Sanaseppä" },
    { min: 0.22, name: "Sanataituri" },
    { min: 0.35, name: "Sanasato" },
    { min: 0.55, name: "Sanamestari" },
  ];
  function rankFor(frac) {
    var r = RANKS[0], idx = 0;
    for (var i = 0; i < RANKS.length; i++) if (frac >= RANKS[i].min) { r = RANKS[i]; idx = i; }
    return { rank: r, idx: idx };
  }

  var S = null;      // kierroksen tila
  var timerId = null;

  // ---- localStorage apurit -------------------------------------------------
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function bestKey(cfg) { return "sanasato.best." + (cfg.zen ? "zen" : "aika") + "." + cfg.size; }

  function todaySeed() {
    var d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  function todayStr() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  // ---- Kierroksen aloitus --------------------------------------------------
  function newRound(cfg) {
    clearInterval(timerId);
    var rng = E.makeRNG(cfg.seed >>> 0);
    var gen = E.generateBoard(cfg.size, TRIE, rng, {});
    S = {
      cfg: cfg,
      board: gen.board, size: cfg.size,
      solution: gen.solution, maxScore: Math.max(1, E.maxScore(gen.solution)),
      found: new Set(), score: 0, streak: 0, bestStreak: 0,
      path: [], dragging: false, moved: false, locked: false,
      timeLeft: cfg.zen ? Infinity : cfg.time * 1000,
      running: true, hints: 3,
    };
    el("game").classList.remove("hidden");
    ov.innerHTML = "";
    renderBoard();
    renderHUD();
    setCurword();
    setToast("", "");
    el("foundList").innerHTML = '<div class="empty">Piirrä sormella tai hiirellä vierekkäisten kirjainten läpi. Kirjain saa esiintyä sanassa vain kerran.</div>';
    el("btnHint").textContent = "Vihje (" + S.hints + ")";
    el("btnFinish").style.display = "";
    el("timer").className = "timer" + (cfg.zen ? " zen" : "");
    el("timerFill").style.width = "100%";
    if (!cfg.zen) startTimer();
  }

  function startTimer() {
    var total = S.cfg.time * 1000;
    var endsAt = Date.now() + S.timeLeft;
    timerId = setInterval(function () {
      S.timeLeft = Math.max(0, endsAt - Date.now());
      var frac = S.timeLeft / total;
      el("timerFill").style.width = (frac * 100) + "%";
      el("timer").classList.toggle("warn", frac < 0.25);
      if (S.timeLeft <= 0) { clearInterval(timerId); endRound(); }
    }, 100);
  }

  // ---- Laudan piirto -------------------------------------------------------
  function renderBoard() {
    var board = el("board");
    board.style.gridTemplateColumns = "repeat(" + S.size + ", 1fr)";
    // ruudun koko: mahtuu leveyteen
    var maxW = Math.min(document.querySelector(".wrap").clientWidth, 520);
    var tw = Math.floor((maxW - 24 - (S.size - 1) * 8) / S.size);
    tw = Math.min(tw, S.size <= 4 ? 108 : 90);
    document.documentElement.style.setProperty("--tw", tw + "px");
    board.innerHTML = "";
    for (var i = 0; i < S.board.length; i++) {
      var d = document.createElement("div");
      d.className = "tile";
      d.dataset.idx = i;
      d.textContent = S.board[i];
      board.appendChild(d);
    }
  }

  // ---- HUD & arvopalkki ----------------------------------------------------
  function renderHUD() {
    setVal("score", S.score, true);
    setVal("streak", S.streak);
    setVal("wcount", S.found.size);
    el("streakSub").textContent = "paras " + S.bestStreak;
    el("wcountSub").textContent = "/ " + S.solution.size + " mahd.";
    el("scoreSub").textContent = Math.round((S.score / S.maxScore) * 100) + "% sadosta";

    var frac = S.score / S.maxScore;
    var rf = rankFor(frac);
    el("rank").textContent = rf.rank.name;
    var fillPct, nextTxt;
    if (rf.idx >= RANKS.length - 1) {
      fillPct = 100; nextTxt = "Huipulla \u2b50";
    } else {
      var curNeed = RANKS[rf.idx].min * S.maxScore;
      var nextNeed = RANKS[rf.idx + 1].min * S.maxScore;
      fillPct = Math.max(0, Math.min(100, ((S.score - curNeed) / (nextNeed - curNeed)) * 100));
      var rem = Math.max(1, Math.ceil(nextNeed - S.score));
      nextTxt = rem + " p \u2192 " + RANKS[rf.idx + 1].name;
    }
    el("rankFill").style.width = fillPct + "%";
    el("rankNext").textContent = nextTxt;
  }
  function setVal(id, v, pulse) {
    var node = el(id);
    if (node.textContent !== String(v)) {
      node.textContent = v;
      if (pulse) { node.classList.remove("pulse"); void node.offsetWidth; node.classList.add("pulse"); }
    }
  }

  // ---- Valinta (veto sormella/hiirellä + napautus) -------------------------
  function tileFromPoint(x, y) {
    var t = document.elementFromPoint(x, y);
    if (t && t.classList.contains("tile")) return +t.dataset.idx;
    return -1;
  }
  var lastIdx = function () { return S.path.length ? S.path[S.path.length - 1] : -1; };

  function extendTo(idx) {
    if (idx < 0) return;
    var pos = S.path.indexOf(idx);
    if (pos >= 0) {
      // vedä takaisin: jos toiseksi viimeinen -> peruuta yksi askel
      if (pos === S.path.length - 2) { S.path.pop(); paintPath(); }
      return;
    }
    if (S.path.length === 0) { S.path.push(idx); paintPath(); return; }
    if (E.isAdjacent(lastIdx(), idx, S.size)) { S.path.push(idx); paintPath(); }
  }

  function tapCell(idx) {
    if (S.path.length === 0) { S.path.push(idx); paintPath(); return; }
    if (idx === lastIdx()) { submitPath(); return; }
    var pos = S.path.indexOf(idx);
    if (pos >= 0) { S.path = S.path.slice(0, pos + 1); paintPath(); return; }
    if (E.isAdjacent(lastIdx(), idx, S.size)) { S.path.push(idx); paintPath(); return; }
    S.path = [idx]; paintPath();
  }

  function paintPath() {
    var tiles = el("board").children;
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i]; t.className = "tile";
      var ord = t.querySelector(".ord"); if (ord) ord.remove();
    }
    for (var k = 0; k < S.path.length; k++) {
      var idx = S.path[k];
      var tile = tiles[idx];
      tile.classList.add("sel");
      if (k === S.path.length - 1) tile.classList.add("head");
      var sp = document.createElement("span");
      sp.className = "ord"; sp.textContent = k + 1;
      tile.appendChild(sp);
    }
    drawLine();
    setCurword();
  }

  function drawLine() {
    var svg = el("lines");
    var poly = svg.querySelector("polyline");
    if (S.path.length < 1) { poly.setAttribute("points", ""); return; }
    var stage = el("stage").getBoundingClientRect();
    var tiles = el("board").children;
    var pts = [];
    for (var i = 0; i < S.path.length; i++) {
      var r = tiles[S.path[i]].getBoundingClientRect();
      pts.push((r.left + r.width / 2 - stage.left) + "," + (r.top + r.height / 2 - stage.top));
    }
    poly.setAttribute("points", pts.join(" "));
  }

  function setCurword() {
    var w = E.pathWord(S.path, S.board);
    var node = el("curword");
    if (!w) { node.innerHTML = ""; return; }
    var html = w.toUpperCase();
    if (w.length >= 3 && E.trieHas(TRIE, w) && !S.found.has(w)) {
      html += '<span class="pts">+' + E.scoreWord(w) + "</span>";
    }
    node.innerHTML = html;
  }

  function clearPath() { S.path = []; paintPath(); }

  function submitPath() {
    if (S.locked || !S.running) { return; }
    var w = E.pathWord(S.path, S.board);
    if (w.length < 3) { flash("bad", "V\u00e4h. 3 kirjainta", "warn"); return; }
    if (S.found.has(w)) { flash("dup", "Jo l\u00f6ydetty", "warn"); S.streak = 0; renderHUD(); return; }
    if (!E.trieHas(TRIE, w)) { flash("bad", "Ei sanakirjassa", "err"); S.streak = 0; renderHUD(); return; }
    // hyväksytty
    var pts = E.scoreWord(w);
    S.found.add(w);
    S.score += pts;
    S.streak += 1;
    if (S.streak > S.bestStreak) S.bestStreak = S.streak;
    var bonusTxt = S.streak >= 3 ? "  \u00d7" + S.streak + " putki" : "";
    flash("good", "+" + pts + " " + w.toUpperCase() + bonusTxt, "ok");
    addChip(w, pts);
    renderHUD();
    // uusi ennätys-vinkki hoituu lopussa
  }

  // vilautus: väritä valitut ruudut hetkeksi, sitten tyhjennä polku
  function flash(kind, msg, toastKind) {
    var stage = el("stage");
    stage.classList.add(kind);
    setToast(msg, toastKind);
    S.locked = true;
    setTimeout(function () {
      stage.classList.remove(kind);
      S.locked = false;
      clearPath();
    }, 300);
  }

  var toastTimer = null;
  function setToast(msg, kind) {
    var t = el("toast");
    t.className = "toast" + (kind ? " " + kind + " show" : "");
    t.textContent = msg;
    clearTimeout(toastTimer);
    if (msg) toastTimer = setTimeout(function () { t.classList.remove("show"); }, 1400);
  }

  function addChip(w, pts) {
    var list = el("foundList");
    if (list.querySelector(".empty")) list.innerHTML = "";
    var c = document.createElement("span");
    c.className = "chip" + (w.length >= 6 ? " long" : "");
    c.title = "N\u00e4yt\u00e4 laudalla";
    c.innerHTML = w.toUpperCase() + "<b>" + pts + "</b>";
    c.onclick = function () { previewWord(w); };
    list.insertBefore(c, list.firstChild);
    el("foundMeta").textContent = S.found.size + " sanaa \u00b7 " + S.score + " p";
  }

  // Näytä löydetyn sanan reitti laudalla (klikkaa sirua). Latautuu valinnaksi,
  // jonka voi tyhjentää tai jatkaa uuteen sanaan.
  function previewWord(w) {
    if (!S || S.locked || S.dragging) return;
    var p = S.solution.get(w);
    if (!p) return;
    S.path = p.slice();
    paintPath();
    setToast(w.toUpperCase(), "ok");
  }

  // ---- Vihje ---------------------------------------------------------------
  function giveHint() {
    if (!S.running || S.hints <= 0) return;
    var candidates = [];
    S.solution.forEach(function (_p, w) { if (!S.found.has(w) && w.length >= 4) candidates.push(w); });
    if (candidates.length === 0) { setToast("Ei vihjeit\u00e4 j\u00e4ljell\u00e4", "warn"); return; }
    var w = candidates[Math.floor(Math.random() * candidates.length)];
    S.hints -= 1;
    el("btnHint").textContent = "Vihje (" + S.hints + ")";
    setToast("Kokeile: " + w.slice(0, 2).toUpperCase() + "\u2026 (" + w.length + " kirj.)", "warn");
    // korosta ensimmäinen ruutu hetkeksi
    var p = S.solution.get(w);
    var tile = el("board").children[p[0]];
    tile.classList.add("head");
    setTimeout(function () { if (!S.path.length) tile.classList.remove("head"); }, 1200);
  }

  // ---- Kierroksen loppu & tulokset ----------------------------------------
  function endRound() {
    S.running = false;
    clearInterval(timerId);
    clearPath();

    var frac = S.score / S.maxScore;
    var rf = rankFor(frac);
    var cov = Math.round(frac * 100);
    var wordCov = Math.round((S.found.size / Math.max(1, S.solution.size)) * 100);

    // paras oma löytö
    var bestWord = "", bestPts = -1;
    S.found.forEach(function (w) { var p = E.scoreWord(w); if (p > bestPts || (p === bestPts && w.length > bestWord.length)) { bestPts = p; bestWord = w; } });

    // pisin mahdollinen (läheltä piti)
    var longest = "";
    S.solution.forEach(function (_p, w) { if (w.length > longest.length) longest = w; });

    // ennätys
    var bk = bestKey(S.cfg);
    var prevBest = S.cfg.mode === "daily" ? null : lsGet(bk, 0);
    var isBest = prevBest != null && S.score > prevBest;
    if (S.cfg.mode !== "daily" && S.score > (prevBest || 0)) lsSet(bk, S.score);

    if (S.cfg.mode === "daily") {
      lsSet("sanasato.daily." + todayStr(), { score: S.score, found: S.found.size, rank: rf.rank.name, cov: cov });
    }

    // listat: kaikki laudan sanat pituuden mukaan, merkitään löydetyt
    var all = [];
    S.solution.forEach(function (_p, w) { all.push(w); });
    all.sort(function (a, b) { return b.length - a.length || (a < b ? -1 : 1); });
    var top = all.slice(0, 48);

    var hero =
      '<div class="res-hero"><div class="rk">' + rf.rank.name + "</div>" +
      '<div class="sc">' + S.score + " pistett\u00e4 \u00b7 " + cov + "% sadosta korjattu</div></div>";

    var badge = isBest ? '<div style="text-align:center"><span class="best-badge">\u2b50 Uusi enn\u00e4tys!</span></div>' : "";

    var grid =
      '<div class="res-grid">' +
      cell("Sanoja", S.found.size + ' <small>/ ' + S.solution.size + "</small>") +
      cell("Sanakattavuus", wordCov + "%") +
      cell("Pisin putki", "\u00d7" + S.bestStreak) +
      cell("Paras l\u00f6yt\u00f6", (bestWord ? bestWord.toUpperCase() + ' <small>' + bestPts + "p</small>" : "\u2014"), "word") +
      cell("Pisin mahdollinen sana", longest.toUpperCase(), "word wide") +
      "</div>";

    var missHtml = '<div class="miss"><h4>Laudan sanat (l\u00f6yt\u00e4m\u00e4si vihre\u00e4ll\u00e4)</h4><div class="list">' +
      top.map(function (w) {
        return '<span class="m' + (S.found.has(w) ? " got" : "") + '">' + w.toUpperCase() + "</span>";
      }).join("") +
      (all.length > top.length ? '<span class="m">+' + (all.length - top.length) + " lis\u00e4\u00e4\u2026</span>" : "") +
      "</div></div>";

    var shareBtn = S.cfg.mode === "daily"
      ? '<button class="primary sec" id="resShare">Jaa tulos</button>'
      : "";

    var btns =
      '<div class="btnrow">' +
      '<button class="primary" id="resAgain">' + (S.cfg.mode === "daily" ? "Uusi lauta" : "Uusi lauta") + "</button>" +
      shareBtn +
      "</div>" +
      '<button class="primary sec" id="resMenu" style="margin-top:9px">Valikkoon</button>';

    openOverlay('<div class="panel">' + hero + badge + grid + missHtml + btns + "</div>");

    if (el("resAgain")) el("resAgain").onclick = function () {
      newRound(makeCfg(S.cfg.size, S.cfg.time, S.cfg.zen, (Math.random() * 1e9) | 0, "custom"));
    };
    if (el("resMenu")) el("resMenu").onclick = openMenu;
    if (el("resShare")) el("resShare").onclick = function () { shareDaily(S, rf.rank.name, cov, wordCov); };
  }
  function cell(k, v, cls) {
    return '<div class="res-cell' + (cls && cls.indexOf("wide") >= 0 ? " wide" : "") + '"><div class="k">' + k +
      '</div><div class="v' + (cls ? " " + cls.replace("wide", "").trim() : "") + '">' + v + "</div></div>";
  }

  function shareDaily(s, rankName, cov, wordCov) {
    var bars = "";
    // pieni "sato"-mittari: täydet tähkät kattavuuden mukaan (0–10)
    var full = Math.round(cov / 10);
    for (var i = 0; i < 10; i++) bars += i < full ? "\ud83c\udf3e" : "\u00b7";
    var txt = "Sanasato \u2014 P\u00e4iv\u00e4n pulma " + todayStr() + "\n" +
      s.score + " p \u00b7 " + s.found.size + " sanaa \u00b7 " + rankName + "\n" +
      bars + " " + cov + "%\n" +
      "selainpelit.fi/sanasato";
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(
        function () { setToast("Tulos kopioitu leikep\u00f6yd\u00e4lle", "ok"); },
        function () { fallbackShare(txt); }
      );
    } else fallbackShare(txt);
  }
  function fallbackShare(txt) {
    window.prompt("Kopioi tulos:", txt);
  }

  // ---- Overlayt: valikko, säännöt, tutkimustieto --------------------------
  function openOverlay(html, onBackdrop) {
    ov.innerHTML = '<div class="overlay">' + html + "</div>";
    var o = ov.querySelector(".overlay");
    if (onBackdrop) o.onclick = function (e) { if (e.target === o) onBackdrop(); };
  }
  function closeOverlay() { ov.innerHTML = ""; }

  var lastCfg = lsGet("sanasato.cfg", { size: 4, time: 90, zen: false });
  function makeCfg(size, time, zen, seed, mode) {
    return { size: size, time: time, zen: zen, seed: seed, mode: mode || "custom" };
  }

  function openMenu() {
    clearInterval(timerId);
    var doneToday = lsGet("sanasato.daily." + todayStr(), null);
    var dailyNote = doneToday
      ? "T\u00e4n\u00e4\u00e4n: " + doneToday.score + " p \u00b7 " + doneToday.rank
      : "4\u00d74 \u00b7 90 s \u00b7 sama lauta kaikille t\u00e4n\u00e4\u00e4n";
    var html =
      '<div class="panel">' +
      '<h2>Sanasato</h2>' +
      '<p>Kokoa mahdollisimman monta suomen sanaa yhdist\u00e4m\u00e4ll\u00e4 vierekk\u00e4isi\u00e4 kirjaimia. Pidemm\u00e4t sanat tuovat enemm\u00e4n pisteit\u00e4.</p>' +
      '<button class="primary" id="mDaily">\ud83c\udf3e P\u00e4iv\u00e4n pulma</button>' +
      '<p style="text-align:center;margin:7px 0 16px;font-size:12px">' + dailyNote + "</p>" +
      '<div class="field"><div class="flabel">Ruudukko</div><div class="seg" id="mSize">' +
      '<button data-v="4">4\u00d74</button><button data-v="5">5\u00d75</button></div></div>' +
      '<div class="field"><div class="flabel">Kierroksen kesto</div><div class="seg" id="mTime">' +
      '<button data-v="60">60 s</button><button data-v="90">90 s</button><button data-v="180">3 min</button>' +
      '<button data-v="0">Rauha</button></div></div>' +
      '<button class="primary" id="mStart">Aloita oma peli</button>' +
      "</div>";
    openOverlay(html);

    var size = lastCfg.size, time = lastCfg.zen ? 0 : lastCfg.time;
    var segSize = el("mSize"), segTime = el("mTime");
    function paintSeg(seg, v) {
      seg.querySelectorAll("button").forEach(function (b) { b.classList.toggle("on", +b.dataset.v === v); });
    }
    paintSeg(segSize, size); paintSeg(segTime, time);
    segSize.querySelectorAll("button").forEach(function (b) { b.onclick = function () { size = +b.dataset.v; paintSeg(segSize, size); }; });
    segTime.querySelectorAll("button").forEach(function (b) { b.onclick = function () { time = +b.dataset.v; paintSeg(segTime, time); }; });

    el("mDaily").onclick = function () {
      lastCfg = { size: 4, time: 90, zen: false }; lsSet("sanasato.cfg", lastCfg);
      newRound(makeCfg(4, 90, false, todaySeed(), "daily"));
    };
    el("mStart").onclick = function () {
      var zen = time === 0;
      lastCfg = { size: size, time: zen ? 90 : time, zen: zen }; lsSet("sanasato.cfg", lastCfg);
      newRound(makeCfg(size, zen ? 999999 : time, zen, (Math.random() * 1e9) | 0, "custom"));
    };
  }

  function openRules() {
    openOverlay(
      '<div class="panel"><h2>S\u00e4\u00e4nn\u00f6t</h2><ul class="rules-list">' +
      "<li>Muodosta sana yhdist\u00e4m\u00e4ll\u00e4 <b>vierekk\u00e4isi\u00e4</b> kirjaimia \u2014 my\u00f6s vinottain.</li>" +
      "<li>Sama ruutu saa esiinty\u00e4 sanassa <b>vain kerran</b>.</li>" +
      "<li>Sana on kelvollinen, jos se l\u00f6ytyy <b>suomen sanalistalta</b> (perusmuodot).</li>" +
      "<li>V\u00e4himm\u00e4ispituus <b>3 kirjainta</b>. Pidemm\u00e4t = enemm\u00e4n pisteit\u00e4: 3\u20134\u21921, 5\u21922, 6\u21923, 7\u21925, 8+\u219211.</li>" +
      "<li>Piirr\u00e4 sormella/hiirell\u00e4 ja irrota \u2014 tai napauta kirjaimet ja napauta viimeist\u00e4 uudelleen.</li>" +
      "<li><b>N\u00e4pp\u00e4imist\u00f6ll\u00e4:</b> kirjoita kirjaimet, <b>Enter</b> l\u00e4hett\u00e4\u00e4, <b>askelpalautin</b> peruu, <b>Esc</b> tyhjent\u00e4\u00e4.</li>" +
      "<li><b>Putki</b> kasvaa per\u00e4kk\u00e4isist\u00e4 osumista; virhe nollaa sen.</li>" +
      "</ul><button class=\"primary\" id=\"rClose\">Selv\u00e4</button></div>",
      closeOverlay
    );
    el("rClose").onclick = closeOverlay;
  }

  // ---- Tapahtumat ----------------------------------------------------------
  function bindBoard() {
    var stage = el("stage");
    stage.addEventListener("pointerdown", function (e) {
      if (S.locked || !S.running) return;
      var idx = tileFromPoint(e.clientX, e.clientY);
      if (idx < 0) return;
      e.preventDefault();
      S.dragging = true; S.moved = false; S._downIdx = idx;
    });
    document.addEventListener("pointermove", function (e) {
      if (!S || !S.dragging || S.locked) return;
      var idx = tileFromPoint(e.clientX, e.clientY);
      if (idx < 0) return;
      if (!S.moved) {
        if (idx !== S._downIdx) { S.moved = true; S.path = [S._downIdx]; extendTo(idx); }
      } else {
        extendTo(idx);
      }
    });
    document.addEventListener("pointerup", function () {
      if (!S || !S.dragging) return;
      S.dragging = false;
      if (S.moved) { submitPath(); }
      else if (S._downIdx >= 0) { tapCell(S._downIdx); }
      S._downIdx = -1;
    });
    window.addEventListener("resize", function () { if (S) { renderBoard(); paintPath(); } });
    document.addEventListener("keydown", onKey);
  }

  // Näppäimistösyöttö: kirjoita kirjaimet, Enter lähettää, Backspace peruu,
  // Esc tyhjentää. Kirjain jatkaa polkua viereiseen ruutuun; jos suora jatko ei
  // onnistu, koko sanalle etsitään uusi laillinen polku (itsekorjautuva).
  function onKey(e) {
    if (!S || !S.running || S.locked) return;
    if (ov.innerHTML !== "") return;                 // overlay auki -> ei syötteitä
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key;
    if (k === "Enter") { e.preventDefault(); if (S.path.length) submitPath(); return; }
    if (k === "Backspace") { e.preventDefault(); if (S.path.length) { S.path.pop(); paintPath(); } return; }
    if (k === "Escape") { e.preventDefault(); clearPath(); return; }
    if (k.length !== 1) return;
    var ch = k.toLowerCase();
    if (!/^[a-zäöå]$/.test(ch)) return;
    e.preventDefault();
    // 1) yritä jatkaa nykyistä polkua viereiseen käyttämättömään ruutuun
    if (S.path.length) {
      var last = S.path[S.path.length - 1];
      for (var i = 0; i < S.board.length; i++) {
        if (S.board[i] === ch && S.path.indexOf(i) < 0 && E.isAdjacent(last, i, S.size)) {
          S.path.push(i); paintPath(); return;
        }
      }
    } else {
      // aloitus: ensimmäinen ruutu jossa kirjain
      var idx = S.board.indexOf(ch);
      if (idx >= 0) { S.path = [idx]; paintPath(); return; }
    }
    // 2) itsekorjaus: etsi koko sanalle uusi polku
    var want = E.pathWord(S.path, S.board) + ch;
    var np = E.findPath(S.board, S.size, want);
    if (np) { S.path = np; paintPath(); return; }
    // 3) ei muodostettavissa
    setToast("Ei muodostettavissa", "warn");
  }

  el("btnNew").onclick = openMenu;
  el("btnRules").onclick = openRules;
  el("btnClear").onclick = function () { if (S) clearPath(); };
  el("btnHint").onclick = giveHint;
  el("btnFinish").onclick = function () { if (S && S.running) endRound(); };

  // ---- Käynnistys: rakenna trie maalauksen jälkeen ------------------------
  bindBoard();
  setTimeout(function () {
    TRIE = E.buildTrie(WORDS);
    el("loading").style.display = "none";
    openMenu();
  }, 30);
})();
