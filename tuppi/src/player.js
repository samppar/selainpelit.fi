// TuppiPlayer: rajapinta jonka JOKAINEN tekoälypelaaja toteuttaa.
//
// Tämä on koko projektin ydinsopimus. Kun haluat uuden pelaajan, kirjoita
// uusi tiedosto players/-kansioon, jossa on luokka joka perii TuppiPlayerin
// ja toteuttaa vähintään chooseShow() ja playCard().
//
// Katso players/randomPlayer.js minimikaavaksi.

export class TuppiPlayer {
  /**
   * Yhden istumapaikan tekoäly.
   *
   * Sama pelaajaolio pelaa koko ottelun yhdessä paikassa. Voit pitää tilaa
   * (esim. laskea pelattuja kortteja) olion kentissä; moottori kutsuu
   * tapahtumakoukkuja (onDealStart jne.) joiden avulla voit nollata tilan.
   */
  constructor(name = null) {
    // Näytettävä nimi. Aseta alaluokassa joko tämän kautta tai this.name.
    this.name = name ?? this.constructor.defaultName ?? "TuppiPlayer";
  }

  // ------------------------------------------------------------------ //
  //  PAKOLLISET METODIT                                                 //
  // ------------------------------------------------------------------ //

  /**
   * Näyttöpäätös ENNEN jakoa: palauta 'rami' tai 'nolo'.
   *
   * Näyttö kiertää jakajasta seuraavasta myötäpäivään. Heti kun joku
   * näyttää 'rami', peliksi tulee rami ja hänestä tulee ramaaja.
   * Jos kaikki näyttävät 'nolo', pelataan noloa.
   *
   * Muista: rami = yrität kerätä kasoja (yli 6), nolo = vältät niitä.
   *
   * @param {import('./views.js').ShowView} view
   * @returns {'rami'|'nolo'}
   */
  chooseShow(view) {
    throw new Error("chooseShow() on toteutettava alaluokassa");
  }

  /**
   * Lyö yksi kortti. Palautettavan kortin ON oltava view.legalMoves
   * joukossa (maantuntopakko). Muuten moottori hylkää siirron.
   *
   * @param {import('./views.js').PlayView} view
   * @returns {import('./cards.js').Card}
   */
  playCard(view) {
    throw new Error("playCard() on toteutettava alaluokassa");
  }

  // ------------------------------------------------------------------ //
  //  VAPAAEHTOISET TAPAHTUMAKOUKUT (oletuksena ei tee mitään)           //
  // ------------------------------------------------------------------ //

  /** Kutsutaan kun uusi jako alkaa (ennen näyttöä). Hyvä paikka nollata
   *  jaon aikainen tila (esim. pelattujen korttien lasku). */
  onDealStart(view) {}

  /** Kutsutaan kun näyttö on ratkennut: peliksi tuli gameType
   *  ('rami'/'nolo') ja ramaaja on ramin näyttäjän paikka (tai null). */
  onShowResult(gameType, ramaaja) {}

  // ------------------------------------------------------------------ //
  //  SOOLI (vapaaehtoinen)                                              //
  // ------------------------------------------------------------------ //
  /**
   * Kysytään jokaiselta PUOLUSTAJALTA (ramaajan vastapari) rami-näytön
   * jälkeen: haluatko pelata soolon eli yksin ramaajia vastaan? Ensimmäinen
   * 'true' ryhtyy soolaajaksi. Oletuksena ei soolaa.
   *
   * Muista soolin erot: ässä on PIENIN, pelaat aina viimeisenä, parisi ei
   * pelaa. Otat riskin: yksikin tikki -> ramaajat saavat 24p.
   *
   * @param {import('./views.js').ShowView} view
   * @returns {boolean}
   */
  chooseSooli(view) {
    return false;
  }

  /**
   * Soolaaja antaa parilleen yhden kortin (ja saa yhden tilalle). Palauta
   * käden kortti jonka annat pois. Oletus: anna korkein sooli-arvoinen kortti
   * (vaarallisin), jotta kädestä tulee mahdollisimman matala.
   *
   * @param {import('./views.js').ShowView} view
   * @returns {import('./cards.js').Card}
   */
  chooseSooliGift(view) {
    const hand = view.hand.slice();
    hand.sort((a, b) => (a.rank === 14 ? 1 : a.rank) - (b.rank === 14 ? 1 : b.rank));
    return hand[hand.length - 1];
  }

  /**
   * Soolaajan pari antaa soolaajalle yhden kortin tilalle. Palauta käden
   * kortti jonka annat. Oletus: anna matalin sooli-arvoinen kortti (paras
   * duunikortti soolaajalle, esim. ässä).
   *
   * @param {import('./views.js').ShowView} view
   * @returns {import('./cards.js').Card}
   */
  chooseSooliReturn(view) {
    const hand = view.hand.slice();
    hand.sort((a, b) => (a.rank === 14 ? 1 : a.rank) - (b.rank === 14 ? 1 : b.rank));
    return hand[0];
  }

  /** Kutsutaan kun sooli on päätetty: soolaaja = paikka (tai null). */
  onSooli(soolaaja) {}

  /** Kutsutaan kun kasa on lyöty loppuun. trick = [[seat, card], ...]. */
  onTrickComplete(trick, winnerSeat) {}

  /** Kutsutaan jaon lopussa tuloksen kera. */
  onDealEnd(tricksByTeam, winnerTeam, points) {}
}
