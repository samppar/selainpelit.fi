// Kirjo — PIMC + Pluribus-henkinen jatkostrategioiden monimuotoisuus.
//
// TAUSTA (Pluribus, Brown & Sandholm, Science 2019). Pluribuksen reaaliaika-
// haun ydinidea EI ole "arvaa vastustajan kortit ja ratkaise täydellä
// informaatiolla" — vaan päinvastoin: haun LEHTISOLMUISSA vastustajien EI
// oleteta jatkavan yhdellä kiinteällä tavalla, vaan he saavat valita usean
// eri jatkostrategian väliltä. Näin haku ei ylisovita yhteen oletukseen siitä
// "miten muut pelaavat", ja tuloksena on robustimpi, vaikeammin ohitettava
// pelitapa.
//
// Mestari (PIMC) tekee juuri sen virheen jota Pluribus välttää: JOKA rolloutissa
// KAIKKI paikat pelaavat samaa kiinteää `_policyPlay`-heuristiikkaa. Haku siis
// olettaa vastustajien pelaavan täsmälleen kuin se itse — mikä on PIMC:n tunnettu
// "strategy fusion" / lokaalisuus-heikkous.
//
// KIRJO korjaa tätä halvasti: jokaisessa determinoinnissa jokaiselle
// vastustajapaikalle (ja parille) ARVOTAAN jatkotyyli pienestä joukosta
// {greedy, kova, kohinainen}. Lehtiarvo heijastaa siis JAKAUMAA järkeviä
// jatkoja, ei yhtä oletusta. Oma tuleva pelini pysyy kiinteänä (greedy) —
// haen omaa parasta vastausta tähän jakaumaan.
//
// Tämä on tarkoituksella kevyt koe: sama PIMC-runko, sama determinointi
// (perii show-ehdollistetun `_determinizeTilted`-metodin PIMC+:lta), vain
// rollout-politiikka monipuolistettu. Mitattavissa suoraan eval.js:llä.

import { PimcPlayer } from "./pimcPlayer.js";
import { removeCard, teamOf, trickWinner } from "../src/index.js";

const STYLES = ["greedy", "kova", "kohina"];

export class PluribusPlayer extends PimcPlayer {
  static defaultName = "Kirjo";

  // mix: kuinka vahvasti tyylit vaihtelevat. epsilon: kohina-tyylin
  // satunnaisuus. Oletukset valittu maltillisiksi; kalibroidaan mittaamalla.
  constructor(name = null, opts = {}) {
    const { epsilon = 0.15, ...rest } = opts;
    super(name, rest);
    this.epsilon = epsilon;
  }

  // Sama PIMC-silmukka kuin Mestarilla/PIMC+:lla, mutta rollout käyttää
  // per-paikka arvottuja jatkotyylejä. Kopioitu tänne, koska tyyli pitää
  // pujottaa simulointiin.
  _simulateFromHere(view, handsIn, card) {
    const hands = {};
    for (const s of Object.keys(handsIn)) hands[s] = [...handsIn[s]];
    const tricks = { ...view.tricksByTeam };
    let trick = view.currentTrick.map((p) => [p[0], p[1]]);
    let ledSuit = view.ledSuit;

    // Arvo jatkotyyli jokaiselle paikalle. OMA paikka pysyy greedynä
    // (haen omaa vastaustani); muut saavat monimuotoisen jatkon.
    const style = {};
    for (let s = 0; s < 4; s++) {
      style[s] = s === view.seat ? "greedy" : this.rng.choice(STYLES);
    }

    // MINÄ lyön valitun kortin
    removeCard(hands[view.seat], card);
    if (ledSuit === null) ledSuit = card.suit;
    trick.push([view.seat, card]);

    // loput saman kierroksen lyönnit
    let seat = view.seat;
    while (trick.length < 4) {
      seat = (seat + 1) % 4;
      const c = _stylePlay(hands[seat], ledSuit, trick, seat, view.gameType, this.rng, style[seat], this.epsilon);
      removeCard(hands[seat], c);
      trick.push([seat, c]);
    }

    let w = trickWinner(trick);
    tricks[teamOf(w)] += 1;
    let leader = w;

    const remaining = hands[view.seat].length;
    for (let r = 0; r < remaining; r++) {
      trick = [];
      ledSuit = null;
      for (let j = 0; j < 4; j++) {
        const s = (leader + j) % 4;
        const c = _stylePlay(hands[s], ledSuit, trick, s, view.gameType, this.rng, style[s], this.epsilon);
        removeCard(hands[s], c);
        if (ledSuit === null) ledSuit = c.suit;
        trick.push([s, c]);
      }
      w = trickWinner(trick);
      tricks[teamOf(w)] += 1;
      leader = w;
    }
    return tricks;
  }
}

