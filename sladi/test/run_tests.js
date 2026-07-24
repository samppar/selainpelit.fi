#!/usr/bin/env node
/* Sladi — ytimen regressiotestit. Aja: npm test */
"use strict";

const E = require("../src/engine.js");

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error("  ✗ " + msg); }
}
function section(name) { console.log("• " + name); }

// -------------------------------------------------------------- apurit

/** Aja kilpailua n askelta annetulla syötefunktiolla. */
function run(state, steps, inputFn) {
  for (let s = 0; s < steps; s++) {
    const inputs = state.cars.map((c, i) =>
      inputFn ? inputFn(state, i, s) : E.defaultInput());
    E.step(state, inputs);
  }
  return state;
}

function soloRace(trackId, kind, skill, vehicle) {
  return E.createRace({
    trackId,
    lineup: [{ kind: kind || "ai", name: "T", color: "#f00", skill: skill || "kova", vehicle: vehicle }],
    laps: 4
  });
}

function botInputs(state) {
  return state.cars.map((c, i) => c.kind === "ai" ? E.aiInput(state, i) : E.defaultInput());
}

const STEPS_PER_SEC = Math.round(1 / E.DT);

// -------------------------------------------------------------- radat

section("Radat rakentuvat oikein");
for (const def of E.TRACKS) {
  const t = E.getTrack(def.id);
  ok(t.samples.length > 100, def.id + ": keskilinjassa riittävästi näytteitä");
  ok(t.length > 2000, def.id + ": radan pituus > 2000 (" + Math.round(t.length) + ")");
  ok(t.gates.length >= 8, def.id + ": vähintään 8 porttia");
  // tasaväli
  let maxDev = 0;
  const S = t.samples, N = S.length;
  for (let i = 0; i < N; i++) {
    const a = S[i], b = S[(i + 1) % N];
    maxDev = Math.max(maxDev, Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - t.spacing));
  }
  ok(maxDev < t.spacing, def.id + ": näytteet tasavälein (maks.poikkeama " + maxDev.toFixed(2) + ")");
  // portit eivät ole päällekkäin (kahdeksikon risteys!)
  let minGate = Infinity;
  for (let i = 0; i < t.gates.length; i++) {
    for (let j = i + 1; j < t.gates.length; j++) {
      minGate = Math.min(minGate, Math.hypot(
        t.gates[i].x - t.gates[j].x, t.gates[i].y - t.gates[j].y));
    }
  }
  ok(minGate > t.gateR * 2, def.id + ": portit erillään (" + Math.round(minGate) + " > " + Math.round(t.gateR * 2) + ")");
  // rata pysyy maailmassa
  let inside = true;
  for (const s of S) {
    if (s.x < t.width / 2 || s.x > E.WORLD.w - t.width / 2 ||
        s.y < t.width / 2 || s.y > E.WORLD.h - t.width / 2) inside = false;
  }
  ok(inside, def.id + ": keskilinja pysyy maailman sisällä");
}

// -------------------------------------------------------------- fysiikka

section("Auto kiihtyy keulan suuntaan");
{
  const st = soloRace("rengasrata", "human");
  st.phase = "racing"; st.count = 0;
  const car = st.cars[0];
  const a0 = car.angle;
  run(st, STEPS_PER_SEC, () => ({ up: true, down: false, left: false, right: false }));
  const speed = Math.hypot(car.vx, car.vy);
  ok(speed > 150, "sekunnissa vauhtia > 150 (nyt " + speed.toFixed(0) + ")");
  const velAng = Math.atan2(car.vy, car.vx);
  ok(Math.abs(Math.atan2(Math.sin(velAng - a0), Math.cos(velAng - a0))) < 0.15,
    "nopeus osoittaa keulan suuntaan");
  ok(Math.abs(car.angle - a0) < 1e-9, "keula ei käänny ilman ohjausta");
}

