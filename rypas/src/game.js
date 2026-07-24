// Rypäs — selainsovellus (DOM). Ydin: globalThis.RypasEngine.
(function () {
  "use strict";
  var E = globalThis.RypasEngine;
  var el = function (id) { return document.getElementById(id); };

  var NAMES = ["Sinä", "Tietokone"];
  var AI_DELAY = 650;   // "miettimistauko" ennen koneen siirtoa
  var AI_PAUSE = 1200;  // tauko koneen pelaaman siirron jälkeen, jotta ehtii nähdä

  function makeNames(playerCount) {
    if (playerCount <= 2) return ["Sinä", "Tietokone"];
    var names = ["Sinä"];
    for (var i = 1; i < playerCount; i++) names.push("Kone " + i);
    return names;
  }

  var G = null;
  var snap = null; // vuoron alku
  var workBoard = null;
  var workRack = null;
  var pool = []; // pöydältä puretut (työalue)
  var sel = {}; // id -> true
  var selSet = null;
  var busy = false;
  var justDrawn = null; // viimeksi nostetun palan id — korostetaan telineessä
  var flashSets = {}; // koneen juuri muuttamien rypäiden tunnisteet

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

  // Viimeksi valitut asetukset — esitäytetään uuteen peliin
  var lastOpts = { opps: 1, rackSize: E.RACK_SIZE, openMin: E.INITIAL_MELD, matchTarget: E.MATCH_TARGET, difficulty: "normaali" };

  function fmtTarget(v) {
    return +v > 0 ? v + " p" : "Yksi erä";
  }

  function startScreen() {
    var oppOpts = [1, 2, 3].map(function (n) {
      var checked = n === lastOpts.opps ? " checked" : "";
      return "<label><input type=\"radio\" name=\"opps\" value=\"" + n + "\"" + checked + "> " + n + "</label>";
    }).join("");
    openOverlay(
      "<h2>Rypäs</h2>" +
      "<p class=\"lead\">Muodosta numerorypäitä, tyhjennä telineesi ja kerää ottelupisteitä — ensimmäinen tavoitteeseen voittaa.</p>" +
      "<p>Ryhmä = sama numero, eri värit (3–4). Jono = sama väri, peräkkäiset (≥3).</p>" +
      "<div class=\"field-label\">Vastustajia</div>" +
      "<div class=\"diff\">" + oppOpts + "</div>" +
      "<div class=\"field-label\">Aloituspalat telineeseen: <span class=\"slider-val\" id=\"rackVal\">" + lastOpts.rackSize + "</span></div>" +
      "<input type=\"range\" class=\"slider\" id=\"rackSlider\" min=\"" + E.RACK_SIZE_MIN + "\" max=\"" + E.RACK_SIZE_MAX + "\" step=\"1\" value=\"" + lastOpts.rackSize + "\">" +
      "<div class=\"field-label\">Avausraja: <span class=\"slider-val\" id=\"openVal\">" + lastOpts.openMin + "</span> p</div>" +
      "<input type=\"range\" class=\"slider\" id=\"openSlider\" min=\"" + E.OPEN_MIN_MIN + "\" max=\"" + E.OPEN_MIN_MAX + "\" step=\"5\" value=\"" + lastOpts.openMin + "\">" +
      "<div class=\"field-label\">Ottelun pituus: <span class=\"slider-val\" id=\"targetVal\">" + fmtTarget(lastOpts.matchTarget) + "</span></div>" +
      "<input type=\"range\" class=\"slider\" id=\"targetSlider\" min=\"0\" max=\"" + E.MATCH_TARGET_MAX + "\" step=\"50\" value=\"" + lastOpts.matchTarget + "\">" +
      "<div class=\"field-label\">Vaikeus</div>" +
      "<div class=\"diff\">" +
      "<label><input type=\"radio\" name=\"diff\" value=\"helppo\"" + (lastOpts.difficulty === "helppo" ? " checked" : "") + "> Helppo</label>" +
      "<label><input type=\"radio\" name=\"diff\" value=\"normaali\"" + (lastOpts.difficulty === "normaali" ? " checked" : "") + "> Normaali</label>" +
      "</div>" +
      "<div class=\"ov-actions\">" +
      "<button class=\"go\" id=\"ovStart\">Aloita peli</button>" +
      "<button class=\"ghost\" id=\"ovRules\">Säännöt</button>" +
      "</div>"
    );
    el("rackSlider").oninput = function () { el("rackVal").textContent = this.value; };
    el("openSlider").oninput = function () { el("openVal").textContent = this.value; };
    el("targetSlider").oninput = function () { el("targetVal").textContent = fmtTarget(this.value); };
    el("ovStart").onclick = function () {
      var d = document.querySelector("input[name=diff]:checked");
      var o = document.querySelector("input[name=opps]:checked");
      lastOpts = {
        opps: o ? +o.value : 1,
        rackSize: +el("rackSlider").value,
        openMin: +el("openSlider").value,
        matchTarget: +el("targetSlider").value,
        difficulty: d ? d.value : "normaali",
      };
      newGame({
        difficulty: lastOpts.difficulty,
        rackSize: lastOpts.rackSize,
        openMin: lastOpts.openMin,
        matchTarget: lastOpts.matchTarget,
        playerCount: lastOpts.opps + 1,
      });
    };
    el("ovRules").onclick = showRules;
  }

  function confirmNewGame() {
    openOverlay(
      "<h2>Uusi peli?</h2>" +
      "<p class=\"lead\">Nykyinen ottelu keskeytyy ja pistetilanne menetetään.</p>" +
      "<div class=\"ov-actions\">" +
      "<button class=\"go\" id=\"ovYes\">Kyllä, uusi peli</button>" +
      "<button class=\"ghost\" id=\"ovNo\">Jatka peliä</button>" +
      "</div>"
    );
    el("ovYes").onclick = function () { startScreen(); };
    el("ovNo").onclick = closeOverlay;
  }

  function showRules() {
    openOverlay(
      "<h2>Säännöt</h2>" +
      "<ul>" +
      "<li><strong>Ottelu:</strong> pelataan eriä, kunnes joku saavuttaa ottelutavoitteen (valittavissa; \"Yksi erä\" = pikapeli).</li>" +
      "<li><strong>Erä:</strong> tyhjennä telineesi ensimmäisenä — saat vastustajien jäljellä olevat pisteet (heille miinus).</li>" +
      "<li><strong>Aloitus:</strong> valitse vastustajien määrä (1–3), aloituspalat (5–20) ja avausraja (0–50 p) liukusäätimillä.</li>" +
      "<li><strong>Ryhmä:</strong> sama numero, eri värit, 3–4 palaa.</li>" +
      "<li><strong>Jono:</strong> sama väri, peräkkäiset numerot, vähintään 3.</li>" +
      "<li><strong>Jokerit</strong> korvaavat minkä tahansa palan. Kädessä jokerin sakko on 30.</li>" +
      "<li><strong>Avaus:</strong> ensimmäisellä siirrolla vähintään avausrajan verran pisteitä omista paloista (pöytää ei saa vielä järjestellä).</li>" +
      "<li>Avauksen jälkeen voit purkaa ja järjestellä pöydän rypäitä, kunhan vuoron lopussa kaikki rypäät kelpaavat ja olet pelannut vähintään yhden uuden palan.</li>" +
      "<li><strong>Raahaa</strong> paloja telineestä pöydälle, rypäästä toiseen tai tyhjään kohtaan (uusi rypäs). Vajaa rypäs näkyy punaisena. Jos vuoron lopussa pöytä ei kelpaa, laatat palautuvat paikoilleen.</li>" +
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

  function buildHud() {
    var hud = el("hud");
    hud.innerHTML = "";
    for (var p = 0; p < G.playerCount; p++) {
      var box = document.createElement("div");
      box.className = "pscore";
      box.id = "hudP" + p;
      box.innerHTML =
        '<div class="nm"><span id="s' + p + 'name"></span><span>ottelu</span></div>' +
        '<div class="pt" id="m' + p + '">0</div>' +
        '<div class="lm"><span id="s' + p + '">0</span> palaa · <span id="last' + p + '"></span></div>';
      hud.appendChild(box);
    }
    var bag = document.createElement("div");
    bag.className = "bagbox";
    bag.innerHTML = '<div class="nm">Pussi</div><div class="pt" id="bag">0</div>';
    hud.appendChild(bag);
    hud.className = "hud p" + G.playerCount;
  }

  function newGame(opts) {
    G = E.newGame(opts || {});
    NAMES = makeNames(G.playerCount);
    buildHud();
    busy = false;
    justDrawn = null;
    flashSets = {};
    el("game").classList.remove("hidden");
    closeOverlay();
    beginHumanTurn();
    setStatus(G.openMin > 0
      ? "Sinun vuorosi — valitse paloja ja muodosta rypäs (avaus ≥" + G.openMin + " p)."
      : "Sinun vuorosi — valitse paloja ja muodosta rypäs.");
    toast(G.round > 1
      ? "Erä " + G.round + " — tyhjennä telineesi!"
      : G.matchTarget > 0
        ? "Ottelu " + G.matchTarget + " pisteeseen — tyhjennä telineesi!"
        : "Pikapeli: yksi erä — tyhjennä telineesi!");
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

  function setSig(set) {
    return set.map(function (t) { return t.id; }).sort(function (a, b) { return a - b; }).join(",");
  }

  /** Synkkaa työnäkymä pelitilasta (AI-vuorojen aikana ja noston jälkeen). */
  function syncWork() {
    workBoard = E.cloneBoard(G.board);
    workRack = G.racks[0].map(E.cloneTile);
    pool = [];
    sel = {};
    selSet = null;
  }

  function beginHumanTurn() {
    snap = {
      board: E.cloneBoard(G.board),
      rack: G.racks[0].map(E.cloneTile),
    };
    syncWork();
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
    renderSelInfo();
  }

  /** Elävä palaute valinnasta: kelpaako rypääksi, riittääkö avaukseen. */
  function renderSelInfo() {
    var host = el("selInfo");
    var tiles = selectedTiles();
    if (!tiles.length || G.turn !== 0 || G.over || busy) {
      host.textContent = "";
      host.className = "sel-info";
      return;
    }
    var sum = E.scoreTiles(tiles);
    var valid = tiles.length >= 3 && E.isValidSet(tiles);
    var txt = tiles.length + " valittu · ";
    var cls = "sel-info";
    if (!G.hasMelded[0] && G.openMin > 0) {
      txt += sum + "/" + G.openMin + " p avaukseen";
    } else {
      txt += sum + " p";
    }
    if (valid) {
      txt += " · rypäs ✓";
      cls += " ok";
    } else if (tiles.length >= 3) {
      txt += " · ei kelpaa rypääksi";
      cls += " no";
    }
    host.textContent = txt;
    host.className = cls;
  }

  function renderHud() {
    for (var p = 0; p < G.playerCount; p++) {
      var hud = el("hudP" + p);
      hud.className = "pscore" + (G.turn === p && !G.over ? " turn" : "") +
        (p !== 0 && !G.over && G.racks[p].length <= 2 ? " danger" : "");
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
    var matchLine = (G.matchTarget > 0
      ? "<strong>Ottelu " + G.matchTarget + " p</strong> · Erä " + G.round
      : "<strong>Pikapeli</strong> · yksi erä") +
      " · " + G.matchScores.join("–");
    if (G.over) {
      g.innerHTML = matchLine + (G.matchOver ? " · <strong>Ottelu ohi</strong>" : " · <strong>Erä ohi</strong>");
      return;
    }
    var meld = G.hasMelded[0]
      ? '<span class="meld-ok">Avaus tehty</span>'
      : '<span class="meld-need">Avaus ≥' + G.openMin + " p</span>";
    g.innerHTML = matchLine + " · " + meld +
      " · Vuoro: <strong>" + NAMES[G.turn] + "</strong>";
  }

  function renderTable() {
    var host = el("table");
    host.innerHTML = "";
    host.className = "table";
    var human = G.turn === 0 && !G.over && !busy;
    if (!workBoard.length) {
      host.classList.add("empty-hint");
      host.textContent = "Pöytä tyhjä — muodosta ensimmäinen rypäs telineestä.";
      return;
    }
    workBoard.forEach(function (set, idx) {
      var row = document.createElement("div");
      row.className = "set" + (selSet === idx ? " selected" : "") +
        (flashSets[setSig(set)] ? " flash" : "") +
        (human && !E.isValidSet(set) ? " invalid" : "");
      var draggable = human && (G.hasMelded[0] || isNewSet(idx));
      set.forEach(function (t) {
        var d = tileEl(t, false);
        if (draggable) {
          d.classList.add("grab");
          attachDrag(d, t, { type: "set", idx: idx });
        }
        row.appendChild(d);
      });
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
    if (human) {
      var zone = document.createElement("div");
      zone.className = "newset-zone";
      zone.id = "newsetZone";
      zone.textContent = "＋ Uusi rypäs — pudota pala tähän";
      host.appendChild(zone);
    }
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
    if (busy || G.turn !== 0 || G.over || dragSuppressClick) return;
    var tiles = selectedTiles();
    if (tiles.length) {
      if (!G.hasMelded[0] && !isNewSet(idx)) {
        setStatus("Ennen avausta et voi lisätä pöydän vanhoihin rypäisiin.", "warn");
        toast("Tee ensin oma avaus (≥" + G.openMin + " p)");
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
    pool.forEach(function (t) {
      var d = tileEl(t, G.turn === 0 && !busy);
      attachDrag(d, t, { type: "pool" });
      host.appendChild(d);
    });
  }

  function renderRack() {
    var host = el("rack");
    host.innerHTML = "";
    host.dataset.empty = "Teline tyhjä — voitit?";
    // Teline pysyy pelaajan omassa järjestyksessä; järjestysnapit ja raahaus muuttavat sitä
    workRack.forEach(function (t) {
      var d = tileEl(t, G.turn === 0 && !G.over && !busy);
      if (t.id === justDrawn) d.classList.add("drawn");
      attachDrag(d, t, { type: "rack" });
      host.appendChild(d);
    });
  }

  // ---- Telineen järjestys ---------------------------------------------------

  function applyRackOrder() {
    // Peru-nappi palauttaa snap.rackista — pidä sen järjestys samana kuin näkyvä
    var pos = {};
    workRack.forEach(function (t, i) { pos[t.id] = i; });
    if (snap) {
      snap.rack.sort(function (a, b) {
        var pa = pos[a.id] != null ? pos[a.id] : 999;
        var pb = pos[b.id] != null ? pos[b.id] : 999;
        return pa - pb;
      });
    }
  }

  function sortRackBy(mode) {
    var order = E.COLORS;
    var cmp = mode === "value"
      ? function (a, b) {
          if (a.joker !== b.joker) return a.joker ? 1 : -1;
          if (a.value !== b.value) return a.value - b.value;
          return order.indexOf(a.color) - order.indexOf(b.color);
        }
      : function (a, b) {
          if (a.joker !== b.joker) return a.joker ? 1 : -1;
          if (a.color !== b.color) return order.indexOf(a.color) - order.indexOf(b.color);
          return a.value - b.value;
        };
    workRack.sort(cmp);
    applyRackOrder();
    render();
  }

  var dragSuppressClick = false;

  function findIndexById(arr, id) {
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return i;
    return -1;
  }

  /** Mihin pudotettiin: rypäs / pöydän tausta / teline / työalue. */
  function dropTarget(x, y, dragEl) {
    var zone = el("newsetZone");
    if (zone) {
      var zr = zone.getBoundingClientRect();
      if (x >= zr.left && x <= zr.right && y >= zr.top && y <= zr.bottom) return { type: "table" };
    }
    var rows = el("table").querySelectorAll(".set");
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        // paikka rypään sisällä x:n mukaan
        var ins = 0;
        Array.prototype.forEach.call(rows[i].querySelectorAll(".tile"), function (k) {
          if (k === dragEl) return;
          var kr = k.getBoundingClientRect();
          if (x > kr.left + kr.width / 2) ins++;
        });
        return { type: "set", idx: i, ins: ins };
      }
    }
    var tr = el("table").getBoundingClientRect();
    if (x >= tr.left && x <= tr.right && y >= tr.top && y <= tr.bottom) return { type: "table" };
    var rr = el("rack").getBoundingClientRect();
    if (x >= rr.left && x <= rr.right && y >= rr.top && y <= rr.bottom) return { type: "rack" };
    if (!el("poolWrap").classList.contains("hidden")) {
      var pr = el("pool").getBoundingClientRect();
      if (x >= pr.left && x <= pr.right && y >= pr.top && y <= pr.bottom) return { type: "pool" };
    }
    return null;
  }

  function dropTargetEl(dst) {
    if (!dst) return null;
    if (dst.type === "set") return el("table").querySelectorAll(".set")[dst.idx] || null;
    if (dst.type === "table") return el("newsetZone") || el("table");
    if (dst.type === "rack") return el("rack");
    if (dst.type === "pool") return el("pool");
    return null;
  }

  function reorderRack(t, x, y, dragEl) {
    var host = el("rack");
    var insert = 0;
    Array.prototype.forEach.call(host.children, function (k) {
      if (k === dragEl) return;
      var r = k.getBoundingClientRect();
      if (y > r.bottom) insert++;
      else if (y >= r.top - 4 && x > r.left + r.width / 2) insert++;
    });
    var from = findIndexById(workRack, t.id);
    if (from < 0) return;
    var moved = workRack.splice(from, 1)[0];
    if (from < insert) insert--;
    if (insert < 0) insert = 0;
    if (insert > workRack.length) insert = workRack.length;
    workRack.splice(insert, 0, moved);
    applyRackOrder();
    render();
  }

  /** Siirrä pala raahaamalla lähteestä kohteeseen. */
  function moveTile(t, src, dst, x, y, dragEl) {
    if (src.type === "rack" && dst.type === "rack") {
      reorderRack(t, x, y, dragEl);
      return;
    }
    if (src.type === "set" && dst.type === "set" && src.idx === dst.idx) {
      render();
      return;
    }
    if (!G.hasMelded[0] && dst.type === "set" && !isNewSet(dst.idx)) {
      setStatus("Ennen avausta et voi lisätä pöydän vanhoihin rypäisiin.", "warn");
      toast("Tee ensin oma avaus (≥" + G.openMin + " p)");
      render();
      return;
    }
    if (dst.type === "rack" && src.type !== "rack") {
      var own = snap.rack.some(function (r) { return r.id === t.id; });
      if (!own) {
        setStatus("Pöydän paloja ei voi ottaa telineeseen — vie ne työalueelle.", "warn");
        toast("Vie pöydän palat työalueelle");
        render();
        return;
      }
    }
    // Kohderypäs talteen ennen lähteen poistoa (indeksit voivat siirtyä)
    var dstSet = dst.type === "set" ? workBoard[dst.idx] : null;
    var moved = null;
    if (src.type === "rack") {
      moved = workRack.splice(findIndexById(workRack, t.id), 1)[0];
    } else if (src.type === "pool") {
      moved = pool.splice(findIndexById(pool, t.id), 1)[0];
    } else {
      var sSet = workBoard[src.idx];
      moved = sSet.splice(findIndexById(sSet, t.id), 1)[0];
      if (!sSet.length) workBoard.splice(workBoard.indexOf(sSet), 1);
    }
    if (!moved) { render(); return; }
    if (dst.type === "set") {
      dstSet.splice(Math.min(dst.ins, dstSet.length), 0, moved);
    } else if (dst.type === "table") {
      workBoard.push([moved]);
    } else if (dst.type === "rack") {
      workRack.push(moved);
    } else {
      pool.push(moved);
    }
    delete sel[t.id];
    selSet = null;
    applyRackOrder();
    render();
  }

  function attachDrag(d, t, src) {
    d.onpointerdown = function (ev) {
      if (busy || G.turn !== 0 || G.over) return;
      if (ev.button != null && ev.button !== 0) return;
      var startX = ev.clientX, startY = ev.clientY;
      var dragging = false, ghost = null, hintEl = null;
      function setHint(e) {
        var next = dropTargetEl(dropTarget(e.clientX, e.clientY, d));
        if (next === hintEl) return;
        if (hintEl) hintEl.classList.remove("drop-hint");
        hintEl = next;
        if (hintEl) hintEl.classList.add("drop-hint");
      }
      function move(e) {
        if (!dragging && Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 10) {
          dragging = true;
          ghost = d.cloneNode(true);
          ghost.classList.add("ghost");
          ghost.classList.remove("selected");
          document.body.appendChild(ghost);
          d.classList.add("drag-src");
        }
        if (dragging) {
          ghost.style.left = e.clientX + "px";
          ghost.style.top = e.clientY + "px";
          setHint(e);
          e.preventDefault();
        }
      }
      function up(e) {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        if (ghost) ghost.remove();
        if (hintEl) hintEl.classList.remove("drop-hint");
        d.classList.remove("drag-src");
        if (!dragging) return; // pelkkä klikkaus — valinta hoituu onclickissä
        dragSuppressClick = true;
        setTimeout(function () { dragSuppressClick = false; }, 0);
        var dst = dropTarget(e.clientX, e.clientY, d);
        if (!dst) { render(); return; }
        moveTile(t, src, dst, e.clientX, e.clientY, d);
      }
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };
  }

  function renderControls() {
    var human = G.turn === 0 && !G.over && !busy;
    var selTiles = selectedTiles();
    el("btnForm").disabled = !human || selTiles.length < 3;
    el("btnForm").classList.toggle("ready",
      human && selTiles.length >= 3 && E.isValidSet(selTiles));
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

  /** Epäkelpo vuoro: palauta laatat vuoron alkutilanteeseen. */
  function revertTurn(msg) {
    workBoard = E.cloneBoard(snap.board);
    workRack = snap.rack.map(E.cloneTile);
    pool = [];
    sel = {};
    selSet = null;
    setStatus(msg + " Laatat palautettiin paikoilleen.", "warn");
    toast(msg);
    render();
  }

  function confirmTurn() {
    if (pool.length) {
      revertTurn("Työalueelle jäi paloja.");
      return;
    }
    var res = E.validatePlay(
      { board: snap.board, racks: [snap.rack].concat(G.racks.slice(1)), turn: 0, hasMelded: G.hasMelded },
      workBoard,
      workRack
    );
    if (!res.ok) {
      revertTurn(res.error + ".");
      return;
    }
    // Synkaa G:n rack[0] snapista ennen applya
    G.board = E.cloneBoard(snap.board);
    G.racks[0] = snap.rack.map(E.cloneTile);
    var applied = E.applyPlay(G, workBoard, workRack);
    if (!applied.ok) {
      revertTurn(applied.error + ".");
      return;
    }
    justDrawn = null;
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
    var dr = E.drawOne(G);
    justDrawn = dr && dr.drew ? dr.drew.id : null;
    syncWork();
    toast(justDrawn ? "Nostit palan" : "Pussi tyhjä — vuoro ohi");
    setStatus(NAMES[G.turn] + " miettii…");
    render();
    busy = true;
    setTimeout(runAI, AI_DELAY);
  }

  function runAI() {
    if (G.over) { busy = false; endGame(); return; }
    var p = G.turn;
    var before = G.racks[p].length;
    var beforeSigs = {};
    G.board.forEach(function (s) { beforeSigs[setSig(s)] = true; });

    var res = E.aiTurn(G);

    // Korosta rypäät jotka kone loi tai joihin se lisäsi paloja
    flashSets = {};
    var playedCount = 0;
    G.board.forEach(function (s) {
      var sig = setSig(s);
      if (!beforeSigs[sig]) flashSets[sig] = true;
    });
    if (res && res.drew) toast(NAMES[p] + " nosti");
    else if (res && res.played) playedCount = res.played.length;
    else if (res && res.ok && !res.drew && G.racks[p].length < before) {
      playedCount = before - G.racks[p].length;
    }
    if (playedCount) toast(NAMES[p] + " pelasi " + playedCount + " palaa");

    // Näytä koneen siirto heti pöydällä
    syncWork();
    render();

    // Tauko siirron jälkeen, jotta pelaaja ehtii nähdä mitä tapahtui
    var pause = playedCount ? AI_PAUSE : AI_DELAY;
    if (G.over) {
      setTimeout(function () { busy = false; endGame(); }, pause);
      return;
    }
    if (G.turn !== 0) {
      setStatus(NAMES[G.turn] + " miettii…");
      setTimeout(runAI, pause);
      return;
    }
    setTimeout(function () {
      busy = false;
      flashSets = {};
      beginHumanTurn();
      setStatus("Sinun vuorosi.");
    }, playedCount ? AI_PAUSE : 250);
  }

  function fmtDelta(n) {
    return (n > 0 ? "+" : "") + n;
  }

  function endGame() {
    E.settleRound(G);
    render();
    var roundMsg;
    if (G.winner === 0) roundMsg = "Tyhjensit telineesi — voitit erän.";
    else if (G.winner != null) roundMsg = NAMES[G.winner] + " tyhjensi telineensä.";
    else roundMsg = "Erä päättyi tasapeliin (pussi / telineet).";

    var scoreLine = "Erä: " + G.scores.map(fmtDelta).join(" / ") +
      " · Ottelu: <strong>" + G.matchScores.join("–") + "</strong>" +
      (G.matchTarget > 0 ? " / " + G.matchTarget : "");

    if (G.matchOver) {
      var title = G.matchWinner === 0 ? "Otteluvoitto!" : G.matchWinner != null ? "Otteluhäviö" : "Ottelutasapeli";
      var lead = G.matchWinner === 0
        ? (G.matchTarget > 0 ? "Saavutit " + G.matchTarget + " pistettä." : "Voitit pikapelin.")
        : G.matchWinner != null
          ? (G.matchTarget > 0
            ? NAMES[G.matchWinner] + " ehti " + G.matchTarget + " pisteeseen."
            : NAMES[G.matchWinner] + " voitti pikapelin.")
          : "Kärjessä sama pistemäärä.";
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
      justDrawn = null;
      flashSets = {};
      closeOverlay();
      beginHumanTurn();
      setStatus("Erä " + G.round + " — sinun vuorosi.");
      toast("Erä " + G.round);
    };
    el("ovQuit").onclick = function () { startScreen(); };
  }

  // ---- Bindings ------------------------------------------------------------
  el("btnForm").onclick = formSet;
  el("btnSortVal").onclick = function () { sortRackBy("value"); };
  el("btnSortCol").onclick = function () { sortRackBy("color"); };
  el("btnConfirm").onclick = confirmTurn;
  el("btnReset").onclick = resetTurn;
  el("btnDraw").onclick = doDraw;
  el("btnRules").onclick = showRules;
  el("btnNew").onclick = function () {
    if (G && !G.over && !G.matchOver) confirmNewGame();
    else startScreen();
  };

  startFromQuery();
})();
