// Kortit: maat, arvot ja pakka.
//
// Tupessa ei ole valttia. Ässä on korkein, kakkonen matalin.
// Tikin (kasan) voittaa suurin lyödyn maan kortti.

// --- Maat -------------------------------------------------------------- //
// Maat ovat kokonaislukuja 0..3, jotta vertailu on halpaa.
export const Suit = Object.freeze({
  CLUBS: 0,     // risti  (musta)
  DIAMONDS: 1,  // ruutu  (punainen)
  HEARTS: 2,    // hertta (punainen)
  SPADES: 3,    // pata   (musta)
});

export const SUITS = [Suit.CLUBS, Suit.DIAMONDS, Suit.HEARTS, Suit.SPADES];

const SUIT_SYMBOL = { 0: "\u2663", 1: "\u2666", 2: "\u2665", 3: "\u2660" };

export function suitIsRed(suit) {
  return suit === Suit.DIAMONDS || suit === Suit.HEARTS;
}

export function suitSymbol(suit) {
  return SUIT_SYMBOL[suit];
}

// --- Arvot ------------------------------------------------------------- //
// Arvot: 2..14 (11=J, 12=Q, 13=K, 14=A). Ässä korkein.
const RANK_NAMES = { 11: "J", 12: "Q", 13: "K", 14: "A" };
export const MIN_RANK = 2;
export const MAX_RANK = 14;

// --- Kortti ------------------------------------------------------------ //
// Kortit "internoidaan": jokaista (rank, suit) -paria kohti on tasan yksi
// oliо. Näin === ja Set toimivat arvopohjaisesti, aivan kuten Pythonin
// frozen dataclass.
const _INTERN = new Map();

export class Card {
  constructor(rank, suit) {
    this.rank = rank;
    this.suit = suit;
    Object.freeze(this);
  }

  /** Palauta internoitu (jaettu) korttiolio. Käytä aina tätä. */
  static of(rank, suit) {
    const key = rank * 4 + suit;
    let c = _INTERN.get(key);
    if (c === undefined) {
      c = new Card(rank, suit);
      _INTERN.set(key, c);
    }
    return c;
  }

  get name() {
    return RANK_NAMES[this.rank] ?? String(this.rank);
  }

  toString() {
    return `${this.name}${SUIT_SYMBOL[this.suit]}`;
  }
}

/** Poista kortti kädestä paikan päältä (internoitu -> === toimii). */
export function removeCard(hand, card) {
  const i = hand.indexOf(card);
  if (i >= 0) hand.splice(i, 1);
  return i >= 0;
}

/** Vertailuavain käden lajitteluun: ensin maa, sitten arvo. */
export function cardSortKey(c) {
  return c.suit * 100 + c.rank;
}

export function fullDeck() {
  const deck = [];
  for (const s of SUITS) {
    for (let r = MIN_RANK; r <= MAX_RANK; r++) {
      deck.push(Card.of(r, s));
    }
  }
  return deck;
}

// --- Sekoitus & jako --------------------------------------------------- //
// Pieni siemennettävä satunnaislukugeneraattori (mulberry32), jotta pelit
// ovat toistettavissa --seed -valinnalla. Ei kryptografinen.
export class RNG {
  constructor(seed = null) {
    if (seed === null || seed === undefined) {
      seed = (Math.random() * 2 ** 32) >>> 0;
    }
    this._s = seed >>> 0;
  }

  /** Liukuluku [0, 1). */
  random() {
    let t = (this._s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Kokonaisluku [0, n). */
  int(n) {
    return Math.floor(this.random() * n);
  }

  /** Palauta satunnainen alkio. */
  choice(arr) {
    return arr[this.int(arr.length)];
  }

  /** Sekoita taulukko paikan päällä (Fisher–Yates) ja palauta se. */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/** Sekoita ja jaa 13 korttia neljälle pelaajalle (paikat 0..3). */
export function deal(rng) {
  const deck = fullDeck();
  rng.shuffle(deck);
  const hands = [];
  for (let i = 0; i < 4; i++) {
    const hand = deck.slice(i * 13, (i + 1) * 13);
    hand.sort((a, b) => cardSortKey(a) - cardSortKey(b));
    hands.push(hand);
  }
  return hands;
}
