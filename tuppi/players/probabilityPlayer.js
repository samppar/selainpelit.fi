// Analyytikko — todennäköisyyspohjainen tekoäly, joka noudattaa Atso
// Suopajärven erikoistyötä "Tupen todennäköisyysanalyysi" (Mat-2.108, 2007).
//
// Työn ydinanti on TARJOUSPÄÄTÖS: milloin ramata, milloin noloa. Simuloinnit
// antavat kolme mittaria etulyöntiasemalle (>50 % tn. että oma käsi on paras):
//   • Pisteet (A=4 K=3 Q=2 J=1, pakassa 40, ka. 10/käsi): 14 p → 70 % paras,
//     13 p ≈ 50 %.
//   • Kuvakortit (A,K,Q,J): 6 kuvaa → 86 % paras.
//   • Jalalliset kortit: 6 jalallista → 81 % paras. Kortti on "jalallinen",
//     kun sillä on samassa maassa vähintään (14 − arvo) pienempää korttia
//     (A tarvitsee 0, K 1, Q 2, Kn 3 jalkaa).
// Puuttuva maa on ramissa iso riski: 38,8 % tn. vastustajalla ≥6 ko. maata,
// jolloin hän leikkaa ja pahimmillaan ryöstää (tuplapisteet). Nolo on aina
// turvallisempi. Aloitus vahvasta pitkästä maasta, isot kortit sarjassa alas.
//
// Nolon pelaaminen (void-systeemi: tyhjennä lyhyt maa, osoita se kaverille)
// on käytännössä sama järkevä perusstrategia kuin Seniori-pelaajalla, joten
// se peritään; erottava, dokumentoitu osa on tarjous + ramin aloitus.

import { StrategyPlayer, bothOppVoidSuits, oppCanOvertake, partnerSignalSuits } from "./strategyPlayer.js";
import { isBoss } from "../src/analysis.js";

const isEs = (r) => r >= 6 && r <= 10;
const POINTS = { 14: 4, 13: 3, 12: 2, 11: 1 };

const minCard = (cs) => cs.reduce((m, c) => (c.rank < m.rank ? c : m), cs[0]);
const maxCard = (cs) => cs.reduce((m, c) => (c.rank > m.rank ? c : m), cs[0]);

function bySuit(cards) {
  const m = { 0: [], 1: [], 2: [], 3: [] };
  for (const c of cards) m[c.suit].push(c);
  for (const s of [0, 1, 2, 3]) m[s].sort((a, b) => a.rank - b.rank);
  return m;
}

// Jalallisten korttien määrä maassa (Suopajärven määritelmä): kortilla
// arvoltaan r on oltava vähintään (14 − r) pienempää samaa maata. cs nouseva.
function jalalliset(cs) {
  let count = 0;
  for (let i = 0; i < cs.length; i++) {
    const need = 14 - cs[i].rank; // A:0 K:1 Q:2 Kn:3 10:4 ...
    if (i >= need) count++; // i = kädessä olevat pienemmät samaa maata
  }
  return count;
}

export class ProbabilityPlayer extends StrategyPlayer {
  static defaultName = "Analyytikko";

  // ------------------------------------------------------------------ //
  //  TARJOUS: todennäköisyyspohjainen (>50 % etu ramille)               //
  // ------------------------------------------------------------------ //
  chooseShow(view) {
    const suits = bySuit(view.hand);
    let points = 0; // rami-pisteet A=4 K=3 Q=2 J=1
    let faces = 0;
    let jal = 0;
    let voids = 0;
    let noloPts = 0; // nolo-pisteet, peilikuva: 2=4 3=3 4=2 5=1
    let shortSuits = 0;
    for (const s of [0, 1, 2, 3]) {
      const cs = suits[s];
      if (cs.length === 0) voids++;
      if (cs.length === 1) shortSuits++;
      jal += jalalliset(cs);
      for (const c of cs) {
        points += POINTS[c.rank] || 0;
        if (c.rank >= 11) faces++;
        if (c.rank <= 5) noloPts += 6 - c.rank; // 2→4 … 5→1
      }
    }

    const up = view.match.upTeam === view.team;
    const down = view.match.upTeam !== null && view.match.upTeam !== view.team;

    // YLHÄÄLLÄ: ryöstön tuplaus ei satu (romahdat vain nollille, vastustaja ei
    // hyödy). Ei siis ramivarovaisuutta — valitse vain se muoto, jonka tn.
    // voittaa JAKO on suurempi: vertaa rami-sopivuutta (korkeat kortit +
    // jalalliset) nolo-sopivuuteen (matalat kortit + tyhjät/lyhyet maat).
    if (up && this.aggressiveUp !== false) {
      const ramiFit = points + 2 * jal;
      const noloFit = noloPts + 3 * voids + 2 * shortSuits;
      return ramiFit >= noloFit ? "rami" : "nolo";
    }

    // PÖYTÄ / KUOPPA: ryöstöriski on oikea → todennäköisyyspaperin varovainen
    // tarjous (>50 % etu ramille, Nolo turvallisempi).
    let ram = jal >= 6 || faces >= 6 || points >= 14;
    if (!ram && (points >= 13 || jal >= 5)) ram = true;
    if (voids >= 1) ram = jal >= 6 || points >= 15;
    if (voids >= 2) ram = false;
    if (down) ram = ram && (jal >= 6 || points >= 14) && voids === 0;

    return ram ? "rami" : "nolo";
  }

