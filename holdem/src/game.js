// Hold'em — selain-UI (riippuu HoldemEngine + HoldemRegistry).
(function () {
  "use strict";
  var E = globalThis.HoldemEngine;
  var Reg = globalThis.HoldemRegistry;
  if (!E) throw new Error("HoldemEngine puuttuu");
  if (!Reg) throw new Error("HoldemRegistry puuttuu");

  var G = null;
  var opponentBot = null;
  var busy = false;
  var raiseAmt = 0;
  var toastTimer = null;

  function el(id) { return document.getElementById(id); }

  function toast(msg) {
    var t = el("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }

  function closeOverlay() {
    el("ov").classList.add("hidden");
  }

  function openOverlay(html) {
    el("ovBody").innerHTML = html;
    el("ov").classList.remove("hidden");
  }

  function streetLabel(s) {
    return ({
      preflop: "Preflop",
      flop: "Flop",
      turn: "Turn",
      river: "River",
      showdown: "Showdown",
      idle: "—",
    })[s] || s;
  }

  function cardHTML(c, cls) {
    if (!c) {
      return '<div class="card back ' + (cls || "") + '"></div>';
    }
    var color = E.SUIT_COLOR[c.suit] || "black";
    return '<div class="card ' + color + " " + (cls || "") + '">' +
      '<span class="r">' + E.RANK_LABEL[c.rank] + "</span>" +
      '<span class="s">' + E.SUIT_SYMBOL[c.suit] + "</span></div>";
  }

  function startScreen() {
    el("game").classList.add("hidden");
    openOverlay(
      "<h2>Texas Hold&apos;em</h2>" +
      "<p>Kerää chippejä ja pudota vastustajat. Kaksi taskukorttia, viisi yhteistä — paras viiden kortin käsi voittaa potin.</p>" +
      '<div class="diff-row" id="diffRow">' +
        '<label><input type="radio" name="diff" value="helppo"> Helppo</label>' +
        '<label><input type="radio" name="diff" value="normaali" checked> Normaali</label>' +
        '<label><input type="radio" name="diff" value="vaikea"> Vaikea</label>' +
      "</div>" +
      '<div class="actions">' +
        '<button type="button" class="go" id="btnStart">Aloita peli</button>' +
        '<button type="button" id="btnRulesOv">Säännöt</button>' +
      "</div>"
    );
    el("btnStart").onclick = function () {
      var d = document.querySelector('input[name="diff"]:checked');
      newGame({ difficulty: d ? d.value : "normaali" });
    };
    el("btnRulesOv").onclick = showRules;
  }

  function showRules() {
    openOverlay(
      "<h2>Säännöt lyhyesti</h2>" +
      "<ul>" +
        "<li><strong>Tavoite:</strong> voita chipit — viimeinen pystyssä oleva voittaa.</li>" +
        "<li>Jokaisella 2 taskukorttia. Pöytään aukeaa flop (3), turn ja river.</li>" +
        "<li>Paras 5 kortin pokerikäsi voittaa potin (tasku + pöytä).</li>" +
        "<li><strong>Passaa / Check</strong> jos ei tarvitse maksaa. <strong>Maksa</strong> tasoittaa panoksen.</li>" +
        "<li><strong>Panosta / Korota</strong> pakottaa muut maksamaan tai luovuttamaan.</li>" +
        "<li>Blindit: pieni " + (G ? G.sb : 5) + " / iso " + (G ? G.bb : 10) + ".</li>" +
      "</ul>" +
      '<div class="actions"><button type="button" class="go" id="btnRulesClose">Selvä</button></div>'
    );
    el("btnRulesClose").onclick = function () {
      if (!G) startScreen();
      else closeOverlay();
    };
  }

  function newGame(opts) {
    opts = opts || {};
    G = E.newGame(opts);
    opponentBot = Reg.botForDifficulty(opts.difficulty || G.difficulty || "normaali");
    busy = false;
    el("game").classList.remove("hidden");
    closeOverlay();
    toast("Peli alkaa — voita chipit! (" + (opponentBot.name || "botti") + ")");
    afterStateChange();
  }

  // Agentti-/smoke: window.HoldemUI.newGame({ seed: 42 })
  globalThis.HoldemUI = {
    newGame: newGame,
    startScreen: startScreen,
    getState: function () { return G ? E.publicState(G) : null; },
    getBot: function () { return opponentBot; },
    act: function (action) {
      if (!G || busy) return { ok: false, error: "busy" };
      return humanAct(action);
    },
  };

  function startFromQuery() {
    var m = /(?:\?|&)seed=(\d+)/.exec(location.search || "");
    if (m) {
      newGame({ seed: +m[1], difficulty: "normaali" });
      return;
    }
    startScreen();
  }

  function afterStateChange() {
    render();
    if (!G) return;

    if (G.phase === "gameOver") {
      showGameOver();
      return;
    }
    if (G.phase === "handOver") {
      showHandOver();
      return;
    }
    if (G.phase === "playing" && G.toAct >= 0 && !G.players[G.toAct].isHuman) {
      runBots();
    }
  }

  function runBots() {
    if (busy) return;
    busy = true;
    render();
    setTimeout(function step() {
      if (!G || G.phase !== "playing" || G.toAct < 0 || G.players[G.toAct].isHuman) {
        busy = false;
        render();
        afterStateChange();
        return;
      }
      var act = E.safeAct(opponentBot, E.botView(G, G.toAct));
      if (!act) { busy = false; render(); return; }
      var name = G.players[G.toAct].name;
      var res = E.applyAction(G, act);
      if (res.ok) {
        var label = actionLabel(act);
        el("status").textContent = name + ": " + label;
      }
      render();
      setTimeout(step, 420);
    }, 380);
  }

  function actionLabel(act) {
    if (act.type === "fold") return "luovuttaa";
    if (act.type === "check") return "passaa";
    if (act.type === "call") return "maksaa " + act.amount;
    if (act.type === "bet") return "panostaa " + act.amount;
    if (act.type === "raise") return "korottaa → " + act.amount;
    return act.type;
  }

  function humanAct(action) {
    if (!G || G.phase !== "playing" || G.toAct !== 0 || busy) {
      return { ok: false, error: "ei sinun vuorosi" };
    }
    var res = E.applyAction(G, action);
    if (!res.ok) {
      toast(res.error || "Laiton siirto");
      return res;
    }
    toast(actionLabel(action));
    afterStateChange();
    return res;
  }

  function showHandOver() {
    var lh = G.lastHand;
    var title = G.message || "Jako ohi";
    var body = "";
    if (lh && !lh.foldWin) {
      body += '<div style="display:flex;gap:6px;justify-content:center;margin:10px 0;flex-wrap:wrap">';
      (lh.board || []).forEach(function (c) { body += cardHTML(c, "sm"); });
      body += "</div>";
      G.winners.forEach(function (w) {
        var h = lh.hands[w];
        if (h) {
          body += "<p><strong>" + G.players[w].name + "</strong>: " + h.name +
            " (+" + (lh.awards[w] || 0) + ")</p>";
        }
      });
    } else {
      body += "<p>" + title + "</p>";
    }
    var alive = G.players.filter(function (p) { return p.chips > 0; }).length;
    openOverlay(
      "<h2>Jako #" + G.handNumber + "</h2>" +
      "<p>" + title + "</p>" + body +
      '<div class="actions">' +
        '<button type="button" class="go" id="btnNext">' +
          (alive < 2 ? "Tulokset" : "Seuraava jako") +
        "</button>" +
      "</div>"
    );
    el("btnNext").onclick = function () {
      closeOverlay();
      if (alive < 2) {
        E.nextHand(G);
        afterStateChange();
        return;
      }
      E.nextHand(G);
      toast("Uusi jako");
      afterStateChange();
    };
  }

  function showGameOver() {
    var champ = G.winners && G.winners[0];
    var win = champ != null && G.players[champ].isHuman;
    openOverlay(
      "<h2>" + (win ? "Voitit!" : "Peli ohi") + "</h2>" +
      "<p>" + (G.message || "") + "</p>" +
      '<div class="actions">' +
        '<button type="button" class="go" id="btnAgain">Uusi peli</button>' +
      "</div>"
    );
    el("btnAgain").onclick = function () {
      startScreen();
    };
  }

  function render() {
    if (!G) return;
    var pub = E.publicState(G);

    el("pot").textContent = String(pub.potTotal);
    el("street").textContent = streetLabel(pub.street);
    el("handNum").textContent = "Jako #" + pub.handNumber;
    el("blinds").textContent = "Blindit " + pub.sb + "/" + pub.bb;

    var goal = "Kerää chipit — pudota vastustajat";
    if (pub.phase === "handOver") goal = pub.message || "Jako ohi";
    if (pub.phase === "gameOver") goal = pub.message || "Peli ohi";
    el("goal").textContent = goal;

    if (pub.phase === "playing" && pub.toAct === 0) {
      el("status").textContent = "Sinun vuorosi — valitse toiminto";
    } else if (pub.phase === "playing" && pub.toAct > 0) {
      el("status").textContent = pub.players[pub.toAct].name + " miettii…";
    } else if (pub.phase === "playing") {
      el("status").textContent = "";
    }

    // Board
    var boardEl = el("board");
    boardEl.innerHTML = "";
    for (var i = 0; i < 5; i++) {
      if (pub.board[i]) {
        boardEl.insertAdjacentHTML("beforeend", cardHTML(pub.board[i]));
      } else {
        boardEl.insertAdjacentHTML("beforeend", '<div class="card slot"></div>');
      }
    }

    // Seats
    var seatsEl = el("seats");
    seatsEl.innerHTML = "";
    pub.players.forEach(function (p, idx) {
      var badges = [];
      if (idx === pub.dealer) badges.push('<div class="badge dealer">Dealer</div>');
      if (p.allIn) badges.push('<div class="badge">All-in</div>');
      else if (p.folded) badges.push('<div class="badge">Luovutti</div>');
      else if (p.chips === 0) badges.push('<div class="badge">Ulkona</div>');

      var showHole = p.isHuman || pub.phase === "handOver" || pub.street === "showdown";
      var holes = "";
      if (p.holeCount) {
        if (showHole && p.hole[0]) {
          holes = cardHTML(p.hole[0], "sm") + cardHTML(p.hole[1], "sm");
        } else if (!p.isHuman) {
          holes = cardHTML(null, "sm") + cardHTML(null, "sm");
        }
      }

      var cls = "seat";
      if (pub.toAct === idx && pub.phase === "playing") cls += " to-act";
      if (p.folded) cls += " folded";
      if (pub.winners && pub.winners.indexOf(idx) >= 0) cls += " winner";

      var bet = p.bet > 0
        ? '<div class="bet-chip">' + p.bet + "</div>"
        : '<div class="bet-chip empty">0</div>';

      seatsEl.insertAdjacentHTML("beforeend",
        '<div class="' + cls + '" data-pos="' + idx + '">' +
          (idx === 0 ? "" : '<div class="hole">' + holes + "</div>") +
          bet +
          '<div class="seat-info">' +
            '<div class="nm">' + p.name + "</div>" +
            '<div class="chips">' + p.chips + "</div>" +
            badges.join("") +
          "</div>" +
          (idx === 0 ? "" : "") +
        "</div>"
      );
    });

    // Hero cards
    var hero = pub.players[0];
    var heroEl = el("heroCards");
    heroEl.innerHTML = "";
    if (hero.hole[0]) {
      heroEl.insertAdjacentHTML("beforeend", cardHTML(hero.hole[0]));
      heroEl.insertAdjacentHTML("beforeend", cardHTML(hero.hole[1]));
    }
    var hn = el("handName");
    if (hero.hole[0] && pub.board.length >= 3) {
      var ev = E.evaluateHand(G.players[0].hole.concat(G.board));
      hn.textContent = ev.name;
    } else if (hero.hole[0]) {
      hn.textContent = "Taskukortit";
    } else {
      hn.textContent = "";
    }

    renderControls(pub);
  }

  function renderControls(pub) {
    var box = el("ctrls");
    box.innerHTML = "";
    var can = pub.phase === "playing" && pub.toAct === 0 && !busy;
    if (!can) {
      if (pub.phase === "playing") {
        box.innerHTML = '<button type="button" disabled>Odota…</button>';
      }
      return;
    }
    var legal = pub.legal || [];
    var by = {};
    legal.forEach(function (a) { by[a.type] = a; });

    function addBtn(label, cls, fn, disabled) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      if (cls) b.className = cls;
      b.disabled = !!disabled;
      b.onclick = fn;
      box.appendChild(b);
      return b;
    }

    if (by.fold) {
      addBtn("Luovuta", "danger", function () { humanAct({ type: "fold" }); });
    }
    if (by.check) {
      addBtn("Passaa", "go", function () { humanAct({ type: "check" }); });
    }
    if (by.call) {
      addBtn("Maksa " + by.call.amount, "go", function () {
        humanAct({ type: "call", amount: by.call.amount });
      });
    }
    if (by.bet || by.raise) {
      var info = by.bet || by.raise;
      var typ = by.bet ? "bet" : "raise";
      raiseAmt = info.min;
      var wrap = document.createElement("div");
      wrap.className = "raise-wrap";
      var range = document.createElement("input");
      range.type = "range";
      range.min = info.min;
      range.max = info.max;
      range.value = info.min;
      range.step = 1;
      var amt = document.createElement("span");
      amt.className = "amt";
      amt.textContent = String(info.min);
      range.oninput = function () {
        raiseAmt = +range.value;
        amt.textContent = String(raiseAmt);
        betBtn.textContent = (typ === "bet" ? "Panosta " : "Korota ") + raiseAmt;
      };
      wrap.appendChild(range);
      wrap.appendChild(amt);
      box.appendChild(wrap);
      var betBtn = addBtn(
        (typ === "bet" ? "Panosta " : "Korota ") + info.min,
        "",
        function () { humanAct({ type: typ, amount: raiseAmt }); }
      );
    }
  }

  // Wire header buttons
  el("btnRules").onclick = showRules;
  el("btnNew").onclick = function () {
    if (confirm("Aloita uusi peli?")) startScreen();
  };
  el("ov").addEventListener("click", function (e) {
    if (e.target.id === "ov") {
      /* älä sulje vahingossa starttia */
    }
  });

  startFromQuery();
})();
