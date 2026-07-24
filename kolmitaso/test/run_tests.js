const E = require("../src/engine.js");

let pass = 0, fail = 0;
function ok(value, message) {
  if (value) pass++;
  else { fail++; console.error("FAIL:", message); }
}
const noInput = { pitch: 0, power: 0, fire: false, bomb: false, flip: false };
const inp = (o) => Object.assign({}, noInput, o);
function runSteps(state, n, input) {
  for (let i = 0; i < n; i++) E.step(state, input);
}
// Nostaa pelaajan ilmaan valmiiseen lentotilaan (fysiikan ohi, testifixtuuri)
function airborne(state, x, y, facingRight) {
  const p = E.playerOf(state);
  p.onGround = false; p.dead = false;
  p.hp = p.maxHp; p.fuel = 100;
  p.x = x; p.y = y;
  p.ang = facingRight === false ? Math.PI : 0;
  p.flipped = facingRight === false;
  const v = 250;
  p.vx = facingRight === false ? -v : v;
  p.vy = 0;
  p.throttle = 1;
  return p;
}

console.log("Kolmitaso — maasto, lentofysiikka, aseet, AI ja tehtävät");

// —— Maasto ——
{
  const { terrain, structures } = E.makeTerrain(E.MISSIONS[0]);
  ok(terrain.hs.every(Number.isFinite), "korkeuskartassa ei NaN-arvoja");
  ok(terrain.runways.length === 2, "kaksi kiitorataa");
  for (const rw of terrain.runways) {
    let flat = true;
    for (let x = rw.x0; x <= rw.x1; x += 8) {
      if (Math.abs(E.groundY(terrain, x) - rw.y) > 0.5) flat = false;
    }
    ok(flat, `kiitorata ${rw.side} on tasainen`);
  }
  ok(E.onRunway(terrain, (terrain.runways[0].x0 + terrain.runways[0].x1) / 2, 0), "oma kiitorata tunnistetaan");
  ok(!E.onRunway(terrain, terrain.W / 2, null), "keskimaasto ei ole kiitorataa");
  // Rakennukset maan pinnalla ja vihollisen puolella
  ok(structures.length > 0, "rakennuksia luotu");
  for (const s of structures) {
    ok(Math.abs(s.y - E.groundY(terrain, s.x)) < 1, `${s.type} seisoo maassa`);
    ok(s.x > terrain.W / 2, `${s.type} vihollisen puolella`);
  }
  // Determinismi
  const t2 = E.makeTerrain(E.MISSIONS[0]);
  ok(JSON.stringify(terrain.hs) === JSON.stringify(t2.terrain.hs), "sama seed → sama maasto");
  const t3 = E.makeTerrain(E.MISSIONS[1]);
  ok(JSON.stringify(terrain.hs) !== JSON.stringify(t3.terrain.hs), "eri tehtävä → eri maasto");
  // Kaikki tehtävät kunnossa
  for (const m of E.MISSIONS) {
    const { terrain: tr, structures: ss } = E.makeTerrain(m);
    ok(tr.hs.every(Number.isFinite), `maasto ${m.id} kunnossa`);
    ok(ss.filter((s) => s.type === "it").length === m.aa, `${m.id}: it-tykkien määrä`);
    ok(ss.filter((s) => s.type === "halli").length === m.hangars, `${m.id}: hallien määrä`);
  }
}

// —— Tehtävän luonti ——
{
  const st = E.createMission({ missionId: "rintama", seed: 7 });
  const p = E.playerOf(st);
  ok(!!p && p.isPlayer && p.side === 0, "pelaajan kone luotu");
  ok(p.onGround, "pelaaja aloittaa maasta");
  ok(!!E.onRunway(st.terrain, p.x, 0), "pelaaja aloittaa omalta kiitoradalta");
  ok(p.fuel === 100 && p.ammo === 120 && p.bombs === 4 && p.hp === 100, "tankit ja aseet täynnä");
  ok(st.lives === E.LIVES, "kolme konetta käytössä");
  ok(E.targetsTotal(st) > 0 && E.targetsLeft(st) === E.targetsTotal(st), "maalit alussa ehjiä");
  ok(!st.over && st.outcome === null, "tehtävä käynnissä");
}

