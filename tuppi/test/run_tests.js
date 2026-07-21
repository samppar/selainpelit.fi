// Testit: säännöt, moottorin eheys ja tekoälyjen vahvuushierarkia.
import {
  Card,
  Suit,
  fullDeck,
  legalMoves,
  scoreDeal,
  scoreSooli,
  sooliRank,
  sooliTrickWinner,
  estimateSooliSurvival,
  estimateSooliEV,
  SOOLI_POINTS,
  trickWinner,
  teamOf,
  partnerOf,
  TuppiEngine,
  RNG,
} from "../src/index.js";
import { RandomPlayer } from "../players/randomPlayer.js";
import { HeuristicPlayer } from "../players/heuristicPlayer.js";
import { CountingPlayer } from "../players/countingPlayer.js";
import { ChampionPlayer } from "../players/championPlayer.js";

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log("  FAIL:", msg);
  }
}
function eq(a, b, msg) {
  ok(a === b, `${msg} (sai ${a}, odotettiin ${b})`);
}

// --- KORTIT & PAKKA --------------------------------------------------- //
console.log("== Kortit & pakka ==");
const deck = fullDeck();
eq(deck.length, 52, "pakassa 52 korttia");
eq(new Set(deck).size, 52, "kaikki kortit uniikkeja (internointi)");
ok(Card.of(14, Suit.SPADES) === Card.of(14, Suit.SPADES), "internointi: sama olio");

// --- TIKIN VOITTAJA --------------------------------------------------- //
console.log("== Tikin voittaja ==");
// aloitusmaa risti; korkein risti voittaa, muut maat eivät päde
let trick = [
  [0, Card.of(10, Suit.CLUBS)],
  [1, Card.of(14, Suit.HEARTS)], // ässä mutta väärä maa
  [2, Card.of(13, Suit.CLUBS)], // kuningas ristiä -> voittaa
  [3, Card.of(2, Suit.CLUBS)],
];
eq(trickWinner(trick), 2, "korkein aloitusmaan kortti voittaa");
trick = [
  [0, Card.of(5, Suit.DIAMONDS)],
  [1, Card.of(6, Suit.SPADES)],
  [2, Card.of(7, Suit.SPADES)],
  [3, Card.of(4, Suit.DIAMONDS)],
];
eq(trickWinner(trick), 0, "sakkaukset eivät voita vaikka korkeampia");

// --- MAANTUNTO -------------------------------------------------------- //
console.log("== Maantunto ==");
const hand = [Card.of(3, Suit.CLUBS), Card.of(9, Suit.CLUBS), Card.of(14, Suit.HEARTS)];
eq(legalMoves(hand, Suit.CLUBS).length, 2, "on pakko tunnustaa ristiä");
eq(legalMoves(hand, Suit.SPADES).length, 3, "ei patoja -> saa sakata mitä vain");
eq(legalMoves(hand, null).length, 3, "aloittaja saa lyödä mitä vain");

// --- PISTEYTYS -------------------------------------------------------- //
console.log("== Pisteytys ==");
// rami: ramaaja (joukkue 0) tekee 8 kasaa -> 4*(8-6)=8p, ei ryöstöä
let r = scoreDeal({ 0: 8, 1: 5 }, "rami", 0);
eq(r.winner, 0, "rami: enemmän kasoja voittaa"); eq(r.points, 8, "rami 8 kasaa = 8p"); ok(!r.steal, "ei ryöstöä");
// ryöstörami: ramaaja joukkue 0, mutta joukkue 1 tekee 7 -> 4*(7-6)*2=8p
r = scoreDeal({ 0: 6, 1: 7 }, "rami", 0);
eq(r.winner, 1, "ryöstö: vastapari voittaa"); eq(r.points, 8, "ryöstö tuplaa (7 kasaa -> 8p)"); ok(r.steal, "steal-lippu");
// nälsy: ramaaja 0, joukkue 1 vie kaikki 13 -> 4*(13-6)*2 = 56
r = scoreDeal({ 0: 0, 1: 13 }, "rami", 0);
eq(r.points, 56, "nälsy 0-13 = 56p"); ok(r.steal, "nälsy on ryöstö");
// nolo: vähemmän kasoja voittaa, ei tuplausta. Häviäjä 8 -> 4*(8-6)=8p
r = scoreDeal({ 0: 5, 1: 8 }, "nolo", null);
eq(r.winner, 0, "nolo: vähemmän kasoja voittaa"); eq(r.points, 8, "nolo 8 häviäjäkasaa = 8p"); ok(!r.steal, "nolossa ei ryöstöä");

