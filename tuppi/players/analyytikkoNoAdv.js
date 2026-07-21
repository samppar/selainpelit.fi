// Analyytikko ILMAN vastustajaluentaa (advanced=false): boss-kotiutus ja
// tarjous ennallaan, mutta ei "molemmat vastustajat tyhjä"-ilmaistikkejä,
// ei leikkaus-tietoisuutta eikä kaverin signaalin tukea. A/B-vertailuun.
import { ProbabilityPlayer } from "./probabilityPlayer.js";
export class X extends ProbabilityPlayer { static defaultName="Analyytikko(ei vast.luentaa)"; advanced=false; }
export default function createPlayer(){ return new X(); }