// —— Lentoonlähtö ——
{
  const st = E.createMission({ missionId: "rintama", seed: 7 });
  const p = E.playerOf(st);
  // Täysi kaasu kiitoradalla (1.5 s pysyy radalla)
  runSteps(st, 90, inp({ power: 1 }));
  ok(Math.abs(p.vx) > E.TAKEOFF_V, `vauhti kasvaa kiitoradalla (${p.vx.toFixed(0)} px/s)`);
  ok(p.onGround && !p.dead, "ilman vetoa pysyy maassa");
  // Nokka ylös → ilmaan
  let rose = false;
  for (let i = 0; i < 300 && !rose; i++) {
    E.step(st, inp({ power: 1, pitch: -1 }));
    if (!p.onGround) rose = true;
  }
  ok(rose, "kone nousee ilmaan vedettäessä");
  const y0 = p.y;
  runSteps(st, 120, inp({ power: 1, pitch: -0.4 }));
  ok(p.y < y0 - 40 && !p.dead, `kone kiipeää (${(y0 - p.y).toFixed(0)} px)`);
}

// —— Fysiikka: nopeus, sakkaus ——
{
  const st = E.createMission({ missionId: "rintama", seed: 7 });
  const p = airborne(st, 1500, 400);
  runSteps(st, 600, inp({ power: 1 }));
  const vTop = Math.hypot(p.vx, p.vy);
  ok(vTop > 280 && vTop < 420, `vaakalennon huippunopeus järkevä (${vTop.toFixed(0)} px/s)`);
  // Hidas nousukiito ilman kaasua → sakkaus: nokka valahtaa ja kone vajoaa
  p.x = 1500; p.y = 300; p.vx = 70; p.vy = -60; p.ang = -0.7; p.throttle = 0;
  const yBefore = p.y;
  let sawStall = false, noseDropped = false, maxY = p.y;
  for (let i = 0; i < 300; i++) {
    E.step(st, inp({ power: -1 }));
    const sp = Math.hypot(p.vx, p.vy);
    if (sp < E.STALL) {
      sawStall = true;
      if (Math.sin(p.ang) > 0.15) noseDropped = true;
    }
    maxY = Math.max(maxY, p.y);
  }
  ok(sawStall, "hidas kone painuu sakkausrajan alle");
  ok(maxY > yBefore + 60 || p.dead, "sakkaava kone vajoaa");
  ok(noseDropped || p.dead, "sakkauksessa nokka kääntyy alas");
}

// —— Rullaus (flip) ——
{
  const st = E.createMission({ missionId: "rintama", seed: 7 });
  const p = airborne(st, 1500, 400);
  const f0 = p.flipped;
  E.step(st, inp({ flip: true }));
  ok(p.flipped !== f0, "rullaus kääntää koneen");
  E.step(st, inp({ flip: true })); // pohjassa pidetty näppäin ei toistu
  ok(p.flipped !== f0, "rullaus on reunaliipaistu");
  E.step(st, noInput);
  E.step(st, inp({ flip: true }));
  ok(p.flipped === f0, "uusi painallus rullaa takaisin");
  // Selkälento tunnistetaan
  p.flipped = true; p.ang = 0;
  ok(E.inverted(p), "selkälento tunnistetaan");
  p.flipped = false;
  ok(!E.inverted(p), "normaaliasento ei ole selkälento");
}

