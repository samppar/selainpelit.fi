"use strict";
// Vaalikone — ydin: koodaus, validointi, vastaussessio ja tuloslaskenta.
// Puhdas JS ilman DOM:ia — testattavissa Nodella (test/run_tests.js).
// Selaimessa sama tiedosto ladataan globaaliin Vaalikone-objektiin.

// Vastausmerkit (myös URL-koodauksessa)
const YES = "k";   // kyllä
const NO = "e";    // ei
const SKIP = "o";  // ohitettu / ei kantaa

// Painoarvot vastaajalle: pikavalinnat + vapaa paino (pudotusvalikko UI:ssa)
const WEIGHTS = [1, 2, 3];
const DEFAULT_WEIGHT = 1;
const MAX_WEIGHT = 10;

// Kelvoton paino -> oletus; liian suuri leikataan maksimiin.
function sanitizeWeight(w) {
  const x = Number(w);
  if (!isFinite(x) || x <= 0) return DEFAULT_WEIGHT;
  return Math.min(Math.round(x * 100) / 100, MAX_WEIGHT);
}

// Kokorajat — pitävät jakolinkin järkevän mittaisena
const LIMITS = {
  title: 120,
  desc: 600,
  questions: 60,
  questionText: 300,
  candidates: 100,
  name: 80,
  party: 80,
};

/* ---------------- UTF-8 <-> base64url ---------------- */