  // ------------------------------------------------------------------ //
  //  RAMIN ALOITUS: vahvasta pitkästä maasta, isot sarjassa alas        //
  // ------------------------------------------------------------------ //
  _leadRami(view, legal) {
    const suits = bySuit(view.hand);
    const track = this.track !== false;
    const adv = track && this.advanced !== false;

    // A) ILMAINEN tikki: maa jossa MOLEMMAT vastustajat tyhjiä → mikä tahansa
    //    korttini voittaa. Johda halvin, säästä kovat.
    if (adv) {
      const free = bothOppVoidSuits(view);
      let pick = null;
      let len = -1;
      for (const s of free) {
        if (suits[s].length > len) {
          pick = minCard(suits[s]);
          len = suits[s].length;
        }
      }
      if (pick) return pick;
    }

    // B) Kotiuta boss-kortti (korkein jäljellä oleva ko. maassa) pisimmästä
    //    maasta. Näin oma noussut Q/Kn tai A/K realisoituu tikiksi.
    if (track) {
      let bossBest = null;
      let bossLen = -1;
      for (const s of [0, 1, 2, 3]) {
        const cs = suits[s];
        if (!cs.length) continue;
        const top = maxCard(cs);
        if (isBoss(view, top) && cs.length > bossLen) {
          bossBest = top;
          bossLen = cs.length;
        }
      }
      if (bossBest) return bossBest;
    }

    // C) TUE PELIKAVERIA: jos kaveri on aloittanut jotain maata (signaali) ja
    //    minulla on siellä kortti, jota vastustaja ei voi enää leikata, johda
    //    se — varma tikki kaverin toivomaan maahan.
    if (adv) {
      for (const s of partnerSignalSuits(view)) {
        const cs = suits[s];
        if (!cs.length) continue;
        const top = maxCard(cs);
        if (!oppCanOvertake(view, top)) return top;
      }
    }

    // Valitse vahvin maa: eniten jalallisia, sitten pisin, sitten korkein.
    let best = null;
    let bestKey = -1;
    for (const s of [0, 1, 2, 3]) {
      const cs = suits[s];
      if (!cs.length) continue;
      const key = jalalliset(cs) * 100 + cs.length * 10 + maxCard(cs).rank;
      if (key > bestKey) {
        bestKey = key;
        best = cs;
      }
    }
    if (!best) return minCard(legal);

    const has = (r) => best.some((c) => c.rank === r);
    // Ei boss-korttia missään (isommat vielä pelissä). A → kotiuta A.
    // Muuten vedä Q/K esiin ajaaksesi vastustajan isot alas.
    if (has(14)) return best.find((c) => c.rank === 14);
    // Ei A:ta → aloita Q:lla vetääksesi vastustajan K alas (kaverin apu).
    if (has(12)) return best.find((c) => c.rank === 12);
    // Q ei ole, mutta K on → K vetää A:n esiin.
    if (has(13)) return best.find((c) => c.rank === 13);
    // Ei kuvakorttia → aja suurella Es:llä.
    const es = best.filter((c) => isEs(c.rank));
    return es.length ? maxCard(es) : maxCard(best);
  }
}

export default function createPlayer() {
  return new ProbabilityPlayer();
}