// —— Konekivääri ——
{
  const st = E.createMission({ missionId: "rintama", seed: 7 });
  const p = airborne(st, 1500, 400);
  const foe = E.spawnEnemy(st);
  foe.onGround = false; foe.x = p.x + 160; foe.y = p.y; foe.vx = 250; foe.vy = 0; foe.ang = 0;
  foe.ai.skill = 0; foe.ai.aggr = 0; foe.ai.patrolPts = null; foe.ai.patrol = { x: foe.x + 4000, y: foe.y };
  const hp0 = foe.hp, ammo0 = p.ammo;
  let hit = false, died = false;
  for (let i = 0; i < 240 && !died; i++) {
    // pidä maalitaulu keilassa
    foe.x = p.x + 160; foe.y = p.y; foe.vx = p.vx; foe.vy = p.vy;
    E.step(st, inp({ power: 1, fire: true }));
    for (const ev of st.events) {
      if (ev.type === "osuma" && ev.plane === foe.id) hit = true;
      if (ev.type === "kaatui" && ev.plane === foe.id) died = true;
    }
  }
  ok(hit, "luodit osuvat viholliseen");
  ok(p.ammo < ammo0, "ammukset kuluvat");
  ok(died && foe.dead && foe.hp < hp0, "vihollinen putoaa hp:n loppuessa");
  ok(p.kills === 1 && st.stats.kills === 1, "pudotus kirjataan");
}

// —— Pommit tuhoavat maalit ——
{
  const st = E.createMission({ missionId: "rintama", seed: 7 });
  st.lives = 99;
  const halli = st.structures.find((s) => s.type === "halli");
  const p = airborne(st, halli.x - 700, halli.y - 420);
  // Ennakoi pommin putoamispiste integroimalla moottorin pommifysiikka
  function bombLandsAt(px, py, vx, vy) {
    let x = px, y = py + 14, bvx = vx, bvy = vy + 20;
    for (let k = 0; k < 400; k++) {
      bvy += E.G * 1.05 * E.DT;
      bvx *= Math.exp(-0.12 * E.DT);
      x += bvx * E.DT; y += bvy * E.DT;
      if (y >= E.groundY(st.terrain, x)) return x;
    }
    return x;
  }
  let dropped = 0, boom = false, destroyed = false;
  for (let i = 0; i < 2500 && !destroyed; i++) {
    const drop = Math.abs(bombLandsAt(p.x, p.y, p.vx, p.vy) - halli.x) < 45;
    E.step(st, inp({ bomb: drop }));
    for (const ev of st.events) {
      if (ev.type === "pommi") dropped++;
      if (ev.type === "rajahdys") boom = true;
      if (ev.type === "tuhottu" && ev.struct === "halli") destroyed = true;
    }
    if (p.x > halli.x + 300 || p.dead) airborne(st, halli.x - 700, halli.y - 420);
    if (p.bombs === 0) p.bombs = 4;
  }
  ok(dropped > 0, `pommeja pudotettu (${dropped})`);
  ok(boom, "pommi räjähtää");
  ok(destroyed && halli.hp <= 0, "halli tuhoutuu pommeista");
  ok(E.targetsLeft(st) < E.targetsTotal(st), "maalilaskuri vähenee");
}

// —— It-tykit ampuvat ja vahingoittavat ——
{
  const st = E.createMission({ missionId: "teras", seed: 7 });
  const aa = st.structures.find((s) => s.type === "it");
  const p = airborne(st, aa.x - 200, aa.y - 300);
  const hp0 = p.hp;
  let shot = false, flak = false;
  for (let i = 0; i < 1200 && p.hp === hp0; i++) {
    // pysy tykin kantamalla
    if (p.x > aa.x + 300 || p.x < aa.x - 500) { p.x = aa.x - 250; p.y = aa.y - 300; p.vx = 200; p.vy = 0; p.ang = 0; }
    E.step(st, inp({ power: 0.0 }));
    for (const ev of st.events) {
      if (ev.type === "it-laukaus") shot = true;
      if (ev.type === "flak") flak = true;
    }
  }
  ok(shot, "it-tykki avaa tulen kantamalla");
  ok(flak, "kranaatit räjähtävät ilmassa");
  ok(p.hp < hp0, `sirpaleet vahingoittavat (${hp0} → ${p.hp.toFixed(0)})`);
  // Tuhottu tykki vaikenee
  E.damageStructure(st, aa, 999, true);
  ok(aa.hp <= 0, "tykki tuhoutuu");
}

