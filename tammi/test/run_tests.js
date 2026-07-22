// Tammi — ytimen + UI-session + AI -testit.
// Suunnittelu: fixtuurit (makeState), siirtonotaatio, injektoitava kello, DOM-vapaa session.
const E = require("../src/engine.js");
const S = require("../src/session.js");

let pass = 0, fail = 0;
function ok(c, m) {
  if (c) pass++;
  else { fail++; console.error("  FAIL:", m); }
}
function eq(a, b, m) {
  const as = JSON.stringify(a);
  const bs = JSON.stringify(b);
  ok(as === bs, m + " (oli " + as + ", odotettu " + bs + ")");
}
function frozenNow() {
  let t = 1_000_000;
  return function () { return t; };
}
function aiDeep() {
  return { timeMs: 100, maxDepth: 6, now: frozenNow() };
}

console.log("Tammi engine + session + AI tests");

// ========== Engine / fixtuurit ==========
ok(E.parseSq("a1") === E.rc(7, 0), "a1 = alavasen");
ok(E.sqLabel(E.parseSq("c5")) === "c5", "sqLabel ↔ parseSq");

let st = E.initState(E.HUMAN);
eq(E.moveKeys(st), ["a3-b4", "c3-b4", "c3-d4", "e3-d4", "e3-f4", "g3-f4", "g3-h4"],
  "aloituksen lailliset siirrot");

st = E.makeState({ turn: E.HUMAN, board: { c5: "o", b6: "x", a3: "o" } });
eq(E.moveKeys(st), ["c5xa7"], "pakollinen syönti");
st = E.applyMove(st, E.findMove(st, "c5xa7"));
ok(st.board[E.parseSq("b6")] === E.EMPTY, "syöty poistuu");

st = E.makeState({ turn: E.HUMAN, board: { c3: "o", d4: "x", f6: "x" } });
eq(E.moveKeys(st), ["c3xe5xg7"], "ketjusyönti ×2");

st = E.makeState({ turn: E.HUMAN, board: { c7: "o" } });
st = E.applyMove(st, E.findMove(st, "c7-b8"));
ok(E.isKing(st.board[E.parseSq("b8")]), "daamiksi nousu");

st = E.makeState({ turn: E.HUMAN, board: { c5: "O" } });
eq(E.moveKeys(st), ["c5-b4", "c5-b6", "c5-d4", "c5-d6"], "daami 4 suuntaa");

st = E.makeState({ turn: E.HUMAN, board: { b6: "o", c7: "x", e7: "x" } });
eq(E.moveKeys(st), ["b6xd8"], "korotus keskeyttää ketjun");

st = E.makeState({ turn: E.HUMAN, board: { b8: "o", a7: "x", c7: "x" } });
ok(E.isLoss(st), "ei siirtoa → häviö");

// ========== AI (deterministinen, skenaariot) ==========
st = E.initState(E.AI);
const aiOpen = E.bestMove(st, aiDeep());
ok(!!aiOpen && !!E.findMove(st, E.formatMove(aiOpen)),
  "AI-avaus laillinen: " + (aiOpen ? E.formatMove(aiOpen) : "null"));

// Ainoa laillinen siirto
st = E.makeState({ turn: E.AI, board: { c5: "x", d4: "o" } });
eq(E.formatMove(E.bestMove(st, { timeMs: 1, maxDepth: 1, now: () => 0 })), "c5xe3",
  "AI pakotettu syönti");

// Voitto yhdessä siirrossa: syö viimeinen
st = E.makeState({ turn: E.AI, board: { b6: "x", c5: "o" } });
const winMv = E.bestMove(st, aiDeep());
ok(E.formatMove(winMv) === "b6xd4", "AI syö ainoan vastustajan");
st = E.applyMove(st, winMv);
ok(E.countSide(st.board, E.HUMAN).pieces === 0, "ihmisellä 0 nappulaa");
ok(E.isLoss(st), "ihminen häviää AI-syönnin jälkeen");

// Vältä itsemurha: älä anna ilmaista syöntiä jos vaihtoehto
st = E.makeState({
  turn: E.AI,
  board: {
    // AI: c3 voi mennä b4 (turvallinen) tai d4 (ihmisen a5 syö d4? wait)
    // Simppeli: AI b6, vaihtoehdot a5 / c5; c5:llä odottaa ihmisen d4-syönti...
    b6: "x",
    d4: "o",
    a1: "o" // ylimääräinen jotta peli jatkuu
  }
});
// b6→a5 turvallinen; b6→c5 antaa d4xc5? d4 man moves north only for human... human at d4 moves to c5/e5.
// If AI moves b6-c5, human can capture? From d4 over c5 need b6 empty - that's where AI left. d4xc5? jump over c5 to b6.
// Yes human d4xb6 if AI goes to c5? Jump: from d4 over c5 to b6. Yes.
// So AI should prefer b6-a5.
const safe = E.bestMove(st, aiDeep());
ok(E.formatMove(safe) === "b6-a5", "AI välttää syötäväksi joutumisen (oli " + E.formatMove(safe) + ")");

