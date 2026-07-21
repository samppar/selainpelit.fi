// ============================================================================
//  Katko — puhdas pelimoottori (ei DOM:ia, ei ajastimia)
//  --------------------------------------------------------------------------
//  Sama sääntökoodi ajaa selainpelin (index.html tuo nämä funktiot) JA
//  päättömän eval-/turnausharnessin (eval.js, tournament.mjs) Nodessa.
//
//  Kortti: { suit: "H"|"D"|"C"|"S", v: 2..14 }.  Ässä = 14, kakkonen = 2.
//  Vain viimeisen (5.) tikin voittaja saa pisteen. Kakkossäännöllä viimeisen
//  tikin voitto kakkosella tuo 2 pistettä.
// ============================================================================

export const SUIT_KEYS = ["H", "D", "C", "S"];
export const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

// --- siemennettävä PRNG (mulberry32): toistettavat jaot evalia varten -------
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- pakka & sekoitus --------------------------------------------------------
export function buildDeck() {
  const d = [];
  for (const s of SUIT_KEYS) for (const v of RANKS) d.push({ suit: s, v });
  return d;
}

// Fisher–Yates. rnd() palauttaa [0,1). Oletuksena Math.random (selain).
export function shuffle(a, rnd = Math.random) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- säännöt -----------------------------------------------------------------
// Maapakko: jos avattua maata on kädessä, on tunnustettava; muuten mikä tahansa.
export function legalCards(hand, trick, ledSuit) {
  if (trick.length === 0) return hand.slice();
  const follow = hand.filter(c => c.suit === ledSuit);
  return follow.length ? follow : hand.slice();
}

// Tikin voittaja: korkein avausmaan kortti. trick = [{p, card}, ...].
export function trickWinner(trick, ledSuit) {
  let bv = -1, w = trick[0].p, wc = trick[0].card;
  for (const t of trick) {
    if (t.card.suit === ledSuit && t.card.v > bv) { bv = t.card.v; w = t.p; wc = t.card; }
  }
  return { p: w, card: wc };
}

// Viimeisen tikin pisteet: kakkosella (kakkossääntö päällä) 2, muuten 1.
export function trickPoints(winningCard, kakko) {
  return (kakko && winningCard.v === 2) ? 2 : 1;
}

// --- void-päättely -----------------------------------------------------------
// Julkisesta historiasta: jos pelaaja EI tunnustanut avausmaata (pelasi eri
// maan vaikka maata pyydettiin), hänellä on todistetusti loppu se maa. Palauttaa
// [{H,D,C,S}, ...] paikoittain, true = paikka on varmasti pihalla siitä maasta.
export function computeVoids(history, curTrick, curLed) {
  const voids = [{}, {}, {}, {}];
  const mark = (plays, led) => {
    if (led == null) return;
    for (const pl of plays) if (pl.card.suit !== led) voids[pl.p][led] = true;
  };
  for (const tr of history) mark(tr.plays, tr.ledSuit);
  mark(curTrick, curLed);
  return voids;
}

// --- havainto (view) ---------------------------------------------------------
// Rakentaa pelaajan read-only havainnon. state = { hands, trick, ledSuit,
// trickNumber, kakko, played, history }. withExtras=false jättää pois raskaan
// history/voids-laskennan (käytetään Monte Carlo -rollouteissa nopeuden vuoksi).
export function buildView(state, pi, withExtras = true) {
  const legal = legalCards(state.hands[pi], state.trick, state.ledSuit);
  const view = {
    me: pi,
    hand: state.hands[pi].map(c => ({ suit: c.suit, v: c.v })),
    trick: state.trick.map(t => ({ p: t.p, card: { suit: t.card.suit, v: t.card.v } })),
    ledSuit: state.ledSuit,
    trickNumber: state.trickNumber,
    kakko: state.kakko,
    played: state.played.map(c => ({ suit: c.suit, v: c.v })),
    handCounts: state.hands.map(h => h.length),
    legal: legal.map(c => ({ suit: c.suit, v: c.v })),
    // Ottelun pistetilanne: agentti voi säätää taktiikkaa (esim. kakkosriski).
    // target=null tarkoittaa yksittäisen jaon peliä (ei ottelurajaa).
    scores: (state.scores || [0, 0, 0, 0]).slice(),
    target: state.target != null ? state.target : null,
  };
  if (withExtras) {
    const hist = state.history || [];
    view.history = hist.map(tr => ({
      ledSuit: tr.ledSuit,
      plays: tr.plays.map(pl => ({ p: pl.p, card: { suit: pl.card.suit, v: pl.card.v } })),
    }));
    view.voids = computeVoids(hist, state.trick, state.ledSuit);
  }
  return Object.freeze(view);
}

