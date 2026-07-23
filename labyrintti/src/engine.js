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

  var T = 8;
  var W = 500;
  var H = 460;
  var BALL_R = 5.0;
  var HOLE_R = 8.0;

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

  // Valittavat vaikeustasot. Muuttavat sokkelon kokoa, reikien määrää,
  // reikien tarttuvuutta (catchMul) ja painovoimaa (gravityMul).
  var DIFFICULTY = {
    easy:   { label: "Helppo",    colsBase: 7,  colsCap: 8,  rowsBase: 6, rowsCap: 7,  holeProb: 0.72, catchMul: 0.82, gravityMul: 0.9 },
    normal: { label: "Keskitaso", colsBase: 9,  colsCap: 10, rowsBase: 8, rowsCap: 9,  holeProb: 0.9,  catchMul: 1.0,  gravityMul: 1.0 },
    hard:   { label: "Vaikea",    colsBase: 11, colsCap: 12, rowsBase: 9, rowsCap: 10, holeProb: 1.0,  catchMul: 1.1,  gravityMul: 1.05 }
  };

  function diffCfg(key) { return DIFFICULTY[key] || DIFFICULTY.normal; }

  function generateLevel(levelNum, difficulty) {
    levelNum = Math.max(1, levelNum | 0);
    var diffKey = DIFFICULTY[difficulty] ? difficulty : "normal";
    var cfg = DIFFICULTY[diffKey];
    var rng = mulberry32((0x9e3779b1 ^ (levelNum * 2654435761)) >>> 0);

    var iL = T, iT = T, iR = W - T, iB = H - T;
    var usableW = iR - iL, usableH = iB - iT;
    var cols = Math.min(cfg.colsCap, cfg.colsBase + levelNum);
    var rows = Math.min(cfg.rowsCap, cfg.rowsBase + levelNum);
    var cellW = usableW / cols, cellH = usableH / rows;
    var cellMin = Math.min(cellW, cellH);

    function cx(i) { return iL + cellW * (i + 0.5); }
    function cy(j) { return iT + cellH * (j + 0.5); }
    function inb(i, j) { return i >= 0 && i < cols && j >= 0 && j < rows; }

    // —— Yksi mutkitteleva reitti (Hamilton-polku) joka käy JOKAISEN ruudun ——
    // Näin lauta täyttyy: ei tyhjää tilaa, reikä lähes joka ruudussa reitin varrella.
    function key(i, j) { return i + "," + j; }
    var cell = [];
    for (var i = 0; i < cols; i++) {
      cell[i] = [];
      for (var j = 0; j < rows; j++) cell[i][j] = { N: true, E: true, S: true, W: true };
    }

    // Alkujärjestys: käärme (boustrophedon) alkaen (0,0) — taattu Hamilton-polku.
    var order = [];
    for (j = 0; j < rows; j++) {
      if (j % 2 === 0) for (i = 0; i < cols; i++) order.push([i, j]);
      else for (i = cols - 1; i >= 0; i--) order.push([i, j]);
    }
    var N = order.length;
    var pos = {};
    for (var k = 0; k < N; k++) pos[key(order[k][0], order[k][1])] = k;

    // Backbite: satunnaista polkua häntäpäästä. Pää (START = (0,0)) pysyy paikallaan.
    var iters = N * 30;
    for (var t = 0; t < iters; t++) {
      var tail = order[N - 1];
      var cand = [];
      for (var d = 0; d < 4; d++) {
        var ni = tail[0] + DIRS[d].di, nj = tail[1] + DIRS[d].dj;
        if (!inb(ni, nj)) continue;
        var pj = pos[key(ni, nj)];
        if (pj < N - 2) cand.push(pj);
      }
      if (!cand.length) continue;
      var j0 = cand[(rng() * cand.length) | 0];
      var lo = j0 + 1, hi = N - 1;
      while (lo < hi) {
        var tmp = order[lo]; order[lo] = order[hi]; order[hi] = tmp;
        pos[key(order[lo][0], order[lo][1])] = lo;
        pos[key(order[hi][0], order[hi][1])] = hi;
        lo++; hi--;
      }
      if (lo === hi) pos[key(order[lo][0], order[lo][1])] = lo;
    }

    var sol = order;
    var finishC = sol[N - 1];

    function carve(a, b) {
      var dx = b[0] - a[0], dy = b[1] - a[1];
      for (var dd = 0; dd < 4; dd++) {
        if (DIRS[dd].di === dx && DIRS[dd].dj === dy) {
          cell[a[0]][a[1]][DIRS[dd].a] = false;
          cell[b[0]][b[1]][DIRS[dd].b] = false;
        }
      }
    }
    for (k = 1; k < N; k++) carve(sol[k - 1], sol[k]);

    // Oikoreitit: aukko kahden reitillä kaukana olevan naapurin väliin (riski, mutta oikaisu).
    var nShort = Math.min(4, 1 + Math.floor(levelNum / 2));
    var made = 0, tries = 0;
    var minGap = Math.max(4, Math.floor(N * 0.18));
    while (made < nShort && tries < 300) {
      tries++;
      var si = (rng() * cols) | 0, sj = (rng() * rows) | 0;
      var sd = DIRS[(rng() * 4) | 0];
      var ti = si + sd.di, tj = sj + sd.dj;
      if (!inb(ti, tj) || !cell[si][sj][sd.a]) continue;
      if (Math.abs(pos[key(si, sj)] - pos[key(ti, tj)]) < minGap) continue;
      carve([si, sj], [ti, tj]);
      made++;
    }

    // Seinät: kehys + kaivamattomat sisäreunat (lyhyet puutapit).
    var walls = [H_(0, 0, W), H_(0, H - T, W), V_(0, 0, H), V_(W - T, 0, H)];
    for (i = 0; i < cols; i++) {
      for (j = 0; j < rows; j++) {
        if (cell[i][j].E && i < cols - 1) walls.push(V_(iL + cellW * (i + 1) - T / 2, iT + cellH * j, cellH));
        if (cell[i][j].S && j < rows - 1) walls.push(H_(iL + cellW * i, iT + cellH * (j + 1) - T / 2, cellW));
      }
    }

    // Ohjausreitti + reiät. Reikä osaan ruuduista (holeProb) → tiheä mutta kuljettava.
    // START/FINISH-alueet jätetään vapaiksi. Reitti pujottelee reikien ohi.
    var path = [];
    var rawHoles = [];
    var flip = 1;
    var safeEnds = 1;
    for (k = 0; k < N; k++) {
      var ccx = cx(sol[k][0]), ccy = cy(sol[k][1]);
      if (k < safeEnds || k >= N - safeEnds) { path.push([ccx, ccy]); continue; }
      var din = [sol[k][0] - sol[k - 1][0], sol[k][1] - sol[k - 1][1]];
      var dout = [sol[k + 1][0] - sol[k][0], sol[k + 1][1] - sol[k][1]];
      if (din[0] === dout[0] && din[1] === dout[1]) {
        // Suora käytävä: reikä toiselle sivulle, viiva pujottaa vastapuolelta.
        var horiz = din[0] !== 0;
        var halfW = (horiz ? cellH : cellW) / 2 - T / 2;
        var off = Math.min(halfW - HOLE_R - 2, halfW * 0.5);
        if (off < 1 || rng() >= cfg.holeProb) { path.push([ccx, ccy]); continue; }
        flip = -flip;
        if (horiz) {
          rawHoles.push([ccx, ccy + flip * off]);
          path.push([ccx, ccy - flip * halfW * 0.42]);
        } else {
          rawHoles.push([ccx + flip * off, ccy]);
          path.push([ccx - flip * halfW * 0.42, ccy]);
        }
      } else {
        // Käännös: reikä ulkonurkkaan (harvemmin — mutkat ovat jo vaikeita).
        var fx = din[0] - dout[0], fy = din[1] - dout[1];
        var ox = Math.min(cellW * 0.27, cellW / 2 - T / 2 - HOLE_R - 1);
        var oy = Math.min(cellH * 0.27, cellH / 2 - T / 2 - HOLE_R - 1);
        var hxo = ccx + (fx > 0 ? ox : fx < 0 ? -ox : 0);
        var hyo = ccy + (fy > 0 ? oy : fy < 0 ? -oy : 0);
        if (rng() < cfg.holeProb &&
            Math.sqrt((hxo - ccx) * (hxo - ccx) + (hyo - ccy) * (hyo - ccy)) >= HOLE_R + 2) {
          rawHoles.push([hxo, hyo]);
        }
        // Viiva kaartaa sisäkulmaan (poispäin ulkonurkan reiästä).
        path.push([ccx - (fx > 0 ? 1 : fx < 0 ? -1 : 0) * cellW * 0.12,
                   ccy - (fy > 0 ? 1 : fy < 0 ? -1 : 0) * cellH * 0.12]);
      }
    }

    // Takuu: poista reiät jotka ovat liian lähellä ohjausviivaa (muuten reitti tukkeutuisi).
    // Näin huolellinen pelaaja pääsee aina läpi viivaa seuraamalla.
    var minClear = HOLE_R + BALL_R + 3;
    function distToPath(hx, hy) {
      var best = 1e9;
      for (var p = 1; p < path.length; p++) {
        var ax = path[p - 1][0], ay = path[p - 1][1];
        var bx = path[p][0], by = path[p][1];
        var vx = bx - ax, vy = by - ay;
        var wx = hx - ax, wy = hy - ay;
        var len2 = vx * vx + vy * vy || 1;
        var tt = (wx * vx + wy * vy) / len2;
        tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
        var dx = hx - (ax + tt * vx), dy = hy - (ay + tt * vy);
        var dd = dx * dx + dy * dy;
        if (dd < best) best = dd;
      }
      return Math.sqrt(best);
    }
    rawHoles = rawHoles.filter(function (h) { return distToPath(h[0], h[1]) >= minClear; });

    var solPts = path.slice();
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
      difficulty: diffKey,
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
      difficulty: src.difficulty || "normal",
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

  function createState(levelArg, difficulty) {
    var L;
    if (typeof levelArg === "number") L = generateLevel(levelArg, difficulty);
    else L = cloneLevel(levelArg || LEVEL);
    var cfg = diffCfg(L.difficulty);
    return {
      level: L,
      levelNum: L.levelNum,
      difficulty: L.difficulty,
      catchMul: cfg.catchMul,
      gravityMul: cfg.gravityMul,
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

  // Siirry seuraavaan tasoon (loputon eteneminen, sama vaikeustaso).
  function advanceLevel(st) {
    var L = generateLevel((st.levelNum || 1) + 1, st.difficulty);
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
      // lastHit tallentaa törmäysnopeuden (ei vain true/false), jotta UI voi
      // erottaa oikean kolahduksen siitä, että kuula lepää/puristuu seinää
      // vasten jatkuvan kallistuksen alla (pieni, toistuva "hipaisu" per ruutu).
      var incoming = pick.axis === "x" ? Math.abs(st.vx) : Math.abs(st.vy);
      if (pick.axis === "x") {
        st.x = pick.pos;
        st.vx = -st.vx * BOUNCE;
        if (st.vx * pick.sign < 0) st.vx = pick.sign * Math.abs(st.vx);
      } else {
        st.y = pick.pos;
        st.vy = -st.vy * BOUNCE;
        if (st.vy * pick.sign < 0) st.vy = pick.sign * Math.abs(st.vy);
      }
      st.lastHit = Math.max(st.lastHit, incoming);
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
      st.lastHit = Math.max(st.lastHit, Math.abs(vn));
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
    var thresh = ((hr - r) + r * 0.35) * slowF * (st.catchMul || 1);
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
    var g = GRAVITY * (st.gravityMul || 1);
    st.vx += st.gx * g * dt;
    st.vy += st.gy * g * dt;

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
      difficulty: st.difficulty,
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
    DIFFICULTY: DIFFICULTY,
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
