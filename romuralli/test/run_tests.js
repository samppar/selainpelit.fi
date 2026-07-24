const E = require("../src/engine.js");

let pass = 0, fail = 0;
function ok(value, message) {
  if (value) pass++;
  else { fail++; console.error("FAIL:", message); }
}
const noInput = { steer: 0, throttle: 0, fire: false, turbo: false };
function runSteps(state, n, input) {
  for (let i = 0; i < n; i++) E.step(state, input);
}
function skipCountdown(state) {
  runSteps(state, Math.ceil(3 / E.DT) + 1, noInput);
}

console.log("Romuralli — rata, fysiikka, kierrokset, aseet, AI ja talous");

// —— Rata ——
{
  const tr = E.makeTrack(E.TRACKS[0]);
  ok(tr.count > 400, "keskilinjassa riittävästi pisteitä");
  ok(tr.length > 3000 && tr.length < 12000, `radan pituus järkevä (${tr.length.toFixed(0)} px)`);
  ok(tr.checkpoints.length === E.NUM_CP, "10 tarkistuspistettä");
  let inBounds = true, finite = true;
  for (const p of tr.pts) {
    if (p.x < 0 || p.x > tr.W || p.y < 0 || p.y > tr.H) inBounds = false;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.curv)) finite = false;
  }
  ok(inBounds, "rata pysyy maailman sisällä");
  ok(finite, "ei NaN-arvoja radassa");
  // Suljettu silmukka: viimeinen piste lähellä ensimmäistä
  const a = tr.pts[0], b = tr.pts[tr.count - 1];
  ok(Math.hypot(a.x - b.x, a.y - b.y) < 60, "silmukka sulkeutuu");
  // Determinismi
  const tr2 = E.makeTrack(E.TRACKS[0]);
  ok(JSON.stringify(tr.pts[100]) === JSON.stringify(tr2.pts[100]), "sama seed → sama rata");
  const tr3 = E.makeTrack(E.TRACKS[1]);
  ok(tr3.pts[100].x !== tr.pts[100].x || tr3.pts[100].y !== tr.pts[100].y, "eri seed → eri rata");
  // Kaikilla kuudella radalla järkevä geometria
  for (const def of E.TRACKS) {
    const t = E.makeTrack(def);
    let okAll = true;
    for (const p of t.pts) if (!Number.isFinite(p.x + p.y + p.curv + p.ds)) okAll = false;
    ok(okAll, `rata ${def.id} kunnossa`);
  }
}

// —— Varusteet ——
{
  const s0 = E.carStats({});
  const s3 = E.carStats({ moottori: 3, renkaat: 3, panssari: 3, aseet: 3 });
  ok(s3.top > s0.top && s3.accel > s0.accel, "moottoripäivitys nopeuttaa");
  ok(s3.grip > s0.grip && s3.turn > s0.turn, "rengaspäivitys parantaa pitoa");
  ok(s3.maxHp > s0.maxHp, "panssari lisää kestoa");
  ok(s3.gunDmg > s0.gunDmg && s3.ammo > s0.ammo, "asepäivitys lisää tulivoimaa");
  for (const k of Object.keys(E.UPGRADES)) ok(E.UPGRADES[k].costs.length === 3, `${k}: kolme hintaa`);
}

// —— Kisan luonti ——
{
  const st = E.createRace({ tier: "helppo", seed: 12, playerUpgrades: {} });
  ok(st.cars.length === 4, "neljä autoa");
  ok(st.cars.filter((c) => c.isPlayer).length === 1, "yksi pelaaja");
  ok(st.cars.every((c) => c.hp > 0 && c.ammo > 0), "hp ja ammukset alussa");
  ok(st.pickups.length === E.NUM_CP, "poimintapaikat luotu");
  ok(st.countdownT > 0, "lähtölaskenta käynnissä");
  // Ruudukko radalla ja erillään
  let minGap = 1e9;
  for (let i = 0; i < st.cars.length; i++)
    for (let j = i + 1; j < st.cars.length; j++) {
      const a = st.cars[i], b = st.cars[j];
      minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.y - b.y));
    }
  ok(minGap > E.CAR_R * 1.5, `lähtöruudukko erillään (min ${minGap.toFixed(0)} px)`);
  for (const c of st.cars) {
    const near = E.nearestIdx(st.track, c.x, c.y, null);
    ok(near.dist < st.track.halfWidth, `${c.name} lähtee radalta`);
  }
  // Lähtölaskennan aikana kaasu ei liikuta
  runSteps(st, 30, { steer: 0, throttle: 1, fire: false, turbo: false });
  const pl = st.cars[0];
  ok(Math.hypot(pl.vx, pl.vy) < 5, "autot paikallaan lähtölaskennassa");
}

