// Sooli-strategia: RANDOM — nollataso-vertailu. Satunnainen laillinen lyönti,
// satunnainen vaihto. Käytä mittatikkuna: hyvän strategian pitää voittaa tämä
// selvästi kummassakin roolissa.

import { RNG } from "../src/index.js";

export function createSooliStrategy(seed = null) {
  const rng = new RNG(seed);
  const pick = (arr) => arr[rng.int(arr.length)];
  return {
    name: "random",
    gift(view) { return pick(view.hand.slice()); },
    ret(view) { return pick(view.hand.slice()); },
    soolaajaPlay(view) { return pick(view.legalMoves.slice()); },
    ramaajaPlay(view) { return pick(view.legalMoves.slice()); },
  };
}

export default createSooliStrategy;
