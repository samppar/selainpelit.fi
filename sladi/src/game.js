/* Sladi — käyttöliittymä ja renderöinti. Ydin: SladiEngine (src/engine.js). */
(function () {
  "use strict";

  var E = window.SladiEngine;
  var DT = E.DT;

  var canvas = document.getElementById("board");
  var ctx = canvas.getContext("2d");
  var CAR_SCALE = 1.45; // autojen piirtokoko suhteessa fysiikkaan
  var view = null;      // aktiivisen radan näkymärajat (track.bounds)

  var PLAYER_COLORS = ["#e6453c", "#3b82d9"];
  var BOT_POOL = [
    { name: "Keke", color: "#f2b63c" },
    { name: "Ilona", color: "#4cae5a" },
    { name: "Ukko", color: "#9a6ae0" },
    { name: "Mira", color: "#e07b39" }
  ];

  // ------------------------------------------------------------- tila

  var state = null;          // moottorin kilpailutila
  var raceOpts = null;       // viimeisimmät asetukset uusintaa varten
  var selectedTrack = "rengasrata";
  var particles = [];
  var carTrails = [];        // edelliset sijainnit sladijälkiä varten
  var acc = 0, lastT = null;
  var msgTimer = 0;
  var resultsShown = false;
  var finishDelay = 0;

  var staticLayer = document.createElement("canvas");
  var skidLayer = document.createElement("canvas");

  /** Mitoittaa piirtopinnat radan äärimittoihin — turha reunanurmi jää pois
   *  ja autot näkyvät isompina. Kaikki piirto tapahtuu maailmankoordinaateissa. */
  function setupView(track) {
    view = track.bounds;
    var w = Math.round(view.w), h = Math.round(view.h);
    [canvas, staticLayer, skidLayer].forEach(function (cv) {
      if (cv.width !== w) cv.width = w;
      if (cv.height !== h) cv.height = h;
    });
    staticLayer.getContext("2d").setTransform(1, 0, 0, 1, -view.minX, -view.minY);
    skidLayer.getContext("2d").setTransform(1, 0, 0, 1, -view.minX, -view.minY);
  }

  // ------------------------------------------------------------- DOM

  var el = {
    overlay: document.getElementById("overlay"),
    menuCard: document.getElementById("menuCard"),
    resultCard: document.getElementById("resultCard"),
    resultRows: document.getElementById("resultRows"),
    resultTitle: document.getElementById("resultTitle"),
    trackPicker: document.getElementById("trackPicker"),
    countWrap: document.getElementById("countWrap"),
    phase: document.getElementById("phase"),
    message: document.getElementById("message"),
    standings: document.getElementById("standings"),
    lapNow: document.getElementById("lapNow"),
    lapBest: document.getElementById("lapBest"),
    lapLast: document.getElementById("lapLast"),
    speedNow: document.getElementById("speedNow"),
    btnFs: document.getElementById("btnFsCorner"),
    btnSnd: document.getElementById("btnSnd"),
    frame: document.getElementById("boardFrame")
  };

  // ------------------------------------------------------------- ääni

  var audioCtx = null;
  var soundOn = true;
  try { soundOn = localStorage.getItem("sladi-sound") !== "off"; } catch (e) {}

  function beep(freq, dur, type, vol, when) {
    if (!soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      var t0 = audioCtx.currentTime + (when || 0);
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type || "square";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) {}
  }
  function sndCount() { beep(660, 0.12, "square", 0.045); }
  function sndGo() { beep(990, 0.35, "square", 0.06); beep(1320, 0.3, "square", 0.04, 0.05); }
  function sndLap(best) { beep(880, 0.1, "triangle", 0.05); if (best) beep(1175, 0.16, "triangle", 0.05, 0.09); }
  function sndHit() { beep(140, 0.12, "sawtooth", 0.055); }
  function sndBoost() { beep(520, 0.2, "sawtooth", 0.035); beep(780, 0.18, "sawtooth", 0.03, 0.06); }
  function sndFinish() { [660, 880, 990, 1320].forEach(function (f, i) { beep(f, 0.18, "triangle", 0.05, i * 0.11); }); }

  function updateSndBtn() {
    el.btnSnd.textContent = soundOn ? "♪" : "∅";
    el.btnSnd.classList.toggle("off", !soundOn);
    el.btnSnd.setAttribute("aria-label", soundOn ? "Äänet päällä" : "Äänet pois");
  }
  el.btnSnd.addEventListener("click", function () {
    soundOn = !soundOn;
    try { localStorage.setItem("sladi-sound", soundOn ? "on" : "off"); } catch (e) {}
    updateSndBtn();
  });
  updateSndBtn();

  // ------------------------------------------------------------- syötteet

  var keys = {};
  var touch = { left: false, right: false, gas: false, brake: false };

  window.addEventListener("keydown", function (e) {
    if (e.code === "KeyF" && !e.repeat) { toggleFs(); return; }
    if (e.code === "KeyM" && !e.repeat) { el.btnSnd.click(); return; }
    keys[e.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(e.code) >= 0) e.preventDefault();
  });
  window.addEventListener("keyup", function (e) { keys[e.code] = false; });
  window.addEventListener("blur", function () { keys = {}; });

  function bindTouch(id, prop) {
    var b = document.getElementById(id);
    if (!b) return;
    function on(e) { e.preventDefault(); touch[prop] = true; }
    function off(e) { e.preventDefault(); touch[prop] = false; }
    b.addEventListener("pointerdown", on);
    b.addEventListener("pointerup", off);
    b.addEventListener("pointercancel", off);
    b.addEventListener("pointerleave", off);
  }
  bindTouch("tLeft", "left");
  bindTouch("tRight", "right");
  bindTouch("tGas", "gas");
  bindTouch("tBrake", "brake");

  function humanInput(slot) {
    var twoP = raceOpts && raceOpts.players === 2;
    if (slot === 0) {
      return {
        up: !!keys.ArrowUp || (!twoP && !!keys.KeyW) || touch.gas,
        down: !!keys.ArrowDown || (!twoP && !!keys.KeyS) || touch.brake,
        left: !!keys.ArrowLeft || (!twoP && !!keys.KeyA) || touch.left,
        right: !!keys.ArrowRight || (!twoP && !!keys.KeyD) || touch.right
      };
    }
    return { up: !!keys.KeyW, down: !!keys.KeyS, left: !!keys.KeyA, right: !!keys.KeyD };
  }

  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.frame.requestFullscreen) el.frame.requestFullscreen();
  }
  el.btnFs.addEventListener("click", toggleFs);

  // ------------------------------------------------------------- valikko

  function buildTrackPicker() {
    el.trackPicker.innerHTML = "";
    E.TRACKS.forEach(function (def) {
      var t = E.getTrack(def.id);
      var b = document.createElement("button");
      b.type = "button";
      b.className = "track-pick" + (def.id === selectedTrack ? " sel" : "");
      var cv = document.createElement("canvas");
      cv.width = 150; cv.height = 94;
      drawPreview(cv, t);
      var nm = document.createElement("b"); nm.textContent = def.name;
      var bl = document.createElement("small"); bl.textContent = def.blurb;
      b.appendChild(cv); b.appendChild(nm); b.appendChild(bl);
      b.addEventListener("click", function () {
        selectedTrack = def.id;
        buildTrackPicker();
        renderIdle();
      });
      el.trackPicker.appendChild(b);
    });
  }

  function drawPreview(cv, track) {
    var c = cv.getContext("2d");
    var v = track.bounds, pad = 10;
    var sx = (cv.width - pad * 2) / v.w, sy = (cv.height - pad * 2) / v.h;
    var s = Math.min(sx, sy);
    var ox = (cv.width - v.w * s) / 2 - v.minX * s;
    var oy = (cv.height - v.h * s) / 2 - v.minY * s;
    c.clearRect(0, 0, cv.width, cv.height);
    c.beginPath();
    track.samples.forEach(function (p, i) {
      if (i === 0) c.moveTo(ox + p.x * s, oy + p.y * s);
      else c.lineTo(ox + p.x * s, oy + p.y * s);
    });
    c.closePath();
    c.lineJoin = "round"; c.lineCap = "round";
    c.strokeStyle = "rgba(236,242,248,0.9)";
    c.lineWidth = Math.max(3, track.width * s * 1.1);
    c.stroke();
    c.strokeStyle = "#2f6d38";
    c.lineWidth = Math.max(1.6, track.width * s * 0.55);
    c.stroke();
    var st = track.samples[0];
    c.fillStyle = "#f2b63c";
    c.beginPath(); c.arc(ox + st.x * s, oy + st.y * s, 3, 0, Math.PI * 2); c.fill();
  }

  document.querySelectorAll("[data-mode]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var mode = btn.getAttribute("data-mode");
      var skill = btn.getAttribute("data-skill") || "kova";
      startRace({
        trackId: selectedTrack,
        players: mode === "2p" ? 2 : 1,
        botSkill: skill
      });
    });
  });

  document.getElementById("btnAgain").addEventListener("click", function () {
    if (raceOpts) startRace(raceOpts);
  });
  document.getElementById("btnMenu").addEventListener("click", showMenu);

  function showMenu() {
    state = null;
    resultsShown = false;
    el.menuCard.style.display = "";
    el.resultCard.style.display = "none";
    el.overlay.classList.add("show");
    el.phase.textContent = "Valitse rata ja pelimuoto";
    el.message.textContent = "Kaasuta täysillä suorilla ja anna perän sladata mutkissa — koko rata näkyy kerralla.";
    buildTrackPicker();
    renderIdle();
  }

  // ------------------------------------------------------------- kilpailun aloitus

  function startRace(opts) {
    raceOpts = opts;
    var lineup = [];
    lineup.push({ kind: "human", name: opts.players === 2 ? "Pelaaja 1" : "Sinä", color: PLAYER_COLORS[0] });
    if (opts.players === 2) lineup.push({ kind: "human", name: "Pelaaja 2", color: PLAYER_COLORS[1] });
    var botCount = opts.players === 2 ? 2 : 3;
    for (var i = 0; i < botCount; i++) {
      var b = BOT_POOL[i];
      lineup.push({ kind: "ai", name: b.name, color: b.color, skill: opts.botSkill });
    }
    state = E.createRace({ trackId: opts.trackId, lineup: lineup, laps: undefined });
    particles = [];
    carTrails = state.cars.map(function (c) { return { x: c.x, y: c.y }; });
    resultsShown = false;
    finishDelay = 0;
    lastCount = null;
    setupView(state.track);
    skidLayer.getContext("2d").clearRect(view.minX, view.minY, view.w, view.h);
    drawStatic(state.track);
    buildStandings();
    el.overlay.classList.remove("show");
    el.phase.textContent = state.track.name + " · " + state.laps + " kierrosta";
    el.message.textContent = "Lähtölaskenta käy — kaasu pohjaan kun valot sammuvat!";
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }

  // ------------------------------------------------------------- staattinen rata

  function drawStatic(track) {
    var c = staticLayer.getContext("2d");
    var v = track.bounds;
    var i;

    // nurmi raidoilla
    c.fillStyle = "#47903f";
    c.fillRect(v.minX, v.minY, v.w, v.h);
    c.save();
    c.translate(v.minX + v.w / 2, v.minY + v.h / 2);
    c.rotate(-0.32);
    c.fillStyle = "rgba(255,255,240,0.045)";
    var stripeN = Math.ceil((v.w + v.h) / 180) + 2;
    for (i = -stripeN; i < stripeN; i += 2) c.fillRect(i * 90, -v.h * 1.5, 90, v.h * 3);
    c.restore();

    // kukkia ja pientä tekstuuria (deterministinen sironta)
    for (i = 0; i < 260; i++) {
      var fx = (Math.sin(i * 12.9898) * 43758.5453) % 1; if (fx < 0) fx += 1;
      var fy = (Math.sin(i * 78.233) * 12543.2371) % 1; if (fy < 0) fy += 1;
      var px = v.minX + fx * v.w, py = v.minY + fy * v.h;
      if (E.nearestSample(track, px, py).dist < track.width * 0.5 + 26) continue;
      if (i % 9 === 0) {
        c.fillStyle = i % 18 === 0 ? "rgba(255,235,150,0.5)" : "rgba(255,255,255,0.42)";
        c.beginPath(); c.arc(px, py, 2.1, 0, Math.PI * 2); c.fill();
      } else {
        c.fillStyle = i % 2 ? "rgba(30,70,28,0.20)" : "rgba(180,230,150,0.13)";
        c.beginPath(); c.arc(px, py, 3 + (i % 4), 0, Math.PI * 2); c.fill();
      }
    }

    // pensaat radan ulkopuolella
    var S = track.samples, N = S.length;
    for (i = 0; i < N; i += 47) {
      var p = S[i];
      var side = (i % 94 === 0) ? 1 : -1;
      var nx = -Math.sin(p.dir) * side, ny = Math.cos(p.dir) * side;
      var bx = p.x + nx * (track.width * 0.5 + 55 + (i % 5) * 14);
      var by = p.y + ny * (track.width * 0.5 + 55 + (i % 7) * 11);
      if (bx < v.minX + 30 || bx > v.maxX - 30 || by < v.minY + 30 || by > v.maxY - 30) continue;
      if (E.nearestSample(track, bx, by).dist < track.width * 0.5 + 34) continue;
      var r = 13 + (i % 3) * 4;
      c.fillStyle = "rgba(20,50,22,0.5)";
      c.beginPath(); c.arc(bx + 3, by + 4, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = i % 3 ? "#2f6d31" : "#387d38";
      c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = "rgba(255,255,255,0.10)";
      c.beginPath(); c.arc(bx - r * 0.3, by - r * 0.35, r * 0.55, 0, Math.PI * 2); c.fill();
    }

    // ratapolku
    function tracePath() {
      c.beginPath();
      for (var j = 0; j < N; j++) {
        if (j === 0) c.moveTo(S[j].x, S[j].y);
        else c.lineTo(S[j].x, S[j].y);
      }
      c.closePath();
    }
    c.lineJoin = "round"; c.lineCap = "round";

    // reunakivet: valkoinen pohja + punaiset katkot
    tracePath();
    c.strokeStyle = "#e8e4da";
    c.lineWidth = track.width + 13;
    c.stroke();
    c.setLineDash([15, 15]);
    tracePath();
    c.strokeStyle = "#c9453a";
    c.lineWidth = track.width + 13;
    c.stroke();
    c.setLineDash([]);

    // asfaltti
    tracePath();
    c.strokeStyle = "#43474f";
    c.lineWidth = track.width;
    c.stroke();
    // ajolinjan kuluma
    tracePath();
    c.strokeStyle = "rgba(255,255,255,0.05)";
    c.lineWidth = track.width * 0.45;
    c.stroke();

    // turbonuolet
    track.boosts.forEach(function (b) {
      c.save();
      c.translate(b.x, b.y);
      c.rotate(b.a);
      c.fillStyle = "#ffd23e";
      for (var k = -1; k <= 1; k += 2) {
        c.beginPath();
        c.moveTo(k * 8 - 12, -13); c.lineTo(k * 8 + 2, 0); c.lineTo(k * 8 - 12, 13);
        c.lineTo(k * 8 - 5, 0);
        c.closePath(); c.fill();
      }
      c.restore();
    });

    // öljyläikät
    track.oils.forEach(function (o) {
      var g = c.createRadialGradient(o.x - 5, o.y - 5, 2, o.x, o.y, o.r);
      g.addColorStop(0, "rgba(70,70,90,0.95)");
      g.addColorStop(0.6, "rgba(25,25,38,0.92)");
      g.addColorStop(1, "rgba(15,15,25,0.0)");
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(o.x, o.y, o.r, o.r * 0.8, 0.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "rgba(160,190,255,0.18)";
      c.beginPath(); c.ellipse(o.x - o.r * 0.25, o.y - o.r * 0.2, o.r * 0.35, o.r * 0.18, 0.4, 0, Math.PI * 2); c.fill();
    });

    // lähtöviiva (shakkiruutu)
    var st = S[0];
    c.save();
    c.translate(st.x, st.y);
    c.rotate(st.dir);
    var half = track.width / 2;
    var sq = 7;
    for (var row = 0; row < 3; row++) {
      for (var kk = 0; kk < Math.ceil(track.width / sq); kk++) {
        c.fillStyle = (row + kk) % 2 ? "#14171c" : "#f4f2ec";
        c.fillRect(-10 + row * sq, -half + kk * sq, sq, Math.min(sq, half * 2 - kk * sq));
      }
    }
    c.restore();
  }

  // ------------------------------------------------------------- piirto

  function renderIdle() {
    var track = E.getTrack(selectedTrack);
    setupView(track);
    drawStatic(track);
    ctx.setTransform(1, 0, 0, 1, -view.minX, -view.minY);
    ctx.drawImage(staticLayer, view.minX, view.minY);
  }

  function drawCar(car, slot) {
    var isPlayer = car.kind === "human";
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.scale(CAR_SCALE, CAR_SCALE);

    // varjo
    ctx.save();
    ctx.rotate(car.angle);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(1.5, 3, 15, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.rotate(car.angle);

    // turboliekki
    if (car.boostT > 0.25) {
      ctx.fillStyle = "rgba(255,170,40,0.85)";
      ctx.beginPath();
      ctx.moveTo(-14, -4); ctx.lineTo(-26 - Math.sin(car.boostT * 60) * 4, 0); ctx.lineTo(-14, 4);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(255,240,140,0.9)";
      ctx.beginPath();
      ctx.moveTo(-14, -2); ctx.lineTo(-20, 0); ctx.lineTo(-14, 2);
      ctx.closePath(); ctx.fill();
    }

    // renkaat
    ctx.fillStyle = "#15181d";
    ctx.fillRect(-11, -9, 6, 4); ctx.fillRect(-11, 5, 6, 4);
    ctx.fillRect(5, -9, 6, 4); ctx.fillRect(5, 5, 6, 4);

    // kori
    ctx.fillStyle = car.color;
    roundRect(ctx, -13, -7, 26, 14, 4);
    ctx.fill();
    // keulan valo + takasiipi
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(10, -5, 2.5, 3); ctx.fillRect(10, 2, 2.5, 3);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(-13.5, -8, 3.5, 16);
    // ohjaamo
    ctx.fillStyle = "rgba(20,26,34,0.85)";
    roundRect(ctx, -4, -4.5, 9, 9, 2.5);
    ctx.fill();
    ctx.fillStyle = "rgba(160,210,255,0.35)";
    roundRect(ctx, 2, -3.5, 3, 7, 1.5);
    ctx.fill();

    if (isPlayer) {
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.6;
      roundRect(ctx, -13, -7, 26, 14, 4);
      ctx.stroke();
    }
    ctx.restore();

    // pelaajan tunnus auton yllä
    if (isPlayer && state.phase !== "finished") {
      ctx.save();
      ctx.font = "700 15px Fraunces, serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillText(slot === 0 ? "P1" : "P2", car.x + 1, car.y - 22);
      ctx.fillStyle = slot === 0 ? "#ffd88a" : "#a8d0ff";
      ctx.fillText(slot === 0 ? "P1" : "P2", car.x, car.y - 23);
      ctx.restore();
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function addSkids() {
    var c = skidLayer.getContext("2d");
    state.cars.forEach(function (car, i) {
      var prev = carTrails[i];
      var slipping = car.slip > 42 || (car.surf === "grass" && Math.hypot(car.vx, car.vy) > 60);
      // teleporttisuoja: älä piirrä jälkeä jos sijainti hyppäsi (esim. pikakelaus)
      if (Math.hypot(car.x - prev.x, car.y - prev.y) > 30) slipping = false;
      if (slipping) {
        c.strokeStyle = car.surf === "grass" ? "rgba(74,52,28,0.16)" : "rgba(20,22,26,0.13)";
        c.lineWidth = 5.5;
        c.lineCap = "round";
        var fx = Math.cos(car.angle), fy = Math.sin(car.angle);
        for (var s = -1; s <= 1; s += 2) {
          c.beginPath();
          c.moveTo(prev.x - fy * 7 * s - fx * 11, prev.y + fx * 7 * s - fy * 11);
          c.lineTo(car.x - fy * 7 * s - fx * 11, car.y + fx * 7 * s - fy * 11);
          c.stroke();
        }
      }
      prev.x = car.x; prev.y = car.y;
    });
  }

  function spawnDust() {
    state.cars.forEach(function (car) {
      var sp = Math.hypot(car.vx, car.vy);
      if (car.surf === "grass" && sp > 70 && particles.length < 240) {
        particles.push({
          x: car.x - Math.cos(car.angle) * 13, y: car.y - Math.sin(car.angle) * 13,
          vx: -car.vx * 0.1 + Math.sin(car.x * 7.7) * 14, vy: -car.vy * 0.1 + Math.cos(car.y * 9.1) * 14,
          life: 0.5, max: 0.5, size: 4.5, color: "150,190,120"
        });
      } else if (car.slip > 70 && particles.length < 240) {
        particles.push({
          x: car.x - Math.cos(car.angle) * 12, y: car.y - Math.sin(car.angle) * 12,
          vx: -car.vx * 0.06, vy: -car.vy * 0.06,
          life: 0.4, max: 0.4, size: 3.5, color: "200,200,205"
        });
      }
    });
  }

  function burst(x, y, n, color, speed) {
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      particles.push({
        x: x, y: y,
        vx: Math.cos(a) * speed * (0.5 + (i % 3) * 0.25),
        vy: Math.sin(a) * speed * (0.5 + (i % 3) * 0.25),
        life: 0.55, max: 0.55, size: 3.2, color: color
      });
    }
  }

  function stepParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy *= 0.94;
    }
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, -view.minX, -view.minY);
    ctx.drawImage(staticLayer, view.minX, view.minY);
    ctx.drawImage(skidLayer, view.minX, view.minY);

    particles.forEach(function (p) {
      ctx.fillStyle = "rgba(" + p.color + "," + (p.life / p.max * 0.55).toFixed(2) + ")";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + 0.7 * (1 - p.life / p.max)), 0, Math.PI * 2);
      ctx.fill();
    });

    // piirrä autot sijoitusjärjestyksessä (kärki päällimmäisenä)
    var order = state.cars.slice().sort(function (a, b) { return (b.place || 9) - (a.place || 9); });
    var slotOf = {};
    var hi = 0;
    state.cars.forEach(function (c) { if (c.kind === "human") slotOf[c.idx] = hi++; });
    order.forEach(function (car) { drawCar(car, slotOf[car.idx] || 0); });
  }

  // ------------------------------------------------------------- HUD

  var standingRows = [];
  function buildStandings() {
    el.standings.innerHTML = "";
    standingRows = state.cars.map(function (car) {
      var row = document.createElement("div");
      row.className = "standing" + (car.kind === "human" ? " me" : "");
      row.innerHTML = '<span class="pl"></span><span class="chip"></span>' +
        '<span class="nm"></span><span class="lap"></span>';
      row.querySelector(".chip").style.background = car.color;
      row.querySelector(".nm").textContent = car.name;
      el.standings.appendChild(row);
      return row;
    });
    updateStandings();
  }

  function updateStandings() {
    if (!state) return;
    var sorted = state.cars.slice().sort(function (a, b) { return (a.place || 9) - (b.place || 9); });
    sorted.forEach(function (car, vi) {
      var row = standingRows[car.idx];
      row.querySelector(".pl").textContent = (car.place || vi + 1) + ".";
      row.querySelector(".lap").textContent = car.finished
        ? "🏁 " + E.formatTime(car.finishTime)
        : (Math.min(car.lapsDone + 1, state.laps)) + "/" + state.laps;
      if (el.standings.children[vi] !== row) el.standings.insertBefore(row, el.standings.children[vi] || null);
    });

    var me = state.cars[0];
    el.lapNow.textContent = me.finished
      ? "Maalissa"
      : Math.min(me.lapsDone + 1, state.laps) + " / " + state.laps;
    el.lapLast.textContent = E.formatTime(me.lastLap);
    el.lapBest.textContent = E.formatTime(me.bestLap);
    el.speedNow.textContent = Math.round(Math.hypot(me.vx, me.vy) * 0.72) + " km/h";
  }

  function setMessage(text, sticky) {
    el.message.textContent = text;
    msgTimer = sticky ? 8 : 3.5;
  }

  var lastCount = null;
  function updateCountdown() {
    if (!state) { el.countWrap.innerHTML = ""; return; }
    if (state.phase === "countdown") {
      var n = Math.ceil(state.count);
      if (n !== lastCount) {
        lastCount = n;
        el.countWrap.innerHTML = "<span>" + n + "</span>";
        sndCount();
      }
    } else if (lastCount !== "go" && lastCount !== null) {
      lastCount = "go";
      el.countWrap.innerHTML = '<span class="go">AJA!</span>';
      setTimeout(function () { if (lastCount === "go") el.countWrap.innerHTML = ""; }, 900);
    }
  }

  // ------------------------------------------------------------- tapahtumat

  function handleEvents() {
    var evs = state.events;
    state.events = [];
    evs.forEach(function (ev) {
      var car = ev.car !== undefined ? state.cars[ev.car] : null;
      switch (ev.type) {
        case "go":
          sndGo();
          setMessage("Matkaan! " + state.laps + " kierrosta edessä.");
          break;
        case "lap":
          if (car.kind === "human") {
            sndLap(ev.best);
            setMessage((ev.best ? "Paras kierros! " : "Kierros valmis: ") + E.formatTime(ev.time) +
              " — " + (state.laps - ev.lap) + " jäljellä.");
          }
          break;
        case "finish":
          if (car.kind === "human") {
            sndFinish();
            setMessage(car.name + " maalissa — sija " + ev.place + "!", true);
          }
          burst(car.x, car.y, 14, "255,216,138", 120);
          break;
        case "hit":
          if (ev.force > 60) sndHit();
          burst(ev.x, ev.y, 6, "230,230,235", 90);
          break;
        case "boost":
          if (car.kind === "human") sndBoost();
          break;
        case "raceover":
          finishDelay = 1.4;
          break;
      }
    });
  }

  // ------------------------------------------------------------- tulokset

  function showResults() {
    resultsShown = true;
    var sorted = state.cars.slice().sort(function (a, b) { return (a.place || 9) - (b.place || 9); });
    el.resultRows.innerHTML = "";
    sorted.forEach(function (car) {
      var row = document.createElement("div");
      row.className = "row" + (car.kind === "human" ? " me" : "");
      var medal = car.place === 1 ? "🥇" : car.place === 2 ? "🥈" : car.place === 3 ? "🥉" : car.place + ".";
      row.innerHTML =
        '<span class="pl">' + medal + '</span>' +
        '<span class="chip" style="background:' + car.color + '"></span>' +
        '<span class="nm">' + car.name + '</span>' +
        '<span class="tt">' + (car.finished ? E.formatTime(car.finishTime) : "kesken") + '</span>' +
        '<span class="bb">' + (car.bestLap !== null ? "paras <b>" + E.formatTime(car.bestLap) + "</b>" : "") + '</span>';
      el.resultRows.appendChild(row);
    });
    var me = state.cars[0];
    el.resultTitle.textContent =
      me.place === 1 ? "Voitto!" :
      me.place <= 3 ? "Palkintopallille!" : "Maali!";
    el.menuCard.style.display = "none";
    el.resultCard.style.display = "";
    el.overlay.classList.add("show");
    el.phase.textContent = "Kilpailu päättyi";
  }

  // ------------------------------------------------------------- pääsilmukka

  function buildInputs() {
    return state.cars.map(function (car, i) {
      if (car.kind === "ai") return E.aiInput(state, i);
      var slot = 0;
      for (var j = 0; j < i; j++) if (state.cars[j].kind === "human") slot++;
      return humanInput(slot);
    });
  }

  var hudAcc = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (lastT === null) lastT = t;
    var dt = Math.min((t - lastT) / 1000, 0.25);
    lastT = t;

    if (!state) return;

    acc += dt;
    while (acc >= DT) {
      acc -= DT;
      E.step(state, buildInputs());
      handleEvents();
      addSkids();
    }
    spawnDust();
    stepParticles(dt);
    updateCountdown();
    render();

    hudAcc += dt;
    if (hudAcc > 0.15) { hudAcc = 0; updateStandings(); }

    if (msgTimer > 0) {
      msgTimer -= dt;
      if (msgTimer <= 0 && state.phase === "racing") {
        var me = state.cars[0];
        el.message.textContent = me.place === 1
          ? "Johdat kilpailua — pidä pää kylmänä."
          : "Olet sijalla " + me.place + ". Ota johtaja kiinni!";
      }
    }

    if (state.phase === "finished" && !resultsShown) {
      finishDelay -= dt;
      if (finishDelay <= 0) showResults();
    }
  }

  // ------------------------------------------------------------- smoke-API

  window.SladiUI = {
    startRace: startRace,
    showMenu: showMenu,
    getState: function () { return state; },
    selectTrack: function (id) { selectedTrack = id; buildTrackPicker(); },
    pressKey: function (code, down) { keys[code] = down; },
    fastForward: function (seconds) {
      if (!state) return;
      var steps = Math.round(seconds / DT);
      for (var s = 0; s < steps; s++) {
        E.step(state, buildInputs());
        handleEvents();
      }
      state.cars.forEach(function (c, i) { carTrails[i].x = c.x; carTrails[i].y = c.y; });
      updateStandings();
      render();
      if (state.phase === "finished" && !resultsShown) showResults();
    }
  };

  // käynnistys
  showMenu();
  requestAnimationFrame(frame);
})();
