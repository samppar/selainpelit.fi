const E = require("../src/engine.js");

let pass = 0, fail = 0;
function ok(value, message) {
  if (value) pass++;
  else { fail++; console.error("FAIL:", message); }
}

console.log("Käpysota — maasto, fysiikka, vuorot, aseet ja tekoäly");

// —— Maasto ja aloitus ——
let st = E.createState({ seed: 7 });
ok(st.chars.length === 6, "kuusi oravaa");
ok(st.chars.filter(c => c.team === 0).length === 3, "kolme punaista");
ok(st.chars.filter(c => c.team === 1).length === 3, "kolme harmaata");
ok(st.chars.every(c => c.hp === 100 && c.alive), "kaikki elossa 100 hp");
ok(st.chars.every(c => c.y < E.WATER_Y - 10), "spawnit vedenpinnan yläpuolella");
ok(st.chars.every(c => E.solidAt(st, c.x, c.y + 1) || E.solidAt(st, c.x, c.y)), "spawnit maan pinnalla");
{
  const xs = st.chars.map(c => c.x).sort((a, b) => a - b);
  let minGap = 1e9;
  for (let i = 1; i < xs.length; i++) minGap = Math.min(minGap, xs[i] - xs[i - 1]);
  ok(minGap > 30, `spawnit erillään toisistaan (min väli ${minGap.toFixed(0)} px)`);
}

// Determinismi: sama seed → sama maailma
{
  const a = E.createState({ seed: 42 });
  const b = E.createState({ seed: 42 });
  ok(JSON.stringify(E.getView(a)) === JSON.stringify(E.getView(b)), "sama seed → sama pelitila");
  let same = true;
  for (let i = 0; i < a.terrain.length; i += 997) if (a.terrain[i] !== b.terrain[i]) same = false;
  ok(same, "sama seed → sama maasto");
  const c = E.createState({ seed: 43 });
  let diff = false;
  for (let i = 0; i < a.terrain.length; i += 97) if (a.terrain[i] !== c.terrain[i]) diff = true;
  ok(diff, "eri seed → eri maasto");
}

// Maata on ja vesi on maaton
{
  let solidCount = 0;
  for (let x = 0; x < E.W; x += 8) if (E.surfaceTop(st, x) != null) solidCount++;
  ok(solidCount > 100, "maata on joka sarakkeessa");
  let wet = 0;
  for (let x = 0; x < E.W; x += 8) if (E.solidAt(st, x, E.WATER_Y + 2)) wet++;
  ok(wet === 0, "vedenpinnan alla ei maata");
}

// —— Räjähdys kaivaa maastoa ja vahingoittaa ——
{
  const s = E.createState({ seed: 7 });
  const c = s.chars[0];
  const gy = c.y;
  ok(E.solidAt(s, c.x, gy + 3), "maa jalkojen alla ennen räjähdystä");
  const v0 = s.terrainVersion;
  E.explodeAt(s, c.x, gy + 2, 40, 46, null);
  ok(!E.solidAt(s, c.x, gy + 3), "räjähdys kaivoi kraatterin");
  ok(s.terrainVersion > v0, "terrainVersion kasvoi");
  ok(c.hp < 100, `lähellä ollut orava otti osumaa (hp ${c.hp})`);
  ok(c.airborne, "räjähdys tönäisi oravan ilmaan");
  const far = s.chars.find(x => Math.hypot(x.x - c.x, x.y - c.y) > 200);
  ok(far && far.hp === 100, "kaukainen orava säästyi");
}

// —— Ammuksen lentorata: painovoima ja tuuli ——
{
  const s = E.createState({ seed: 7 });
  s.wind = 0;
  const hit0 = E.simulateShot(s, 100, 100, 200, -200, "sinko");
  s.wind = 90;
  const hitW = E.simulateShot(s, 100, 100, 200, -200, "sinko");
  ok(hitW.x > hit0.x, `myötätuuli kantaa käpyä pidemmälle (${hit0.x.toFixed(0)} → ${hitW.x.toFixed(0)})`);
  const hitT0 = E.simulateShot(s, 100, 100, 200, -200, "terho");
  s.wind = -90;
  const hitT1 = E.simulateShot(s, 100, 100, 200, -200, "terho");
  ok(Math.abs(hitT0.x - hitT1.x) < 1, "tuuli ei vaikuta terhoon");
}

