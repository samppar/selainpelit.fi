// ============================================================================
//  Katko — ytimen ja tekoälyperustan regressiotestit (node test/run_tests.js).
//  Puhdas Node, ei DOM:ia: engine.js + agents/base.js + agenttien laillisuus.
// ============================================================================
import {
  buildDeck, shuffle, makeRng, legalCards, trickWinner, trickPoints,
  computeVoids, buildView, safeChoose, playDeal, playMatch,
} from "../engine.js";
import { suitInfo, isBoss, baseChoice, twoPlan, planChoice } from "../agents/base.js";
import { aino } from "../agents/aino.js";
import { eino } from "../agents/eino.js";
import { vaino } from "../agents/vaino.js";
import { monte } from "../agents/monte.js";

let pass = 0, fail = 0;
function ok(c, m) {
  if (c) pass++;
  else { fail++; console.error("  FAIL:", m); }
}

const C = (suit, v) => ({ suit, v });
const fmt = c => c ? c.suit + c.v : String(c);

// Luettava fixtuuri: rakenna view suoraan kentistä (AGENTS.md: fixtuurit ensin).
function makeView({ me = 0, hand = [], trick = [], ledSuit = null, trickNumber = 1,
                    kakko = true, played = [], handCounts, voids, scores, target } = {}) {
  const hc = handCounts || [hand.length, 5, 5, 5];
  return {
    me, hand, trick, ledSuit, trickNumber, kakko, played,
    handCounts: hc,
    legal: legalCards(hand, trick, ledSuit),
    voids: voids || [{}, {}, {}, {}],
    scores: scores || [0, 0, 0, 0],
    target: target != null ? target : null,
  };
}

console.log("Katko engine tests");

// --- pakka ------------------------------------------------------------------
{
  const d = buildDeck();
  ok(d.length === 52, "pakassa 52 korttia");
  ok(new Set(d.map(c => c.suit + c.v)).size === 52, "kaikki kortit eri");
  const s = shuffle(d.slice(), makeRng(1));
  ok(s.length === 52 && new Set(s.map(c => c.suit + c.v)).size === 52, "sekoitus säilyttää kortit");
}

// --- maapakko ---------------------------------------------------------------
{
  const hand = [C("H", 5), C("H", 10), C("S", 2)];
  const led = legalCards(hand, [{ p: 1, card: C("H", 7) }], "H");
  ok(led.length === 2 && led.every(c => c.suit === "H"), "maapakko: vain hertat sallittuja");
  const free = legalCards([C("S", 2), C("C", 9)], [{ p: 1, card: C("H", 7) }], "H");
  ok(free.length === 2, "ei maata kädessä -> kaikki sallittuja");
  const lead = legalCards(hand, [], null);
  ok(lead.length === 3, "avaus: koko käsi sallittu");
}

// --- tikin voittaja ja pisteet ----------------------------------------------
{
  const trick = [
    { p: 0, card: C("H", 7) }, { p: 1, card: C("S", 14) },
    { p: 2, card: C("H", 11) }, { p: 3, card: C("H", 3) },
  ];
  const w = trickWinner(trick, "H");
  ok(w.p === 2 && w.card.v === 11, "korkein avausmaan kortti vie tikin (ässä väärää maata ei voita)");
  ok(trickPoints(C("H", 2), true) === 2, "kakkossääntö: kakkosella 2 pistettä");
  ok(trickPoints(C("H", 2), false) === 1, "ilman kakkossääntöä kakkosella 1 piste");
  ok(trickPoints(C("H", 14), true) === 1, "tavallinen viimeinen tikki 1 piste");
}

// --- void-päättely -----------------------------------------------------------
{
  const history = [{
    ledSuit: "H",
    plays: [
      { p: 0, card: C("H", 5) }, { p: 1, card: C("S", 9) },
      { p: 2, card: C("H", 8) }, { p: 3, card: C("H", 2) },
    ],
  }];
  const v = computeVoids(history, [], null);
  ok(v[1].H === true, "sakannut pelaaja on todistetusti pihalla maasta");
  ok(!v[0].H && !v[2].H && !v[3].H, "tunnustaneet eivät ole pihalla");
}

// --- buildView ---------------------------------------------------------------
{
  const state = {
    hands: [[C("H", 5), C("S", 2)], [C("D", 3)], [C("C", 4)], [C("H", 9)]],
    trick: [], ledSuit: null, trickNumber: 4, kakko: true, played: [], history: [],
    scores: [3, 8, 1, 0], target: 10,
  };
  const view = buildView(state, 0);
  ok(view.scores[1] === 8 && view.target === 10, "view välittää pistetilanteen ja targetin");
  ok(view.handCounts.join(",") === "2,1,1,1", "handCounts oikein");
  ok(Object.isFrozen(view), "view on jäädytetty");
}