section("Ohjaus kääntää ja auto sladaa");
{
  const st = soloRace("rengasrata", "human");
  st.phase = "racing"; st.count = 0;
  const car = st.cars[0];
  run(st, STEPS_PER_SEC * 2, () => ({ up: true, down: false, left: false, right: false }));
  const a1 = car.angle;
  run(st, Math.round(STEPS_PER_SEC * 0.4), () => ({ up: true, down: false, left: false, right: true }));
  ok(car.angle !== a1, "keula kääntyy oikealle ohjattaessa");
  ok(car.slip > 20, "kovassa vauhdissa käännös tuottaa sladin (slip " + car.slip.toFixed(0) + ")");
  // sladi vaimenee kun ohjaus suoristetaan
  const slipTurn = car.slip;
  run(st, STEPS_PER_SEC, () => ({ up: true, down: false, left: false, right: false }));
  ok(car.slip < slipTurn * 0.2, "sladi vaimenee suoralla (" + car.slip.toFixed(1) + " < " + (slipTurn * 0.2).toFixed(1) + ")");
}

section("Paikallaan auto ei käänny");
{
  const st = soloRace("rengasrata", "human");
  st.phase = "racing"; st.count = 0;
  const car = st.cars[0];
  const a0 = car.angle;
  run(st, STEPS_PER_SEC, () => ({ up: false, down: false, left: true, right: false }));
  ok(Math.abs(car.angle - a0) < 0.02, "keula ei pyöri nollavauhdissa");
}

/** Etsi radalta suoran pätkän alku (suunta muuttuu vähän 60 näytteen matkalla). */
function findStraight(track) {
  const S = track.samples, N = S.length;
  for (let i = 0; i < N; i++) {
    let dev = 0;
    for (let j = 0; j < 60; j++) {
      const a = S[(i + j) % N], b = S[(i + j + 1) % N];
      dev = Math.max(dev, Math.abs(Math.atan2(Math.sin(b.dir - a.dir), Math.cos(b.dir - a.dir))));
    }
    if (dev < 0.01) return S[i];
  }
  return S[0];
}

section("Nurmi hidastaa");
{
  // sama auto, sama aika: suoralla asfaltilla vs. keskellä nurmea
  const st1 = soloRace("rengasrata", "human");
  st1.phase = "racing"; st1.count = 0;
  const sp = findStraight(st1.track);
  st1.cars[0].x = sp.x; st1.cars[0].y = sp.y; st1.cars[0].angle = sp.dir;
  run(st1, STEPS_PER_SEC * 2, () => ({ up: true, down: false, left: false, right: false }));
  const vAsf = Math.hypot(st1.cars[0].vx, st1.cars[0].vy);

  const st2 = soloRace("rengasrata", "human");
  st2.phase = "racing"; st2.count = 0;
  st2.cars[0].x = 800; st2.cars[0].y = 500; // radan keskellä nurmella
  ok(E.surfaceAt(st2.track, 800, 500) === "grass", "keskikenttä on nurmea");
  run(st2, STEPS_PER_SEC * 2, () => ({ up: true, down: false, left: false, right: false }));
  const vGrass = Math.hypot(st2.cars[0].vx, st2.cars[0].vy);
  ok(vGrass < vAsf * 0.5, "nurmella huippunopeus alle puolet (" + vGrass.toFixed(0) + " vs " + vAsf.toFixed(0) + ")");
}

section("Öljyläikällä pito romahtaa");
{
  const t = E.getTrack("rengasrata");
  const oil = t.oils[0];
  ok(!!oil, "radalla on öljyläikkä");
  ok(E.surfaceAt(t, oil.x, oil.y) === "oil", "öljyn keskellä pinta on 'oil'");
  ok(E.SURFACES.oil.grip < E.SURFACES.asphalt.grip / 5, "öljyn pito murto-osa asfaltista");
}

section("Turbo kiihdyttää yli normaalin huippunopeuden");
{
  const st = soloRace("rengasrata", "human");
  st.phase = "racing"; st.count = 0;
  const car = st.cars[0];
  const boost = st.track.boosts[0];
  // aja auto turboruudun päälle radan suuntaisesti täydessä vauhdissa
  car.x = boost.x; car.y = boost.y; car.angle = boost.a;
  const vmax = E.CAR.accel / E.CAR.dragK;
  car.vx = Math.cos(boost.a) * vmax * 0.95;
  car.vy = Math.sin(boost.a) * vmax * 0.95;
  run(st, 10, () => ({ up: true, down: false, left: false, right: false }));
  const v = Math.hypot(car.vx, car.vy);
  ok(v > vmax * 1.05, "turbo nostaa vauhdin yli huippunopeuden (" + v.toFixed(0) + " > " + (vmax * 1.05).toFixed(0) + ")");
}