// —— Ampuminen: käpy räjähtää maahan, vuoro vaihtuu ——
{
  const s = E.createState({ seed: 7 });
  const shooter = E.activeChar(s);
  ok(shooter && shooter.team === 0, "punaiset aloittavat");
  ok(s.phase === "aim", "vuoro alkaa tähtäyksellä");
  const fired = E.fire(s, { weapon: "sinko", aim: 1.1, power: 0.5, facing: 1 });
  ok(fired && s.phase === "sim" && s.projectiles.length === 1, "laukaus lähti");
  ok(!E.fire(s, { weapon: "sinko", power: 0.5 }), "vain yksi laukaus per vuoro");
  const v0 = s.terrainVersion;
  let guard = 0;
  while (s.phase === "sim" && guard++ < 3000) E.tick(s);
  ok(guard < 3000, "simulaatio laskeutuu");
  ok(s.terrainVersion > v0 || E.drainEvents(s).some(e => e.t === "splash" || e.t === "flyout"),
    "käpy räjähti tai poistui kentältä");
  ok(s.phase === "aim" && s.turnTeam === 1, "vuoro siirtyi harmaille");
  ok(E.activeChar(s).team === 1, "aktiivinen orava on harmaa");
}

// —— Terho: pomppii ja räjähtää sytyttimestä ——
{
  const s = E.createState({ seed: 7 });
  E.fire(s, { weapon: "terho", aim: 1.2, power: 0.45, facing: 1 });
  let bounced = false, exploded = false, guard = 0;
  while (s.phase === "sim" && guard++ < 3000) {
    E.tick(s);
    for (const e of E.drainEvents(s)) {
      if (e.t === "bounce") bounced = true;
      if (e.t === "explosion") exploded = true;
    }
  }
  ok(exploded, "terho räjähti sytyttimestä");
  ok(bounced || exploded, "terho pomppi tai räjähti");
}

// —— Marjapommi: pääräjähdys kylvää marjasia ——
{
  const s = E.createState({ seed: 7 });
  E.fire(s, { weapon: "marja", aim: 1.1, power: 0.5, facing: -1 });
  let explosions = 0, sawCluster = false, guard = 0;
  while (s.phase === "sim" && guard++ < 4000) {
    E.tick(s);
    for (const e of E.drainEvents(s)) if (e.t === "explosion") explosions++;
    if (s.projectiles.some(p => p.type === "marjanen")) sawCluster = true;
  }
  ok(sawCluster, "marjaset lähtivät lentoon");
  ok(explosions >= 3, `useita räjähdyksiä (${explosions})`);
}

// —— Kävely, hyppy ja putoamisvahinko ——
{
  const s = E.createState({ seed: 7 });
  const c = E.activeChar(s);
  const x0 = c.x;
  E.setInput(s, { move: 1 });
  for (let i = 0; i < 60; i++) E.tick(s);
  ok(c.x > x0, `kävely liikuttaa oikealle (${x0.toFixed(0)} → ${c.x.toFixed(0)})`);
  ok(!c.airborne || c.vy >= 0, "kävelijä pysyy hallinnassa");
  E.setInput(s, { move: 0, jump: true });
  E.tick(s);
  ok(c.airborne, "hyppy nostaa ilmaan");
  let guard = 0;
  while (c.airborne && guard++ < 600) E.tick(s);
  ok(!c.airborne, "hyppääjä laskeutuu");
  ok(c.hp === 100, "pieni hyppy ei satuta");

  // Kova pudotus sattuu
  const s2 = E.createState({ seed: 7 });
  const c2 = E.activeChar(s2);
  c2.y = c2.y - 260;
  c2.airborne = true;
  c2.vx = 0; c2.vy = 0;
  guard = 0;
  while (c2.airborne && guard++ < 600) E.tick(s2);
  ok(c2.hp < 100, `korkea pudotus ottaa osumaa (hp ${c2.hp})`);
}

// —— Hukkuminen ——
{
  const s = E.createState({ seed: 7 });
  const c = s.chars[2];
  c.x = 10; c.y = E.WATER_Y - 40;
  // varmista ettei maata alla: kaiva reikä
  E.explodeAt(s, 10, E.WATER_Y - 20, 60, 0, null);
  c.airborne = true; c.vx = 0; c.vy = 50;
  s.phase = "sim"; s.shotFired = true;
  let drowned = false, guard = 0;
  while (guard++ < 800 && !drowned) {
    E.tick(s);
    if (E.drainEvents(s).some(e => e.t === "drown" && e.id === c.id)) drowned = true;
  }
  ok(drowned && !c.alive, "veteen pudonnut orava hukkuu");
}

// —— Vuoron aikaraja ——
{
  const s = E.createState({ seed: 7 });
  s.timer = 0.05;
  let skipped = false;
  for (let i = 0; i < 20; i++) {
    E.tick(s);
    if (E.drainEvents(s).some(e => e.t === "timeout")) skipped = true;
  }
  ok(skipped, "aikaraja ohittaa vuoron");
  let guard = 0;
  while (s.phase !== "aim" && guard++ < 200) E.tick(s);
  ok(s.turnTeam === 1, "aikarajan jälkeen vuoro vaihtui");
}

