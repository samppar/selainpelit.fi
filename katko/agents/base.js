// ============================================================================
//  Katko — jaettu tekoälyperusta (Agent / Strategy -malli)
//  --------------------------------------------------------------------------
//  Jokainen tekoäly on "agentti", joka toteuttaa rajapinnan:
//
//      Agent = {
//        name:  string,
//        style: string,
//        chooseCard(view: PlayerView): Card
//      }
//
//  PlayerView on pelaajan HAVAINTO: vain se, minkä pelaaja saa nähdä.
//      {
//        me:          number,              // oma paikkanumero (0..3)
//        hand:        Card[],              // oma käsi (yksityinen)
//        trick:       {p, card}[],         // pöydällä olevat kortit tässä tikissä
//        ledSuit:     "H"|"D"|"C"|"S"|null,// avatun tikin maa
//        trickNumber: 1..5,
//        kakko:       boolean,             // onko kakkossääntö päällä
//        played:      Card[],              // JULKINEN historia: kaikki pelatut kortit
//        legal:       Card[]               // sallitut siirrot juuri nyt
//      }
//  Card = { suit:"H"|"D"|"C"|"S", v:2..14 }
//
//  Kaikki agentit LASKEVAT KORTTEJA: ne johtavat view.played:sta, montako
//  kunkin maan korttia on yhä muilla ja mikä on korkein näkymätön kortti.
// ============================================================================

export const SUITS = ["H", "D", "C", "S"];
export const loCard = cs => cs.reduce((a, b) => (b.v < a.v ? b : a));
export const hiCard = cs => cs.reduce((a, b) => (b.v > a.v ? b : a));

// Kortinlaskenta: mitä maista tiedetään havainnon perusteella.
// HUOM kalibrointi: Katkossa jaetaan vain 20/52 korttia, joten "13 − omat −
// pelatut" laskee mukaan myös jakamattoman pakan. Muilla pelaajilla voi olla
// maan kortteja korkeintaan yhteensä käsikorttiensa verran — katkaistaan
// outstanding siihen, ettei maa näytä "elävämmältä" kuin se voi olla.
export function suitInfo(view) {
  const info = {};
  const othersTotal = view.handCounts
    ? view.handCounts.reduce((a, b) => a + b, 0) - view.hand.length
    : 15;
  for (const s of SUITS) {
    const my = view.hand.filter(c => c.suit === s).map(c => c.v);
    const playedCount = view.played.filter(c => c.suit === s).length;
    const outstanding = Math.min(13 - my.length - playedCount, othersTotal); // maan kortteja yhä MUILLA (yläraja)
    const seen = new Set(view.played.filter(c => c.suit === s).map(c => c.v));
    for (const v of my) seen.add(v);
    let unseenMax = -1;                                   // korkein kortti jota en näe
    for (let v = 14; v >= 2; v--) { if (!seen.has(v)) { unseenMax = v; break; } }
    info[s] = { my, myCount: my.length, outstanding, unseenMax };
  }
  return info;
}

// "Pomo" = kortti, jota kukaan muu ei voi enää lyödä kyseisessä maassa.
export const isBoss = (info, card) => card.v > info[card.suit].unseenMax;

export function bestLed(view) {
  let b = -1;
  for (const t of view.trick) if (t.card.suit === view.ledSuit && t.card.v > b) b = t.card.v;
  return b;
}

// ----------------------------------------------------------------------------
//  Perusstrategia, jota KAIKKI agentit käyttävät pohjana ja johon ne palaavat.
//  Idea: haali korkeat kortit, päästä matalat menemään, ja nappaa 4. tikki niin
//  että pääset aloittamaan ratkaisevan viimeisen tikin. Laskennan avulla se ei
//  koskaan heitä hukkaan "pomokorttia", jota kukaan ei voi lyödä.
// ----------------------------------------------------------------------------
export function baseChoice(view, info = suitInfo(view)) {
  const h = view.hand;
  if (h.length === 1) return h[0];
  const tn = view.trickNumber;

  if (view.trick.length === 0) {                       // johdan tikkiä
    const nonBoss = h.filter(c => !isBoss(info, c));
    if (tn <= 3) return loCard(nonBoss.length ? nonBoss : h);   // heitä matala roska, säästä pomot
    // 4. tikki: voita halvimmalla varmalla pomolla -> johdat viimeistä tikkiä
    const bosses = h.filter(c => isBoss(info, c));
    if (bosses.length > 1) { const lo = loCard(bosses); return lo; } // pidä paras viimeiseksi
    if (bosses.length === 1) return bosses[0];
    return loCard(h);
  }

  const led = h.filter(c => c.suit === view.ledSuit);
  if (led.length) {                                    // tunnusta maata
    const best = bestLed(view);
    const w = led.filter(c => c.v > best), l = led.filter(c => c.v <= best);
    if (tn <= 3) return l.length ? loCard(l) : loCard(w);   // väistä jos voit, muuten voita halvimmalla
    return w.length ? loCard(w) : loCard(l);               // 4. tikki: voita jos voit
  }
  // ei maata: heitä matalin ei-pomo, säästä pomot ja korkeat
  const nonBoss = h.filter(c => !isBoss(info, c));
  return loCard(nonBoss.length ? nonBoss : h);
}