// --- safeChoose --------------------------------------------------------------
{
  const view = makeView({ hand: [C("H", 5), C("H", 10)], trick: [{ p: 1, card: C("H", 7) }], ledSuit: "H" });
  const cheat = { chooseCard: () => C("S", 14) };            // laiton kortti
  const crash = { chooseCard: () => { throw new Error("kaboom"); } };
  ok(fmt(safeChoose(cheat, view)) === "H5", "laiton siirto -> matalin laillinen");
  ok(fmt(safeChoose(crash, view)) === "H5", "poikkeus -> matalin laillinen");
}

// --- suitInfo: outstanding katkaistaan muiden käsikorttien määrään ------------
{
  // Tikki 5: muilla yhteensä 3 korttia -> herttoja voi olla muilla enintään 3,
  // vaikka 13 kortin laskenta väittäisi 12:ta.
  const view = makeView({ hand: [C("H", 5)], handCounts: [1, 1, 1, 1], trickNumber: 5 });
  const info = suitInfo(view);
  ok(info.H.outstanding === 3, "outstanding <= muiden käsikortit yhteensä (oli " + info.H.outstanding + ")");
  // Ilman katkaisua: 13 - 1 oma - 0 pelattua = 12.
}

// --- isBoss ------------------------------------------------------------------
{
  const played = [];
  for (let v = 6; v <= 14; v++) played.push(C("S", v));      // S 6..14 nähty
  const view = makeView({ hand: [C("S", 5), C("S", 3)], played });
  const info = suitInfo(view);
  ok(isBoss(info, C("S", 5)), "S5 on pomo kun 6..14 nähty (4 näkemättä)");
  ok(!isBoss(info, C("S", 3)), "S3 ei ole pomo (S4 näkemättä)");
}

// --- twoPlan: varma lopetus laskennalla ---------------------------------------
{
  // Kaikki 13 herttaa näkyvissä (11 pelattu + H2, H14 kädessä) -> maa kuollut.
  const played = [];
  for (let v = 3; v <= 13; v++) played.push(C("H", v));
  const view = makeView({ hand: [C("H", 2), C("H", 14), C("S", 5)], played, trickNumber: 3,
                          handCounts: [3, 3, 3, 3] });
  const plan = twoPlan(view, suitInfo(view), "sure");
  ok(plan && plan.suit === "H" && plan.committed, "kaikki maan kortit nähty -> varma kakkoslopetus");
}

// --- twoPlan: varma lopetus void-päättelyllä (uusi) ---------------------------
{
  // Kukaan muu ei laskennan mukaan ole pelannut herttaa loppuun, mutta KAIKKI
  // kolme muuta ovat todistetusti sakanneet hertan -> maa on silti kuollut.
  const voids = [{}, { H: true }, { H: true }, { H: true }];
  const view = makeView({ hand: [C("H", 2), C("S", 5), C("S", 7)], voids, trickNumber: 4,
                          handCounts: [3, 3, 3, 3] });
  const plan = twoPlan(view, suitInfo(view), "sure");
  ok(plan && plan.suit === "H" && plan.committed, "kaikki muut pihalla maasta -> varma kakkoslopetus");
  // Yksi kortillinen pelaaja ilman void-todistetta -> EI varma.
  const view2 = makeView({ hand: [C("H", 2), C("S", 5), C("S", 7)],
                           voids: [{}, { H: true }, { H: true }, {}], trickNumber: 4,
                           handCounts: [3, 3, 3, 3] });
  ok(twoPlan(view2, suitInfo(view2), "sure") == null, "yksi pelaaja voi vielä pitää maata -> ei varmaa lopetusta");
}

// --- twoPlan: pistetilanne skaalaa riskin -------------------------------------
{
  // Tavoitteleva tilanne (H2 + pomoajuri H14, maata vähän jäljellä muualla).
  const played = [];
  for (let v = 6; v <= 13; v++) played.push(C("H", v));      // H6..13 pelattu
  const base = { hand: [C("H", 2), C("H", 14), C("S", 5)], played, trickNumber: 2,
                 handCounts: [3, 3, 3, 3] };
  // Ilman ottelukontekstia "hunt" tavoittelee.
  const vFree = makeView(base);
  ok(twoPlan(vFree, suitInfo(vFree), "hunt") != null, "hunt tavoittelee ilman pistetilannetta");
  // target - 1: tavallinen tikki riittää -> EI tavoittelua (hunt alennetaan).
  const vLast = makeView({ ...base, scores: [9, 0, 0, 0], target: 10 });
  ok(twoPlan(vLast, suitInfo(vLast), "hunt") == null, "target-1: kakkosta ei jahdata");
  // target - 2: kakkoslopetus voittaisi ottelun -> jopa "sure" eskaloituu jahtiin.
  const vMp = makeView({ ...base, scores: [8, 0, 0, 0], target: 10 });
  ok(twoPlan(vMp, suitInfo(vMp), "sure") != null, "target-2: varovainenkin jahtaa kakkoslopetusta");
}

