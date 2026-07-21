import { StrategyPlayer } from "./strategyPlayer.js";
export class X extends StrategyPlayer { static defaultName="Seniori(varovainen-yl.)"; aggressiveUp=false; }
export default function createPlayer(){ return new X(); }