// Leveä testirata: suoraviivainen fysiikka ilman hiekkahidastusta
const WIDE = { id: "testi", name: "Testi", tier: "helppo", seed: 3, laps: 3, halfWidth: 1600, theme: {} };
// Ajaa n askelta ja pitää auton keskialueella (teleport säilyttää nopeuden),
// jottei maailman reuna pysäytä pitkiä suoria.
function driveSteps(state, n, input) {
  const pl = state.cars[0], tr = state.track;
  for (let i = 0; i < n; i++) {
    if (pl.x < 400 || pl.x > tr.W - 400 || pl.y < 400 || pl.y > tr.H - 400) {
      pl.x = tr.W / 2; pl.y = tr.H / 2;
    }
    E.step(state, input);
  }
}

// —— Fysiikka: kiihdytys, jarrutus, kääntyminen ——
{
  const st = E.createRace({ tier: "helppo", seed: 12, playerUpgrades: {}, trackDef: WIDE });
  skipCountdown(st);
  const pl = st.cars[0];
  driveSteps(st, 180, { steer: 0, throttle: 1, fire: false, turbo: false });
  const v1 = Math.hypot(pl.vx, pl.vy);
  ok(v1 > 150, `kaasu kiihdyttää (${v1.toFixed(0)} px/s @3 s)`);
  driveSteps(st, 300, { steer: 0, throttle: 1, fire: false, turbo: false });
  const vTop = Math.hypot(pl.vx, pl.vy);
  ok(vTop <= pl.stats.top + 5, `huippunopeus rajattu (${vTop.toFixed(0)} ≤ ${pl.stats.top})`);
  ok(vTop > pl.stats.top * 0.8, `huippunopeus saavutetaan (${vTop.toFixed(0)} px/s)`);
  const a0 = pl.ang;
  driveSteps(st, 60, { steer: 1, throttle: 1, fire: false, turbo: false });
  ok(Math.abs(E.angDiff(pl.ang, a0)) > 0.5, "ohjaus kääntää autoa");
  let vMin = Infinity;
  for (let i = 0; i < 90; i++) {
    driveSteps(st, 1, { steer: 0, throttle: -1, fire: false, turbo: false });
    vMin = Math.min(vMin, Math.hypot(pl.vx, pl.vy));
  }
  ok(vMin < vTop * 0.4, `jarru hidastaa (min ${vMin.toFixed(0)} px/s)`);
}

// —— Turbo nostaa nopeutta ja kuluu ——
{
  const mk = () => {
    const s = E.createRace({ tier: "helppo", seed: 5, playerUpgrades: {}, trackDef: WIDE });
    skipCountdown(s);
    return s;
  };
  const s1 = mk(), s2 = mk();
  let v1 = 0, v2 = 0;
  for (let i = 0; i < 240; i++) {
    driveSteps(s1, 1, { steer: 0, throttle: 1, fire: false, turbo: false });
    driveSteps(s2, 1, { steer: 0, throttle: 1, fire: false, turbo: true });
    v1 = Math.max(v1, Math.hypot(s1.cars[0].vx, s1.cars[0].vy));
    v2 = Math.max(v2, Math.hypot(s2.cars[0].vx, s2.cars[0].vy));
  }
  ok(v2 > v1 + 20, `turbo nostaa huippunopeutta (${v1.toFixed(0)} → ${v2.toFixed(0)})`);
  ok(s2.cars[0].turboM < 100, "turbomittari kuluu");
}

// —— Radan ulkopuoli hidastaa ——
{
  const s1 = E.createRace({ tier: "helppo", seed: 9, playerUpgrades: {} });
  skipCountdown(s1);
  const pl = s1.cars[0];
  // Teleporttaa kauas radalta
  pl.x = 60; pl.y = 60; pl.vx = 0; pl.vy = 0; pl.ang = 0;
  runSteps(s1, 240, { steer: 0, throttle: 1, fire: false, turbo: false });
  ok(pl.offroad, "radan ulkopuoli tunnistetaan");
  const vOff = Math.hypot(pl.vx, pl.vy);
  ok(vOff < pl.stats.top * 0.75, `hiekalla hitaampi (${vOff.toFixed(0)} px/s)`);
}