section("Muta ja vesi hidastavat");
{
  const t = E.getTrack("rengasrata");
  ok(t.muds.length > 0 && t.waters.length > 0, "radalla on mutaa ja vettä");
  ok(E.surfaceAt(t, t.muds[0].x, t.muds[0].y) === "mud", "mudan keskellä pinta on 'mud'");
  ok(E.surfaceAt(t, t.waters[0].x, t.waters[0].y) === "water", "veden keskellä pinta on 'water'");
  ok(E.nearestSample(t, t.waters[0].x, t.waters[0].y).dist > t.width * 0.5,
    "vesiallas on tien ulkopuolella");
  // vesi hidastaa rajusti: terminaalinopeus vedessä « nurmella
  function terminal(surfKey) {
    const st = soloRace("rengasrata", "human");
    st.phase = "racing"; st.count = 0;
    const car = st.cars[0];
    const feat = surfKey === "water" ? st.track.waters[0] : st.track.muds[0];
    for (let s = 0; s < STEPS_PER_SEC * 2; s++) {
      car.x = feat.x; car.y = feat.y; // pysy pinnalla koko mittaus
      E.step(st, [{ up: true, down: false, left: false, right: false }]);
    }
    return Math.hypot(car.vx, car.vy);
  }
  const vWater = terminal("water"), vMud = terminal("mud");
  ok(vWater < 40, "vedessä lähes pysähtyy (" + vWater.toFixed(0) + ")");
  ok(vMud < 110 && vMud > vWater, "muta hidastaa selvästi muttei upota (" + vMud.toFixed(0) + ")");
}

section("Rengaskasan läpi ei ajeta");
{
  const st = soloRace("rengasrata", "human");
  st.phase = "racing"; st.count = 0;
  const car = st.cars[0];
  const o = st.track.obstacles[0];
  ok(!!o, "radalla on este");
  // aja estettä päin kovaa
  car.x = o.x - 200; car.y = o.y; car.angle = 0;
  car.vx = 300; car.vy = 0;
  let minD = Infinity;
  for (let s = 0; s < STEPS_PER_SEC; s++) {
    E.step(st, [{ up: true, down: false, left: false, right: false }]);
    minD = Math.min(minD, Math.hypot(car.x - o.x, car.y - o.y));
  }
  ok(minD >= E.CAR.radius + o.r - 0.5,
    "auto ei tunkeudu esteen sisään (min etäisyys " + minD.toFixed(1) + ")");
}

section("Violetin seinän läpi ei ajeta");
{
  const st = soloRace("rengasrata", "human");
  st.phase = "racing"; st.count = 0;
  const car = st.cars[0];
  const w = st.track.walls[0];
  ok(!!w, "radalla on seinäeste");
  // aja kohtisuoraan seinän keskikohtaa päin
  const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
  const wa = Math.atan2(w.y2 - w.y1, w.x2 - w.x1) + Math.PI / 2;
  car.x = mx + Math.cos(wa) * 150; car.y = my + Math.sin(wa) * 150;
  car.angle = wa + Math.PI;
  car.vx = Math.cos(car.angle) * 280; car.vy = Math.sin(car.angle) * 280;
  let minD = Infinity;
  for (let s = 0; s < STEPS_PER_SEC; s++) {
    E.step(st, [{ up: true, down: false, left: false, right: false }]);
    // etäisyys segmenttiin likimain: keskipisteeseen riittää tässä
    const t = Math.max(0, Math.min(1,
      ((car.x - w.x1) * (w.x2 - w.x1) + (car.y - w.y1) * (w.y2 - w.y1)) /
      ((w.x2 - w.x1) ** 2 + (w.y2 - w.y1) ** 2)));
    const px = w.x1 + (w.x2 - w.x1) * t, py = w.y1 + (w.y2 - w.y1) * t;
    minD = Math.min(minD, Math.hypot(car.x - px, car.y - py));
  }
  ok(minD >= E.CAR.radius + w.r - 0.5,
    "auto ei mene seinän läpi (min etäisyys " + minD.toFixed(1) + ")");
}

