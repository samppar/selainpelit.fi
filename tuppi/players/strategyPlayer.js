// Seniori — sääntöpohjainen tekoäly, joka noudattaa Oulun Seniorit
// Tuppikerhon strategiaohjetta (Antti Auer, 19.2.2026).
//
// Ydinkäsitteet ohjeesta:
//  • Kuvakortti = A(14) K(13) Q(12) Kn(11).  E = ei-kuvakortti 2..10.
//    Ep = pieni E (2..5), Es = suuri E (6..10).
//  • KIINNIOTTO (Rami, pelikontrolli): A, K+1J, Q+2J, Kn+3J samasta maasta.
//    Jalka (J) = saman maan suojakortti. Jalat voivat itsekin olla kiinniottoja.
//  • ULOSANTI (Nolo, kontrollin luovutus): E2, E3+1J, E4+2J ja puuttuva maa.
//  • Tarjous: Ramiin tarvitaan pöytäpelissä/ylhäällä 3-4 ja alhaalla 4-5
//    kiinniottoa, ja jokaisesta maasta vähintään yksi — muuten Nolo.
//  • Peli: älä koskaan lyö vain suurinta (Rami) / pienintä (Nolo). Ota
//    kiinni ja aja Es:llä vastustajien kortteja alas, kotiuta ketjut,
//    säästä kun pari johtaa, ja Nolossa duckaa alle ja tyhjennä lyhyt maa.

import { TuppiPlayer } from "../src/index.js";
import { isBoss, unseenInSuit, voidsFromHistory } from "../src/analysis.js";

// Maat, joista MOLEMMAT vastustajat ovat tyhjiä (sakanneet). Tupessa ei ole
// valttia, joten tällaisen maan johtaminen voittaa tikin varmasti omalle
// joukkueelle — vastustajat eivät voi tunnustaa eivätkä siis ohittaa.
export function bothOppVoidSuits(view) {
  const voids = voidsFromHistory(view);
  const opp = [(view.seat + 1) % 4, (view.seat + 3) % 4];
  const out = new Set();
  for (const s of [0, 1, 2, 3]) {
    if (opp.every((o) => voids[o].has(s))) out.add(s);
  }
  return out;
}

// Voiko vastustaja vielä 'leikata' (ohittaa) kortin, jos johdan sillä? Kyllä,
// jos maassa on korkeampi näkymätön kortti JA ainakin toinen vastustaja ei ole
// tyhjä siitä maasta (voisi siis pitää korkeampaa kädessään).
export function oppCanOvertake(view, card) {
  if (!unseenInSuit(view, card.suit).some((c) => c.rank > card.rank)) return false;
  const voids = voidsFromHistory(view);
  const opp = [(view.seat + 1) % 4, (view.seat + 3) % 4];
  return opp.some((o) => !voids[o].has(card.suit));
}

// Pelikaverin signaloimat maat: maat joita hän on ITSE aloittanut (tikin
// ensimmäinen kortti = johtaja) — hänen toivemaansa. Uusin ensin.
export function partnerSignalSuits(view) {
  const partner = (view.seat + 2) % 4;
  const out = [];
  for (const trick of view.history) {
    if (trick.length && trick[0][0] === partner) out.unshift(trick[0][1].suit);
  }
  return out;
}

const isFace = (r) => r >= 11;
const isEs = (r) => r >= 6 && r <= 10;

const byRankAsc = (a, b) => a.rank - b.rank;
const minCard = (cs) => cs.reduce((m, c) => (c.rank < m.rank ? c : m), cs[0]);
const maxCard = (cs) => cs.reduce((m, c) => (c.rank > m.rank ? c : m), cs[0]);

function bySuit(cards) {
  const m = { 0: [], 1: [], 2: [], 3: [] };
  for (const c of cards) m[c.suit].push(c);
  for (const s of [0, 1, 2, 3]) m[s].sort(byRankAsc);
  return m;
}

// Kiinniottojen määrä maassa: A, K+1J, Q+2J, Kn+3J (jalat = saman maan kortit).
function kiinniottos(cs) {
  const n = cs.length;
  const has = (r) => cs.some((c) => c.rank === r);
  let k = 0;
  if (has(14)) k++;
  if (has(13) && n >= 2) k++;
  if (has(12) && n >= 3) k++;
  if (has(11) && n >= 4) k++;
  return k;
}

// Ulosantien määrä maassa: E2, E3+1J, E4+2J (+puuttuva maa erikseen).
function ulosannit(cs) {
  const n = cs.length;
  const has = (r) => cs.some((c) => c.rank === r);
  let u = 0;
  if (has(2)) u++;
  if (has(3) && n >= 2) u++;
  if (has(4) && n >= 3) u++;
  if (has(5) && n >= 4) u++;
  return u;
}

