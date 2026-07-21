// Silta — PIMC-Mestari + bridge-tekoälyn paridefenssin signalointi.
//
// TAUSTA (bridge). Huippu-bridgebotit (GIB, Jack, Wbridge5) pelaavat kortit
// Monte-Carlo + double-dummy -haulla ja valitsevat siirron parhaalla
// keskiarvolla — eli TÄSMÄLLEEN kuten Mestari (PIMC). Se mitä poker-botit
// (Pluribus) EIVÄT tee mutta bridge-botit tekevät, on PARIDEFENSSIN
// SIGNALOINTI: puolustava pari koordinoi julkisilla korteilla. GIB:n
// vakiosignaalit: attitude (korkea = rohkaisen tätä maata, matala = lannistan)
// ja count (korkea-matala = parillinen määrä). Otanta rajataan signaaleihin
// yhteensopivaksi.
//
// Tuppi on paripeli ilman valttia, joten sama idea istuu: kun MOLEMMAT oman
// joukkueen botit jakavat konvention, ne kohdentavat aloituksensa yhdessä.
//
// Silta lisää Mestariin KEVYEN, HÄVIÄMÄTTÖMÄN signaalikerroksen (ramissa):
//   • LUE kaverin signaali: maa jonka kaveri on ITSE ALOITTANUT = rohkaistu
//     (halutaan jatkaa); maa jonka kaveri on SAKANNUT (heittänyt) = lannistettu.
//   • EMIT: kun sakkaan, heitän lannistetusta (heikosta) maasta → kaveri lukee.
//   • Signaali on vain PEHMEÄ tie-break PIMC:n kärkisiirtojen kesken: jos usea
//     aloitus on PIMC-arvoltaan lähes tasan, valitse signaalin mukainen. PIMC:n
//     kovat luennat (boss-kotiutus ym.) menevät aina edelle.
//
// Näin koordinaatio EI voi rikkoa PIMC:n oikeaa peliä — se vain ratkaisee
// tasapelit kaverin toiveen hyväksi. Mitattavissa `compare-players.mjs`:llä.

import { ChampionPlayer } from "./championPlayer.js";
import {
  cardsRemainingInHand,
  unseenCards,
  voidsFromHistory,
} from "../src/analysis.js";

export class BridgePlayer extends ChampionPlayer {
  static defaultName = "Silta";

  // signalBand: kuinka paljon PIMC-keskiarvoa (keskitikkeinä) siirto saa olla
  // parasta huonompi ja silti kelvata signaalin mukaan valittavaksi.
  constructor(name = null, opts = {}) {
    const { signalBand = 0.15, ...rest } = opts;
    super(name, rest);
    this.signalBand = signalBand;
  }

  playCard(view) {
    const moves = [...view.legalMoves];
    if (moves.length === 1) return moves[0];

    const myTeam = view.team;
    const unseen = [...unseenCards(view)];
    const need = {};
    for (const s of [0, 1, 2, 3]) {
      if (s !== view.seat) need[s] = cardsRemainingInHand(view, s);
    }
    const voids = voidsFromHistory(view);
    const maximize = view.wantToWinTricks;

    // 1) PIMC: laske jokaiselle sallitulle siirrolle keskiarvo (kuten Mestari),
    //    mutta SÄILYTÄ kaikki arvot tie-breakia varten.
    const totals = new Map();
    let best = null;
    for (const card of moves) {
      let total = 0;
      for (let i = 0; i < this.sims; i++) {
        const hands = this._determinize(view, unseen, need, voids);
        if (hands === null) continue;
        const tricks = this._simulateFromHere(view, hands, card);
        total += tricks[myTeam];
      }
      totals.set(card, total);
      if (best === null || (maximize ? total > best : total < best)) best = total;
    }

    // 2) Signaalikerros vain RAMI-ALOITUKSESSA (selkein koordinaatiohetki).
    //    Muuten Mestarin puhdas PIMC-valinta.
    const leading = view.currentTrick.length === 0;
    if (!leading || !maximize) return _pickBest(moves, totals, best, maximize);

    const band = this.signalBand * this.sims; // keskiarvoyksiköissä
    const near = moves.filter((c) =>
      maximize ? totals.get(c) >= best - band : totals.get(c) <= best + band,
    );
    if (near.length <= 1) return _pickBest(moves, totals, best, maximize);

    // Kaverin signaalit julkisesta historiasta.
    const enc = _partnerLedSuits(view); // rohkaistut (kaveri aloitti)
    const disc = _partnerDiscardSuits(view); // lannistetut (kaveri sakkasi)
    const score = (c) => (enc.has(c.suit) ? 2 : 0) - (disc.has(c.suit) ? 2 : 0);

    // Valitse near-joukosta suurin signaalipisteet; tasapelissä paras PIMC.
    let pick = near[0];
    let pickScore = score(pick);
    let pickPimc = totals.get(pick);
    for (const c of near) {
      const sc = score(c);
      const pv = totals.get(c);
      if (sc > pickScore || (sc === pickScore && (maximize ? pv > pickPimc : pv < pickPimc))) {
        pick = c;
        pickScore = sc;
        pickPimc = pv;
      }
    }
    return pick;
  }
}

function _pickBest(moves, totals, best, maximize) {
  for (const c of moves) if (totals.get(c) === best) return c;
  return moves[0];
}

// Maat jotka KAVERI on itse aloittanut (tikin johtaja) = rohkaistut.
function _partnerLedSuits(view) {
  const partner = view.partner;
  const out = new Set();
  for (const trick of view.history) {
    if (trick.length && trick[0][0] === partner) out.add(trick[0][1].suit);
  }
  if (view.currentTrick.length && view.currentTrick[0][0] === partner) {
    out.add(view.currentTrick[0][1].suit);
  }
  return out;
}

// Maat jotka KAVERI on sakannut (heittänyt pois, ei tunnustanut) = lannistetut.
function _partnerDiscardSuits(view) {
  const partner = view.partner;
  const out = new Set();
  const tricks = [...view.history];
  if (view.currentTrick.length) tricks.push(view.currentTrick);
  for (const trick of tricks) {
    if (!trick.length) continue;
    const led = trick[0][1].suit;
    for (const [seat, card] of trick) {
      if (seat === partner && card.suit !== led) out.add(card.suit);
    }
  }
  return out;
}

export default function createPlayer() {
  return new BridgePlayer();
}