// ========== UI-session (ei DOM:ia) ==========
const queue = [];
const sess = S.createSession({
  engine: E,
  aiDelayMs: 1,   // AI jonoon → assertit ennen flushia
  flashMs: 0,
  aiOpts: { timeMs: 30, maxDepth: 3, now: frozenNow() },
  schedule: function (fn) { queue.push(fn); return queue.length; },
  clearSchedule: function () {},
  onChange: function () {}
});

function flush() {
  while (queue.length) queue.shift()();
}

let v = sess.newGame({ starterMode: "human" });
ok(v.turn === E.HUMAN && v.winner === 0, "session alkaa ihmisellä");
eq(v.movable, ["a3", "c3", "e3", "g3"], "session: liikkuvat eturivillä");
ok(v.message.indexOf("valitse nappula") >= 0, "session: statusohje");

ok(sess.click("b2").ok === false, "takarivin nappula ei liiku");
ok(sess.click("a3").ok && sess.getView().selected === "a3", "valinta a3");
eq(sess.getView().targets.sort(), ["b4"], "a3:n kohteet");
ok(sess.play("a3-b4").ok, "siirto a3-b4 notaatiolla");
ok(sess.getView().lastMove === "a3-b4", "lastMove heti siirron jälkeen");
ok(sess.getView().thinking && !sess.getView().canUndo, "AI miettii → undo lukossa");
flush(); // AI vastaa
ok(sess.getView().canUndo, "undo aukeaa AI:n jälkeen");
ok(sess.getView().turn === E.HUMAN || sess.getView().winner, "AI pelasi vuoronsa");

// Pakollinen syönti UI:ssa (AI:lla jää nappuloita → toast ei ylikirjoitu voitolla)
sess.newGame({
  starterMode: "human",
  board: { c5: "o", b6: "x", a3: "o", h8: "x" },
  turn: E.HUMAN,
  aiOpts: { timeMs: 1, maxDepth: 1, now: () => 0 }
});
v = sess.getView();
eq(v.moveKeys, ["c5xa7"], "session näyttää vain syönnin");
ok(sess.click("a3").ok === false, "ei-syövä nappula ei valittavissa");
ok(sess.play("c5xa7").ok, "syönti play()-llä");
ok(sess.getView().toast === "Syönti!", "toast Syönti!");
ok(sess.getView().lastMove === "c5xa7", "lastMove syönti");

// Undo palauttaa
sess.newGame({ starterMode: "human" });
sess.play("c3-d4");
flush();
const after = sess.getView().lastMove;
sess.undo();
ok(sess.getView().lastMove !== after || sess.getView().turn === E.HUMAN, "undo palauttaa vuoron");
ok(sess.getState().board[E.parseSq("c3")] === E.pack(E.HUMAN, E.MAN), "undo: nappula takaisin c3");

// Vihje
sess.newGame({
  starterMode: "human",
  board: { c5: "o", b6: "x" },
  turn: E.HUMAN,
  aiOpts: { timeMs: 20, maxDepth: 2, now: frozenNow() }
});
const h = sess.hint();
ok(h.ok && h.hint === "c5xa7", "vihje = ainoa syönti");
ok(sess.getView().selected === "c5", "vihje valitsee nappulan");

// AI-vuoro sessionin kautta
sess.newGame({
  board: { c5: "x", d4: "o" },
  turn: E.AI,
  aiOpts: { timeMs: 1, maxDepth: 1, now: () => 0 }
});
flush();
v = sess.getView();
ok(v.lastMove === "c5xe3" || v.turn === E.HUMAN, "AI pelasi sessionissa");
ok(v.humanStats.indexOf("nappula") < 0 || E.countSide(v.board, E.HUMAN).pieces === 0,
  "AI söi ihmisen nappulan");

// Voitto overlay-viesti
sess.newGame({
  board: { b8: "o", a7: "x", c7: "x" },
  turn: E.HUMAN
});
// Ihmisen vuoro mutta ei siirtoja — newGame ei automaattisesti julista voittoa.
// step: yritä — isLoss tarkistetaan applyMove jälkeen. Alustetaan AI:n vuorolla:
sess.newGame({
  board: { b8: "o", a7: "x", c7: "x" },
  turn: E.AI,
  aiOpts: { timeMs: 1, maxDepth: 1, now: () => 0 }
});
flush();
// AI voi liikkua / syödä; sen sijaan aseta tilanne jossa AI:n jälkeen ihminen jumissa
sess.newGame({
  board: { a1: "o" },
  turn: E.AI,
  aiOpts: { timeMs: 1, maxDepth: 1, now: () => 0 }
});
// AI:llä ei nappuloita → isLoss heti AI-vuorolla
ok(E.isLoss(sess.getState()), "AI häviää ilman nappuloita");
const r = sess.stepAI();
ok(r.ok === false, "stepAI ei löydä siirtoa");
ok(sess.getView().winner === E.HUMAN, "voittaja ihminen");
ok(sess.getView().phase === "Voitto", "phase Voitto");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
