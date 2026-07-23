// Labyrintti — canvas-UI: nuolet, kallistus, koko ruutu, tasot, äänet.
(function () {
  "use strict";

  var E = window.LabyrinttiEngine;
  if (!E) throw new Error("LabyrinttiEngine puuttuu");

  var shell = document.querySelector(".shell");
  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var tiltEl = document.getElementById("boardTilt");
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlayTitle");
  var overlayText = document.getElementById("overlayText");
  var overlayBtn = document.getElementById("overlayBtn");
  var phaseEl = document.getElementById("phase");
  var messageEl = document.getElementById("message");
  var levelEl = document.getElementById("statLevel");
  var attemptsEl = document.getElementById("statAttempts");
  var timeEl = document.getElementById("statTime");
  var progressEl = document.getElementById("statProgress");
  var toastEl = document.getElementById("toast");
  var tiltDot = document.getElementById("tiltDot");
  var btnStart = document.getElementById("btnStart");
  var btnRetry = document.getElementById("btnRetry");
  var btnNew = document.getElementById("btnNew");
  var btnFs = document.getElementById("btnFullscreen");
  var btnFsCorner = document.getElementById("btnFsCorner");
  var btnSound = document.getElementById("btnSound");
  var diffBtns = {
    easy: document.getElementById("diffEasy"),
    normal: document.getElementById("diffNormal"),
    hard: document.getElementById("diffHard")
  };

  var difficulty = "normal";
  try {
    var savedDiff = window.localStorage.getItem("labyrintti.difficulty");
    if (savedDiff && E.DIFFICULTY[savedDiff]) difficulty = savedDiff;
  } catch (e) { /* localStorage ei käytettävissä */ }

  var st = E.createState(1, difficulty);
  var keys = Object.create(null);
  var running = false;
  var inputMode = "keys";
  var lastTs = 0;
  var toastTimer = 0;
  var fallDelay = 0;
  var woodPattern = null;
  var orientBound = false;
  var shake = 0;
  var trail = [];
  var overlayAction = begin;

  // —— Ääni (WebAudio, luodaan käyttäjän eleestä) ——
  var audioCtx = null;
  var soundOn = true;
  var lastTick = 0;

  function ensureAudio() {
    if (!soundOn) return null;
    if (!audioCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function beep(freq, dur, type, gain, when) {
    var ac = ensureAudio();
    if (!ac) return;
    var t0 = ac.currentTime + (when || 0);
    var osc = ac.createOscillator();
    var g = ac.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function soundWall() {
    var now = performance.now();
    if (now - lastTick < 70) return;
    lastTick = now;
    beep(150 + Math.random() * 40, 0.05, "square", 0.05);
  }
  function soundFall() {
    beep(220, 0.16, "sawtooth", 0.14);
    beep(90, 0.28, "sine", 0.12, 0.02);
  }
  function soundCheckpoint() {
    beep(660, 0.1, "triangle", 0.1);
    beep(990, 0.12, "triangle", 0.1, 0.08);
  }
  function soundWin() {
    [523, 659, 784, 1047].forEach(function (f, i) {
      beep(f, 0.18, "triangle", 0.12, i * 0.09);
    });
  }

  function fitCanvas() {
    var L = st.level;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cssW;
    if (document.fullscreenElement) {
      var maxW = window.innerWidth - 20;
      var maxH = window.innerHeight - 20;
      var aspect = L.width / L.height;
      cssW = maxW / maxH > aspect ? maxH * aspect : maxW;
    } else {
      cssW = canvas.clientWidth || 440;
    }
    var cssH = cssW * (L.height / L.width);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    woodPattern = null;
  }

  function makeWoodPattern() {
    var off = document.createElement("canvas");
    off.width = 160;
    off.height = 160;
    var c = off.getContext("2d");
    var g = c.createLinearGradient(0, 0, 160, 160);
    g.addColorStop(0, "#e8d5b0");
    g.addColorStop(0.5, "#dfc79a");
    g.addColorStop(1, "#d4b888");
    c.fillStyle = g;
    c.fillRect(0, 0, 160, 160);
    for (var i = 0; i < 48; i++) {
      c.strokeStyle = "rgba(120, 78, 36," + (0.035 + Math.random() * 0.06) + ")";
      c.lineWidth = 0.8 + Math.random() * 1.8;
      var y = Math.random() * 160;
      c.beginPath();
      c.moveTo(0, y);
      c.bezierCurveTo(40, y + (Math.random() - 0.5) * 8, 110, y + (Math.random() - 0.5) * 8, 160, y);
      c.stroke();
    }
    return ctx.createPattern(off, "repeat");
  }

  function drawRoundRect(x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // Piirrä polku pehmeästi (quadratic keskipisteiden kautta) indeksiin asti.
  function strokeSmooth(pts, upto) {
    if (upto < 1) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    if (upto === 1) {
      ctx.lineTo(pts[1][0], pts[1][1]);
      ctx.stroke();
      return;
    }
    for (var i = 1; i < upto; i++) {
      var mx = (pts[i][0] + pts[i + 1][0]) / 2;
      var my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    ctx.lineTo(pts[upto][0], pts[upto][1]);
    ctx.stroke();
  }

  function draw() {
    var v = E.getView(st);
    var cssW = parseFloat(canvas.style.width) || canvas.clientWidth || 440;
    var scale = cssW / v.width;
    ctx.save();
    ctx.scale(scale, scale);

    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake * 3, (Math.random() - 0.5) * shake * 3);
    }

    if (!woodPattern) woodPattern = makeWoodPattern();
    ctx.fillStyle = woodPattern || "#dfc79a";
    ctx.fillRect(0, 0, v.width, v.height);

    var vig = ctx.createRadialGradient(
      v.width * 0.5, v.height * 0.45, v.width * 0.2,
      v.width * 0.5, v.height * 0.5, v.width * 0.72
    );
    vig.addColorStop(0, "rgba(255,245,220,0.12)");
    vig.addColorStop(1, "rgba(60,35,15,0.14)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, v.width, v.height);

    // Reitti — pehmeä käsinpiirretyn tuntuinen viiva + kultainen edistyminen
    if (v.path && v.path.length > 1) {
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = "rgba(25, 14, 8, 0.85)";
      ctx.lineWidth = 2.5;
      strokeSmooth(v.path, v.path.length - 1);
    }

    // START / FINISH
    ctx.beginPath();
    ctx.arc(v.start.x, v.start.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(v.finish.x, v.finish.y, v.finish.r, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(46, 120, 70, 0.18)";
    ctx.fill();
    ctx.strokeStyle = "rgba(46, 100, 55, 0.55)";
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = "#1c140c";
    ctx.font = "700 11px 'Fraunces', Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("START", v.start.x, v.start.y - 18);
    ctx.fillText("FINISH", v.finish.x, v.finish.y - v.finish.r - 10);

    // Tarkistuspisteet — pienet liput
    for (var c = 0; c < v.checkpoints.length; c++) {
      var cp = v.checkpoints[c];
      var reached = v.checkpointIndex > c;
      ctx.beginPath();
      ctx.arc(cp.x, cp.y, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = reached ? "rgba(70, 150, 90, 0.9)" : "rgba(120, 90, 45, 0.5)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Reiät — tummat kolot + numerot (kuten aidossa laudassa)
    for (var i = 0; i < v.holes.length; i++) {
      var h = v.holes[i];
      var passed = v.bestHole >= h.n;
      // reunavalo (kaiverruksen tuntu)
      ctx.beginPath();
      ctx.arc(h.x, h.y, v.holeR + 1.1, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,248,230,0.35)";
      ctx.fill();
      var hg = ctx.createRadialGradient(h.x - 2.5, h.y - 2.8, 1, h.x, h.y, v.holeR);
      hg.addColorStop(0, passed ? "#4a3320" : "#33210f");
      hg.addColorStop(0.55, "#140b05");
      hg.addColorStop(1, "#020100");
      ctx.beginPath();
      ctx.arc(h.x, h.y, v.holeR, 0, Math.PI * 2);
      ctx.fillStyle = hg;
      ctx.fill();
      ctx.strokeStyle = "rgba(30, 18, 8, 0.55)";
      ctx.lineWidth = 0.9;
      ctx.stroke();
      // numero reiän vieressä
      ctx.fillStyle = passed ? "rgba(150, 100, 40, 0.9)" : "rgba(40, 26, 14, 0.85)";
      ctx.font = "700 8px 'Fraunces', Georgia, serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(String(h.n), h.x + v.holeR + 1.5, h.y + 0.5);
    }

    // Seinät — kohotetut puutapit varjoineen (kuten aidossa laudassa)
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (var w = 0; w < v.walls.length; w++) {
      var wall = v.walls[w];
      var rad = Math.min(wall.w, wall.h) * 0.45;
      // varjo alle-oikealle
      ctx.save();
      ctx.shadowColor = "rgba(40, 24, 8, 0.4)";
      ctx.shadowBlur = 3.5;
      ctx.shadowOffsetX = 1.4;
      ctx.shadowOffsetY = 2.2;
      drawRoundRect(wall.x, wall.y, wall.w, wall.h, rad);
      var wg = ctx.createLinearGradient(wall.x, wall.y, wall.x + wall.w * 0.25, wall.y + wall.h);
      wg.addColorStop(0, "#efdcb6");
      wg.addColorStop(0.5, "#d3ab74");
      wg.addColorStop(1, "#b0834e");
      ctx.fillStyle = wg;
      ctx.fill();
      ctx.restore();
      // yläreunan valo
      drawRoundRect(wall.x + 0.8, wall.y + 0.8, Math.max(0, wall.w - 1.6), Math.max(0, wall.h - 1.6), Math.max(0, rad - 0.8));
      ctx.strokeStyle = "rgba(255, 246, 224, 0.45)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // alareunan tummennus
      ctx.strokeStyle = "rgba(90, 54, 22, 0.35)";
      ctx.lineWidth = 0.7;
      ctx.stroke();
    }

    // Pallon jälki
    for (var t = 0; t < trail.length; t++) {
      var tr = trail[t];
      ctx.beginPath();
      ctx.arc(tr.x, tr.y, v.ballR * (0.2 + 0.35 * (t / trail.length)), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(200, 210, 220," + (0.04 + 0.1 * (t / trail.length)) + ")";
      ctx.fill();
    }

    // Pallo
    if (v.status !== "fallen" || fallDelay > 0.3) {
      var br = v.status === "fallen"
        ? v.ballR * Math.max(0.12, fallDelay / 0.55)
        : v.ballR;
      var bx = v.x;
      var by = v.y;
      ctx.beginPath();
      ctx.arc(bx + 1.4, by + 2, br, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fill();
      var bg = ctx.createRadialGradient(bx - br * 0.38, by - br * 0.42, br * 0.08, bx, by, br);
      bg.addColorStop(0, "#ffffff");
      bg.addColorStop(0.35, "#d5dde4");
      bg.addColorStop(1, "#7e8792");
      ctx.beginPath();
      ctx.arc(bx, by, br, 0, Math.PI * 2);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx - br * 0.28, by - br * 0.32, br * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fill();
    }

    ctx.restore();

    var rx = (-v.gy * 8).toFixed(2);
    var ry = (v.gx * 8).toFixed(2);
    tiltEl.style.transform = "rotateX(" + rx + "deg) rotateY(" + ry + "deg)";

    if (tiltDot) {
      tiltDot.style.transform =
        "translate(calc(-50% + " + (v.gx * 18).toFixed(1) + "px), calc(-50% + " +
        (v.gy * 18).toFixed(1) + "px))";
    }
  }

  function formatTime(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function updateHud() {
    var v = E.getView(st);
    if (levelEl) levelEl.textContent = String(v.levelNum);
    attemptsEl.textContent = String(v.attempts);
    timeEl.textContent = formatTime(v.timeMs);
    if (progressEl) progressEl.textContent = Math.round(v.pathProgress * 100) + "%";
    if (btnFs) {
      btnFs.textContent = document.fullscreenElement ? "Poistu koko ruudusta" : "Koko ruutu";
    }
    if (btnFsCorner) {
      btnFsCorner.textContent = document.fullscreenElement ? "✕" : "⛶";
      btnFsCorner.title = document.fullscreenElement ? "Poistu koko ruudusta (F)" : "Koko ruutu (F)";
    }

    if (!running) {
      phaseEl.textContent = "Valmis lähtöön";
      messageEl.textContent = "Vie kuula mustaa viivaa pitkin maaliin. Vältä reikiä.";
      return;
    }
    if (v.status === "won") {
      phaseEl.textContent = "Taso " + v.levelNum + " selvitetty!";
      messageEl.textContent = "Hyvä! Jatka seuraavaan tasoon.";
    } else if (v.status === "fallen") {
      phaseEl.textContent = v.message || "Reikä";
      messageEl.textContent = v.checkpointIndex > 0
        ? "Tipahdit — takaisin tarkistuspisteeseen."
        : "Tipahdit — uusi yritys alusta.";
    } else {
      var dl = E.DIFFICULTY[v.difficulty] ? E.DIFFICULTY[v.difficulty].label : "";
      phaseEl.textContent = "Taso " + v.levelNum + (dl ? " · " + dl : "");
      messageEl.textContent = inputMode === "orient"
        ? "Kallista puhelinta varovasti."
        : "Nuolet / WASD kallistaa lautaa.";
    }
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 1500);
  }

  function showOverlay(title, text, btnLabel, action) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    overlayBtn.textContent = btnLabel || "Jatka";
    overlayAction = action || begin;
    overlay.classList.add("show");
  }

  function hideOverlay() {
    overlay.classList.remove("show");
  }

  function onFallen() {
    fallDelay = 0.55;
    shake = 1;
    soundFall();
    showToast(st.message || "Reikä!");
    setTimeout(function () {
      E.newAttempt(st);
      fallDelay = 0;
      trail = [];
      updateHud();
    }, 720);
  }

  function onWon() {
    running = false;
    soundWin();
    var v = E.getView(st);
    showOverlay(
      "Taso " + v.levelNum + " selvitetty!",
      "Aika " + formatTime(v.timeMs) + " · yrityksiä " + v.attempts +
        ". Reiät kovenevat — jatketaanko?",
      "Seuraava taso →",
      nextLevel
    );
    updateHud();
  }

  function tick(ts) {
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.033, (ts - lastTs) / 1000);
    lastTs = ts;

    if (shake > 0) shake = Math.max(0, shake - dt * 4);

    if (running && st.status === "playing") {
      if (inputMode === "keys") E.updateKeyTilt(st, keys, dt);
      E.step(st, dt);
      if (st.lastHit) {
        shake = Math.min(1, shake + 0.35);
        soundWall();
      }
      if (st.justCheckpoint) {
        soundCheckpoint();
        showToast("Tarkistuspiste " + st.checkpointIndex);
      }
      trail.push({ x: st.x, y: st.y });
      if (trail.length > 12) trail.shift();
      if (st.status === "fallen") onFallen();
      else if (st.status === "won") onWon();
    } else if (st.status === "fallen" && fallDelay > 0) {
      fallDelay -= dt;
    }

    draw();
    updateHud();
    requestAnimationFrame(tick);
  }

  function requestOrientPermission() {
    return new Promise(function (resolve) {
      var DO = window.DeviceOrientationEvent;
      if (DO && typeof DO.requestPermission === "function") {
        DO.requestPermission()
          .then(function (s) { resolve(s === "granted"); })
          .catch(function () { resolve(false); });
      } else resolve(!!DO);
    });
  }

  function enableOrientation() {
    inputMode = "orient";
    if (orientBound) return;
    orientBound = true;
    window.addEventListener("deviceorientation", function (e) {
      if (!running || inputMode !== "orient") return;
      var t = E.tiltFromOrientation(e.beta, e.gamma);
      E.setTilt(st, t.gx, t.gy);
    });
  }

  function startGame(useOrient) {
    hideOverlay();
    ensureAudio();
    st = E.createState(1, difficulty);
    st.attempts = 1;
    running = true;
    lastTs = 0;
    trail = [];
    if (useOrient) enableOrientation();
    else inputMode = "keys";
    fitCanvas();
    updateHud();
    showToast(useOrient ? "Kallista puhelinta" : "Nuolinäppäimet");
  }

  function updateDiffButtons() {
    for (var key in diffBtns) {
      if (!diffBtns[key]) continue;
      var active = key === difficulty;
      diffBtns[key].classList.toggle("active", active);
      diffBtns[key].setAttribute("aria-pressed", String(active));
    }
  }

  function setDifficulty(key) {
    if (!E.DIFFICULTY[key]) return;
    difficulty = key;
    try { window.localStorage.setItem("labyrintti.difficulty", key); } catch (e) { /* ohita */ }
    updateDiffButtons();
    var label = E.DIFFICULTY[key].label;
    if (running) {
      startGame(inputMode === "orient");
      showToast(label);
    } else {
      st = E.createState(1, difficulty);
      draw();
      updateHud();
      showToast("Vaikeustaso: " + label);
    }
  }

  function nextLevel() {
    hideOverlay();
    E.advanceLevel(st);
    running = true;
    lastTs = 0;
    trail = [];
    fitCanvas();
    updateHud();
    showToast("Taso " + st.levelNum);
  }

  function begin() {
    var wants = "ontouchstart" in window && !!window.DeviceOrientationEvent;
    if (wants) {
      requestOrientPermission().then(function (ok) {
        startGame(!!ok);
        if (!ok) showToast("Ei kallistusta — käytä nuolia");
      });
    } else startGame(false);
  }

  function toggleFullscreen() {
    var el = shell || document.documentElement;
    if (!document.fullscreenElement) {
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) {
        Promise.resolve(req.call(el)).then(function () {
          document.body.classList.add("is-fullscreen");
          fitCanvas();
          draw();
        }).catch(function () { showToast("Koko ruutu ei onnistunut"); });
      }
    } else {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    }
  }

  window.addEventListener("fullscreenchange", function () {
    document.body.classList.toggle("is-fullscreen", !!document.fullscreenElement);
    fitCanvas();
    draw();
    updateHud();
  });

  window.addEventListener("keydown", function (e) {
    if (e.key === "ArrowUp" || e.key === "ArrowDown" ||
        e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault();
    }
    if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey) toggleFullscreen();
    keys[e.key] = true;
    if (running) inputMode = "keys";
  });
  window.addEventListener("keyup", function (e) { keys[e.key] = false; });

  btnStart.addEventListener("click", begin);
  overlayBtn.addEventListener("click", function () { overlayAction(); });
  btnRetry.addEventListener("click", function () {
    if (!running && st.status !== "won") { begin(); return; }
    E.newAttempt(st);
    trail = [];
    showToast("Uusi yritys");
  });
  btnNew.addEventListener("click", begin);
  if (btnFs) btnFs.addEventListener("click", toggleFullscreen);
  if (btnFsCorner) btnFsCorner.addEventListener("click", toggleFullscreen);
  if (btnSound) {
    btnSound.addEventListener("click", function () {
      soundOn = !soundOn;
      btnSound.textContent = soundOn ? "Ääni: päällä" : "Ääni: pois";
      btnSound.setAttribute("aria-pressed", String(soundOn));
      if (soundOn) soundCheckpoint();
    });
  }
  Object.keys(diffBtns).forEach(function (key) {
    if (diffBtns[key]) diffBtns[key].addEventListener("click", function () { setDifficulty(key); });
  });
  window.addEventListener("resize", function () { fitCanvas(); draw(); });

  window.LabyrinttiUI = {
    getState: function () { return E.getView(st); },
    start: begin,
    nextLevel: nextLevel,
    setDifficulty: setDifficulty,
    getDifficulty: function () { return difficulty; },
    setTilt: function (gx, gy) { inputMode = "keys"; E.setTilt(st, gx, gy); },
    pressKey: function (key, down) { keys[key] = !!down; inputMode = "keys"; },
    stepOnce: function (dt) {
      if (inputMode === "keys") E.updateKeyTilt(st, keys, dt || 1 / 60);
      E.step(st, dt || 1 / 60);
      draw();
      updateHud();
      return E.getView(st);
    },
    isRunning: function () { return running; },
    toggleFullscreen: toggleFullscreen
  };

  updateDiffButtons();
  fitCanvas();
  draw();
  updateHud();
  showOverlay(
    "Labyrintti",
    "Kallista lautaa ja vie kuula START → FINISH. Seuraa mustaa viivaa, vältä reiät. " +
      "Valitse vaikeustaso oikealta. Taso vaihtuu vaikeammaksi joka kierroksella. F = koko ruutu.",
    "Aloita",
    begin
  );
  requestAnimationFrame(tick);
})();