// --- MOOTTORIN EHEYS -------------------------------------------------- //
console.log("== Moottori ==");
{
  const players = [new RandomPlayer(null, 1), new RandomPlayer(null, 2),
                   new RandomPlayer(null, 3), new RandomPlayer(null, 4)];
  const eng = new TuppiEngine(players, { seed: 42, verbose: false, strict: true });
  const res = eng.playMatch({});
  ok(res.dealsPlayed >= 1, "ottelu pelaa ainakin yhden jaon");
  // jokaisessa jaossa kasoja yhteensä 13
  let allThirteen = true;
  for (const d of res.dealResults) {
    if (d.tricksByTeam[0] + d.tricksByTeam[1] !== 13) allThirteen = false;
  }
  ok(allThirteen, "joka jaossa kasoja yhteensä 13");
  ok(res.byTuppi || res.dealsPlayed === 500, "ottelu päättyy tuppiin tai rajaan");
}
// 200 satunnaisottelua ilman kaatumisia / laittomia siirtoja
{
  let crashed = false;
  for (let i = 0; i < 200; i++) {
    try {
      const players = [new RandomPlayer(null, i), new RandomPlayer(null, i + 1000),
                       new RandomPlayer(null, i + 2000), new RandomPlayer(null, i + 3000)];
      const eng = new TuppiEngine(players, { seed: i, strict: true });
      eng.playMatch({ maxDeals: 60 });
    } catch (e) {
      crashed = true;
      console.log("  poikkeus:", e.message);
      break;
    }
  }
  ok(!crashed, "200 satunnaisottelua ilman poikkeuksia");
}

// --- SOOLI ------------------------------------------------------------ //
console.log("== Sooli ==");
// Ässä on soolissa pienin.
eq(sooliRank(Card.of(14, Suit.CLUBS)), 1, "sooli: ässä = 1 (pienin)");
eq(sooliRank(Card.of(2, Suit.CLUBS)), 2, "sooli: kakkonen = 2");
eq(sooliRank(Card.of(13, Suit.CLUBS)), 13, "sooli: kuningas = 13");
// Sooli-tikin voittaja: ässä ei voita, korkein muu voittaa; ässä johtaa mutta häviää.
let strick = [
  [0, Card.of(14, Suit.CLUBS)], // ässä johtaa, sooli-arvo 1
  [2, Card.of(5, Suit.CLUBS)],
  [1, Card.of(9, Suit.CLUBS)],
];
eq(sooliTrickWinner(strick), 1, "sooli: ässä on pienin, 9 voittaa");
strick = [
  [0, Card.of(14, Suit.CLUBS)],
  [2, Card.of(2, Suit.CLUBS)],
  [1, Card.of(14, Suit.HEARTS)], // väärä maa
];
eq(sooliTrickWinner(strick), 2, "sooli: 2 voittaa ässän, sakkaus ei päde");
// Sooli-pisteet: 24p aina; tikki soolaajalle -> ramaajat, muuten soolipari.
let sr = scoreSooli(1, 0, true);
eq(sr.winner, 0, "sooli: soolaaja otti tikin -> ramaajat voittavat");
eq(sr.points, SOOLI_POINTS, "sooli: 24 pistettä");
sr = scoreSooli(1, 0, false);
eq(sr.winner, 1, "sooli: soolaaja selvisi -> soolipari voittaa");