// Korkein maan kortti nykyisessä tikissä (aloitusmaa).
function ledHigh(trick, led) {
  let hi = -1;
  for (const [, c] of trick) if (c.suit === led && c.rank > hi) hi = c.rank;
  return hi;
}

export class StrategyPlayer extends TuppiPlayer {
  static defaultName = "Seniori";

  // ------------------------------------------------------------------ //
  //  TARJOUS: laske kiinniotot ohjeen mukaan                            //
  // ------------------------------------------------------------------ //
  chooseShow(view) {
    const suits = bySuit(view.hand);
    let total = 0;
    let withControl = 0;
    for (const s of [0, 1, 2, 3]) {
      const k = kiinniottos(suits[s]);
      total += k;
      if (k > 0) withControl++;
    }
    const missing = 4 - withControl; // maat ilman kiinniottoa (−1 tikki / maa)
    const eff = total - missing;

    const up = view.match.upTeam === view.team;
    const table = view.match.upTeam === null;

    // YLHÄÄLLÄ: epäonnistuneen/ryöstetyn ramin kustannus on vain nousun
    // romahdus (vastustaja ei hyödy tuplauksesta). Siksi ei ramivarovaisuutta
    // — valitse vain se muoto, jonka tn. voittaa JAKO on suurempi: vertaa
    // rami-kontrollia (kiinniotot) nolo-kontrolliin (ulosannit + tyhjät maat).
    if (up && this.aggressiveUp !== false) {
      let kii = 0;
      let ulo = 0;
      for (const s of [0, 1, 2, 3]) {
        kii += kiinniottos(suits[s]);
        ulo += ulosannit(suits[s]);
        if (suits[s].length === 0) ulo++; // puuttuva maa = ulosanti
      }
      return kii >= ulo ? "rami" : "nolo";
    }

    // Pöytä / kuoppa: ryöstöriski on oikea → Nolo turvallisempi.
    // Pöytäpelissä 3-4 kiinniottoa riittää, alhaalla vaadi 4-5.
    const need = table ? 3.5 : 4.5;

    // Kahdesta maasta puuttuva kiinniotto → mieluummin Nolo (ohje).
    if (missing >= 2 && eff < need + 1) return "nolo";
    return eff >= need ? "rami" : "nolo";
  }

  // ------------------------------------------------------------------ //
  //  LYÖNTI                                                             //
  // ------------------------------------------------------------------ //
  playCard(view) {
    const legal = [...view.legalMoves];
    if (legal.length === 1) return legal[0];
    return view.wantToWinTricks
      ? this._playRami(view, legal)
      : this._playNolo(view, legal);
  }

  // ----------------------------- RAMI -------------------------------- //
  _playRami(view, legal) {
    if (view.currentTrick.length === 0) return this._leadRami(view, legal);

    const led = view.ledSuit;
    const followers = legal.filter((c) => c.suit === led);
    const partnerWins = view.currentWinnerSeat() === view.partner;
    const high = ledHigh(view.currentTrick, led);
    const lastToPlay = view.currentTrick.length === 3;

    if (followers.length) {
      // Pari johtaa: säästä kovat, anna pienin. POIKKEUS: ramaajana kannattaa
      // joskus ottaa tikki kaverin YLI, jotta pääsee itse päättämään seuraavan
      // tikin maan — mutta vain jos on tuottava jatko (boss kotiutettavana tai
      // ilmaistikkimaa) eikä tikki ole viimeinen.
      if (partnerWins) {
        if (
          this.track !== false &&
          this.advanced !== false &&
          view.ramaaja === view.seat &&
          view.trickNumber < 12
        ) {
          // Ota johto vain HALVALLA: ohita kaveri ei-kuvakortilla (Ep/Es),
          // ettei hukkaa oikeaa voittajakorttia pelkän johdon vuoksi.
          const overtake = followers.filter((c) => c.rank > high && !isFace(c.rank));
          if (overtake.length && this._hasProductiveLead(view)) {
            return minCard(overtake); // ota johto itselle
          }
        }
        return minCard(followers);
      }

      const winners = followers.filter((c) => c.rank > high);
      if (winners.length) {
        // Voita halvimmalla riittävällä. Viimeisenä pelaajana riittää yksi
        // yli; muuten valitse halvin voittava.
        return minCard(winners);
      }
      // En voi voittaa → luovu pienimmällä (säilytä kiinniotot).
      return minCard(followers);
    }
    // Sakkaus Ramissa: säilytä kovat, pudota hyödyttömin pieni kortti.
    return this._discardRami(view, legal);
  }