// --- turvakääre --------------------------------------------------------------
// Kutsuu agentin chooseCardia niin ettei laiton siirto tai poikkeus voi
// kaataa/jumittaa peliä: jos tulos ei ole laillisten joukossa, pelataan
// oletuslaillinen kortti (matalin). Palauttaa AINA laillisen kortin.
export function safeChoose(agent, view) {
  const legal = view.legal;
  try {
    const c = agent.chooseCard(view);
    if (c && legal.some(l => l.suit === c.suit && l.v === c.v)) return c;
  } catch (e) { /* fall through to default */ }
  // matalin laillinen varakortti
  let lo = legal[0];
  for (const c of legal) if (c.v < lo.v) lo = c;
  return lo;
}

// --- päätön täysi jako -------------------------------------------------------
// Pelaa yhden jaon (5 tikkiä) neljällä agentilla. Palauttaa tuloksen; ei
// DOM:ia, ei ajastimia. agents = [a0,a1,a2,a3], leader = aloittaja 0..3.
export function playDeal(agents, leader, kakko, rnd = Math.random, ctx = {}) {
  const deck = shuffle(buildDeck(), rnd);
  const hands = [[], [], [], []];
  let idx = 0;
  for (let n = 0; n < 5; n++) for (let p = 0; p < 4; p++) hands[p].push(deck[idx++]);

  // ctx.scores / ctx.target välittyvät agenttien viewiin (ottelupohjainen taktiikka).
  const state = { hands, trick: [], ledSuit: null, trickNumber: 1, kakko, played: [], history: [],
                  scores: ctx.scores || [0, 0, 0, 0], target: ctx.target != null ? ctx.target : null };
  const scores = [0, 0, 0, 0];
  let turn = leader;
  let lastWinner = null, lastCard = null;

  for (let tn = 1; tn <= 5; tn++) {
    state.trickNumber = tn;
    state.trick = [];
    state.ledSuit = null;
    for (let k = 0; k < 4; k++) {
      const pi = turn;
      const view = buildView(state, pi);
      const card = safeChoose(agents[pi], view);
      const h = state.hands[pi];
      const ci = h.findIndex(c => c.suit === card.suit && c.v === card.v);
      h.splice(ci, 1);
      state.trick.push({ p: pi, card });
      state.played.push({ suit: card.suit, v: card.v });
      if (state.trick.length === 1) state.ledSuit = card.suit;
      turn = (turn + 1) % 4;
    }
    const win = trickWinner(state.trick, state.ledSuit);
    state.history.push({ ledSuit: state.ledSuit, plays: state.trick.slice() });
    turn = win.p;             // voittaja johtaa seuraavan tikin
    lastWinner = win.p;
    lastCard = win.card;
  }

  const pts = trickPoints(lastCard, kakko);
  scores[lastWinner] = pts;
  return { scores, winner: lastWinner, pts, winningCard: lastCard };
}

// --- täysi ottelu voittorajaan -----------------------------------------------
// Pelaa jakoja kunnes joku yltää targetiin. Jokaisen jaon voittaja aloittaa
// seuraavan (kuten selaimessa). Kunkin jaon agentit näkevät ajantasaisen
// pistetilanteen view.scores/view.target -kentissä. Palauttaa ottelun voittajan.
export function playMatch(agents, target, kakko, rnd = Math.random, firstLeader = 0) {
  const scores = [0, 0, 0, 0];
  let leader = firstLeader;
  let deals = 0;
  while (Math.max(...scores) < target && deals < 500) {
    const res = playDeal(agents, leader, kakko, rnd, { scores, target });
    scores[res.winner] += res.pts;
    leader = res.winner;
    deals++;
  }
  let winner = 0;
  for (let p = 1; p < 4; p++) if (scores[p] > scores[winner]) winner = p;
  return { scores, winner, deals };
}