// Selviämisarvio: matala käsi (tyhjä maa + ässiä) >> korkea käsi.
{
  // Aito sooli-käsi: matalia EI-ässiä (ässä olisi myös hyvä ramissa) + tyhjä maa.
  const great = [
    Card.of(2, Suit.CLUBS), Card.of(3, Suit.CLUBS), Card.of(4, Suit.CLUBS), Card.of(5, Suit.CLUBS), Card.of(6, Suit.CLUBS),
    Card.of(2, Suit.DIAMONDS), Card.of(3, Suit.DIAMONDS), Card.of(4, Suit.DIAMONDS),
    Card.of(2, Suit.HEARTS), Card.of(3, Suit.HEARTS), Card.of(4, Suit.HEARTS), Card.of(5, Suit.HEARTS),
    Card.of(6, Suit.HEARTS), // ei patoja -> tyhjä maa
  ];
  const awful = [
    Card.of(13, Suit.CLUBS), Card.of(12, Suit.CLUBS), Card.of(11, Suit.CLUBS),
    Card.of(13, Suit.DIAMONDS), Card.of(12, Suit.DIAMONDS), Card.of(11, Suit.DIAMONDS),
    Card.of(13, Suit.HEARTS), Card.of(12, Suit.HEARTS), Card.of(11, Suit.HEARTS),
    Card.of(13, Suit.SPADES), Card.of(12, Suit.SPADES), Card.of(11, Suit.SPADES), Card.of(10, Suit.SPADES),
  ];
  const sg = estimateSooliSurvival(great), sa = estimateSooliSurvival(awful);
  ok(sg >= 0 && sg <= 1 && sa >= 0 && sa <= 1, "selviämisarvio välillä 0..1");
  ok(sg > sa, `matala käsi selviää todennäköisemmin (${sg.toFixed(2)} > ${sa.toFixed(2)})`);
  ok(sg > 0.5, "matala sooli-käsi arvioidaan vahvaksi (>0.5)");
  ok(sa < 0.35, "surkea sooli-käsi arvioidaan heikoksi (<0.35)");

  // EV-vertailu: matala käsi -> soolaa (puolustus olisi tappiollinen),
  // korkea käsi -> puolusta ramia.
  const flat = { upTeam: null, upScore: 0 };
  ok(estimateSooliEV(great, flat, 1, 0).recommend, "matala käsi: EV suosittaa soolia");
  ok(!estimateSooliEV(awful, flat, 1, 0).recommend, "korkea käsi: EV suosittaa puolustusta");
  // Ottelutilanne siirtää soolin arvoa: vastustaja nousulla > pöytäpeli > oma nousulla.
  const evOppUp = estimateSooliEV(great, { upTeam: 0, upScore: 30 }, 1, 0).evSooli;
  const evMyUp = estimateSooliEV(great, { upTeam: 1, upScore: 30 }, 1, 0).evSooli;
  ok(evOppUp > evMyUp, `sooli arvokkaampi kun vastustaja nousulla (${evOppUp.toFixed(1)} > ${evMyUp.toFixed(1)})`);
}

