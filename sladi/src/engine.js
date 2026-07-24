/* Sladi — pelin ydin. Puhdas JS ilman DOM:ia; deterministinen kiintein
 * aika-askelin (120 Hz). Ei Date.now / Math.random -kutsuja. */
(function (global) {
  "use strict";

  var TAU = Math.PI * 2;
  var DT = 1 / 120;
  var SPACING = 6; // keskilinjan näytteiden väli (maailmayksikköä)

  var WORLD = { w: 1680, h: 1050 };

  var CAR = {
    accel: 265,      // kiihtyvyys eteen
    revAccel: 160,   // peruutuskiihtyvyys
    brake: 430,      // jarrutushidastuvuus
    dragK: 0.78,     // lineaarinen vastuskerroin (accel/dragK ≈ huippunopeus)
    steer: 3.2,      // maksimikääntönopeus rad/s
    maxRev: 130,     // peruutuksen huippunopeus
    radius: 12,      // törmäysympyrän säde
    boostMax: 470,   // huippunopeus turbolla
    boostPush: 950   // turbon kiihdytys
  };

  var SURFACES = {
    asphalt: { grip: 8.5, dragMul: 1.0, accelMul: 1.0 },
    grass:   { grip: 3.0, dragMul: 2.0, accelMul: 0.5 },
    oil:     { grip: 0.7, dragMul: 1.0, accelMul: 1.0 }
  };

  var AI_SKILLS = {
    rento: { look: 0.40, liftAt: 0.85, brakeAt: 1.25, noise: 0.16, topFrac: 0.90 },
    kova:  { look: 0.46, liftAt: 1.00, brakeAt: 1.45, noise: 0.05, topFrac: 1.00 }
  };

  // ---------------------------------------------------------------- apurit

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function angNorm(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }

  // ---------------------------------------------------------------- radat

  var TRACKS = [
    {
      id: "rengasrata",
      name: "Rengasrata",
      blurb: "Nopea perusrata: pitkät suorat, kaksi turboa ja yksi ilkeä mutkasarja.",
      width: 58,
      laps: 4,
      points: [
        [160, 300], [240, 170], [520, 120], [900, 150], [1250, 120],
        [1480, 200], [1545, 430], [1470, 660], [1280, 845], [980, 905],
        [700, 860], [565, 735], [430, 855], [240, 820], [140, 620]
      ],
      startFrac: 0.06,
      boosts: [{ frac: 0.18 }, { frac: 0.60 }],
      oils: [{ frac: 0.44, side: 0.35 }]
    },
    {
      id: "serpentiini",
      name: "Serpentiini",
      blurb: "Mutkia peräkanaa ja kaksi neulansilmää — jarru on kaverisi.",
      width: 54,
      laps: 4,
      points: [
        [190, 170], [640, 130], [1120, 155], [1420, 235], [1500, 435],
        [1330, 545], [1000, 525], [660, 505], [470, 605], [565, 730],
        [900, 705], [1250, 725], [1425, 830], [1300, 955], [850, 965],
        [400, 930], [190, 785], [150, 470]
      ],
      startFrac: 0.03,
      boosts: [{ frac: 0.10 }],
      oils: [{ frac: 0.30, side: -0.3 }, { frac: 0.78, side: 0.3 }]
    },
    {
      id: "kahdeksikko",
      name: "Kahdeksikko",
      blurb: "Rata risteää itsensä kanssa keskellä — pidä silmät auki risteyksessä.",
      width: 54,
      laps: 4,
      // lemniskaatta: x = cx + a·sin t, y = cy + b·sin 2t
      points: (function () {
        var pts = [], K = 20;
        for (var k = 0; k < K; k++) {
          var t = (k / K) * TAU;
          pts.push([
            Math.round(840 + 630 * Math.sin(t)),
            Math.round(525 + 345 * Math.sin(2 * t))
          ]);
        }
        return pts;
      })(),
      startFrac: 0.12,
      boosts: [{ frac: 0.31 }, { frac: 0.81 }],
      oils: [{ frac: 0.63, side: 0 }]
    }
  ];

  function catmull(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return [
      0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t +
        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
      0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t +
        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
    ];
  }

  /** Rakentaa radan: tasavälinen keskilinja, suunnat, portit, turbot ja öljyt. */
  function buildTrack(def) {
    // 1) tiheä catmull-rom -polku
    var raw = [], n = def.points.length, i, j;
    for (i = 0; i < n; i++) {
      var p0 = def.points[(i - 1 + n) % n], p1 = def.points[i];
      var p2 = def.points[(i + 1) % n], p3 = def.points[(i + 2) % n];
      var segLen = hyp(p2[0] - p1[0], p2[1] - p1[1]);
      var steps = Math.max(6, Math.round(segLen / 3));
      for (j = 0; j < steps; j++) raw.push(catmull(p0, p1, p2, p3, j / steps));
    }
    // 2) tasavälinen uudelleennäytteistys
    var samples = [], acc = 0, prev = raw[0];
    samples.push({ x: prev[0], y: prev[1] });
    for (i = 1; i <= raw.length; i++) {
      var cur = raw[i % raw.length];
      var d = hyp(cur[0] - prev[0], cur[1] - prev[1]);
      while (acc + d >= SPACING) {
        var t = (SPACING - acc) / d;
        prev = [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t];
        d = hyp(cur[0] - prev[0], cur[1] - prev[1]);
        acc = 0;
        samples.push({ x: prev[0], y: prev[1] });
      }
      acc += d;
      prev = cur;
    }
    // poista mahdollinen liian lähelle alkua osuva viimeinen näyte
    var first = samples[0], last = samples[samples.length - 1];
    if (hyp(first.x - last.x, first.y - last.y) < SPACING * 0.5) samples.pop();

    // 3) siirrä aloituskohta haluttuun kohtaan rataa
    var off = Math.round((def.startFrac || 0) * samples.length);
    samples = samples.slice(off).concat(samples.slice(0, off));

    var N = samples.length;
    for (i = 0; i < N; i++) {
      var a = samples[i], b = samples[(i + 1) % N];
      a.dir = Math.atan2(b.y - a.y, b.x - a.x);
    }
    var length = N * SPACING;

    // 4) portit: tasavälein, ei kahta porttia päällekkäin (kahdeksikko!)
    var gateR = def.width * 0.85 + 12;
    var gates = null, K = clamp(Math.round(length / 300), 8, 24);
    for (var tryK = 0; tryK < 6 && !gates; tryK++) {
      var cand = [], k = K + (tryK % 2 ? -((tryK + 1) >> 1) : (tryK >> 1));
      if (k < 6) continue;
      for (i = 0; i < k; i++) {
        var s = samples[Math.round(i * N / k) % N];
        cand.push({ x: s.x, y: s.y, i: Math.round(i * N / k) % N });
      }
      var ok = true;
      for (i = 0; i < k && ok; i++) {
        for (j = i + 1; j < k && ok; j++) {
          if (hyp(cand[i].x - cand[j].x, cand[i].y - cand[j].y) < gateR * 2.1) ok = false;
        }
      }
      if (ok) gates = cand;
    }
    if (!gates) { // varasuunnitelma: harvenna kunnes mahtuu
      gates = [];
      K = 8;
      for (i = 0; i < K; i++) {
        var ss = samples[Math.round(i * N / K) % N];
        gates.push({ x: ss.x, y: ss.y, i: Math.round(i * N / K) % N });
      }
    }

    function atFrac(frac) { return samples[Math.round(frac * N) % N]; }

    var boosts = (def.boosts || []).map(function (bd) {
      var sp = atFrac(bd.frac);
      return { x: sp.x, y: sp.y, a: sp.dir, r: 30 };
    });
    var oils = (def.oils || []).map(function (od) {
      var sp = atFrac(od.frac);
      var nx = -Math.sin(sp.dir), ny = Math.cos(sp.dir);
      var lat = (od.side || 0) * def.width * 0.5;
      return { x: sp.x + nx * lat, y: sp.y + ny * lat, r: 26 };
    });

    return {
      def: def, id: def.id, name: def.name, width: def.width,
      samples: samples, spacing: SPACING, length: length,
      gates: gates, gateR: gateR, boosts: boosts, oils: oils,
      world: WORLD
    };
  }

  var _built = {};
  function getTrack(id) {
    if (!_built[id]) {
      var def = null;
      for (var i = 0; i < TRACKS.length; i++) if (TRACKS[i].id === id) def = TRACKS[i];
      if (!def) throw new Error("tuntematon rata: " + id);
      _built[id] = buildTrack(def);
    }
    return _built[id];
  }

  /** Lähin keskilinjan näyte (karkea haku + tarkennus). */
  function nearestSample(track, x, y) {
    var S = track.samples, N = S.length, stride = 8;
    var best = 0, bd = Infinity, i, d;
    for (i = 0; i < N; i += stride) {
      d = (S[i].x - x) * (S[i].x - x) + (S[i].y - y) * (S[i].y - y);
      if (d < bd) { bd = d; best = i; }
    }
    for (i = best - stride; i <= best + stride; i++) {
      var k = (i + N) % N;
      d = (S[k].x - x) * (S[k].x - x) + (S[k].y - y) * (S[k].y - y);
      if (d < bd) { bd = d; best = k; }
    }
    return { i: best, dist: Math.sqrt(bd) };
  }

  /** Ikkunoitu lähin näyte AI:lle (ei hyppää risteyksessä toiselle haaralle). */
  function nearestWindow(track, x, y, from, win) {
    var S = track.samples, N = S.length;
    var best = from, bd = Infinity;
    for (var o = -win; o <= win; o++) {
      var k = (from + o + N) % N;
      var d = (S[k].x - x) * (S[k].x - x) + (S[k].y - y) * (S[k].y - y);
      if (d < bd) { bd = d; best = k; }
    }
    return { i: best, dist: Math.sqrt(bd) };
  }

  function surfaceAt(track, x, y) {
    for (var i = 0; i < track.oils.length; i++) {
      var o = track.oils[i];
      if (hyp(o.x - x, o.y - y) < o.r) return "oil";
    }
    if (nearestSample(track, x, y).dist > track.width * 0.5 + 4) return "grass";
    return "asphalt";
  }

  // ---------------------------------------------------------------- kilpailu

  function defaultInput() { return { up: false, down: false, left: false, right: false }; }

  /**
   * createRace({ trackId, lineup: [{kind:'human'|'ai', name, color, skill}], laps })
   * Autot lähtevät ruudukosta lähtöviivan takaa.
   */
  function createRace(opts) {
    var track = getTrack(opts.trackId);
    var laps = opts.laps || track.def.laps || 4;
    var S = track.samples, N = S.length;
    var cars = [];
    for (var i = 0; i < opts.lineup.length; i++) {
      var L = opts.lineup[i];
      var backSamples = Math.round((26 + Math.floor(i / 2) * 34) / SPACING);
      var si = (N - backSamples) % N;
      var sp = S[si];
      var nx = -Math.sin(sp.dir), ny = Math.cos(sp.dir);
      var lat = (i % 2 === 0 ? -1 : 1) * 15;
      cars.push({
        idx: i, kind: L.kind, name: L.name, color: L.color,
        skill: L.skill || "kova",
        x: sp.x + nx * lat, y: sp.y + ny * lat,
        angle: sp.dir, vx: 0, vy: 0,
        surf: "asphalt", slip: 0, boostT: 0,
        nextGate: 0, gatesCount: 0, started: false,
        lapsDone: 0, lapStart: 0, lastLap: null, bestLap: null,
        finished: false, finishTime: null, place: null,
        aiCi: si, stuckT: 0, revT: 0
      });
    }
    return {
      trackId: opts.trackId, track: track, laps: laps,
      time: 0, phase: "countdown", count: 3.0,
      cars: cars, events: [], finishedCount: 0,
      grace: null // aikaa muille, kun ensimmäinen ihminen on maalissa
    };
  }

  /** Botin ohjaussyöte. Deterministinen (kohina sin-funktiolla ajasta). */
  function aiInput(state, idx) {
    var car = state.cars[idx], track = state.track;
    var S = track.samples, N = S.length;
    var sk = AI_SKILLS[car.skill] || AI_SKILLS.kova;
    var inp = defaultInput();

    var speed = hyp(car.vx, car.vy);
    var near = nearestWindow(track, car.x, car.y, car.aiCi, 30);
    if (near.dist > 260) near = nearestSample(track, car.x, car.y);
    car.aiCi = near.i;

    // juuttumisen tunnistus ja peruutus
    if (state.phase === "racing" && speed < 18) car.stuckT += DT; else car.stuckT = 0;
    if (car.revT > 0) {
      car.revT -= DT;
      var backTo = S[(near.i + N - 8) % N];
      var bAng = Math.atan2(backTo.y - car.y, backTo.x - car.x);
      var bDiff = angNorm(bAng - car.angle);
      inp.down = true;
      inp.left = bDiff > 0.15;   // peruutettaessa ohjaus peilautuu
      inp.right = bDiff < -0.15;
      return inp;
    }
    if (car.stuckT > 1.3) { car.revT = 0.9; car.stuckT = 0; }

    // katsepiste edempänä radalla
    var lookDist = clamp(speed * sk.look + 50, 80, 230);
    var lookN = Math.round(lookDist / SPACING);
    var target = S[(near.i + lookN) % N];
    var aim = Math.atan2(target.y - car.y, target.x - car.x);
    var noise = Math.sin(state.time * 1.7 + idx * 2.39) * sk.noise;
    var diff = angNorm(aim - car.angle + noise);

    inp.left = diff < -0.06;
    inp.right = diff > 0.06;

    // kaasu/jarru mutkan jyrkkyyden ja nopeuden mukaan
    var sharp = Math.abs(diff);
    var top = (CAR.accel / CAR.dragK) * sk.topFrac;
    if (sharp > sk.brakeAt && speed > 150) inp.down = true;
    else if (sharp > sk.liftAt && speed > 120) { /* rullaa */ }
    else if (speed < top) inp.up = true;
    return inp;
  }

  function carSurface(state, car) {
    var track = state.track;
    for (var i = 0; i < track.oils.length; i++) {
      var o = track.oils[i];
      if (hyp(o.x - car.x, o.y - car.y) < o.r) return "oil";
    }
    var near = nearestSample(track, car.x, car.y);
    return near.dist > track.width * 0.5 + 4 ? "grass" : "asphalt";
  }

  /** Yksi kiinteä aika-askel. inputs = taulukko syötteitä (autoa kohti). */
  function step(state, inputs) {
    var track = state.track, cars = state.cars;
    var i, car, inp;

    if (state.phase === "countdown") {
      state.count -= DT;
      if (state.count <= 0) {
        state.phase = "racing";
        state.count = 0;
        state.events.push({ type: "go" });
      }
    } else if (state.phase !== "finished") {
      state.time += DT;
    }

    for (i = 0; i < cars.length; i++) {
      car = cars[i];
      inp = (state.phase === "racing" && !car.finished) ||
            (state.phase === "finished" && car.kind === "ai")
        ? (inputs && inputs[i]) || defaultInput()
        : defaultInput();
      // maalin jälkeen botit ja maaliin tulleet rullaavat vapaalla
      if (car.finished) inp = defaultInput();

      var surfName = carSurface(state, car);
      var surf = SURFACES[surfName];
      car.surf = surfName;

      var speed = hyp(car.vx, car.vy);

      // kääntö: teho kasvaa vauhdin mukana, peruuttaessa peilattu
      var fx = Math.cos(car.angle), fy = Math.sin(car.angle);
      var vf0 = car.vx * fx + car.vy * fy;
      var steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      var dir = vf0 < -5 ? -1 : 1;
      var sf = clamp(speed / 70, 0, 1) / (1 + speed / 900);
      car.angle = angNorm(car.angle + steer * CAR.steer * sf * dir * DT);

      // nopeus auton akselistossa (uusi keula)
      fx = Math.cos(car.angle); fy = Math.sin(car.angle);
      var vf = car.vx * fx + car.vy * fy;
      var vl = -car.vx * fy + car.vy * fx;

      if (inp.up) vf += CAR.accel * surf.accelMul * DT;
      if (inp.down) {
        if (vf > 10) vf -= CAR.brake * DT;
        else vf -= CAR.revAccel * surf.accelMul * DT;
      }
      vf -= vf * CAR.dragK * surf.dragMul * DT;
      vl *= Math.exp(-surf.grip * DT);
      if (vf < -CAR.maxRev) vf = -CAR.maxRev;

      // turbot
      car.boostT = Math.max(0, car.boostT - DT);
      for (var b = 0; b < track.boosts.length; b++) {
        var bp = track.boosts[b];
        if (hyp(bp.x - car.x, bp.y - car.y) < bp.r && vf > 40) {
          if (vf < CAR.boostMax) vf = Math.min(CAR.boostMax, vf + CAR.boostPush * DT);
          if (car.boostT <= 0) state.events.push({ type: "boost", car: i });
          car.boostT = 0.6;
        }
      }

      car.slip = Math.abs(vl);
      car.vx = fx * vf - fy * vl;
      car.vy = fy * vf + fx * vl;
      car.x += car.vx * DT;
      car.y += car.vy * DT;

      // maailman reunat (pehmeä kimmoke)
      if (car.x < 20) { car.x = 20; car.vx = Math.abs(car.vx) * 0.4; }
      if (car.x > WORLD.w - 20) { car.x = WORLD.w - 20; car.vx = -Math.abs(car.vx) * 0.4; }
      if (car.y < 20) { car.y = 20; car.vy = Math.abs(car.vy) * 0.4; }
      if (car.y > WORLD.h - 20) { car.y = WORLD.h - 20; car.vy = -Math.abs(car.vy) * 0.4; }
    }

    resolveCollisions(state);

    // portit ja kierrokset
    if (state.phase !== "countdown") {
      for (i = 0; i < cars.length; i++) touchGates(state, cars[i]);
    }

    // sijoitukset
    var standings = computeStandings(state);
    for (i = 0; i < standings.length; i++) cars[standings[i]].place = i + 1;

    // kilpailu päättyy kun kaikki ihmiset ovat maalissa — tai kun
    // ensimmäisen ihmisen maaliintulosta on kulunut armonaika (30 s)
    if (state.phase === "racing") {
      var humansLeft = 0, humans = 0, humansDone = 0;
      for (i = 0; i < cars.length; i++) {
        if (cars[i].kind === "human") {
          humans++;
          if (cars[i].finished) humansDone++; else humansLeft++;
        }
      }
      var anyLeft = 0;
      for (i = 0; i < cars.length; i++) if (!cars[i].finished) anyLeft++;
      if (humansDone > 0 && state.grace === null) state.grace = 30;
      if (state.grace !== null) state.grace -= DT;
      if ((humans > 0 && humansLeft === 0) || anyLeft === 0 ||
          (state.grace !== null && state.grace <= 0)) {
        state.phase = "finished";
        state.events.push({ type: "raceover" });
      }
    }
    return state;
  }

  function touchGates(state, car) {
    if (car.finished) return;
    var track = state.track, gates = track.gates, K = gates.length;
    var g = gates[car.nextGate];
    if (hyp(g.x - car.x, g.y - car.y) > track.gateR) return;
    car.nextGate = (car.nextGate + 1) % K;
    car.gatesCount++;
    if (gates.indexOf(g) === 0) {
      if (car.started) {
        var lapTime = state.time - car.lapStart;
        car.lastLap = lapTime;
        if (car.bestLap === null || lapTime < car.bestLap) car.bestLap = lapTime;
        car.lapsDone++;
        car.lapStart = state.time;
        if (car.lapsDone >= state.laps) {
          car.finished = true;
          state.finishedCount++;
          car.finishTime = state.time;
          state.events.push({ type: "finish", car: car.idx, time: state.time, place: state.finishedCount });
        } else {
          state.events.push({ type: "lap", car: car.idx, lap: car.lapsDone, time: lapTime, best: lapTime === car.bestLap });
        }
      } else {
        car.started = true;
        car.lapStart = state.time;
      }
    }
  }

  function resolveCollisions(state) {
    var cars = state.cars, R = CAR.radius;
    for (var i = 0; i < cars.length; i++) {
      for (var j = i + 1; j < cars.length; j++) {
        var a = cars[i], b = cars[j];
        var dx = b.x - a.x, dy = b.y - a.y;
        var d = hyp(dx, dy);
        if (d >= R * 2 || d === 0) continue;
        var nx = dx / d, ny = dy / d;
        var overlap = R * 2 - d;
        a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
        b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
        var rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          var imp = -(1 + 0.35) * rel * 0.5;
          a.vx -= nx * imp; a.vy -= ny * imp;
          b.vx += nx * imp; b.vy += ny * imp;
          if (imp > 25) state.events.push({ type: "hit", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, force: imp });
        }
      }
    }
  }

  /** Sijoitusjärjestys: maalissa olleet ajan mukaan, muut edistymisen mukaan. */
  function computeStandings(state) {
    var idx = state.cars.map(function (c) { return c.idx; });
    var track = state.track;
    idx.sort(function (ia, ib) {
      var a = state.cars[ia], b = state.cars[ib];
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      var ga = state.track.gates[a.nextGate], gb = state.track.gates[b.nextGate];
      var pa = a.gatesCount * 10000 - hyp(ga.x - a.x, ga.y - a.y);
      var pb = b.gatesCount * 10000 - hyp(gb.x - b.x, gb.y - b.y);
      return pb - pa;
    });
    return idx;
  }

  function formatTime(t) {
    if (t === null || t === undefined) return "–";
    var m = Math.floor(t / 60);
    var s = t - m * 60;
    var ss = s.toFixed(1);
    if (s < 10) ss = "0" + ss;
    return m + ":" + ss;
  }

  var api = {
    TRACKS: TRACKS, CAR: CAR, SURFACES: SURFACES, DT: DT, WORLD: WORLD,
    buildTrack: buildTrack, getTrack: getTrack,
    nearestSample: nearestSample, surfaceAt: surfaceAt,
    createRace: createRace, step: step, aiInput: aiInput,
    defaultInput: defaultInput, computeStandings: computeStandings,
    formatTime: formatTime
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SladiEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
