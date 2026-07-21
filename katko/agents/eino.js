// Eino — "Laskija". Laskee kortit ja pelaa vankkaa perusstrategiaa: haalii
// korkeat kortit, väistää alussa ja nappaa 4. tikin. Ei tavoittele
// kakkoslopetusta lainkaan — kakkonen on sille pelkkä matala kortti.
import { baseChoice, suitInfo } from "./base.js";

export const eino = {
  name: "Eino",
  style: "Laskija — laskee kortit, pelaa varman päälle, ei tavoittele kakkoslopetusta",
  chooseCard(view) {
    return baseChoice(view, suitInfo(view));
  }
};
