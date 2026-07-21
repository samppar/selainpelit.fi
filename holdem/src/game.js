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
  var paceTimer = null;
  var lastStreet = null;
  var gameGen = 0; // vanhat timerit eivät koske uutta peliä
  var lastAction = null; // { seat, type, headline, pill }

  // Tahti — hidasta vain kun pelaaja tarvitsee aikaa lukea / tuntea tilanne.
  // Hyötyä: uudet kortit, korotus/panos, jaon loppu. Turhaa: check/fold-ketjut.
  var PACE = {
    afterHuman: 350,       // oma siirto ehti näkyä; bottien ei tarvitse odottaa kauaa
    thinkQuiet: 280,       // fold/check — nopea “klik”
    thinkCall: 480,        // call — lyhyt harkinta
    thinkRaise: 850,       // bet/raise — näyttää harkitulta, ehtii odottaa
    gapQuiet: 450,         // fold/check jälkeen heti eteenpäin
    gapCall: 700,          // call ehtii näkyä bannerissa
    gapRaise: 1700,        // korotus: kuka / kuinka paljon
    streetHold: 1200,      // toimija näkyviin ennen uusia kortteja
    streetReveal: 2600,    // flop/turn/river — lukuaika
    handEnd: 2400,         // tulos ennen overlayta
  };

  function thinkMsFor(act) {
    if (!act) return PACE.thinkQuiet;
    if (act.type === "bet" || act.type === "raise") return PACE.thinkRaise;
    if (act.type === "call") return PACE.thinkCall;
    return PACE.thinkQuiet;
  }

  function gapMsFor(act) {
    if (!act) return PACE.gapQuiet;
    if (act.type === "bet" || act.type === "raise") return PACE.gapRaise;
    if (act.type === "call") return PACE.gapCall;
    return PACE.gapQuiet;
  }

  function el(id) { return document.getElementById(id); }

  function clearPace() {
    if (paceTimer) {
      clearTimeout(paceTimer);
      paceTimer = null;
    }
  }

  function later(ms, fn) {
    clearPace();
    var gen = gameGen;
    paceTimer = setTimeout(function () {
      paceTimer = null;
      if (gen !== gameGen) return;
      fn();
    }, ms);
  }

  function toast(msg, ms) {
    var t = el("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, ms || 2600);
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

  // Chip-denominations (suurin ensin) — numero säilyy, pino visualisoi määrän
  var CHIP_DENOMS = [
    { v: 100, cls: "c100" },
    { v: 25, cls: "c25" },
    { v: 10, cls: "c10" },
    { v: 5, cls: "c5" },
    { v: 1, cls: "c1" },
  ];

  function chipStackHTML(amount, maxChips) {
    maxChips = maxChips || 8;
    amount = Math.max(0, amount | 0);
    if (amount === 0) return "";
    var left = amount;
    var parts = [];
    var count = 0;
    // Kerää denoms; pino rakennetaan alhaalta ylös (--i = 0 pohja)
    for (var i = 0; i < CHIP_DENOMS.length && count < maxChips; i++) {
      var d = CHIP_DENOMS[i];
      var n = Math.floor(left / d.v);
      left -= n * d.v;
      while (n-- > 0 && count < maxChips) {
        parts.push('<span class="chip ' + d.cls + '" style="--i:' + count + '"></span>');
        count++;
      }
    }
    return parts.join("");
  }

  function setChipPile(node, amount, maxChips) {
    if (!node) return;
    var html = chipStackHTML(amount, maxChips);
    node.innerHTML = html;
    var n = node.querySelectorAll(".chip").length;
    node.style.setProperty("--n", String(n || 1));
    node.classList.toggle("empty-pile", n === 0);
  }

  function cardHTML(c, cls) {
    var extra = cls || "";
    if (!c) {
      return '<div class="card back ' + extra + '"></div>';
    }
    var color = E.SUIT_COLOR[c.suit] || "black";
    return '<div class="card ' + color + " " + extra + '">' +
      '<span class="r">' + E.RANK_LABEL[c.rank] + "</span>" +
      '<span class="s">' + E.SUIT_SYMBOL[c.suit] + "</span></div>";
  }

  function boardSignature(pub) {
    return pub.handNumber + ":" + pub.board.map(function (c) { return E.cardKey(c); }).join(",");
  }

  function renderBoard(pub) {
    var boardEl = el("board");
    var sig = boardSignature(pub);
    if (boardEl.dataset.sig === sig) return;

    var prevHand = boardEl.dataset.hand;
    var prevLen = +(boardEl.dataset.len || 0);
    var sameHand = prevHand === String(pub.handNumber);

    boardEl.innerHTML = "";
    for (var i = 0; i < 5; i++) {
      if (pub.board[i]) {
        // Animoitu vain uudet kortit — vanhat eivät välky renderissä
        var anim = (!sameHand || i >= prevLen) ? "deal-in" : "settled";
        boardEl.insertAdjacentHTML("beforeend", cardHTML(pub.board[i], anim));
      } else {
        boardEl.insertAdjacentHTML("beforeend", '<div class="card slot settled"></div>');
      }
    }
    boardEl.dataset.sig = sig;
    boardEl.dataset.len = String(pub.board.length);
    boardEl.dataset.hand = String(pub.handNumber);
    markSettledAfterDeal(boardEl);
  }

  function markSettledAfterDeal(root) {
    if (!root) return;
    var nodes = root.querySelectorAll(".card.deal-in");
    for (var i = 0; i < nodes.length; i++) {
      (function (node) {
        function done() {
          node.classList.remove("deal-in");
          node.classList.add("settled");
          node.removeEventListener("animationend", done);
        }
        node.addEventListener("animationend", done);
        // varmuus: jos animationend ei tule
        setTimeout(done, 700);
      })(nodes[i]);
    }
  }

  function renderHero(pub) {
    var hero = pub.players[0];
    var heroEl = el("heroCards");
    var key = pub.handNumber + ":" + (hero.hole[0] ? E.cardKey(hero.hole[0]) + "|" + E.cardKey(hero.hole[1]) : "");
    if (heroEl.dataset.sig === key) return;
    var firstDeal = heroEl.dataset.hand !== String(pub.handNumber);
    heroEl.innerHTML = "";
    if (hero.hole[0]) {
      var cls = firstDeal ? "deal-in" : "settled";
      heroEl.insertAdjacentHTML("beforeend", cardHTML(hero.hole[0], cls));
      heroEl.insertAdjacentHTML("beforeend", cardHTML(hero.hole[1], cls));
      if (firstDeal) markSettledAfterDeal(heroEl);
    }
    heroEl.dataset.sig = key;
    heroEl.dataset.hand = String(pub.handNumber);
  }

  function renderSeats(pub) {
    var seatsEl = el("seats");
    var holeSig = pub.players.map(function (p, idx) {
      if (!p.holeCount) return idx + ":0";
      if (p.isHuman || pub.phase === "handOver" || pub.street === "showdown") {
        return idx + ":up:" + (p.hole[0] ? E.cardKey(p.hole[0]) + E.cardKey(p.hole[1]) : "");
      }
      return idx + ":back";
    }).join(";");
    var metaSig = pub.players.map(function (p) {
      return [p.chips, p.bet, p.folded ? 1 : 0, p.allIn ? 1 : 0].join(",");
    }).join("|") + "#" + pub.toAct + "#" + pub.dealer + "#" + (pub.winners || []).join(",");

    var actSig = lastAction
      ? lastAction.seat + ":" + lastAction.type + ":" + lastAction.pill
      : "-";
    metaSig += "@" + actSig;

    // Kortit: rakenna vain jos hole-näkymä muuttuu; meta päivitetään aina kevyesti
    if (seatsEl.dataset.holeSig !== holeSig) {
      seatsEl.innerHTML = "";
      pub.players.forEach(function (p, idx) {
        var showHole = p.isHuman || pub.phase === "handOver" || pub.street === "showdown";
        var holes = "";
        if (p.holeCount) {
          if (showHole && p.hole[0]) {
            holes = cardHTML(p.hole[0], "sm settled") + cardHTML(p.hole[1], "sm settled");
          } else if (!p.isHuman) {
            holes = cardHTML(null, "sm settled") + cardHTML(null, "sm settled");
          }
        }
        seatsEl.insertAdjacentHTML("beforeend",
          '<div class="seat" data-pos="' + idx + '" data-seat="' + idx + '">' +
            (idx === 0 ? "" : '<div class="hole">' + holes + "</div>") +
            '<div class="action-pill empty"></div>' +
            '<div class="bet-chip empty"><span class="chip c5"></span><span class="bet-amt">0</span></div>' +
            '<div class="seat-info">' +
              '<div class="nm">' + p.name + "</div>" +
              '<div class="stack-row">' +
                '<div class="chip-stack mini" data-role="stack"></div>' +
                '<div class="chips">0</div>' +
              "</div>" +
              '<div class="badges"></div>' +
            "</div>" +
          "</div>"
        );
      });
      seatsEl.dataset.holeSig = holeSig;
    }

    if (seatsEl.dataset.metaSig === metaSig) return;
    seatsEl.dataset.metaSig = metaSig;

    pub.players.forEach(function (p, idx) {
      var seat = seatsEl.querySelector('[data-seat="' + idx + '"]');
      if (!seat) return;
      seat.classList.toggle("to-act", pub.toAct === idx && pub.phase === "playing");
      seat.classList.toggle("folded", !!p.folded);
      seat.classList.toggle("winner", !!(pub.winners && pub.winners.indexOf(idx) >= 0));
      var isLast = lastAction && lastAction.seat === idx;
      seat.classList.toggle("just-acted", !!isLast);
      seat.classList.toggle("just-raised", !!(isLast && (lastAction.type === "raise" || lastAction.type === "bet")));
      var pill = seat.querySelector(".action-pill");
      if (pill) {
        if (isLast) {
          pill.textContent = lastAction.pill;
          pill.className = "action-pill " + lastAction.type;
        } else {
          pill.textContent = "";
          pill.className = "action-pill empty";
        }
      }
      var bet = seat.querySelector(".bet-chip");
      if (bet) {
        if (p.bet > 0) {
          bet.classList.remove("empty");
          var betAmt = bet.querySelector(".bet-amt");
          if (betAmt) betAmt.textContent = String(p.bet);
          else bet.innerHTML = '<span class="chip ' + (p.bet >= 100 ? "c100" : p.bet >= 25 ? "c25" : p.bet >= 10 ? "c10" : "c5") + '"></span><span class="bet-amt">' + p.bet + "</span>";
        } else {
          bet.classList.add("empty");
          var ba = bet.querySelector(".bet-amt");
          if (ba) ba.textContent = "0";
        }
      }
      var stack = seat.querySelector('[data-role="stack"]');
      setChipPile(stack, p.chips, 7);
      var chips = seat.querySelector(".chips");
      if (chips) chips.textContent = String(p.chips);
      var badges = seat.querySelector(".badges");
      if (badges) {
        var html = "";
        if (idx === pub.dealer) html += '<div class="badge dealer">Dealer</div>';
        if (p.allIn) html += '<div class="badge">All-in</div>';
        else if (p.folded) html += '<div class="badge">Luovutti</div>';
        else if (p.chips === 0) html += '<div class="badge">Ulkona</div>';
        badges.innerHTML = html;
      }
    });
  }

  function actionWords(act, you) {
    // 3. persoona bottseille, 2. persoona kun pelaaja on Sinä
    if (act.type === "fold") {
      return you
        ? { verb: "luovutat", pill: "Luovutus", headline: "luovutat" }
        : { verb: "luovuttaa", pill: "Luovutus", headline: "luovuttaa" };
    }
    if (act.type === "check") {
      return you
        ? { verb: "passaat", pill: "Pass", headline: "passaat" }
        : { verb: "passaa", pill: "Pass", headline: "passaa" };
    }
    if (act.type === "call") {
      return you
        ? { verb: "maksat " + act.amount, pill: "Maksat " + act.amount, headline: "maksat " + act.amount }
        : { verb: "maksaa " + act.amount, pill: "Maksaa " + act.amount, headline: "maksaa " + act.amount };
    }
    if (act.type === "bet") {
      return you
        ? { verb: "panostat " + act.amount, pill: "Panos " + act.amount, headline: "PANOSTAT " + act.amount }
        : { verb: "panostaa " + act.amount, pill: "Panos " + act.amount, headline: "PANOSTAA " + act.amount };
    }
    if (act.type === "raise") {
      return you
        ? { verb: "korotat " + act.amount, pill: "Korotus " + act.amount, headline: "KOROTAT " + act.amount }
        : { verb: "korottaa " + act.amount, pill: "Korotus " + act.amount, headline: "KOROTTAA " + act.amount };
    }
    return { verb: act.type, pill: act.type, headline: act.type };
  }

  function announceAction(seat, act) {
    var name = G.players[seat].name;
    var you = seat === 0 || /^sinä$/i.test(name);
    var w = actionWords(act, you);
    lastAction = { seat: seat, type: act.type, pill: w.pill, headline: w.headline };
    var banner = el("actionBanner");
    if (banner) {
      banner.textContent = name + " " + w.headline;
      banner.className = "action-banner " + act.type;
    }
    el("status").textContent = name + ": " + w.verb;
    var hold = (act.type === "raise" || act.type === "bet") ? 3200 : 2200;
    toast(name + " " + w.headline, hold);
  }

  function clearLastAction() {
    lastAction = null;
    var banner = el("actionBanner");
    if (banner) {
      banner.textContent = "";
      banner.className = "action-banner";
    }
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
    clearPace();
    gameGen++;
    clearLastAction();
    G = E.newGame(opts);
    opponentBot = Reg.botForDifficulty(opts.difficulty || G.difficulty || "normaali");
    busy = false;
    lastStreet = G.street;
    el("game").classList.remove("hidden");
    closeOverlay();
    ["board", "heroCards", "seats", "ctrls"].forEach(function (id) {
      var node = el(id);
      if (node) {
        delete node.dataset.sig;
        delete node.dataset.len;
        delete node.dataset.hand;
        delete node.dataset.holeSig;
        delete node.dataset.metaSig;
      }
    });
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
      if (!G) return { ok: false, error: "no game" };
      if (busy) return { ok: false, error: "busy" };
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

  function afterStateChange(opts) {
    opts = opts || {};
    render();
    if (!G) return;

    if (G.phase === "gameOver") {
      later(PACE.handEnd, showGameOver);
      return;
    }
    if (G.phase === "handOver") {
      el("status").textContent = G.message || "Jako ohi";
      later(PACE.handEnd, showHandOver);
      return;
    }
    if (G.phase === "playing" && G.toAct >= 0 && !G.players[G.toAct].isHuman) {
      var delay = opts.afterHuman ? PACE.afterHuman : 0;
      if (delay) {
        busy = true;
        render();
        el("status").textContent = "Vastustajat reagoivat…";
        later(delay, function () {
          busy = false;
          runBots();
        });
      } else {
        runBots();
      }
    }
  }

  function streetLabelFi(s) {
    return ({
      preflop: "Preflop",
      flop: "Flop",
      turn: "Turn",
      river: "River",
      showdown: "Showdown",
    })[s] || s;
  }

  function runBots() {
    if (busy) return;
    busy = true;
    render();

    function scheduleNext(ms) {
      later(ms, step);
    }

    function step() {
      if (!G || G.phase !== "playing") {
        busy = false;
        afterStateChange();
        return;
      }
      if (G.toAct < 0 || G.players[G.toAct].isHuman) {
        busy = false;
        render();
        return;
      }

      var seat = G.toAct;
      var name = G.players[seat].name;
      var beforeStreet = G.street;
      var beforeBoard = G.board.length;
      // Päätös heti — viive ennen julkaisua skaalautuu siirron merkityksellä
      var act = E.safeAct(opponentBot, E.botView(G, seat));
      if (!act) {
        busy = false;
        render();
        return;
      }
      el("status").textContent = name + " miettii…";
      render();

      later(thinkMsFor(act), function () {
        if (!G || G.phase !== "playing" || G.toAct !== seat) {
          busy = false;
          render();
          return;
        }
        var res = E.applyAction(G, act);
        if (res.ok) announceAction(seat, act);
        render();

        if (G.phase === "handOver" || G.phase === "gameOver") {
          busy = false;
          afterStateChange();
          return;
        }

        var streetChanged = G.street !== beforeStreet || G.board.length !== beforeBoard;
        if (streetChanged) {
          lastStreet = G.street;
          // Pidä toimija/korotus luettavana, sitten kortit
          later(Math.max(gapMsFor(act), PACE.streetHold), function () {
            clearLastAction();
            el("status").textContent = streetLabelFi(G.street) + " — uudet kortit";
            var ban = el("actionBanner");
            if (ban) {
              ban.textContent = streetLabelFi(G.street) + " — uudet kortit";
              ban.className = "action-banner";
            }
            toast(streetLabelFi(G.street), 2200);
            render();
            scheduleNext(PACE.streetReveal);
          });
        } else {
          scheduleNext(gapMsFor(act));
        }
      });
    }

    step();
  }

  function humanAct(action) {
    if (!G || G.phase !== "playing" || G.toAct !== 0 || busy) {
      return { ok: false, error: "ei sinun vuorosi" };
    }
    var beforeStreet = G.street;
    var beforeBoard = G.board.length;
    var res = E.applyAction(G, action);
    if (!res.ok) {
      toast(res.error || "Laiton siirto");
      return res;
    }
    announceAction(0, action);
    render();

    if (G.phase === "handOver" || G.phase === "gameOver") {
      afterStateChange();
      return res;
    }

    var streetChanged = G.street !== beforeStreet || G.board.length !== beforeBoard;
    if (streetChanged) {
      lastStreet = G.street;
      busy = true;
      clearLastAction();
      el("status").textContent = streetLabelFi(G.street) + " — uudet kortit";
      var ban = el("actionBanner");
      if (ban) {
        ban.textContent = streetLabelFi(G.street) + " — uudet kortit";
        ban.className = "action-banner";
      }
      toast(streetLabelFi(G.street), 2200);
      later(PACE.streetReveal, function () {
        busy = false;
        afterStateChange({ afterHuman: true });
      });
      return res;
    }

    afterStateChange({ afterHuman: true });
    return res;
  }

  function showHandOver() {
    if (!G || G.phase !== "handOver") return;
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
      clearPace();
      if (alive < 2) {
        E.nextHand(G);
        lastStreet = G.street;
        afterStateChange();
        return;
      }
      E.nextHand(G);
      lastStreet = G.street;
      clearLastAction();
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
    setChipPile(el("potChips"), pub.potTotal, 12);
    el("street").textContent = streetLabel(pub.street);
    el("handNum").textContent = "Jako #" + pub.handNumber;
    el("blinds").textContent = "Blindit " + pub.sb + "/" + pub.bb;

    var goal = "Kerää chipit — pudota vastustajat";
    if (pub.phase === "handOver") goal = pub.message || "Jako ohi";
    if (pub.phase === "gameOver") goal = pub.message || "Peli ohi";
    el("goal").textContent = goal;

    // Älä ylikirjoita bottien status-viestiä kesken animaation
    if (!busy) {
      if (pub.phase === "playing" && pub.toAct === 0) {
        el("status").textContent = "Sinun vuorosi — valitse toiminto";
      } else if (pub.phase === "playing" && pub.toAct > 0) {
        el("status").textContent = pub.players[pub.toAct].name + " miettii…";
      } else if (pub.phase === "playing") {
        el("status").textContent = "";
      }
    }

    renderBoard(pub);
    renderSeats(pub);
    renderHero(pub);
    var hero = pub.players[0];
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
    var can = pub.phase === "playing" && pub.toAct === 0 && !busy;
    var legal = pub.legal || [];
    var ctrlSig = (can ? "1" : "0") + ":" + legal.map(function (a) {
      return a.type + (a.amount != null ? a.amount : "") + (a.min != null ? a.min : "") + (a.max != null ? a.max : "");
    }).join(",");
    if (box.dataset.sig === ctrlSig) return;
    box.dataset.sig = ctrlSig;
    box.innerHTML = "";
    if (!can) {
      if (pub.phase === "playing") {
        box.innerHTML = '<button type="button" disabled>Odota…</button>';
      }
      return;
    }
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
