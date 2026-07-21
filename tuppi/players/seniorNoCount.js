// Seniori ILMAN korttilaskentaa — A/B-vertailua varten. Sama kuin
// strategyPlayer.js, mutta track=false kytkee pois boss-korttien seurannan.

import { StrategyPlayer } from "./strategyPlayer.js";

export class StrategyPlayerNoCount extends StrategyPlayer {
  static defaultName = "Seniori(ei laskentaa)";
  track = false;
}

export default function createPlayer() {
  return new StrategyPlayerNoCount();
}
