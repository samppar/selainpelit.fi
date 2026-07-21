// Analyytikko ALKUPERÄINEN — molemmat myöhemmät parannukset pois:
//   track=false        → ei pelattujen korttien laskentaa (ei boss-kotiutusta)
//   aggressiveUp=false → varovainen tarjous myös nousulla
// Käytetään A/B-vertailuun nykyistä täyttä Analyytikkoa vastaan.

import { ProbabilityPlayer } from "./probabilityPlayer.js";

export class ProbabilityPlayerOld extends ProbabilityPlayer {
  static defaultName = "Analyytikko(vanha)";
  track = false;
  aggressiveUp = false;
}

export default function createPlayer() {
  return new ProbabilityPlayerOld();
}
