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
  var selectedVehicle = "sportti";
  try {
    var savedVeh = localStorage.getItem("sladi-veh");
    if (E.VEHICLES[savedVeh]) selectedVehicle = savedVeh;
  } catch (e) {}
  var BOT_VEHICLES = ["ralli", "formula", "paku", "sportti"];
  var particles = [];
  var carTrails = [];        // edelliset sijainnit sladijälkiä varten
  var acc = 0, lastT = null;
  var msgTimer = 0;
  var resultsShown = false;
  var finishDelay = 0;

  var staticLayer = document.createElement("canvas");
  var skidLayer = document.createElement("canvas");
  var deckLayer = document.createElement("canvas"); // siltakansi autojen yläpuolelle

  /** Mitoittaa piirtopinnat radan äärimittoihin — turha reunanurmi jää pois
   *  ja autot näkyvät isompina. Kaikki piirto tapahtuu maailmankoordinaateissa. */
  function setupView(track) {
    view = track.bounds;
    var w = Math.round(view.w), h = Math.round(view.h);
    [canvas, staticLayer, skidLayer, deckLayer].forEach(function (cv) {
      if (cv.width !== w) cv.width = w;
      if (cv.height !== h) cv.height = h;
    });
    staticLayer.getContext("2d").setTransform(1, 0, 0, 1, -view.minX, -view.minY);
    skidLayer.getContext("2d").setTransform(1, 0, 0, 1, -view.minX, -view.minY);
    deckLayer.getContext("2d").setTransform(1, 0, 0, 1, -view.minX, -view.minY);
  }

  var THEMES = {
    grass: {
      base: "#47903f", stripe: "rgba(255,255,240,0.045)",
      dotDark: "rgba(30,70,28,0.20)", dotLight: "rgba(180,230,150,0.13)",
      speck1: "rgba(255,235,150,0.5)", speck2: "rgba(255,255,255,0.42)",
      asphalt: "#84888e", dust: "150,190,120"
    },
    sand: {
      base: "#c49a58", stripe: "rgba(120,80,30,0.07)",
      dotDark: "rgba(100,70,35,0.22)", dotLight: "rgba(255,244,215,0.16)",
      speck1: "rgba(250,248,240,0.55)", speck2: "rgba(140,110,70,0.5)",
      asphalt: "#7e8288", dust: "205,180,130"
    }
  };
  function themeOf(track) { return THEMES[track.def.theme] || THEMES.grass; }

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
    scorebar: document.getElementById("scorebar"),
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
        botSkill: skill,
        vehicle: selectedVehicle
      });
    });
  });

  function buildVehPicker() {
    var wrap = document.getElementById("vehPicker");
    wrap.innerHTML = "";
    Object.keys(E.VEHICLES).forEach(function (key) {
      var veh = E.VEHICLES[key];
      var b = document.createElement("button");
      b.type = "button";
      b.className = "veh-pick" + (key === selectedVehicle ? " sel" : "");
      var cv = document.createElement("canvas");
      cv.width = 84; cv.height = 40;
      var c = cv.getContext("2d");
      c.translate(cv.width / 2, cv.height / 2);
      c.scale(1.5, 1.5);
      drawCarBody(c, key, "#e6453c", false);
      var nm = document.createElement("b"); nm.textContent = veh.name;
      var ds = document.createElement("small"); ds.textContent = veh.desc;
      b.appendChild(cv); b.appendChild(nm); b.appendChild(ds);
      b.addEventListener("click", function () {
        selectedVehicle = key;
        try { localStorage.setItem("sladi-veh", key); } catch (e) {}
        buildVehPicker();
      });
      wrap.appendChild(b);
    });
  }

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
    el.phase.textContent = "Valitse rata, auto ja pelimuoto";
    el.message.textContent = "Kaasuta täysillä suorilla ja anna perän sladata mutkissa — koko rata näkyy kerralla.";
    buildTrackPicker();
    buildVehPicker();
    renderIdle();
  }

  // ------------------------------------------------------------- kilpailun aloitus

  function startRace(opts) {
    raceOpts = opts;
    var lineup = [];
    lineup.push({ kind: "human", name: opts.players === 2 ? "Pelaaja 1" : "Sinä", color: PLAYER_COLORS[0], vehicle: opts.vehicle });
    if (opts.players === 2) lineup.push({ kind: "human", name: "Pelaaja 2", color: PLAYER_COLORS[1], vehicle: opts.vehicle });
    var botCount = opts.players === 2 ? 2 : 3;
    for (var i = 0; i < botCount; i++) {
      var b = BOT_POOL[i];
      lineup.push({ kind: "ai", name: b.name, color: b.color, skill: opts.botSkill, vehicle: BOT_VEHICLES[i % BOT_VEHICLES.length] });
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
    var th = themeOf(track);
    var i;

    // maasto raidoilla (nurmi tai hiekka)
    c.fillStyle = th.base;
    c.fillRect(v.minX, v.minY, v.w, v.h);
    c.save();
    c.translate(v.minX + v.w / 2, v.minY + v.h / 2);
    c.rotate(-0.32);
    c.fillStyle = th.stripe;
    var stripeN = Math.ceil((v.w + v.h) / 180) + 2;
    for (i = -stripeN; i < stripeN; i += 2) c.fillRect(i * 90, -v.h * 1.5, 90, v.h * 3);
    c.restore();

    // kukkia/kiviä ja pientä tekstuuria (deterministinen sironta)
    for (i = 0; i < 260; i++) {
      var fx = (Math.sin(i * 12.9898) * 43758.5453) % 1; if (fx < 0) fx += 1;
      var fy = (Math.sin(i * 78.233) * 12543.2371) % 1; if (fy < 0) fy += 1;
      var px = v.minX + fx * v.w, py = v.minY + fy * v.h;
      if (E.nearestSample(track, px, py).dist < track.width * 0.5 + 26) continue;
      if (i % 9 === 0) {
        c.fillStyle = i % 18 === 0 ? th.speck1 : th.speck2;
        c.beginPath(); c.arc(px, py, 2.1, 0, Math.PI * 2); c.fill();
      } else {
        c.fillStyle = i % 2 ? th.dotDark : th.dotLight;
        c.beginPath(); c.arc(px, py, 3 + (i % 4), 0, Math.PI * 2); c.fill();
      }
    }

    // vesialtaat radan vierellä
    track.waters.forEach(function (w, wi) {
      c.fillStyle = "rgba(60,40,20,0.18)";
      c.beginPath(); c.ellipse(w.x + 4, w.y + 5, w.r * 1.02, w.r * 0.8, wi, 0, Math.PI * 2); c.fill();
      for (var bl = 0; bl < 5; bl++) {
        var ba = wi * 1.1 + bl * 1.256;
        var bd = bl === 0 ? 0 : w.r * 0.4;
        c.fillStyle = bl === 0 ? "#2f66b5" : "#3872c2";
        c.beginPath();
        c.ellipse(
          w.x + Math.cos(ba) * bd, w.y + Math.sin(ba) * bd * 0.75,
          w.r * (bl === 0 ? 0.85 : 0.45), w.r * (bl === 0 ? 0.66 : 0.34),
          ba, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = "rgba(190,220,255,0.5)";
      c.beginPath(); c.ellipse(w.x - w.r * 0.22, w.y - w.r * 0.18, w.r * 0.34, w.r * 0.12, 0.5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "rgba(255,255,255,0.35)";
      c.lineWidth = 1.6;
      c.beginPath(); c.ellipse(w.x + w.r * 0.15, w.y + w.r * 0.2, w.r * 0.4, w.r * 0.2, 0.3, 0.4, 2.6); c.stroke();
    });

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
      var nearWater = track.waters.some(function (w) {
        return Math.hypot(w.x - bx, w.y - by) < w.r + 30;
      });
      if (nearWater) continue;
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

    // reunakivet: leveä valkoinen pohja + punaiset katkot
    tracePath();
    c.strokeStyle = "#efece3";
    c.lineWidth = track.width + 24;
    c.stroke();
    c.setLineDash([28, 28]);
    tracePath();
    c.strokeStyle = "#cc4437";
    c.lineWidth = track.width + 24;
    c.stroke();
    c.setLineDash([]);

    // asfaltti — vaalea, retrohenkinen
    tracePath();
    c.strokeStyle = th.asphalt;
    c.lineWidth = track.width;
    c.stroke();
    // ajolinjan kuluma
    tracePath();
    c.strokeStyle = "rgba(255,255,255,0.07)";
    c.lineWidth = track.width * 0.5;
    c.stroke();
    // asfaltin täplätekstuuri (deterministinen)
    for (i = 0; i < N; i += 6) {
      var tp = S[i];
      var rx = Math.sin(i * 37.7) * track.width * 0.42;
      var ry = Math.sin(i * 53.3) * 0.9;
      var tnx = -Math.sin(tp.dir), tny = Math.cos(tp.dir);
      c.fillStyle = (i % 12) ? "rgba(60,63,70,0.16)" : "rgba(255,255,255,0.10)";
      c.beginPath();
      c.arc(tp.x + tnx * rx + ry, tp.y + tny * rx, 1.6 + (i % 3), 0, Math.PI * 2);
      c.fill();
    }

    // keltaiset suuntanuolet tiessä
    var arrowCount = 5;
    for (i = 0; i < arrowCount; i++) {
      var ap = S[Math.round((i + 0.55) * N / arrowCount) % N];
      c.save();
      c.translate(ap.x, ap.y);
      c.rotate(ap.dir);
      c.fillStyle = "rgba(247,224,76,0.75)";
      var aw = track.width * 0.13;
      c.beginPath();
      c.moveTo(-aw * 2.1, -aw * 0.55); c.lineTo(aw * 0.4, -aw * 0.55);
      c.lineTo(aw * 0.4, -aw * 1.15); c.lineTo(aw * 2.1, 0);
      c.lineTo(aw * 0.4, aw * 1.15); c.lineTo(aw * 0.4, aw * 0.55);
      c.lineTo(-aw * 2.1, aw * 0.55);
      c.closePath(); c.fill();
      c.restore();
    }

    // turbonuolet (skaalautuvat padin kokoon)
    track.boosts.forEach(function (b) {
      var bs = b.r / 34;
      c.save();
      c.translate(b.x, b.y);
      c.rotate(b.a);
      c.scale(bs, bs);
      c.fillStyle = "#ffd23e";
      for (var k = -1; k <= 1; k += 2) {
        c.beginPath();
        c.moveTo(k * 8 - 12, -13); c.lineTo(k * 8 + 2, 0); c.lineTo(k * 8 - 12, 13);
        c.lineTo(k * 8 - 5, 0);
        c.closePath(); c.fill();
      }
      c.restore();
    });

    // öljyläikät — litteä, epäsäännöllinen lätäkkö
    track.oils.forEach(function (o, oi) {
      c.fillStyle = "rgba(28,28,40,0.78)";
      for (var bl = 0; bl < 5; bl++) {
        var ba = oi * 1.3 + bl * 1.256;
        var bd = bl === 0 ? 0 : o.r * 0.42;
        c.beginPath();
        c.ellipse(
          o.x + Math.cos(ba) * bd, o.y + Math.sin(ba) * bd * 0.7,
          o.r * (bl === 0 ? 0.85 : 0.42), o.r * (bl === 0 ? 0.6 : 0.3),
          ba, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = "rgba(150,175,235,0.16)";
      c.beginPath();
      c.ellipse(o.x - o.r * 0.2, o.y - o.r * 0.15, o.r * 0.4, o.r * 0.16, 0.4, 0, Math.PI * 2);
      c.fill();
    });

    // mutalätäköt tiellä
    track.muds.forEach(function (m, mi) {
      for (var bl = 0; bl < 6; bl++) {
        var ba = mi * 0.9 + bl * 1.047;
        var bd = bl === 0 ? 0 : m.r * 0.45;
        c.fillStyle = bl % 2 ? "rgba(96,66,34,0.92)" : "rgba(116,82,44,0.9)";
        c.beginPath();
        c.ellipse(
          m.x + Math.cos(ba) * bd, m.y + Math.sin(ba) * bd * 0.7,
          m.r * (bl === 0 ? 0.8 : 0.4), m.r * (bl === 0 ? 0.58 : 0.28),
          ba, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = "rgba(70,47,22,0.85)";
      c.beginPath(); c.ellipse(m.x + m.r * 0.1, m.y + m.r * 0.08, m.r * 0.42, m.r * 0.26, 0.3, 0, Math.PI * 2); c.fill();
      // roiskepisarat
      for (var dr = 0; dr < 7; dr++) {
        var da = dr * 0.9 + mi;
        c.fillStyle = "rgba(96,66,34,0.7)";
        c.beginPath();
        c.arc(m.x + Math.cos(da) * m.r * (0.95 + (dr % 3) * 0.14),
              m.y + Math.sin(da) * m.r * (0.75 + (dr % 2) * 0.16), 3 + (dr % 3), 0, Math.PI * 2);
        c.fill();
      }
    });

    // siltakansi omalle tasolleen (piirretään autojen päälle render()issä)
    var dctx = deckLayer.getContext("2d");
    dctx.clearRect(v.minX, v.minY, v.w, v.h);
    track.bridges.forEach(function (br) {
      var half = br.deckHalf;
      function deckPath(cc) {
        cc.beginPath();
        for (var k = -half; k <= half; k++) {
          var p = S[(br.ib + k + N) % N];
          if (k === -half) cc.moveTo(p.x, p.y); else cc.lineTo(p.x, p.y);
        }
      }
      dctx.lineCap = "butt";
      dctx.lineJoin = "round";
      // varjo alle
      dctx.save();
      dctx.translate(5, 8);
      deckPath(dctx);
      dctx.strokeStyle = "rgba(10,14,10,0.32)";
      dctx.lineWidth = track.width + 20;
      dctx.stroke();
      dctx.restore();
      // kaiteet ja kansi
      deckPath(dctx);
      dctx.strokeStyle = "#ddd9cd";
      dctx.lineWidth = track.width + 18;
      dctx.stroke();
      deckPath(dctx);
      dctx.strokeStyle = "#6e6a60";
      dctx.lineWidth = track.width + 7;
      dctx.stroke();
      deckPath(dctx);
      dctx.strokeStyle = "#8e9298";
      dctx.lineWidth = track.width;
      dctx.stroke();
      // kannen keskiviiva
      dctx.setLineDash([14, 18]);
      deckPath(dctx);
      dctx.strokeStyle = "rgba(255,255,255,0.35)";
      dctx.lineWidth = 3;
      dctx.stroke();
      dctx.setLineDash([]);
    });

    // violetit seinäesteet turkoosipäädyin
    track.walls.forEach(function (w) {
      c.strokeStyle = "rgba(20,10,30,0.35)";
      c.lineWidth = w.r * 2 + 6;
      c.lineCap = "round";
      c.beginPath(); c.moveTo(w.x1 + 3, w.y1 + 5); c.lineTo(w.x2 + 3, w.y2 + 5); c.stroke();
      c.strokeStyle = "#7b4fa8";
      c.lineWidth = w.r * 2;
      c.beginPath(); c.moveTo(w.x1, w.y1); c.lineTo(w.x2, w.y2); c.stroke();
      c.strokeStyle = "rgba(255,255,255,0.25)";
      c.lineWidth = w.r * 0.8;
      c.beginPath(); c.moveTo(w.x1, w.y1 - w.r * 0.35); c.lineTo(w.x2, w.y2 - w.r * 0.35); c.stroke();
      [[w.x1, w.y1], [w.x2, w.y2]].forEach(function (p) {
        c.fillStyle = "#3fbf9f";
        c.beginPath(); c.arc(p[0], p[1], w.r + 2.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = "rgba(255,255,255,0.35)";
        c.beginPath(); c.arc(p[0] - 2, p[1] - 2, (w.r + 2.5) * 0.45, 0, Math.PI * 2); c.fill();
      });
    });

    // katsomo lähtösuoran varrella: aita ja värikäs yleisömosaiikki
    (function () {
      var sp = S[Math.round(N * 0.015) % N];
      var nx = -Math.sin(sp.dir), ny = Math.cos(sp.dir);
      var offs = track.width / 2 + 62;
      var cand = [
        { x: sp.x + nx * offs, y: sp.y + ny * offs },
        { x: sp.x - nx * offs, y: sp.y - ny * offs }
      ];
      var pick = E.nearestSample(track, cand[0].x, cand[0].y).dist >=
                 E.nearestSample(track, cand[1].x, cand[1].y).dist ? cand[0] : cand[1];
      if (pick.x < v.minX + 40 || pick.x > v.maxX - 40 ||
          pick.y < v.minY + 40 || pick.y > v.maxY - 40) return;
      c.save();
      c.translate(pick.x, pick.y);
      c.rotate(sp.dir);
      c.fillStyle = "rgba(20,25,18,0.3)";
      c.fillRect(-76, -34, 156, 72);
      c.fillStyle = "#8a6a40";
      c.fillRect(-78, -37, 156, 72);
      c.fillStyle = "#6f5330";
      c.fillRect(-74, -33, 148, 64);
      for (var yy = 0; yy < 8; yy++) {
        for (var xx = 0; xx < 24; xx++) {
          var h = Math.sin(xx * 12.9 + yy * 78.2 + track.samples.length) * 43758.545;
          h -= Math.floor(h);
          var pal = ["#e34b3f", "#3b6fd9", "#efd23e", "#f2f2f2", "#41a457", "#e078b0", "#2a2a33"];
          c.fillStyle = pal[Math.floor(h * pal.length)];
          c.fillRect(-70 + xx * 5.9, -29 + yy * 7, 3.6, 4.4);
        }
      }
      c.fillStyle = "#ddd9cd";
      c.fillRect(-78, 31, 156, 4);
      c.restore();
    })();

    // lähtöviiva (shakkiruutu)
    var st = S[0];
    c.save();
    c.translate(st.x, st.y);
    c.rotate(st.dir);
    var half = track.width / 2;
    var sq = 9;
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

    drawCarBody(ctx, car.veh, car.color, isPlayer);
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

  /** Piirtää korin paikallisiin koordinaatteihin (keula +x-suuntaan). */
  function drawCarBody(c, vehKey, color, outline) {
    if (vehKey === "formula") {
      // avonaiset renkaat + kapea runko ja siivet
      c.fillStyle = "#15181d";
      c.fillRect(-12, -9.5, 6, 4.5); c.fillRect(-12, 5, 6, 4.5);
      c.fillRect(6, -8.5, 5, 4); c.fillRect(6, 4.5, 5, 4);
      c.fillStyle = color;
      roundRect(c, -13, -4.5, 26, 9, 3.5);
      c.fill();
      c.fillStyle = "rgba(0,0,0,0.3)";
      c.fillRect(11, -7.5, 2.8, 15);            // etusiipi
      c.fillRect(-14.5, -8, 3, 16);             // takasiipi
      c.fillStyle = "rgba(20,26,34,0.9)";
      c.beginPath(); c.arc(-1, 0, 3.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = "rgba(160,210,255,0.4)";
      c.beginPath(); c.arc(0.5, 0, 1.8, 0, Math.PI * 2); c.fill();
      if (outline) {
        c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 1.4;
        roundRect(c, -13, -4.5, 26, 9, 3.5); c.stroke();
      }
    } else if (vehKey === "ralli") {
      c.fillStyle = "#15181d";
      c.fillRect(-10, -9.5, 6, 4); c.fillRect(-10, 5.5, 6, 4);
      c.fillRect(4, -9.5, 6, 4); c.fillRect(4, 5.5, 6, 4);
      c.fillStyle = color;
      roundRect(c, -12, -8, 24, 16, 4);
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.55)";   // ralliraidat
      c.fillRect(-12, -2.6, 24, 1.7); c.fillRect(-12, 1, 24, 1.7);
      c.fillStyle = "rgba(20,26,34,0.85)";
      roundRect(c, -5, -5.5, 10, 11, 3);
      c.fill();
      c.fillStyle = "rgba(0,0,0,0.35)";
      c.fillRect(-13, -8.5, 3, 17);             // takaspoileri
      c.fillStyle = "rgba(255,255,255,0.75)";
      c.fillRect(9.5, -6, 2.2, 3); c.fillRect(9.5, 3, 2.2, 3);
      if (outline) {
        c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 1.6;
        roundRect(c, -12, -8, 24, 16, 4); c.stroke();
      }
    } else if (vehKey === "paku") {
      c.fillStyle = "#15181d";
      c.fillRect(-12, -10, 6.5, 4.5); c.fillRect(-12, 5.5, 6.5, 4.5);
      c.fillRect(6, -10, 6.5, 4.5); c.fillRect(6, 5.5, 6.5, 4.5);
      c.fillStyle = color;
      roundRect(c, -15, -8.5, 30, 17, 3.5);
      c.fill();
      c.fillStyle = "rgba(0,0,0,0.22)";         // tavaratila
      roundRect(c, -14, -7.5, 17, 15, 2.5);
      c.fill();
      c.fillStyle = "rgba(20,26,34,0.85)";      // ohjaamo edessä
      roundRect(c, 6, -6.5, 6.5, 13, 2);
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.75)";
      c.fillRect(13, -5.5, 2, 3.2); c.fillRect(13, 2.3, 2, 3.2);
      if (outline) {
        c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 1.6;
        roundRect(c, -15, -8.5, 30, 17, 3.5); c.stroke();
      }
    } else {
      // sportti
      c.fillStyle = "#15181d";
      c.fillRect(-11, -9, 6, 4); c.fillRect(-11, 5, 6, 4);
      c.fillRect(5, -9, 6, 4); c.fillRect(5, 5, 6, 4);
      c.fillStyle = color;
      roundRect(c, -13, -7, 26, 14, 4);
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.75)";
      c.fillRect(10, -5, 2.5, 3); c.fillRect(10, 2, 2.5, 3);
      c.fillStyle = "rgba(0,0,0,0.35)";
      c.fillRect(-13.5, -8, 3.5, 16);
      c.fillStyle = "rgba(20,26,34,0.85)";
      roundRect(c, -4, -4.5, 9, 9, 2.5);
      c.fill();
      c.fillStyle = "rgba(160,210,255,0.35)";
      roundRect(c, 2, -3.5, 3, 7, 1.5);
      c.fill();
      if (outline) {
        c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 1.6;
        roundRect(c, -13, -7, 26, 14, 4); c.stroke();
      }
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
      // sillan kohdalla jäljet sotkisivat tasot — jätä piirtämättä
      if (E.bridgeLevel(state.track, car) !== null) slipping = false;
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
    var dustColor = themeOf(state.track).dust;
    state.cars.forEach(function (car) {
      var sp = Math.hypot(car.vx, car.vy);
      if (car.surf === "water" && sp > 30 && particles.length < 240) {
        particles.push({
          x: car.x - Math.cos(car.angle) * 10, y: car.y - Math.sin(car.angle) * 10,
          vx: -car.vx * 0.15 + Math.sin(car.x * 5.3) * 24, vy: -car.vy * 0.15 + Math.cos(car.y * 6.1) * 24,
          life: 0.55, max: 0.55, size: 5, color: "160,200,250"
        });
      } else if (car.surf === "mud" && sp > 40 && particles.length < 240) {
        particles.push({
          x: car.x - Math.cos(car.angle) * 12, y: car.y - Math.sin(car.angle) * 12,
          vx: -car.vx * 0.12 + Math.sin(car.x * 6.7) * 18, vy: -car.vy * 0.12 + Math.cos(car.y * 8.3) * 18,
          life: 0.5, max: 0.5, size: 4.2, color: "120,84,46"
        });
      } else if (car.surf === "grass" && sp > 70 && particles.length < 240) {
        particles.push({
          x: car.x - Math.cos(car.angle) * 13, y: car.y - Math.sin(car.angle) * 13,
          vx: -car.vx * 0.1 + Math.sin(car.x * 7.7) * 14, vy: -car.vy * 0.1 + Math.cos(car.y * 9.1) * 14,
          life: 0.5, max: 0.5, size: 4.5, color: dustColor
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

  function drawObstacles() {
    state.track.obstacles.forEach(function (o) {
      var tires = o.r >= 20
        ? [[-0.45, -0.4], [0.5, -0.35], [0, 0.45]]
        : [[0, 0]];
      var tr = o.r >= 20 ? o.r * 0.62 : o.r;
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath(); ctx.ellipse(o.x + 3, o.y + 4, o.r * 1.05, o.r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
      tires.forEach(function (t) {
        var tx = o.x + t[0] * o.r, ty = o.y + t[1] * o.r;
        ctx.fillStyle = "#23262b";
        ctx.beginPath(); ctx.arc(tx, ty, tr, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#454a52";
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(tx, ty, tr * 0.62, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "#101318";
        ctx.beginPath(); ctx.arc(tx, ty, tr * 0.32, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.14)";
        ctx.beginPath(); ctx.arc(tx - tr * 0.3, ty - tr * 0.3, tr * 0.28, 0, Math.PI * 2); ctx.fill();
      });
    });
  }

  function render() {
    ctx.setTransform(1, 0, 0, 1, -view.minX, -view.minY);
    ctx.drawImage(staticLayer, view.minX, view.minY);
    ctx.drawImage(skidLayer, view.minX, view.minY);
    drawObstacles();

    particles.forEach(function (p) {
      ctx.fillStyle = "rgba(" + p.color + "," + (p.life / p.max * 0.55).toFixed(2) + ")";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + 0.7 * (1 - p.life / p.max)), 0, Math.PI * 2);
      ctx.fill();
    });

    // piirrä autot sijoitusjärjestyksessä (kärki päällimmäisenä);
    // sillan alla ajavat ensin, kansi väliin, kannella ajavat päällimmäisiksi
    var order = state.cars.slice().sort(function (a, b) { return (b.place || 9) - (a.place || 9); });
    var slotOf = {};
    var hi = 0;
    state.cars.forEach(function (c) { if (c.kind === "human") slotOf[c.idx] = hi++; });
    var lower = [], upper = [];
    order.forEach(function (car) {
      (E.bridgeLevel(state.track, car) === 1 ? upper : lower).push(car);
    });
    lower.forEach(function (car) { drawCar(car, slotOf[car.idx] || 0); });
    ctx.drawImage(deckLayer, view.minX, view.minY);
    upper.forEach(function (car) { drawCar(car, slotOf[car.idx] || 0); });
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

    // retrotulostaulu radan alla: sija · väri · kierrokset · aika
    el.scorebar.innerHTML = sorted.map(function (car) {
      var t = car.finished ? E.formatTime(car.finishTime)
        : car.bestLap !== null ? E.formatTime(car.bestLap) : "-:--.-";
      return '<span class="slot' + (car.kind === "human" ? " me" : "") + '">' +
        '<b class="pos">' + (car.place || "·") + '</b>' +
        '<span class="chip" style="background:' + car.color + '"></span>' +
        '<span>' + Math.min(car.lapsDone + (car.finished ? 0 : 1), state.laps) + "/" + state.laps + '</span>' +
        '<span class="digits">' + t + '</span></span>';
    }).join("");

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
