// botRegistry.js — kaikki käytettävissä olevat botit.
// LISÄÄ OMA BOTTISI: importoi se ja lisää listaan. Siinä kaikki.

import pro from "./bots/proBot.js";
import shooter from "./bots/shooterBot.js";
import codex from "./bots/codexBot.js";
import basic from "./bots/basicBot.js";
import random from "./bots/randomBot.js";
import template from "./bots/templateBot.js";
import antigravity from "./bots/antigravityBot.js";
import claude from "./bots/claudeBot.js";
import agymaster from "./bots/agyMasterBot.js";
import pimc from "./bots/pimcBot.js";
import mc from "./bots/mcBot.js";

export const BOTS = [
  { id: "mc", name: "MC (yhteisarvonta)", bot: mc },
  { id: "pimc", name: "PIMC (haku)", bot: pimc },
  { id: "agymaster", name: "AGY Master (huippu)", bot: agymaster },
  { id: "claude", name: "Claude (vahva)", bot: claude },
  { id: "codex", name: "Codex (vahva)", bot: codex },
  { id: "pro", name: "Pro (ammattilainen)", bot: pro },
  { id: "shooter", name: "Shooter (puhaltaja)", bot: shooter },
  { id: "basic", name: "Basic (perus)", bot: basic },
  { id: "random", name: "Random (satunnainen)", bot: random },
  { id: "template", name: "Template (pohja)", bot: template },
  { id: "antigravity", name: "Antigravity", bot: antigravity },
  // { id: "minun", name: "Minun bottini", bot: minun },
];

export const getBot = (id) => (BOTS.find((b) => b.id === id) || BOTS[0]).bot;
