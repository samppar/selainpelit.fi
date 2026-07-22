// Aavistus — PIMC+ + uskomusten päivitys kesken pelin (ei vain näytöstä).
//
// PIMC+ ehdollistaa determinoinnin aloitusnäyttöön (rami=isot, nolo=pienet).
// Tämä laajentaa uskomuspäivityksen KOKO peliin lisäämällä varmoja
// päätelmiä siitä, mitä kortteja paikka EI voi pitää — GIB:n "restricted
// choice" -tyylinen luenta. Näin arvonta on tarkempi kuin pelkillä voideilla.
//
// AIRTIGHT-PÄÄTELMÄ (vain viimeisenä pelaava = 4. paikka, jonka kortti
// ratkaisee tikin yksin — ei duckaus/säästö-epävarmuutta):
//   • RAMI: jos 4. paikka tunnusti maata muttei voittanut (jäi pöydän huipun
//     alle), hänellä EI ole yhtään korkeampaa korttia siinä maassa — muuten
//     hän olisi ottanut ilmaisen tikin. → nuo korkeat piilokortit eivät ole
//     hänellä.
//   • NOLO: jos 4. paikka JOUTUI voittamaan (kaikki tunnustukset yli huipun),
//     hänellä EI ole yhtään huippua matalampaa korttia siinä maassa — muuten
//     hän olisi duckannut alle. → matalat piilokortit eivät ole hänellä.
//
// Molemmat pätevät järkevälle pelaajalle riippumatta tasapelivalinnasta
// (selaimen vastustaja on juuri sellainen: Mestari-PIMC). Rajaus 4. paikkaan
// pitää päätelmän varmana; 2.–3. paikan luenta olisi epävarmaa (voi säästää
// tai duckata kaverille), joten se jätetään pois.

import { PimcPlayer } from "./pimcPlayer.js";
import { unseenCards } from "../src/analysis.js";

export class BeliefPlayer extends PimcPlayer {
  static defaultName = "Aavistus";

  playCard(view) {
    // Laske "ei voi pitää" -kortit ennen kuin determinointi ajetaan.
    this._cannot = inferCannotHave(view);
    return super.playCard(view);
  }

  _cannotFor(seat) {
    return (this._cannot && this._cannot[seat]) || EMPTY;
  }

  // Kuten PIMC+:n tilted-arvonta, mutta allowed() kunnioittaa myös
  // _cannot-rajoitteita (paikkakohtaiset kielletyt kortit).
  _determinizeTilted(view, unseen, need, voids, dir) {
    const active = Object.values(dir).some((d) => d !== 0);
    const cannot = this._cannot || EMPTY_MAP;
    const seats = Object.keys(need).map(Number);
    const ALPHA = 0.35;
    const allowed = (card, capacity) =>
      seats.filter(
        (s) => capacity[s] > 0 && !voids[s].has(card.suit) && !cannot[s].has(card),
      );
    for (let attempt = 0; attempt < 8; attempt++) {
      const pool = [...unseen];
      this.rng.shuffle(pool);
      const capacity = { ...need };
      const assign = {};
      for (const s of seats) assign[s] = [];
      pool.sort((a, b) => allowed(a, capacity).length - allowed(b, capacity).length);
      let ok = true;
      for (const card of pool) {
        const cand = allowed(card, capacity);
        if (cand.length === 0) { ok = false; break; }
        let s;
        if (cand.length === 1 || !active) {
          s = this.rng.choice(cand);
        } else {
          const hc = (card.rank - 10) / 4;
          let sum = 0;
          const w = cand.map((cs) => { const x = Math.exp(ALPHA * dir[cs] * hc); sum += x; return x; });
          let r = this.rng.random() * sum;
          s = cand[cand.length - 1];
          for (let i = 0; i < cand.length; i++) { r -= w[i]; if (r <= 0) { s = cand[i]; break; } }
        }
        assign[s].push(card);
        capacity[s] -= 1;
      }
      if (ok && seats.every((s) => capacity[s] === 0)) {
        assign[view.seat] = [...view.hand];
        return assign;
      }
    }
    // varajako: löysää _cannot pois (voidit säilyvät) ettei jää jumiin
    return this._determinize(view, unseen, need, voids);
  }
}

const EMPTY = new Set();
const EMPTY_MAP = { 0: EMPTY, 1: EMPTY, 2: EMPTY, 3: EMPTY };

// Paikkakohtaiset kortit joita paikka EI voi pitää (varmoja päätelmiä).
function inferCannotHave(view) {
  const cannot = { 0: new Set(), 1: new Set(), 2: new Set(), 3: new Set() };
  const rami = view.gameType === "rami";
  const unseen = [...unseenCards(view)];
  for (const trick of view.history) {
    if (trick.length < 4) continue; // vain täydet, ratkaistut tikit
    const led = trick[0][1].suit;
    let high3 = -1;
    let seatHigh = -1;
    for (let i = 0; i < 3; i++) {
      const [s, c] = trick[i];
      if (c.suit === led && c.rank > high3) { high3 = c.rank; seatHigh = s; }
    }
    const [seat4, card4] = trick[3];
    if (card4.suit !== led) continue; // sakkasi -> void hoidetaan muualla
    // Päätelmä pätee VAIN kun huippua pitää seat4:n VASTUSTAJA. Jos kaveri
    // (= tikin 2. pelaaja) johtaa, seat4 säästää tietoisesti korkean kortin
    // eikä "ei voittanut" kerro mitään hänen käsestään. Sama nolossa.
    if (seatHigh % 2 === seat4 % 2) continue;
    if (rami) {
      if (card4.rank < high3) {
        // ei voittanut vaikka oli viimeinen JA vastustaja johti -> ei
        // korkeampaa korttia ko. maassa (olisi ottanut ilmaisen tikin).
        for (const c of unseen) if (c.suit === led && c.rank > high3) cannot[seat4].add(c);
      }
    } else {
      if (card4.rank > high3) {
        // vastustaja johti (hyvä nolossa) mutta seat4 joutui silti voittamaan
        // -> ei huippua matalampaa duckauskorttia ko. maassa.
        for (const c of unseen) if (c.suit === led && c.rank < high3) cannot[seat4].add(c);
      }
    }
  }
  return cannot;
}

export default function createPlayer() {
  return new BeliefPlayer();
}