  _leadRami(view, legal) {
    const suits = bySuit(view.hand);
    const track = this.track !== false; // korttilaskenta päällä oletuksena
    const adv = track && this.advanced !== false;

    // 0) ILMAINEN tikki: maa jossa molemmat vastustajat ovat tyhjiä — mikä
    //    tahansa korttini voittaa. Johda halvin ja säästä kovat.
    if (adv) {
      const free = bothOppVoidSuits(view);
      let pick = null;
      let len = -1;
      for (const s of free) {
        if (suits[s].length > len) {
          pick = minCard(suits[s]);
          len = suits[s].length;
        }
      }
      if (pick) return pick;
    }

    // 1) Kotiuta VARMAT tikit: pelaa boss-kortti (korkein jäljellä oleva ko.
    //    maassa) — se voittaa varmasti. Korttilaskenta (isBoss) tietää, kun
    //    A/K on jo mennyt ja oma Q/Kn on noussut suurimmaksi. Suosi pisintä
    //    maata (jää sinne enemmän jatkoa). Ilman laskentaa: kotiuta A+K-maat.
    if (track) {
      let bossBest = null;
      let bossLen = -1;
      for (const s of [0, 1, 2, 3]) {
        const cs = suits[s];
        if (!cs.length) continue;
        const top = maxCard(cs);
        if (isBoss(view, top) && cs.length > bossLen) {
          bossBest = top;
          bossLen = cs.length;
        }
      }
      if (bossBest) return bossBest;
    } else {
      let cashBest = null;
      for (const s of [0, 1, 2, 3]) {
        const cs = suits[s];
        if (cs.length < 2) continue;
        const has = (r) => cs.some((c) => c.rank === r);
        if (has(14) && has(13)) {
          const top = maxCard(cs);
          if (!cashBest || cs.length > suits[cashBest.suit].length) cashBest = top;
        }
      }
      if (cashBest) return cashBest;
    }

    // 2) Kasvata: aja Es alas maasta, jossa on kiinniotto mutta huippu ei
    //    vielä ole suurin. Säilytä huippu, aja MUIDEN vielä jäljellä olevat
    //    isot pois. Laskennan kanssa tarkistetaan, onko ylhäällä oikeasti
    //    vielä kortteja; ilman laskentaa oletetaan A suurimmaksi.
    let growCard = null;
    let growLen = 0;
    for (const s of [0, 1, 2, 3]) {
      const cs = suits[s];
      if (cs.length < 3 || kiinniottos(cs) === 0) continue;
      const top = maxCard(cs);
      if (track) {
        if (isBoss(view, top)) continue; // huippu jo suurin → kohta 1 hoiti
        if (!unseenInSuit(view, s).some((c) => c.rank > top.rank)) continue;
      } else if (top.rank === 14) {
        continue; // huippu A → ei tarvitse ajaa
      }
      const drivers = cs.filter((c) => isEs(c.rank) && c.rank < top.rank);
      if (drivers.length && cs.length > growLen) {
        growCard = maxCard(drivers); // suurin Es alle oman huipun
        growLen = cs.length;
      }
    }
    if (growCard) return growCard;

    // 3) Aja pienin Es mistä tahansa maasta, jossa on vielä kiinniotto-
    //    potentiaalia; muuten pienin ei-kuvakortti; muuten pienin.
    const esCards = legal.filter((c) => isEs(c.rank));
    if (esCards.length) return minCard(esCards);
    const lowE = legal.filter((c) => !isFace(c.rank));
    if (lowE.length) return minCard(lowE);
    return minCard(legal);
  }

  // Onko minulla tuottava jatko, jos otan johdon nyt? Boss-kortti (muusta
  // maasta) kotiutettavana tai maa jossa molemmat vastustajat tyhjiä.
  _hasProductiveLead(view) {
    if (bothOppVoidSuits(view).size) return true;
    const suits = bySuit(view.hand);
    for (const s of [0, 1, 2, 3]) {
      if (s === view.ledSuit) continue;
      const cs = suits[s];
      if (cs.length && isBoss(view, maxCard(cs))) return true;
    }
    return false;
  }

  _discardRami(view, legal) {
    // Pudota kortti maasta, jonka aion joka tapauksessa menettää: pienin
    // ei-kuvakortti; säilytä kaikki kiinniotot (kuvakortit + jalat).
    const nonFace = legal.filter((c) => !isFace(c.rank));
    if (nonFace.length) return minCard(nonFace);
    // vain kuvakortteja → luovu pienimmästä kuvakortista (Kn ennen A:ta)
    return minCard(legal);
  }