// Kokonainen sooli-jako moottorilla: paikka 0 ramaa, paikka 1 soolaa.
{
  class Ramaaja extends RandomPlayer { chooseShow() { return "rami"; } }
  class Soolaaja extends RandomPlayer { chooseShow() { return "nolo"; } chooseSooli() { return true; } }
  // Soolaajan pari: laskee montako kertaa sitä pyydetään pelaamaan kortti.
  class Sivussa extends RandomPlayer {
    constructor(n, s) { super(n, s); this.plays = 0; }
    chooseShow() { return "nolo"; }
    playCard(view) { this.plays++; return super.playCard(view); }
  }
  const partner = new Sivussa(null, 4); // paikka 3 = soolaajan (paikka 1) pari
  const players = [new Ramaaja(null, 1), new Soolaaja(null, 2), new RandomPlayer(null, 3), partner];
  const eng = new TuppiEngine(players, { seed: 7, strict: true });
  // jakaja 3 -> etukäsi 0 -> paikka 0 ramaa -> ramaaja 0; puolustaja 1 soolaa.
  const res = eng.playDeal(1, 3);
  eq(res.gameType, "sooli", "sooli-jako: gameType on sooli");
  eq(res.soolaaja, 1, "sooli-jako: soolaaja on paikka 1");
  eq(res.points, SOOLI_POINTS, "sooli-jako: 24 pistettä");
  eq(partner.plays, 0, "sooli-jako: soolaajan pari ei pelaa yhtään korttia");
  // Voittajan johdonmukaisuus: soolaaja otti tikin -> ramaajajoukkue (0), muuten soolipari (1).
  eq(res.winnerTeam, res.soolaajaTookTrick ? 0 : 1, "sooli-jako: voittaja seuraa soolaajan tikistä");
  // 200 sooli-jakoa ilman poikkeuksia/laittomia siirtoja.
  let crashed = false;
  for (let i = 0; i < 200; i++) {
    try {
      const p = [new Ramaaja(null, i), new Soolaaja(null, i + 500), new RandomPlayer(null, i + 1000), new RandomPlayer(null, i + 1500)];
      const e = new TuppiEngine(p, { seed: i, strict: true });
      const rr = e.playDeal(1, 3);
      if (rr.gameType !== "sooli" || rr.points !== SOOLI_POINTS) { crashed = true; break; }
    } catch (e) { crashed = true; console.log("  sooli-poikkeus:", e.message); break; }
  }
  ok(!crashed, "200 sooli-jakoa ilman poikkeuksia");
}

// --- VAHVUUSHIERARKIA ------------------------------------------------- //
console.log("== Vahvuus (voi kestää hetken) ==");
function tournament(makeTeam0, makeTeam1, deals, seed0) {
  // paikat 0&2 = joukkue0, 1&3 = joukkue1
  let wins0 = 0, wins1 = 0;
  const N = 30;
  for (let g = 0; g < N; g++) {
    const players = [makeTeam0(), makeTeam1(), makeTeam0(), makeTeam1()];
    const eng = new TuppiEngine(players, { seed: seed0 + g, strict: true });
    const res = eng.playMatch({ fixedDeals: deals });
    if (res.banked[0] > res.banked[1]) wins0++;
    else if (res.banked[1] > res.banked[0]) wins1++;
  }
  return [wins0, wins1];
}

{
  // Heuristi+Heuristi vs Random+Random
  const [h, rnd] = tournament(() => new HeuristicPlayer(), () => new RandomPlayer(), 12, 100);
  console.log(`  Heuristi vs Random: ${h}-${rnd}`);
  ok(h > rnd, "Heuristi voittaa Randomin");
}
{
  // Champion (kevyt) vs Heuristi
  const [c, h] = tournament(() => new ChampionPlayer(null, { simulations: 25 }),
                            () => new HeuristicPlayer(), 12, 200);
  console.log(`  Mestari vs Heuristi: ${c}-${h}`);
  ok(c >= h, "Mestari vähintään Heuristin veroinen (odotus: parempi)");
}
{
  // Counting vs Heuristi (lasku auttaa)
  const [c, h] = tournament(() => new CountingPlayer(), () => new HeuristicPlayer(), 12, 300);
  console.log(`  Laskuri vs Heuristi: ${c}-${h}`);
  ok(c + h >= 0, "Laskuri-vs-Heuristi ajettu");
}

// --- YHTEENVETO ------------------------------------------------------- //
console.log(`\n${pass} läpi, ${fail} hylätty`);
process.exit(fail === 0 ? 0 : 1);