section("Ajoneuvoluokat eroavat toisistaan");
{
  ok(Object.keys(E.VEHICLES).length === 4, "neljä ajoneuvoluokkaa");
  function topSpeed(vehicle, onGrass) {
    const st = soloRace("rengasrata", "human", null, vehicle);
    st.phase = "racing"; st.count = 0;
    const car = st.cars[0];
    const sp = findStraight(st.track);
    car.x = sp.x; car.y = sp.y; car.angle = sp.dir;
    if (onGrass) { car.x = 800; car.y = 500; } // keskikenttä
    let vMax = 0;
    for (let s = 0; s < STEPS_PER_SEC * 3; s++) {
      if (onGrass) { // pysy nurmella mittauksen ajan
        if (E.surfaceAt(st.track, car.x, car.y) !== "grass") { car.x = 800; car.y = 500; }
      } else if (E.surfaceAt(st.track, car.x, car.y) !== "asphalt") {
        break; // suora loppui — huippu on jo mitattu
      }
      E.step(st, [{ up: true, down: false, left: false, right: false }]);
      vMax = Math.max(vMax, Math.hypot(car.vx, car.vy));
    }
    return vMax;
  }
  const fA = topSpeed("formula"), sA = topSpeed("sportti"), pA = topSpeed("paku");
  ok(fA > sA && sA > pA, "asfaltilla formula > sportti > paku (" +
    [fA, sA, pA].map(v => v.toFixed(0)).join(" / ") + ")");
  const fG = topSpeed("formula", true), rG = topSpeed("ralli", true);
  ok(rG > fG * 1.3, "nurmella ralli päihittää formulan (" + rG.toFixed(0) + " vs " + fG.toFixed(0) + ")");
}

section("Massa ratkaisee kolarissa: paku tönäisee formulaa");
{
  const st = E.createRace({
    trackId: "rengasrata",
    lineup: [
      { kind: "human", name: "F", color: "#f00", vehicle: "formula" },
      { kind: "human", name: "P", color: "#00f", vehicle: "paku" }
    ],
    laps: 4
  });
  st.phase = "racing"; st.count = 0;
  const f = st.cars[0], p = st.cars[1];
  // formula törmää paikallaan olevaan pakuun
  p.x = 800; p.y = 500; p.vx = 0; p.vy = 0;
  f.x = 800 - E.CAR.radius * 2 - 1; f.y = 500; f.vx = 200; f.vy = 0;
  E.step(st, [E.defaultInput(), E.defaultInput()]);
  ok(p.vx > 0, "paku lähtee liikkeelle törmäyksestä");
  ok(p.vx < 200 * 0.6, "raskas paku saa alle 60 % formulan vauhdista (" + p.vx.toFixed(0) + ")");
  ok(Math.abs(f.vx) < 60, "kevyt formula pysähtyy lähes kokonaan (" + f.vx.toFixed(0) + ")");
}

section("Jokainen ajoneuvo selviää kierroksesta");
for (const vehicle of Object.keys(E.VEHICLES)) {
  const st = soloRace("rengasrata", "ai", "kova", vehicle);
  let lapT = null;
  for (let s = 0; s < STEPS_PER_SEC * 90 && lapT === null; s++) {
    E.step(st, botInputs(st));
    if (st.cars[0].lapsDone >= 1) lapT = st.cars[0].bestLap;
  }
  ok(lapT !== null, vehicle + ": kierros ajettu" + (lapT ? " (" + E.formatTime(lapT) + ")" : ""));
}

