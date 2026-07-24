"use strict";
// Romuralli — pelin ydin (puhdas JS, ei DOM:ia, deterministinen seedillä).
// Ylhäältä kuvattu aseellinen kilpa-ajo: rata, autofysiikka, AI, aseet,
// poiminnat, kierrokset ja palkintorahat.
(function (global) {
  const TAU = Math.PI * 2;
  const DT = 1 / 60;          // kiinteä fysiikka-askel
  const M = 512;              // keskilinjan näytepisteitä
  const NUM_CP = 10;          // tarkistuspisteitä / kierros
  const CAR_R = 14;           // auton törmäyssäde
  const PICKUP_R = 26;
  const PICKUP_RESPAWN = 18;  // s

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

  // ———————————————————————— Rata ————————————————————————
  // Säteittäin häiritty suljettu silmukka (tähtimuotoinen → ei leikkaa itseään),
  // pehmennetty Catmull-Rom-käyrällä.
  function makeTrack(def) {
    const rng = mulberry32((def.seed * 2654435761) >>> 0);
    const W = 2600, H = 1800;
    const cx = W / 2, cy = H / 2;
    const rx = W / 2 - 210, ry = H / 2 - 210;
    const n = 10 + Math.floor(rng() * 4);
    const ctrl = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (rng() - 0.5) * (0.6 / n) * TAU;
      const r = 0.6 + rng() * 0.5;
      ctrl.push({ x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r });
    }
    // Catmull-Rom, suljettu
    const pts = [];
    const per = Math.ceil(M / n);
    for (let i = 0; i < n; i++) {
      const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
      for (let j = 0; j < per; j++) {
        const t = j / per, t2 = t * t, t3 = t2 * t;
        pts.push({
          x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        });
      }
    }
    const count = pts.length;
    // Tangentit, kaarevuus, pituus
    let length = 0;
    for (let i = 0; i < count; i++) {
      const a = pts[i], b = pts[(i + 1) % count];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      a.tx = dx / d; a.ty = dy / d; a.ds = d; a.cum = length;
      length += d;
    }
    for (let i = 0; i < count; i++) {
      const a = pts[(i - 2 + count) % count], b = pts[(i + 2) % count];
      const span = pts[i].ds * 4 || 1e-6;
      pts[i].curv = Math.abs(angDiff(Math.atan2(b.ty, b.tx), Math.atan2(a.ty, a.tx))) / span;
    }
    const halfWidth = def.halfWidth || 66;
    const checkpoints = [];
    for (let k = 0; k < NUM_CP; k++) checkpoints.push(Math.floor((k * count) / NUM_CP));
    // Poimintapaikat tarkistuspisteiden puoliväleihin
    const types = ["raha", "korjaus", "raha", "ammus", "turbo", "raha", "korjaus", "ammus", "turbo", "raha"];
    // seedattu sekoitus
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    const pickups = [];
    for (let k = 0; k < NUM_CP; k++) {
      const idx = (checkpoints[k] + Math.floor(count / NUM_CP / 2)) % count;
      const p = pts[idx];
      const off = (rng() * 2 - 1) * (halfWidth - 26);
      pickups.push({
        x: p.x - p.ty * off, y: p.y + p.tx * off,
        type: types[k], value: types[k] === "raha" ? 40 + Math.floor(rng() * 5) * 10 : 0,
        active: true, respawnT: 0,
      });
    }
    return {
      id: def.id, name: def.name, theme: def.theme, laps: def.laps, seed: def.seed,
      W, H, pts, count, length, halfWidth, checkpoints, pickupSpots: pickups,
    };
  }

  // Lähin keskilinjan indeksi. hint → ikkunahaku, muuten koko rata.
  function nearestIdx(track, x, y, hint) {
    const pts = track.pts, count = track.count;
    let best = -1, bestD = Infinity;
    if (hint != null) {
      for (let k = -10; k <= 34; k++) {
        const i = ((hint + k) % count + count) % count;
        const dx = pts[i].x - x, dy = pts[i].y - y;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      }
      if (bestD <= (track.halfWidth * 4) * (track.halfWidth * 4)) return { idx: best, dist: Math.sqrt(bestD) };
    }
    best = 0; bestD = Infinity;
    for (let i = 0; i < count; i += 2) {
      const dx = pts[i].x - x, dy = pts[i].y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return { idx: best, dist: Math.sqrt(bestD) };
  }

  // ———————————————————————— Autot ja varusteet ————————————————————————
  const UPGRADES = {
    moottori: { name: "Moottori", costs: [220, 520, 990], desc: "kiihtyvyys ja huippunopeus" },
    renkaat:  { name: "Renkaat",  costs: [180, 430, 820], desc: "pito ja kääntyvyys" },
    panssari: { name: "Panssari", costs: [200, 470, 900], desc: "kestopisteet" },
    aseet:    { name: "Aseet",    costs: [240, 560, 1050], desc: "tulivoima ja lippaat" },
  };
  function carStats(upg) {
    const u = Object.assign({ moottori: 0, renkaat: 0, panssari: 0, aseet: 0 }, upg || {});
    return {
      accel: 250 + u.moottori * 32,
      top: 330 + u.moottori * 27,
      rev: 130,
      turn: 2.7 + u.renkaat * 0.22,
      grip: 8 + u.renkaat * 0.9,
      maxHp: 100 + u.panssari * 28,
      gunDmg: 5 + u.aseet * 1.6,
      gunRof: 7 + u.aseet * 0.8,
      ammo: 40 + u.aseet * 10,
    };
  }

  const DRIVERS = [
    { name: "Ruoste-Reino", color: "#c0512f" },
    { name: "Turbo-Tuula",  color: "#3f8fd2" },
    { name: "Piikki-Pentti", color: "#8aab2f" },
    { name: "Nitro-Niina",  color: "#a45dd0" },
    { name: "Mutteri-Masa", color: "#d0a63a" },
    { name: "Kaasu-Kaisa",  color: "#3bb99f" },
  ];

  const TIERS = {
    helppo: { name: "Helppo", prizes: [120, 70, 40, 15], oppUpg: 0, oppMul: 0.86, aimErr: 0.16 },
    keski:  { name: "Keskitaso", prizes: [260, 160, 90, 30], oppUpg: 1, oppMul: 0.94, aimErr: 0.09 },
    vaikea: { name: "Vaikea", prizes: [520, 320, 170, 60], oppUpg: 3, oppMul: 1.0, aimErr: 0.05 },
  };
  const BOUNTY = 60; // palkkio vastustajan romuttamisesta

  const TRACKS = [
    { id: "kaatopaikka", name: "Kaatopaikka", tier: "helppo", seed: 3,  laps: 3,
      theme: { ground: "#4c4839", speck: "#5a5545", road: "#33343a", edge: "#c8c2ae", kerb1: "#b8402e", kerb2: "#ddd6c2" } },
    { id: "hiekkakuoppa", name: "Hiekkakuoppa", tier: "helppo", seed: 17, laps: 3,
      theme: { ground: "#b99a62", speck: "#a5854e", road: "#4a4440", edge: "#efe6c8", kerb1: "#b8402e", kerb2: "#efe6c8" } },
    { id: "satamarata", name: "Satamarata", tier: "keski", seed: 8,  laps: 4,
      theme: { ground: "#3a434c", speck: "#46525c", road: "#2c2e33", edge: "#b9c4cc", kerb1: "#c8a63c", kerb2: "#22262b" } },
    { id: "teollisuus", name: "Teollisuusalue", tier: "keski", seed: 23, laps: 4,
      theme: { ground: "#544b41", speck: "#635a4d", road: "#302f33", edge: "#c9bfa8", kerb1: "#b8402e", kerb2: "#ddd6c2" } },
    { id: "yosirkuitti", name: "Yösirkuitti", tier: "vaikea", seed: 5,  laps: 5,
      theme: { ground: "#232733", speck: "#2c3140", road: "#30323b", edge: "#8fd2c8", kerb1: "#d24a68", kerb2: "#2a2d38", night: true } },
    { id: "rautatehdas", name: "Rautatehdas", tier: "vaikea", seed: 31, laps: 5,
      theme: { ground: "#463c3c", speck: "#554848", road: "#2e2c30", edge: "#d2b48f", kerb1: "#c8742e", kerb2: "#ddd6c2" } },
  ];

  function prizeFor(tierId, place) {
    const t = TIERS[tierId];
    return t ? (t.prizes[place] || 0) : 0;
  }

  // ———————————————————————— Kisa ————————————————————————
  // opts: { tier, trackId?, seed, playerUpgrades, playerName?, autopilot? }
  function createRace(opts) {
    const tierId = opts.tier || "helppo";
    const tier = TIERS[tierId];
    const rng = mulberry32(((opts.seed || 1) * 747796405 + 2891336453) >>> 0);
    let defs = TRACKS.filter((t) => t.tier === tierId);
    if (opts.trackId) defs = TRACKS.filter((t) => t.id === opts.trackId);
    const def = opts.trackDef || defs[Math.floor(rng() * defs.length)] || TRACKS[0];
    const track = makeTrack(def);

    // Vastustajat: kolme kuljettajaa poolista
    const pool = DRIVERS.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const cars = [];
    const pStats = carStats(opts.playerUpgrades);
    cars.push(makeCar(0, opts.playerName || "Sinä", "#e8e4da", true, pStats, null));
    for (let i = 0; i < 3; i++) {
      const d = pool[i];
      const lvl = tier.oppUpg;
      const oStats = carStats({ moottori: lvl, renkaat: lvl, panssari: Math.max(0, lvl - 1), aseet: lvl });
      const skill = tier.oppMul + (rng() - 0.5) * 0.04;
      cars.push(makeCar(i + 1, d.name, d.color, false, oStats, {
        skill, aimErr: tier.aimErr, lane: [-1, 1, 0][i] * 20, aggr: 0.5 + rng() * 0.5,
      }));
    }
    // Lähtöruudukko: parijono ennen lähtöviivaa, keula radan suuntaan
    for (let i = 0; i < cars.length; i++) {
      const row = Math.floor(i / 2), col = i % 2;
      const gi = ((-(6 + row * 4)) % track.count + track.count) % track.count;
      const p = track.pts[gi];
      const off = (col === 0 ? -1 : 1) * 24;
      const c = cars[i];
      c.x = p.x - p.ty * off; c.y = p.y + p.tx * off;
      c.ang = Math.atan2(p.ty, p.tx);
      c.trackIdx = gi;
    }
    const pickups = track.pickupSpots.map((p) => Object.assign({}, p));
    return {
      tier: tierId, track, cars, pickups,
      bullets: [], events: [], t: 0, steps: 0,
      countdownT: 3, over: false, autopilot: !!opts.autopilot,
      rng: mulberry32(((opts.seed || 1) ^ 0x9e3779b9) >>> 0),
      order: cars.map((c) => c.id),
    };
  }

  function makeCar(id, name, color, isPlayer, stats, ai) {
    return {
      id, name, color, isPlayer, ai, stats,
      x: 0, y: 0, ang: 0, vx: 0, vy: 0,
      hp: stats.maxHp, ammo: stats.ammo, turboM: 100,
      fireCd: 0, cpTotal: 1, trackIdx: 0, trackDist: 0, offroad: false,
      finished: false, finishT: 0, wrecked: false,
      money: 0, kills: 0, stuckT: 0, revT: 0, turboOn: false,
    };
  }

  const lapOf = (car, laps) => clamp(Math.floor((car.cpTotal - 1) / NUM_CP) + 1, 1, laps);
  const finishCp = (laps) => laps * NUM_CP + 1;

  // ———————————————————————— AI ————————————————————————
  function aiInput(state, car) {
    const tr = state.track, pts = tr.pts, count = tr.count;
    const speed = Math.hypot(car.vx, car.vy);
    const ds = tr.length / count;
    // Ohjaus: tähtää keskilinjaa pitkin eteenpäin (kaistaoffset erottaa autot)
    const la = clamp(Math.round(10 + speed * 0.065), 10, 48);
    const ti = (car.trackIdx + la) % count;
    const tp = pts[ti];
    const lane = car.ai.lane || 0;
    const txp = tp.x - tp.ty * lane, typ = tp.y + tp.tx * lane;
    const desired = Math.atan2(typ - car.y, txp - car.x);
    let steer = clamp(angDiff(desired, car.ang) * 2.6, -1, 1);
    // Jarrutus mutkaan: suurin kaarevuus edessä → tavoitenopeus
    const ahead = clamp(Math.round((speed * 0.9) / ds), 8, 70);
    let maxCurv = 0;
    for (let k = 4; k <= ahead; k += 2) {
      const c = pts[(car.trackIdx + k) % count].curv;
      if (c > maxCurv) maxCurv = c;
    }
    const latAcc = 55 * car.stats.grip;
    const vTarget = Math.min(Math.sqrt(latAcc / (maxCurv + 1e-4)), car.stats.top * car.ai.skill);
    let throttle = speed < vTarget - 8 ? 1 : speed > vTarget + 25 ? -0.8 : 0.25;
    const turbo = maxCurv < 0.0016 && speed > 180 && car.turboM > 25;
    // Ammu jos vihollinen edessä keilassa
    let fire = false;
    if (car.ammo > 0 && state.countdownT <= 0) {
      const fx = Math.cos(car.ang), fy = Math.sin(car.ang);
      for (const o of state.cars) {
        if (o.id === car.id || o.wrecked || o.finished) continue;
        const dx = o.x - car.x, dy = o.y - car.y;
        const d = Math.hypot(dx, dy);
        if (d < 60 || d > 280) continue;
        if ((dx * fx + dy * fy) / d > 0.985 && state.rng() < car.ai.aggr) { fire = true; break; }
      }
    }
    // Jumissa → peruuta hetki
    if (car.revT > 0) {
      car.revT -= DT;
      return { steer: -steer, throttle: -1, fire: false, turbo: false };
    }
    if (speed < 15 && state.countdownT <= 0 && !car.finished) {
      car.stuckT += DT;
      if (car.stuckT > 1.2) { car.stuckT = 0; car.revT = 0.9; }
    } else car.stuckT = 0;
    return { steer, throttle, fire, turbo };
  }

  // ———————————————————————— Fysiikka-askel ————————————————————————
  function stepCar(state, car, input) {
    const st = car.stats;
    if (car.wrecked) input = { steer: 0, throttle: 0, fire: false, turbo: false };
    const cos = Math.cos(car.ang), sin = Math.sin(car.ang);
    let fwd = car.vx * cos + car.vy * sin;
    let lat = -car.vx * sin + car.vy * cos;
    const speed = Math.hypot(car.vx, car.vy);
    const off = car.offroad;
    // Turbo
    car.turboOn = !!input.turbo && car.turboM > 0 && input.throttle > 0 && !car.wrecked;
    if (car.turboOn) car.turboM = Math.max(0, car.turboM - 30 * DT);
    const top = st.top * (car.turboOn ? 1.25 : 1);
    // Ohjaus (nopeudesta riippuva, peruuttaessa kääntyy toisin päin)
    const sf = clamp(Math.abs(fwd) / 120, 0, 1) * (fwd < 0 ? -1 : 1);
    car.ang += input.steer * st.turn * sf * (1 / (1 + Math.abs(fwd) / 900)) * DT;
    // Kaasu / jarru / peruutus
    if (state.countdownT <= 0) {
      if (input.throttle > 0) {
        if (fwd < top) fwd = Math.min(top, fwd + st.accel * input.throttle * (off ? 0.5 : 1) * (car.turboOn ? 1.55 : 1) * DT);
      } else if (input.throttle < 0) {
        if (fwd > 20) fwd += st.accel * 2.2 * input.throttle * DT;
        else if (fwd > -st.rev) fwd += st.accel * 0.6 * input.throttle * DT;
      }
    }
    // Vastukset: pituussuunnan rulla + huippunopeuden pehmeä katto
    fwd *= Math.exp(-(off ? 1.7 : 0.35) * DT);
    if (fwd > top) fwd = top + (fwd - top) * Math.exp(-3 * DT);
    // Sivuttaispito (ajautuminen)
    lat *= Math.exp(-st.grip * (off ? 0.45 : 1) * DT);
    const c2 = Math.cos(car.ang), s2 = Math.sin(car.ang);
    car.vx = fwd * c2 - lat * s2;
    car.vy = fwd * s2 + lat * c2;
    car.x += car.vx * DT;
    car.y += car.vy * DT;
    // Maailman reunat
    const tr = state.track;
    if (car.x < 20) { car.x = 20; car.vx = Math.abs(car.vx) * 0.3; }
    if (car.x > tr.W - 20) { car.x = tr.W - 20; car.vx = -Math.abs(car.vx) * 0.3; }
    if (car.y < 20) { car.y = 20; car.vy = Math.abs(car.vy) * 0.3; }
    if (car.y > tr.H - 20) { car.y = tr.H - 20; car.vy = -Math.abs(car.vy) * 0.3; }
    // Rataseuranta
    const near = nearestIdx(tr, car.x, car.y, car.trackIdx);
    car.trackIdx = near.idx;
    car.trackDist = near.dist;
    car.offroad = near.dist > tr.halfWidth;
    if (car.offroad && speed > 40 && state.rng() < 0.2) state.events.push({ type: "dust", x: car.x, y: car.y });
    // Tarkistuspisteet ja kierrokset
    if (!car.finished && !car.wrecked) {
      const cpIdx = tr.checkpoints[car.cpTotal % NUM_CP];
      const cp = tr.pts[cpIdx];
      const dx = car.x - cp.x, dy = car.y - cp.y;
      if (dx * dx + dy * dy < (tr.halfWidth + 46) * (tr.halfWidth + 46)) {
        car.cpTotal++;
        if ((car.cpTotal - 1) % NUM_CP === 0) {
          if (car.cpTotal >= finishCp(tr.laps)) {
            car.finished = true;
            car.finishT = state.t;
            const place = state.cars.filter((c) => c.finished).length;
            state.events.push({ type: "finish", car: car.id, place });
          } else {
            state.events.push({ type: "lap", car: car.id, lap: lapOf(car, tr.laps) });
          }
        }
      }
    }
    // Ammunta
    car.fireCd = Math.max(0, car.fireCd - DT);
    if (input.fire && !car.wrecked && !car.finished && state.countdownT <= 0 && car.fireCd <= 0 && car.ammo > 0) {
      car.fireCd = 1 / st.gunRof;
      car.ammo--;
      const err = (state.rng() - 0.5) * 2 * (car.ai ? car.ai.aimErr : 0.03);
      const a = car.ang + err;
      const bs = 700 + Math.max(0, fwd);
      state.bullets.push({
        x: car.x + Math.cos(a) * 18, y: car.y + Math.sin(a) * 18,
        vx: Math.cos(a) * bs, vy: Math.sin(a) * bs,
        ttl: 0.6, owner: car.id, dmg: st.gunDmg,
      });
      state.events.push({ type: "fire", car: car.id, x: car.x, y: car.y });
    }
  }

  function wreck(state, car, byId) {
    car.wrecked = true;
    car.vx *= 0.2; car.vy *= 0.2;
    state.events.push({ type: "wreck", car: car.id, x: car.x, y: car.y, by: byId });
    if (byId != null) {
      const killer = state.cars.find((c) => c.id === byId);
      if (killer && !killer.wrecked) {
        killer.kills++;
        killer.money += BOUNTY;
        state.events.push({ type: "bounty", car: killer.id, amount: BOUNTY });
      }
    }
  }

  function raceScore(state, car) {
    if (car.finished) return 1e12 - car.finishT;
    if (car.wrecked) return car.cpTotal * 1e6 - 5e8;
    const tr = state.track;
    const cp = tr.pts[tr.checkpoints[car.cpTotal % NUM_CP]];
    const d = Math.hypot(car.x - cp.x, car.y - cp.y);
    return car.cpTotal * 1e6 - d;
  }

  // Yksi kiinteä askel. playerInput = {steer,throttle,fire,turbo} tai null → AI ajaa.
  function step(state, playerInput) {
    state.events = [];
    if (state.countdownT > -1) {
      const before = Math.ceil(Math.max(0, state.countdownT));
      state.countdownT -= DT;
      const after = Math.ceil(Math.max(0, state.countdownT));
      if (after < before) state.events.push({ type: after === 0 ? "go" : "count", n: after });
    }
    for (const car of state.cars) {
      let input;
      if (car.isPlayer && !state.autopilot && playerInput) input = playerInput;
      else if (car.isPlayer && !state.autopilot && !playerInput) input = { steer: 0, throttle: 0, fire: false, turbo: false };
      else {
        if (!car.ai) car.ai = { skill: 0.9, aimErr: 0.1, lane: 0, aggr: 0.6 };
        input = aiInput(state, car);
      }
      stepCar(state, car, input);
    }
    // Auto–auto-törmäykset
    const cars = state.cars;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= CAR_R * 2 || d === 0) continue;
        const nx = dx / d, ny = dy / d;
        const overlap = CAR_R * 2 - d;
        const ma = a.wrecked ? 0.25 : 1, mb = b.wrecked ? 0.25 : 1;
        const tot = ma + mb;
        a.x -= nx * overlap * (mb / tot); a.y -= ny * overlap * (mb / tot);
        b.x += nx * overlap * (ma / tot); b.y += ny * overlap * (ma / tot);
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const imp = -rv * 0.68;
          a.vx -= nx * imp * (mb / tot) * 2; a.vy -= ny * imp * (mb / tot) * 2;
          b.vx += nx * imp * (ma / tot) * 2; b.vy += ny * imp * (ma / tot) * 2;
          const impact = -rv;
          if (impact > 150) {
            const dmg = (impact - 150) * 0.05;
            for (const c of [a, b]) {
              if (c.wrecked || c.finished) continue;
              c.hp -= dmg;
              if (c.hp <= 0) wreck(state, c, c === a ? b.id : a.id);
            }
            state.events.push({ type: "crash", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, force: impact });
          }
        }
      }
    }
    // Luodit
    const bullets = state.bullets;
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * DT; b.y += b.vy * DT; b.ttl -= DT;
      let dead = b.ttl <= 0;
      if (!dead) {
        for (const c of cars) {
          if (c.id === b.owner || c.finished) continue;
          const dx = c.x - b.x, dy = c.y - b.y;
          if (dx * dx + dy * dy < (CAR_R + 3) * (CAR_R + 3)) {
            dead = true;
            if (!c.wrecked) {
              c.hp -= b.dmg;
              state.events.push({ type: "hit", car: c.id, x: b.x, y: b.y });
              if (c.hp <= 0) wreck(state, c, b.owner);
            }
            break;
          }
        }
      }
      if (dead) bullets.splice(i, 1);
    }
    // Poiminnat
    for (const p of state.pickups) {
      if (!p.active) {
        p.respawnT -= DT;
        if (p.respawnT <= 0) p.active = true;
        continue;
      }
      for (const c of cars) {
        if (c.wrecked || c.finished) continue;
        const dx = c.x - p.x, dy = c.y - p.y;
        if (dx * dx + dy * dy < PICKUP_R * PICKUP_R) {
          p.active = false;
          p.respawnT = PICKUP_RESPAWN;
          if (p.type === "raha") c.money += p.value;
          else if (p.type === "korjaus") c.hp = Math.min(c.stats.maxHp, c.hp + 30);
          else if (p.type === "ammus") c.ammo = Math.min(c.stats.ammo + 30, c.ammo + 25);
          else if (p.type === "turbo") c.turboM = Math.min(100, c.turboM + 45);
          state.events.push({ type: "pickup", car: c.id, kind: p.type, value: p.value, x: p.x, y: p.y });
          break;
        }
      }
    }
    // Sijoitusjärjestys
    state.order = cars
      .map((c) => c.id)
      .sort((x, y) => raceScore(state, cars[y]) - raceScore(state, cars[x]));
    // Kisa ohi pelaajan osalta?
    const pl = cars.find((c) => c.isPlayer);
    if (!state.over && !state.autopilot && pl && (pl.finished || pl.wrecked)) {
      state.over = true;
      state.events.push({ type: "raceover" });
    }
    state.t += DT;
    state.steps++;
  }

  function placeOf(state, carId) {
    return state.order.indexOf(carId);
  }

  // Kisan lopputulos pelaajalle: sijoituspalkinto + romutuspalkkiot + rahasäkit
  function raceResult(state) {
    const pl = state.cars.find((c) => c.isPlayer);
    const place = placeOf(state, pl.id);
    const prize = pl.wrecked ? 0 : prizeFor(state.tier, place);
    return {
      place, wrecked: pl.wrecked, prize,
      bounty: pl.kills * BOUNTY, pickups: pl.money - pl.kills * BOUNTY,
      total: prize + pl.money,
      order: state.order.map((id) => {
        const c = state.cars.find((k) => k.id === id);
        return { id, name: c.name, color: c.color, isPlayer: c.isPlayer, finished: c.finished, wrecked: c.wrecked, finishT: c.finishT };
      }),
    };
  }

  // Tiivis näkymä determinismitesteihin
  function snapshot(state) {
    return state.cars.map((c) => ({
      id: c.id, x: Math.round(c.x * 100) / 100, y: Math.round(c.y * 100) / 100,
      hp: Math.round(c.hp * 10) / 10, cp: c.cpTotal, ammo: c.ammo, money: c.money,
      fin: c.finished, wr: c.wrecked,
    }));
  }

  const E = {
    DT, M, NUM_CP, CAR_R, TAU, BOUNTY, PICKUP_RESPAWN,
    mulberry32, clamp, angDiff,
    makeTrack, nearestIdx, carStats, UPGRADES, DRIVERS, TIERS, TRACKS,
    prizeFor, createRace, step, lapOf, finishCp, placeOf, raceResult, snapshot,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = E;
  else global.RallyEngine = E;
})(typeof window !== "undefined" ? window : globalThis);
