// Analyytikko ILMAN korttilaskentaa — A/B-vertailua varten. Sama pelaaja
// kuin probabilityPlayer.js, mutta track=false kytkee pois boss-korttien
// kotiutuksen ja muun pelattujen korttien seurannan. Erottaa siis puhtaasti
// korttilaskennan vaikutuksen.

import { ProbabilityPlayer } from "./probabilityPlayer.js";

export class ProbabilityPlayerNoCount extends ProbabilityPlayer {
  static defaultName = "Analyytikko(ei laskentaa)";
  track = false;
}

export default function createPlayer() {
  return new ProbabilityPlayerNoCount();
}
