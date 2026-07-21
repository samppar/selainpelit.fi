// Tupen säännöt: joukkueet, maantunto, tikin voittaja ja pisteet.
//
// Neljän tuppi. Kaksi paria pelaa vastakkain, parit istuvat vastakkain.
// Paikat 0..3 myötäpäivään.  Joukkueet:
//     Joukkue 0 = paikat {0, 2}
//     Joukkue 1 = paikat {1, 3}

export const NUM_PLAYERS = 4;
export const CARDS_PER_HAND = 13;
export const TUPPI_TARGET = 52; // yhtäjaksoinen nousu >= 52 -> tuppi

/** Palauta paikan joukkue (0 tai 1). */
export function teamOf(seat) {
  return seat % 2;
}

/** Vastapäätä istuva parikaveri. */
export function partnerOf(seat) {
  return (seat + 2) % 4;
}

/** Vastustajien paikat. */
export function opponentsOf(seat) {
  return [(seat + 1) % 4, (seat + 3) % 4];
}

/**
 * Maantuntopakko: jos aloitusmaata on kädessä, on pelattava sitä.
 * Muuten saa lyödä minkä tahansa (sakata).
 */
export function legalMoves(hand, ledSuit) {
  if (ledSuit === null || ledSuit === undefined) return hand.slice();
  const same = hand.filter((c) => c.suit === ledSuit);
  return same.length ? same : hand.slice();
}

/**
 * trick = [[seat, card], ...] lyöntijärjestyksessä (4 korttia).
 * Voittaja = suurin aloitusmaan (ensimmäisen kortin maa) kortti.
 * Valttia ei ole.
 */
export function trickWinner(trick) {
  const ledSuit = trick[0][1].suit;
  let bestSeat = trick[0][0];
  let bestRank = trick[0][1].rank;
  for (let i = 1; i < trick.length; i++) {
    const [seat, card] = trick[i];
    if (card.suit === ledSuit && card.rank > bestRank) {
      bestSeat = seat;
      bestRank = card.rank;
    }
  }
  return bestSeat;
}

// ---------------------------------------------------------------------- //
//  SOOLI                                                                  //
// ---------------------------------------------------------------------- //
// Rami-näytön jälkeen puolustava pelaaja voi pelata YKSIN ramaajia vastaan.
// Soolissa ässä on PIENIN kortti, soolaaja pelaa aina viimeisenä eikä hänen
// parinsa pelaa lainkaan. Jos soolaaja ottaa yhdenkin tikin, ramaajat saavat
// SOOLI_POINTS pistettä; jos soolaaja selviää tikeittä, soolipari saa ne.

export const SOOLI_POINTS = 24;

/** Kortin arvo SOOLI-vertailuun: ässä (14) on pienin (1), muut ennallaan. */
export function sooliRank(card) {
  return card.rank === 14 ? 1 : card.rank;
}

/**
 * Tikin voittaja soolissa. Kuten trickWinner, mutta ässä on pienin.
 * trick = [[seat, card], ...] lyöntijärjestyksessä.
 */
export function sooliTrickWinner(trick) {
  const ledSuit = trick[0][1].suit;
  let bestSeat = trick[0][0];
  let bestRank = sooliRank(trick[0][1]);
  for (let i = 1; i < trick.length; i++) {
    const [seat, card] = trick[i];
    if (card.suit === ledSuit && sooliRank(card) > bestRank) {
      bestSeat = seat;
      bestRank = sooliRank(card);
    }
  }
  return bestSeat;
}

/**
 * Soolin tulos. soolaajaTookTrick = otiko soolaaja yhdenkin tikin.
 * Palauttaa { winner, points } (voittajajoukkue ja SOOLI_POINTS).
 */
export function scoreSooli(soolaajaTeam, ramaajaTeam, soolaajaTookTrick) {
  const winner = soolaajaTookTrick ? ramaajaTeam : soolaajaTeam;
  return { winner, points: SOOLI_POINTS };
}

/**
 * Arvioi todennäköisyys (0..1) SELVITÄ soolista tikeittä. Sooli on kuin nolo
 * yksin: otat tikin vain jos joudut tunnustamaan maassa korkeimman kortin
 * (pelaat viimeisenä, ässä on pienin -> matalat ovat duunikortteja). Huomioi
 * kortinvaihdon: pudota korkein, saat ässän lyhimpään maahan.
 *
 * Karkea heuristiikka, kalibroitu simulaatiota vasten: tyhjät maat (voi
 * sakata) ja matalat pohjakortit joka maassa nostavat selviämistä, korkeat
 * kortit ja korkea pohja laskevat sitä.
 */
