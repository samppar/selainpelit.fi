// Labyrintti — fysiikka + proseduraalinen kuulalauta (Node + selain).
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LabyrinttiEngine = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var GRAVITY = 780;
  var FRICTION = 0.988;
  var MAX_SPEED = 280;
  var KEY_TILT_SPEED = 2.8;
  var KEY_TILT_MAX = 0.72;
  var ORIENT_SCALE = 1 / 30;
  var BOUNCE = 0.42;

  var T = 9;
  var W = 500;
  var H = 460;
  var BALL_R = 6.2;
  var HOLE_R = 9.5;

  function H_(x, y, len) { return { x: x, y: y, w: len, h: T }; }
  function V_(x, y, len) { return { x: x, y: y, w: T, h: len }; }
  function hole(n, x, y) { return { n: n, x: x, y: y }; }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  // Toistettava satunnaisgeneraattori (mulberry32) — sama taso samalla numerolla.
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /*
   * Proseduraalinen sokkelolabyrintti (recursive backtracker).
   * Ruudukkoon kaiverretaan mutkitteleva käytäväverkko: yksi reitti START→FINISH,
   * runsaasti umpikujia. Seinät ovat lyhyitä tappeja joka suuntaan (kuten aidossa laudassa).
   * Reiät: esteet suoran käytävän sivussa (taattu ohitusaukko) + ansat umpikujissa.
   * Vaikeus kasvaa: suurempi ruudukko, enemmän reikiä.
   */
  var DIRS = [
    { di: 0, dj: -1, a: "N", b: "S" },
    { di: 1, dj: 0, a: "E", b: "W" },
    { di: 0, dj: 1, a: "S", b: "N" },
    { di: -1, dj: 0, a: "W", b: "E" }
  ];

  function generateLevel(levelNum) {
    levelNum = Math.max(1, levelNum | 0);
    var rng = mulberry32((0x9e3779b1 ^ (levelNum * 2654435761)) >>> 0);

    var iL = T, iT = T, iR = W - T, iB = H - T;
    var usableW = iR - iL, usableH = iB - iT;
    var cols = Math.min(8, 4 + levelNum);   // taso 1 → 5×4, kattona 8×6
    var rows = Math.min(6, 3 + levelNum);
    var cellW = usableW / cols, cellH = usableH / rows;
    var cellMin = Math.min(cellW, cellH);

    function cx(i) { return iL + cellW * (i + 0.5); }
    function cy(j) { return iT + cellH * (j + 0.5); }
    function inb(i, j) { return i >= 0 && i < cols && j >= 0 && j < rows; }

    // Ruudukko: joka ruudulla 4 seinää, kaivetaan käytävät.
    var cell = [];
    for (var i = 0; i < cols; i++) {
      cell[i] = [];
      for (var j = 0; j < rows; j++) cell[i][j] = { N: true, E: true, S: true, W: true, seen: false };
    }
    var stack = [[0, 0]];
    cell[0][0].seen = true;
    while (stack.length) {
      var c = stack[stack.length - 1];
      var ns = [];
      for (var d = 0; d < 4; d++) {
        var ni = c[0] + DIRS[d].di, nj = c[1] + DIRS[d].dj;
        if (inb(ni, nj) && !cell[ni][nj].seen) ns.push(d);
      }
      if (!ns.length) { stack.pop(); continue; }
      var pd = DIRS[ns[(rng() * ns.length) | 0]];
      var pi = c[0] + pd.di, pj = c[1] + pd.dj;
      cell[c[0]][c[1]][pd.a] = false;
      cell[pi][pj][pd.b] = false;
      cell[pi][pj].seen = true;
      stack.push([pi, pj]);
    }

    // Ratkaisureitti START(0,0) → FINISH(cols-1,rows-1), BFS käytäviä pitkin.
    var finishC = [cols - 1, rows - 1];
    function key(i, j) { return i + "," + j; }
    var prev = {}, seen2 = {};
    var q = [[0, 0]];
    seen2[key(0, 0)] = true;
    while (q.length) {
      var cc = q.shift();
      if (cc[0] === finishC[0] && cc[1] === finishC[1]) break;
      for (d = 0; d < 4; d++) {
        if (!cell[cc[0]][cc[1]][DIRS[d].a]) {
          var qi = cc[0] + DIRS[d].di, qj = cc[1] + DIRS[d].dj;
          if (inb(qi, qj) && !seen2[key(qi, qj)]) {
            seen2[key(qi, qj)] = true;
            prev[key(qi, qj)] = cc;
            q.push([qi, qj]);
          }
        }
      }
    }
    var sol = [], cur = finishC;
    while (cur) { sol.unshift(cur); cur = prev[key(cur[0], cur[1])]; }

    // Seinät: kehys + ruutujen kaivamattomat sisäreunat.
    var walls = [H_(0, 0, W), H_(0, H - T, W), V_(0, 0, H), V_(W - T, 0, H)];
    for (i = 0; i < cols; i++) {
      for (j = 0; j < rows; j++) {
        if (cell[i][j].E && i < cols - 1) walls.push(V_(iL + cellW * (i + 1) - T / 2, iT + cellH * j, cellH));
        if (cell[i][j].S && j < rows - 1) walls.push(H_(iL + cellW * i, iT + cellH * (j + 1) - T / 2, cellW));
      }
    }

    // Ohjausreitti + esteet suorilla käytäväpätkillä.
    var path = [[cx(sol[0][0]), cy(sol[0][1])]];
    var rawHoles = [];
    for (var k = 1; k < sol.length; k++) {
      var cc2 = sol[k];
      var cxk = cx(cc2[0]), cyk = cy(cc2[1]);
      var placed = false;
      if (k < sol.length - 1) {
        var pc = sol[k - 1], ncc = sol[k + 1];
        var dx1 = cc2[0] - pc[0], dy1 = cc2[1] - pc[1];
        var straight = (dx1 === ncc[0] - cc2[0] && dy1 === ncc[1] - cc2[1]);
        var horiz = dx1 !== 0;
        var clean = horiz
          ? (cell[cc2[0]][cc2[1]].N && cell[cc2[0]][cc2[1]].S)
          : (cell[cc2[0]][cc2[1]].E && cell[cc2[0]][cc2[1]].W);
        if (straight && clean && rng() < 0.32 + 0.05 * levelNum) {
          var halfW = (horiz ? cellH : cellW) / 2 - T / 2;
          var off = Math.min(halfW - HOLE_R - 2, halfW * 0.42);
          if (off < 0) off = 0;
          var side = rng() < 0.5 ? 1 : -1;
          if (horiz) {
            rawHoles.push([cxk, cyk + side * off]);
            path.push([cxk, cyk - side * halfW * 0.45]);
          } else {
            rawHoles.push([cxk + side * off, cyk]);
            path.push([cxk - side * halfW * 0.45, cyk]);
          }
          placed = true;
        }
      }
      if (!placed) path.push([cxk, cyk]);
    }

    // Ansareiät umpikujissa (poispäin käytävän suusta).
    for (i = 0; i < cols; i++) {
      for (j = 0; j < rows; j++) {
        if ((i === 0 && j === 0) || (i === finishC[0] && j === finishC[1])) continue;
        var deg = 0, openD = null;
        for (d = 0; d < 4; d++) if (!cell[i][j][DIRS[d].a]) { deg++; openD = DIRS[d]; }
        if (deg === 1) {
          rawHoles.push([cx(i) - openD.di * cellMin * 0.16, cy(j) - openD.dj * cellMin * 0.16]);
        }
      }
    }

    // Numerointi reitin järjestyksessä.
    var solPts = sol.map(function (s) { return [cx(s[0]), cy(s[1])]; });
    for (var r = 0; r < rawHoles.length; r++) {
      var best = 1e9, bi = 0;
      for (var s2 = 0; s2 < solPts.length; s2++) {
        var dd = (rawHoles[r][0] - solPts[s2][0]) * (rawHoles[r][0] - solPts[s2][0]) +
                 (rawHoles[r][1] - solPts[s2][1]) * (rawHoles[r][1] - solPts[s2][1]);
        if (dd < best) { best = dd; bi = s2; }
      }
      rawHoles[r].push(bi);
    }
    rawHoles.sort(function (a, b) { return a[2] - b[2]; });
    var holes = rawHoles.map(function (h, idx) { return hole(idx + 1, h[0], h[1]); });

    // Tarkistuspisteet reitin varrella.
    var checkpoints = [];
    var ncp = Math.min(sol.length - 2, 2 + Math.floor(levelNum / 2));
    for (var m = 1; m <= ncp; m++) {
      var ki = Math.round(sol.length * m / (ncp + 1));
      if (ki > 0 && ki < sol.length - 1) checkpoints.push({ x: path[ki][0], y: path[ki][1], pathIndex: ki });
    }

    return {
      width: W,
      height: H,
      ballR: BALL_R,
      holeR: HOLE_R,
      wallT: T,
      levelNum: levelNum,
      start: { x: path[0][0], y: path[0][1] },
      finish: { x: solPts[solPts.length - 1][0], y: solPts[solPts.length - 1][1], r: 15 },
      path: path,
      walls: walls,
      holes: holes,
      checkpoints: checkpoints
    };
  }

  var LEVEL = generateLevel(1);

  function cloneLevel(src) {
    return {
      width: src.width,
      height: src.height,
      ballR: src.ballR,
      holeR: src.holeR,
      wallT: src.wallT,
      levelNum: src.levelNum || 1,
      start: { x: src.start.x, y: src.start.y },
      finish: { x: src.finish.x, y: src.finish.y, r: src.finish.r },
      path: (src.path || []).map(function (p) { return [p[0], p[1]]; }),
      walls: src.walls.map(function (w) {
        return { x: w.x, y: w.y, w: w.w, h: w.h };
      }),
      holes: src.holes.map(function (h) {
        return { x: h.x, y: h.y, n: h.n };
      }),
      checkpoints: (src.checkpoints || []).map(function (c) {
        return { x: c.x, y: c.y, pathIndex: c.pathIndex };
      })
    };
  }

  function createState(levelArg) {
    var L;
    if (typeof levelArg === "number") L = generateLevel(levelArg);
    else L = cloneLevel(levelArg || LEVEL);
    return {
      level: L,
      levelNum: L.levelNum,
      x: L.start.x,
      y: L.start.y,
      vx: 0,
      vy: 0,
      gx: 0,
      gy: 0,
      status: "playing",
      fallenHole: 0,
      bestHole: 0,
      pathIndex: 0,
      checkpoint: { x: L.start.x, y: L.start.y, pathIndex: 0 },
      checkpointIndex: 0,
      attempts: 0,
      timeMs: 0,
      message: "",
      lastHit: 0,
      justCheckpoint: false
    };
  }

  function resetBall(st) {
    st.x = st.checkpoint.x;
    st.y = st.checkpoint.y;
    st.vx = 0;
    st.vy = 0;
    st.status = "playing";
    st.fallenHole = 0;
    st.message = "";
    st.pathIndex = st.checkpoint.pathIndex;
  }

  function newAttempt(st) {
    st.attempts += 1;
    resetBall(st);
  }

  // Siirry seuraavaan tasoon (loputon eteneminen).
  function advanceLevel(st) {
    var L = generateLevel((st.levelNum || 1) + 1);
    st.level = L;
    st.levelNum = L.levelNum;
    st.checkpoint = { x: L.start.x, y: L.start.y, pathIndex: 0 };
    st.checkpointIndex = 0;
    st.bestHole = 0;
    st.attempts = 1;
    st.pathIndex = 0;
    resetBall(st);
  }

  function setTilt(st, gx, gy) {
    st.gx = clamp(gx, -1, 1);
    st.gy = clamp(gy, -1, 1);
  }

  function updateKeyTilt(st, keys, dt) {
    var tx = 0;
    var ty = 0;
    if (keys.ArrowLeft || keys.a || keys.A) tx -= 1;
    if (keys.ArrowRight || keys.d || keys.D) tx += 1;
    if (keys.ArrowUp || keys.w || keys.W) ty -= 1;
    if (keys.ArrowDown || keys.s || keys.S) ty += 1;
    if (tx !== 0 && ty !== 0) {
      var inv = 1 / Math.sqrt(2);
      tx *= inv;
      ty *= inv;
    }
    var targetX = tx * KEY_TILT_MAX;
    var targetY = ty * KEY_TILT_MAX;
    var k = Math.min(1, KEY_TILT_SPEED * dt);
    st.gx += (targetX - st.gx) * k;
    st.gy += (targetY - st.gy) * k;
    if (tx === 0 && ty === 0) {
      st.gx *= Math.max(0, 1 - 4 * dt);
      st.gy *= Math.max(0, 1 - 4 * dt);
      if (Math.abs(st.gx) < 0.008) st.gx = 0;
      if (Math.abs(st.gy) < 0.008) st.gy = 0;
    }
  }

  function tiltFromOrientation(beta, gamma) {
    return {
      gx: clamp((gamma || 0) * ORIENT_SCALE, -1, 1),
      gy: clamp((beta || 0) * ORIENT_SCALE, -1, 1)
    };
  }

  function resolveWall(st, wall) {
    var r = st.level.ballR;
    var nearestX = clamp(st.x, wall.x, wall.x + wall.w);
    var nearestY = clamp(st.y, wall.y, wall.y + wall.h);
    var dx = st.x - nearestX;
    var dy = st.y - nearestY;

    if (dx === 0 && dy === 0) {
      var opts = [
        { axis: "x", pos: wall.x - r, pen: st.x - wall.x, sign: -1 },
        { axis: "x", pos: wall.x + wall.w + r, pen: wall.x + wall.w - st.x, sign: 1 },
        { axis: "y", pos: wall.y - r, pen: st.y - wall.y, sign: -1 },
        { axis: "y", pos: wall.y + wall.h + r, pen: wall.y + wall.h - st.y, sign: 1 }
      ];
      opts.sort(function (a, b) { return a.pen - b.pen; });
      var pick = opts[0];
      for (var i = 0; i < opts.length; i++) {
        var o = opts[i];
        var ok = o.axis === "x"
          ? o.pos >= r && o.pos <= st.level.width - r
          : o.pos >= r && o.pos <= st.level.height - r;
        if (ok) { pick = o; break; }
      }
      if (pick.axis === "x") {
        st.x = pick.pos;
        st.vx = -st.vx * BOUNCE;
        if (st.vx * pick.sign < 0) st.vx = pick.sign * Math.abs(st.vx);
      } else {
        st.y = pick.pos;
        st.vy = -st.vy * BOUNCE;
        if (st.vy * pick.sign < 0) st.vy = pick.sign * Math.abs(st.vy);
      }
      st.lastHit = 1;
      return;
    }

    var d2 = dx * dx + dy * dy;
    if (d2 >= r * r) return;
    var d = Math.sqrt(d2);
    var nx = dx / d;
    var ny = dy / d;
    var pen = r - d;
    st.x += nx * pen;
    st.y += ny * pen;
    var vn = st.vx * nx + st.vy * ny;
    if (vn < 0) {
      st.vx -= (1 + BOUNCE) * vn * nx;
      st.vy -= (1 + BOUNCE) * vn * ny;
      st.lastHit = 1;
    }
  }

  function collideWalls(st) {
    var walls = st.level.walls;
    for (var i = 0; i < walls.length; i++) resolveWall(st, walls[i]);
  }

  function updatePathProgress(st) {
    var path = st.level.path;
    if (!path || path.length < 2) return;
    var best = st.pathIndex;
    var bestD = 1e9;
    var from = Math.max(0, st.pathIndex - 1);
    var to = Math.min(path.length - 1, st.pathIndex + 4);
    for (var i = from; i <= to; i++) {
      var dx = st.x - path[i][0];
      var dy = st.y - path[i][1];
      var d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best > st.pathIndex) st.pathIndex = best;

    // Ohita tarkistuspiste kun se on saavutettu.
    var cps = st.level.checkpoints || [];
    for (var c = 0; c < cps.length; c++) {
      if (st.pathIndex >= cps[c].pathIndex && cps[c].pathIndex > st.checkpoint.pathIndex) {
        st.checkpoint = { x: cps[c].x, y: cps[c].y, pathIndex: cps[c].pathIndex };
        st.checkpointIndex = c + 1;
        st.justCheckpoint = true;
      }
    }
  }

  function checkHoles(st) {
    var holes = st.level.holes;
    var r = st.level.ballR;
    var hr = st.level.holeR;
    // Nopeus vaikuttaa: hitaana reikä nappaa herkästi (kuula valuu reunalta),
    // vauhdilla voi kiitää ohi. slowF ∈ [0.42, 1].
    var speed = Math.sqrt(st.vx * st.vx + st.vy * st.vy);
    var slowF = clamp(1 - speed / (MAX_SPEED * 0.72), 0.42, 1);
    var thresh = ((hr - r) + r * 0.35) * slowF;
    if (thresh < r * 0.35) thresh = r * 0.35;
    for (var i = 0; i < holes.length; i++) {
      var h = holes[i];
      var dx = st.x - h.x;
      var dy = st.y - h.y;
      if (dx * dx + dy * dy < thresh * thresh) {
        st.status = "fallen";
        st.fallenHole = h.n;
        if (h.n > st.bestHole) st.bestHole = h.n;
        st.vx = 0;
        st.vy = 0;
        st.message = "Reikä " + h.n;
        return true;
      }
    }
    return false;
  }

  function checkFinish(st) {
    var f = st.level.finish;
    var dx = st.x - f.x;
    var dy = st.y - f.y;
    if (dx * dx + dy * dy < f.r * f.r) {
      st.status = "won";
      st.vx = 0;
      st.vy = 0;
      st.pathIndex = st.level.path.length - 1;
      st.bestHole = Math.max(st.bestHole, st.level.holes.length);
      st.message = "Maali!";
      return true;
    }
    return false;
  }

  function step(st, dt) {
    if (st.status !== "playing") return st;
    if (dt <= 0) return st;
    if (dt > 0.05) dt = 0.05;

    st.lastHit = 0;
    st.justCheckpoint = false;
    st.timeMs += dt * 1000;
    st.vx += st.gx * GRAVITY * dt;
    st.vy += st.gy * GRAVITY * dt;

    var sp = Math.sqrt(st.vx * st.vx + st.vy * st.vy);
    if (sp > MAX_SPEED) {
      st.vx = (st.vx / sp) * MAX_SPEED;
      st.vy = (st.vy / sp) * MAX_SPEED;
    }

    st.vx *= Math.pow(FRICTION, dt * 60);
    st.vy *= Math.pow(FRICTION, dt * 60);
    st.x += st.vx * dt;
    st.y += st.vy * dt;

    collideWalls(st);
    collideWalls(st);
    updatePathProgress(st);

    if (checkHoles(st)) return st;
    checkFinish(st);
    return st;
  }

  function getView(st) {
    var pathLen = st.level.path.length || 1;
    return {
      width: st.level.width,
      height: st.level.height,
      ballR: st.level.ballR,
      holeR: st.level.holeR,
      levelNum: st.levelNum,
      x: st.x,
      y: st.y,
      vx: st.vx,
      vy: st.vy,
      gx: st.gx,
      gy: st.gy,
      status: st.status,
      fallenHole: st.fallenHole,
      bestHole: st.bestHole,
      pathIndex: st.pathIndex,
      pathProgress: st.pathIndex / (pathLen - 1),
      checkpointIndex: st.checkpointIndex,
      totalCheckpoints: (st.level.checkpoints || []).length,
      justCheckpoint: st.justCheckpoint,
      totalHoles: st.level.holes.length,
      attempts: st.attempts,
      timeMs: st.timeMs,
      message: st.message,
      lastHit: st.lastHit,
      start: st.level.start,
      finish: st.level.finish,
      path: st.level.path,
      walls: st.level.walls,
      holes: st.level.holes,
      checkpoints: st.level.checkpoints || []
    };
  }

  function placeBall(st, x, y, vx, vy) {
    st.x = x;
    st.y = y;
    st.vx = vx || 0;
    st.vy = vy || 0;
    st.status = "playing";
    st.fallenHole = 0;
    st.message = "";
  }

  return {
    LEVEL: LEVEL,
    GRAVITY: GRAVITY,
    generateLevel: generateLevel,
    createState: createState,
    resetBall: resetBall,
    newAttempt: newAttempt,
    advanceLevel: advanceLevel,
    setTilt: setTilt,
    updateKeyTilt: updateKeyTilt,
    tiltFromOrientation: tiltFromOrientation,
    step: step,
    getView: getView,
    placeBall: placeBall,
    checkHoles: checkHoles,
    checkFinish: checkFinish,
    collideWalls: collideWalls,
    clamp: clamp
  };
});
