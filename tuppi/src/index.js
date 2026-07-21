// Tuppi-pelin ydin: kortit, säännöt, moottori ja pelaajarajapinta.
//
// Yksi tuontipiste kaikelle julkiselle rajapinnalle:
//   import { TuppiPlayer, Card, Suit, ... } from "../src/index.js";

export {
  Card,
  Suit,
  SUITS,
  fullDeck,
  removeCard,
  cardSortKey,
  suitIsRed,
  suitSymbol,
  RNG,
  deal,
} from "./cards.js";

export { TuppiPlayer } from "./player.js";
export { MatchState, PlayView, ShowView } from "./views.js";
export { TuppiEngine, IllegalMove } from "./engine.js";
export {
  NUM_PLAYERS,
  CARDS_PER_HAND,
  TUPPI_TARGET,
  teamOf,
  partnerOf,
  opponentsOf,
  legalMoves,
  trickWinner,
  scoreDeal,
  scoreSooli,
  sooliRank,
  sooliTrickWinner,
  SOOLI_POINTS,
  pickSooliRamaajaCard,
  pickSooliSoolaajaCard,
  estimateSooliSurvival,
  ramiDefenseStrength,
  estimateSooliEV,
} from "./rules.js";