export function estimateSooliSurvival(hand) {
  const cards = hand.slice().sort((a, b) => sooliRank(a) - sooliRank(b));
  cards.pop(); // vaihto: pois korkein sooli-kortti
  const bySuit = { 0: [], 1: [], 2: [], 3: [] };
  for (const c of cards) bySuit[c.suit].push(sooliRank(c));
  // vaihdossa saatu ässä lyhimpään ei-tyhjään maahan
  let shortest = 0, best = Infinity;
  for (const s of [0, 1, 2, 3]) { const n = bySuit[s].length; if (n > 0 && n < best) { best = n; shortest = s; } }
  bySuit[shortest].push(1);
  for (const s of [0, 1, 2, 3]) bySuit[s].sort((a, b) => a - b);

  let score = 2.0, highCards = 0;
  for (const s of [0, 1, 2, 3]) {
    const C = bySuit[s], len = C.length;
    if (len === 0) { score += 1.2; continue; } // tyhjä maa -> sakkaa vapaasti
    const low = C[0];
    if (low <= 2) score += 0.8;           // ässä/kakkonen pohjalla = turva
    else if (low <= 4) score += 0.2;
    else score -= (low - 4) * 0.35;       // korkea pohja = ansariski
    score += Math.min(C.filter((r) => r <= 5).length, 3) * 0.25; // matalat auttavat duckaamaan
    highCards += C.filter((r) => r >= 11).length;
  }
  score -= highCards * 0.7;
  // Logistinen sovitus (a,b) kalibroitu 40 000 sooli-jaon simulaatioon
  // baseline-puolustusta vastaan: ennustetut desiilit vastaavat todellista
  // selviämis-%:a. Huom: vahvaa puolustusta vastaan sooli on aito longshot —
  // suurin osa käsistä jää alle 10 %:n.
  return 1 / (1 + Math.exp(-(0.85 * score - 6.25)));
}

/**
 * Rami-PUOLUSTUKSEN vahvuus (ässä KORKEIN): ässät/kuninkaat + pitkät/tyhjät
 * maat. Käytetään arvioimaan paljonko luovutat/ryöstät normaalia ramia
 * puolustaessa. Huom: hyvä sooli-käsi (matala) on tässä heikko — juuri siksi
 * sooli kannattaa kun puolustus olisi tappiollinen.
 */
export function ramiDefenseStrength(hand) {
  let s = 0;
  const bySuit = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const c of hand) {
    bySuit[c.suit]++;
    s += c.rank >= 14 ? 2.2 : c.rank >= 13 ? 1.4 : c.rank >= 12 ? 0.7 : c.rank >= 11 ? 0.35 : 0;
  }
  for (const n of Object.values(bySuit)) { if (n >= 5) s += 1.0; else if (n >= 4) s += 0.4; if (n === 0) s += 0.3; }
  return s;
}

const _clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Kalibroitu 15 000 rami-jakoon (counting-botit): keskiluovutus ~9.4p,
// keskiryöstö ~17.6p, steal-% ~lineaarinen puolustusvahvuudessa.
const RAMI_CONCEDE_PTS = 9.4;
const RAMI_STEAL_PTS = 17.6;

/**
 * Kannattaako soolata vai puolustaa ramia normaalisti? Vertaa ODOTUSARVOJA
 * puolustajajoukkueen kannalta, huomioiden ottelutilanteen epälineaarisuus:
 * jos oma joukkue on nousulla, häviö pudottaa koko nousun (tippumisriski); jos
 * vastustaja on nousulla, voitto pudottaa heidät.
 *
 * @param {Card[]} hand
 * @param {{upTeam:number|null, upScore:number}} match
 * @param {number} myTeam   puolustajan (mahdollisen soolaajan) joukkue
 * @param {number} oppTeam  ramaajien joukkue
 * @returns {{pSurvive, evSooli, evDefense, recommend}}
 */
export function estimateSooliEV(hand, match, myTeam, oppTeam) {
  const upTeam = match ? match.upTeam : null;
  const upScore = match ? match.upScore : 0;
  // Jaon arvo omalle joukkueelle, kun voittaja saa myPts TAI oppPts (toinen 0).
  const dealVal = (myPts, oppPts) => {
    if (myPts > 0) return myPts + (upTeam === oppTeam ? upScore : 0); // pudotimme heidät
    return -oppPts - (upTeam === myTeam ? upScore : 0);              // putosimme itse
  };

  const P = estimateSooliSurvival(hand);
  const evSooli = P * dealVal(SOOLI_POINTS, 0) + (1 - P) * dealVal(0, SOOLI_POINTS);

  const st = ramiDefenseStrength(hand);
  const pSteal = _clamp(0.08 * st + 0.02, 0.05, 0.92);
  const evDefense = pSteal * dealVal(RAMI_STEAL_PTS, 0) + (1 - pSteal) * dealVal(0, RAMI_CONCEDE_PTS);

  return { pSurvive: P, evSooli, evDefense, recommend: evSooli > evDefense };
}

