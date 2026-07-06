// utils.js — jaetut apufunktiot. Kortti = maakirjain + arvo, esim. "C2", "S12", "H14".
// Maat: C=risti, D=ruutu, S=pata, H=hertta. Arvot 2..14 (11=J,12=Q,13=K,14=A).

export const SUITS = ["C", "D", "S", "H"];
export const SUIT_SYMBOL = { C: "\u2663", D: "\u2666", S: "\u2660", H: "\u2665" };
export const SUIT_NAME = { C: "risti", D: "ruutu", S: "pata", H: "hertta" };
export const RANK_LABEL = { 11: "J", 12: "Q", 13: "K", 14: "A" };

export const suitOf = (c) => c[0];
export const rankOf = (c) => parseInt(c.slice(1), 10);
export const isRed = (c) => c[0] === "H" || c[0] === "D";
export const rankLabel = (r) => RANK_LABEL[r] || String(r);

// Pisteet: jokainen hertta 1, patarouva (S12) 13.
export const cardPoints = (c) => (suitOf(c) === "H" ? 1 : c === "S12" ? 13 : 0);

export function sortHand(hand) {
  const order = { C: 0, D: 1, S: 2, H: 3 };
  return [...hand].sort(
    (a, b) => order[suitOf(a)] - order[suitOf(b)] || rankOf(a) - rankOf(b)
  );
}
