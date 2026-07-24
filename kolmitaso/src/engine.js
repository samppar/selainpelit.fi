"use strict";
// Kolmitaso — pelin ydin (puhdas JS, ei DOM:ia, deterministinen seedillä).
// Triplane Turmoil -henkinen sivusta kuvattu ilmataistelu: lentofysiikka
// sakkauksineen, konekivääri, pommit, it-tykit, vihollishävittäjien AI,
// laskeutuminen ja huolto omalla kentällä sekä tehtävien voitto/häviö.
(function (global) {
  const TAU = Math.PI * 2;
  const DT = 1 / 60;          // kiinteä fysiikka-askel
  const G = 240;              // painovoima px/s^2
  const THRUST = 310;         // täyden kaasun työntö
  const DRAG = 0.92;          // nopeusverrannollinen vastus (huippu ~337)
  const ALIGN = 4.2;          // nopeusvektorin kääntyminen nokan suuntaan /s
  const STALL = 105;          // sakkausnopeus
  const TURN = 2.5;           // kiertonopeus rad/s täydellä auktoriteetilla
  const TAKEOFF_V = 135;      // irtoamisnopeus
  const LAND_VMAX = 215;      // laskeutumisen enimmäisvauhti
  const LAND_VYMAX = 150;     // enimmäisvajoaminen
  const LAND_ANG = 0.42;      // sallittu kulma vaakatasosta
  const PLANE_R = 15;         // osumasäde
  const WHEEL_H = 13;         // pyörien etäisyys rungon keskeltä
  const FUEL_RATE = 1.15;     // polttoaine /s täydellä kaasulla
  const GUN_ROF = 9;          // laukauksia /s
  const GUN_SPEED = 540;
  const GUN_TTL = 0.9;
  const GUN_DMG_PLANE = 6;
  const GUN_DMG_STRUCT = 7;
  const BOMB_DMG = 190;       // keskellä
  const BOMB_R = 85;          // vaikutussäde
  const BOMB_CD = 0.45;
  const FLAK_R = 46;          // it-kranaatin sirpalesäde
  const LIVES = 3;
  const RESPAWN_T = 2.6;
  const SERVICE = { hp: 26, fuel: 34, ammo: 60, bombEvery: 1.5 }; // /s kentällä

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  function angDiff(a, b) {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  // ———————————————————————— Tehtävät ————————————————————————
  const MISSIONS = [
    {
      id: "rintama", name: "Rintamalinja", tier: "helppo", seed: 11, W: 5200,
      sub: "kaksi it-tykkiä · rauhalliset lentäjät",
      desc: "Tuhoa vihollisen halli­t ja it-tykit rintaman takana.",
      aa: 2, hangars: 2, tents: 1, rough: 90,
      enemy: { max: 1, total: 3, spawnEvery: 12, skill: 0.8, aimErr: 0.22, aggr: 0.4, hp: 55, gunDmg: 3.5, fireR: 380 },
      aaDef: { reload: 2.7, aimErr: 0.30, range: 560, dmg: 20, shellSpeed: 300 },
      theme: { skyTop: "#2a3f66", skyMid: "#7f9cc4", skyLow: "#e8c9a0", sun: "#ffd9a0", sunX: 0.22, sunY: 0.30, ground: "#5b7f46", dirt: "#4a3a2c", hill: "#49663a", far: "#6f88a8", cloud: "#f2ead9" },
    },
    {
      id: "laakso", name: "Punalaakso", tier: "keski", seed: 29, W: 6000,
      sub: "kolme it-tykkiä · kaksi hävittäjää ilmassa",
      desc: "Laakson perällä on kolme hallia ja tiukempi ilmatorjunta.",
      aa: 3, hangars: 3, tents: 2, rough: 140,
      enemy: { max: 2, total: 6, spawnEvery: 10, skill: 0.92, aimErr: 0.12, aggr: 0.65, hp: 62, gunDmg: 5 },
      aaDef: { reload: 2.0, aimErr: 0.20, range: 620, dmg: 22, shellSpeed: 320 },
      theme: { skyTop: "#39699e", skyMid: "#8db4d8", skyLow: "#d8e4e2", sun: "#fff3c8", sunX: 0.68, sunY: 0.22, ground: "#6a8a4a", dirt: "#54402e", hill: "#557344", far: "#7fa0b8", cloud: "#ffffff" },
    },
    {
      id: "teras", name: "Teräsmyrsky", tier: "vaikea", seed: 47, W: 6800,
      sub: "neljä it-tykkiä · armottomat ässät",
      desc: "Raskaasti linnoitettu tukikohta ja taitavat vastustajat.",
      aa: 4, hangars: 3, tents: 2, rough: 180,
      enemy: { max: 3, total: 9, spawnEvery: 8, skill: 1.0, aimErr: 0.07, aggr: 0.8, hp: 70, gunDmg: 6 },
      aaDef: { reload: 1.6, aimErr: 0.14, range: 680, dmg: 24, shellSpeed: 340 },
      theme: { skyTop: "#3a2f4a", skyMid: "#8a6a7e", skyLow: "#d8a06a", sun: "#ff9c5a", sunX: 0.80, sunY: 0.34, ground: "#5f6a44", dirt: "#463628", hill: "#4c5840", far: "#6c6280", cloud: "#e2cdc2" },
    },
  ];

  // ———————————————————————— Maasto ————————————————————————
  const TSTEP = 16; // korkeusnäytteen väli px
  function makeTerrain(def) {
    const rng = mulberry32((def.seed * 2654435761) >>> 0);
    const W = def.W, H = 1400;
    const n = Math.floor(W / TSTEP) + 1;
    const base = 1120;
    // Pehmeä satunnaiskumpuilu: summa muutamasta seedatusta siniaallosta
    const waves = [];
    for (let k = 0; k < 5; k++) {
      waves.push({ amp: (def.rough || 120) * (0.5 - k * 0.08), freq: (0.7 + rng() * 1.6) * (k + 1) / W, ph: rng() * TAU });
    }
    const hs = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = i * TSTEP;
      let h = base;
      for (const w of waves) h += Math.sin(x * w.freq * TAU + w.ph) * w.amp;
      hs[i] = h;
    }
    // Kiitoradat: oma vasemmalla, vihollisen oikealla — tasataan ja siloitetaan reunat
    const runways = [
      { side: 0, x0: 280, x1: 960, y: 0 },
      { side: 1, x0: W - 960, x1: W - 280, y: 0 },
    ];
    for (const rw of runways) {
      const i0 = Math.floor(rw.x0 / TSTEP), i1 = Math.ceil(rw.x1 / TSTEP);
      let sum = 0, cnt = 0;
      for (let i = i0; i <= i1; i++) { sum += hs[i]; cnt++; }
      const y = clamp(sum / cnt, base - 60, base + 100);
      rw.y = y;
      for (let i = i0; i <= i1; i++) hs[i] = y;
      const R = 14; // liuska ympärille
      for (let k = 1; k <= R; k++) {
        const t = k / R;
        const a = i0 - k, b = i1 + k;
        if (a >= 0) hs[a] = y * (1 - t) + hs[a] * t;
        if (b < n) hs[b] = y * (1 - t) + hs[b] * t;
      }
    }
    const terrain = { W, H, step: TSTEP, hs, runways };
    // Rakennukset vihollisen puolelle
    const structures = [];
    const gy = (x) => groundY(terrain, x);
    const eRw = runways[1];
    // Hallit kiitoradan takaosaan
    for (let i = 0; i < def.hangars; i++) {
      const x = eRw.x1 - 90 - i * 150;
      structures.push({ type: "halli", side: 1, x, y: gy(x), w: 110, h: 52, hp: 150, maxHp: 150, target: true });
    }
    // Teltat/varikot hallien lomaan
    for (let i = 0; i < (def.tents || 0); i++) {
      const x = eRw.x0 + 80 + i * 130;
      structures.push({ type: "varikko", side: 1, x, y: gy(x), w: 70, h: 34, hp: 80, maxHp: 80, target: true });
    }
    // It-tykit kukkuloille keskimaaston ja kentän välille
    for (let i = 0; i < def.aa; i++) {
      const t = (i + 1) / (def.aa + 1);
      const x = W * 0.52 + (eRw.x0 - 200 - W * 0.52) * t + (rng() - 0.5) * 120;
      structures.push({
        type: "it", side: 1, x, y: gy(x), w: 34, h: 26, hp: 60, maxHp: 60, target: true,
        cd: 1 + rng() * (def.aaDef.reload || 2), aim: 0,
      });
    }
    return { terrain, structures };
  }

  function groundY(terrain, x) {
    const { hs, step } = terrain;
    const fx = clamp(x, 0, terrain.W - 0.001) / step;
    const i = Math.floor(fx), t = fx - i;
    const a = hs[clamp(i, 0, hs.length - 1)], b = hs[clamp(i + 1, 0, hs.length - 1)];
    return a * (1 - t) + b * t;
  }
  function onRunway(terrain, x, side) {
    for (const rw of terrain.runways) {
      if (side != null && rw.side !== side) continue;
      if (x >= rw.x0 && x <= rw.x1) return rw;
    }
    return null;
  }

  // ———————————————————————— Koneet ————————————————————————
  function makePlane(id, side, isPlayer, x, y, facing, hp) {
    return {
      id, side, isPlayer,
      x, y, ang: facing > 0 ? 0 : Math.PI, vx: 0, vy: 0,
      flipped: facing < 0, throttle: 0,
      hp: hp || 100, maxHp: hp || 100,
      gunDmg: GUN_DMG_PLANE,
      fuel: 100, ammo: 120, bombs: 4,
      onGround: true, dead: false,
      fireCd: 0, bombCd: 0, flipLatch: false,
      kills: 0, serviceT: 0, stallT: 0,
      ai: null,
    };
  }

  // Onko kone selällään (ohjaamo alaspäin)? Nostovoima ja hallinta kärsivät.
  // Koneen "ylös" = heading käännettynä 90° ohjaamon puolelle.
  function inverted(p) {
    const uy = p.flipped ? Math.cos(p.ang) : -Math.cos(p.ang);
    return uy > 0.15; // ylävektori osoittaa alaspäin ruudulla (y kasvaa alas)
  }

  // ———————————————————————— Tehtävän luonti ————————————————————————
  // opts: { missionId, seed?, autopilot? }
  function createMission(opts) {
    const def = MISSIONS.find((m) => m.id === opts.missionId) || MISSIONS[0];
    const { terrain, structures } = makeTerrain(def);
    const rng = mulberry32((((opts.seed == null ? def.seed : opts.seed) * 747796405) + 2891336453) >>> 0);
    const rw = terrain.runways[0];
    const px = rw.x0 + 140;
    const player = makePlane(0, 0, true, px, rw.y - WHEEL_H, 1, 100);
    const state = {
      def, terrain, structures,
      planes: [player],
      bullets: [], bombs: [], shells: [], events: [],
      t: 0, steps: 0, rng,
      over: false, outcome: null,
      lives: LIVES, respawnT: 0,
      spawnT: 3.5, spawned: 0, nextId: 1,
      autopilot: !!opts.autopilot,
      stats: { kills: 0, bombsDropped: 0, shotsFired: 0, planesLost: 0 },
    };
    return state;
  }

  const targetsLeft = (state) => state.structures.filter((s) => s.target && s.hp > 0).length;
  const targetsTotal = (state) => state.structures.filter((s) => s.target).length;
  const playerOf = (state) => state.planes.find((p) => p.isPlayer);

  // ———————————————————————— Vahinko ————————————————————————
  function damagePlane(state, p, dmg, byId) {
    if (p.dead) return;
    p.hp -= dmg;
    if (p.hp <= 0) {
      p.dead = true;
      p.throttle = 0;
      state.events.push({ type: "kaatui", plane: p.id, x: p.x, y: p.y, by: byId });
      const killer = byId != null ? state.planes.find((q) => q.id === byId) : null;
      if (killer && !killer.dead && killer.side !== p.side) {
        killer.kills++;
        if (killer.isPlayer) state.stats.kills++;
      }
      if (p.isPlayer) {
        state.stats.planesLost++;
        state.lives--;
        if (state.lives > 0) state.respawnT = RESPAWN_T;
        else if (!state.over) { state.over = true; state.outcome = "tappio"; state.events.push({ type: "tappio" }); }
      }
    } else {
      state.events.push({ type: "osuma", plane: p.id, x: p.x, y: p.y });
    }
  }

  function damageStructure(state, s, dmg, byPlayer) {
    if (s.hp <= 0) return;
    s.hp -= dmg;
    if (s.hp <= 0) {
      s.hp = 0;
      state.events.push({ type: "tuhottu", struct: s.type, x: s.x, y: s.y - s.h / 2, target: !!s.target });
      if (s.target && targetsLeft(state) === 0 && !state.over) {
        state.over = true; state.outcome = "voitto";
        state.events.push({ type: "voitto" });
      }
      void byPlayer;
    } else {
      state.events.push({ type: "rakenneosuma", x: s.x, y: s.y - s.h / 2 });
    }
  }

  function explode(state, x, y, r, dmg, byId) {
    state.events.push({ type: "rajahdys", x, y, r });
    for (const p of state.planes) {
      if (p.dead) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < r + PLANE_R) damagePlane(state, p, dmg * clamp(1 - d / (r + PLANE_R), 0.25, 1), byId);
    }
    for (const s of state.structures) {
      if (s.hp <= 0) continue;
      const d = Math.hypot(s.x - x, (s.y - s.h / 2) - y);
      if (d < r + Math.max(s.w, s.h) / 2) damageStructure(state, s, dmg * clamp(1 - d / (r + s.w), 0.3, 1), true);
    }
  }

  // ———————————————————————— Lentofysiikka ————————————————————————
  function stepPlane(state, p, input) {
    const tr = state.terrain;
    if (p.dead) {
      // putoava hylky
      if (!p.onGround) {
        p.vy += G * 1.1 * DT;
        p.vx *= Math.exp(-0.4 * DT);
        p.ang += 1.4 * DT;
        p.x += p.vx * DT; p.y += p.vy * DT;
        if (p.y + WHEEL_H >= groundY(tr, p.x)) {
          p.onGround = true;
          state.events.push({ type: "maahansyoksy", x: p.x, y: p.y, plane: p.id });
        }
      }
      return;
    }
    // Rullaus (ilmalento ympäri) — reunaliipaisu
    if (input.flip && !p.flipLatch) {
      p.flipLatch = true;
      if (p.onGround) {
        const sp = Math.abs(p.vx);
        if (sp < 25) { p.flipped = !p.flipped; p.ang = p.flipped ? Math.PI : 0; }
      } else p.flipped = !p.flipped;
    } else if (!input.flip) p.flipLatch = false;

    // Kaasu (polttoaineen loppuessa moottori sammuu)
    if (p.fuel <= 0) p.throttle = Math.max(0, p.throttle - 1.5 * DT);
    else p.throttle = clamp(p.throttle + (input.power || 0) * 0.9 * DT, 0, 1);
    if (!p.onGround) p.fuel = Math.max(0, p.fuel - p.throttle * FUEL_RATE * DT);

    if (p.onGround) {
      const rw = onRunway(tr, p.x, null);
      const facing = Math.cos(p.ang) >= 0 ? 1 : -1;
      // Kiihdytys ja kitka maassa
      p.vx += facing * THRUST * 0.8 * p.throttle * DT;
      p.vx *= Math.exp(-(p.throttle > 0.05 ? 0.25 : 1.1) * DT);
      if (Math.abs(p.vx) < 2 && p.throttle < 0.05) p.vx = 0;
      p.vy = 0;
      p.x += p.vx * DT;
      p.y = groundY(tr, p.x) - WHEEL_H;
      // Kiitoradalta rullaus nurmelle: kovaa → tuho, muuten rytkyttävä jarrutus
      if (!onRunway(tr, p.x, null)) {
        if (Math.abs(p.vx) > 140) {
          damagePlane(state, p, 999, null);
          state.events.push({ type: "maahansyoksy", x: p.x, y: p.y, plane: p.id });
          return;
        }
        p.vx *= Math.exp(-2.0 * DT);
      }
      // Irtoaminen: riittävä vauhti + nokka ylös
      const pitchUp = facing > 0 ? (input.pitch || 0) < 0 : (input.pitch || 0) > 0;
      if (Math.abs(p.vx) > TAKEOFF_V && pitchUp) {
        p.onGround = false;
        p.vy = -70;
        p.ang = facing > 0 ? -0.18 : Math.PI + 0.18;
        state.events.push({ type: "noussut", plane: p.id });
      }
      // Huolto omalla kentällä paikallaan
      if (rw && rw.side === p.side && Math.abs(p.vx) < 4 && p.throttle < 0.05) {
        const before = p.fuel + p.ammo + p.hp + p.bombs;
        p.hp = Math.min(p.maxHp, p.hp + SERVICE.hp * DT);
        p.fuel = Math.min(100, p.fuel + SERVICE.fuel * DT);
        p.ammo = Math.min(120, p.ammo + SERVICE.ammo * DT);
        p.serviceT += DT;
        if (p.bombs < 4 && p.serviceT >= SERVICE.bombEvery) { p.bombs++; p.serviceT = 0; }
        const full = p.fuel >= 100 && p.ammo >= 120 && p.hp >= p.maxHp && p.bombs >= 4;
        if (full && before < 100 + 120 + p.maxHp + 4) state.events.push({ type: "huollettu", plane: p.id });
      } else p.serviceT = 0;
    } else {
      // ————— Ilmassa —————
      const speed = Math.hypot(p.vx, p.vy);
      const inv = inverted(p);
      // Ohjausauktoriteetti kasvaa vauhdin myötä, sakkauksessa heikko
      const auth = clamp((speed - 30) / (STALL - 30), 0.15, 1) * (inv ? 0.8 : 1);
      p.ang += (input.pitch || 0) * TURN * auth * DT;
      // Sakkaus: nokka valahtaa kohti vajoavaa nopeusvektoria
      if (speed < STALL) {
        p.stallT += DT;
        const va = Math.atan2(p.vy + 60, p.vx);
        p.ang += angDiff(va, p.ang) * clamp(0.25 + (STALL - speed) / 50, 0, 1) * 3.0 * DT;
      } else p.stallT = 0;
      // Työntö ja painovoima
      p.vx += Math.cos(p.ang) * THRUST * p.throttle * DT;
      p.vy += Math.sin(p.ang) * THRUST * p.throttle * DT + G * DT;
      // Aerodynamiikka: nopeusvektori kääntyy nokan suuntaan (siivet kantavat)
      const cl = Math.min(1, speed / 150) * (inv ? 0.72 : 1);
      const va2 = Math.atan2(p.vy, p.vx);
      const d = angDiff(p.ang, va2);
      const rot = d * Math.min(1, ALIGN * cl * DT);
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const nvx = p.vx * cos - p.vy * sin, nvy = p.vx * sin + p.vy * cos;
      p.vx = nvx; p.vy = nvy;
      // Vastus (+ sivuluisu kuluttaa)
      const drag = DRAG * (1 + Math.abs(d) * 0.6) * (inv ? 1.1 : 1);
      const k = Math.exp(-drag * DT);
      p.vx *= k; p.vy *= k;
      p.x += p.vx * DT; p.y += p.vy * DT;
      // Maailman reunat: pehmeä käännytys takaisin
      if (p.x < 30) { p.x = 30; p.vx = Math.abs(p.vx) * 0.5; }
      if (p.x > tr.W - 30) { p.x = tr.W - 30; p.vx = -Math.abs(p.vx) * 0.5; }
      if (p.y < 40) { p.y = 40; p.vy = Math.max(p.vy, 20); }
      // Maakosketus
      const gy = groundY(tr, p.x);
      if (p.y + WHEEL_H >= gy) {
        const rw = onRunway(tr, p.x, null);
        const levelAng = Math.cos(p.ang) >= 0 ? 0 : Math.PI;
        const gentle = rw && p.vy < LAND_VYMAX && Math.hypot(p.vx, p.vy) < LAND_VMAX
          && Math.abs(angDiff(p.ang, levelAng)) < LAND_ANG && !inverted(p);
        if (gentle) {
          p.onGround = true;
          p.y = gy - WHEEL_H;
          p.vy = 0;
          p.ang = levelAng;
          p.flipped = levelAng !== 0;
          state.events.push({ type: "laskeutui", plane: p.id, own: rw.side === p.side });
        } else {
          damagePlane(state, p, 999, null);
          p.onGround = true;
          p.y = gy - WHEEL_H;
          state.events.push({ type: "maahansyoksy", x: p.x, y: p.y, plane: p.id });
          return;
        }
      }
    }
    // Konekivääri
    p.fireCd = Math.max(0, p.fireCd - DT);
    if (input.fire && !p.onGround && p.ammo > 0 && p.fireCd <= 0) {
      p.fireCd = 1 / GUN_ROF;
      p.ammo--;
      if (p.isPlayer) state.stats.shotsFired++;
      const a = p.ang;
      state.bullets.push({
        x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20,
        vx: Math.cos(a) * GUN_SPEED + p.vx, vy: Math.sin(a) * GUN_SPEED + p.vy,
        ttl: GUN_TTL, owner: p.id, side: p.side, dmg: p.gunDmg,
      });
      state.events.push({ type: "laukaus", plane: p.id, x: p.x, y: p.y });
    }
    // Pommit
    p.bombCd = Math.max(0, p.bombCd - DT);
    if (input.bomb && !p.onGround && p.bombs > 0 && p.bombCd <= 0) {
      p.bombCd = BOMB_CD;
      p.bombs--;
      if (p.isPlayer) state.stats.bombsDropped++;
      state.bombs.push({ x: p.x, y: p.y + 14, vx: p.vx, vy: p.vy + 20, owner: p.id, ang: p.ang });
      state.events.push({ type: "pommi", plane: p.id });
    }
  }

  // ———————————————————————— AI ————————————————————————
  function aiControl(state, p) {
    const tr = state.terrain;
    const ai = p.ai;
    if (p.onGround) {
      // Täysi kaasu ja nokka ylös kun vauhti riittää
      const facing = Math.cos(p.ang) >= 0 ? 1 : -1;
      return { pitch: Math.abs(p.vx) > TAKEOFF_V * 0.95 ? -facing : 0, power: 1, fire: false, bomb: false, flip: false };
    }
    const speed = Math.hypot(p.vx, p.vy);
    // Kohde: vastapuolen elossa oleva kone, muuten partiopiste
    let target = null, bestD = Infinity;
    for (const q of state.planes) {
      if (q.side === p.side || q.dead) continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestD) { bestD = d; target = q; }
    }
    let desired;
    if (target && bestD < (ai.engageR || 2200)) {
      // Ennakko kohti kohdetta
      const lead = clamp(bestD / GUN_SPEED, 0, 1.1) * (ai.skill || 0.9);
      desired = Math.atan2(target.y + target.vy * lead - p.y, target.x + target.vx * lead - p.x);
    } else {
      const wp = ai.patrol || { x: tr.W * 0.5, y: 520 };
      desired = Math.atan2(wp.y - p.y, wp.x - p.x);
      if (Math.hypot(wp.x - p.x, wp.y - p.y) < 220 && ai.patrolPts) {
        ai.patrolIdx = ((ai.patrolIdx || 0) + 1) % ai.patrolPts.length;
        ai.patrol = ai.patrolPts[ai.patrolIdx];
      }
    }
    // Törmäyksen väistö: liian lähellä → irtautuminen ylös
    if (target && bestD < 90) desired = Math.atan2(-0.9, Math.cos(p.ang) >= 0 ? 0.4 : -0.4);
    // Sakkauksen esto: nokka loivasti alas ja kaasua
    const power = 1;
    if (speed < STALL + 25) desired = Math.atan2(0.45, Math.cos(p.ang) >= 0 ? 0.9 : -0.9);
    // Katon esto
    if (p.y < 140) desired = Math.atan2(0.5, Math.cos(p.ang) >= 0 ? 0.86 : -0.86);
    // Maaston väistö voittaa kaiken: katso eteen ~0.9 s
    const lookX = clamp(p.x + p.vx * 0.9, 20, tr.W - 20);
    const clearance = groundY(tr, lookX) - (p.y + p.vy * 0.9);
    if (clearance < 160 || groundY(tr, p.x) - p.y < 120) {
      desired = Math.cos(p.ang) >= 0 ? -Math.PI / 3 : Math.PI + Math.PI / 3; // jyrkkä nousu
    }
    const pitch = clamp(angDiff(desired, p.ang) * 2.4, -1, 1);
    // Tulitus kun kohde keilassa
    let fire = false;
    if (target && p.ammo > 0) {
      const aim = Math.atan2(target.y - p.y, target.x - p.x);
      if (bestD < (ai.fireR || 430) && Math.abs(angDiff(aim, p.ang)) < 0.14 + (ai.aimErr || 0.1)) {
        fire = state.rng() < (ai.aggr || 0.6);
      }
    }
    // Pysy oikein päin
    const flip = inverted(p) && state.rng() < 0.03;
    return { pitch, power, fire, bomb: false, flip };
  }

  function spawnEnemy(state) {
    const def = state.def.enemy;
    const rw = state.terrain.runways[1];
    const p = makePlane(state.nextId++, 1, false, rw.x1 - 140, rw.y - WHEEL_H, -1, def.hp);
    p.gunDmg = def.gunDmg || 5;
    p.ai = {
      skill: def.skill + (state.rng() - 0.5) * 0.08,
      aimErr: def.aimErr, aggr: def.aggr,
      fireR: def.fireR || 430, engageR: 2600,
      patrolPts: [
        { x: state.terrain.W * 0.62, y: 420 },
        { x: state.terrain.W * 0.82, y: 320 },
      ],
      patrolIdx: 0,
    };
    p.ai.patrol = p.ai.patrolPts[0];
    p.throttle = 0.4;
    state.planes.push(p);
    state.spawned++;
    state.events.push({ type: "vihollinen", plane: p.id });
    return p;
  }

  // Autopilotti (valikon taustanäytös): pelaajan kone partioi ja taistelee
  function autopilotControl(state, p) {
    if (!p.ai) {
      p.ai = {
        skill: 0.95, aimErr: 0.1, aggr: 0.7, fireR: 430, engageR: 900,
        patrolPts: [
          { x: state.terrain.W * 0.28, y: 420 },
          { x: state.terrain.W * 0.52, y: 300 },
          { x: state.terrain.W * 0.36, y: 520 },
        ],
        patrolIdx: 0,
      };
      p.ai.patrol = p.ai.patrolPts[0];
    }
    return aiControl(state, p);
  }

  // ———————————————————————— Askel ————————————————————————
  // playerInput = { pitch:-1..1, power:-1|0|1, fire, bomb, flip } tai null
  function step(state, playerInput) {
    state.events = [];
    const tr = state.terrain;
    // Pelaajan uudelleensyntymä
    if (state.respawnT > 0) {
      state.respawnT -= DT;
      if (state.respawnT <= 0) {
        const rw = tr.runways[0];
        const p = playerOf(state);
        const np = makePlane(0, 0, true, rw.x0 + 140, rw.y - WHEEL_H, 1, 100);
        np.kills = p ? p.kills : 0;
        state.planes = state.planes.filter((q) => !q.isPlayer);
        state.planes.push(np);
        state.events.push({ type: "uusikone", lives: state.lives });
      }
    }
    // Vihollisten syöttö niin kauan kuin halleja on pystyssä
    const hangarAlive = state.structures.some((s) => s.type === "halli" && s.hp > 0);
    const concurrent = state.planes.filter((q) => !q.isPlayer && !q.dead).length;
    state.spawnT -= DT;
    if (state.spawnT <= 0 && hangarAlive && concurrent < state.def.enemy.max && state.spawned < state.def.enemy.total && !state.over) {
      spawnEnemy(state);
      state.spawnT = state.def.enemy.spawnEvery;
    }
    // Koneet
    for (const p of state.planes) {
      let input;
      if (p.isPlayer && !state.autopilot) input = playerInput || { pitch: 0, power: 0, fire: false, bomb: false, flip: false };
      else if (p.isPlayer) input = autopilotControl(state, p);
      else input = aiControl(state, p);
      stepPlane(state, p, input);
    }
    // Kuolleet viholliskoneet siivotaan pudottuaan
    state.planes = state.planes.filter((p) => p.isPlayer || !p.dead || !p.onGround || (p.deadT = (p.deadT || 0) + DT) < 4);
    // Luodit
    for (let i = state.bullets.length - 1; i >= 0; i--) {
      const b = state.bullets[i];
      b.x += b.vx * DT; b.y += b.vy * DT; b.ttl -= DT;
      let dead = b.ttl <= 0;
      if (!dead && b.y >= groundY(tr, b.x)) dead = true;
      if (!dead) {
        for (const p of state.planes) {
          if (p.dead || p.side === b.side) continue;
          const dx = p.x - b.x, dy = p.y - b.y;
          if (dx * dx + dy * dy < PLANE_R * PLANE_R) {
            dead = true;
            damagePlane(state, p, b.dmg || GUN_DMG_PLANE, b.owner);
            break;
          }
        }
      }
      if (!dead) {
        for (const s of state.structures) {
          if (s.hp <= 0 || s.side === b.side) continue;
          if (b.x > s.x - s.w / 2 && b.x < s.x + s.w / 2 && b.y > s.y - s.h && b.y < s.y) {
            dead = true;
            damageStructure(state, s, GUN_DMG_STRUCT, b.side === 0);
            break;
          }
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
    // Pommit
    for (let i = state.bombs.length - 1; i >= 0; i--) {
      const b = state.bombs[i];
      b.vy += G * 1.05 * DT;
      b.vx *= Math.exp(-0.12 * DT);
      b.x += b.vx * DT; b.y += b.vy * DT;
      b.ang = Math.atan2(b.vy, b.vx);
      let boom = b.y >= groundY(tr, b.x);
      if (!boom) {
        for (const s of state.structures) {
          if (s.hp <= 0) continue;
          if (b.x > s.x - s.w / 2 && b.x < s.x + s.w / 2 && b.y > s.y - s.h && b.y < s.y) { boom = true; break; }
        }
      }
      if (boom) {
        state.bombs.splice(i, 1);
        explode(state, b.x, Math.min(b.y, groundY(tr, b.x)), BOMB_R, BOMB_DMG, b.owner);
      }
    }
    // It-tykit
    const aaDef = state.def.aaDef;
    for (const s of state.structures) {
      if (s.type !== "it" || s.hp <= 0) continue;
      s.cd -= DT;
      // lähin vastapuolen kone kantamalla
      let tp = null, bd = Infinity;
      for (const p of state.planes) {
        if (p.dead || p.side === s.side || p.onGround) continue;
        const d = Math.hypot(p.x - s.x, p.y - (s.y - s.h));
        if (d < aaDef.range && d < bd) { bd = d; tp = p; }
      }
      if (tp) s.aim = Math.atan2(tp.y - (s.y - s.h), tp.x - s.x);
      if (tp && s.cd <= 0) {
        s.cd = aaDef.reload * (0.85 + state.rng() * 0.3);
        const tof = bd / aaDef.shellSpeed;
        const err = (state.rng() - 0.5) * 2 * aaDef.aimErr;
        const ax = tp.x + tp.vx * tof - s.x, ay = tp.y + tp.vy * tof - (s.y - s.h);
        const a = Math.atan2(ay, ax) + err;
        state.shells.push({
          x: s.x, y: s.y - s.h,
          vx: Math.cos(a) * aaDef.shellSpeed, vy: Math.sin(a) * aaDef.shellSpeed,
          ttl: clamp(tof + err * 0.5, 0.5, 2.6), dmg: aaDef.dmg,
        });
        state.events.push({ type: "it-laukaus", x: s.x, y: s.y - s.h });
      }
    }
    // It-kranaatit: räjähtävät lentoajan päässä tai lähietäisyydellä
    for (let i = state.shells.length - 1; i >= 0; i--) {
      const sh = state.shells[i];
      sh.x += sh.vx * DT; sh.y += sh.vy * DT; sh.ttl -= DT;
      let boom = sh.ttl <= 0 || sh.y >= groundY(tr, sh.x);
      if (!boom) {
        for (const p of state.planes) {
          if (p.dead || p.side === 1 || p.onGround) continue;
          if (Math.hypot(p.x - sh.x, p.y - sh.y) < 24) { boom = true; break; }
        }
      }
      if (boom) {
        state.shells.splice(i, 1);
        state.events.push({ type: "flak", x: sh.x, y: sh.y });
        for (const p of state.planes) {
          if (p.dead || p.side === 1) continue;
          const d = Math.hypot(p.x - sh.x, p.y - sh.y);
          if (d < FLAK_R + PLANE_R) damagePlane(state, p, sh.dmg * clamp(1 - d / (FLAK_R + PLANE_R), 0.35, 1), null);
        }
      }
    }
    // Koneiden yhteentörmäykset (vastapuolet)
    for (let i = 0; i < state.planes.length; i++) {
      for (let j = i + 1; j < state.planes.length; j++) {
        const a = state.planes[i], b = state.planes[j];
        if (a.dead || b.dead || a.side === b.side || a.onGround || b.onGround) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) < PLANE_R * 1.6) {
          damagePlane(state, a, 999, b.id);
          damagePlane(state, b, 999, a.id);
          state.events.push({ type: "rajahdys", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: 40 });
        }
      }
    }
    state.t += DT;
    state.steps++;
  }

  // ———————————————————————— Tulos ja tiivistelmä ————————————————————————
  function result(state) {
    const p = playerOf(state);
    return {
      outcome: state.outcome, time: state.t,
      kills: state.stats.kills,
      bombsDropped: state.stats.bombsDropped,
      shotsFired: state.stats.shotsFired,
      planesLost: state.stats.planesLost,
      livesLeft: state.lives,
      targetsDestroyed: targetsTotal(state) - targetsLeft(state),
      targetsTotal: targetsTotal(state),
      playerAlive: !!(p && !p.dead),
    };
  }

  function snapshot(state) {
    return {
      planes: state.planes.map((p) => ({
        id: p.id, x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100,
        a: Math.round(p.ang * 1000) / 1000, hp: Math.round(p.hp * 10) / 10,
        f: Math.round(p.fuel * 10) / 10, am: p.ammo, bo: p.bombs,
        g: p.onGround, d: p.dead,
      })),
      st: state.structures.map((s) => Math.round(s.hp)),
      n: state.bullets.length + state.bombs.length + state.shells.length,
      lives: state.lives, out: state.outcome,
    };
  }

  const E = {
    DT, TAU, G, STALL, TAKEOFF_V, PLANE_R, WHEEL_H, LIVES, RESPAWN_T,
    LAND_VMAX, LAND_VYMAX, LAND_ANG, BOMB_R, FLAK_R,
    mulberry32, clamp, angDiff,
    MISSIONS, makeTerrain, groundY, onRunway,
    createMission, step, stepPlane, aiControl, spawnEnemy,
    damagePlane, damageStructure, explode, inverted,
    targetsLeft, targetsTotal, playerOf, result, snapshot,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = E;
  else global.KolmitasoEngine = E;
})(typeof window !== "undefined" ? window : globalThis);