section("Silta: kahdeksikko ylittää itsensä, muut eivät");
{
  ok(E.getTrack("kahdeksikko").bridges.length === 1, "kahdeksikossa on silta");
  ok(E.getTrack("rengasrata").bridges.length === 0, "rengasradalla ei siltaa");
  ok(E.getTrack("serpentiini").bridges.length === 0, "serpentiinillä ei siltaa");

  const st = E.createRace({
    trackId: "kahdeksikko",
    lineup: [
      { kind: "human", name: "A", color: "#f00" },
      { kind: "human", name: "B", color: "#00f" }
    ],
    laps: 4
  });
  st.phase = "racing"; st.count = 0;
  const br = st.track.bridges[0];
  const a = st.cars[0], b = st.cars[1];
  // A alemmalla tiellä, B kannella — päällekkäin sillan keskellä
  a.x = br.x; a.y = br.y; a.aiCi = br.ia; a.vx = 0; a.vy = 0;
  b.x = br.x + 3; b.y = br.y; b.aiCi = br.ib; b.vx = 0; b.vy = 0;
  E.step(st, [E.defaultInput(), E.defaultInput()]);
  ok(Math.hypot(b.x - a.x, b.y - a.y) < E.CAR.radius * 2,
    "eri tasoilla olevat autot eivät törmää sillalla");
  ok(E.bridgeLevel(st.track, a) === 0 && E.bridgeLevel(st.track, b) === 1,
    "tasot tunnistetaan (alempi/kansi)");
  // samalla tasolla törmätään normaalisti
  b.aiCi = br.ia; b.x = a.x + 3; b.y = a.y;
  E.step(st, [E.defaultInput(), E.defaultInput()]);
  ok(Math.hypot(b.x - a.x, b.y - a.y) >= E.CAR.radius * 2 - 0.01,
    "samalla tasolla törmäys erottaa autot");
}

// -------------------------------------------------------------- kierrokset ja portit

section("Portit lasketaan järjestyksessä — oikominen ei tuota kierrosta");
{
  const st = soloRace("rengasrata", "human");
  st.phase = "racing"; st.count = 0;
  const car = st.cars[0];
  const gates = st.track.gates;
  // "teleporttaa" auto portille 2 ohittaen portin 1: ei etenemistä
  car.x = gates[2].x; car.y = gates[2].y;
  E.step(st, [E.defaultInput()]);
  ok(car.gatesCount === 0, "väärä portti ei kasvata laskuria");
  // käy portit järjestyksessä 0..K-1 ja palaa portille 0 → yksi kierros
  for (let round = 0; round < 2; round++) {
    for (let g = 0; g < gates.length; g++) {
      car.x = gates[g].x; car.y = gates[g].y;
      car.vx = 0; car.vy = 0;
      E.step(st, [E.defaultInput()]);
    }
  }
  car.x = gates[0].x; car.y = gates[0].y;
  E.step(st, [E.defaultInput()]);
  ok(car.lapsDone === 2, "kaksi täyttä kierrosta portteja pitkin → lapsDone 2 (nyt " + car.lapsDone + ")");
  ok(car.bestLap !== null, "kierrosaika kirjattiin");
}

section("Lähtölaskenta estää ajamisen");
{
  const st = soloRace("rengasrata", "human");
  const car = st.cars[0];
  run(st, 30, () => ({ up: true, down: false, left: false, right: false }));
  ok(Math.hypot(car.vx, car.vy) < 1, "auto ei liiku lähtölaskennan aikana");
  ok(st.phase === "countdown", "lähtölaskenta käynnissä");
  run(st, STEPS_PER_SEC * 4, () => ({ up: true, down: false, left: false, right: false }));
  ok(st.phase === "racing", "kilpailu käynnistyy laskennan jälkeen");
  ok(Math.hypot(car.vx, car.vy) > 100, "auto kiihtyy lähdön jälkeen");
}

// -------------------------------------------------------------- törmäykset

section("Autot eivät jää sisäkkäin");
{
  const st = E.createRace({
    trackId: "rengasrata",
    lineup: [
      { kind: "human", name: "A", color: "#f00" },
      { kind: "human", name: "B", color: "#00f" }
    ],
    laps: 4
  });
  st.phase = "racing"; st.count = 0;
  const a = st.cars[0], b = st.cars[1];
  b.x = a.x + 5; b.y = a.y;
  E.step(st, [E.defaultInput(), E.defaultInput()]);
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  ok(d >= E.CAR.radius * 2 - 0.01, "päällekkäiset autot työntyvät erilleen (väli " + d.toFixed(1) + ")");
}

// -------------------------------------------------------------- botit

section("Botti (kova) ajaa kierroksen jokaisella radalla");
for (const def of E.TRACKS) {
  const st = soloRace(def.id, "ai", "kova");
  let lapT = null;
  for (let s = 0; s < STEPS_PER_SEC * 75 && lapT === null; s++) {
    E.step(st, botInputs(st));
    if (st.cars[0].lapsDone >= 1) lapT = st.cars[0].bestLap;
  }
  ok(lapT !== null, def.id + ": botti ajoi kierroksen 75 s:ssa" + (lapT ? " (aika " + E.formatTime(lapT) + ")" : ""));
  if (lapT !== null) {
    ok(lapT < 60, def.id + ": kierrosaika alle 60 s (" + E.formatTime(lapT) + ")");
    console.log("    " + def.id + " kierrosaika: " + E.formatTime(lapT));
  }
}