// —— Tarkistuspisteet, kierrokset ja maali ——
{
  const st = E.createRace({ tier: "helppo", seed: 12, playerUpgrades: {} });
  skipCountdown(st);
  const tr = st.track, pl = st.cars[0];
  // Kuljeta pelaaja keskilinjaa pitkin teleporttaamalla
  let laps = 0, finished = false;
  const need = E.finishCp(tr.laps);
  for (let round = 0; round < tr.laps + 1 && !finished; round++) {
    for (let i = 0; i < tr.count; i += 4) {
      pl.x = tr.pts[i].x; pl.y = tr.pts[i].y;
      pl.vx = 0; pl.vy = 0;
      E.step(st, noInput);
      for (const ev of st.events) {
        if (ev.type === "lap" && ev.car === pl.id) laps++;
        if (ev.type === "finish" && ev.car === pl.id) finished = true;
      }
      if (finished) break;
    }
  }
  ok(laps === tr.laps - 1, `kierrostapahtumat (${laps} = ${tr.laps - 1})`);
  ok(finished && pl.finished, "maaliintulo havaitaan");
  ok(pl.cpTotal >= need, "kaikki tarkistuspisteet kerätty");
  ok(st.over, "kisa päättyy pelaajan maaliin");
  const res = E.raceResult(st);
  ok(res.place === 0, "keskeytymätön teleporttaaja voittaa");
  ok(res.prize === E.prizeFor("helppo", 0), "voittajan palkinto oikein");
}

// —— Oikominen ei kelpaa ——
{
  const st = E.createRace({ tier: "helppo", seed: 12, playerUpgrades: {} });
  skipCountdown(st);
  const tr = st.track, pl = st.cars[0];
  const cp0 = pl.cpTotal;
  // Hyppää suoraan radan poikki puoliväliin ohittamatta välitarkistuspisteitä
  const far = tr.pts[tr.checkpoints[5]];
  pl.x = far.x; pl.y = far.y; pl.vx = 0; pl.vy = 0;
  runSteps(st, 30, noInput);
  ok(pl.cpTotal <= cp0 + 1, "tarkistuspisteitä ei voi ohittaa oikomalla");
}

// —— Luodit ja romuttaminen ——
{
  const st = E.createRace({ tier: "helppo", seed: 12, playerUpgrades: { aseet: 3 } });
  skipCountdown(st);
  const pl = st.cars[0], foe = st.cars[1];
  // Aseta vihollinen suoraan eteen
  foe.x = pl.x + Math.cos(pl.ang) * 120;
  foe.y = pl.y + Math.sin(pl.ang) * 120;
  foe.ai.skill = 0; // pysyy paikallaan
  const hp0 = foe.hp;
  runSteps(st, 20, { steer: 0, throttle: 0, fire: true, turbo: false });
  ok(foe.hp < hp0, `luodit osuvat (hp ${hp0} → ${foe.hp.toFixed(1)})`);
  ok(pl.ammo < pl.stats.ammo, "ammukset kuluvat");
  // Romuta kokonaan
  foe.hp = 1;
  let wrecked = false, bounty = 0;
  for (let i = 0; i < 120 && !wrecked; i++) {
    foe.x = pl.x + Math.cos(pl.ang) * 120;
    foe.y = pl.y + Math.sin(pl.ang) * 120;
    foe.vx = foe.vy = 0;
    E.step(st, { steer: 0, throttle: 0, fire: true, turbo: false });
    for (const ev of st.events) {
      if (ev.type === "wreck" && ev.car === foe.id) wrecked = true;
      if (ev.type === "bounty" && ev.car === pl.id) bounty = ev.amount;
    }
  }
  ok(wrecked && foe.wrecked, "auto romuttuu hp:n loppuessa");
  ok(bounty === E.BOUNTY && pl.money >= E.BOUNTY, "romutuspalkkio maksetaan");
  ok(pl.kills === 1, "romutus kirjataan");
}