  // ----------------------------- NOLO -------------------------------- //
  _playNolo(view, legal) {
    if (view.currentTrick.length === 0) return this._leadNolo(view, legal);

    const led = view.ledSuit;
    const followers = legal.filter((c) => c.suit === led);
    const high = ledHigh(view.currentTrick, led);

    if (followers.length) {
      // Duckaa: pelaa suurin kortti joka jää nykyisen huipun alle (heitä
      // vaaralliset isot pois turvallisesti). Jos ei alle mahdu, pakko
      // ottaa — anna pienin, jotta perässä tulevat voivat vielä ohittaa.
      const under = followers.filter((c) => c.rank < high);
      if (under.length) return maxCard(under);
      return minCard(followers);
    }
    // Sakkaus Nolossa: pudota vaarallisin (suurin) kortti — mieluiten
    // pisimmästä maasta, jossa iso kortti muutenkin uhkaa voittaa tikin.
    return this._discardNolo(view, legal);
  }

  _leadNolo(view, legal) {
    const suits = bySuit(view.hand);
    // Aloita lyhimmästä maasta (pyri tyhjentämään se → pääset sakkaamaan),
    // mutta ÄLÄ aloita kortilla joka itse voittaa tikin (esim. yksinäinen A).
    // Suosi Es:iä (6-10): pari ottaa kiinni ja antaa takaisin. Valitse
    // maittain lyhin, jossa on ei-kuvakortti johdettavaksi.
    // Vastustajaluenta: vältä maata jossa MOLEMMAT vastustajat ovat tyhjiä —
    // silloin jäisit itse voittamaan tikin (Nolossa paha).
    const adv = this.track !== false && this.advanced !== false;
    const avoid = adv ? bothOppVoidSuits(view) : new Set();

    if (adv) {
      // AUTA KAVERIA SAKKAAMAAN: johda maata, josta pelikaveri on tyhjä
      // (sakannut). Hän pääsee pudottamaan vaarallisen kortin, vaikka tikki
      // menisi jollekin. Vältä maita, joissa molemmat vastustajat tyhjiä.
      const voids = voidsFromHistory(view);
      const partner = (view.seat + 2) % 4;
      let helpSuit = null;
      let helpLen = 99;
      for (const s of [0, 1, 2, 3]) {
        if (!suits[s].length || avoid.has(s)) continue;
        if (voids[partner].has(s) && suits[s].length < helpLen) {
          helpLen = suits[s].length;
          helpSuit = suits[s];
        }
      }
      if (helpSuit) return minCard(helpSuit); // pieni kortti, et itse voita

      // TYHJENNÄ YKSINÄINEN MAA (esim. orpo A) päästäksesi sakkaamaan sitä
      // maata myöhemmin — kannattaa jos muualla on monta vaarallista isoa.
      const highElsewhere = view.hand.filter((c) => isFace(c.rank)).length;
      if (highElsewhere >= 3) {
        for (const s of [0, 1, 2, 3]) {
          if (suits[s].length === 1 && !avoid.has(s)) return suits[s][0];
        }
      }
    }

    let best = null;
    let bestLen = 99;
    for (let pass = 0; pass < 2 && !best; pass++) {
      // 1. kierros: kunnioita avoid-joukkoa; 2. kierros: salli kaikki.
      for (const s of [0, 1, 2, 3]) {
        const cs = suits[s];
        if (!cs.length) continue;
        if (pass === 0 && avoid.has(s)) continue;
        const nonFace = cs.filter((c) => !isFace(c.rank));
        if (nonFace.length && cs.length < bestLen) {
          bestLen = cs.length;
          best = nonFace;
        }
      }
    }
    if (best) {
      // Vältä johtamasta boss-kortilla (voittaisi tikin — Nolossa paha).
      let pool = best;
      if (this.track !== false) {
        const safe = best.filter((c) => !isBoss(view, c));
        if (safe.length) pool = safe;
      }
      const es = pool.filter((c) => isEs(c.rank));
      return es.length ? maxCard(es) : maxCard(pool);
    }
    // Vain kuvakortteja kaikkialla → luovu pienimmästä (Kn ennen A:ta).
    return minCard(legal);
  }

  _discardNolo(view, legal) {
    // Pudota vaarallisin kortti: ensisijaisesti boss-kortti (voittaisi
    // varmasti myöhemmin), muuten korkein. Näin säilytät ulosannit (pienet).
    if (this.track !== false) {
      const bosses = legal.filter((c) => isBoss(view, c));
      if (bosses.length) return maxCard(bosses);
    }
    return maxCard(legal);
  }
}

export default function createPlayer() {
  return new StrategyPlayer();
}