// —— Laskeutuminen ja huolto ——
{
  const st = E.createMission({ missionId: "rintama", seed: 7 });
  const rw = st.terrain.runways[0];
  const p = airborne(st, rw.x0 + 80, rw.y - 60);
  p.vx = 150; p.vy = 30; p.ang = 0.1; p.throttle = 0.2;
  p.fuel = 40; p.ammo = 10; p.bombs = 1; p.hp = 55;
  let landed = false;
  for (let i = 0; i < 600 && !landed; i++) {
    E.step(st, inp({ power: -1 }));
    if (p.onGround && !p.dead) landed = true;
  }
  ok(landed, "loiva lasku kiitoradalle onnistuu");
  // Rullaa pysähdyksiin → huolto täyttää
  let serviced = false;
  for (let i = 0; i < 1500 && !serviced; i++) {
    E.step(st, inp({ power: -1 }));
    for (const ev of st.events) if (ev.type === "huollettu") serviced = true;
  }
  ok(serviced, "huolto valmistuu paikallaan");
  ok(p.fuel >= 100 && p.ammo >= 120 && p.bombs >= 4 && p.hp >= p.maxHp, "tankit, ammukset, pommit ja kunto täynnä");
}

// —— Kova törmäys maahan on tuho ——
{
  const st = E.createMission({ missionId: "rintama", seed: 7 });
  const p = airborne(st, st.terrain.W / 2, 500);
  p.ang = Math.PI / 2; p.vx = 0; p.vy = 350; // pystysyöksy nurmeen
  let crashed = false;
  for (let i = 0; i < 300 && !crashed; i++) {
    E.step(st, inp({ power: 1 }));
    if (p.dead) crashed = true;
  }
  ok(crashed, "syöksy maahan tuhoaa koneen");
  ok(st.lives === E.LIVES - 1, "kone vähenee varastosta");
  // Uusi kone ilmestyy omalle kentälle
  runSteps(st, Math.ceil(E.RESPAWN_T / E.DT) + 5, noInput);
  const np = E.playerOf(st);
  ok(np && !np.dead && np.onGround, "uusi kone syntyy");
  ok(!!E.onRunway(st.terrain, np.x, 0), "uusi kone omalla kentällä");
}

// —— Häviö kun koneet loppuvat ——
{
  const st = E.createMission({ missionId: "rintama", seed: 7 });
  for (let k = 0; k < E.LIVES; k++) {
    const p = E.playerOf(st);
    E.damagePlane(st, p, 999, null);
    if (k < E.LIVES - 1) runSteps(st, Math.ceil(E.RESPAWN_T / E.DT) + 5, noInput);
  }
  ok(st.over && st.outcome === "tappio", "kolmas menetys on tappio");
  ok(E.result(st).livesLeft === 0, "koneita ei jäljellä");
}

// —— Voitto kun kaikki maalit tuhottu ——
{
  const st = E.createMission({ missionId: "rintama", seed: 7 });
  for (const s of st.structures) if (s.target) E.damageStructure(st, s, 9999, true);
  ok(st.over && st.outcome === "voitto", "kaikki maalit tuhottu → voitto");
  const res = E.result(st);
  ok(res.targetsDestroyed === res.targetsTotal, "tulokseen kirjautuu täysi tuho");
}

// —— Vihollisia syntyy halleista, hallit tuhottu → syöttö loppuu ——
{
  const st = E.createMission({ missionId: "laakso", seed: 3 });
  st.lives = 99;
  airborne(st, 1500, 400);
  let spawned = 0, maxConc = 0;
  for (let i = 0; i < Math.ceil(40 / E.DT); i++) {
    const p = E.playerOf(st);
    if (p.dead || p.onGround) airborne(st, 1500, 400);
    E.step(st, inp({ power: 1, pitch: p.y < 300 ? 0.2 : -0.1 }));
    for (const ev of st.events) if (ev.type === "vihollinen") spawned++;
    maxConc = Math.max(maxConc, st.planes.filter((q) => !q.isPlayer && !q.dead).length);
  }
  ok(spawned >= 2, `vihollisia syntyy (${spawned})`);
  ok(maxConc <= st.def.enemy.max, `yhtäaikaisraja pitää (${maxConc} ≤ ${st.def.enemy.max})`);
  for (const s of st.structures) if (s.type === "halli") s.hp = 0;
  const before = st.spawned;
  st.spawnT = 0;
  runSteps(st, 600, noInput);
  ok(st.spawned === before, "ilman halleja ei uusia vihollisia");
}

