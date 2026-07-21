// Analyytikko VAROVAISELLA ylhäällä-tarjouksella — A/B-vertailua varten.
// aggressiveUp=false kytkee pois "ylhäällä ramita rohkeasti" -logiikan, jolloin
// tarjous menee todennäköisyyspaperin varovaisilla rajoilla myös nousulla.

import { ProbabilityPlayer } from "./probabilityPlayer.js";

export class ProbabilityPlayerConservUp extends ProbabilityPlayer {
  static defaultName = "Analyytikko(varovainen-yl.)";
  aggressiveUp = false;
}

export default function createPlayer() {
  return new ProbabilityPlayerConservUp();
}
