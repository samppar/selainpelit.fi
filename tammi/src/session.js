// Tammi — UI-tilakone ilman DOM:ia (Node + selain).
// DOM-sidos: game.js. Smoke/agentti: TammiUI / createSession.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TammiSession = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createSession(opts) {
    opts = opts || {};
    var E = opts.engine;
    if (!E) throw new Error("createSession: engine required");

    var schedule = opts.schedule || function (fn, ms) {
      return setTimeout(fn, ms);
    };
    var clearSched = opts.clearSchedule || function (id) {
      clearTimeout(id);
    };
    var aiDelayMs = opts.aiDelayMs != null ? opts.aiDelayMs : 280;
    var flashMs = opts.flashMs != null ? opts.flashMs : 450;
    var defaultAiOpts = opts.aiOpts || { timeMs: 1000 };

    var st = null;
    var selected = -1;
    var winner = 0;
    var lastMove = null;
    var history = [];
    var hint = null;
    var thinking = false;
    var hinting = false;
    var captureFlash = [];
    var toast = null;
    var nextAltStarter = E.HUMAN;
    var aiTimer = null;
    var flashTimer = null;
    var onChange = opts.onChange || function () {};

    function emit() { onChange(getView()); }

    function clearTimers() {
      if (aiTimer != null) { clearSched(aiTimer); aiTimer = null; }
      if (flashTimer != null) { clearSched(flashTimer); flashTimer = null; }
    }

    function resolveStarter(mode) {
      if (mode === "human") return E.HUMAN;
      if (mode === "computer") return E.AI;
      var s = nextAltStarter;
      nextAltStarter = E.opp(nextAltStarter);
      return s;
    }

    function statsText(side) {
      var c = E.countSide(st.board, side);
      var man = c.pieces - c.kings;
      var parts = [];
      if (man) parts.push(man + " nappulaa");
      if (c.kings) parts.push(c.kings + (c.kings === 1 ? " daami" : " daamia"));
      if (!parts.length) return "ei nappuloita";
      return parts.join(", ");
    }

    function statusMessage() {
      if (winner) {
        return winner === E.HUMAN
          ? "Voitit — tietokoneella ei ole laillista siirtoa."
          : "Tietokone voitti.";
      }
      if (thinking) return "Tietokone miettii siirtoaan…";
      if (hinting) return "Lasketaan vihjettä…";
      var must = E.genMoves(st).some(function (m) { return m.overs.length > 0; });
      if (st.turn === E.HUMAN) {
        if (selected >= 0) {
          return must
            ? "Syö hyppäämällä vastustajan yli — valitse kohderuutu."
            : "Valitse kohderuutu korostetuista ruuduista.";
        }
        return must
          ? "Sinun vuorosi: syönti on pakollinen — valitse nappula."
          : "Sinun vuorosi: valitse nappula ja siirrä vinottain eteenpäin.";
      }
      return "Tietokoneen vuoro.";
    }

    function phaseLabel() {
      if (winner) return winner === E.HUMAN ? "Voitto" : "Häviö";
      if (thinking) return "Tietokoneen vuoro";
      return st.turn === E.HUMAN ? "Sinun vuorosi" : "Tietokoneen vuoro";
    }

    function getView() {
      var moves = (!st || winner || thinking) ? [] : E.genMoves(st);
      var movable = [];
      var targets = [];
      var seen = {};
      for (var i = 0; i < moves.length; i++) {
        var f = moves[i].from;
        if (!seen[f]) {
          seen[f] = true;
          movable.push(E.sqLabel(f));
        }
        if (selected >= 0 && moves[i].from === selected) {
          targets.push(E.sqLabel(moves[i].to));
        }
      }
      movable.sort();
      targets.sort();
      return {
        turn: st ? st.turn : 0,
        winner: winner,
        phase: st ? phaseLabel() : "",
        message: st ? statusMessage() : "",
        selected: selected >= 0 ? E.sqLabel(selected) : null,
        movable: movable,
        targets: targets,
        humanStats: st ? statsText(E.HUMAN) : "",
        aiStats: st ? statsText(E.AI) : "",
        thinking: thinking,
        hinting: hinting,
        canUndo: history.length > 0 && !thinking,
        canHint: !!st && !winner && !thinking && st.turn === E.HUMAN,
        lastMove: lastMove ? E.formatMove(lastMove) : null,
        hint: hint ? E.formatMove(hint) : null,
        toast: toast,
        captureFlash: captureFlash.map(E.sqLabel),
        moveKeys: st && !winner ? E.moveKeys(st) : [],
        board: st ? st.board.slice() : null
      };
    }

    function setToast(text) {
      toast = text;
    }

    function endIfNeeded() {
      if (E.isLoss(st)) {
        winner = E.opp(st.turn);
        selected = -1;
        hint = null;
        setToast(winner === E.HUMAN ? "Voitit!" : "Tietokone voitti");
        return true;
      }
      return false;
    }

    function pushHistory() {
      history.push({
        board: st.board.slice(),
        turn: st.turn,
        lastMove: lastMove
          ? { from: lastMove.from, to: lastMove.to, path: lastMove.path.slice(), overs: lastMove.overs.slice() }
          : null
      });
    }

    function applyMove(mv, fromHuman) {
      if (fromHuman) pushHistory();
      var wasKing = E.isKing(st.board[mv.from]);
      captureFlash = mv.overs.slice();
      st = E.applyMove(st, mv);
      lastMove = {
        from: mv.from,
        to: mv.to,
        path: mv.path.slice(),
        overs: mv.overs.slice()
      };
      selected = -1;
      hint = null;
      if (!wasKing && E.isKing(st.board[mv.to])) setToast("Daami!");
      else if (mv.overs.length) {
        setToast(mv.overs.length === 1 ? "Syönti!" : "Ketjusyönti ×" + mv.overs.length);
      }
      if (flashMs > 0) {
        flashTimer = schedule(function () {
          captureFlash = [];
          flashTimer = null;
          emit();
        }, flashMs);
      } else {
        captureFlash = [];
      }
      endIfNeeded();
      emit();
      if (!winner && st.turn === E.AI) scheduleAI();
      return { ok: true, move: E.formatMove(mv) };
    }

    function resolveSq(sqOrLabel) {
      if (typeof sqOrLabel === "number") return sqOrLabel;
      return E.parseSq(String(sqOrLabel));
    }

    function click(sqOrLabel) {
      if (!st || winner || thinking || st.turn !== E.HUMAN) {
        return { ok: false, error: "not_human_turn" };
      }
      var sq = resolveSq(sqOrLabel);
      var moves = E.genMoves(st);

      if (selected >= 0) {
        var choices = moves.filter(function (m) {
          return m.from === selected && m.to === sq;
        });
        if (choices.length) {
          choices.sort(function (a, b) { return b.overs.length - a.overs.length; });
          return applyMove(choices[0], true);
        }
        if (E.sideOf(st.board[sq]) === E.HUMAN && moves.some(function (m) { return m.from === sq; })) {
          selected = sq;
          emit();
          return { ok: true, selected: E.sqLabel(sq) };
        }
        selected = -1;
        emit();
        return { ok: true, selected: null };
      }

      if (E.sideOf(st.board[sq]) === E.HUMAN && moves.some(function (m) { return m.from === sq; })) {
        selected = sq;
        emit();
        return { ok: true, selected: E.sqLabel(sq) };
      }
      return { ok: false, error: "illegal" };
    }

    function play(notation) {
      if (!st || winner || thinking || st.turn !== E.HUMAN) {
        return { ok: false, error: "not_human_turn" };
      }
      var mv = E.findMove(st, notation);
      if (!mv) return { ok: false, error: "illegal_move", notation: notation };
      return applyMove(mv, true);
    }

    function aiOptions() {
      var o = {};
      var src = defaultAiOpts;
      for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) o[k] = src[k];
      return o;
    }

    function runAI() {
      if (!st || winner || st.turn !== E.AI) return { ok: false, error: "not_ai_turn" };
      thinking = true;
      emit();
      var mv = E.bestMove(st, aiOptions());
      thinking = false;
      if (!mv) {
        endIfNeeded();
        emit();
        return { ok: false, error: "no_move" };
      }
      return applyMove(mv, false);
    }

    function scheduleAI() {
      if (winner || !st || st.turn !== E.AI) return;
      if (aiDelayMs <= 0) {
        runAI();
        return;
      }
      thinking = true;
      emit();
      aiTimer = schedule(function () {
        aiTimer = null;
        thinking = false;
        var mv = E.bestMove(st, aiOptions());
        if (!mv) {
          endIfNeeded();
          emit();
          return;
        }
        applyMove(mv, false);
      }, aiDelayMs);
    }

    function newGame(gameOpts) {
      gameOpts = gameOpts || {};
      clearTimers();
      thinking = false;
      hinting = false;
      selected = -1;
      winner = 0;
      lastMove = null;
      history = [];
      hint = null;
      captureFlash = [];
      toast = null;
      if (gameOpts.aiOpts) defaultAiOpts = gameOpts.aiOpts;
      if (gameOpts.state) {
        st = E.cloneState(gameOpts.state);
      } else if (gameOpts.board != null) {
        st = E.makeState({ board: gameOpts.board, turn: gameOpts.turn || E.HUMAN });
      } else {
        var starter = gameOpts.starter != null
          ? gameOpts.starter
          : resolveStarter(gameOpts.starterMode || "human");
        st = E.initState(starter);
      }
      emit();
      if (st.turn === E.AI && !winner) scheduleAI();
      return getView();
    }

    function undo() {
      if (!history.length || thinking) return { ok: false, error: "cannot_undo" };
      clearTimers();
      thinking = false;
      var prev = history.pop();
      st = { board: prev.board, turn: prev.turn };
      lastMove = prev.lastMove;
      winner = 0;
      selected = -1;
      hint = null;
      captureFlash = [];
      toast = null;
      emit();
      return { ok: true };
    }

    function giveHint() {
      if (!st || winner || thinking || st.turn !== E.HUMAN) {
        return { ok: false, error: "cannot_hint" };
      }
      hinting = true;
      emit();
      var opts = aiOptions();
      if (opts.timeMs == null || opts.timeMs > 900) {
        opts = { timeMs: Math.min(900, opts.timeMs || 900), maxDepth: opts.maxDepth, now: opts.now };
      }
      hint = E.bestMove(st, opts);
      hinting = false;
      if (hint) {
        selected = hint.from;
        setToast("Vihje: " + E.sqLabel(hint.from) + " → " + E.sqLabel(hint.to));
      }
      emit();
      return { ok: !!hint, hint: hint ? E.formatMove(hint) : null };
    }

    function setAiOpts(next) {
      defaultAiOpts = next || defaultAiOpts;
    }

    return {
      newGame: newGame,
      click: click,
      play: play,
      undo: undo,
      hint: giveHint,
      stepAI: runAI,
      getView: getView,
      setAiOpts: setAiOpts,
      getState: function () { return st ? E.cloneState(st) : null; }
    };
  }

  return { createSession: createSession };
});