section("Botti (rento) on hitaampi kuin kova");
{
  function lapTime(skill) {
    const st = soloRace("rengasrata", "ai", skill);
    for (let s = 0; s < STEPS_PER_SEC * 120; s++) {
      E.step(st, botInputs(st));
      if (st.cars[0].lapsDone >= 1) return st.cars[0].bestLap;
    }
    return null;
  }
  const tKova = lapTime("kova"), tRento = lapTime("rento");
  ok(tKova !== null && tRento !== null, "molemmat botit selviävät kierroksesta");
  if (tKova !== null && tRento !== null) {
    ok(tRento > tKova, "rento hitaampi (" + E.formatTime(tRento) + " vs " + E.formatTime(tKova) + ")");
  }
}

section("Kokonainen kilpailu neljällä botilla ratkeaa");
{
  const st = E.createRace({
    trackId: "rengasrata",
    lineup: [
      { kind: "ai", name: "A", color: "#f00", skill: "kova" },
      { kind: "ai", name: "B", color: "#0f0", skill: "kova" },
      { kind: "ai", name: "C", color: "#00f", skill: "rento" },
      { kind: "ai", name: "D", color: "#ff0", skill: "rento" }
    ],
    laps: 2
  });
  let over = false;
  for (let s = 0; s < STEPS_PER_SEC * 240 && !over; s++) {
    E.step(st, botInputs(st));
    if (st.phase === "finished") over = true;
  }
  ok(over, "kilpailu päättyy (kaikki maalissa)");
  const places = st.cars.map(c => c.place).sort();
  ok(places.join(",") === "1,2,3,4", "sijoitukset 1–4 jaettu (" + places.join(",") + ")");
  const fins = st.cars.filter(c => c.finished);
  ok(fins.length === 4, "kaikki neljä maalissa");
}

section("Armonaika: kisa päättyy 30 s ensimmäisen ihmisen maalista");
{
  const st = E.createRace({
    trackId: "rengasrata",
    lineup: [
      { kind: "human", name: "A", color: "#f00" },
      { kind: "human", name: "B", color: "#00f" } // B ei aja mihinkään
    ],
    laps: 1
  });
  st.phase = "racing"; st.count = 0;
  // A "ajaa" kierroksen porttien kautta
  const a = st.cars[0], gates = st.track.gates;
  for (let round = 0; round < 2; round++) {
    for (let g = 0; g < gates.length; g++) {
      a.x = gates[g].x; a.y = gates[g].y; a.vx = 0; a.vy = 0;
      E.step(st, [E.defaultInput(), E.defaultInput()]);
      if (a.finished) break;
    }
    if (a.finished) break;
  }
  ok(a.finished, "A on maalissa");
  ok(st.phase === "racing", "kisa jatkuu B:tä odottaen");
  run(st, STEPS_PER_SEC * 31);
  ok(st.phase === "finished", "kisa päättyy armonajan umpeuduttua");
  ok(!st.cars[1].finished, "B jäi ilman maaliintuloa");
}

// -------------------------------------------------------------- determinismi

section("Sama syöte → sama lopputila");
{
  function fingerprint() {
    const st = soloRace("serpentiini", "ai", "kova");
    for (let s = 0; s < STEPS_PER_SEC * 20; s++) E.step(st, botInputs(st));
    const c = st.cars[0];
    return [c.x, c.y, c.angle, c.vx, c.vy, c.gatesCount].map(v => v.toFixed(6)).join("|");
  }
  ok(fingerprint() === fingerprint(), "20 s simulaatio on bitilleen toistettava");
}

// -------------------------------------------------------------- yhteenveto

console.log("");
if (failed === 0) {
  console.log("Kaikki testit läpi (" + passed + " tarkistusta).");
} else {
  console.error(failed + " testiä EPÄONNISTUI (" + passed + " läpi).");
  process.exit(1);
}
