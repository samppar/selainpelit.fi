// Käpysota — canvas-UI: piirto, ohjaus, tekoälyohjuri, efektit ja äänet.
(function () {
  "use strict";

  var E = window.KapysotaEngine;
  if (!E) throw new Error("KapysotaEngine puuttuu");

  var W = E.W, H = E.H, WATER_Y = E.WATER_Y, DT = E.DT;

  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlayTitle");
  var overlayText = document.getElementById("overlayText");
  var modePicker = document.getElementById("modePicker");
  var againRow = document.getElementById("againRow");
  var btnAgain = document.getElementById("btnAgain");
  var btnMenu = document.getElementById("btnMenu");
  var phaseEl = document.getElementById("phase");
  var messageEl = document.getElementById("message");
  var statTurn = document.getElementById("statTurnV");
  var statTimer = document.getElementById("statTimer");
  var statTimerV = document.getElementById("statTimerV");
  var statWind = document.getElementById("statWindV");
  var statRound = document.getElementById("statRoundV");
  var toastEl = document.getElementById("toast");
  var teambars = [document.getElementById("teambar0"), document.getElementById("teambar1")];
  var tbFills = [document.getElementById("tbFill0"), document.getElementById("tbFill1")];
  var tbAlives = [document.getElementById("tbAlive0"), document.getElementById("tbAlive1")];
  var weaponBtns = Array.prototype.slice.call(document.querySelectorAll(".weapon"));
  var btnSkip = document.getElementById("btnSkip");
  var btnNew = document.getElementById("btnNew");
  var btnFs = document.getElementById("btnFullscreen");
  var btnFsCorner = document.getElementById("btnFsCorner");
  var btnSound = document.getElementById("btnSound");

  var TEAM_COLORS = ["#c8452f", "#5a7186"];
  var TEAM_LIGHT = ["#e0603f", "#8fa7bc"];

  var st = null;
  var settings = { mode: "ai", aiLevel: "tarkka" };
  var weapon = "sinko";
  var running = false;
  var lastTs = 0;
  var acc = 0;
  var toastTimer = 0;
  var shake = 0;
  var timeNow = 0; // efektiaika sekunteina

  // Syöte
  var keys = Object.create(null);
  var pendingJump = false;
  var charging = false;
  var chargeT = 0;         // 0..1
  var mouseAiming = false;

  // AI-ohjuri
  var ai = { state: "idle", wait: 0, plan: null, aimFrom: 0, t: 0 };

  // Efektit
  var particles = [];
  var floaters = [];
  var leaves = [];
  var graves = [];

  // —— Ääni ——
  var audioCtx = null;
  var soundOn = true;
  try {
    var sv = window.localStorage.getItem("kapysota.sound");
    if (sv === "off") soundOn = false;
  } catch (e) { /* ei localStoragea */ }

  function ensureAudio() {
    if (!soundOn) return null;
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function beep(freq, dur, type, gain, when, slideTo) {
    var ac = ensureAudio();
    if (!ac) return;
    var t0 = ac.currentTime + (when || 0);
    var osc = ac.createOscillator();
    var g = ac.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(ac.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }

  function noiseBurst(freq, dur, gain, when, q) {
    var ac = ensureAudio();
    if (!ac) return;
    var t0 = ac.currentTime + (when || 0);
    var len = Math.max(1, Math.floor(ac.sampleRate * dur));
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    var src = ac.createBufferSource();
    src.buffer = buf;
    var bp = ac.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = q || 1.4;
    var g = ac.createGain();
    g.gain.setValueAtTime(gain || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp); bp.connect(g); g.connect(ac.destination);
    src.start(t0);
  }

  var snd = {
    fire: function () { noiseBurst(180, 0.14, 0.3); beep(95, 0.2, "triangle", 0.16); },
    boom: function (big) {
      noiseBurst(85, big ? 0.5 : 0.36, big ? 0.5 : 0.38, 0, 1.1);
      beep(60, 0.45, "sine", 0.24, 0, 34);
    },
    bounce: function () { noiseBurst(420, 0.045, 0.14, 0, 3); },
    splash: function () { noiseBurst(900, 0.3, 0.26, 0, 1.2); beep(300, 0.25, "sine", 0.08, 0, 90); },
    hurt: function () { beep(720, 0.14, "square", 0.06, 0, 430); },
    jump: function () { beep(300, 0.1, "sine", 0.09, 0, 420); },
    tick: function () { beep(880, 0.05, "square", 0.045); },
    sudden: function () { beep(120, 0.7, "sawtooth", 0.1, 0, 60); },
    win: function () {
      beep(392, 0.16, "triangle", 0.14);
      beep(523, 0.16, "triangle", 0.14, 0.17);
      beep(659, 0.3, "triangle", 0.16, 0.34);
    },
    die: function () { beep(500, 0.35, "sine", 0.1, 0, 120); }
  };

  // —— Toast ——
  function toast(text, ms) {
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, ms || 2200);
  }

  // —— Maastopiirto (offscreen) ——
  var terrCanvas = document.createElement("canvas");
  terrCanvas.width = W; terrCanvas.height = H;
  var tctx = terrCanvas.getContext("2d");
  var terrVersion = -1;
  var dirtyRects = [];

  function hash2(x, y) {
    var h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >> 13)) * 1274126177 | 0;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }

  function renderTerrainRect(x0, y0, x1, y1) {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0);
    x1 = Math.min(W - 1, x1 | 0); y1 = Math.min(H - 1, y1 | 0);
    if (x1 < x0 || y1 < y0) return;
    var w = x1 - x0 + 1, h = y1 - y0 + 1;
    var img = tctx.createImageData(w, h);
    var data = img.data;
    var terr = st.terrain;
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var i = ((y - y0) * w + (x - x0)) * 4;
        if (terr[y * W + x] !== 1) { data[i + 3] = 0; continue; }
        // Etäisyys pintaan (ruohokerros)
        var depth = 0;
        for (var d = 1; d <= 6; d++) {
          var yy = y - d;
          if (yy < 0 || terr[yy * W + x] !== 1) { depth = d; break; }
        }
        var n = hash2(x, y);
        var r, g, b;
        if (depth === 1) { r = 136; g = 176; b = 75; }
        else if (depth === 2 || depth === 3) { r = 104; g = 146; b = 62; }
        else if (depth === 4 || depth === 5) { r = 92; g = 112, b = 52; }
        else {
          // Multa: tummenee alaspäin, rakeinen
          var t = Math.min(1, (y - H * 0.3) / (H * 0.62));
          r = 128 - 62 * t; g = 88 - 44 * t; b = 52 - 26 * t;
        }
        var j = (n - 0.5) * 26;
        r += j; g += j * 0.9; b += j * 0.7;
        // Reunavarjo sivuilta
        if (x > 0 && terr[y * W + x - 1] !== 1) { r *= 0.82; g *= 0.82; b *= 0.82; }
        if (x < W - 1 && terr[y * W + x + 1] !== 1) { r *= 0.82; g *= 0.82; b *= 0.82; }
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
      }
    }
    tctx.clearRect(x0, y0, w, h);
    tctx.putImageData(img, x0, y0);
  }

  function syncTerrain() {
    if (!st) return;
    if (terrVersion === -1 || st.terrainVersion !== terrVersion) {
      if (terrVersion === -1 || dirtyRects.length === 0) {
        renderTerrainRect(0, 0, W - 1, H - 1);
      } else {
        dirtyRects.forEach(function (r) { renderTerrainRect(r[0], r[1], r[2], r[3]); });
      }
      dirtyRects = [];
      terrVersion = st.terrainVersion;
    }
  }

  // —— Taivas (offscreen, seedattu) ——
  var skyCanvas = document.createElement("canvas");
  skyCanvas.width = W; skyCanvas.height = H;

  function renderSky(seed) {
    var sc = skyCanvas.getContext("2d");
    var grad = sc.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#7fa8c9");
    grad.addColorStop(0.45, "#b8cdc9");
    grad.addColorStop(0.72, "#e9d3a2");
    grad.addColorStop(1, "#f0c98a");
    sc.fillStyle = grad;
    sc.fillRect(0, 0, W, H);
    // Aurinko
    var sg = sc.createRadialGradient(W * 0.78, H * 0.2, 8, W * 0.78, H * 0.2, 130);
    sg.addColorStop(0, "rgba(255,244,214,0.95)");
    sg.addColorStop(0.25, "rgba(255,232,170,0.5)");
    sg.addColorStop(1, "rgba(255,232,170,0)");
    sc.fillStyle = sg;
    sc.fillRect(0, 0, W, H);
    sc.fillStyle = "#fdf2d0";
    sc.beginPath(); sc.arc(W * 0.78, H * 0.2, 26, 0, Math.PI * 2); sc.fill();

    // Kaukaiset kuusimetsät (kaksi kerrosta)
    var rnd = (function (s) { var a = s >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })(seed ^ 0x5f3759df);
    function treeline(baseY, amp, color, treeH) {
      sc.fillStyle = color;
      var x = -20;
      var yb = baseY;
      while (x < W + 20) {
        var tw = 16 + rnd() * 22;
        var th = treeH * (0.7 + rnd() * 0.6);
        yb = baseY + Math.sin(x * 0.008 + amp) * amp;
        sc.beginPath();
        sc.moveTo(x, yb);
        sc.lineTo(x + tw / 2, yb - th);
        sc.lineTo(x + tw, yb);
        sc.closePath();
        sc.fill();
        sc.fillRect(x, yb - 2, tw, H - yb + 2 < 0 ? 0 : Math.min(40, H));
        x += tw * (0.55 + rnd() * 0.3);
      }
    }
    treeline(H * 0.52, 14, "rgba(108,138,120,0.55)", 46);
    treeline(H * 0.58, 10, "rgba(62,92,72,0.75)", 60);
  }

  // —— Lehdet (tuulen ilmaisin) ——
  function initLeaves() {
    leaves = [];
    for (var i = 0; i < 16; i++) {
      leaves.push({
        x: Math.random() * W, y: Math.random() * H * 0.7,
        p: Math.random() * Math.PI * 2,
        c: ["#d9a23d", "#c26b2e", "#a84f26", "#8f9a3f"][i % 4],
        s: 2.2 + Math.random() * 2
      });
    }
  }

  function updateLeaves(dt) {
    var wind = st ? st.wind : 0;
    for (var i = 0; i < leaves.length; i++) {
      var L = leaves[i];
      L.p += dt * 2.2;
      L.x += (wind * 0.55 + Math.sin(L.p) * 12) * dt;
      L.y += (22 + Math.cos(L.p * 0.7) * 10) * dt;
      if (L.y > WATER_Y - 4) { L.y = -8; L.x = Math.random() * W; }
      if (L.x < -10) L.x += W + 20;
      if (L.x > W + 10) L.x -= W + 20;
    }
  }

  // —— Partikkelit ——
  function spawnExplosion(x, y, r) {
    particles.push({ type: "flash", x: x, y: y, age: 0, life: 0.28, r: r });
    for (var i = 0; i < 16; i++) {
      var a = Math.random() * Math.PI * 2;
      var sp = 60 + Math.random() * 200;
      particles.push({
        type: "soil", x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120,
        age: 0, life: 0.7 + Math.random() * 0.5,
        size: 2 + Math.random() * 3.5,
        c: ["#6b4a2c", "#54371f", "#7d5c38", "#8fae4e"][i % 4]
      });
    }
    for (i = 0; i < 8; i++) {
      particles.push({
        type: "smoke", x: x + (Math.random() - 0.5) * r * 0.7,
        y: y + (Math.random() - 0.5) * r * 0.7,
        vx: (Math.random() - 0.5) * 30, vy: -26 - Math.random() * 30,
        age: 0, life: 1.1 + Math.random() * 0.7,
        size: 6 + Math.random() * 9
      });
    }
    shake = Math.min(14, shake + r * 0.18);
  }

  function spawnSplash(x) {
    for (var i = 0; i < 12; i++) {
      particles.push({
        type: "drop", x: x + (Math.random() - 0.5) * 10, y: WATER_Y,
        vx: (Math.random() - 0.5) * 90, vy: -110 - Math.random() * 160,
        age: 0, life: 0.8, size: 1.6 + Math.random() * 2
      });
    }
    particles.push({ type: "ring", x: x, y: WATER_Y + 3, age: 0, life: 0.5 });
  }

  function spawnPoof(x, y) {
    for (var i = 0; i < 10; i++) {
      particles.push({
        type: "smoke", x: x + (Math.random() - 0.5) * 8, y: y - 8 + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30,
        age: 0, life: 0.9, size: 4 + Math.random() * 6
      });
    }
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.age += dt;
      if (p.age >= p.life) { particles.splice(i, 1); continue; }
      if (p.type === "soil" || p.type === "drop") {
        p.vy += 420 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.type === "drop" && p.y > WATER_Y + 4) { particles.splice(i, 1); }
      } else if (p.type === "smoke") {
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.size += 8 * dt;
      }
    }
    for (i = floaters.length - 1; i >= 0; i--) {
      var f = floaters[i];
      f.age += dt;
      f.y -= 26 * dt;
      if (f.age > 1.3) floaters.splice(i, 1);
    }
  }

  // —— Oravan piirto ——
  function drawSquirrel(c, view) {
    var isActive = c.id === view.activeId && view.phase === "aim";
    var body = c.team === 0 ? "#b55a2e" : "#8b8e98";
    var bodyDark = c.team === 0 ? "#8f4220" : "#6c6f7a";
    var belly = c.team === 0 ? "#eed9b8" : "#e4e4e0";
    var band = TEAM_COLORS[c.team];
    var bob = isActive ? Math.sin(timeNow * 5) * 1.2 : 0;

    ctx.save();
    ctx.translate(c.x, c.y + bob);
    ctx.scale(c.facing, 1);

    // Häntä: iso tuuhea S-kaari selän takana
    ctx.fillStyle = bodyDark;
    ctx.beginPath();
    ctx.moveTo(-4, -3);
    ctx.bezierCurveTo(-16, -2, -19, -14, -13, -24);
    ctx.bezierCurveTo(-10, -29, -3, -29, -4, -23);
    ctx.bezierCurveTo(-11, -20, -11, -12, -3, -9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(-4.5, -4);
    ctx.bezierCurveTo(-14, -4, -16, -13, -11.5, -21);
    ctx.bezierCurveTo(-9.5, -24.5, -5, -24, -6, -19.5);
    ctx.bezierCurveTo(-10, -17, -9.5, -11, -3, -8.5);
    ctx.closePath();
    ctx.fill();

    // Vartalo
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, -8, 6.5, 8.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Maha
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.ellipse(2, -6.5, 3.4, 5.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Pää
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(4, -17, 5.6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Korva + töyhtö
    ctx.beginPath();
    ctx.moveTo(1.5, -20.5); ctx.lineTo(2.6, -26.5); ctx.lineTo(5.4, -21.6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = bodyDark;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(2.6, -26.5); ctx.lineTo(2.2, -28.5); ctx.stroke();
    // Kuono + nenä
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.ellipse(7.4, -15.6, 2.6, 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a1a10";
    ctx.beginPath(); ctx.arc(9.4, -16, 1.1, 0, Math.PI * 2); ctx.fill();
    // Silmä
    ctx.fillStyle = "#1c120a";
    ctx.beginPath(); ctx.arc(5.4, -18, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(5.9, -18.5, 0.5, 0, Math.PI * 2); ctx.fill();
    // Panta (joukkueväri)
    ctx.strokeStyle = band;
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(4, -17, 5.4, Math.PI * 0.75, Math.PI * 1.45); ctx.stroke();
    ctx.fillStyle = band;
    ctx.beginPath();
    ctx.moveTo(-0.6, -20.4); ctx.lineTo(-4.4, -22.6); ctx.lineTo(-2.8, -19); ctx.closePath();
    ctx.fill();
    // Käpälät
    ctx.fillStyle = bodyDark;
    ctx.beginPath(); ctx.ellipse(2.4, -0.6, 2.6, 1.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-2.4, -0.6, 2.6, 1.6, 0, 0, Math.PI * 2); ctx.fill();

    ctx.restore();

    // HP-palkki + nimi
    if (c.alive) {
      var bw = 30;
      var bx = c.x - bw / 2, by = c.y - 40;
      ctx.fillStyle = "rgba(12,20,12,0.65)";
      roundRect(bx - 1, by - 1, bw + 2, 5.6, 2.8); ctx.fill();
      var frac = Math.max(0, c.hp / 100);
      ctx.fillStyle = frac > 0.5 ? "#7cbf4e" : frac > 0.25 ? "#d9a23d" : "#d9543d";
      roundRect(bx, by, bw * frac, 3.6, 1.8); ctx.fill();
      ctx.font = "600 10px 'Source Serif 4', Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(12,20,12,0.75)";
      ctx.fillText(c.name, c.x + 0.7, by - 4 + 0.7);
      ctx.fillStyle = c.id === view.activeId ? "#fff6dd" : "#f0e6cc";
      ctx.fillText(c.name, c.x, by - 4);
    }

    // Aktiivisen merkki
    if (isActive) {
      var ay = c.y - 52 + Math.sin(timeNow * 6) * 2.5;
      ctx.fillStyle = TEAM_LIGHT[c.team];
      ctx.beginPath();
      ctx.moveTo(c.x - 5, ay); ctx.lineTo(c.x + 5, ay); ctx.lineTo(c.x, ay + 7);
      ctx.closePath(); ctx.fill();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawGrave(gx, gy) {
    ctx.save();
    ctx.translate(gx, gy);
    ctx.fillStyle = "#6b4a2c";
    ctx.fillRect(-3, -10, 6, 10);
    ctx.fillStyle = "#54371f";
    ctx.fillRect(-3, -10, 6, 2.4);
    ctx.fillStyle = "#b5432f";
    ctx.beginPath(); ctx.ellipse(0, -12, 6, 3.6, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-2.4, -13, 0.9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(2, -13.4, 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawProjectile(p) {
    var rot = Math.atan2(p.vy, p.vx);
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.type === "sinko") {
      ctx.rotate(rot);
      ctx.fillStyle = "#5e3d1f";
      ctx.beginPath(); ctx.ellipse(0, 0, 6.6, 4.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#7d5c38";
      ctx.lineWidth = 1;
      for (var k = -1; k <= 1; k++) {
        ctx.beginPath(); ctx.arc(k * 3.4, 0, 3.2, -1.1, 1.1); ctx.stroke();
      }
      // Savuvana
      if (Math.random() < 0.6) {
        particles.push({
          type: "smoke", x: p.x - Math.cos(rot) * 7, y: p.y - Math.sin(rot) * 7,
          vx: 0, vy: -8, age: 0, life: 0.5, size: 2.5
        });
      }
    } else if (p.type === "terho") {
      ctx.rotate(Math.sin(timeNow * 9) * 0.4);
      ctx.fillStyle = "#a9743a";
      ctx.beginPath(); ctx.ellipse(0, 1.4, 4.4, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#6d4a26";
      ctx.beginPath(); ctx.ellipse(0, -2.8, 4.9, 2.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-1, -7.4, 2, 3);
      if (p.fuse < 1.2 && Math.floor(timeNow * 10) % 2 === 0) {
        ctx.fillStyle = "#ff5f3d";
        ctx.beginPath(); ctx.arc(0, -8.4, 2, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      // marja / marjanen
      ctx.fillStyle = "#b5262f";
      ctx.beginPath(); ctx.arc(0, 0, p.type === "marja" ? 4.6 : 3.2, 0, Math.PI * 2); ctx.fill();
      if (p.type === "marja") {
        ctx.beginPath(); ctx.arc(-3.4, -2.6, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(3, -3, 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath(); ctx.arc(-1, -1.4, 1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  // —— Tähtäys ——
  function humanTurn(view) {
    return view.phase === "aim" && (st.mode === "hotseat" || view.turnTeam === 0);
  }

  function drawAim(view) {
    var c = st.chars.filter(function (x) { return x.id === view.activeId; })[0];
    if (!c || !c.alive) return;
    var isHuman = humanTurn(view);
    var aiming = isHuman || ai.state === "aiming" || ai.state === "charging";
    if (!aiming) return;

    var dx = Math.cos(c.aim) * c.facing;
    var dy = -Math.sin(c.aim);
    var ox = c.x, oy = c.y - 10;

    // Rataennuste (vain ihmiselle — koneen suunnitelmaa ei paljasteta)
    if (isHuman) {
      var wp = E.WEAPONS[weapon];
      var pow = charging ? chargeT : 0.65;
      var vx = dx * E.MAX_SPEED * pow, vy = dy * E.MAX_SPEED * pow;
      var px = ox + dx * 16, py = oy + dy * 16;
      ctx.fillStyle = "rgba(255,246,221,0.75)";
      for (var s = 0; s < 66; s++) {
        vx += (wp.wind ? st.wind : 0) * DT;
        vy += E.GRAV * DT;
        px += vx * DT; py += vy * DT;
        if (E.solidAt(st, px, py) || py > WATER_Y) break;
        if (s % 5 === 0) {
          var a = 0.95 - s / 85;
          ctx.globalAlpha = Math.max(0.18, a);
          ctx.strokeStyle = "rgba(20,30,20,0.6)";
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(px, py, 2.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // Tähtäin
    var tx = ox + dx * 46, ty = oy + dy * 46;
    ctx.strokeStyle = "rgba(255,246,221,0.95)";
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(tx, ty, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(tx - 9, ty); ctx.lineTo(tx - 3, ty);
    ctx.moveTo(tx + 3, ty); ctx.lineTo(tx + 9, ty);
    ctx.moveTo(tx, ty - 9); ctx.lineTo(tx, ty - 3);
    ctx.moveTo(tx, ty + 3); ctx.lineTo(tx, ty + 9);
    ctx.stroke();

    // Voimamittari
    var showCharge = charging || ai.state === "charging";
    if (showCharge) {
      var cp = charging ? chargeT : ai.chargeShown || 0;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(Math.atan2(dy, dx));
      var lg = ctx.createLinearGradient(14, 0, 14 + 34, 0);
      lg.addColorStop(0, "#8fae4e");
      lg.addColorStop(0.6, "#d9a23d");
      lg.addColorStop(1, "#d9543d");
      ctx.fillStyle = "rgba(12,20,12,0.5)";
      roundRect(14, -3.4, 34, 6.8, 3.4); ctx.fill();
      ctx.fillStyle = lg;
      roundRect(14, -3.4, 34 * cp, 6.8, 3.4); ctx.fill();
      ctx.restore();
    }
  }

  // —— Vesi ——
  function drawWater() {
    var g = ctx.createLinearGradient(0, WATER_Y, 0, H);
    g.addColorStop(0, "rgba(46,96,120,0.82)");
    g.addColorStop(1, "rgba(16,42,60,0.95)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, H); ctx.lineTo(0, WATER_Y);
    for (var x = 0; x <= W; x += 12) {
      ctx.lineTo(x, WATER_Y + Math.sin(x * 0.03 + timeNow * 1.8) * 2.4);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(210,235,240,0.5)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (x = 0; x <= W; x += 12) {
      var y = WATER_Y + Math.sin(x * 0.03 + timeNow * 1.8) * 2.4;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // —— Pääpiirto ——
  function draw() {
    ctx.save();
    if (shake > 0.3) {
      ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    ctx.drawImage(skyCanvas, 0, 0);

    // Lehdet (tuuli näkyy)
    for (var i = 0; i < leaves.length; i++) {
      var L = leaves[i];
      ctx.save();
      ctx.translate(L.x, L.y);
      ctx.rotate(Math.sin(L.p) * 0.9);
      ctx.fillStyle = L.c;
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.ellipse(0, 0, L.s, L.s * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    if (st) {
      syncTerrain();
      ctx.drawImage(terrCanvas, 0, 0);
      var view = E.getView(st);

      for (i = 0; i < graves.length; i++) drawGrave(graves[i].x, graves[i].y);
      for (i = 0; i < st.chars.length; i++) {
        if (st.chars[i].alive) drawSquirrel(st.chars[i], view);
      }
      for (i = 0; i < st.projectiles.length; i++) drawProjectile(st.projectiles[i]);
      if (view.phase === "aim") drawAim(view);
    }

    // Partikkelit
    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      var lifeK = 1 - p.age / p.life;
      if (p.type === "flash") {
        ctx.globalAlpha = lifeK;
        var rr = p.r * (0.4 + (1 - lifeK) * 0.9);
        var rg = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, rr);
        rg.addColorStop(0, "rgba(255,240,200,0.95)");
        rg.addColorStop(0.5, "rgba(255,170,80,0.7)");
        rg.addColorStop(1, "rgba(255,120,50,0)");
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fill();
      } else if (p.type === "soil") {
        ctx.globalAlpha = lifeK;
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else if (p.type === "smoke") {
        ctx.globalAlpha = 0.32 * lifeK;
        ctx.fillStyle = "#d8d2c4";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else if (p.type === "drop") {
        ctx.globalAlpha = 0.8 * lifeK;
        ctx.fillStyle = "#bfe0ea";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else if (p.type === "ring") {
        ctx.globalAlpha = 0.7 * lifeK;
        ctx.strokeStyle = "#d6eef2";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 6 + (1 - lifeK) * 34, 3 + (1 - lifeK) * 8, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    drawWater();

    // Leijuvat vahinkonumerot
    ctx.font = "700 13px 'Fraunces', Georgia, serif";
    ctx.textAlign = "center";
    for (i = 0; i < floaters.length; i++) {
      var f = floaters[i];
      ctx.globalAlpha = Math.max(0, 1 - f.age / 1.3);
      ctx.fillStyle = "rgba(12,20,12,0.7)";
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.c;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  // —— Tapahtumat moottorilta ——
  function charById(id) {
    for (var i = 0; i < st.chars.length; i++) if (st.chars[i].id === id) return st.chars[i];
    return null;
  }

  function teamLabel(t) { return t === 0 ? "Punaiset" : "Harmaat"; }

  function handleEvents() {
    var evs = E.drainEvents(st);
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      var c;
      switch (e.t) {
        case "turn":
          ai.state = "idle"; ai.wait = 0.9; ai.plan = null;
          charging = false; chargeT = 0;
          c = charById(e.id);
          if (c) {
            var who = st.mode === "ai" && e.team === 1 ? "Kone: " + c.name : c.name;
            toast("Vuorossa " + who + " (" + teamLabel(e.team) + ")", 1700);
          }
          break;
        case "fire":
          snd.fire();
          particles.push({ type: "flash", x: e.x, y: e.y, age: 0, life: 0.15, r: 16 });
          break;
        case "explosion":
          spawnExplosion(e.x, e.y, e.r);
          dirtyRects.push([e.x - e.r - 4, e.y - e.r - 10, e.x + e.r + 4, e.y + e.r + 10]);
          snd.boom(e.r > 34);
          break;
        case "bounce": snd.bounce(); break;
        case "splash": spawnSplash(e.x); snd.splash(); break;
        case "hurt":
          c = charById(e.id);
          if (c) floaters.push({ x: c.x, y: c.y - 44, text: "-" + e.amount, c: "#ffd9c4", age: 0 });
          snd.hurt();
          break;
        case "thud":
          c = charById(e.id);
          if (c) floaters.push({ x: c.x, y: c.y - 44, text: "-" + e.amount, c: "#e8cf9e", age: 0 });
          noiseBurst(200, 0.08, 0.2, 0, 2);
          break;
        case "land": noiseBurst(220, 0.05, 0.1, 0, 2.5); break;
        case "jump": snd.jump(); break;
        case "die":
          c = charById(e.id);
          if (c) {
            graves.push({ x: c.x, y: c.y });
            spawnPoof(c.x, c.y);
            toast(c.name + " menehtyi!", 2000);
          }
          snd.die();
          break;
        case "drown":
          c = charById(e.id);
          if (c) toast(c.name + " molskahti järveen!", 2200);
          spawnSplash(e.x != null ? e.x : (c ? c.x : W / 2));
          snd.splash();
          break;
        case "sudden":
          toast("Äkkikuolema! Kaikkien voimat hupenevat.", 2800);
          snd.sudden();
          break;
        case "timeout":
          toast("Aika loppui — vuoro ohi!", 1800);
          break;
        case "gameover":
          onGameOver(e.winner);
          break;
      }
    }
  }

  function onGameOver(winner) {
    var title, text;
    if (winner === "draw") {
      title = "Tasapeli!";
      text = "Metsä hiljeni — kumpikaan lauma ei jäänyt pystyyn.";
    } else {
      title = teamLabel(winner) + " voittivat!";
      text = winner === 0
        ? "Punaoravien käpysade ratkaisi taistelun."
        : "Harmaaoravat pitivät pintansa.";
      if (st.mode === "ai") {
        text = winner === 0 ? "Voitit koneen — metsä on punaisten!" : "Kone vei voiton. Revanssi?";
      }
    }
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    modePicker.style.display = "none";
    againRow.style.display = "flex";
    overlay.classList.add("show");
    snd.win();
  }

  // —— AI-ohjuri: pieni draama ennen laukausta ——
  function stepAI() {
    var view = E.getView(st);
    if (view.phase !== "aim" || st.mode !== "ai" || view.turnTeam !== 1) return;
    var c = charById(view.activeId);
    if (!c) return;

    if (ai.state === "idle") {
      ai.wait -= DT;
      if (ai.wait <= 0) {
        ai.plan = E.aiPlan(st);
        ai.aimFrom = c.aim;
        ai.t = 0;
        E.setFacing(st, ai.plan.facing);
        ai.state = "aiming";
        phaseEl.textContent = "Kone tähtää…";
      }
      return;
    }
    if (ai.state === "aiming") {
      ai.t += DT / 0.7;
      var k = Math.min(1, ai.t);
      E.setAim(st, ai.aimFrom + (ai.plan.aim - ai.aimFrom) * (k * k * (3 - 2 * k)));
      if (k >= 1) { ai.state = "charging"; ai.t = 0; ai.chargeShown = 0; }
      return;
    }
    if (ai.state === "charging") {
      ai.t += DT / 0.8;
      ai.chargeShown = Math.min(ai.plan.power, ai.t);
      if (ai.t >= ai.plan.power) {
        E.fire(st, { weapon: ai.plan.weapon, aim: ai.plan.aim, facing: ai.plan.facing, power: ai.plan.power });
        ai.state = "done";
      }
    }
  }

  // —— Ihmisen syöte per tick ——
  var AIM_SPEED = 1.5; // rad/s

  function stepHuman() {
    var view = E.getView(st);
    if (!humanTurn(view)) { E.setInput(st, { move: 0, jump: false }); return; }
    var c = charById(view.activeId);
    if (!c) return;

    var move = 0;
    if (keys.ArrowLeft || keys.a) move -= 1;
    if (keys.ArrowRight || keys.d) move += 1;
    E.setInput(st, { move: move, jump: pendingJump });
    pendingJump = false;

    if (keys.ArrowUp || keys.w) E.setAim(st, c.aim + AIM_SPEED * DT);
    if (keys.ArrowDown || keys.s) E.setAim(st, c.aim - AIM_SPEED * DT);

    if (charging) {
      chargeT = Math.min(1, chargeT + DT / 1.15);
      if (chargeT >= 1) fireNow();
    }
  }

  function fireNow() {
    if (!st || !charging) return;
    var view = E.getView(st);
    charging = false;
    if (!humanTurn(view)) return;
    E.fire(st, { weapon: weapon, power: Math.max(0.15, chargeT) });
    chargeT = 0;
  }

  function startCharge() {
    if (!st) return;
    var view = E.getView(st);
    if (!humanTurn(view) || view.shotFired) return;
    ensureAudio();
    if (!charging) { charging = true; chargeT = 0; }
  }

  // —— HUD ——
  function updateHud() {
    if (!st) return;
    var view = E.getView(st);
    var totHp = [0, 0];
    for (var t = 0; t < 2; t++) {
      totHp[t] = view.teams[t].hp;
      tbFills[t].style.width = Math.max(0, Math.min(100, totHp[t] / 3)) + "%";
      tbAlives[t].textContent = view.teams[t].alive + "/3";
      teambars[t].classList.toggle("active", view.phase === "aim" && view.turnTeam === t);
    }

    var c = charById(view.activeId);
    if (view.phase === "over") {
      statTurn.textContent = view.winner === "draw" ? "Tasapeli" : teamLabel(view.winner);
      statTurn.className = "";
      phaseEl.textContent = view.winner === "draw" ? "Tasapeli" : teamLabel(view.winner) + " voittivat!";
    } else if (c) {
      statTurn.textContent = c.name;
      statTurn.className = "t" + view.turnTeam;
      if (view.phase === "aim") {
        var human = humanTurn(view);
        phaseEl.textContent = human
          ? "Vuorossa: " + c.name + " (" + teamLabel(view.turnTeam) + ")"
          : "Kone miettii…";
        messageEl.textContent = human
          ? (view.shotFired ? "Laukaus lähti!" : "Liiku, tähtää ja pidä välilyönti pohjassa — vapautus laukaisee.")
          : "Harmaaoravat suunnittelevat siirtoaan.";
      } else {
        phaseEl.textContent = "Käpyjä ilmassa!";
        messageEl.textContent = "Odotetaan, että pöly laskeutuu.";
      }
    }

    var secs = Math.ceil(view.timer);
    statTimerV.textContent = view.phase === "aim" ? secs + " s" : "—";
    statTimer.classList.toggle("low", view.phase === "aim" && secs <= 10);

    var wv = Math.abs(view.wind);
    var arrows = wv < 8 ? "·" : (view.wind > 0 ? "→" : "←").repeat(wv > 60 ? 3 : wv > 30 ? 2 : 1);
    statWind.textContent = arrows + " " + Math.round(wv / 10);
    statRound.textContent = String(Math.max(1, Math.ceil(view.turnNo / 2)));
  }

  var lastTickSec = -1;
  function tickSound(view) {
    if (view.phase !== "aim") return;
    var secs = Math.ceil(view.timer);
    if (secs <= 5 && secs !== lastTickSec && humanTurn(view)) snd.tick();
    lastTickSec = secs;
  }

  // —— Pelin käynnistys ——
  function startGame(mode, aiLevel, seed) {
    settings.mode = mode;
    settings.aiLevel = aiLevel || "tarkka";
    st = E.createState({
      seed: seed == null ? ((Math.random() * 0x7fffffff) | 0) : seed,
      mode: mode,
      aiLevel: settings.aiLevel
    });
    terrVersion = -1;
    dirtyRects = [];
    particles = [];
    floaters = [];
    graves = [];
    weapon = "sinko";
    charging = false;
    chargeT = 0;
    weaponBtns.forEach(function (b) { b.classList.toggle("active", b.dataset.weapon === "sinko"); });
    renderSky(st.seed);
    initLeaves();
    E.drainEvents(st); // alkuvuoron turn-event → oma toast
    var first = charById(st.activeId);
    toast("Vuorossa " + (first ? first.name : "?") + " (Punaiset)", 1900);
    overlay.classList.remove("show");
    running = true;
  }

  // —— Pääsilmukka ——
  function frame(ts) {
    var dt = Math.min(0.1, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts;
    timeNow += dt;

    if (st && running && !overlay.classList.contains("show")) {
      acc += dt;
      var guard = 0;
      while (acc >= DT && guard++ < 8) {
        stepHuman();
        stepAI();
        E.tick(st);
        handleEvents();
        acc -= DT;
      }
      if (guard >= 8) acc = 0; // välilehti oli taustalla — ei kirimistä
      tickSound(E.getView(st));
    }

    updateLeaves(dt);
    updateParticles(dt);
    shake *= Math.pow(0.02, dt);
    draw();
    updateHud();
    requestAnimationFrame(frame);
  }

  // —— Syötteet ——
  var KEYMAP = { ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, a: 1, d: 1, w: 1, s: 1 };

  window.addEventListener("keydown", function (ev) {
    var k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (k === " ") {
      ev.preventDefault();
      startCharge();
      return;
    }
    if (KEYMAP[k]) { keys[k] = true; ev.preventDefault(); }
    if (k === "x" || k === "Enter") { pendingJump = true; ev.preventDefault(); }
    if (k === "1" || k === "2" || k === "3") {
      var names = { 1: "sinko", 2: "terho", 3: "marja" };
      selectWeapon(names[k]);
    }
    if (k === "f") toggleFullscreen();
  });

  window.addEventListener("keyup", function (ev) {
    var k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
    if (k === " ") { ev.preventDefault(); fireNow(); return; }
    if (KEYMAP[k]) keys[k] = false;
  });

  // Hiiritähtäys: osoitin ohjaa kulmaa, pito lataa, vapautus ampuu
  function canvasPos(ev) {
    var r = canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - r.left) * (W / r.width),
      y: (ev.clientY - r.top) * (H / r.height)
    };
  }

  canvas.addEventListener("pointermove", function (ev) {
    if (!st) return;
    var view = E.getView(st);
    if (!humanTurn(view)) return;
    if (ev.pointerType !== "mouse" && !mouseAiming) return;
    var c = charById(view.activeId);
    if (!c) return;
    var p = canvasPos(ev);
    var dx = p.x - c.x, dy = (c.y - 10) - p.y;
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
    var facing = dx >= 0 ? 1 : -1;
    E.setFacing(st, facing);
    E.setAim(st, Math.atan2(dy, Math.abs(dx)));
  });

  canvas.addEventListener("pointerdown", function (ev) {
    if (ev.pointerType !== "mouse") { mouseAiming = true; return; }
    startCharge();
  });

  window.addEventListener("pointerup", function (ev) {
    if (ev.pointerType !== "mouse") { mouseAiming = false; return; }
    if (charging) fireNow();
  });

  // Kosketusohjaimet
  function bindHold(el, down, up) {
    if (!el) return;
    el.addEventListener("pointerdown", function (ev) { ev.preventDefault(); down(); });
    el.addEventListener("pointerup", function (ev) { ev.preventDefault(); if (up) up(); });
    el.addEventListener("pointercancel", function () { if (up) up(); });
    el.addEventListener("pointerleave", function () { if (up) up(); });
  }

  bindHold(document.getElementById("tLeft"), function () { keys.ArrowLeft = true; }, function () { keys.ArrowLeft = false; });
  bindHold(document.getElementById("tRight"), function () { keys.ArrowRight = true; }, function () { keys.ArrowRight = false; });
  bindHold(document.getElementById("tUp"), function () { keys.ArrowUp = true; }, function () { keys.ArrowUp = false; });
  bindHold(document.getElementById("tDown"), function () { keys.ArrowDown = true; }, function () { keys.ArrowDown = false; });
  bindHold(document.getElementById("tJump"), function () { pendingJump = true; }, null);
  bindHold(document.getElementById("tFire"), startCharge, fireNow);

  // Asevalinta
  function selectWeapon(name) {
    if (!E.WEAPONS[name]) return;
    weapon = name;
    weaponBtns.forEach(function (b) { b.classList.toggle("active", b.dataset.weapon === name); });
  }
  weaponBtns.forEach(function (b) {
    // blur: välilyönti/Enter kuuluu pelille, ei fokusoidulle napille
    b.addEventListener("click", function () { selectWeapon(b.dataset.weapon); b.blur(); });
  });

  // Napit
  btnSkip.addEventListener("click", function () {
    btnSkip.blur();
    if (!st) return;
    var view = E.getView(st);
    if (humanTurn(view)) E.skipTurn(st);
  });

  btnNew.addEventListener("click", showMenu);
  btnMenu.addEventListener("click", showMenu);
  btnAgain.addEventListener("click", function () {
    startGame(settings.mode, settings.aiLevel);
  });

  function showMenu() {
    overlayTitle.textContent = "Käpysota";
    overlayText.textContent = "Kaksi oravalaumaa, yksi metsä. Kaada vastustajan oravat kävyillä, terhoilla ja marjoilla — tuhoutuvassa maastossa.";
    modePicker.style.display = "flex";
    againRow.style.display = "none";
    overlay.classList.add("show");
  }

  modePicker.querySelectorAll("button").forEach(function (b) {
    b.addEventListener("click", function () {
      ensureAudio();
      b.blur();
      startGame(b.dataset.mode, b.dataset.ailevel || "tarkka");
    });
  });

  // Ääni
  function syncSoundBtn() {
    btnSound.textContent = soundOn ? "Ääni: päällä" : "Ääni: pois";
    btnSound.setAttribute("aria-pressed", String(soundOn));
  }
  btnSound.addEventListener("click", function () {
    soundOn = !soundOn;
    try { window.localStorage.setItem("kapysota.sound", soundOn ? "on" : "off"); } catch (e) { /* ei tallennu */ }
    syncSoundBtn();
  });
  syncSoundBtn();

  // Koko ruutu
  function toggleFullscreen() {
    var el = document.documentElement;
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
    }
  }
  btnFs.addEventListener("click", toggleFullscreen);
  if (btnFsCorner) btnFsCorner.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", function () {
    document.body.classList.toggle("is-fullscreen", !!document.fullscreenElement);
  });

  // Smoke-testattava rajapinta
  window.KapysotaUI = {
    start: startGame,
    engine: E,
    getState: function () { return st; },
    getView: function () { return st ? E.getView(st) : null; },
    selectWeapon: selectWeapon,
    fire: function (opts) { return st ? E.fire(st, opts) : false; },
    skip: function () { if (st) E.skipTurn(st); }
  };

  renderSky(20260724); // maisema näkyy valikon takana jo ennen ensimmäistä peliä
  initLeaves();
  showMenu();
  requestAnimationFrame(frame);
})();
