// match.js — pelaa kokonaisen pelin ilman käyttöliittymää.
// Käytetään botti-vastaan-botti-testaukseen ja turnauksiin.

import {
  deal, trickWinner, trickPoints, PASS_DIRS, passTarget, scoreHand,
  buildPlayView, buildPassView, safePlay, safePass,
} from "./engine.js";
import { suitOf } from "./utils.js";

function makeState() {
  return {
    hands: deal(),
    scores: [0, 0, 0, 0],
    handPoints: [0, 0, 0, 0],
    playedCards: [],
    tricks: [],
    currentTrick: [],
    leader: 0,
    heartsBroken: false,
    trickNumber: 0,
  };
}

export async function playHand(state, bots, direction) {
  if (direction !== "hold") {
    const picks = await Promise.all(
      bots.map((b, i) => safePass(b, buildPassView(state, i, direction))));
    const remaining = state.hands.map((h, i) => h.filter((c) => !picks[i].includes(c)));
    for (let i = 0; i < 4; i++) {
      const tgt = passTarget(direction, i);
      remaining[tgt] = remaining[tgt].concat(picks[i]);
    }
    state.hands = remaining;
  }

  state.handPoints = [0, 0, 0, 0];
  state.playedCards = [];
  state.tricks = [];
  state.currentTrick = [];
  state.heartsBroken = false;
  state.trickNumber = 0;
  state.leader = state.hands.findIndex((h) => h.includes("C2"));

  for (let t = 0; t < 13; t++) {
    state.currentTrick = [];
    for (let k = 0; k < 4; k++) {
      const seat = (state.leader + k) % 4;
      const card = await safePlay(bots[seat], buildPlayView(state, seat));
      state.hands[seat] = state.hands[seat].filter((c) => c !== card);
      state.currentTrick.push({ seat, card });
      state.playedCards.push(card);
      if (suitOf(card) === "H" || card === "S12") state.heartsBroken = true;
    }
    const w = trickWinner(state.currentTrick);
    state.handPoints[w] += trickPoints(state.currentTrick);
    state.tricks.push({ plays: state.currentTrick });
    state.leader = w;
    state.trickNumber++;
  }

  const delta = scoreHand(state.handPoints);
  state.scores = state.scores.map((s, i) => s + delta[i]);
  return delta;
}

// bots: [bot0, bot1, bot2, bot3]. Pelataan kunnes joku ylittää targetin.
export async function playMatch(bots, { target = 100 } = {}) {
  const state = makeState();
  let hand = 0;
  while (Math.max(...state.scores) < target && hand < 300) {
    if (hand > 0) state.hands = deal();
    await playHand(state, bots, PASS_DIRS[hand % 4]);
    hand++;
  }
  const min = Math.min(...state.scores);
  return { scores: state.scores, winner: state.scores.indexOf(min), hands: hand };
}
