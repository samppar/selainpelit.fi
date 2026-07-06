// tournament.mjs — pelauta botteja toisiaan vastaan ilman käyttöliittymää.
// Aja: npm run tournament   (tai: node src/tournament.mjs)

import { playMatch } from "./match.js";
import { BOTS, getBot } from "./botRegistry.js";

const GAMES = 200;

// Kokoonpano: 4 paikkaa. Muuta vapaasti.
const lineup = ["agymaster", "pro", "claude", "codex"];
const bots = lineup.map((id) => getBot(id));

const wins = [0, 0, 0, 0];
const totalScore = [0, 0, 0, 0];

for (let g = 0; g < GAMES; g++) {
  const r = await playMatch(bots);
  wins[r.winner]++;
  r.scores.forEach((s, i) => (totalScore[i] += s));
}

console.log(`\nTurnaus: ${GAMES} peliä\n`);
console.log("Paikka  Botti                    Voitot   Ka. loppupisteet");
console.log("-".repeat(60));
lineup.forEach((id, i) => {
  const name = getBot(id).name.padEnd(24);
  const w = String(wins[i]).padStart(6);
  const avg = (totalScore[i] / GAMES).toFixed(1).padStart(10);
  console.log(`  ${i}    ${name}${w}   ${avg}`);
});
console.log("\n(Pienin keskiarvo = paras. Voitto = pienin pistemäärä pelissä.)\n");

// Vinkki: nopea pariottelu kahden botin välillä (2 vs 2):
// const bots = ["pro","random","pro","random"].map(getBot);