// —— Voitto: viimeisen vastustajan kaataminen päättää pelin ——
{
  const s = E.createState({ seed: 7 });
  s.chars.forEach(c => { if (c.team === 1) { c.hp = 1; } });
  s.chars.filter(c => c.team === 1).slice(1).forEach(c => { c.alive = false; c.hp = 0; });
  const target = s.chars.find(c => c.team === 1 && c.alive);
  E.explodeAt(s, target.x, target.y - 9, 40, 46, null);
  ok(target.hp === 0, "viimeinen harmaa otti kuolettavan osuman");
  s.phase = "sim"; s.shotFired = true;
  let guard = 0;
  while (s.phase === "sim" && guard++ < 2000) E.tick(s);
  ok(s.phase === "over" && s.winner === 0, "punaiset voittivat");
  ok(E.getView(s).winner === 0, "view: voittaja");
}

// —— Äkkikuolema ——
{
  const s = E.createState({ seed: 7 });
  s.turnNo = E.SUDDEN_AT - 1;
  E.skipTurn(s);
  let guard = 0;
  while (s.phase === "sim" && guard++ < 200) E.tick(s);
  ok(s.suddenDeath, "äkkikuolema käynnistyi");
  ok(s.chars.every(c => !c.alive || c.hp <= 30), "hp leikattu äkkikuolemassa");
}

// —— Vuorot kiertävät joukkueen sisällä ——
{
  const s = E.createState({ seed: 7 });
  const firstRed = s.activeId;
  E.skipTurn(s);
  let guard = 0;
  while (s.phase !== "aim" && guard++ < 200) E.tick(s);
  E.skipTurn(s); // harmaiden vuoro ohi
  guard = 0;
  while (s.phase !== "aim" && guard++ < 200) E.tick(s);
  ok(s.turnTeam === 0 && s.activeId !== firstRed, "punaisten seuraava orava eri kuin edellinen");
}

// —— Tekoäly: löytää osuvan laukauksen ——
{
  const s = E.createState({ seed: 11 });
  const plan = E.aiPlan(s);
  ok(plan && plan.weapon && typeof plan.aim === "number" && plan.power > 0, "aiPlan palauttaa laukauksen");
  // Simuloi suunniteltu laukaus ja tarkista että se osuu lähelle vihollista
  const me = E.activeChar(s);
  const dx = Math.cos(plan.aim) * plan.facing;
  const dy = -Math.sin(plan.aim);
  const sp = E.MAX_SPEED * plan.power;
  const hit = E.simulateShot(s, me.x + dx * 16, me.y - 10 + dy * 16, dx * sp, dy * sp, plan.weapon);
  const enemies = s.chars.filter(c => c.alive && c.team !== me.team);
  const nearest = Math.min(...enemies.map(c => Math.hypot(c.x - hit.x, c.y - 9 - hit.y)));
  ok(nearest < 70, `tarkka AI osuu lähelle vihollista (etäisyys ${nearest.toFixed(0)} px)`);
  ok(plan.score > 0, `AI odottaa laukaukselta vahinkoa (score ${plan.score.toFixed(1)})`);
}

// AI-suunnitelma on deterministinen samalla tilalla
{
  const a = E.aiPlan(E.createState({ seed: 11 }));
  const b = E.aiPlan(E.createState({ seed: 11 }));
  ok(JSON.stringify(a) === JSON.stringify(b), "aiPlan on toistettava");
}

// Helppo AI hajauttaa tähtäystä muttei riko rajoja
{
  const s = E.createState({ seed: 11, aiLevel: "helppo" });
  const plan = E.aiPlan(s);
  ok(plan.power >= 0.15 && plan.power <= 1 && plan.aim >= -1.35 && plan.aim <= 1.45,
    "helpon AI:n laukaus pysyy rajoissa");
}

// —— Kokonainen AI vs AI -peli päättyy ——
{
  const s = E.createState({ seed: 5 });
  let guard = 0;
  while (s.phase !== "over" && guard++ < 300) {
    if (s.phase === "aim") {
      const plan = E.aiPlan(s);
      E.fire(s, plan);
    }
    let g2 = 0;
    while (s.phase === "sim" && g2++ < 5000) E.tick(s);
  }
  ok(s.phase === "over", `AI vs AI -peli päättyy (${guard} vuoroa)`);
  ok(s.winner === 0 || s.winner === 1 || s.winner === "draw", `voittaja selvillä (${s.winner})`);
}

// —— View-rajapinta ——
{
  const v = E.getView(E.createState({ seed: 7 }));
  ok(v.chars.length === 6 && v.teams.length === 2, "view: oravat ja joukkueet");
  ok(v.teams[0].name === "Punaiset" && v.teams[1].name === "Harmaat", "view: joukkueiden nimet");
  ok(typeof v.wind === "number" && Math.abs(v.wind) <= 90, "view: tuuli rajoissa");
  ok(v.phase === "aim" && v.activeId >= 0, "view: vuoro käynnissä");
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
