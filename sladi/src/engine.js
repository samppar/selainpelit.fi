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
    radius: 14,      // törmäysympyrän säde
    boostMax: 470,   // huippunopeus turbolla
    boostPush: 950   // turbon kiihdytys
  };

  /* Ajoneuvoluokat alkuperäisklassikon hengessä: nopea formula, tasapainoinen
   * sportti, hiekalla pitävä ralli ja raskas paku joka voittaa kolarit. */
  var VEHICLES = {
    formula: {
      name: "Formula", desc: "nopein — mutta arka hiekalle",
      accel: 300, top: 400, steer: 3.45, gripMul: 1.1,
      offAccel: 0.7, offDrag: 1.35, mass: 0.85
    },
    sportti: {
      name: "Sportti", desc: "tasapainoinen yleisauto",
      accel: 265, top: 340, steer: 3.2, gripMul: 1.0,
      offAccel: 1.0, offDrag: 1.0, mass: 1.0
    },
    ralli: {
      name: "Ralli", desc: "kulkee hiekalla ja nurmella",
      accel: 255, top: 315, steer: 3.3, gripMul: 0.88,
      offAccel: 1.55, offDrag: 0.55, mass: 1.05
    },
    paku: {
      name: "Paku", desc: "hidas ja raskas — voittaa kolarit",
      accel: 235, top: 300, steer: 2.85, gripMul: 1.28,
      offAccel: 0.95, offDrag: 0.9, mass: 1.6
    }
  };

  var SURFACES = {
    asphalt: { grip: 8.5, dragMul: 1.0, accelMul: 1.0 },
    // ulosajo hidastaa muttei rankaise kohtuuttomasti — Slicks-henki
    grass:   { grip: 3.6, dragMul: 1.55, accelMul: 0.6 },
    oil:     { grip: 0.7, dragMul: 1.0, accelMul: 1.0 },
    mud:     { grip: 4.5, dragMul: 2.3, accelMul: 0.55 },
    water:   { grip: 2.5, dragMul: 5.0, accelMul: 0.22 }
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
      blurb: "Leveä ja nopea peruslenkki: pitkät suorat ja yksi mutkatasku.",
      width: 145,
      laps: 4,
      points: [
        [220, 140], [850, 120], [1460, 140], [1545, 240], [1550, 500],
        [1540, 760], [1450, 890], [1150, 920], [950, 900], [865, 755],
        [755, 700], [645, 745], [560, 885], [380, 910], [190, 860],
        [130, 650], [140, 340]
      ],
      startFrac: 0.06,
      boosts: [{ frac: 0.20 }, { frac: 0.66 }],
      oils: [{ frac: 0.44, side: 0.35 }],
      muds: [{ frac: 0.30, side: -0.5, r: 46 }],
      waters: [{ frac: 0.55, side: 2.8, r: 62 }],
      obst: [{ frac: 0.34, side: 0.3, r: 22 }, { frac: 0.74, side: -0.35, r: 18 }],
      walls: [{ frac: 0.13, side: 0, len: 240 }]
    },
    {
      id: "serpentiini",
      name: "Serpentiini",
      blurb: "Hiekkaerämaan neljä pitkää suoraa — jarruta ennen päätykäännöstä.",
      width: 130,
      theme: "sand",
      laps: 4,
      points: [
        [180, 140], [800, 120], [1400, 130], [1520, 200], [1530, 330],
        [1450, 420], [950, 465], [520, 450], [400, 530], [420, 650],
        [560, 745], [1050, 715], [1400, 745], [1520, 820], [1510, 930],
        [1350, 975], [700, 960], [260, 935], [140, 830], [110, 600],
        [115, 350]
      ],
      startFrac: 0.02,
      boosts: [{ frac: 0.08 }],
      oils: [{ frac: 0.33, side: -0.3 }, { frac: 0.75, side: 0.3 }],
      muds: [{ frac: 0.57, side: 0.4, r: 44 }],
      waters: [{ frac: 0.06, side: 2.8, r: 48 }, { frac: 0.86, side: 2.8, r: 55 }],
      obst: [{ frac: 0.42, side: 0.3, r: 18 }],
      walls: [{ frac: 0.63, side: 0, len: 220 }]
    },
    {
      id: "kahdeksikko",
      name: "Kahdeksikko",
      blurb: "Rata ylittää itsensä sillalla — alempi tie sukeltaa alitse.",
      width: 120,
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
      oils: [{ frac: 0.63, side: 0 }],
      muds: [{ frac: 0.10, side: -0.4, r: 40 }],
      waters: [{ frac: 0.25, side: 2.6, r: 55 }],
      obst: [{ frac: 0.44, side: 0.25, r: 18 }, { frac: 0.94, side: -0.25, r: 18 }]
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
    // säde kattaa koko tienleveyden + pienen oikaisuvaran
    var gateR = def.width * 0.62 + 18;
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

    function featAt(fd, defR) {
      var sp = atFrac(fd.frac);
      var nx = -Math.sin(sp.dir), ny = Math.cos(sp.dir);
      var lat = (fd.side || 0) * def.width * 0.5;
      return { x: sp.x + nx * lat, y: sp.y + ny * lat, r: fd.r || defR };
    }
    var boosts = (def.boosts || []).map(function (bd) {
      var sp = atFrac(bd.frac);
      return { x: sp.x, y: sp.y, a: sp.dir, r: Math.max(34, def.width * 0.40) };
    });
    var oils = (def.oils || []).map(function (od) {
      return featAt(od, Math.max(30, def.width * 0.34));
    });
    var muds = (def.muds || []).map(function (md) {
      return featAt(md, def.width * 0.3);
    });
    var obstacles = (def.obst || []).map(function (od) {
      return featAt(od, 20);
    });
    // violetit seinäesteet: kapseli radan suuntaisesti
    var walls = (def.walls || []).map(function (wd) {
      var ctr = featAt(wd, 0);
      var sp = atFrac(wd.frac);
      var half = (wd.len || 200) / 2;
      var dx = Math.cos(sp.dir), dy = Math.sin(sp.dir);
      return {
        x1: ctr.x - dx * half, y1: ctr.y - dy * half,
        x2: ctr.x + dx * half, y2: ctr.y + dy * half,
        r: 7
      };
    });
    // pisteet joita botit kiertävät (rengaskasat + seinien päät ja keskikohdat)
    var avoidPts = obstacles.slice();
    walls.forEach(function (w) {
      for (var k = 0; k <= 3; k++) {
        avoidPts.push({
          x: w.x1 + (w.x2 - w.x1) * k / 3,
          y: w.y1 + (w.y2 - w.y1) * k / 3,
          r: w.r + 12
        });
      }
    });
    // vesialtaat radan ulkopuolelle; valitse se puoli jolla on enemmän tilaa
    function distToLine(x, y) {
      var bd = Infinity;
      for (var k = 0; k < N; k += 4) {
        var dd = (samples[k].x - x) * (samples[k].x - x) + (samples[k].y - y) * (samples[k].y - y);
        if (dd < bd) bd = dd;
      }
      return Math.sqrt(bd);
    }
    var waters = (def.waters || []).map(function (wd) {
      var a = featAt(wd, 60);
      var b = featAt({ frac: wd.frac, side: -(wd.side || 0), r: wd.r }, 60);
      return distToLine(a.x, a.y) >= distToLine(b.x, b.y) ? a : b;
    });

    // sillat: etsi radan itseleikkaus — lähekkäiset näytteet, jotka ovat
    // rataa pitkin kaukana toisistaan. Jälkimmäinen haara on siltakansi.
    var bridges = [];
    var minSep = Math.round(N * 0.2), bestD = def.width * 0.5, bi = -1, bj = -1;
    for (i = 0; i < N; i += 2) {
      for (j = i + minSep; j < N && j < i + N - minSep; j += 2) {
        var bd2 = hyp(samples[i].x - samples[j].x, samples[i].y - samples[j].y);
        if (bd2 < bestD) { bestD = bd2; bi = i; bj = j; }
      }
    }
    if (bi >= 0) {
      bridges.push({
        x: (samples[bi].x + samples[bj].x) / 2,
        y: (samples[bi].y + samples[bj].y) / 2,
        r: def.width * 1.15,
        ia: bi,       // alempi tie
        ib: bj,       // siltakansi
        deckHalf: Math.round((def.width * 1.5) / SPACING)
      });
    }

    // näkymän ja fysiikan rajat: radan äärimitat + reunakaista
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (i = 0; i < N; i++) {
      if (samples[i].x < minX) minX = samples[i].x;
      if (samples[i].x > maxX) maxX = samples[i].x;
      if (samples[i].y < minY) minY = samples[i].y;
      if (samples[i].y > maxY) maxY = samples[i].y;
    }
    var pad = def.width / 2 + 80;
    var bounds = {
      minX: minX - pad, minY: minY - pad,
      maxX: maxX + pad, maxY: maxY + pad
    };
    bounds.w = bounds.maxX - bounds.minX;
    bounds.h = bounds.maxY - bounds.minY;

    return {
      def: def, id: def.id, name: def.name, width: def.width,
      samples: samples, spacing: SPACING, length: length,
      gates: gates, gateR: gateR, boosts: boosts, oils: oils,
      muds: muds, waters: waters, obstacles: obstacles, walls: walls,
      avoidPts: avoidPts, bridges: bridges,
      world: WORLD, bounds: bounds
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
    var i, o;
    for (i = 0; i < track.oils.length; i++) {
      o = track.oils[i];
      if (hyp(o.x - x, o.y - y) < o.r) return "oil";
    }
    for (i = 0; i < track.muds.length; i++) {
      o = track.muds[i];
      if (hyp(o.x - x, o.y - y) < o.r) return "mud";
    }
    for (i = 0; i < track.waters.length; i++) {
      o = track.waters[i];
      if (hyp(o.x - x, o.y - y) < o.r) return "water";
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
      var backSamples = Math.round((30 + Math.floor(i / 2) * 46) / SPACING);
      var si = (N - backSamples) % N;
      var sp = S[si];
      var nx = -Math.sin(sp.dir), ny = Math.cos(sp.dir);
      var lat = (i % 2 === 0 ? -1 : 1) * Math.max(19, track.width * 0.18);
      cars.push({
        idx: i, kind: L.kind, name: L.name, color: L.color,
        skill: L.skill || "kova",
        veh: VEHICLES[L.vehicle] ? L.vehicle : "sportti",
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

    // katsepiste edempänä radalla — kukin botti ajaa omaa kaistaansa
    var lookDist = clamp(speed * sk.look + 50, 80, 230);
    var lookN = Math.round(lookDist / SPACING);
    var target = S[(near.i + lookN) % N];
    var lane = Math.sin(idx * 2.1 + 0.8) * track.width * 0.24;
    var tx = target.x - Math.sin(target.dir) * lane;
    var ty = target.y + Math.cos(target.dir) * lane;
    var aim = Math.atan2(ty - car.y, tx - car.x);

    // väistä rengaskasat ja seinät: jos este on edessä ajolinjalla, kierrä ohi
    var obs = track.avoidPts;
    for (var oi = 0; oi < obs.length; oi++) {
      var ob = obs[oi];
      var od = hyp(ob.x - car.x, ob.y - car.y);
      var range = clamp(speed * 0.8, 130, 280);
      if (od > range || od < 1) continue;
      var oAng = Math.atan2(ob.y - car.y, ob.x - car.x);
      var rel = angNorm(oAng - aim);
      if (Math.abs(rel) < 0.5) {
        var dodge = (rel === 0 ? (idx % 2 ? 1 : -1) : (rel > 0 ? -1 : 1));
        aim += dodge * (0.55 * (1 - od / range) + 0.15);
      }
    }

    var noise = Math.sin(state.time * 1.7 + idx * 2.39) * sk.noise;
    var diff = angNorm(aim - car.angle + noise);

    inp.left = diff < -0.06;
    inp.right = diff > 0.06;

    // kaasu/jarru mutkan jyrkkyyden ja nopeuden mukaan
    var sharp = Math.abs(diff);
    var top = VEHICLES[car.veh].top * sk.topFrac;
    if (sharp > sk.brakeAt && speed > 150) inp.down = true;
    else if (sharp > sk.liftAt && speed > 120) { /* rullaa */ }
    else if (speed < top) inp.up = true;
    return inp;
  }

  function carSurface(state, car) {
    return surfaceAt(state.track, car.x, car.y);
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

      // seuraa auton kohtaa keskilinjalla (haaratieto siltoja varten)
      var nw = nearestWindow(track, car.x, car.y, car.aiCi, 30);
      if (nw.dist > 260) nw = nearestSample(track, car.x, car.y);
      car.aiCi = nw.i;

      var surfName = carSurface(state, car);
      var surf = SURFACES[surfName];
      car.surf = surfName;
      var veh = VEHICLES[car.veh];

      var speed = hyp(car.vx, car.vy);

      // kääntö: teho kasvaa vauhdin mukana, peruuttaessa peilattu
      var fx = Math.cos(car.angle), fy = Math.sin(car.angle);
      var vf0 = car.vx * fx + car.vy * fy;
      var steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      var dir = vf0 < -5 ? -1 : 1;
      var sf = clamp(speed / 70, 0, 1) / (1 + speed / 900);
      car.angle = angNorm(car.angle + steer * veh.steer * sf * dir * DT);

      // nopeus auton akselistossa (uusi keula)
      fx = Math.cos(car.angle); fy = Math.sin(car.angle);
      var vf = car.vx * fx + car.vy * fy;
      var vl = -car.vx * fy + car.vy * fx;

      // ajoneuvokohtainen maastokelpoisuus
      var accelMul = surfName === "asphalt" ? 1 : clamp(surf.accelMul * veh.offAccel, 0, 1);
      var dragMul = surfName === "asphalt" ? 1 : 1 + (surf.dragMul - 1) * veh.offDrag;
      var grip = surfName === "oil" ? surf.grip : surf.grip * veh.gripMul;
      var dragK = veh.accel / veh.top;

      if (inp.up) vf += veh.accel * accelMul * DT;
      if (inp.down) {
        if (vf > 10) vf -= CAR.brake * DT;
        else vf -= CAR.revAccel * accelMul * DT;
      }
      vf -= vf * dragK * dragMul * DT;
      vl *= Math.exp(-grip * DT);
      if (vf < -CAR.maxRev) vf = -CAR.maxRev;

      // turbot
      car.boostT = Math.max(0, car.boostT - DT);
      var boostMax = Math.max(CAR.boostMax, veh.top * 1.17);
      for (var b = 0; b < track.boosts.length; b++) {
        var bp = track.boosts[b];
        if (hyp(bp.x - car.x, bp.y - car.y) < bp.r && vf > 40) {
          if (vf < boostMax) vf = Math.min(boostMax, vf + CAR.boostPush * DT);
          if (car.boostT <= 0) state.events.push({ type: "boost", car: i });
          car.boostT = 0.6;
        }
      }

      car.slip = Math.abs(vl);
      car.vx = fx * vf - fy * vl;
      car.vy = fy * vf + fx * vl;
      car.x += car.vx * DT;
      car.y += car.vy * DT;

      // näkymän reunat (pehmeä kimmoke) — autot pysyvät rajatussa kuvassa
      var bnd = track.bounds;
      if (car.x < bnd.minX + 20) { car.x = bnd.minX + 20; car.vx = Math.abs(car.vx) * 0.4; }
      if (car.x > bnd.maxX - 20) { car.x = bnd.maxX - 20; car.vx = -Math.abs(car.vx) * 0.4; }
      if (car.y < bnd.minY + 20) { car.y = bnd.minY + 20; car.vy = Math.abs(car.vy) * 0.4; }
      if (car.y > bnd.maxY - 20) { car.y = bnd.maxY - 20; car.vy = -Math.abs(car.vy) * 0.4; }
    }

    resolveCollisions(state);
    resolveObstacles(state);
    resolveWalls(state);

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

  /** Onko auto siltakannella (vai alemmalla tiellä)? null = ei sillalla. */
  function bridgeLevel(track, car) {
    var N = track.samples.length;
    for (var i = 0; i < track.bridges.length; i++) {
      var br = track.bridges[i];
      if (hyp(br.x - car.x, br.y - car.y) > br.r) continue;
      var da = Math.min(Math.abs(car.aiCi - br.ia), N - Math.abs(car.aiCi - br.ia));
      var db = Math.min(Math.abs(car.aiCi - br.ib), N - Math.abs(car.aiCi - br.ib));
      return db < da ? 1 : 0;
    }
    return null;
  }

  function resolveCollisions(state) {
    var cars = state.cars, R = CAR.radius;
    for (var i = 0; i < cars.length; i++) {
      for (var j = i + 1; j < cars.length; j++) {
        var a = cars[i], b = cars[j];
        // sillalla eri tasoilla ajavat eivät kohtaa
        var la = bridgeLevel(state.track, a), lb = bridgeLevel(state.track, b);
        if (la !== null && lb !== null && la !== lb) continue;
        var dx = b.x - a.x, dy = b.y - a.y;
        var d = hyp(dx, dy);
        if (d >= R * 2 || d === 0) continue;
        var nx = dx / d, ny = dy / d;
        var ma = VEHICLES[a.veh].mass, mb = VEHICLES[b.veh].mass;
        var overlap = R * 2 - d;
        a.x -= nx * overlap * (mb / (ma + mb)); a.y -= ny * overlap * (mb / (ma + mb));
        b.x += nx * overlap * (ma / (ma + mb)); b.y += ny * overlap * (ma / (ma + mb));
        var rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          var imp = -(1 + 0.35) * rel / (1 / ma + 1 / mb);
          a.vx -= nx * imp / ma; a.vy -= ny * imp / ma;
          b.vx += nx * imp / mb; b.vy += ny * imp / mb;
          if (imp > 25) state.events.push({ type: "hit", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, force: imp });
        }
      }
    }
  }

  /** Rengaskasat yms. kiinteät esteet: työnnä auto ulos ja kimmota. */
  function resolveObstacles(state) {
    var obs = state.track.obstacles, R = CAR.radius;
    for (var i = 0; i < state.cars.length; i++) {
      var car = state.cars[i];
      for (var j = 0; j < obs.length; j++) {
        var o = obs[j];
        var dx = car.x - o.x, dy = car.y - o.y;
        var d = hyp(dx, dy), lim = R + o.r;
        if (d >= lim || d === 0) continue;
        var nx = dx / d, ny = dy / d;
        car.x = o.x + nx * lim;
        car.y = o.y + ny * lim;
        var vn = car.vx * nx + car.vy * ny;
        if (vn < 0) {
          car.vx -= (1 + 0.45) * vn * nx;
          car.vy -= (1 + 0.45) * vn * ny;
          if (-vn > 80) state.events.push({ type: "hit", x: o.x + nx * o.r, y: o.y + ny * o.r, force: -vn });
        }
      }
    }
  }

  /** Violetit seinäesteet: kapselitörmäys — työnnä ulos ja kimmota. */
  function resolveWalls(state) {
    var walls = state.track.walls, R = CAR.radius;
    for (var i = 0; i < state.cars.length; i++) {
      var car = state.cars[i];
      for (var j = 0; j < walls.length; j++) {
        var w = walls[j];
        var wx = w.x2 - w.x1, wy = w.y2 - w.y1;
        var len2 = wx * wx + wy * wy;
        var t = len2 === 0 ? 0 :
          clamp(((car.x - w.x1) * wx + (car.y - w.y1) * wy) / len2, 0, 1);
        var px = w.x1 + wx * t, py = w.y1 + wy * t;
        var dx = car.x - px, dy = car.y - py;
        var d = hyp(dx, dy), lim = R + w.r;
        if (d >= lim || d === 0) continue;
        var nx = dx / d, ny = dy / d;
        car.x = px + nx * lim;
        car.y = py + ny * lim;
        var vn = car.vx * nx + car.vy * ny;
        if (vn < 0) {
          car.vx -= (1 + 0.4) * vn * nx;
          car.vy -= (1 + 0.4) * vn * ny;
          if (-vn > 80) state.events.push({ type: "hit", x: px, y: py, force: -vn });
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
    TRACKS: TRACKS, CAR: CAR, SURFACES: SURFACES, VEHICLES: VEHICLES,
    DT: DT, WORLD: WORLD,
    buildTrack: buildTrack, getTrack: getTrack,
    nearestSample: nearestSample, surfaceAt: surfaceAt,
    createRace: createRace, step: step, aiInput: aiInput,
    defaultInput: defaultInput, computeStandings: computeStandings,
    bridgeLevel: bridgeLevel, formatTime: formatTime
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.SladiEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
