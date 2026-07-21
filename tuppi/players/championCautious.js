// Mestari (varovainen) — sama PIMC-tekoäly kuin Mestari, mutta NÄYTTÖ on
// varovaisempi: ramauskynnystä on nostettu (ramBias), joten se valitsee noloa
// nykyistä useammin. Pelilyönnit ovat identtiset Mestarin kanssa.
//
// Tarkoitus: testata hypoteesia "tekoälyt ramaavat liikaa" — vertaa tätä
// perus-Mestariin (ks. compare-show.mjs).

import { ChampionPlayer } from "./championPlayer.js";

export class CautiousChampion extends ChampionPlayer {
  static defaultName = "Mestari (varovainen)";
  constructor(name = null, { simulations = 60, seed = null, ramBias = 0.7 } = {}) {
    super(name, { simulations, seed, ramBias });
  }
}

export default function createPlayer() {
  return new CautiousChampion();
}
