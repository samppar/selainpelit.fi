// PIMC+ — Mestari, mutta determinointi ehdollistettu näyttöön.
//
// Sama PIMC-haku kuin Mestarilla, yhdellä lisäyksellä: kun arvomme
// vastustajien (ja parin) tuntemattomat kädet, otamme huomioon mitä he
// näytöllä sanoivat. Kortit jaetaan jaossa tasaisesti, JA SITTEN pelaaja
// päättää käden perusteella ramin tai nolon. Julistus on siis signaali
// jo saadusta kädestä: ramin sanoneella on todennäköisesti isot kortit,
// nolon sanoneella heikommat. Emme muuta jakoa emmekä kurkista kortteihin
// — painotamme vain arvontaa havaitulla, julkisella päätöksellä (Bayes).

import { ChampionPlayer } from "./championPlayer.js";
import {
  cardsRemainingInHand,
  unseenCards,
  voidsFromHistory,
} from "../src/analysis.js";

export class PimcPlayer extends ChampionPlayer {
  static defaultName = "PIMC+";

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
    const dir = _showDirections(view, need); // +1 rami, -1 nolo, 0 tuntematon
    const maximize = view.wantToWinTricks;

    let bestCard = moves[0];
    let bestVal = null;
    for (const card of moves) {
      let total = 0;
      for (let i = 0; i < this.sims; i++) {
        const hands = this._determinizeTilted(view, unseen, need, voids, dir);
        if (hands === null) continue;
        const tricks = this._simulateFromHere(view, hands, card);
        total += tricks[myTeam];
      }
      if (bestVal === null || (maximize ? total > bestVal : total < bestVal)) {
        bestVal = total;
        bestCard = card;
      }
    }
    return bestCard;
  }

  // Kuten Mestarin _determinize, mutta kun kortti sijoitetaan istumaan,
  // sallittujen istumien kesken painotetaan valintaa näytön mukaan: korkeat
  // kortit kallistuvat ramin sanoneille, matalat nolon sanoneille. Yksi
  // lievästi vinoutettu, voidit huomioiva jako per arvonta — monimuotoisuus
  // säilyy 60 simuloinnin yli (ei best-of-k -äärivalintaa).
  _determinizeTilted(view, unseen, need, voids, dir) {
    const active = Object.values(dir).some((d) => d !== 0);
    if (!active) return this._determinize(view, unseen, need, voids);
    const seats = Object.keys(need).map(Number);
    const ALPHA = 0.35; // vinouman voimakkuus; 0 = tasainen (kuten Mestari)
    for (let attempt = 0; attempt < 8; attempt++) {
      const pool = [...unseen];
      this.rng.shuffle(pool);
      const capacity = { ...need };
      const assign = {};
      for (const s of seats) assign[s] = [];
      const allowed = (card) =>
        seats.filter((s) => capacity[s] > 0 && !voids[s].has(card.suit));
      pool.sort((a, b) => allowed(a).length - allowed(b).length);
      let ok = true;
      for (const card of pool) {
        const cand = allowed(card);
        if (cand.length === 0) {
          ok = false;
          break;
        }
        let s;
        if (cand.length === 1) {
          s = cand[0];
        } else {
          // korkeus hc: A=+1, K=+.75 … 10=0 … 2=-2  (skaalattu /4)
          const hc = (card.rank - 10) / 4;
          let sum = 0;
          const w = cand.map((cs) => {
            const x = Math.exp(ALPHA * dir[cs] * hc);
            sum += x;
            return x;
          });
          let r = this.rng.random() * sum;
          s = cand[cand.length - 1];
          for (let i = 0; i < cand.length; i++) {
            r -= w[i];
            if (r <= 0) {
              s = cand[i];
              break;
            }
          }
        }
        assign[s].push(card);
        capacity[s] -= 1;
      }
      if (ok && seats.every((s) => capacity[s] === 0)) {
        assign[view.seat] = [...view.hand];
        return assign;
      }
    }
    return this._determinize(view, unseen, need, voids); // varajako
  }
}

// Päättele kunkin istuman näyttö dealerista ja ramaajasta.
// Näyttöjärjestys: (dealer+1) myötäpäivään, pysähtyy ensimmäiseen ramiin.
// Ramaajaa ENNEN olleet sanoivat nolon; ramaajan JÄLKEISET eivät ehtineet
// (tuntematon). Nolopelissä kaikki sanoivat nolon.
function _showDirections(view, need) {
  const first = (view.match.dealer + 1) % 4;
  const label = {};
  if (view.ramaaja === null || view.gameType === "nolo") {
    for (let s = 0; s < 4; s++) label[s] = "nolo";
  } else {
    for (let i = 0; i < 4; i++) {
      const s = (first + i) % 4;
      if (s === view.ramaaja) {
        label[s] = "rami";
        break;
      }
      label[s] = "nolo";
    }
  }
  const dir = {};
  for (const s of Object.keys(need).map(Number)) {
    dir[s] = label[s] === "rami" ? 1 : label[s] === "nolo" ? -1 : 0;
  }
  return dir;
}

export default function createPlayer() {
  return new PimcPlayer();
}