// ----------------------------------------------------------------------------
//  Kakkoslopetuksen tunnistus (jaettu apuri Ainolle ja Väinölle).
//  Kakkonen voittaa viimeisen tikin VAIN jos se lyödään avauksena ja kaikki
//  muut ovat loppu siitä maasta. Siksi suunnitelma on järkevä vain kun maa on
//  jo tyhjä (committed) tai kun hallitsen maan huippua ja kortteja on vähän
//  jäljellä (aspire). Kolme tasoa:
//     "sure" — vain varma lopetus (maa jo kuollut).
//     "seek" — lisäksi matemaattisesti perusteltu tavoittelu (harvinaista).
//     "hunt" — rohkea metsästys: lähtee ajoon jo kevyemmällä hallinnalla
//              (näkyy usein, mutta on hieman epäoptimaalista).
// ----------------------------------------------------------------------------
export function twoPlan(view, info, mode = "seek") {
  if (!view.kakko || mode === "none") return null;
  const twos = view.hand.filter(c => c.v === 2);
  if (!twos.length) return null;

  // Pistetilanne skaalaa riskinoton (ks. IDEAT.md): target − 1 pisteessä
  // tavallinenkin viimeinen tikki voittaa ottelun, joten kakkosta ei kannata
  // jahdata (vain ilmainen varma lopetus kelpaa). Target − 2 pisteessä
  // kakkoslopetus voittaa ottelun yhdellä tikillä — iso riski kannattaa.
  if (view.target != null && view.scores) {
    const need = view.target - view.scores[view.me];
    if (need <= 1) mode = "sure";
    else if (need === 2) mode = "hunt";
  }

  // Maa on todistetusti kuollut myös kun JOKAINEN muu kortillinen pelaaja on
  // näytetysti pihalla siitä (sakannut kun maata pyydettiin). Pelkkä
  // 13 kortin laskenta ei 20 kortin jaossa juuri koskaan täyty.
  const deadByVoids = (s) => {
    if (!view.voids || !view.handCounts) return false;
    for (let p = 0; p < 4; p++) {
      if (p === view.me) continue;
      if (view.handCounts[p] > 0 && !view.voids[p][s]) return false;
    }
    return true;
  };

  const leadsLeft = 6 - view.trickNumber;
  let best = null;
  for (const two of twos) {
    const s = two.suit, si = info[s], out = si.outstanding;
    const bossNonTwo = si.my.filter(v => v > 2 && v > si.unseenMax);
    let committed = false, aspire = false;
    if (out === 0 || deadByVoids(s)) {
      committed = true;                                   // maa kuollut -> kakkonen voittaa avattuna
    } else if (bossNonTwo.length >= 1) {
      if (mode === "seek" && out <= 3 * bossNonTwo.length && out <= 3 * leadsLeft) aspire = true;
      else if (mode === "hunt" && out <= 3 * leadsLeft + 1) aspire = true;
    }
    if (committed || aspire) {
      const score = (committed ? 100 : 0) - out + si.myCount;
      if (!best || score > best.score) best = { suit: s, committed, score };
    }
  }
  return best;
}

// Toimintapolitiikka kun kakkoslopetusta ajetaan; null => käytä baseChoicea.
export function planChoice(view, info, plan) {
  const h = view.hand, s = plan.suit;
  const two = h.find(c => c.suit === s && c.v === 2);
  const leadLowKeepTwo = () => { const p = h.filter(c => c !== two); return loCard(p.length ? p : h); };

  if (view.trick.length === 0) {                       // johdan
    if (view.trickNumber === 5 && plan.committed && two) return two; // maa kuollut + viimeinen tikki -> lyö kakkonen
    // Kakkonen voittaa VAIN avattuna, joten tikki 4 on pakko voittaa, jotta
    // pääsen johtamaan viimeistä. Voita se halvimmalla pomolla (ei kakkosella).
    if (view.trickNumber === 4 && plan.committed) {
      const bosses = h.filter(c => c.v !== 2 && isBoss(info, c));
      if (bosses.length) return loCard(bosses);
    }
    const drivers = h.filter(c => c.suit === s && c.v > 2 && isBoss(info, c));
    if (drivers.length) return hiCard(drivers);        // aja maata tyhjäksi korkeimmalla pomolla
    return leadLowKeepTwo();
  }

  const myLed = h.filter(c => c.suit === view.ledSuit);// seuraan: älä tuhlaa kakkosta
  const noTwo = arr => { const f = arr.filter(c => c.v !== 2); return f.length ? f : arr; };
  if (myLed.length) {
    const best = bestLed(view);
    const w = myLed.filter(c => c.v > best), l = myLed.filter(c => c.v <= best);
    if (view.trickNumber <= 3) return l.length ? loCard(noTwo(l)) : loCard(noTwo(w));
    return w.length ? loCard(noTwo(w)) : loCard(noTwo(l));
  }
  const keep = h.filter(c => c.v !== 2);
  return loCard(keep.length ? keep : h);
}
