const E = require("../src/engine.js");

let pass = 0, fail = 0;
function ok(value, message) {
  if (value) pass++;
  else { fail++; console.error("FAIL:", message); }
}

console.log("Labyrintti — moottori, sokkelogeneraattori ja vaikeustasot");

function inWall(L, x, y, r) {
  r = r || 0;
  for (const w of L.walls) {
    const nx = Math.max(w.x, Math.min(x, w.x + w.w));
    const ny = Math.max(w.y, Math.min(y, w.y + w.h));
    if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true;
  }
  return false;
}

// —— Perusgeometria (taso 1) ——
const L = E.LEVEL;
ok(L.width === 500 && L.height === 460, "kentän koko");
ok(L.holes.length >= 4, "reikiä on (" + L.holes.length + ")");
ok(L.path.length > 6, "reitti");
ok(L.start.x < 120 && L.start.y < 120, "START vasemmalla ylhäällä");
ok(L.checkpoints.length >= 1, "tarkistuspisteitä");

// —— Generaattori: perustasot 1..8 sekä pelaajan valittavissa olevat
// lähtötasot (1/6/11) ovat kelvollisia riippumatta vaikeudesta ——
for (const lvl of [1, 2, 3, 4, 5, 6, 7, 8, 11]) {
  for (const difficulty of [undefined, "easy", "normal", "hard"]) {
    const G = difficulty ? E.generateLevel(lvl, difficulty) : E.generateLevel(lvl);
    const r = G.ballR;
    const tag = `taso ${lvl}${difficulty ? "/" + difficulty : ""}`;

    const inWallPts = G.path.filter(([x, y]) => inWall(G, x, y, r));
    ok(inWallPts.length === 0, `${tag}: reitti ei kulje seinän läpi (${inWallPts.length})`);

    let pathHitsHole = 0;
    for (const [x, y] of G.path) {
      for (const h of G.holes) {
        if ((x - h.x) ** 2 + (y - h.y) ** 2 < (G.holeR) ** 2) pathHitsHole++;
      }
    }
    ok(pathHitsHole === 0, `${tag}: reitti väistää reiät (${pathHitsHole})`);

    const badHoles = G.holes.filter(
      (h) => h.x < 12 || h.x > 488 || h.y < 12 || h.y > 448 || inWall(G, h.x, h.y, 0)
    );
    ok(badHoles.length === 0, `${tag}: reiät kelvollisilla paikoilla (${badHoles.length})`);

    ok(!inWall(G, G.start.x, G.start.y, r * 0.85), `${tag}: START vapaa`);
    ok(!inWall(G, G.finish.x, G.finish.y, r * 0.85), `${tag}: FINISH vapaa`);

    const p0 = G.path[0], pN = G.path[G.path.length - 1];
    ok(Math.hypot(p0[0] - G.start.x, p0[1] - G.start.y) < 1, `${tag}: reitti alkaa STARTista`);
    ok(Math.hypot(pN[0] - G.finish.x, pN[1] - G.finish.y) < 1, `${tag}: reitti päättyy FINISHiin`);
  }
}

// —— Determinismi: sama taso + vaikeus tuottaa saman laudan ——
ok(JSON.stringify(E.generateLevel(4)) === JSON.stringify(E.generateLevel(4)), "generaattori on toistettava");
ok(JSON.stringify(E.generateLevel(6, "normal")) === JSON.stringify(E.generateLevel(6, "normal")),
  "haastava taso generoituu deterministisesti");

// —— Vaikeus kasvaa tason mukana ——
ok(E.generateLevel(6).path.length >= E.generateLevel(1).path.length, "korkeampi taso ei ole helpompi");

// —— Perusfysiikka ——
let st = E.createState();
ok(st.pathIndex === 0, "pathIndex 0");
E.setTilt(st, 1, 0);
E.step(st, 0.05);
ok(st.x > L.start.x, "kallistus liikuttaa");

st = E.createState();
E.updateKeyTilt(st, { ArrowRight: true }, 0.35);
ok(st.gx > 0.15, "nuoli");

const h1 = L.holes[0];
st = E.createState();
E.placeBall(st, h1.x, h1.y, 0, 0);
ok(E.checkHoles(st) && st.fallenHole === 1, "reikä");

// Putoamisen hienosäätö: hidas reiän päällä tippuu, vauhdilla ohittaa reunan.
st = E.createState();
E.placeBall(st, h1.x, h1.y, 0, 0);
ok(E.checkHoles(st), "hidas kuula reiän keskellä tippuu");
st = E.createState();
E.placeBall(st, h1.x + 3, h1.y, 260, 0);
ok(!E.checkHoles(st), "kova vauhti reunan yli ei tipahda");
st = E.createState();
E.placeBall(st, h1.x + 3, h1.y, 0, 0);
ok(E.checkHoles(st), "hidas kuula reunalla tippuu");

