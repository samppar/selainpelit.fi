// Käpysota — moottori: maasto, fysiikka, vuorot, aseet, tekoäly.
// Puhdas logiikka ilman DOM:ia; kaikki satunnaisuus kulkee seedatun rng:n
// kautta, joten pelit ja testit ovat toistettavia.
(function (global) {
  "use strict";

  var W = 960;
  var H = 540;
  var WATER_Y = H - 30;      // vedenpinta; tämän alla ei ole maata
  var DT = 1 / 60;           // kiinteä fysiikka-askel
  var GRAV = 380;            // px/s^2
  var TURN_TIME = 45;        // s per vuoro
  var SUDDEN_AT = 30;        // vuoroa, jonka jälkeen äkkikuolema
  var SUDDEN_CAP = 30;       // äkkikuolemassa hp leikataan tähän
  var SUDDEN_DRAIN = 5;      // ja jokainen vuoro syö tämän verran
  var TEAM_SIZE = 3;
  var CHAR_H = 18;           // rungon korkeus törmäyksiin
  var CHAR_R = 9;            // rungon "säde" räjähdysosumiin
  var WALK = 70;             // px/s kävely
  var STEP_UP = 3;           // px nousua per fysiikka-askel kävellessä
  var SNAP_DOWN = 10;        // px, jonka verran jalat imeytyvät alamäkeen
  var JUMP_VY = -240;
  var JUMP_VX = 80;
  var FALL_SAFE = 270;       // px/s; kovempi tömähdys ottaa osumaa
  var MAX_SPEED = 620;       // ammuksen maksimilähtönopeus (power=1)

  var WEAPONS = {
    sinko: {
      key: "sinko", name: "Käpysinko", ammoName: "käpy",
      wind: true, r: 42, dmg: 46, fuse: 0, bounce: 0, cluster: 0
    },
    terho: {
      key: "terho", name: "Terhokranaatti", ammoName: "terho",
      wind: false, r: 38, dmg: 44, fuse: 3, bounce: 0.45, cluster: 0
    },
    marja: {
      key: "marja", name: "Marjapommi", ammoName: "marjaryöppy",
      wind: true, r: 26, dmg: 18, fuse: 0, bounce: 0,
      cluster: 5, clusterR: 22, clusterDmg: 14
    }
  };

  var TEAMS = [
    { name: "Punaiset", squirrels: ["Ruska", "Havu", "Käpälä"] },
    { name: "Harmaat", squirrels: ["Halla", "Sumu", "Viima"] }
  ];

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // —— Maasto ————————————————————————————————————————————————
  // Korkeuskäyrä = perustaso + siniaaltojen summa; bittikartta täytetään
  // käyrästä vedenpintaan. Räjähdykset kaivavat ympyröitä bittikartasta,
  // joten kraatterit ja jopa veteen asti puhkotut kuopat ovat mahdollisia.
  function genTerrain(rng) {
    var heights = new Float64Array(W);
    var base = H * 0.60 + (rng() - 0.5) * 40;
    var comps = [];
    for (var k = 0; k < 6; k++) {
      comps.push({
        amp: (16 + rng() * 52) / (k * 0.75 + 1),
        freq: (Math.PI * 2 * (0.55 + k * 0.85 + rng() * 0.6)) / W,
        phase: rng() * Math.PI * 2
      });
    }
    for (var x = 0; x < W; x++) {
      var y = base;
      for (k = 0; k < comps.length; k++) {
        y += comps[k].amp * Math.sin(x * comps[k].freq + comps[k].phase);
      }
      heights[x] = clamp(y, H * 0.32, WATER_Y - 36);
    }
    // Kevyt pehmennys, ettei käyrään jää teräviä piikkejä
    for (var pass = 0; pass < 2; pass++) {
      for (x = 1; x < W - 1; x++) {
        heights[x] = (heights[x - 1] + heights[x] * 2 + heights[x + 1]) / 4;
      }
    }
    var terrain = new Uint8Array(W * H);
    for (x = 0; x < W; x++) {
      for (var yy = Math.round(heights[x]); yy < WATER_Y; yy++) {
        terrain[yy * W + x] = 1;
      }
    }
    return { terrain: terrain, heights: heights };
  }

  function solidAt(st, x, y) {
    var xi = Math.round(x), yi = Math.round(y);
    if (xi < 0 || xi >= W || yi < 0 || yi >= H) return false;
    return st.terrain[yi * W + xi] === 1;
  }

  // Paikallinen maanpinta: ensimmäinen kiinteä piste ylhäältä lukien
  // ikkunassa [yFeet-up, yFeet+down]. Ei skannaa koko saraketta, jotta
  // räjähdysten luomat ulokkeet/kielekkeet toimivat oikein.
  function groundAt(st, x, yFeet, up, down) {
    var xi = clamp(Math.round(x), 0, W - 1);
    var start = Math.round(yFeet) - up;
    var end = Math.round(yFeet) + down;
    for (var yy = start; yy <= end; yy++) {
      if (yy >= 0 && yy < H && st.terrain[yy * W + xi] === 1) return yy;
    }
    return null;
  }

  // Ylin maanpinta sarakkeessa (spawnaukseen)
  function surfaceTop(st, x) {
    var xi = clamp(Math.round(x), 0, W - 1);
    for (var yy = 0; yy < H; yy++) {
      if (st.terrain[yy * W + xi] === 1) return yy;
    }
    return null;
  }

  function bodyBlocked(st, x, yFeet) {
    // Onko rungon kohdalla (jalkojen yläpuolella) maata → seinä edessä
    for (var yy = Math.round(yFeet) - CHAR_H; yy <= Math.round(yFeet) - 4; yy++) {
      if (solidAt(st, x, yy)) return true;
    }
    return false;
  }

  // —— Tila ————————————————————————————————————————————————
  function createState(opts) {
    opts = opts || {};
    var seed = (opts.seed == null ? 1 : opts.seed) >>> 0;
    var rng = mulberry32(seed);
    var gen = genTerrain(rng);
    var st = {
      seed: seed,
      rng: rng,
      mode: opts.mode === "hotseat" ? "hotseat" : "ai",
      aiLevel: opts.aiLevel === "helppo" ? "helppo" : "tarkka",
      terrain: gen.terrain,
      terrainVersion: 0,
      chars: [],
      projectiles: [],
      phase: "aim",          // aim | sim | over
      turnNo: 0,
      turnTeam: 1,           // beginTurn vaihtaa → 0 aloittaa
      nextIdx: [0, 0],       // per joukkue: kenen vuoro seuraavaksi
      activeId: -1,
      timer: TURN_TIME,
      wind: 0,
      shotFired: false,
      winner: null,
      suddenDeath: false,
      input: { move: 0, jump: false },
      events: []
    };

    // Spawnit: kuusi kaistaa jitterillä, sekoitettu järjestys, joukkueet
    // vuorotellen → oravat ripotellaan pitkin kenttää kuten Wormsissa.
    var n = TEAM_SIZE * 2;
    var margin = 70;
    var band = (W - margin * 2) / n;
    var slots = [];
    for (var i = 0; i < n; i++) {
      slots.push(margin + band * i + band * (0.2 + rng() * 0.6));
    }
    for (i = slots.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = slots[i]; slots[i] = slots[j]; slots[j] = tmp;
    }
    for (i = 0; i < n; i++) {
      var team = i % 2;
      var sx = slots[i];
      var sy = surfaceTop(st, sx);
      st.chars.push({
        id: i,
        team: team,
        name: TEAMS[team].squirrels[Math.floor(i / 2)],
        x: sx, y: sy, vx: 0, vy: 0,
        hp: 100, alive: true, airborne: false,
        facing: team === 0 ? 1 : -1,
        aim: 0.5
      });
    }
    beginTurn(st);
    return st;
  }

  function aliveOf(st, team) {
    return st.chars.filter(function (c) { return c.alive && c.team === team; });
  }

  function activeChar(st) {
    for (var i = 0; i < st.chars.length; i++) {
      if (st.chars[i].id === st.activeId) return st.chars[i];
    }
    return null;
  }

  function beginTurn(st) {
    st.turnNo++;
    st.turnTeam = 1 - st.turnTeam;
    st.wind = Math.round((st.rng() * 2 - 1) * 90);
    st.shotFired = false;
    st.input.move = 0;
    st.input.jump = false;
    st.timer = TURN_TIME;

    // Äkkikuolema: pitkittynyt peli painaa kaikkien hp:t alas
    if (st.turnNo >= SUDDEN_AT) {
      if (!st.suddenDeath) {
        st.suddenDeath = true;
        st.events.push({ t: "sudden" });
        st.chars.forEach(function (c) {
          if (c.alive && c.hp > SUDDEN_CAP) c.hp = SUDDEN_CAP;
        });
      } else {
        st.chars.forEach(function (c) {
          if (c.alive) {
            c.hp -= SUDDEN_DRAIN;
            if (c.hp <= 0) { c.hp = 0; c.alive = false; st.events.push({ t: "die", id: c.id, how: "sudden" }); }
          }
        });
        if (checkWin(st)) return;
      }
    }

    var team = aliveOf(st, st.turnTeam);
    if (team.length === 0) { checkWin(st); return; }
    var idx = st.nextIdx[st.turnTeam] % team.length;
    st.nextIdx[st.turnTeam] = (idx + 1) % Math.max(1, team.length);
    st.activeId = team[idx].id;
    st.phase = "aim";
    st.events.push({ t: "turn", team: st.turnTeam, id: st.activeId, wind: st.wind });
  }

  function checkWin(st) {
    var a0 = aliveOf(st, 0).length, a1 = aliveOf(st, 1).length;
    if (a0 > 0 && a1 > 0) return false;
    st.phase = "over";
    st.winner = a0 === 0 && a1 === 0 ? "draw" : (a0 > 0 ? 0 : 1);
    st.events.push({ t: "gameover", winner: st.winner });
    return true;
  }

  // —— Räjähdys ————————————————————————————————————————————————
  function explodeAt(st, x, y, r, dmg, spawnCluster) {
    var x0 = clamp(Math.floor(x - r), 0, W - 1), x1 = clamp(Math.ceil(x + r), 0, W - 1);
    var y0 = clamp(Math.floor(y - r), 0, H - 1), y1 = clamp(Math.ceil(y + r), 0, H - 1);
    for (var yy = y0; yy <= y1; yy++) {
      for (var xx = x0; xx <= x1; xx++) {
        var dx = xx - x, dy = yy - y;
        if (dx * dx + dy * dy <= r * r) st.terrain[yy * W + xx] = 0;
      }
    }
    st.terrainVersion++;
    st.events.push({ t: "explosion", x: x, y: y, r: r });

    st.chars.forEach(function (c) {
      if (!c.alive) return;
      var cx = c.x, cy = c.y - CHAR_H / 2;
      var d = Math.hypot(cx - x, cy - y);
      var reach = r + CHAR_R;
      if (d >= reach) return;
      var k = 1 - d / reach;
      var take = Math.max(1, Math.round(dmg * k));
      c.hp -= take;
      var nx = d > 0.01 ? (cx - x) / d : 0;
      var ny = d > 0.01 ? (cy - y) / d : -1;
      var kick = 130 + 270 * k;
      c.vx += nx * kick;
      c.vy += ny * kick - 70 * k;
      c.airborne = true;
      st.events.push({ t: "hurt", id: c.id, amount: take });
      if (c.hp <= 0) { c.hp = 0; }
    });

    if (spawnCluster && spawnCluster.count > 0) {
      for (var i = 0; i < spawnCluster.count; i++) {
        var ang = Math.PI * (0.28 + 0.44 * st.rng()); // ylöspäin viuhkana
        var sp = 130 + st.rng() * 130;
        st.projectiles.push({
          type: "marjanen",
          x: x, y: y - 4,
          vx: Math.cos(ang) * sp * (st.rng() < 0.5 ? -1 : 1),
          vy: -Math.sin(ang) * sp - 60,
          wind: false, r: spawnCluster.r, dmg: spawnCluster.dmg,
          fuse: 0, bounce: 0, cluster: 0, age: 0, graceId: -1
        });
      }
    }
  }

  // —— Ampuminen ————————————————————————————————————————————————
  function setAim(st, aim) {
    var c = activeChar(st);
    if (!c || st.phase !== "aim") return;
    c.aim = clamp(aim, -1.35, 1.45);
  }

  function setFacing(st, facing) {
    var c = activeChar(st);
    if (!c || st.phase !== "aim") return;
    c.facing = facing < 0 ? -1 : 1;
  }

  function fire(st, opts) {
    var c = activeChar(st);
    if (!c || st.phase !== "aim" || st.shotFired) return false;
    var wp = WEAPONS[opts.weapon] || WEAPONS.sinko;
    var power = clamp(opts.power == null ? 0.7 : opts.power, 0.15, 1);
    if (opts.aim != null) c.aim = clamp(opts.aim, -1.35, 1.45);
    if (opts.facing) c.facing = opts.facing < 0 ? -1 : 1;
    var dx = Math.cos(c.aim) * c.facing;
    var dy = -Math.sin(c.aim);
    var sp = MAX_SPEED * power;
    var bx = c.x + dx * 16;
    var by = c.y - 10 + dy * 16;
    st.projectiles.push({
      type: wp.key,
      x: bx, y: by,
      vx: dx * sp, vy: dy * sp,
      wind: wp.wind, r: wp.r, dmg: wp.dmg,
      fuse: wp.fuse, bounce: wp.bounce,
      cluster: wp.cluster ? { count: wp.cluster, r: wp.clusterR, dmg: wp.clusterDmg } : null,
      age: 0, graceId: c.id, resting: false
    });
    st.shotFired = true;
    st.phase = "sim";
    st.events.push({ t: "fire", weapon: wp.key, id: c.id, x: bx, y: by });
    return true;
  }

  function skipTurn(st) {
    if (st.phase !== "aim") return;
    st.events.push({ t: "skip", id: st.activeId });
    st.shotFired = true;
    st.phase = "sim"; // settle-polku hoitaa vuoron vaihdon
  }

  function setInput(st, input) {
    st.input.move = input.move || 0;
    st.input.jump = !!input.jump;
  }

  // —— Fysiikka-askel ————————————————————————————————————————————
  function stepProjectile(st, p) {
    p.age += DT;
    if (p.fuse > 0) {
      p.fuse -= DT;
      if (p.fuse <= 0) {
        explodeAt(st, p.x, p.y, p.r, p.dmg, p.cluster);
        return false;
      }
    }
    if (p.resting) return true; // terho lepää ja odottaa sytytintä

    var ax = p.wind ? st.wind : 0;
    p.vx += ax * DT;
    p.vy += GRAV * DT;
    var nx = p.x + p.vx * DT;
    var ny = p.y + p.vy * DT;

    // Näytteistä matka ~2 px välein, ettei nopea ammus hyppää maan läpi
    var dist = Math.hypot(nx - p.x, ny - p.y);
    var steps = Math.max(1, Math.ceil(dist / 2));
    for (var s = 1; s <= steps; s++) {
      var t = s / steps;
      var px = p.x + (nx - p.x) * t;
      var py = p.y + (ny - p.y) * t;

      if (px < -60 || px > W + 60) { st.events.push({ t: "flyout" }); return false; }
      if (py > WATER_Y + 4) { st.events.push({ t: "splash", x: px }); return false; }
      if (py < -3000) { st.events.push({ t: "flyout" }); return false; }

      // Osuma oravaan (ei ampujaan heti piipulla; terho ei räjähdä osumasta)
      if (p.bounce === 0) {
        for (var i = 0; i < st.chars.length; i++) {
          var c = st.chars[i];
          if (!c.alive) continue;
          if (c.id === p.graceId && p.age < 0.18) continue;
          var d = Math.hypot(c.x - px, (c.y - CHAR_H / 2) - py);
          if (d < CHAR_R + 4) {
            explodeAt(st, px, py, p.r, p.dmg, p.cluster);
            return false;
          }
        }
      }

      if (solidAt(st, px, py)) {
        if (p.bounce > 0) {
          // Normaali maastosta: kiinteiden pisteiden painopiste ympärillä
          var gx = 0, gy = 0;
          for (var oy = -3; oy <= 3; oy++) {
            for (var ox = -3; ox <= 3; ox++) {
              if (solidAt(st, px + ox, py + oy)) { gx += ox; gy += oy; }
            }
          }
          var gl = Math.hypot(gx, gy) || 1;
          var nxx = -gx / gl, nyy = -gy / gl;
          var dot = p.vx * nxx + p.vy * nyy;
          p.vx = (p.vx - 2 * dot * nxx) * p.bounce;
          p.vy = (p.vy - 2 * dot * nyy) * p.bounce;
          p.x = px + nxx * 3;
          p.y = py + nyy * 3;
          if (Math.hypot(p.vx, p.vy) < 45) { p.resting = true; p.vx = 0; p.vy = 0; }
          else st.events.push({ t: "bounce", x: px, y: py });
          return true;
        }
        explodeAt(st, px, py, p.r, p.dmg, p.cluster);
        return false;
      }
    }
    p.x = nx;
    p.y = ny;
    return true;
  }

  function stepChar(st, c) {
    if (!c.alive) return;

    if (!c.airborne) {
      // Vieläkö jalkojen alla on maata? (räjähdys saattoi kaivaa sen pois)
      var g = groundAt(st, c.x, c.y, 2, SNAP_DOWN);
      if (g == null) c.airborne = true;
      else c.y = g;
    }

    if (c.airborne) {
      c.vy += GRAV * DT;
      var nx = c.x + c.vx * DT;
      var ny = c.y + c.vy * DT;
      // Seinä sivulla?
      if (bodyBlocked(st, nx, c.y)) { nx = c.x; c.vx *= -0.2; }
      // Laskeutuminen: skannaa jalkojen matka
      if (c.vy > 0) {
        var top = Math.round(c.y);
        var bottom = Math.round(ny);
        for (var yy = top; yy <= bottom; yy++) {
          if (solidAt(st, nx, yy)) {
            c.x = nx; c.y = yy;
            var impact = c.vy;
            c.vx = 0; c.vy = 0; c.airborne = false;
            if (impact > FALL_SAFE) {
              var dmg = Math.max(1, Math.round((impact - FALL_SAFE) / 7));
              c.hp -= dmg;
              if (c.hp <= 0) c.hp = 0;
              st.events.push({ t: "thud", id: c.id, amount: dmg });
            } else if (impact > 120) {
              st.events.push({ t: "land", id: c.id });
            }
            return;
          }
        }
      }
      c.x = clamp(nx, 2, W - 2);
      c.y = ny;
    }

    if (c.y > WATER_Y + 4) {
      c.alive = false;
      c.hp = 0;
      st.events.push({ t: "drown", id: c.id, x: c.x });
    }
  }

  function worldSettled(st) {
    if (st.projectiles.length > 0) return false;
    for (var i = 0; i < st.chars.length; i++) {
      var c = st.chars[i];
      if (c.alive && c.airborne) return false;
    }
    return true;
  }

  function tick(st) {
    if (st.phase === "over") return;

    if (st.phase === "aim") {
      st.timer -= DT;
      var c = activeChar(st);
      if (c && c.alive) {
        if (st.input.move !== 0 && !c.airborne) {
          walk(st, c, st.input.move);
        }
        if (st.input.jump && !c.airborne) {
          c.vy = JUMP_VY;
          c.vx = c.facing * JUMP_VX;
          c.airborne = true;
          st.events.push({ t: "jump", id: c.id });
        }
        st.input.jump = false;
      }
      // Aktiivinen orava voi silti pudota (hyppy, reunalta astuminen)
      st.chars.forEach(function (ch) { stepChar(st, ch); });
      if (c && !c.alive) { skipTurn(st); return; }
      if (st.timer <= 0) {
        st.events.push({ t: "timeout", id: st.activeId });
        skipTurn(st);
      }
      return;
    }

    // phase === "sim": ammukset lentävät, oravat lentävät/putoavat.
    // Räjähdys voi kylvää uusia ammuksia (marjaset) kesken kierroksen, joten
    // iteroidaan vanha lista ja annetaan uusien kertyä tuoreeseen listaan.
    var flying = st.projectiles;
    st.projectiles = [];
    for (var pi = 0; pi < flying.length; pi++) {
      if (stepProjectile(st, flying[pi])) st.projectiles.push(flying[pi]);
    }
    st.chars.forEach(function (ch) { stepChar(st, ch); });

    if (worldSettled(st)) {
      // Kuolemat käsitellään kun pöly on laskeutunut
      st.chars.forEach(function (ch) {
        if (ch.alive && ch.hp <= 0) {
          ch.alive = false;
          st.events.push({ t: "die", id: ch.id, how: "hp" });
        }
      });
      if (!checkWin(st)) beginTurn(st);
    }
  }

  function walk(st, c, dir) {
    c.facing = dir < 0 ? -1 : 1;
    var nx = clamp(c.x + dir * WALK * DT, 4, W - 4);
    var g = groundAt(st, nx, c.y, STEP_UP, SNAP_DOWN);
    if (g == null) {
      // Reuna: astutaan tyhjän päälle → putoaminen
      if (!bodyBlocked(st, nx, c.y)) {
        c.x = nx;
        c.airborne = true;
        c.vx = dir * WALK * 0.6;
        c.vy = 0;
      }
      return;
    }
    if (g < c.y - STEP_UP) return;          // liian jyrkkä seinä
    if (bodyBlocked(st, nx, g)) return;      // runko ei mahdu
    c.x = nx;
    c.y = g;
  }

  // —— Tekoäly ————————————————————————————————————————————————
  // Simuloi laukauksen samalla integraattorilla mutta ilman sivuvaikutuksia;
  // palauttaa iskemäpisteen (tai veden/uloslennon).
  function simulateShot(st, sx, sy, vx, vy, weapon) {
    var wp = WEAPONS[weapon] || WEAPONS.sinko;
    var x = sx, y = sy, fuse = wp.fuse, resting = false;
    var maxT = 9;
    for (var t = 0; t < maxT; t += DT) {
      if (fuse > 0) {
        fuse -= DT;
        if (fuse <= 0) return { x: x, y: y, hit: "fuse" };
      }
      if (resting) continue;
      vx += (wp.wind ? st.wind : 0) * DT;
      vy += GRAV * DT;
      var nx = x + vx * DT;
      var ny = y + vy * DT;
      var dist = Math.hypot(nx - x, ny - y);
      var steps = Math.max(1, Math.ceil(dist / 2));
      for (var s = 1; s <= steps; s++) {
        var tt = s / steps;
        var px = x + (nx - x) * tt;
        var py = y + (ny - y) * tt;
        if (px < -60 || px > W + 60 || py < -3000) return { x: px, y: py, hit: "out" };
        if (py > WATER_Y + 4) return { x: px, y: py, hit: "water" };
        if (solidAt(st, px, py)) {
          if (wp.bounce > 0) {
            var gx = 0, gy = 0;
            for (var oy = -3; oy <= 3; oy++) {
              for (var ox = -3; ox <= 3; ox++) {
                if (solidAt(st, px + ox, py + oy)) { gx += ox; gy += oy; }
              }
            }
            var gl = Math.hypot(gx, gy) || 1;
            var nxx = -gx / gl, nyy = -gy / gl;
            var dot = vx * nxx + vy * nyy;
            vx = (vx - 2 * dot * nxx) * wp.bounce;
            vy = (vy - 2 * dot * nyy) * wp.bounce;
            px += nxx * 3;
            py += nyy * 3;
            if (Math.hypot(vx, vy) < 45) { resting = true; vx = 0; vy = 0; }
            x = px; y = py;
            nx = px; ny = py;
            break;
          }
          return { x: px, y: py, hit: "ground" };
        }
      }
      x = nx; y = ny;
    }
    return { x: x, y: y, hit: "timeout" };
  }

  function scoreImpact(st, me, wx, wy, r, dmg) {
    var score = 0, nearestEnemy = 1e9, any = false;
    for (var i = 0; i < st.chars.length; i++) {
      var c = st.chars[i];
      if (!c.alive) continue;
      var d = Math.hypot(c.x - wx, (c.y - CHAR_H / 2) - wy);
      var reach = r + CHAR_R;
      if (c.team !== me.team) {
        nearestEnemy = Math.min(nearestEnemy, d);
        if (d < reach) {
          var est = dmg * (1 - d / reach);
          score += est + (est >= c.hp ? 30 : 0);
          any = true;
        }
      } else if (d < reach) {
        var self = dmg * (1 - d / reach);
        score -= self * (c.id === me.id ? 2.2 : 1.6);
      }
    }
    if (!any) score -= nearestEnemy / 40; // ohilaukaus: lähelle on parempi
    return score;
  }

  // Etsii parhaan (ase, kulma, voima) simuloimalla ehdokaslaukauksia.
  // "tarkka" ampuu parhaan löydön; "helppo" lisää tähtäysvirhettä.
  function aiPlan(st) {
    var me = activeChar(st);
    if (!me) return null;
    var sx0 = me.x, sy0 = me.y - 10;
    var best = null;
    var weapons = ["sinko", "terho"];
    for (var w = 0; w < weapons.length; w++) {
      var wp = WEAPONS[weapons[w]];
      for (var deg = -10; deg <= 190; deg += 4) {
        var a = deg * Math.PI / 180;
        var dx = Math.cos(a), dy = -Math.sin(a);
        for (var pow = 0.3; pow <= 1.001; pow += 0.1) {
          var sp = MAX_SPEED * pow;
          var sx = sx0 + dx * 16, sy = sy0 + dy * 16;
          if (solidAt(st, sx, sy)) continue; // piippu maan sisässä
          var hit = simulateShot(st, sx, sy, dx * sp, dy * sp, wp.key);
          if (hit.hit === "out" || hit.hit === "timeout") continue;
          var sc = hit.hit === "water"
            ? -200 - Math.abs(hit.x - sx0) / 50
            : scoreImpact(st, me, hit.x, hit.y, wp.r, wp.dmg);
          if (!best || sc > best.score) {
            best = { score: sc, weapon: wp.key, angleWorld: a, power: pow };
          }
        }
      }
    }
    if (!best) return { weapon: "sinko", aim: 0.6, facing: me.facing, power: 0.6 };

    if (st.aiLevel === "helppo") {
      best.angleWorld += (st.rng() - 0.5) * (16 * Math.PI / 180);
      best.power = clamp(best.power * (1 + (st.rng() - 0.5) * 0.22), 0.15, 1);
    }
    // Maailmankulma → facing + paikallinen aim
    var facing = Math.cos(best.angleWorld) >= 0 ? 1 : -1;
    var aim = Math.atan2(Math.sin(best.angleWorld), Math.cos(best.angleWorld) * facing);
    return {
      weapon: best.weapon,
      facing: facing,
      aim: clamp(aim, -1.35, 1.45),
      power: best.power,
      score: best.score
    };
  }

  // —— Näkymä ————————————————————————————————————————————————
  function getView(st) {
    return {
      W: W, H: H, waterY: WATER_Y,
      phase: st.phase,
      mode: st.mode,
      turnNo: st.turnNo,
      turnTeam: st.turnTeam,
      activeId: st.activeId,
      timer: Math.max(0, st.timer),
      wind: st.wind,
      winner: st.winner,
      suddenDeath: st.suddenDeath,
      shotFired: st.shotFired,
      teams: [0, 1].map(function (t) {
        var list = aliveOf(st, t);
        return {
          name: TEAMS[t].name,
          alive: list.length,
          hp: list.reduce(function (s, c) { return s + c.hp; }, 0)
        };
      }),
      chars: st.chars.map(function (c) {
        return {
          id: c.id, team: c.team, name: c.name,
          x: c.x, y: c.y, hp: c.hp, alive: c.alive,
          facing: c.facing, aim: c.aim, airborne: c.airborne
        };
      }),
      projectiles: st.projectiles.map(function (p) {
        return { type: p.type, x: p.x, y: p.y, vx: p.vx, vy: p.vy, fuse: p.fuse, resting: p.resting };
      })
    };
  }

  function drainEvents(st) {
    return st.events.splice(0, st.events.length);
  }

  var api = {
    W: W, H: H, WATER_Y: WATER_Y, DT: DT,
    TURN_TIME: TURN_TIME, TEAM_SIZE: TEAM_SIZE, SUDDEN_AT: SUDDEN_AT,
    CHAR_H: CHAR_H, CHAR_R: CHAR_R, MAX_SPEED: MAX_SPEED, GRAV: GRAV,
    WEAPONS: WEAPONS, TEAMS: TEAMS,
    createState: createState,
    tick: tick,
    setInput: setInput,
    setAim: setAim,
    setFacing: setFacing,
    fire: fire,
    skipTurn: skipTurn,
    getView: getView,
    drainEvents: drainEvents,
    aiPlan: aiPlan,
    simulateShot: simulateShot,
    solidAt: solidAt,
    surfaceTop: surfaceTop,
    groundAt: groundAt,
    explodeAt: explodeAt,
    activeChar: activeChar
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.KapysotaEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
