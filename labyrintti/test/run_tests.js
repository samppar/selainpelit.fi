const E = require("../src/engine.js");

let pass = 0, fail = 0;
function ok(c, m) {
  if (c) pass++;
  else { fail++; console.error("  FAIL:", m); }
}

console.log("Labyrintti engine tests");

// —— Perusgeometria (taso 1) ——
const L = E.LEVEL;
ok(L.width === 500 && L.height === 460, "kentän koko");
ok(L.holes.length >= 4, "reikiä on (" + L.holes.length + ")");
ok(L.path.length > 6, "reitti");
ok(L.start.x < 120 && L.start.y < 120, "START vasemmalla ylhäällä");
ok(L.checkpoints.length >= 1, "tarkistuspisteitä");

function inWall(L, x, y, r) {
  r = r || 0;
  for (const w of L.walls) {
    const nx = Math.max(w.x, Math.min(x, w.x + w.w));
    const ny = Math.max(w.y, Math.min(y, w.y + w.h));
    if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true;
  }
  return false;
}

// —— Generaattori: tasot 1..8 ovat kelvollisia ——
for (let lvl = 1; lvl <= 8; lvl++) {
  const G = E.generateLevel(lvl);
  const r = G.ballR;

  // Ohjausviivan pisteet eivät ole seinän sisällä (kuulan säteellä).
  const inWallPts = G.path.filter(([x, y]) => inWall(G, x, y, r));
  ok(inWallPts.length === 0, `taso ${lvl}: reitti ei kulje seinän läpi (${inWallPts.length})`);

  // Ohjausviiva ei kulje reiän tappavalle alueelle.
  let pathHitsHole = 0;
  for (const [x, y] of G.path) {
    for (const h of G.holes) {
      if ((x - h.x) ** 2 + (y - h.y) ** 2 < (G.holeR) ** 2) pathHitsHole++;
    }
  }
  ok(pathHitsHole === 0, `taso ${lvl}: reitti väistää reiät (${pathHitsHole})`);

  // Reiät laudan sisällä eivätkä seinän sisällä.
  const badHoles = G.holes.filter(
    (h) => h.x < 12 || h.x > 488 || h.y < 12 || h.y > 448 || inWall(G, h.x, h.y, 0)
  );
  ok(badHoles.length === 0, `taso ${lvl}: reiät kelvollisilla paikoilla (${badHoles.length})`);

  // START/FINISH vapaita.
  ok(!inWall(G, G.start.x, G.start.y, r * 0.85), `taso ${lvl}: START vapaa`);
  ok(!inWall(G, G.finish.x, G.finish.y, r * 0.85), `taso ${lvl}: FINISH vapaa`);

  // Reitti alkaa STARTista ja päättyy FINISHiin.
  const p0 = G.path[0], pN = G.path[G.path.length - 1];
  ok(Math.hypot(p0[0] - G.start.x, p0[1] - G.start.y) < 1, `taso ${lvl}: reitti alkaa STARTista`);
  ok(Math.hypot(pN[0] - G.finish.x, pN[1] - G.finish.y) < 1, `taso ${lvl}: reitti päättyy FINISHiin`);

  // Reitin segmentit kohtuullisia (ei hyppyjä kentän poikki).
  let maxSeg = 0;
  for (let i = 1; i < G.path.length; i++) {
    maxSeg = Math.max(maxSeg, Math.hypot(G.path[i][0] - G.path[i - 1][0], G.path[i][1] - G.path[i - 1][1]));
  }
  ok(maxSeg < G.width * 0.9, `taso ${lvl}: ei liian pitkiä segmenttejä (${maxSeg.toFixed(0)})`);
}

// —— Determinismi: sama taso samalla numerolla ——
const a = E.generateLevel(4), b = E.generateLevel(4);
ok(JSON.stringify(a.holes) === JSON.stringify(b.holes), "generaattori on toistettava");

// —— Vaikeus kasvaa ——
ok(E.generateLevel(6).holes.length >= E.generateLevel(1).holes.length, "korkeampi taso ei ole helpompi");

// —— Fysiikka ——
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

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
