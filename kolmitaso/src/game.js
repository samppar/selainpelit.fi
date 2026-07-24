"use strict";
// Kolmitaso — käyttöliittymä: renderöinti, äänet, syötteet ja valikot.
(function () {
  const E = window.KolmitasoEngine;
  const $ = (id) => document.getElementById(id);
  const canvas = $("board");
  const ctx = canvas.getContext("2d");
  const VIEW_W = canvas.width, VIEW_H = canvas.height;

  // ———————————————————————— Tallennus ————————————————————————
  const SAVE_KEY = "kolmitaso-v1";
  function loadSave() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (d && d.best) return d;
    } catch (e) {}
    return null;
  }
  const save = loadSave() || { best: {}, done: {} };
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
  }

  // ———————————————————————— Tila ————————————————————————
  let mode = "menu";      // menu | mission | results
  let state = null;
  let attract = null;
  let seedCounter = (Date.now() % 1e9) | 0;
  let camX = 0, camY = 0, shake = 0;
  let pendingResultT = 0, resultShown = false;
  let particles = [], floaters = [];
  let warnT = 0;
  let testInput = null;   // smoke-testien ohjaus

  // ———————————————————————— Äänet ————————————————————————
  const S = (() => {
    let ac = null, master = null, engOsc = null, engOsc2 = null, engGain = null, engFilter = null;
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
    function engine(on, throttle, speed) {
      ensure();
      if (!ac) return;
      if (on && !engOsc) {
        engOsc = ac.createOscillator(); engOsc.type = "sawtooth";
        engOsc2 = ac.createOscillator(); engOsc2.type = "square";
        engFilter = ac.createBiquadFilter(); engFilter.type = "lowpass"; engFilter.frequency.value = 420;
        engGain = ac.createGain(); engGain.gain.value = 0;
        engOsc.connect(engFilter); engOsc2.connect(engFilter);
        engFilter.connect(engGain).connect(master);
        engOsc.start(); engOsc2.start();
      }
      if (engOsc) {
        const f = 42 + throttle * 46 + speed * 0.06;
        engOsc.frequency.setTargetAtTime(f, ac.currentTime, 0.09);
        engOsc2.frequency.setTargetAtTime(f * 0.502, ac.currentTime, 0.09);
        engFilter.frequency.setTargetAtTime(240 + throttle * 420 + speed * 0.8, ac.currentTime, 0.1);
        engGain.gain.setTargetAtTime(on && enabled ? 0.028 + throttle * 0.026 : 0, ac.currentTime, 0.1);
      }
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
      fire: () => noise(0.06, 2600, 0.09),
      hit: () => blip(620, 0.05, "square", 0.06),
      flak: () => noise(0.12, 900, 0.10),
      boom: (big) => { noise(big ? 0.7 : 0.4, big ? 260 : 380, big ? 0.34 : 0.22); blip(big ? 120 : 170, 0.5, "sine", 0.2, 40); },
      bombDrop: () => blip(880, 0.5, "sine", 0.05, 220),
      service: () => { blip(660, 0.1, "triangle", 0.1); setTimeout(() => blip(880, 0.14, "triangle", 0.1), 90); },
      land: () => noise(0.16, 600, 0.08),
      warn: () => blip(520, 0.16, "square", 0.07, 420),
      spawn: () => blip(300, 0.2, "sawtooth", 0.05, 200),
      win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.2, "triangle", 0.12), i * 120)),
      lose: () => [392, 330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.25, "triangle", 0.11), i * 140)),
      engine,
      toggle() { enabled = !enabled; if (!enabled && engGain && ac) engGain.gain.setTargetAtTime(0, ac.currentTime, 0.05); return enabled; },
      get enabled() { return enabled; },
      ensure,
    };
  })();

  // ———————————————————————— Koristeet (seedatut) ————————————————————————
  // Puut, pensaat ja pilvet lasketaan kerran per tehtävä.
  function makeDecor(st) {
    const tr = st.terrain;
    const rng = E.mulberry32(st.def.seed * 1013 + 7);
    const trees = [];
    for (let i = 0; i < tr.W / 34; i++) {
      const x = rng() * tr.W;
      if (E.onRunway(tr, x, null) || E.onRunway(tr, x - 40, null) || E.onRunway(tr, x + 40, null)) continue;
      let nearStruct = false;
      for (const s of st.structures) if (Math.abs(s.x - x) < s.w) nearStruct = true;
      if (nearStruct) continue;
      trees.push({
        x, y: E.groundY(tr, x),
        h: 26 + rng() * 34, w: 12 + rng() * 12,
        kind: rng() < 0.72 ? "pine" : "bush",
        tint: 0.82 + rng() * 0.36,
      });
    }
    const clouds = [];
    for (let i = 0; i < 13; i++) {
      clouds.push({
        x: rng() * tr.W * 1.2, y: 40 + rng() * 360,
        r: 22 + rng() * 34, depth: 0.25 + rng() * 0.45,
        puffs: 3 + Math.floor(rng() * 3), ps: rng() * 10,
      });
    }
    const ridges = [];
    for (let i = 0; i < 40; i++) ridges.push(rng());
    return { trees, clouds, ridges };
  }
  let decor = null, attractDecor = null;

  // ———————————————————————— Piirto ————————————————————————
  function drawScene(st, dec, tNow, showHud) {
    const th = st.def.theme;
    const tr = st.terrain;
    const p = E.playerOf(st);
    // Kamera seuraa pelaajaa pienellä ennakolla
    if (p && !p.dead) {
      const facing = Math.cos(p.ang) >= 0 ? 1 : -1;
      const tx = p.x + facing * 130 - VIEW_W / 2;
      const ty = p.y - VIEW_H * 0.44;
      camX += (tx - camX) * 0.08;
      camY += (ty - camY) * 0.08;
    }
    camX = E.clamp(camX, 0, tr.W - VIEW_W);
    camY = E.clamp(camY, -80, tr.H - VIEW_H);
    let ox = camX, oy = camY;
    if (shake > 0) {
      ox += (Math.random() - 0.5) * shake;
      oy += (Math.random() - 0.5) * shake;
      shake = Math.max(0, shake - 0.9);
    }

    // Taivas
    const sky = ctx.createLinearGradient(0, -oy * 0.3, 0, VIEW_H);
    sky.addColorStop(0, th.skyTop);
    sky.addColorStop(0.55, th.skyMid);
    sky.addColorStop(1, th.skyLow);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    // Aurinko
    const sunX = th.sunX * VIEW_W - ox * 0.04, sunY = th.sunY * VIEW_H - oy * 0.08;
    const sg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 120);
    sg.addColorStop(0, th.sun);
    sg.addColorStop(0.25, th.sun + "88");
    sg.addColorStop(1, "transparent");
    ctx.fillStyle = sg;
    ctx.fillRect(sunX - 130, sunY - 130, 260, 260);
    ctx.beginPath();
    ctx.arc(sunX, sunY, 26, 0, 7);
    ctx.fillStyle = th.sun;
    ctx.fill();

    // Kaukoharjanne (parallaksi, ankkuroitu horisonttiin)
    const horizon = E.clamp(1050 - oy * 0.9, VIEW_H * 0.35, VIEW_H + 60);
    ctx.fillStyle = th.far + "55";
    ctx.beginPath();
    ctx.moveTo(0, VIEW_H + 60);
    for (let i = 0; i <= 40; i++) {
      const rx = (i / 40) * VIEW_W;
      const wx = (rx + ox * 0.3) * 0.01;
      const r = dec.ridges[i % dec.ridges.length];
      const y = horizon - 30 - r * 70 - Math.sin(wx + r * 9) * 26;
      ctx.lineTo(rx, y);
    }
    ctx.lineTo(VIEW_W, VIEW_H + 60);
    ctx.closePath();
    ctx.fill();

    // Pilvet (takakerros)
    for (const c of dec.clouds) {
      if (c.depth > 0.45) continue;
      drawCloud(c, ox, oy, th, tNow);
    }

    ctx.save();
    ctx.translate(-ox, -oy);

    // Maasto
    const x0 = Math.floor(ox / tr.step) * tr.step - tr.step;
    const x1 = ox + VIEW_W + tr.step * 2;
    ctx.beginPath();
    ctx.moveTo(x0, tr.H + 50);
    for (let x = x0; x <= x1; x += tr.step) ctx.lineTo(x, E.groundY(tr, x));
    ctx.lineTo(x1, tr.H + 50);
    ctx.closePath();
    const gg = ctx.createLinearGradient(0, oy + VIEW_H * 0.3, 0, oy + VIEW_H + 100);
    gg.addColorStop(0, th.hill);
    gg.addColorStop(0.4, th.ground);
    gg.addColorStop(1, th.dirt);
    ctx.fillStyle = gg;
    ctx.fill();
    // Nurmen reunaviiva
    ctx.beginPath();
    for (let x = x0; x <= x1; x += tr.step) {
      const y = E.groundY(tr, x);
      if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#ffffff22";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Kiitoradat
    for (const rw of tr.runways) {
      ctx.fillStyle = "#3a3a34";
      ctx.fillRect(rw.x0, rw.y - 4, rw.x1 - rw.x0, 8);
      ctx.fillStyle = "#2e2e29";
      ctx.fillRect(rw.x0, rw.y - 1, rw.x1 - rw.x0, 5);
      ctx.fillStyle = "#e8e2ce";
      for (let x = rw.x0 + 14; x < rw.x1 - 20; x += 44) ctx.fillRect(x, rw.y - 2, 20, 2);
      // Tuulipussi omalle kentälle
      if (rw.side === 0) {
        const px2 = rw.x0 - 26;
        ctx.strokeStyle = "#d8d2be";
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px2, rw.y); ctx.lineTo(px2, rw.y - 34); ctx.stroke();
        ctx.fillStyle = "#e08434";
        ctx.beginPath();
        ctx.moveTo(px2, rw.y - 34);
        ctx.lineTo(px2 + 22 + Math.sin(tNow * 2) * 3, rw.y - 30);
        ctx.lineTo(px2, rw.y - 26);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Puut
    for (const t of dec.trees) {
      if (t.x < ox - 60 || t.x > ox + VIEW_W + 60) continue;
      drawTree(t, th);
    }

    // Rakennukset
    for (const s of st.structures) {
      if (s.x < ox - 160 || s.x > ox + VIEW_W + 160) continue;
      drawStructure(s, tNow, th);
    }

    // Pommit
    for (const b of st.bombs) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.ang);
      ctx.fillStyle = "#2c2f33";
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 3, 0, 0, 7);
      ctx.fill();
      ctx.fillStyle = "#4a4f55";
      ctx.fillRect(-8, -1.5, 3, 3);
      ctx.restore();
    }
    // It-kranaatit
    ctx.fillStyle = "#f4e9c8";
    for (const sh of st.shells) {
      ctx.beginPath();
      ctx.arc(sh.x, sh.y, 2.4, 0, 7);
      ctx.fill();
    }
    // Luodit (valojuovat)
    ctx.lineWidth = 2;
    for (const b of st.bullets) {
      ctx.strokeStyle = b.side === 0 ? "#ffe9b0" : "#ffb9a0";
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.stroke();
    }

    // Koneet
    for (const q of st.planes) drawPlane(q, tNow);

    // Hiukkaset
    for (const pa of particles) {
      ctx.globalAlpha = E.clamp(pa.life / pa.life0, 0, 1) * (pa.alpha || 1);
      ctx.fillStyle = pa.color;
      ctx.beginPath();
      ctx.arc(pa.x, pa.y, pa.r * (pa.grow ? (2 - pa.life / pa.life0) : 1), 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // Leijuvat tekstit
    ctx.textAlign = "center";
    ctx.font = "600 15px Barlow, sans-serif";
    for (const f of floaters) {
      ctx.globalAlpha = E.clamp(f.life / 1.4, 0, 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Pilvet (etukerros)
    for (const c of dec.clouds) {
      if (c.depth <= 0.45) continue;
      drawCloud(c, ox, oy, th, tNow);
    }

    if (showHud) drawHud(st, tNow);
  }

  function drawCloud(c, ox, oy, th, tNow) {
    const drift = tNow * (4 + c.depth * 8);
    const span = VIEW_W + 400;
    const wx = ((((c.x - ox * c.depth + drift) % span) + span) % span) - 200;
    const wy = c.y - oy * c.depth * 0.6;
    ctx.globalAlpha = 0.2 + c.depth * 0.3;
    ctx.fillStyle = th.cloud;
    for (let i = 0; i < c.puffs; i++) {
      const a = c.ps + i * 2.1;
      ctx.beginPath();
      ctx.arc(wx + Math.cos(a) * c.r * 0.55, wy + Math.sin(a) * c.r * 0.2, c.r * (0.5 + ((i * 37 + c.ps * 13) % 10) / 22), 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawTree(t, th) {
    ctx.fillStyle = "#3a2c1e";
    ctx.fillRect(t.x - 1.6, t.y - t.h * 0.4, 3.2, t.h * 0.4);
    const shade = (hex, f) => {
      const n = parseInt(hex.slice(1), 16);
      const r = E.clamp(((n >> 16) & 255) * f, 0, 255) | 0;
      const g = E.clamp(((n >> 8) & 255) * f, 0, 255) | 0;
      const b = E.clamp((n & 255) * f, 0, 255) | 0;
      return `rgb(${r},${g},${b})`;
    };
    ctx.fillStyle = shade(th.hill, t.tint);
    if (t.kind === "pine") {
      for (let k = 0; k < 3; k++) {
        const w = t.w * (1 - k * 0.24), yy = t.y - t.h * 0.34 - k * t.h * 0.22;
        ctx.beginPath();
        ctx.moveTo(t.x - w / 2, yy);
        ctx.lineTo(t.x + w / 2, yy);
        ctx.lineTo(t.x, yy - t.h * 0.34);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.beginPath();
      ctx.arc(t.x, t.y - t.h * 0.5, t.w * 0.75, 0, 7);
      ctx.arc(t.x - t.w * 0.45, t.y - t.h * 0.34, t.w * 0.5, 0, 7);
      ctx.arc(t.x + t.w * 0.45, t.y - t.h * 0.34, t.w * 0.5, 0, 7);
      ctx.fill();
    }
  }

  function drawStructure(s, tNow, th) {
    const dead = s.hp <= 0;
    ctx.save();
    ctx.translate(s.x, s.y);
    if (s.type === "halli") {
      if (dead) {
        ctx.fillStyle = "#33302a";
        ctx.beginPath();
        ctx.moveTo(-s.w / 2, 0);
        ctx.lineTo(-s.w * 0.3, -12);
        ctx.lineTo(-s.w * 0.05, -4);
        ctx.lineTo(s.w * 0.2, -14);
        ctx.lineTo(s.w / 2, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = "#5c5548";
        ctx.beginPath();
        ctx.moveTo(-s.w / 2, 0);
        ctx.lineTo(-s.w / 2, -s.h * 0.55);
        ctx.quadraticCurveTo(0, -s.h * 1.5, s.w / 2, -s.h * 0.55);
        ctx.lineTo(s.w / 2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#494337";
        ctx.fillRect(-s.w * 0.18, -s.h * 0.72, s.w * 0.36, s.h * 0.72);
        ctx.strokeStyle = "#3a352c";
        ctx.lineWidth = 2;
        for (let k = -2; k <= 2; k++) {
          ctx.beginPath();
          ctx.moveTo(k * s.w * 0.16, -s.h * 0.6 - Math.abs(k) * -2);
          ctx.lineTo(k * s.w * 0.16, 0);
          ctx.stroke();
        }
        // vihollislippu
        ctx.strokeStyle = "#d8d2be";
        ctx.beginPath(); ctx.moveTo(s.w * 0.42, -s.h * 0.55); ctx.lineTo(s.w * 0.42, -s.h * 1.25); ctx.stroke();
        ctx.fillStyle = "#c03a30";
        ctx.fillRect(s.w * 0.42, -s.h * 1.25, 16, 9);
      }
    } else if (s.type === "varikko") {
      if (dead) {
        ctx.fillStyle = "#38332b";
        ctx.beginPath();
        ctx.moveTo(-s.w / 2, 0); ctx.lineTo(-s.w * 0.15, -8); ctx.lineTo(s.w * 0.3, -3); ctx.lineTo(s.w / 2, 0);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = "#6e5f42";
        ctx.beginPath();
        ctx.moveTo(-s.w / 2, 0);
        ctx.lineTo(0, -s.h);
        ctx.lineTo(s.w / 2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#57492f";
        ctx.beginPath();
        ctx.moveTo(-s.w * 0.12, 0);
        ctx.lineTo(0, -s.h * 0.6);
        ctx.lineTo(s.w * 0.12, 0);
        ctx.closePath();
        ctx.fill();
      }
    } else if (s.type === "it") {
      // jalusta
      ctx.fillStyle = dead ? "#3a362e" : "#4c463a";
      ctx.fillRect(-s.w / 2, -s.h * 0.4, s.w, s.h * 0.4);
      ctx.beginPath();
      ctx.arc(0, -s.h * 0.4, s.w * 0.32, Math.PI, 0);
      ctx.fill();
      if (!dead) {
        // piippu tähtää
        ctx.strokeStyle = "#2e2b24";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, -s.h * 0.5);
        ctx.lineTo(Math.cos(s.aim || -1.2) * 24, -s.h * 0.5 + Math.sin(s.aim || -1.2) * 24);
        ctx.stroke();
      } else {
        ctx.strokeStyle = "#2b2822";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -s.h * 0.45);
        ctx.lineTo(10, -s.h * 0.1);
        ctx.stroke();
      }
    }
    // savua raunioista
    if (dead && Math.random() < 0.12) {
      particles.push({
        x: s.x + (Math.random() - 0.5) * s.w * 0.5, y: s.y - 6,
        vx: (Math.random() - 0.5) * 6, vy: -14 - Math.random() * 10,
        r: 4 + Math.random() * 5, life: 1.6, life0: 1.6, color: "#55534d", alpha: 0.5, grow: true,
      });
    }
    ctx.restore();
    void tNow; void th;
  }

  function drawPlane(p, tNow) {
    if (p.dead && p.onGround) return; // hylky poistuu
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.ang);
    ctx.scale(1.25, p.flipped ? -1.25 : 1.25);
    const own = p.side === 0;
    const body = own ? "#7a7f58" : "#8a4a42";
    const bodyHi = own ? "#9aa070" : "#a86054";
    const wing = own ? "#8f956a" : "#9c554b";
    // savuvana vaurioista
    if (!p.dead && p.hp < p.maxHp * 0.45 && Math.random() < 0.5) {
      particles.push({
        x: p.x - Math.cos(p.ang) * 16, y: p.y - Math.sin(p.ang) * 16,
        vx: -Math.cos(p.ang) * 20, vy: -Math.sin(p.ang) * 20 - 8,
        r: 3 + Math.random() * 3, life: 0.9, life0: 0.9,
        color: p.hp < p.maxHp * 0.22 ? "#3a3a3a" : "#6c6c66", alpha: 0.6, grow: true,
      });
    }
    if (p.dead) {
      // palava hylky
      particles.push({
        x: p.x, y: p.y, vx: (Math.random() - 0.5) * 30, vy: -20,
        r: 3 + Math.random() * 4, life: 0.7, life0: 0.7,
        color: Math.random() < 0.5 ? "#e88434" : "#4a4a4a", alpha: 0.8, grow: true,
      });
    }
    // runko
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(17, 0);
    ctx.quadraticCurveTo(10, -4.5, -6, -3.6);
    ctx.lineTo(-16, -1.8);
    ctx.lineTo(-16, 1.8);
    ctx.lineTo(-6, 3.6);
    ctx.quadraticCurveTo(10, 4.5, 17, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = bodyHi;
    ctx.fillRect(-6, -3.4, 14, 2.2);
    // sivuperäsin + korkeusperäsin
    ctx.fillStyle = wing;
    ctx.beginPath();
    ctx.moveTo(-13, -1);
    ctx.lineTo(-19, -8);
    ctx.lineTo(-16.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-19, -0.6, 7, 1.6);
    // kolme siipitasoa tukineen
    ctx.fillStyle = wing;
    ctx.fillRect(-4, -9.5, 13, 2.1);
    ctx.fillRect(-5.5, -3.2, 15, 2.1);
    ctx.fillRect(-4, 3.2, 12, 2.1);
    ctx.strokeStyle = "#3f3a2c";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-1, -8); ctx.lineTo(-2, 4.6);
    ctx.moveTo(6.5, -8); ctx.lineTo(5.5, 4.6);
    ctx.stroke();
    // ohjaamo
    ctx.fillStyle = "#2c2a22";
    ctx.beginPath();
    ctx.arc(1.5, -4.4, 2.2, Math.PI, 0);
    ctx.fill();
    // kokardi
    ctx.beginPath();
    ctx.arc(-9, 0.2, 3, 0, 7);
    ctx.fillStyle = own ? "#e8e2ce" : "#e8e2ce";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-9, 0.2, 1.7, 0, 7);
    ctx.fillStyle = own ? "#3e6fae" : "#c03a30";
    ctx.fill();
    // laskuteline
    ctx.strokeStyle = "#3f3a2c";
    ctx.beginPath();
    ctx.moveTo(4, 4.4); ctx.lineTo(6, 9.5);
    ctx.moveTo(9, 3.4); ctx.lineTo(6.5, 9.5);
    ctx.stroke();
    ctx.fillStyle = "#22201b";
    ctx.beginPath(); ctx.arc(6.2, 10.4, 2.6, 0, 7); ctx.fill();
    // potkuri
    if (!p.dead && p.throttle > 0.03) {
      ctx.fillStyle = "#d8d2be55";
      const ph = 8 + Math.sin(tNow * 60 + p.id) * 3;
      ctx.fillRect(17.5, -ph, 2.2, ph * 2);
    } else {
      ctx.fillStyle = "#4a443a";
      ctx.fillRect(17.5, -6, 2.2, 12);
    }
    ctx.restore();
  }

  // ———————————————————————— HUD ————————————————————————
  function drawHud(st, tNow) {
    const p = E.playerOf(st);
    if (!p) return;
    const H = 66, Y = VIEW_H - H;
    ctx.fillStyle = "#0d111abf";
    ctx.fillRect(0, Y, VIEW_W, H);
    ctx.strokeStyle = "#ffffff1e";
    ctx.beginPath(); ctx.moveTo(0, Y); ctx.lineTo(VIEW_W, Y); ctx.stroke();

    const bar = (x, label, val, max, color, warn) => {
      ctx.font = "700 10px Barlow, sans-serif";
      ctx.textAlign = "left";
      ctx.fillStyle = "#94a0ac";
      ctx.fillText(label, x, Y + 16);
      ctx.fillStyle = "#ffffff16";
      ctx.fillRect(x, Y + 22, 110, 9);
      const f = E.clamp(val / max, 0, 1);
      ctx.fillStyle = warn && f < 0.25 && Math.sin(tNow * 8) > 0 ? "#e5484d" : color;
      ctx.fillRect(x, Y + 22, 110 * f, 9);
    };
    bar(16, "KAASU", p.throttle, 1, "#e8a44c");
    bar(142, "POLTTOAINE", p.fuel, 100, "#74c69d", true);
    bar(268, "KUNTO", p.hp, p.maxHp, "#7fb4e0", true);
    // Ammukset ja pommit
    ctx.fillStyle = "#94a0ac";
    ctx.fillText("AMMUKSET", 394, Y + 16);
    ctx.fillStyle = p.ammo === 0 ? "#e5484d" : "#ece5d3";
    ctx.font = "700 15px Barlow, sans-serif";
    ctx.fillText(String(p.ammo), 394, Y + 33);
    ctx.font = "700 10px Barlow, sans-serif";
    ctx.fillStyle = "#94a0ac";
    ctx.fillText("POMMIT", 470, Y + 16);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i < p.bombs ? "#ece5d3" : "#ffffff1c";
      ctx.beginPath();
      ctx.ellipse(476 + i * 15, Y + 27, 5, 3.4, 0.5, 0, 7);
      ctx.fill();
    }
    // Koneet jäljellä
    ctx.fillStyle = "#94a0ac";
    ctx.fillText("KONEET", 396, Y + 48);
    for (let i = 0; i < E.LIVES; i++) {
      ctx.fillStyle = i < st.lives ? "#e8a44c" : "#ffffff1c";
      ctx.beginPath();
      ctx.moveTo(452 + i * 18, Y + 46);
      ctx.lineTo(452 + i * 18 + 11, Y + 46);
      ctx.lineTo(452 + i * 18 + 5.5, Y + 41);
      ctx.closePath();
      ctx.fill();
    }
    // Mittarit oikealle
    const speed = Math.hypot(p.vx, p.vy);
    const alt = Math.max(0, Math.round((E.groundY(st.terrain, p.x) - p.y - E.WHEEL_H) / 3));
    ctx.textAlign = "right";
    ctx.font = "700 10px Barlow, sans-serif";
    ctx.fillStyle = "#94a0ac";
    ctx.fillText("NOPEUS", VIEW_W - 96, Y + 16);
    ctx.fillText("KORKEUS", VIEW_W - 16, Y + 16);
    ctx.font = "700 17px Barlow, sans-serif";
    ctx.fillStyle = speed < E.STALL * 1.15 && !p.onGround ? (Math.sin(tNow * 9) > 0 ? "#e5484d" : "#ece5d3") : "#ece5d3";
    ctx.fillText(String(Math.round(speed)), VIEW_W - 96, Y + 35);
    ctx.fillStyle = "#ece5d3";
    ctx.fillText(String(alt) + " m", VIEW_W - 16, Y + 35);
    // Sakkausvaroitus
    if (!p.onGround && !p.dead && speed < E.STALL * 1.1) {
      ctx.textAlign = "center";
      ctx.font = "700 13px Barlow, sans-serif";
      ctx.fillStyle = Math.sin(tNow * 9) > 0 ? "#e5484d" : "#e5484d66";
      ctx.fillText("SAKKAUS!", VIEW_W / 2, Y - 12);
    }
    // Tutka: maailman poikkileikkaus
    const RX = VIEW_W - 226, RY = Y + 42, RW = 210, RH = 14;
    ctx.textAlign = "left";
    ctx.fillStyle = "#ffffff10";
    ctx.fillRect(RX, RY, RW, RH);
    ctx.strokeStyle = "#ffffff22";
    ctx.strokeRect(RX + 0.5, RY + 0.5, RW - 1, RH - 1);
    const mx = (wx) => RX + (wx / st.terrain.W) * RW;
    for (const rw of st.terrain.runways) {
      ctx.fillStyle = rw.side === 0 ? "#74c69d88" : "#e5484d55";
      ctx.fillRect(mx(rw.x0), RY + RH - 4, mx(rw.x1) - mx(rw.x0), 3);
    }
    for (const s of st.structures) {
      if (!s.target) continue;
      ctx.fillStyle = s.hp > 0 ? "#e5484d" : "#4a4a44";
      ctx.fillRect(mx(s.x) - 1.5, RY + RH - 7, 3, 5);
    }
    for (const q of st.planes) {
      if (q.dead) continue;
      ctx.fillStyle = q.isPlayer ? "#ffffff" : "#ff9c6a";
      ctx.fillRect(mx(q.x) - 1.5, RY + 3, 3, 3);
    }
    // huoltoviesti
    if (p.onGround && !p.dead) {
      const rw = E.onRunway(st.terrain, p.x, 0);
      if (rw && Math.abs(p.vx) < 4 && (p.fuel < 100 || p.ammo < 120 || p.hp < p.maxHp || p.bombs < 4)) {
        ctx.textAlign = "center";
        ctx.font = "700 13px Barlow, sans-serif";
        ctx.fillStyle = "#74c69d";
        ctx.fillText("HUOLTO KÄYNNISSÄ…", VIEW_W / 2, Y - 12);
      }
    }
  }

  // ———————————————————————— Tapahtumat ————————————————————————
  function burst(x, y, n, colors, speed, life) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 7, v = speed * (0.3 + Math.random());
      particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30,
        r: 2 + Math.random() * 4, life: life * (0.5 + Math.random() * 0.8), life0: life,
        color: colors[(Math.random() * colors.length) | 0],
      });
    }
  }
  function handleEvents(st, quiet) {
    for (const ev of st.events) {
      switch (ev.type) {
        case "laukaus":
          if (!quiet && ev.plane === 0) S.fire();
          break;
        case "osuma":
          if (!quiet) S.hit();
          burst(ev.x, ev.y, 3, ["#ffe9b0", "#e8a44c"], 60, 0.4);
          break;
        case "rakenneosuma":
          burst(ev.x, ev.y, 3, ["#c9c2ae", "#8a8474"], 50, 0.4);
          break;
        case "pommi":
          if (!quiet && ev.plane === 0) S.bombDrop();
          break;
        case "rajahdys":
          if (!quiet) S.boom(ev.r > 60);
          burst(ev.x, ev.y, 26, ["#e88434", "#f4c684", "#4a4a4a", "#8a8474"], 160, 1.0);
          particles.push({ x: ev.x, y: ev.y, vx: 0, vy: 0, r: ev.r * 0.5, life: 0.3, life0: 0.3, color: "#f4e9c8", alpha: 0.7, grow: true });
          shake = Math.max(shake, 9);
          break;
        case "flak":
          if (!quiet) S.flak();
          burst(ev.x, ev.y, 8, ["#55534d", "#7a776e", "#3a3a38"], 50, 0.8);
          break;
        case "it-laukaus":
          burst(ev.x, ev.y, 2, ["#f4e9c8"], 30, 0.2);
          break;
        case "kaatui":
          if (!quiet) S.boom(true);
          burst(ev.x, ev.y, 30, ["#e88434", "#f4c684", "#3a3a3a"], 180, 1.1);
          shake = Math.max(shake, 12);
          if (!quiet && ev.by === 0) addFloater(ev.x, ev.y - 24, "Pudotus!", "#e8a44c");
          break;
        case "maahansyoksy":
          shake = Math.max(shake, 8);
          break;
        case "noussut":
          break;
        case "laskeutui":
          if (!quiet && ev.plane === 0) { S.land(); if (ev.own) toast("Laskeuduit — pysähdy, niin mekaanikot hoitavat loput"); }
          break;
        case "huollettu":
          if (!quiet) { S.service(); toast("Kone huollettu — täydet tankit ja pommit!"); }
          break;
        case "vihollinen":
          if (!quiet) S.spawn();
          break;
        case "tuhottu":
          if (!quiet) {
            const names = { halli: "Halli", varikko: "Varikko", it: "It-tykki" };
            addFloater(ev.x, ev.y - 20, (names[ev.struct] || "Maali") + " tuhottu!", "#f4c684");
            const left = E.targetsLeft(st);
            if (left > 0) toast(`${names[ev.struct] || "Maali"} tuhottu — ${left} maalia jäljellä`);
          }
          break;
        case "uusikone":
          if (!quiet) toast(`Uusi kone valmiina — ${ev.lives} jäljellä`);
          break;
        case "voitto":
          if (!quiet) { S.win(); pendingResultT = 2.2; }
          break;
        case "tappio":
          if (!quiet) { S.lose(); pendingResultT = 2.2; }
          break;
      }
    }
  }
  function addFloater(x, y, text, color) {
    floaters.push({ x, y, text, color, life: 1.6 });
  }

  function stepParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const pa = particles[i];
      pa.x += pa.vx * dt; pa.y += pa.vy * dt;
      pa.vy += (pa.grow ? -14 : 60) * dt;
      pa.life -= dt;
      if (pa.life <= 0) particles.splice(i, 1);
    }
    if (particles.length > 500) particles.splice(0, particles.length - 500);
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.y -= 26 * dt;
      f.life -= dt;
      if (f.life <= 0) floaters.splice(i, 1);
    }
  }

  // ———————————————————————— Syötteet ————————————————————————
  const keys = {};
  const touch = { ccw: false, cw: false, up: false, down: false, fire: false };
  let bombTap = false, flipTap = false;
  window.addEventListener("keydown", (e) => {
    if (e.repeat) { if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault(); return; }
    keys[e.key.toLowerCase()] = true;
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(e.key.toLowerCase())) e.preventDefault();
    if (e.key === " ") keys.space = true;
    if (e.key.toLowerCase() === "f") toggleFullscreen();
    if (e.key === "Escape" && mode === "mission") abortMission();
    S.ensure();
  });
  window.addEventListener("keyup", (e) => {
    keys[e.key.toLowerCase()] = false;
    if (e.key === " ") keys.space = false;
  });
  function bindHold(id, prop) {
    const el = $(id);
    const on = (e) => { e.preventDefault(); touch[prop] = true; S.ensure(); };
    const off = (e) => { e.preventDefault(); touch[prop] = false; };
    el.addEventListener("pointerdown", on);
    el.addEventListener("pointerup", off);
    el.addEventListener("pointercancel", off);
    el.addEventListener("pointerleave", off);
  }
  bindHold("tCcw", "ccw");
  bindHold("tCw", "cw");
  bindHold("tPowUp", "up");
  bindHold("tPowDown", "down");
  bindHold("tFire", "fire");
  $("tBomb").addEventListener("pointerdown", (e) => { e.preventDefault(); bombTap = true; S.ensure(); });
  $("tFlip").addEventListener("pointerdown", (e) => { e.preventDefault(); flipTap = true; S.ensure(); });

  function readInput() {
    if (testInput) return testInput;
    let pitch = 0, power = 0;
    if (keys.arrowleft || keys.a || touch.ccw) pitch -= 1;
    if (keys.arrowright || keys.d || touch.cw) pitch += 1;
    if (keys.arrowup || keys.w || touch.up) power += 1;
    if (keys.arrowdown || keys.s || touch.down) power -= 1;
    const input = {
      pitch, power,
      fire: !!(keys.space || touch.fire),
      bomb: !!(keys.b || bombTap),
      flip: !!(keys.x || flipTap),
    };
    bombTap = false; flipTap = false;
    return input;
  }

  // ———————————————————————— Pelinohjaus ————————————————————————
  function startMission(missionId) {
    state = E.createMission({ missionId, seed: seedCounter++ });
    decor = makeDecor(state);
    particles = []; floaters = [];
    mode = "mission";
    resultShown = false;
    pendingResultT = 0;
    const p = E.playerOf(state);
    camX = E.clamp(p.x - VIEW_W / 2, 0, state.terrain.W - VIEW_W);
    camY = E.clamp(p.y - VIEW_H * 0.5, 0, state.terrain.H - VIEW_H);
    hideOverlay();
    updateSide(true);
    toast("Täysi kaasu (↑) ja vedä nokka ylös (←) — tuhoa punaiset maalit");
    S.ensure();
  }
  function startAttract() {
    attract = E.createMission({ missionId: "laakso", seed: (seedCounter++ % 7) + 3, autopilot: true });
    attractDecor = makeDecor(attract);
    const p = E.playerOf(attract);
    p.onGround = false;
    p.x = attract.terrain.W * 0.35; p.y = 380;
    p.vx = 220; p.vy = 0; p.throttle = 1;
    camX = p.x - VIEW_W / 2;
    camY = p.y - VIEW_H * 0.5;
  }
  function toMenu() {
    mode = "menu";
    state = null;
    startAttract();
    decorateMissions();
    $("menuSection").style.display = "";
    $("resultsSection").style.display = "none";
    $("overlay").classList.add("show");
    updateSide(true);
  }
  function abortMission() {
    if (mode !== "mission") return;
    toMenu();
  }
  function hideOverlay() {
    $("overlay").classList.remove("show");
  }
  function fmtTime(t) {
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return m + ":" + String(s).padStart(2, "0");
  }
  function showResults() {
    if (resultShown || !state) return;
    resultShown = true;
    const res = E.result(state);
    const win = res.outcome === "voitto";
    mode = "results";
    const title = $("resTitle");
    title.textContent = win ? "Tehtävä suoritettu!" : "Tehtävä epäonnistui";
    title.className = "res-title " + (win ? "win" : "out");
    $("resSub").textContent = win
      ? "Vihollisen tukikohta on raunioina."
      : "Kaikki koneet menetetty — lentue vetäytyy.";
    const rows = [];
    rows.push(["Aika", fmtTime(res.time)]);
    rows.push(["Maalit tuhottu", res.targetsDestroyed + " / " + res.targetsTotal]);
    rows.push(["Pudotukset", String(res.kills)]);
    rows.push(["Pommeja pudotettu", String(res.bombsDropped)]);
    rows.push(["Koneita menetetty", String(res.planesLost)]);
    let bestNote = "";
    if (win) {
      const id = state.def.id;
      const prev = save.best[id];
      if (prev == null || res.time < prev) {
        save.best[id] = Math.round(res.time * 10) / 10;
        bestNote = prev == null ? "Ensimmäinen läpäisy!" : "Uusi ennätys!";
      }
      save.done[id] = true;
      persist();
    }
    $("resRows").innerHTML =
      rows.map(([k, v]) => `<div class="r"><span>${k}</span><b>${v}</b></div>`).join("") +
      (bestNote ? `<div class="r hl"><span>${bestNote}</span><b>${fmtTime(res.time)}</b></div>` : "");
    // Seuraava tehtävä -nappi
    const idx = E.MISSIONS.findIndex((m) => m.id === state.def.id);
    const next = win && idx >= 0 && idx < E.MISSIONS.length - 1 ? E.MISSIONS[idx + 1] : null;
    $("btnNext").style.display = next ? "" : "none";
    if (next) $("btnNext").onclick = () => startMission(next.id);
    $("menuSection").style.display = "none";
    $("resultsSection").style.display = "";
    $("overlay").classList.add("show");
  }

  // ———————————————————————— Sivupaneeli ————————————————————————
  let sideTimer = 0;
  function updateSide(force) {
    const st = mode === "mission" || mode === "results" ? state : null;
    const chip = $("missionChip");
    if (st) {
      chip.innerHTML = `<b>${st.def.name}</b><br>${st.def.sub}`;
    } else {
      chip.innerHTML = "Valitse tehtävä valikosta.";
    }
    const list = $("targetList");
    if (!st) {
      list.innerHTML = `<div class="row"><span class="ic">✈</span><span class="nm">Ei tehtävää käynnissä</span></div>`;
      return;
    }
    const icons = { halli: "▛", varikko: "▲", it: "☗" };
    const names = { halli: "Halli", varikko: "Varikko", it: "It-tykki" };
    const rows = [];
    let n = { halli: 0, varikko: 0, it: 0 };
    for (const s of st.structures) {
      if (!s.target) continue;
      n[s.type]++;
      const down = s.hp <= 0;
      rows.push(
        `<div class="row${down ? " down" : ""}"><span class="ic">${icons[s.type] || "■"}</span>` +
        `<span class="nm">${names[s.type] || s.type} ${n[s.type]}</span>` +
        (down ? `<span class="st">tuhottu</span>` :
          `<span class="bar"><i style="width:${Math.round((s.hp / s.maxHp) * 100)}%"></i></span>`) +
        `</div>`
      );
    }
    list.innerHTML = rows.join("");
    void force;
  }

  // ———————————————————————— Koko ruutu ja toast ————————————————————————
  function toggleFullscreen() {
    const el = document.querySelector(".board-frame");
    if (!document.fullscreenElement) el.requestFullscreen && el.requestFullscreen();
    else document.exitFullscreen && document.exitFullscreen();
  }
  let toastTimer = null;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  // ———————————————————————— Valikko ————————————————————————
  function decorateMissions() {
    const picker = $("missionPicker");
    picker.innerHTML = "";
    const tierNames = { helppo: "Helppo", keski: "Keskitaso", vaikea: "Vaikea" };
    E.MISSIONS.forEach((m) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.mission = m.id;
      const best = save.best[m.id];
      b.innerHTML =
        `<span class="m-name">${m.name}<small>${m.sub}</small>` +
        `<small class="m-best">${best != null ? "paras aika: " + fmtTime(best) : ""}</small></span>` +
        `<span class="m-tier t-${m.tier}">${tierNames[m.tier] || m.tier}</span>`;
      b.addEventListener("click", () => startMission(m.id));
      picker.appendChild(b);
    });
  }

  // ———————————————————————— Pääsilmukka ————————————————————————
  let last = 0, acc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    const t = ts / 1000;
    const dt = Math.min(0.1, t - last || 0.016);
    last = t;
    acc += dt;
    if (mode === "mission" || mode === "results") {
      const input = readInput();
      let steps = 0;
      while (acc >= E.DT && steps < 4) {
        E.step(state, input);
        handleEvents(state, false);
        acc -= E.DT;
        steps++;
      }
      if (acc >= E.DT) acc = 0;
      const p = E.playerOf(state);
      S.engine(mode === "mission" && p && !p.dead, p ? p.throttle : 0, p ? Math.hypot(p.vx, p.vy) : 0);
      // varoituspiippaus
      if (p && !p.dead && mode === "mission") {
        if ((p.fuel < 22 && p.fuel > 0) || p.hp < 28) {
          warnT -= dt;
          if (warnT <= 0) { warnT = 1.6; S.warn(); if (p.fuel < 22) toast("Polttoaine vähissä — laskeudu omalle kentälle!"); }
        }
      }
      if (pendingResultT > 0) {
        pendingResultT -= dt;
        if (pendingResultT <= 0) showResults();
      }
      stepParticles(dt);
      drawScene(state, decor, t, true);
    } else {
      if (!attract) startAttract();
      let steps = 0;
      while (acc >= E.DT && steps < 4) {
        E.step(attract, null);
        handleEvents(attract, true);
        acc -= E.DT;
        steps++;
      }
      if (acc >= E.DT) acc = 0;
      if (attract.over || attract.t > 120) {
        particles = []; floaters = [];
        startAttract();
      }
      stepParticles(dt);
      drawScene(attract, attractDecor, t, false);
      S.engine(false, 0, 0);
    }
    sideTimer -= dt;
    if (sideTimer <= 0) {
      sideTimer = 0.3;
      updateSide(false);
    }
  }

  // ———————————————————————— Kytkennät ————————————————————————
  $("btnAgain").addEventListener("click", () => startMission(state ? state.def.id : E.MISSIONS[0].id));
  $("btnResMenu").addEventListener("click", toMenu);
  $("btnAbort").addEventListener("click", abortMission);
  $("btnMenuOpen").addEventListener("click", () => { if (mode === "mission") abortMission(); else toMenu(); });
  $("btnFullscreen").addEventListener("click", toggleFullscreen);
  $("btnFsCorner").addEventListener("click", toggleFullscreen);
  $("btnSound").addEventListener("click", () => {
    const on = S.toggle();
    $("btnSound").textContent = on ? "Ääni: päällä" : "Ääni: pois";
    $("btnSound").setAttribute("aria-pressed", String(on));
  });

  // Smoke-testien käyttöliittymä
  window.KolmitasoUI = {
    get mode() { return mode; },
    get state() { return state; },
    get attract() { return attract; },
    save,
    startMission, toMenu,
    setTestInput(v) { testInput = v; },
  };

  toMenu();
  requestAnimationFrame(frame);
})();