// ---------------------------------------------------------------------- //
//  Politiikkojen kirjo — kolme järkevää mutta erilaista jatkotyyliä       //
// ---------------------------------------------------------------------- //
function _legal(hand, ledSuit) {
  if (ledSuit === null) return hand;
  const same = hand.filter((c) => c.suit === ledSuit);
  return same.length ? same : hand;
}
function _currentHigh(trick, ledSuit) {
  if (!trick.length || ledSuit === null) return -1;
  let best = -1;
  for (const [, c] of trick) if (c.suit === ledSuit && c.rank > best) best = c.rank;
  return best;
}
function _partialWinner(trick) {
  const led = trick[0][1].suit;
  let bs = trick[0][0];
  let br = trick[0][1].rank;
  for (let i = 1; i < trick.length; i++) {
    const [s, c] = trick[i];
    if (c.suit === led && c.rank > br) { bs = s; br = c.rank; }
  }
  return bs;
}
function _minBy(arr, key) {
  let best = arr[0], bk = key(best);
  for (let i = 1; i < arr.length; i++) { const k = key(arr[i]); if (k < bk) { best = arr[i]; bk = k; } }
  return best;
}
const _maxBy = (arr, key) => _minBy(arr, (x) => -key(x));

// Yksi paikka pelaa yhden kortin valitulla tyylillä.
//   greedy — Mestarin peruspolitiikka: voita halvalla, säästä kovat.
//   kova   — turvaa tikit korkeammalla: voittaessa ottaa VARMISTI (korkein
//            voittava), johtaa kovaa; mallintaa aggressiivista vastustajaa.
//   kohina — greedy, mutta epsilon-osuudella satunnainen laillinen siirto;
//            mallintaa epätäydellistä/ihmismäistä pelaajaa.
function _stylePlay(hand, ledSuit, trick, seat, gameType, rng, style, epsilon) {
  const moves = _legal(hand, ledSuit);
  if (moves.length === 1) return moves[0];

  if (style === "kohina" && rng.random() < epsilon) {
    return rng.choice(moves);
  }

  const wantWin = gameType === "rami";

  if (ledSuit === null || !trick.length) {
    // aloitus: kova johtaa korkeimman (painostaa), greedy samoin ramissa
    return wantWin ? _maxBy(moves, (c) => c.rank) : _minBy(moves, (c) => c.rank);
  }

  const cur = _currentHigh(trick, ledSuit);
  const winner = _partialWinner(trick);
  const partnerLeads = winner % 2 === seat % 2;
  const hasLed = moves.some((c) => c.suit === ledSuit);

  if (hasLed) {
    if (wantWin) {
      if (partnerLeads) {
        // kova: ohita joskus parikin napatakseen johdon (A3-idea);
        // greedy: säästä, anna parin viedä.
        if (style === "kova") {
          const wins = moves.filter((c) => c.suit === ledSuit && c.rank > cur);
          if (wins.length) return _minBy(wins, (c) => c.rank);
        }
        return _minBy(moves, (c) => c.rank);
      }
      const wins = moves.filter((c) => c.suit === ledSuit && c.rank > cur);
      if (wins.length) {
        // kova varmistaa korkeimmalla voittavalla, greedy voittaa halvimmalla
        return style === "kova" ? _maxBy(wins, (c) => c.rank) : _minBy(wins, (c) => c.rank);
      }
      return _minBy(moves, (c) => c.rank);
    }
    // nolo: alita mahdollisimman korkealla
    const under = moves.filter((c) => c.suit === ledSuit && c.rank < cur);
    if (under.length) return _maxBy(under, (c) => c.rank);
    return _minBy(moves.filter((c) => c.suit === ledSuit), (c) => c.rank);
  }
  // sakkaus
  if (wantWin) return _minBy(moves, (c) => c.rank); // säästä kovat
  return _maxBy(moves, (c) => c.rank); // nolo: pudota vaaralliset
}

export default function createPlayer() {
  return new PluribusPlayer();
}