// --- planChoice: tikin 4 haltuunotto ja kakkosen lyönti tikissä 5 -------------
{
  // Varma suunnitelma, johdan tikkiä 4: pitää voittaa halvimmalla pomolla,
  // jotta pääsen avaamaan viimeisen tikin kakkosella.
  const played = [];
  for (let v = 6; v <= 14; v++) played.push(C("S", v));      // S6..14 nähty -> S5 pomo
  const voids = [{}, { H: true }, { H: true }, { H: true }];
  const view = makeView({ hand: [C("H", 2), C("S", 5)], played, voids, trickNumber: 4,
                          handCounts: [2, 2, 2, 2] });
  const info = suitInfo(view);
  const plan = twoPlan(view, info, "sure");
  ok(plan && plan.committed, "fixtuuri: varma suunnitelma tikissä 4");
  ok(fmt(planChoice(view, info, plan)) === "S5", "tikki 4: voita pomolla, säästä kakkonen (oli " +
    fmt(planChoice(view, info, plan)) + ")");
  // Tikki 5: lyö kakkonen.
  const view5 = makeView({ hand: [C("H", 2)], played, voids, trickNumber: 5,
                           handCounts: [1, 1, 1, 1] });
  const info5 = suitInfo(view5);
  const plan5 = twoPlan(view5, info5, "sure");
  ok(plan5 && fmt(planChoice(view5, info5, plan5)) === "H2", "tikki 5: varma lopetus lyö kakkosen");
}

// --- baseChoice: perusperiaatteet ---------------------------------------------
{
  // Johdan tikkiä 1: heitä matala roska, älä pomoa.
  const played = [];
  for (let v = 10; v <= 14; v++) played.push(C("D", v));     // D10..14 nähty -> D9 pomo
  const view = makeView({ hand: [C("D", 9), C("C", 3), C("H", 7)], played, trickNumber: 1,
                          handCounts: [3, 5, 5, 5] });
  ok(fmt(baseChoice(view)) === "C3", "avaus tikissä 1: matalin ei-pomo");
  // Seuraan tikissä 2: väistä jos voi.
  const view2 = makeView({ hand: [C("H", 5), C("H", 12)], trick: [{ p: 3, card: C("H", 9) }],
                           ledSuit: "H", trickNumber: 2, handCounts: [2, 2, 2, 2] });
  ok(fmt(baseChoice(view2)) === "H5", "tikissä 1-3 väistetään kun voidaan");
  // Seuraan tikissä 4: voita jos voi.
  const view4 = makeView({ hand: [C("H", 5), C("H", 12)], trick: [{ p: 3, card: C("H", 9) }],
                           ledSuit: "H", trickNumber: 4, handCounts: [2, 2, 2, 2] });
  ok(fmt(baseChoice(view4)) === "H12", "tikissä 4 voitetaan halvimmalla voittavalla");
}

// --- playDeal: determinismi ja kirjanpito -------------------------------------
{
  const agents = [aino, eino, vaino, eino];
  const r1 = playDeal(agents, 0, true, makeRng(99));
  const r2 = playDeal(agents, 0, true, makeRng(99));
  ok(r1.winner === r2.winner && r1.pts === r2.pts &&
     fmt(r1.winningCard) === fmt(r2.winningCard), "sama siemen -> sama jako");
  ok(r1.scores.reduce((a, b) => a + b, 0) === r1.pts, "vain viimeisen tikin voittaja pisteytetään");
  ok(r1.pts === trickPoints(r1.winningCard, true), "pisteet vastaavat voittokorttia");
}

// --- playMatch: ottelu targetiin ----------------------------------------------
{
  const res = playMatch([aino, eino, vaino, eino], 3, true, makeRng(7), 0);
  ok(Math.max(...res.scores) >= 3, "ottelu jatkuu kunnes joku yltää targetiin");
  ok(res.scores[res.winner] === Math.max(...res.scores), "voittajalla eniten pisteitä");
  ok(res.deals >= 2, "3 pisteeseen tarvitaan vähintään 2 jakoa");
}

// --- agenttien laillisuusfuzz: jokainen valinta laillisten joukosta ------------
{
  const roster = [aino, eino, vaino, monte];
  const rnd = makeRng(2026);
  let illegal = 0, decisions = 0;
  for (let deal = 0; deal < 12; deal++) {
    const checked = roster.map(a => ({
      name: a.name,
      chooseCard(view) {
        const c = a.chooseCard({ ...view, _mcSamples: 8 });
        decisions++;
        if (!c || !view.legal.some(l => l.suit === c.suit && l.v === c.v)) {
          illegal++;
          console.error(`  laiton valinta: ${a.name} tikissä ${view.trickNumber} -> ${fmt(c)}`);
        }
        return c;
      },
    }));
    playDeal(checked, deal % 4, deal % 2 === 0, rnd,
             { scores: [deal % 3, 8, 9, 0], target: 10 });   // myös loppupelitilanteet
  }
  ok(illegal === 0 && decisions === 12 * 20, `kaikki ${decisions} agenttivalintaa laillisia`);
}

console.log(`\n${pass} ok, ${fail} fail`);
if (fail) process.exit(1);