function bytesToB64url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = typeof btoa !== "undefined"
    ? btoa(bin)
    : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(str) {
  let b64 = String(str).replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  let bin;
  if (typeof atob !== "undefined") bin = atob(b64);
  else bin = Buffer.from(b64, "base64").toString("binary");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function deflateText(str) {
  const cs = new CompressionStream("deflate-raw");
  const stream = new Blob([new TextEncoder().encode(str)]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflateText(bytes) {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

const hasCompression = typeof CompressionStream !== "undefined" &&
  typeof DecompressionStream !== "undefined";

async function packText(str) {
  if (hasCompression) return { z: true, b64: bytesToB64url(await deflateText(str)) };
  return { z: false, b64: bytesToB64url(new TextEncoder().encode(str)) };
}

async function unpackText(b64, compressed) {
  const bytes = b64urlToBytes(b64);
  if (compressed) return inflateText(bytes);
  return new TextDecoder().decode(bytes);
}

/* ---------------- Normalisointi ja validointi ---------------- */

function clip(s, n) {
  return String(s == null ? "" : s).trim().slice(0, n);
}

function normalizeAnswers(answers, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = Array.isArray(answers) ? answers[i] : String(answers || "")[i];
    out.push(a === YES || a === NO ? a : SKIP);
  }
  return out;
}

// Palauttaa muotoillun, rajatun kopion vaalikoneesta.
function normalizeCompass(raw) {
  const c = raw || {};
  const questions = (Array.isArray(c.questions) ? c.questions : [])
    .map((q) => clip(q, LIMITS.questionText))
    .slice(0, LIMITS.questions);
  const candidates = (Array.isArray(c.candidates) ? c.candidates : [])
    .slice(0, LIMITS.candidates)
    .map((cand) => ({
      name: clip(cand && cand.name, LIMITS.name),
      party: clip(cand && cand.party, LIMITS.party),
      answers: normalizeAnswers(cand && cand.answers, questions.length),
    }));
  return {
    title: clip(c.title, LIMITS.title),
    desc: clip(c.desc, LIMITS.desc),
    questions,
    candidates,
  };
}

// errors: lista suomenkielisiä virheilmoituksia (tyhjä = kelpaa).
function validateCompass(raw, opts) {
  const needCandidates = !opts || opts.needCandidates !== false;
  const c = normalizeCompass(raw);
  const errors = [];
  if (!c.title) errors.push("Anna vaalikoneelle nimi.");
  if (c.questions.length === 0) errors.push("Lisää vähintään yksi kysymys.");
  c.questions.forEach((q, i) => {
    if (!q) errors.push("Kysymys " + (i + 1) + " on tyhjä.");
  });
  if (needCandidates) {
    if (c.candidates.length === 0) errors.push("Lisää vähintään yksi ehdokas.");
    c.candidates.forEach((cand, i) => {
      if (!cand.name) errors.push("Ehdokkaalta " + (i + 1) + " puuttuu nimi.");
    });
  }
  return errors;
}

/* ---------------- Vaalikoneen koodaus jakolinkkiin ---------------- */
// Etuliite: VK2 = deflate-pakattu, VK1 = pakkaamaton. Sisältö: base64url(JSON).

async function encodeCompass(raw, opts) {
  const includeCandidates = !opts || opts.includeCandidates !== false;
  const c = normalizeCompass(raw);
  const errors = validateCompass(c, { needCandidates: includeCandidates });
  if (errors.length) throw new Error(errors[0]);
  const compact = {
    t: c.title,
    d: c.desc,
    q: c.questions,
    c: includeCandidates
      ? c.candidates.map((x) => [x.name, x.party, x.answers.join("")])
      : [],
  };
  const packed = await packText(JSON.stringify(compact));
  return (packed.z ? "VK2." : "VK1.") + packed.b64;
}

async function decodeCompass(code) {
  const m = /^(VK[12])\.([A-Za-z0-9_-]+)$/.exec(String(code || "").trim());
  if (!m) throw new Error("Linkki ei ole kelvollinen vaalikone.");
  let data;
  try {
    data = JSON.parse(await unpackText(m[2], m[1] === "VK2"));
  } catch (_e) {
    throw new Error("Linkin sisältöä ei voitu lukea — se on ehkä katkennut.");
  }
  const compass = normalizeCompass({
    title: data.t,
    desc: data.d,
    questions: data.q,
    candidates: (Array.isArray(data.c) ? data.c : []).map((row) => ({
      name: row && row[0],
      party: row && row[1],
      answers: row && row[2],
    })),
  });
  if (!compass.title || compass.questions.length === 0) {
    throw new Error("Linkistä puuttuu vaalikoneen sisältö.");
  }
  return compass;
}

/* ---------------- Ehdokkaan vastauskoodi ---------------- */
// Ehdokas vastaa ehdokaslinkissä ja lähettää koodin vaalikoneen tekijälle.

async function encodeReply(name, answers) {
  const n = clip(name, LIMITS.name);
  if (!n) throw new Error("Anna nimesi ennen koodin luontia.");
  const a = normalizeAnswers(answers, Array.isArray(answers) ? answers.length : 0);
  if (a.length === 0) throw new Error("Vastauksia ei ole.");
  const packed = await packText(JSON.stringify({ n, a: a.join("") }));
  return (packed.z ? "VE2." : "VE1.") + packed.b64;
}

async function decodeReply(code, expectedCount) {
  const m = /^(VE[12])\.([A-Za-z0-9_-]+)$/.exec(String(code || "").trim());
  if (!m) throw new Error("Koodi ei ole kelvollinen vastauskoodi.");
  let data;
  try {
    data = JSON.parse(await unpackText(m[2], m[1] === "VE2"));
  } catch (_e) {
    throw new Error("Koodia ei voitu lukea — se on ehkä katkennut.");
  }
  const name = clip(data.n, LIMITS.name);
  const answers = normalizeAnswers(data.a, String(data.a || "").length);
  if (!name || answers.length === 0) throw new Error("Koodista puuttuu sisältö.");
  if (expectedCount != null && answers.length !== expectedCount) {
    throw new Error(
      "Koodissa on " + answers.length + " vastausta, mutta vaalikoneessa on " +
      expectedCount + " kysymystä."
    );
  }
  return { name, answers };
}

/* ---------------- Vastaussessio (yksi kysymys kerrallaan) ---------------- */
// voterAnswers[i] = { a: 'k'|'e'|'o', w: paino } tai null (ei vielä vastattu).

function createSession(questionCount) {
  const answers = new Array(questionCount).fill(null);
  let pos = 0;
  return {
    count: questionCount,
    answers,
    get pos() { return pos; },
    current() { return answers[pos] || null; },
    done() { return pos >= questionCount; },
    answeredCount() { return answers.filter(Boolean).length; },
    // Vastaa nykyiseen kysymykseen ja siirry eteenpäin.
    answer(a, w) {
      if (pos >= questionCount) return true;
      const ans = a === YES || a === NO ? a : SKIP;
      const weight = ans === SKIP ? 0 : sanitizeWeight(w);
      answers[pos] = { a: ans, w: weight };
      pos++;
      return pos >= questionCount;
    },
    back() { if (pos > 0) pos--; return pos; },
    // Hyppää suoraan kysymykseen (tulosnäkymän "muuta vastausta").
    jump(i) { if (i >= 0 && i < questionCount) pos = i; return pos; },
  };
}

/* ---------------- Tuloslaskenta ---------------- */
// Vertailussa ovat vain kysymykset, joihin sekä vastaaja että ehdokas
// ottivat kantaa. Samaa mieltä -> koko paino, eri mieltä -> 0.
// pct = 100 * painotetut osumat / vertailtujen painojen summa.

function matchCandidate(candAnswers, voterAnswers) {
  let weightSum = 0, agreeWeight = 0, agree = 0, disagree = 0, compared = 0;
  const detail = [];
  for (let i = 0; i < voterAnswers.length; i++) {
    const v = voterAnswers[i];
    const ca = candAnswers[i];
    if (!v || v.a === SKIP) {
      detail.push({ state: "voterSkip", voter: SKIP, cand: ca || SKIP, w: 0 });
      continue;
    }
    if (ca !== YES && ca !== NO) {
      detail.push({ state: "candSkip", voter: v.a, cand: SKIP, w: v.w });
      continue;
    }
    compared++;
    weightSum += v.w;
    if (ca === v.a) {
      agree++;
      agreeWeight += v.w;
      detail.push({ state: "agree", voter: v.a, cand: ca, w: v.w });
    } else {
      disagree++;
      detail.push({ state: "disagree", voter: v.a, cand: ca, w: v.w });
    }
  }
  const pct = compared > 0 ? Math.round((100 * agreeWeight) / weightSum) : null;
  return { pct, agree, disagree, compared, detail };
}

function matchAll(compass, voterAnswers) {
  const results = compass.candidates.map((cand) => {
    const r = matchCandidate(cand.answers, voterAnswers);
    return { name: cand.name, party: cand.party, ...r };
  });
  results.sort((a, b) => {
    if (a.pct == null && b.pct == null) return a.name.localeCompare(b.name, "fi");
    if (a.pct == null) return 1;
    if (b.pct == null) return -1;
    if (b.pct !== a.pct) return b.pct - a.pct;
    if (b.agree !== a.agree) return b.agree - a.agree;
    return a.name.localeCompare(b.name, "fi");
  });
  return results;
}

/* ---------------- Vienti ---------------- */

const Vaalikone = {
  YES, NO, SKIP, WEIGHTS, DEFAULT_WEIGHT, MAX_WEIGHT, sanitizeWeight, LIMITS,
  normalizeCompass, validateCompass,
  encodeCompass, decodeCompass,
  encodeReply, decodeReply,
  createSession, matchCandidate, matchAll,
};

if (typeof module !== "undefined" && module.exports) module.exports = Vaalikone;
if (typeof window !== "undefined") window.Vaalikone = Vaalikone;
