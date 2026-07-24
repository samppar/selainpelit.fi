"use strict";
// Romuralli — käyttöliittymä: renderöinti, äänet, syötteet, ura ja valikot.
(function () {
  const E = window.RallyEngine;
  const $ = (id) => document.getElementById(id);
  const canvas = $("board");
  const ctx = canvas.getContext("2d");
  const VIEW_W = canvas.width, VIEW_H = canvas.height;

  // ———————————————————————— Ura ————————————————————————
  const SAVE_KEY = "romuralli-v1";
  function loadCareer() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (d && d.upgrades) return d;
    } catch (e) {}
    return null;
  }
  const career = loadCareer() || {
    money: 350,
    upgrades: { moottori: 0, renkaat: 0, panssari: 0, aseet: 0 },
    races: 0, wins: 0, best: {},
  };
  function saveCareer() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(career)); } catch (e) {}
  }

  // ———————————————————————— Tila ————————————————————————
  let mode = "menu";        // menu | race | results
  let state = null;         // pelaajan kisa
  let attract = null;       // valikon taustanäytös
  let trackLayer = null;    // esipiirretty rata {img, mini, sx, sy}
  let attractLayer = null;
  let seedCounter = (Date.now() % 1e9) | 0;
  let camX = 0, camY = 0, shake = 0;
  let resultApplied = false, pendingResultT = 0;
  let particles = [], skids = [], floaters = [];
  let testInput = null;     // smoke-testien ohjaus

  // ———————————————————————— Äänet ————————————————————————
  const S = (() => {
    let ac = null, master = null, eng = null;
    let enabled = true;
    function ensure() {
      if (ac || !enabled) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { enabled = false; return; }
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
    }
    // V8-henkinen moottori: sahalaita + ali-oskillaattori (pörinä) + kevyt
    // särö; kaasu avaa suodatinta, tyhjäkäynnillä epätasainen "loppatus".
    function engine(on, speed, throttle) {
      ensure();
      if (!ac) return;
      if (on && !eng) {
        const o1 = ac.createOscillator(); o1.type = "sawtooth";
        const o2 = ac.createOscillator(); o2.type = "square";   // ali-oktaavi
        const o3 = ac.createOscillator(); o3.type = "sawtooth"; // levitys
        o3.detune.value = 11;
        const oGain2 = ac.createGain(); oGain2.gain.value = 0.55;
        const pre = ac.createGain(); pre.gain.value = 1.6;      // aja säröön kuumana
        const shaper = ac.createWaveShaper();
        const curve = new Float32Array(257);
        for (let i = 0; i <= 256; i++) curve[i] = Math.tanh((i / 128 - 1) * 2.6);
        shaper.curve = curve;
        shaper.oversample = "2x";
        const filter = ac.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 240;
        filter.Q.value = 1.1;
        const g = ac.createGain(); g.gain.value = 0;
        // Käyntiepätasaisuus: hidas LFO heiluttaa kierroksia hieman
        const lfo = ac.createOscillator(); lfo.type = "triangle"; lfo.frequency.value = 9;
        const lfoG = ac.createGain(); lfoG.gain.value = 2.5;
        lfo.connect(lfoG);
        lfoG.connect(o1.frequency);
        lfoG.connect(o2.frequency);
        o1.connect(pre); o3.connect(pre);
        o2.connect(oGain2).connect(pre);
        pre.connect(shaper).connect(filter).connect(g).connect(master);
        o1.start(); o2.start(); o3.start(); lfo.start();
        eng = { o1, o2, o3, lfo, lfoG, filter, g };
      }
      if (eng) {
        const th = Math.max(0, throttle || 0);
        const f = 34 + speed * 0.22;
        eng.o1.frequency.setTargetAtTime(f, ac.currentTime, 0.09);
        eng.o3.frequency.setTargetAtTime(f, ac.currentTime, 0.09);
        eng.o2.frequency.setTargetAtTime(f / 2, ac.currentTime, 0.09);
        eng.lfo.frequency.setTargetAtTime(8 + speed * 0.03, ac.currentTime, 0.2);
        eng.lfoG.gain.setTargetAtTime(Math.max(0.6, 3 - speed * 0.01), ac.currentTime, 0.2);
        eng.filter.frequency.setTargetAtTime(170 + speed * 2.4 + th * 260, ac.currentTime, 0.12);
        // Tyhjäkäynti hiljaa, ääni kasvaa vauhdin ja kaasun mukana
        const vol = 0.026 + Math.min(1, speed / 330) * 0.05 + th * 0.018;
        eng.g.gain.setTargetAtTime(on && enabled ? vol : 0, ac.currentTime, 0.1);
      }
    }
    // Taustavälilehti: koko äänikonteksti seis (muuten moottori jää soimaan,
    // kun rAF-silmukka pysähtyy eikä enää päivitä gainia)
    function suspend(hidden) {
      if (!ac) return;
      if (hidden) ac.suspend();
      else if (enabled) ac.resume();
    }
    function blip(freq, dur, type, vol, slide) {
      ensure();
      if (!ac || !enabled) return;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || "square";
      o.frequency.value = freq;
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, ac.currentTime + dur);
      g.gain.value = vol || 0.12;
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.connect(g).connect(master);
      o.start();
      o.stop(ac.currentTime + dur + 0.02);
    }
    function noise(dur, freq, vol) {
      ensure();
      if (!ac || !enabled) return;
      const n = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, n, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = ac.createBufferSource();
      src.buffer = buf;
      const f = ac.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = freq;
      const g = ac.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(master);
      src.start();
    }
    return {
      fire: (v) => noise(0.07, 2400, 0.10 * v),
      hit: (v) => blip(700, 0.05, "square", 0.06 * v),
      crash: (v) => noise(0.18, 420, Math.min(0.3, 0.08 + v * 0.0006)),
      boom: () => { noise(0.6, 300, 0.32); blip(150, 0.5, "sine", 0.25, 40); },
      pickup: () => { blip(660, 0.09, "square", 0.09); setTimeout(() => blip(990, 0.12, "square", 0.09), 70); },
      lap: () => { blip(523, 0.1, "triangle", 0.12); setTimeout(() => blip(784, 0.16, "triangle", 0.12), 100); },
      count: () => blip(440, 0.12, "square", 0.1),
      go: () => blip(880, 0.3, "square", 0.12),
      finish: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.18, "triangle", 0.12), i * 110)),
      engine, suspend,
      toggle() { enabled = !enabled; if (!enabled && eng && ac) eng.g.gain.setTargetAtTime(0, ac.currentTime, 0.05); return enabled; },
      get enabled() { return enabled; },
      ensure,
    };
  })();

  // ———————————————————————— Radan esipiirto ————————————————————————
  function buildTrackLayer(track) {
    const th = Object.assign(
      { ground: "#4c4839", speck: "#5a5545", road: "#33343a", edge: "#c8c2ae", kerb1: "#b8402e", kerb2: "#ddd6c2" },
      track.theme || {}
    );
    const c = document.createElement("canvas");
    c.width = track.W; c.height = track.H;
    const g = c.getContext("2d");
    const rng = E.mulberry32(track.seed * 977 + 13);
    // Maasto
    g.fillStyle = th.ground;
    g.fillRect(0, 0, track.W, track.H);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = i % 3 ? th.speck : "#00000018";
      const r = 1 + rng() * 3;
      g.beginPath();
      g.arc(rng() * track.W, rng() * track.H, r, 0, 7);
      g.fill();
    }
    for (let i = 0; i < 26; i++) {
      g.fillStyle = i % 2 ? "#00000014" : "#ffffff08";
      g.beginPath();
      g.ellipse(rng() * track.W, rng() * track.H, 40 + rng() * 140, 26 + rng() * 90, rng() * 3, 0, 7);
      g.fill();
    }
    // Tie: reunus + asfaltti
    const path = new Path2D();
    const pts = track.pts;
    path.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < track.count; i++) path.lineTo(pts[i].x, pts[i].y);
    path.closePath();
    g.lineJoin = "round"; g.lineCap = "round";
    g.strokeStyle = th.edge;
    g.lineWidth = track.halfWidth * 2 + 12;
    g.stroke(path);
    g.strokeStyle = th.road;
    g.lineWidth = track.halfWidth * 2;
    g.stroke(path);
    // Asfaltin sävyvaihtelu
    g.save();
    g.clip(pathAsRegion(path, track.halfWidth * 2, g));
    g.restore();
    for (let i = 0; i < 500; i++) {
      const p = pts[Math.floor(rng() * track.count)];
      const off = (rng() * 2 - 1) * (track.halfWidth - 8);
      g.fillStyle = rng() < 0.5 ? "#ffffff05" : "#00000010";
      g.beginPath();
      g.arc(p.x - p.ty * off, p.y + p.tx * off, 2 + rng() * 6, 0, 7);
      g.fill();
    }
    // Keskiviiva
    g.setLineDash([16, 30]);
    g.strokeStyle = "#ffffff14";
    g.lineWidth = 3;
    g.stroke(path);
    g.setLineDash([]);
    // Reunakivet mutkiin
    for (let i = 0; i < track.count; i += 3) {
      const p = pts[i];
      if (p.curv < 0.0028) continue;
      for (const side of [-1, 1]) {
        const ex = p.x - p.ty * side * track.halfWidth;
        const ey = p.y + p.tx * side * track.halfWidth;
        g.strokeStyle = (i / 3) % 2 ? th.kerb1 : th.kerb2;
        g.lineWidth = 8;
        g.beginPath();
        g.moveTo(ex - p.tx * 5, ey - p.ty * 5);
        g.lineTo(ex + p.tx * 5, ey + p.ty * 5);
        g.stroke();
      }
    }
    // Lähtöviiva (shakkiruutu)
    {
      const p = pts[0];
      const nx = -p.ty, ny = p.tx;
      const sq = 9;
      for (let k = -Math.floor(track.halfWidth / sq); k * sq < track.halfWidth; k++) {
        for (let r = 0; r < 2; r++) {
          g.fillStyle = (k + r) % 2 ? "#e8e6df" : "#17181d";
          const bx = p.x + nx * (k * sq + sq / 2) + p.tx * (r * sq - sq);
          const by = p.y + ny * (k * sq + sq / 2) + p.ty * (r * sq - sq);
          g.save();
          g.translate(bx, by);
          g.rotate(Math.atan2(p.ty, p.tx));
          g.fillRect(-sq / 2, -sq / 2, sq, sq);
          g.restore();
        }
      }
    }
    // Yöteema: pimennys + reunavalot
    if (th.night) {
      g.fillStyle = "#0a0c1440";
      g.fillRect(0, 0, track.W, track.H);
      for (let i = 0; i < track.count; i += 14) {
        const p = pts[i];
        for (const side of [-1, 1]) {
          const ex = p.x - p.ty * side * (track.halfWidth + 10);
          const ey = p.y + p.tx * side * (track.halfWidth + 10);
          const gr = g.createRadialGradient(ex, ey, 0, ex, ey, 26);
          gr.addColorStop(0, "#8fd2c855");
          gr.addColorStop(1, "#8fd2c800");
          g.fillStyle = gr;
          g.beginPath();
          g.arc(ex, ey, 26, 0, 7);
          g.fill();
        }
      }
    }
    // Minikartta
    const mini = document.createElement("canvas");
    const MW = 170, MH = 120;
    mini.width = MW; mini.height = MH;
    const mg = mini.getContext("2d");
    const sx = (MW - 16) / track.W, sy = (MH - 16) / track.H;
    mg.fillStyle = "#0c0d11cc";
    roundRect(mg, 0, 0, MW, MH, 10);
    mg.fill();
    mg.strokeStyle = "#ffffff30";
    mg.lineWidth = 4;
    mg.lineJoin = "round";
    mg.beginPath();
    mg.moveTo(8 + pts[0].x * sx, 8 + pts[0].y * sy);
    for (let i = 2; i < track.count; i += 2) mg.lineTo(8 + pts[i].x * sx, 8 + pts[i].y * sy);
    mg.closePath();
    mg.stroke();
    return { img: c, mini, sx, sy };
  }
  function pathAsRegion(path) { return path; } // (selkeyden vuoksi)

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // ———————————————————————— Kisan aloitus ————————————————————————
  function startRace(tier) {
    S.ensure();
    state = E.createRace({ tier, seed: ++seedCounter, playerUpgrades: career.upgrades });
    trackLayer = buildTrackLayer(state.track);
    particles = []; skids = []; floaters = [];
    resultApplied = false; pendingResultT = 0;
    const pl = state.cars[0];
    camX = pl.x; camY = pl.y; shake = 0;
    mode = "race";
    $("overlay").classList.remove("show");
    updateSide(true);
  }
  function toMenu() {
    mode = "menu";
    state = null;
    S.engine(false, 0);
    startAttract();
    $("menuSection").style.display = "";
    $("resultsSection").style.display = "none";
    $("overlay").classList.add("show");
    $("mMoney").textContent = "$" + career.money;
    updateSide(true);
  }
  function startAttract() {
    attract = E.createRace({ tier: "keski", seed: ++seedCounter, autopilot: true });
    attractLayer = buildTrackLayer(attract.track);
  }

  // ———————————————————————— Syötteet ————————————————————————
  const keys = Object.create(null);
  const touch = { left: false, right: false, gas: false, brake: false, fire: false, turbo: false };
  addEventListener("keydown", (e) => {
    if (e.repeat) { if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault(); return; }
    keys[e.code] = true;
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    if (e.code === "KeyF") toggleFullscreen();
    if (e.code === "Escape" && mode === "race") abortRace();
    S.ensure();
  });
  addEventListener("keyup", (e) => { keys[e.code] = false; });
  function bindTouch(id, prop) {
    const el = $(id);
    if (!el) return;
    const on = (e) => { e.preventDefault(); touch[prop] = true; S.ensure(); };
    const off = (e) => { e.preventDefault(); touch[prop] = false; };
    el.addEventListener("pointerdown", on);
    el.addEventListener("pointerup", off);
    el.addEventListener("pointercancel", off);
    el.addEventListener("pointerleave", off);
  }
  bindTouch("tLeft", "left"); bindTouch("tRight", "right");
  bindTouch("tGas", "gas"); bindTouch("tBrake", "brake");
  bindTouch("tFire", "fire"); bindTouch("tTurbo", "turbo");

  function playerInput() {
    if (testInput) return testInput;
    const steer =
      ((keys.ArrowRight || keys.KeyD || touch.right) ? 1 : 0) -
      ((keys.ArrowLeft || keys.KeyA || touch.left) ? 1 : 0);
    const throttle =
      ((keys.ArrowUp || keys.KeyW || touch.gas) ? 1 : 0) -
      ((keys.ArrowDown || keys.KeyS || touch.brake) ? 1 : 0);
    return {
      steer, throttle,
      fire: !!(keys.Space || touch.fire),
      turbo: !!(keys.ShiftLeft || keys.ShiftRight || touch.turbo),
    };
  }

  // ———————————————————————— Tapahtumat → efektit ————————————————————————
  function spawnBurst(x, y, n, opts) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = opts.speed * (0.4 + Math.random());
      particles.push({
        x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: opts.life * (0.6 + Math.random() * 0.7), maxLife: opts.life,
        size: opts.size * (0.6 + Math.random() * 0.8),
        color: opts.color, grav: opts.grav || 0, fade: true,
      });
    }
  }
  function floatText(x, y, text, color) {
    floaters.push({ x, y, text, color, life: 1.4 });
  }
  function distVol(st, x, y) {
    const pl = st.cars[0];
    const d = Math.hypot(pl.x - x, pl.y - y);
    return Math.max(0.15, 1 - d / 900);
  }
  function handleEvents(st, silent) {
    const pl = st.cars[0];
    for (const ev of st.events) {
      switch (ev.type) {
        case "fire": {
          const c = st.cars.find((k) => k.id === ev.car);
          particles.push({
            x: c.x + Math.cos(c.ang) * 20, y: c.y + Math.sin(c.ang) * 20,
            vx: 0, vy: 0, life: 0.06, maxLife: 0.06, size: 9, color: "#ffe28a", fade: true,
          });
          if (!silent) S.fire(distVol(st, ev.x, ev.y));
          break;
        }
        case "hit":
          spawnBurst(ev.x, ev.y, 5, { speed: 120, life: 0.25, size: 2.5, color: "#ffd166" });
          if (!silent) S.hit(distVol(st, ev.x, ev.y));
          break;
        case "crash":
          spawnBurst(ev.x, ev.y, 8, { speed: 160, life: 0.3, size: 3, color: "#ffca7a" });
          shake = Math.min(14, shake + ev.force * 0.02);
          if (!silent) S.crash(ev.force);
          break;
        case "wreck": {
          spawnBurst(ev.x, ev.y, 26, { speed: 260, life: 0.7, size: 5, color: "#ff9a3c" });
          spawnBurst(ev.x, ev.y, 14, { speed: 90, life: 1.1, size: 8, color: "#555" });
          shake = 16;
          if (!silent) S.boom();
          const c = st.cars.find((k) => k.id === ev.car);
          if (!silent) floatText(c.x, c.y - 24, "ROMU!", "#e5484d");
          break;
        }
        case "bounty":
          if (ev.car === pl.id && !silent) floatText(pl.x, pl.y - 30, "+$" + ev.amount, "#ffd166");
          break;
        case "pickup": {
          const label = ev.kind === "raha" ? "+$" + ev.value : ev.kind === "korjaus" ? "KORJAUS" : ev.kind === "ammus" ? "AMMUKSIA" : "TURBO";
          const col = ev.kind === "raha" ? "#ffd166" : ev.kind === "korjaus" ? "#4cc38a" : ev.kind === "ammus" ? "#ffca7a" : "#7ad7ff";
          if (!silent) floatText(ev.x, ev.y - 18, label, col);
          spawnBurst(ev.x, ev.y, 8, { speed: 90, life: 0.35, size: 3, color: col });
          if (ev.car === pl.id && !silent) S.pickup();
          break;
        }
        case "lap":
          if (ev.car === pl.id && !silent) {
            floatText(pl.x, pl.y - 30, "KIERROS " + ev.lap + "/" + st.track.laps, "#eae7de");
            S.lap();
          }
          break;
        case "finish":
          if (ev.car === pl.id && !silent) S.finish();
          break;
        case "count": if (!silent) S.count(); break;
        case "go": if (!silent) S.go(); break;
        case "dust":
          particles.push({
            x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
            life: 0.5, maxLife: 0.5, size: 5, color: "#bda77a55", fade: true,
          });
          break;
        case "raceover":
          pendingResultT = 1.4;
          break;
      }
    }
  }

  // ———————————————————————— Renkaanjäljet ————————————————————————
  function trackSkids(st) {
    for (const c of st.cars) {
      if (c.wrecked) continue;
      const cos = Math.cos(c.ang), sin = Math.sin(c.ang);
      const lat = Math.abs(-c.vx * sin + c.vy * cos);
      if (lat > 70 && !c.offroad) {
        for (const side of [-1, 1]) {
          skids.push({
            x: c.x - sin * side * 7 - cos * 8, y: c.y + cos * side * 7 - sin * 8,
            a: Math.min(0.4, lat / 500),
          });
        }
        if (skids.length > 900) skids.splice(0, skids.length - 900);
      }
    }
  }

  // ———————————————————————— Piirto ————————————————————————
  function drawCar(g, c, t) {
    g.save();
    g.translate(c.x, c.y);
    // varjo
    g.fillStyle = "#00000038";
    g.beginPath();
    g.ellipse(2, 3, 16, 11, 0, 0, 7);
    g.fill();
    g.rotate(c.ang);
    const dmg = c.wrecked ? 1 : 1 - c.hp / c.stats.maxHp;
    // renkaat
    g.fillStyle = "#141519";
    for (const [wx, wy] of [[-9, -8.5], [-9, 8.5], [9, -8.5], [9, 8.5]]) {
      g.fillRect(wx - 3.4, wy - 2.4, 6.8, 4.8);
    }
    // kori
    const body = c.wrecked ? "#3a3a3c" : c.color;
    g.fillStyle = body;
    roundRect(g, -15, -8, 30, 16, 5);
    g.fill();
    g.fillStyle = "#00000022";
    roundRect(g, -15, 2, 30, 6, 4);
    g.fill();
    // keula-viiste ja takasiipi
    g.fillStyle = c.wrecked ? "#2c2c2e" : "#ffffff2e";
    roundRect(g, 6, -6.5, 8, 13, 3);
    g.fill();
    g.fillStyle = c.wrecked ? "#242426" : "#00000055";
    g.fillRect(-16.5, -8.5, 3.5, 17);
    // tuulilasi
    g.fillStyle = c.wrecked ? "#1d1d1f" : "#1b2430dd";
    roundRect(g, -1, -5.5, 7.5, 11, 2.5);
    g.fill();
    // vauriot
    if (dmg > 0.35 && !c.wrecked) {
      g.fillStyle = "#00000055";
      g.beginPath();
      g.arc(-6, -3, 3.2, 0, 7);
      g.arc(4, 4, 2.6, 0, 7);
      g.fill();
    }
    if (c.turboOn && !c.wrecked) {
      g.fillStyle = "#7ad7ff";
      g.beginPath();
      g.moveTo(-17, -3);
      g.lineTo(-25 - Math.random() * 7, 0);
      g.lineTo(-17, 3);
      g.closePath();
      g.fill();
    }
    g.restore();
    // pelaajan korostus
    if (c.isPlayer && !c.wrecked) {
      g.strokeStyle = "#f97f38aa";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(c.x, c.y, 22 + Math.sin(t * 5) * 1.5, 0, 7);
      g.stroke();
    }
    // savu vauriosta / romusta
    if ((c.wrecked || dmg > 0.6) && Math.random() < (c.wrecked ? 0.5 : 0.2)) {
      particles.push({
        x: c.x + (Math.random() - 0.5) * 10, y: c.y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 20,
        life: 0.9, maxLife: 0.9, size: 6, color: c.wrecked ? "#666" : "#888", fade: true,
      });
    }
  }

  function drawPickup(g, p, t) {
    if (!p.active) return;
    const pulse = 1 + Math.sin(t * 4 + p.x) * 0.08;
    g.save();
    g.translate(p.x, p.y);
    g.scale(pulse, pulse);
    const colors = { raha: "#ffd166", korjaus: "#4cc38a", ammus: "#ffca7a", turbo: "#7ad7ff" };
    const col = colors[p.type];
    const gr = g.createRadialGradient(0, 0, 2, 0, 0, 22);
    gr.addColorStop(0, col + "55");
    gr.addColorStop(1, col + "00");
    g.fillStyle = gr;
    g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill();
    g.fillStyle = "#181a20";
    g.beginPath(); g.arc(0, 0, 11, 0, 7); g.fill();
    g.strokeStyle = col;
    g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, 11, 0, 7); g.stroke();
    g.fillStyle = col;
    g.strokeStyle = col;
    if (p.type === "raha") {
      g.font = "bold 13px 'Chakra Petch', sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("$", 0, 1);
    } else if (p.type === "korjaus") {
      g.fillRect(-1.8, -6, 3.6, 12);
      g.fillRect(-6, -1.8, 12, 3.6);
    } else if (p.type === "ammus") {
      roundRect(g, -4.5, -5.5, 9, 11, 2);
      g.fill();
      g.fillStyle = "#181a20";
      g.fillRect(-2.5, -3.5, 5, 2);
      g.fillRect(-2.5, 0.5, 5, 2);
    } else {
      g.beginPath();
      g.moveTo(1.5, -7); g.lineTo(-4.5, 1.5); g.lineTo(-0.5, 1.5);
      g.lineTo(-1.5, 7); g.lineTo(4.5, -1.5); g.lineTo(0.5, -1.5);
      g.closePath();
      g.fill();
    }
    g.restore();
  }

  function drawScene(st, layer, t, showHud) {
    const tr = st.track;
    const pl = st.autopilot ? st.cars.find((c) => c.id === st.order[0]) : st.cars[0];
    // kamera
    const tx = E.clamp(pl.x + pl.vx * 0.3, VIEW_W / 2, tr.W - VIEW_W / 2);
    const ty = E.clamp(pl.y + pl.vy * 0.3, VIEW_H / 2, tr.H - VIEW_H / 2);
    camX += (tx - camX) * 0.08;
    camY += (ty - camY) * 0.08;
    let ox = camX - VIEW_W / 2, oy = camY - VIEW_H / 2;
    if (shake > 0.2) {
      ox += (Math.random() - 0.5) * shake;
      oy += (Math.random() - 0.5) * shake;
      shake *= 0.88;
    } else shake = 0;
    ctx.fillStyle = "#0c0d11";
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    ctx.translate(-ox, -oy);
    ctx.drawImage(layer.img, 0, 0);
    // renkaanjäljet
    ctx.fillStyle = "#000";
    for (const s of skids) {
      ctx.globalAlpha = s.a;
      ctx.fillRect(s.x - 1.6, s.y - 1.6, 3.2, 3.2);
      s.a *= 0.9985;
    }
    ctx.globalAlpha = 1;
    // poiminnat
    for (const p of st.pickups) drawPickup(ctx, p, t);
    // luodit
    ctx.strokeStyle = "#ffe28a";
    ctx.lineWidth = 2.5;
    for (const b of st.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      ctx.stroke();
    }
    // autot (romut alle)
    for (const c of st.cars) if (c.wrecked) drawCar(ctx, c, t);
    for (const c of st.cars) if (!c.wrecked) drawCar(ctx, c, t);
    // partikkelit
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= 1 / 60;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx / 60; p.y += p.vy / 60;
      p.vy += (p.grav || 0) / 60;
      ctx.globalAlpha = p.fade ? Math.max(0, p.life / p.maxLife) : 1;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // leijuvat tekstit
    ctx.font = "bold 15px 'Russo One', sans-serif";
    ctx.textAlign = "center";
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life -= 1 / 60;
      if (f.life <= 0) { floaters.splice(i, 1); continue; }
      f.y -= 0.7;
      ctx.globalAlpha = Math.min(1, f.life);
      ctx.fillStyle = "#000";
      ctx.fillText(f.text, f.x + 1, f.y + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    if (showHud) drawHud(st, layer, t);
  }

  function chip(x, y, w, h) {
    ctx.fillStyle = "#0c0d11b8";
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = "#ffffff1c";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawHud(st, layer, t) {
    const tr = st.track;
    const pl = st.cars[0];
    const place = E.placeOf(st, pl.id) + 1;
    ctx.textBaseline = "middle";
    // Kierros
    chip(14, 14, 132, 40);
    ctx.textAlign = "left";
    ctx.font = "10px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#9b988c";
    ctx.fillText("KIERROS", 26, 27);
    ctx.font = "18px 'Russo One', sans-serif";
    ctx.fillStyle = "#eae7de";
    ctx.fillText(E.lapOf(pl, tr.laps) + " / " + tr.laps, 26, 44);
    // Sijoitus
    chip(VIEW_W / 2 - 55, 14, 110, 46);
    ctx.textAlign = "center";
    ctx.font = "26px 'Russo One', sans-serif";
    ctx.fillStyle = place === 1 ? "#ffd166" : "#eae7de";
    ctx.fillText(place + ".", VIEW_W / 2 - 12, 38);
    ctx.font = "12px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#9b988c";
    ctx.fillText("/ " + st.cars.length, VIEW_W / 2 + 26, 40);
    // Kisatienestit
    chip(VIEW_W - 320, 14, 118, 40);
    ctx.textAlign = "left";
    ctx.font = "10px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#9b988c";
    ctx.fillText("KISATIENESTIT", VIEW_W - 308, 27);
    ctx.font = "16px 'Russo One', sans-serif";
    ctx.fillStyle = "#ffd166";
    ctx.fillText("+$" + pl.money, VIEW_W - 308, 44);
    // Minikartta (koko ruutu -napin alapuolella)
    const mmX = VIEW_W - layer.mini.width - 14, mmY = 58;
    ctx.drawImage(layer.mini, mmX, mmY);
    for (const c of st.cars) {
      ctx.fillStyle = c.wrecked ? "#555" : c.isPlayer ? "#ffffff" : c.color;
      ctx.beginPath();
      ctx.arc(mmX + 8 + c.x * layer.sx, mmY + 8 + c.y * layer.sy, c.isPlayer ? 3.4 : 2.6, 0, 7);
      ctx.fill();
    }
    // Kunto + ammukset
    chip(14, VIEW_H - 64, 210, 50);
    ctx.font = "10px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#9b988c";
    ctx.fillText("KUNTO", 26, VIEW_H - 51);
    const hpF = Math.max(0, pl.hp / pl.stats.maxHp);
    ctx.fillStyle = "#ffffff14";
    roundRect(ctx, 26, VIEW_H - 44, 120, 9, 4); ctx.fill();
    ctx.fillStyle = hpF > 0.5 ? "#4cc38a" : hpF > 0.25 ? "#ffd166" : "#e5484d";
    if (hpF > 0) { roundRect(ctx, 26, VIEW_H - 44, Math.max(6, 120 * hpF), 9, 4); ctx.fill(); }
    ctx.fillStyle = "#9b988c";
    ctx.fillText("AMMUKSET", 26, VIEW_H - 26);
    ctx.font = "14px 'Russo One', sans-serif";
    ctx.fillStyle = pl.ammo > 0 ? "#ffca7a" : "#e5484d";
    ctx.fillText(String(pl.ammo), 88, VIEW_H - 25);
    // nopeus
    ctx.font = "16px 'Russo One', sans-serif";
    ctx.fillStyle = "#eae7de";
    ctx.textAlign = "right";
    ctx.fillText(Math.round(Math.hypot(pl.vx, pl.vy) * 0.55) + " km/h", 212, VIEW_H - 38);
    // Turbo
    chip(VIEW_W - 174, VIEW_H - 64, 160, 50);
    ctx.textAlign = "left";
    ctx.font = "10px 'Chakra Petch', sans-serif";
    ctx.fillStyle = "#9b988c";
    ctx.fillText("TURBO (VAIHTO)", VIEW_W - 160, VIEW_H - 51);
    ctx.fillStyle = "#ffffff14";
    roundRect(ctx, VIEW_W - 160, VIEW_H - 42, 132, 10, 4); ctx.fill();
    if (pl.turboM > 1) {
      ctx.fillStyle = pl.turboOn ? "#b7ecff" : "#7ad7ff";
      roundRect(ctx, VIEW_W - 160, VIEW_H - 42, Math.max(6, 132 * pl.turboM / 100), 10, 4);
      ctx.fill();
    }
    // Lähtölaskenta
    if (st.countdownT > -0.8) {
      const n = Math.ceil(Math.max(0, st.countdownT));
      const label = st.countdownT <= 0 ? "AJA!" : String(n);
      const frac = st.countdownT <= 0 ? 1 + st.countdownT / 0.8 : st.countdownT % 1 || 1;
      ctx.save();
      ctx.translate(VIEW_W / 2, VIEW_H / 2 - 40);
      ctx.scale(0.8 + (1 - frac) * 0.4, 0.8 + (1 - frac) * 0.4);
      ctx.globalAlpha = Math.max(0, Math.min(1, frac * 1.6));
      ctx.font = "64px 'Russo One', sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#000000aa";
      ctx.fillText(label, 3, 4);
      ctx.fillStyle = st.countdownT <= 0 ? "#4cc38a" : "#ffd166";
      ctx.fillText(label, 0, 0);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  // ———————————————————————— Sivupaneeli ————————————————————————
  function updateSide(force) {
    $("money").textContent = "$" + career.money;
    const st = mode === "race" || mode === "results" ? state : attract;
    if (st) {
      $("trackChip").textContent = st.track.name + " · " + st.track.laps + " kierrosta" + (st.autopilot ? " · näytösajo" : "");
      const rows = [];
      st.order.forEach((id, i) => {
        const c = st.cars.find((k) => k.id === id);
        const status = c.wrecked ? "ROMU" : c.finished ? "MAALI" : "K" + E.lapOf(c, st.track.laps);
        rows.push(
          '<div class="row' + (c.isPlayer && !st.autopilot ? " me" : "") + (c.wrecked ? " out" : "") + '">' +
          '<span class="pos">' + (i + 1) + '.</span>' +
          '<span class="dot" style="background:' + c.color + '"></span>' +
          '<span class="nm">' + c.name + '</span>' +
          '<span class="st">' + status + "</span></div>"
        );
      });
      $("standings").innerHTML = rows.join("");
    }
    if (force) buildGarage();
    else refreshGarageButtons();
  }

  function buildGarage() {
    const wrap = $("garage");
    const html = [];
    for (const key of Object.keys(E.UPGRADES)) {
      const u = E.UPGRADES[key];
      const lvl = career.upgrades[key] || 0;
      const cost = lvl < 3 ? u.costs[lvl] : null;
      let pips = "";
      for (let i = 0; i < 3; i++) pips += "<i" + (i < lvl ? ' class="on"' : "") + "></i>";
      html.push(
        '<div class="g-row"><div class="g-info">' +
        '<div class="g-name">' + u.name + '</div>' +
        '<div class="g-desc">' + u.desc + '</div>' +
        '<div class="g-pips">' + pips + "</div></div>" +
        '<button class="g-buy" data-upg="' + key + '"' + (cost == null ? " disabled" : "") + ">" +
        (cost == null ? "MAX" : "$" + cost) + "</button></div>"
      );
    }
    wrap.innerHTML = html.join("");
    wrap.querySelectorAll("button[data-upg]").forEach((b) => {
      b.addEventListener("click", () => buyUpgrade(b.dataset.upg));
    });
    refreshGarageButtons();
  }
  function refreshGarageButtons() {
    document.querySelectorAll("#garage button[data-upg]").forEach((b) => {
      const key = b.dataset.upg;
      const lvl = career.upgrades[key] || 0;
      if (lvl >= 3) { b.disabled = true; b.textContent = "MAX"; return; }
      const cost = E.UPGRADES[key].costs[lvl];
      b.textContent = "$" + cost;
      b.disabled = mode === "race" || career.money < cost;
    });
  }
  function buyUpgrade(key) {
    const lvl = career.upgrades[key] || 0;
    if (mode === "race" || lvl >= 3) return;
    const cost = E.UPGRADES[key].costs[lvl];
    if (career.money < cost) return;
    career.money -= cost;
    career.upgrades[key] = lvl + 1;
    saveCareer();
    toast(E.UPGRADES[key].name + " → taso " + (lvl + 1));
    S.pickup();
    updateSide(true);
    $("mMoney").textContent = "$" + career.money;
  }

  // ———————————————————————— Tulokset ————————————————————————
  function showResults() {
    const res = E.raceResult(state);
    if (!resultApplied) {
      resultApplied = true;
      career.money += res.total;
      career.races++;
      if (res.place === 0 && !res.wrecked) career.wins++;
      const prev = career.best[state.tier];
      if (!res.wrecked && (prev == null || res.place < prev)) career.best[state.tier] = res.place;
      saveCareer();
    }
    mode = "results";
    const title = $("resTitle");
    if (res.wrecked) {
      title.textContent = "Tuhouduit!";
      title.className = "res-place out";
    } else {
      title.textContent = res.place + 1 + ". sija" + (res.place === 0 ? " — voitto!" : "");
      title.className = "res-place" + (res.place === 0 ? " win" : "");
    }
    const rows = [];
    rows.push('<div class="r"><span>Sijoituspalkinto</span><b>$' + res.prize + "</b></div>");
    rows.push('<div class="r"><span>Romutuspalkkiot</span><b>$' + res.bounty + "</b></div>");
    rows.push('<div class="r"><span>Rahasäkit radalta</span><b>$' + res.pickups + "</b></div>");
    rows.push('<div class="r total"><span>Yhteensä</span><b>+$' + res.total + "</b></div>");
    $("resRows").innerHTML = rows.join("");
    const order = [];
    res.order.forEach((c, i) => {
      order.push(
        '<div class="o' + (c.isPlayer ? " me" : "") + '"><span class="dot" style="background:' + c.color + '"></span>' +
        (i + 1) + ". " + c.name + (c.wrecked ? " · romu" : c.finished ? "" : " · kesken") + "</div>"
      );
    });
    $("resOrder").innerHTML = order.join("");
    $("menuSection").style.display = "none";
    $("resultsSection").style.display = "";
    $("overlay").classList.add("show");
    updateSide(true);
  }
  function abortRace() {
    if (mode !== "race") return;
    toast("Kisa keskeytetty — ei palkintoja");
    toMenu();
  }

  let toastTimer = 0;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
  }

  function toggleFullscreen() {
    const el = document.querySelector(".board-frame");
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen();
  }

  // ———————————————————————— Pääsilmukka ————————————————————————
  let last = performance.now(), acc = 0, sideTimer = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;
    const t = now / 1000;
    if (mode === "race" || mode === "results") {
      const input = playerInput();
      let steps = 0;
      while (acc >= E.DT && steps < 4) {
        E.step(state, input);
        handleEvents(state, false);
        trackSkids(state);
        acc -= E.DT;
        steps++;
      }
      if (acc >= E.DT) acc = 0;
      const pl = state.cars[0];
      S.engine(mode === "race" && !pl.wrecked, Math.hypot(pl.vx, pl.vy), input.throttle);
      if (pendingResultT > 0 && mode === "race") {
        pendingResultT -= dt;
        if (pendingResultT <= 0) showResults();
      }
      drawScene(state, trackLayer, t, true);
    } else {
      // valikko: näytösajo taustalla
      if (!attract) startAttract();
      let steps = 0;
      while (acc >= E.DT && steps < 4) {
        E.step(attract, null);
        handleEvents(attract, true);
        trackSkids(attract);
        acc -= E.DT;
        steps++;
      }
      if (acc >= E.DT) acc = 0;
      if (attract.cars.every((c) => c.finished || c.wrecked) || attract.t > 160) {
        particles = []; skids = []; floaters = [];
        startAttract();
      }
      drawScene(attract, attractLayer, t, false);
      S.engine(false, 0);
    }
    sideTimer -= dt;
    if (sideTimer <= 0) {
      sideTimer = 0.25;
      updateSide(false);
    }
  }

  // ———————————————————————— Kytkennät ————————————————————————
  document.querySelectorAll("#tierPicker button[data-tier]").forEach((b) => {
    b.addEventListener("click", () => startRace(b.dataset.tier));
  });
  $("btnAgain").addEventListener("click", () => startRace(state.tier));
  $("btnResMenu").addEventListener("click", toMenu);
  $("btnAbort").addEventListener("click", abortRace);
  $("btnMenuOpen").addEventListener("click", () => { if (mode === "race") abortRace(); else toMenu(); });
  $("btnFullscreen").addEventListener("click", toggleFullscreen);
  $("btnFsCorner").addEventListener("click", toggleFullscreen);
  $("btnSound").addEventListener("click", () => {
    const on = S.toggle();
    $("btnSound").textContent = on ? "Ääni: päällä" : "Ääni: pois";
    $("btnSound").setAttribute("aria-pressed", String(on));
  });
  document.addEventListener("visibilitychange", () => S.suspend(document.hidden));

  // Vaikeustasokortit: paras sijoitus näkyviin
  function decorateTiers() {
    document.querySelectorAll("#tierPicker button[data-tier]").forEach((b) => {
      const tier = b.dataset.tier;
      const best = career.best[tier];
      const el = b.querySelector(".t-best");
      if (el) el.textContent = best != null ? "paras: " + (best + 1) + "." : "";
    });
  }

  // Smoke-testien käyttöliittymä
  window.RallyUI = {
    get mode() { return mode; },
    get state() { return state; },
    get attract() { return attract; },
    career,
    startRace, toMenu,
    setTestInput(v) { testInput = v; },
  };

  toMenu();
  decorateTiers();
  requestAnimationFrame(frame);
})();
