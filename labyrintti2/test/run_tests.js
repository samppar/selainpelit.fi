const E = require("../../labyrintti/src/engine.js");

let pass = 0, fail = 0;
function ok(value, message) {
  if (value) pass++;
  else { fail++; console.error("FAIL:", message); }
}

console.log("Labyrintti 2 — kuulafysiikka ja vaikeustasot");

for (const choice of [1, 6, 11]) {
  const level = E.generateLevel(choice);
  const state = E.createState(choice);
  ok(state.levelNum === choice, `lähtötaso ${choice} valitaan suoraan`);
  ok(level.holes.length >= 4, `tasolla ${choice} on vältettäviä reikiä`);
  ok(level.walls.length > 4, `tasolla ${choice} on sokkeloseiniä`);
  ok(level.start.x === state.x && level.start.y === state.y, `kuula alkaa STARTista tasolla ${choice}`);

  E.setTilt(state, 1, 0);
  E.step(state, 0.05);
  ok(state.x > level.start.x || state.lastHit, `kallistus vierittää kuulaa tasolla ${choice}`);

  const hole = level.holes[0];
  E.placeBall(state, hole.x, hole.y, 0, 0);
  ok(E.checkHoles(state) && state.status === "fallen", `reikään putoaa tasolla ${choice}`);
}

// Vaikeus tulee fysiikasta (painovoima + reiän vetovoima), ei raakojen
// reikien määrästä: seinät ja reiät kilpailevat samoista ruuduista, joten
// reikämäärä ei ole monotoninen. Vaikeustasot kytketään moottorin
// difficulty-parametriin (rento=easy, haastava=normal, mestari=hard).
const rento = E.createState(1, "easy");
const mestari = E.createState(11, "hard");
ok(mestari.gravityMul > rento.gravityMul && mestari.catchMul > rento.catchMul,
  "mestari on fysiikaltaan armottomampi kuin rento");
ok(E.generateLevel(11, "hard").difficulty === "hard" && E.generateLevel(1, "easy").difficulty === "easy",
  "vaikeustaso välittyy moottorille");
ok(JSON.stringify(E.generateLevel(6, "normal")) === JSON.stringify(E.generateLevel(6, "normal")),
  "haastava taso generoituu deterministisesti");

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
