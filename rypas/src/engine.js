// Rypäs — pelimoottori (Node + selain).
// Numeropalat, rypäät (ryhmä / jono), avaus ≥30, tavoite: tyhjennä teline.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RypasEngine = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var COLORS = ["K", "S", "P", "O"]; // musta, sininen, punainen, keltainen
  var COLOR_NAMES = { K: "musta", S: "sininen", P: "punainen", O: "keltainen" };
  var RACK_SIZE = 14; // oletus
  var RACK_SIZE_CHOICES = [7, 10, 14];
  var INITIAL_MELD = 30;
  var JOKER_PENALTY = 30;
  var PLAYER_COUNT = 2; // oletus
  var PLAYER_COUNT_CHOICES = [2, 3, 4];
  var MATCH_TARGET = 200; // ottelu useammalla erällä

  function clampRackSize(n) {
    var v = n | 0;
    if (RACK_SIZE_CHOICES.indexOf(v) >= 0) return v;
    return RACK_SIZE;
  }

  function clampPlayerCount(n) {
    var v = n | 0;
    if (PLAYER_COUNT_CHOICES.indexOf(v) >= 0) return v;
    return PLAYER_COUNT;
  }

  function playerCountOf(state) {
    return state.playerCount || state.racks.length;
  }

  function makeRNG(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = (rng() * (i + 1)) | 0;
      var t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  var _nextId = 1;
  function tile(color, value, joker) {
    return { id: _nextId++, color: color, value: value, joker: !!joker };
  }

  function resetIds() { _nextId = 1; }

  function buildBag(rng) {
    resetIds();
    var bag = [];
    for (var copy = 0; copy < 2; copy++) {
      for (var ci = 0; ci < COLORS.length; ci++) {
        for (var v = 1; v <= 13; v++) bag.push(tile(COLORS[ci], v, false));
      }
    }
    bag.push(tile(null, 0, true));
    bag.push(tile(null, 0, true));
    return shuffle(bag, rng || makeRNG(Date.now()));
  }

  function cloneTile(t) {
    return { id: t.id, color: t.color, value: t.value, joker: t.joker };
  }

  function cloneSet(set) {
    return set.map(cloneTile);
  }

  function cloneBoard(board) {
    return board.map(cloneSet);
  }

  function tileKey(t) {
    return t.joker ? "J" : t.color + t.value;
  }

  function faceValue(t) {
    if (t.joker) return JOKER_PENALTY;
    return t.value;
  }

  function scoreTiles(tiles) {
    var s = 0;
    for (var i = 0; i < tiles.length; i++) s += faceValue(tiles[i]);
    return s;
  }

  // ---- Rypään validointi ---------------------------------------------------

  function isValidGroup(tiles) {
    if (!tiles || tiles.length < 3 || tiles.length > 4) return false;
    var fixed = [];
    var jokers = 0;
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].joker) jokers++;
      else fixed.push(tiles[i]);
    }
    if (fixed.length === 0) return false;
    var val = fixed[0].value;
    var colors = {};
    for (var j = 0; j < fixed.length; j++) {
      if (fixed[j].value !== val) return false;
      if (colors[fixed[j].color]) return false;
      colors[fixed[j].color] = true;
    }
    var usedColors = Object.keys(colors).length;
    if (usedColors + jokers !== tiles.length) return false;
    if (usedColors + jokers > 4) return false;
    return true;
  }

  function tryRunWithJokers(fixedSorted, jokers, totalLen) {
    // fixedSorted: non-joker tiles sorted by value, same color already checked
    if (fixedSorted.length === 0) return false;
    var color = fixedSorted[0].color;
    for (var i = 1; i < fixedSorted.length; i++) {
      if (fixedSorted[i].color !== color) return false;
      if (fixedSorted[i].value === fixedSorted[i - 1].value) return false;
    }
    var minV = fixedSorted[0].value;
    var maxV = fixedSorted[fixedSorted.length - 1].value;
    var span = maxV - minV + 1;
    var gaps = span - fixedSorted.length;
    if (gaps > jokers) return false;
    var leftover = jokers - gaps;
    // leftover jokers can extend ends, but stay in 1..13
    var roomLow = minV - 1;
    var roomHigh = 13 - maxV;
    if (leftover > roomLow + roomHigh) return false;
    var finalLen = span + leftover;
    if (finalLen !== totalLen) return false;
    if (finalLen > 13) return false;
    return true;
  }

  function isValidRun(tiles) {
    if (!tiles || tiles.length < 3) return false;
    var fixed = [];
    var jokers = 0;
    for (var i = 0; i < tiles.length; i++) {
      if (tiles[i].joker) jokers++;
      else fixed.push(tiles[i]);
    }
    if (fixed.length === 0) return false;
    fixed.sort(function (a, b) { return a.value - b.value; });
    return tryRunWithJokers(fixed, jokers, tiles.length);
  }

  function isValidSet(tiles) {
    return isValidGroup(tiles) || isValidRun(tiles);
  }

  function setKind(tiles) {
    if (isValidGroup(tiles)) return "group";
    if (isValidRun(tiles)) return "run";
    return null;
  }

  function validateBoard(board) {
    if (!board || !board.length) return { ok: true };
    for (var i = 0; i < board.length; i++) {
      if (!isValidSet(board[i])) {
        return { ok: false, error: "Rypäs " + (i + 1) + " ei kelpaa", index: i };
      }
    }
    return { ok: true };
  }

  // ---- Vuoron validointi ---------------------------------------------------

  function countIds(tiles) {
    var m = {};
    for (var i = 0; i < tiles.length; i++) {
      var id = tiles[i].id;
      m[id] = (m[id] || 0) + 1;
    }
    return m;
  }

  function flatBoard(board) {
    var out = [];
    for (var i = 0; i < board.length; i++) {
      for (var j = 0; j < board[i].length; j++) out.push(board[i][j]);
    }
    return out;
  }

  function sameMultiset(a, b) {
    var ca = countIds(a), cb = countIds(b);
    var keys = {};
    Object.keys(ca).forEach(function (k) { keys[k] = true; });
    Object.keys(cb).forEach(function (k) { keys[k] = true; });
    var ks = Object.keys(keys);
    for (var i = 0; i < ks.length; i++) {
      if ((ca[ks[i]] || 0) !== (cb[ks[i]] || 0)) return false;
    }
    return true;
  }

  function scorePlayedFromRack(oldRack, newRack) {
    var newIds = {};
    newRack.forEach(function (t) { newIds[t.id] = true; });
    var played = [];
    oldRack.forEach(function (t) {
      if (!newIds[t.id]) played.push(t);
    });
    return { tiles: played, score: scoreTiles(played) };
  }

  /**
   * Validoi pelaajan siirto.
   * @param {object} state — { board, racks, turn, hasMelded: boolean[] }
   * @param {array[]} newBoard
   * @param {array} newRack — vuorossa olevan pelaajan uusi teline
   */
  function validatePlay(state, newBoard, newRack) {
    var p = state.turn;
    var oldRack = state.racks[p];
    var oldBoard = state.board;

    if (!Array.isArray(newBoard) || !Array.isArray(newRack)) {
      return { ok: false, error: "Virheellinen siirto" };
    }
    for (var i = 0; i < newBoard.length; i++) {
      if (!newBoard[i] || newBoard[i].length < 3) {
        return { ok: false, error: "Jokaisessa rypäässä vähintään 3 palaa" };
      }
    }

    var boardCheck = validateBoard(newBoard);
    if (!boardCheck.ok) return boardCheck;

    var oldAll = flatBoard(oldBoard).concat(oldRack);
    var newAll = flatBoard(newBoard).concat(newRack);
    if (!sameMultiset(oldAll, newAll)) {
      return { ok: false, error: "Palojen määrä ei täsmää (ei saa lisätä/poistaa paloja)" };
    }

    var played = scorePlayedFromRack(oldRack, newRack);
    if (played.tiles.length === 0) {
      return { ok: false, error: "Pelaa vähintään yksi pala telineestä, tai nosta" };
    }

    if (!state.hasMelded[p]) {
      // Avaus: vain omia paloja — pöydän vanhat palat eivät saa olla muuttuneet
      // (saa muodostaa uusia rypäitä, mutta ei koskea vanhoihin).
      if (oldBoard.length !== 0) {
        // Vanhat rypäät säilyvät identtisinä (järjestys voi vaihtua rypäiden välillä).
        if (!boardsContainSameSets(oldBoard, newBoard, true)) {
          // Salli: vanhat setit intact + uudet setit pelkästään pelatuista
          var leftover = subtractSets(newBoard, oldBoard);
          if (leftover === null) {
            return { ok: false, error: "Ennen avausta et saa järjestellä pöytää" };
          }
          var fromRack = played.tiles;
          var usedInNew = flatBoard(leftover);
          if (!sameMultiset(usedInNew, fromRack)) {
            return { ok: false, error: "Avauksessa käytä vain omia palojasi" };
          }
          var meldScore = scoreTiles(fromRack);
          if (meldScore < INITIAL_MELD) {
            return {
              ok: false,
              error: "Avaus vaatii vähintään " + INITIAL_MELD + " pistettä (nyt " + meldScore + ")",
              score: meldScore,
            };
          }
        } else {
          // Kaikki vanhat tallella, mutta ei uusia? Sitten ei pelattu — jo estetty.
          var onlyNew = subtractSets(newBoard, oldBoard);
          if (!onlyNew || onlyNew.length === 0) {
            return { ok: false, error: "Pelaa uusia rypäitä avaukseen" };
          }
          var ms = scoreTiles(played.tiles);
          if (ms < INITIAL_MELD) {
            return {
              ok: false,
              error: "Avaus vaatii vähintään " + INITIAL_MELD + " pistettä (nyt " + ms + ")",
              score: ms,
            };
          }
        }
      } else {
        var ms0 = scoreTiles(played.tiles);
        if (ms0 < INITIAL_MELD) {
          return {
            ok: false,
            error: "Avaus vaatii vähintään " + INITIAL_MELD + " pistettä (nyt " + ms0 + ")",
            score: ms0,
          };
        }
      }
    }

    return {
      ok: true,
      played: played.tiles,
      score: played.score,
      melded: true,
      won: newRack.length === 0,
    };
  }

  function setSignature(set) {
    var ids = set.map(function (t) { return t.id; }).sort(function (a, b) { return a - b; });
    return ids.join(",");
  }

  function boardsContainSameSets(a, b, allowExtra) {
    var sa = a.map(setSignature).sort();
    var sb = b.map(setSignature).sort();
    if (!allowExtra && sa.length !== sb.length) return false;
    var i = 0, j = 0;
    while (i < sa.length && j < sb.length) {
      if (sa[i] === sb[j]) { i++; j++; }
      else if (allowExtra && sa[i] > sb[j]) j++;
      else if (allowExtra && sa[i] < sb[j]) return false;
      else return false;
    }
    return i === sa.length;
  }

  /** Palauta newBoard:n setit joita ei ole oldBoardissa; null jos oldBoardin settejä puuttuu. */
  function subtractSets(newBoard, oldBoard) {
    var nb = newBoard.map(function (s) { return { sig: setSignature(s), set: s }; });
    var used = {};
    for (var i = 0; i < oldBoard.length; i++) {
      var sig = setSignature(oldBoard[i]);
      var found = -1;
      for (var j = 0; j < nb.length; j++) {
        if (!used[j] && nb[j].sig === sig) { found = j; break; }
      }
      if (found < 0) return null;
      used[found] = true;
    }
    var extra = [];
    for (var k = 0; k < nb.length; k++) {
      if (!used[k]) extra.push(nb[k].set);
    }
    return extra;
  }

  // ---- Pelitila ------------------------------------------------------------

  function newGame(opts) {
    opts = opts || {};
    var rackSize = clampRackSize(opts.rackSize != null ? opts.rackSize : RACK_SIZE);
    var playerCount = clampPlayerCount(opts.playerCount != null ? opts.playerCount : PLAYER_COUNT);
    var seed = opts.seed != null ? opts.seed : ((Math.random() * 1e9) | 0);
    var rng = makeRNG(seed);
    var bag = buildBag(rng);
    var racks = [];
    var hasMelded = [];
    var scores = [];
    var lastAction = [];
    for (var p = 0; p < playerCount; p++) {
      racks.push(bag.splice(bag.length - rackSize, rackSize));
      hasMelded.push(false);
      scores.push(0);
      lastAction.push(null);
    }
    var matchScores = opts.matchScores ? opts.matchScores.slice() : scores.slice();
    return {
      bag: bag,
      board: [],
      racks: racks,
      playerCount: playerCount,
      turn: 0,
      hasMelded: hasMelded,
      over: false,
      winner: null,
      scores: scores, // tämän erän pisteet
      settled: false,
      matchScores: matchScores,
      matchTarget: opts.matchTarget != null ? opts.matchTarget : MATCH_TARGET,
      matchOver: false,
      matchWinner: null,
      round: opts.round != null ? opts.round : 1,
      lastAction: lastAction,
      rng: rng,
      seed: seed,
      difficulty: opts.difficulty || "normaali",
      rackSize: rackSize,
    };
  }

  /** Kirjaa erän pisteet otteluun. Kutsu kun erä on ohi. */
  function settleRound(state) {
    if (!state.over || state.settled) return state;
    state.settled = true;
    var n = playerCountOf(state);
    var t = state.matchTarget;
    var reached = false;
    for (var p = 0; p < n; p++) {
      state.matchScores[p] += state.scores[p];
      if (state.matchScores[p] >= t) reached = true;
    }
    if (reached) {
      state.matchOver = true;
      var best = -Infinity, winner = null, tie = false;
      for (var q = 0; q < n; q++) {
        if (state.matchScores[q] > best) { best = state.matchScores[q]; winner = q; tie = false; }
        else if (state.matchScores[q] === best) tie = true;
      }
      state.matchWinner = tie ? null : winner;
    }
    return state;
  }

  /** Seuraava erä (sama ottelu). Null jos ottelu jo ohi tai erä kesken. */
  function nextRound(state) {
    if (!state.over || state.matchOver) return null;
    settleRound(state);
    if (state.matchOver) return null;
    var nextSeed = state.rng ? ((state.rng() * 1e9) | 0) : (((Math.random() * 1e9) | 0));
    return newGame({
      seed: nextSeed,
      difficulty: state.difficulty,
      rackSize: state.rackSize,
      playerCount: playerCountOf(state),
      matchScores: state.matchScores.slice(),
      matchTarget: state.matchTarget,
      round: (state.round || 1) + 1,
    });
  }

  function drawOne(state) {
    if (state.over) return { ok: false, error: "Peli ohi" };
    if (!state.bag.length) {
      // Pussi tyhjä: ohita (ei nostoa)
      state.lastAction[state.turn] = { type: "pass", reason: "pussi tyhjä" };
      state.turn = (state.turn + 1) % playerCountOf(state);
      return { ok: true, drew: null, passed: true };
    }
    var t = state.bag.pop();
    state.racks[state.turn].push(t);
    state.lastAction[state.turn] = { type: "draw", tile: cloneTile(t) };
    state.turn = (state.turn + 1) % playerCountOf(state);
    return { ok: true, drew: t };
  }

  function applyPlay(state, newBoard, newRack) {
    if (state.over) return { ok: false, error: "Peli ohi" };
    var res = validatePlay(state, newBoard, newRack);
    if (!res.ok) return res;
    var p = state.turn;
    state.board = cloneBoard(newBoard);
    state.racks[p] = newRack.map(cloneTile);
    state.hasMelded[p] = true;
    state.lastAction[p] = {
      type: "play",
      count: res.played.length,
      score: res.score,
    };
    if (res.won) {
      state.over = true;
      state.winner = p;
      // Häviäjien telineiden pisteet voittajalle
      var n = playerCountOf(state);
      for (var other = 0; other < n; other++) {
        if (other === p) continue;
        var pen = scoreTiles(state.racks[other]);
        state.scores[p] += pen;
        state.scores[other] -= pen;
      }
      settleRound(state);
    } else {
      state.turn = (state.turn + 1) % playerCountOf(state);
    }
    return res;
  }

  function sortRack(rack) {
    return rack.slice().sort(function (a, b) {
      if (a.joker !== b.joker) return a.joker ? 1 : -1;
      if (a.color !== b.color) return COLORS.indexOf(a.color) - COLORS.indexOf(b.color);
      return a.value - b.value;
    });
  }

  // ---- AI ------------------------------------------------------------------

  function combinations(arr, k) {
    var out = [];
    function rec(start, path) {
      if (path.length === k) { out.push(path.slice()); return; }
      for (var i = start; i < arr.length; i++) {
        path.push(arr[i]);
        rec(i + 1, path);
        path.pop();
      }
    }
    rec(0, []);
    return out;
  }

  function findSetsInRack(rack) {
    var found = [];
    var n = rack.length;
    // Ryhmät: sama arvo
    var byVal = {};
    rack.forEach(function (t, idx) {
      if (t.joker) return;
      (byVal[t.value] = byVal[t.value] || []).push({ t: t, idx: idx });
    });
    var jokers = rack.filter(function (t) { return t.joker; });

    Object.keys(byVal).forEach(function (v) {
      var list = byVal[v];
      // eri värit
      var uniq = [];
      var seen = {};
      list.forEach(function (x) {
        if (!seen[x.t.color]) { seen[x.t.color] = true; uniq.push(x); }
      });
      for (var need = 3; need <= 4; need++) {
        if (uniq.length >= need) {
          combinations(uniq, need).forEach(function (c) {
            found.push({ tiles: c.map(function (x) { return x.t; }), kind: "group" });
          });
        } else if (uniq.length + jokers.length >= need && uniq.length >= 1) {
          var jNeed = need - uniq.length;
          if (jNeed <= jokers.length && jNeed >= 0) {
            found.push({
              tiles: uniq.map(function (x) { return x.t; }).concat(jokers.slice(0, jNeed)),
              kind: "group",
            });
          }
        }
      }
    });

    // Jonot: sama väri
    COLORS.forEach(function (col) {
      var list = rack.filter(function (t) { return !t.joker && t.color === col; });
      list.sort(function (a, b) { return a.value - b.value; });
      // dedupe values
      var uniq = [];
      var seenV = {};
      list.forEach(function (t) {
        if (!seenV[t.value]) { seenV[t.value] = true; uniq.push(t); }
      });
      for (var len = 3; len <= Math.min(13, uniq.length + jokers.length); len++) {
        for (var start = 0; start < uniq.length; start++) {
          for (var end = start; end < uniq.length; end++) {
            var slice = uniq.slice(start, end + 1);
            var span = slice[slice.length - 1].value - slice[0].value + 1;
            var gaps = span - slice.length;
            var jNeed = len - slice.length;
            if (jNeed < 0) continue;
            if (gaps > jNeed) continue;
            if (jNeed > jokers.length) continue;
            if (span + (jNeed - gaps) !== len && gaps !== jNeed) {
              // leftover extends
              var leftover = jNeed - gaps;
              var room = (slice[0].value - 1) + (13 - slice[slice.length - 1].value);
              if (leftover > room) continue;
            }
            var tiles = slice.concat(jokers.slice(0, jNeed));
            if (isValidRun(tiles) && tiles.length === len) {
              found.push({ tiles: tiles, kind: "run" });
            }
          }
        }
      }
    });

    return found;
  }

  function removeTiles(rack, tiles) {
    var ids = {};
    tiles.forEach(function (t) { ids[t.id] = true; });
    return rack.filter(function (t) { return !ids[t.id]; });
  }

  function canAddToSet(set, tile) {
    var trial = set.concat([tile]);
    return isValidSet(trial);
  }

  function findAdditions(board, rack) {
    var moves = [];
    for (var i = 0; i < board.length; i++) {
      for (var r = 0; r < rack.length; r++) {
        if (canAddToSet(board[i], rack[r])) {
          var nb = cloneBoard(board);
          nb[i] = nb[i].concat([cloneTile(rack[r])]);
          moves.push({
            board: nb,
            rack: removeTiles(rack, [rack[r]]),
            played: 1,
            score: faceValue(rack[r]),
          });
        }
      }
    }
    return moves;
  }

  /** Ahne AI: avaus / lisäykset / uudet rypäät telineestä. */
  function bestMove(state, player) {
    if (player == null) player = state.turn;
    var rack = state.racks[player].slice();
    var board = cloneBoard(state.board);
    var hasMelded = state.hasMelded[player];

    if (!hasMelded) {
      // Etsi yhdistelmä rypäitä joiden pisteet ≥ 30
      var sets = findSetsInRack(rack);
      // Greedy: kokeile yksittäisiä ja pareja
      var best = null;
      for (var i = 0; i < sets.length; i++) {
        var s = sets[i];
        var sc = scoreTiles(s.tiles);
        if (sc >= INITIAL_MELD) {
          var cand = {
            board: board.concat([cloneSet(s.tiles)]),
            rack: removeTiles(rack, s.tiles),
            played: s.tiles.length,
            score: sc,
          };
          if (!best || cand.played > best.played || (cand.played === best.played && cand.score > best.score)) {
            best = cand;
          }
        }
      }
      // Kaksi rypästä
      for (var a = 0; a < sets.length; a++) {
        for (var b = a + 1; b < sets.length; b++) {
          var ids = {};
          var overlap = false;
          sets[a].tiles.concat(sets[b].tiles).forEach(function (t) {
            if (ids[t.id]) overlap = true;
            ids[t.id] = true;
          });
          if (overlap) continue;
          var sc2 = scoreTiles(sets[a].tiles) + scoreTiles(sets[b].tiles);
          if (sc2 >= INITIAL_MELD) {
            var cand2 = {
              board: board.concat([cloneSet(sets[a].tiles), cloneSet(sets[b].tiles)]),
              rack: removeTiles(removeTiles(rack, sets[a].tiles), sets[b].tiles),
              played: sets[a].tiles.length + sets[b].tiles.length,
              score: sc2,
            };
            if (!best || cand2.played > best.played) best = cand2;
          }
        }
      }
      return best;
    }

    // Avattu: kokeile lisäyksiä ja uusia rypäitä; valitse eniten paloja
    var candidates = [];
    findAdditions(board, rack).forEach(function (m) { candidates.push(m); });

    var sets2 = findSetsInRack(rack);
    sets2.forEach(function (s) {
      candidates.push({
        board: board.concat([cloneSet(s.tiles)]),
        rack: removeTiles(rack, s.tiles),
        played: s.tiles.length,
        score: scoreTiles(s.tiles),
      });
    });

    // Yksi lisäys + yksi uusi rypäs (yksinkertainen kombo)
    findAdditions(board, rack).forEach(function (add) {
      var more = findSetsInRack(add.rack);
      more.forEach(function (s) {
        candidates.push({
          board: add.board.concat([cloneSet(s.tiles)]),
          rack: removeTiles(add.rack, s.tiles),
          played: add.played + s.tiles.length,
          score: add.score + scoreTiles(s.tiles),
        });
      });
    });

    if (!candidates.length) return null;
    candidates.sort(function (a, b) {
      if (b.played !== a.played) return b.played - a.played;
      return b.score - a.score;
    });

    // Helppo: joskus ohita paras ja nosta
    if (state.difficulty === "helppo" && candidates[0].played === 1 && state.rng() < 0.35) {
      return null;
    }
    return candidates[0];
  }

  function aiTurn(state) {
    var mv = bestMove(state);
    if (!mv) return drawOne(state);
    return applyPlay(state, mv.board, mv.rack);
  }

  /** Simuloi peli loppuun (testejä / smoke). */
  function playToEnd(state, maxTurns) {
    maxTurns = maxTurns || 500;
    var turns = 0;
    while (!state.over && turns < maxTurns) {
      aiTurn(state);
      turns++;
      // Umpikuja: molemmat vain nostavat ja pussi tyhjä
      if (!state.bag.length) {
        var n = playerCountOf(state);
        var idle = 0;
        // anna vielä muutama vuoro
        while (!state.over && idle < n * 2 && turns < maxTurns) {
          var before = state.racks[state.turn].length;
          aiTurn(state);
          turns++;
          if (state.racks[(state.turn + n - 1) % n].length >= before) idle++;
          else idle = 0;
        }
        if (!state.over) {
          // Pisteytä telineet: pienin telinesumma voittaa, saa muiden pisteet
          var sums = state.racks.map(scoreTiles);
          var best = Infinity, winner = null, tie = false;
          for (var p = 0; p < n; p++) {
            if (sums[p] < best) { best = sums[p]; winner = p; tie = false; }
            else if (sums[p] === best) tie = true;
          }
          state.over = true;
          if (tie) state.winner = null; // tasapeli
          else {
            state.winner = winner;
            for (var q = 0; q < n; q++) {
              if (q === winner) continue;
              state.scores[winner] += sums[q];
              state.scores[q] -= sums[q];
            }
          }
        }
        break;
      }
    }
    if (state.over) settleRound(state);
    return state;
  }

  return {
    COLORS: COLORS,
    COLOR_NAMES: COLOR_NAMES,
    RACK_SIZE: RACK_SIZE,
    RACK_SIZE_CHOICES: RACK_SIZE_CHOICES,
    clampRackSize: clampRackSize,
    INITIAL_MELD: INITIAL_MELD,
    JOKER_PENALTY: JOKER_PENALTY,
    PLAYER_COUNT: PLAYER_COUNT,
    PLAYER_COUNT_CHOICES: PLAYER_COUNT_CHOICES,
    clampPlayerCount: clampPlayerCount,
    MATCH_TARGET: MATCH_TARGET,
    makeRNG: makeRNG,
    shuffle: shuffle,
    tile: tile,
    resetIds: resetIds,
    buildBag: buildBag,
    cloneTile: cloneTile,
    cloneBoard: cloneBoard,
    tileKey: tileKey,
    faceValue: faceValue,
    scoreTiles: scoreTiles,
    isValidGroup: isValidGroup,
    isValidRun: isValidRun,
    isValidSet: isValidSet,
    setKind: setKind,
    validateBoard: validateBoard,
    validatePlay: validatePlay,
    newGame: newGame,
    settleRound: settleRound,
    nextRound: nextRound,
    drawOne: drawOne,
    applyPlay: applyPlay,
    sortRack: sortRack,
    findSetsInRack: findSetsInRack,
    bestMove: bestMove,
    aiTurn: aiTurn,
    playToEnd: playToEnd,
    flatBoard: flatBoard,
  };
});
