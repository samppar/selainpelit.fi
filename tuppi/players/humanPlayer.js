// Ihmispelaaja — lukee siirrot komentoriviltä. Handy testaamiseen.
//
// Lukeminen tehdään synkronisesti (fs.readSync fd 0) jotta pelaajarajapinta
// pysyy synkronisena kuten muillakin pelaajilla.

import fs from "node:fs";
import { suitSymbol, TuppiPlayer, cardSortKey } from "../src/index.js";

// Lue yksi rivi stdinistä synkronisesti.
function promptLine(question) {
  process.stdout.write(question);
  const buf = Buffer.alloc(1);
  let line = "";
  while (true) {
    let n;
    try {
      n = fs.readSync(0, buf, 0, 1, null);
    } catch (e) {
      if (e.code === "EAGAIN") continue; // ei vielä dataa
      throw e;
    }
    if (n === 0) break; // EOF
    const ch = buf.toString("utf8", 0, 1);
    if (ch === "\n") break;
    if (ch !== "\r") line += ch;
  }
  return line;
}

export class HumanPlayer extends TuppiPlayer {
  static defaultName = "Sinä";

  chooseShow(view) {
    const hand = [...view.hand]
      .sort((a, b) => cardSortKey(a) - cardSortKey(b))
      .map((c) => c.toString())
      .join(" ");
    console.log(`\n[paikka ${view.seat}] Kätesi: ${hand}`);
    while (true) {
      const ans = promptLine("Näytä rami vai nolo? [r/n] ").trim().toLowerCase();
      if (ans === "r" || ans === "rami") return "rami";
      if (ans === "n" || ans === "nolo") return "nolo";
    }
  }

  chooseSooli(view) {
    const hand = [...view.hand]
      .sort((a, b) => cardSortKey(a) - cardSortKey(b))
      .map((c) => c.toString())
      .join(" ");
    console.log(`\n[paikka ${view.seat}] Vastustaja ramasi. Kätesi: ${hand}`);
    const ans = promptLine("Pelaatko soolon yksin heitä vastaan? [k/e] ").trim().toLowerCase();
    return ans === "k" || ans === "kyllä" || ans === "y";
  }

  playCard(view) {
    const moves = [...view.legalMoves];
    if (view.sooli) {
      console.log("\nSOOLI — ässä on pienin, ÄLÄ ota tikkiä.");
    }
    if (view.currentTrick.length) {
      const table = view.currentTrick.map(([s, c]) => `${s}:${c}`).join("  ");
      console.log(`\nPöydässä: ${table}   (aloitusmaa ${suitSymbol(view.ledSuit)})`);
    } else {
      console.log("\nAloitat kierroksen.");
    }
    console.log(moves.map((c, i) => `  [${i}] ${c}`).join(""));
    while (true) {
      const ans = promptLine(`Valitse kortti 0..${moves.length - 1}: `).trim();
      if (/^\d+$/.test(ans)) {
        const i = Number(ans);
        if (i >= 0 && i < moves.length) return moves[i];
      }
    }
  }
}

export default function createPlayer() {
  return new HumanPlayer();
}