// —— Vihollis-AI lentää eikä syöksy heti maahan ——
{
  const st = E.createMission({ missionId: "teras", seed: 5 });
  st.lives = 99;
  const foe = E.spawnEnemy(st);
  // Pelaaja kaukana ilmassa: vihollinen partioi
  const p = airborne(st, 900, 350);
  let foeAliveT = 0, foeFlewT = 0;
  for (let i = 0; i < Math.ceil(25 / E.DT); i++) {
    if (p.dead || p.onGround || Math.abs(p.x - 900) > 400) airborne(st, 900, 350);
    E.step(st, inp({ power: 1, pitch: p.y < 260 ? 0.25 : p.y > 500 ? -0.25 : 0 }));
    if (!foe.dead) foeAliveT = st.t;
    if (!foe.dead && !foe.onGround) foeFlewT += E.DT;
  }
  ok(foeAliveT > 20, `vihollinen pysyy hengissä (${foeAliveT.toFixed(0)} s)`);
  ok(foeFlewT > 15, `vihollinen lentää suurimman osan ajasta (${foeFlewT.toFixed(0)} s)`);
  const finite = st.planes.every((q) => Number.isFinite(q.x + q.y + q.vx + q.vy + q.ang));
  ok(finite, "ei NaN-tiloja pitkässä simulaatiossa");
}

// —— Autopilotti (valikkonäytös) pyörii vakaasti ——
{
  const st = E.createMission({ missionId: "rintama", seed: 9, autopilot: true });
  runSteps(st, Math.ceil(60 / E.DT), null);
  ok(st.planes.every((q) => Number.isFinite(q.x + q.y + q.vx + q.vy)), "autopilotti: ei NaN-tiloja");
  ok(!st.over || st.outcome !== null, "autopilotin tila johdonmukainen");
}

// —— Vaikeustasot eroavat ——
{
  const easy = E.MISSIONS.find((m) => m.tier === "helppo");
  const hard = E.MISSIONS.find((m) => m.tier === "vaikea");
  ok(hard.aa > easy.aa, "vaikeassa enemmän it-tykkejä");
  ok(hard.enemy.total > easy.enemy.total && hard.enemy.max >= easy.enemy.max, "vaikeassa enemmän hävittäjiä");
  ok(hard.enemy.aimErr < easy.enemy.aimErr, "vaikeat lentäjät tarkempia");
  ok(hard.enemy.gunDmg > easy.enemy.gunDmg, "vaikeiden aseet purevat kovempaa");
  ok(hard.aaDef.reload < easy.aaDef.reload, "vaikea ilmatorjunta tulittaa tiheämmin");
  const eT = E.targetsTotal(E.createMission({ missionId: easy.id }));
  const hT = E.targetsTotal(E.createMission({ missionId: hard.id }));
  ok(hT > eT, `vaikeassa enemmän maaleja (${eT} → ${hT})`);
}

// —— Determinismi ——
{
  const mk = () => E.createMission({ missionId: "laakso", seed: 31337 });
  const a = mk(), b = mk();
  const input = inp({ power: 1, pitch: -0.5, fire: true });
  for (let i = 0; i < 900; i++) { E.step(a, input); E.step(b, input); }
  ok(JSON.stringify(E.snapshot(a)) === JSON.stringify(E.snapshot(b)), "simulaatio on deterministinen");
  const c = E.createMission({ missionId: "laakso", seed: 999 });
  for (let i = 0; i < 900; i++) E.step(c, input);
  ok(JSON.stringify(E.snapshot(a)) !== JSON.stringify(E.snapshot(c)), "eri seed → eri kulku");
}

console.log(`\n${pass} ok, ${fail} virhettä`);
if (fail > 0) process.exit(1);