// —— Törmäysvauriot ——
{
  const st = E.createRace({ tier: "helppo", seed: 12, playerUpgrades: {} });
  skipCountdown(st);
  const a = st.cars[0], b = st.cars[1];
  b.x = a.x + 40; b.y = a.y; b.ai.skill = 0;
  a.ang = 0; a.vx = 400; a.vy = 0; b.vx = -400; b.vy = 0; b.ang = Math.PI;
  const hpA = a.hp, hpB = b.hp;
  runSteps(st, 10, noInput);
  ok(a.hp < hpA && b.hp < hpB, "kova törmäys vahingoittaa molempia");
  ok(Math.hypot(a.x - b.x, a.y - b.y) >= E.CAR_R * 2 - 1, "autot eivät jää sisäkkäin");
}

// —— Poiminnat ——
{
  const st = E.createRace({ tier: "helppo", seed: 12, playerUpgrades: {} });
  skipCountdown(st);
  const pl = st.cars[0];
  const money = st.pickups.find((p) => p.type === "raha");
  pl.x = money.x; pl.y = money.y; pl.vx = pl.vy = 0;
  E.step(st, noInput);
  ok(!money.active, "rahasäkki poimitaan");
  ok(pl.money === money.value, `rahasäkin arvo tilille (+$${money.value})`);
  runSteps(st, Math.ceil(E.PICKUP_RESPAWN / E.DT) + 5, noInput);
  ok(money.active, "poiminta palaa hetken kuluttua");
  const rep = st.pickups.find((p) => p.type === "korjaus");
  rep.active = true; rep.respawnT = 0; // AI on voinut napata sen välissä
  pl.hp = 10;
  pl.x = rep.x; pl.y = rep.y; pl.vx = pl.vy = 0;
  E.step(st, noInput);
  ok(pl.hp > 10, "korjaus parantaa");
}

// —— AI ajaa radan ympäri ja kisa ratkeaa ——
{
  const st = E.createRace({ tier: "helppo", seed: 77, autopilot: true, playerUpgrades: {} });
  const budget = Math.ceil(150 / E.DT); // 150 s simulaatiota
  let firstFinish = -1;
  for (let i = 0; i < budget; i++) {
    E.step(st, null);
    if (firstFinish < 0 && st.cars.some((c) => c.finished)) firstFinish = st.t;
    if (st.cars.every((c) => c.finished || c.wrecked)) break;
  }
  ok(st.cars.every((c) => Number.isFinite(c.x + c.y + c.vx + c.vy)), "ei NaN-tiloja");
  ok(firstFinish > 0, `joku ajaa ${st.track.laps} kierrosta maaliin (${firstFinish > 0 ? firstFinish.toFixed(0) : "-"} s)`);
  const progressed = st.cars.filter((c) => c.cpTotal > E.NUM_CP).length;
  ok(progressed >= 3, `vähintään kolme autoa ajoi täyden kierroksen (${progressed}/4)`);
  ok(st.order.length === 4 && new Set(st.order).size === 4, "sijoitusjärjestys on permutaatio");
}

// —— Vaikeustaso vaikuttaa vastustajiin ——
{
  const easy = E.createRace({ tier: "helppo", seed: 4, playerUpgrades: {} });
  const hard = E.createRace({ tier: "vaikea", seed: 4, playerUpgrades: {} });
  const eTop = Math.max(...easy.cars.filter((c) => !c.isPlayer).map((c) => c.stats.top * c.ai.skill));
  const hTop = Math.max(...hard.cars.filter((c) => !c.isPlayer).map((c) => c.stats.top * c.ai.skill));
  ok(hTop > eTop + 30, `vaikeat vastustajat nopeampia (${eTop.toFixed(0)} → ${hTop.toFixed(0)})`);
  ok(E.prizeFor("vaikea", 0) > E.prizeFor("helppo", 0), "kovemmat kisat maksavat enemmän");
  ok(E.prizeFor("helppo", 0) > E.prizeFor("helppo", 1), "voitto tuottaa enemmän kuin kakkossija");
}

// —— Determinismi: sama seed ja samat syötteet → sama lopputila ——
{
  const mk = () => E.createRace({ tier: "keski", seed: 31337, playerUpgrades: { moottori: 1 } });
  const a = mk(), b = mk();
  const input = { steer: 0.3, throttle: 1, fire: true, turbo: false };
  for (let i = 0; i < 600; i++) { E.step(a, input); E.step(b, input); }
  ok(JSON.stringify(E.snapshot(a)) === JSON.stringify(E.snapshot(b)), "simulaatio on deterministinen");
}

console.log(`\n${pass} ok, ${fail} virhettä`);
if (fail > 0) process.exit(1);