const _bySooliLow = (a, b) => sooliRank(a) - sooliRank(b);

/** Pöydän korkein aloitusmaan sooli-arvo tähän mennessä (-1 jos tyhjä). */
function _tableMaxSooli(currentTrick, ledSuit) {
  let max = -1;
  for (const [, c] of currentTrick) {
    if (c.suit === ledSuit) max = Math.max(max, sooliRank(c));
  }
  return max;
}

/**
 * RAMAAJAN siirto soolia vastaan. Tavoite: pakottaa viimeisenä pelaava
 * soolaaja ottamaan tikki. Periaate: pidä pöytä MATALANA (johda ja seuraa
 * matalimmalla), niin soolaaja joutuu tunnustamaan korkealla; kun olet
 * tyhjä maasta, sakkaa korkein (pura vaaralliset, jotta voit johtaa matalalla).
 */
export function pickSooliRamaajaCard(view) {
  const legal = view.legalMoves.slice().sort(_bySooliLow);
  const led = view.ledSuit;
  if (led === null) return legal[0]; // johda matalin
  const following = legal.some((c) => c.suit === led);
  if (following) return legal.find((c) => c.suit === led); // matalin tunnustus
  return legal[legal.length - 1]; // tyhjä: sakkaa korkein
}

/**
 * SOOLAAJAN siirto. Soolaaja pelaa viimeisenä ja yrittää olla ottamatta
 * tikkiä: tunnusta maassa korkein kortti joka EI voita (pudota kalliit
 * turvassa); jos kaikki tunnustukset voittaisivat, on pakko ottaa -> pelaa
 * matalin. Tyhjänä maasta sakkaa korkein (pura vaaralliset).
 */
export function pickSooliSoolaajaCard(view) {
  const legal = view.legalMoves.slice().sort(_bySooliLow);
  const led = view.ledSuit;
  if (led === null) return legal[0]; // ei tapahdu normaalisti (soolaaja ei johda)
  const inSuit = legal.filter((c) => c.suit === led);
  if (inSuit.length) {
    const tableMax = _tableMaxSooli(view.currentTrick, led);
    const duckers = inSuit.filter((c) => sooliRank(c) < tableMax);
    if (duckers.length) return duckers[duckers.length - 1]; // korkein alle pöydän
    return inSuit[0]; // pakko voittaa -> matalin
  }
  return legal[legal.length - 1]; // sakkaa korkein
}

/**
 * Laske jaon tulos.
 *
 * tricksByTeam: {0: n0, 1: n1}, n0+n1 === 13
 * gameType: 'rami' tai 'nolo'
 * ramaajaTeam: ramin näyttäneen joukkue (vain ramissa), muuten null
 *
 * Palauttaa { winner, points, steal }.
 *
 * Pisteet lasketaan seitsemännestä kasasta: 4 pistettä / kasa yli kuuden.
 * 7. kasa = 4p, 8. = 8p, ... 13. = 28p.
 *
 * Rami: voittaa yli 6 kasaa kerännyt pari. Jos ramin ryöstää vastapari
 *       (tekee itse yli 6 kasaa), pisteet tuplaantuvat (ryöstörami).
 * Nolo: voittaa vähemmän kasoja kerännyt pari. Ei tuplausta.
 */
export function scoreDeal(tricksByTeam, gameType, ramaajaTeam) {
  const n0 = tricksByTeam[0];
  const n1 = tricksByTeam[1];
  if (n0 + n1 !== 13) throw new Error("kasoja pitää olla yhteensä 13");

  if (gameType === "rami") {
    const winner = n0 > n1 ? 0 : 1; // yli 6 kasaa
    const margin = tricksByTeam[winner] - 6; // 1..7
    let points = 4 * margin;
    const steal = winner !== ramaajaTeam;
    if (steal) points *= 2;
    return { winner, points, steal };
  }
  // nolo
  const winner = n0 < n1 ? 0 : 1; // vähemmän kasoja
  const loserCount = tricksByTeam[1 - winner];
  const points = 4 * (loserCount - 6); // loser >= 7
  return { winner, points, steal: false };
}