st = E.createState();
E.placeBall(st, L.finish.x, L.finish.y, 0, 0);
ok(E.checkFinish(st) && st.status === "won", "maali");

st = E.createState();
E.placeBall(st, 4, 100, -120, 0);
E.collideWalls(st);
ok(st.x >= L.ballR + L.wallT - 1, "seinä pysäyttää");

// —— Tarkistuspiste: putoaminen palauttaa viimeiseen pisteeseen, ei STARTiin ——
st = E.createState();
const cp = L.checkpoints[0];
st.checkpoint = { x: cp.x, y: cp.y, pathIndex: cp.pathIndex };
st.checkpointIndex = 1;
E.newAttempt(st);
ok(Math.abs(st.x - cp.x) < 1 && Math.abs(st.y - cp.y) < 1, "uusi yritys tarkistuspisteestä");
ok(st.attempts === 1, "yrityslaskuri");

// —— Tason vaihto ——
st = E.createState();
E.advanceLevel(st);
ok(st.levelNum === 2, "advanceLevel → taso 2");
ok(st.level.holes.length === E.generateLevel(2).holes.length, "taso 2 ladattu");

const v = E.getView(E.createState());
ok(typeof v.pathProgress === "number", "pathProgress");
ok(v.levelNum === 1 && typeof v.totalHoles === "number", "view: taso ja reiät");

// —— Vaikeustasojen valinta (Labyrintti-pelin lähtötasot: rento/haastava/mestari) ——
for (const choice of [1, 6, 11]) {
  const level = E.generateLevel(choice);
  const state = E.createState(choice);
  ok(state.levelNum === choice, `lähtötaso ${choice} valitaan suoraan`);
  ok(level.holes.length >= 4, `tasolla ${choice} on vältettäviä reikiä`);
  ok(level.walls.length > 4, `tasolla ${choice} on sokkeloseiniä`);
  ok(level.start.x === state.x && level.start.y === state.y, `kuula alkaa STARTista tasolla ${choice}`);

  const s2 = E.createState(choice);
  E.setTilt(s2, 1, 0);
  E.step(s2, 0.05);
  ok(s2.x > level.start.x || s2.lastHit, `kallistus vierittää kuulaa tasolla ${choice}`);

  const hole = level.holes[0];
  const s3 = E.createState(choice);
  E.placeBall(s3, hole.x, hole.y, 0, 0);
  ok(E.checkHoles(s3) && s3.status === "fallen", `reikään putoaa tasolla ${choice}`);
}

// Vaikeus tulee fysiikasta (painovoima + reiän vetovoima), ei raakojen
// reikien määrästä: seinät ja reiät kilpailevat samoista ruuduista, joten
// reikämäärä ei ole monotoninen. Vaikeustasot kytketään moottorin
// difficulty-parametriin (rento=easy, haastava=normal, mestari=hard).
ok(E.DIFFICULTY && E.DIFFICULTY.easy && E.DIFFICULTY.hard, "vaikeustasot määritelty");
const rento = E.createState(1, "easy");
const mestari = E.createState(11, "hard");
ok(mestari.gravityMul > rento.gravityMul && mestari.catchMul > rento.catchMul,
  "mestari on fysiikaltaan armottomampi kuin rento");
ok(E.generateLevel(11, "hard").difficulty === "hard" && E.generateLevel(1, "easy").difficulty === "easy",
  "vaikeustaso välittyy moottorille");
const easy3 = E.generateLevel(3, "easy");
const hard3 = E.generateLevel(3, "hard");
ok(easy3.difficulty === "easy" && hard3.difficulty === "hard", "taso muistaa vaikeuden");
ok(hard3.walls.length >= easy3.walls.length, "vaikea = suurempi/tiheämpi sokkelo");
ok(E.createState(2, "hard").catchMul > E.createState(2, "easy").catchMul, "vaikea = tarttuvammat reiät");
ok(E.createState(2, "hard").gravityMul > E.createState(2, "easy").gravityMul, "vaikea = nopeampi kuula");
ok(E.getView(E.createState(1, "hard")).difficulty === "hard", "view: vaikeus");
// Tuntematon vaikeus → normaali (ei kaadu)
ok(E.generateLevel(2, "bogus").difficulty === "normal", "tuntematon vaikeus → normaali");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
