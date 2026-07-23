// Vaalikone — ytimen testit (node test/run_tests.js).
"use strict";
const V = require("../src/engine.js");

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error("  FAIL:", m); } }
async function throws(fn, m) {
  try { await fn(); fail++; console.error("  FAIL (ei heittänyt):", m); }
  catch (_e) { pass++; }
}

const SAMPLE = {
  title: "Kunnan vaalikone 2026",
  desc: "Ota kantaa — ääkköset säilyvät: äöå ÄÖÅ.",
  questions: [
    "Kuntaveroa pitää laskea.",
    "Kouluverkko säilytetään nykyisellään.",
    "Keskustaan rakennetaan uusi uimahalli.",
  ],
  candidates: [
    { name: "Aino Ahonen", party: "Puolue A", answers: ["k", "e", "k"] },
    { name: "Björn Öström", party: "Puolue B", answers: ["e", "e", "o"] },
  ],
};

(async () => {
  /* ---------- koodaus: vaalikone ---------- */
  const code = await V.encodeCompass(SAMPLE);
  ok(/^VK[12]\.[A-Za-z0-9_-]+$/.test(code), "koodi on VK-muotoa ja URL-turvallinen: " + code.slice(0, 12));

  const back = await V.decodeCompass(code);
  ok(back.title === SAMPLE.title, "otsikko säilyy");
  ok(back.desc === SAMPLE.desc, "kuvaus ja ääkköset säilyvät: " + back.desc);
  ok(back.questions.length === 3 && back.questions[1] === SAMPLE.questions[1], "kysymykset säilyvät");
  ok(back.candidates.length === 2, "ehdokkaat säilyvät");
  ok(back.candidates[0].name === "Aino Ahonen" && back.candidates[0].party === "Puolue A", "ehdokkaan tiedot säilyvät");
  ok(back.candidates[1].answers.join("") === "eeo", "ehdokkaan vastaukset säilyvät (myös ohitus)");

  // Ehdokaslinkki: ilman ehdokkaita
  const qCode = await V.encodeCompass(SAMPLE, { includeCandidates: false });
  const qBack = await V.decodeCompass(qCode);
  ok(qBack.candidates.length === 0 && qBack.questions.length === 3, "ehdokaslinkki ei sisällä ehdokkaita");
  ok(qCode.length < code.length, "ehdokaslinkki on lyhyempi");

  // Virheelliset koodit
  await throws(() => V.decodeCompass("roskaa"), "roska hylätään");
  await throws(() => V.decodeCompass("VK2.!!!!"), "ei-base64url hylätään");
  await throws(() => V.decodeCompass(code.slice(0, -8)), "katkennut koodi hylätään");
  await throws(() => V.decodeCompass("VE2." + code.slice(4)), "väärä etuliite hylätään");

  /* ---------- normalisointi ja validointi ---------- */
  const norm = V.normalizeCompass({
    title: "  x  ",
    questions: ["a", "b"],
    candidates: [{ name: "N", answers: "kX" }],
  });
  ok(norm.candidates[0].answers.join("") === "ko", "tuntematon vastausmerkki -> ohitus, pituus täsmää");

  ok(V.validateCompass(SAMPLE).length === 0, "kelvollinen vaalikone läpäisee validoinnin");
  ok(V.validateCompass({ ...SAMPLE, title: "" }).length > 0, "tyhjä nimi hylätään");
  ok(V.validateCompass({ ...SAMPLE, questions: [] }).length > 0, "ei kysymyksiä -> virhe");
  ok(V.validateCompass({ ...SAMPLE, questions: ["ok", "  "] }).length > 0, "tyhjä kysymys -> virhe");
  ok(V.validateCompass({ ...SAMPLE, candidates: [] }).length > 0, "ei ehdokkaita -> virhe");
  ok(V.validateCompass({ ...SAMPLE, candidates: [] }, { needCandidates: false }).length === 0,
    "ehdokaslinkki kelpaa ilman ehdokkaita");
  await throws(() => V.encodeCompass({ ...SAMPLE, title: "" }), "encode hylkää virheellisen");

  // Rajat: liian pitkä teksti leikataan, ei kaadu
  const long = await V.decodeCompass(await V.encodeCompass({
    ...SAMPLE, title: "x".repeat(1000),
  }));
  ok(long.title.length === V.LIMITS.title, "liian pitkä otsikko leikataan rajaan");

  /* ---------- ehdokkaan vastauskoodi ---------- */
  const reply = await V.encodeReply("Maija Meikäläinen", ["k", "o", "e"]);
  ok(/^VE[12]\./.test(reply), "vastauskoodi on VE-muotoa");
  const rBack = await V.decodeReply(reply, 3);
  ok(rBack.name === "Maija Meikäläinen", "nimi säilyy koodissa");
  ok(rBack.answers.join("") === "koe", "vastaukset säilyvät koodissa");
  await throws(() => V.decodeReply(reply, 5), "väärä kysymysmäärä hylätään");
  await throws(() => V.decodeReply(code, 3), "vaalikonekoodi ei kelpaa vastauskoodiksi");
  await throws(() => V.encodeReply("", ["k"]), "nimetön vastauskoodi hylätään");

  /* ---------- vastaussessio ---------- */
  const s = V.createSession(3);
  ok(s.pos === 0 && !s.done() && s.answeredCount() === 0, "sessio alkaa alusta");
  s.answer(V.YES, 2);
  ok(s.pos === 1 && s.answers[0].a === "k" && s.answers[0].w === 2, "vastaus ja paino tallentuvat");
  s.answer(V.SKIP);
  ok(s.answers[1].a === "o" && s.answers[1].w === 0, "ohitus -> paino 0");
  s.back();
  ok(s.pos === 1 && s.current().a === "o", "takaisin palaa edelliseen ja näyttää vanhan vastauksen");
  s.answer(V.NO, 3);
  const doneNow = s.answer(V.NO, 99);
  ok(doneNow && s.done(), "sessio valmis viimeisen vastauksen jälkeen");
  ok(s.answers[2].w === V.MAX_WEIGHT, "liian suuri paino leikataan maksimiin");
  s.jump(0);
  ok(s.pos === 0 && !s.done(), "jump palaa muokkaamaan");
  s.answer(V.YES, 1);
  ok(s.answers[0].w === 1 && s.answeredCount() === 3, "muutos päivittää vastauksen");

  // Vapaa paino (pudotusvalikko): 0.5 ja 10 kelpaavat, roska ei
  ok(V.sanitizeWeight(0.5) === 0.5, "0,5× kelpaa");
  ok(V.sanitizeWeight(10) === 10 && V.sanitizeWeight(99) === V.MAX_WEIGHT, "maksimi 10×");
  ok(V.sanitizeWeight("roska") === V.DEFAULT_WEIGHT && V.sanitizeWeight(-2) === V.DEFAULT_WEIGHT,
    "kelvoton paino -> oletus");
  const s2 = V.createSession(1);
  s2.answer(V.YES, 0.5);
  ok(s2.answers[0].w === 0.5, "custom-paino tallentuu sessioon");

  /* ---------- tuloslaskenta ---------- */
  const va = (arr) => arr.map((x) => (x ? { a: x[0], w: x[1] } : null));

  // Kaikki samaa mieltä -> 100
  let r = V.matchCandidate(["k", "e"], va([["k", 1], ["e", 1]]));
  ok(r.pct === 100 && r.agree === 2 && r.disagree === 0, "täysi osuma = 100 %");

  // Puolet samaa mieltä tasapainoin -> 50
  r = V.matchCandidate(["k", "k"], va([["k", 1], ["e", 1]]));
  ok(r.pct === 50, "puolet = 50 %");

  // Painot: samaa mieltä 3x, eri mieltä 1x -> 75
  r = V.matchCandidate(["k", "k"], va([["k", 3], ["e", 1]]));
  ok(r.pct === 75, "painotus vaikuttaa: 3/(3+1) = 75 %");

  // Custom-painot: 0,5× samaa mieltä, 1× eri mieltä -> 33
  r = V.matchCandidate(["k", "k"], va([["k", 0.5], ["e", 1]]));
  ok(r.pct === 33, "murtopaino: 0,5/1,5 = 33 %, oli " + r.pct);

  // Vastaajan ohitus ei vaikuta kumpaankaan suuntaan
  r = V.matchCandidate(["k", "e"], va([["k", 2], ["o", 0]]));
  ok(r.pct === 100 && r.compared === 1, "vastaajan ohitus jää vertailun ulkopuolelle");

  // Ehdokkaan ohitus jää vertailun ulkopuolelle
  r = V.matchCandidate(["o", "e"], va([["k", 3], ["e", 1]]));
  ok(r.pct === 100 && r.compared === 1, "ehdokkaan ohitus ei laske osumaa");

  // Ei yhteisiä vastauksia -> pct null
  r = V.matchCandidate(["o", "o"], va([["k", 1], ["e", 1]]));
  ok(r.pct === null && r.compared === 0, "ei yhteisiä kysymyksiä -> ei tulosta");

  // Detail kattaa kaikki kysymykset
  ok(r.detail.length === 2, "erittely kattaa kaikki kysymykset");

  // matchAll: järjestys ja tasapelin ratkaisu
  const compass = {
    title: "t", desc: "", questions: ["a", "b"],
    candidates: [
      { name: "Nolla", party: "", answers: ["o", "o"] },
      { name: "Voittaja", party: "", answers: ["k", "e"] },
      { name: "Häviäjä", party: "", answers: ["e", "k"] },
      { name: "Puolikas", party: "", answers: ["k", "k"] },
    ],
  };
  const all = V.matchAll(compass, va([["k", 1], ["e", 1]]));
  ok(all[0].name === "Voittaja" && all[0].pct === 100, "paras ensin");
  ok(all[1].name === "Puolikas" && all[1].pct === 50, "toiseksi paras toisena");
  ok(all[all.length - 1].name === "Nolla" && all[all.length - 1].pct === null,
    "ilman yhteisiä vastauksia viimeiseksi");

  // Pyöristys: 2/3 painosta -> 67
  r = V.matchCandidate(["k", "e"], va([["k", 2], ["k", 1]]));
  ok(r.pct === 67, "pyöristys lähimpään kokonaislukuun (67), oli " + r.pct);

  console.log("\nVaalikone: " + pass + " ok, " + fail + " virhettä");
  if (fail) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
