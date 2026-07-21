// Sanaseppä — pelin puhdas ydin (ei DOM:ia).
//
// Sama tiedosto ajetaan sekä selaimessa (build.js upottaa tämän index.html:ään)
// että Nodessa (test/run_tests.js require:aa sen). Lopussa on pieni UMD-häntä:
// funktiot tarjotaan global.SanaseppaEngine-oliona ja module.exports:na.
//
// Sanaseppä on laattojenasettelupeli: pelaaja nostaa kirjainlaattoja pussista ja
// muodostaa niistä ristikkomaisia sanoja 15×15-laudalle. Ydin sisältää: pussin
// kirjainjakauman ja pistearvot, kerroinruutujen asettelun, trien sanastolle,
// siirron laillisuustarkistuksen + pisteytyksen (sama koodi pelaajalle ja
// tekoälylle) sekä tekoälyn siirtogeneraattorin (ankkuri + ristikkotarkistus).
//
// HUOM: tämä ei ole Scrabble eikä yhteensopiva sen kanssa — oma kirjainjakauma,
// omat pistearvot ja oma kerroinruutujen asettelu.

(function (root) {
  "use strict";

  // ---- Siemenellinen RNG (mulberry32) -------------------------------------
  function makeRNG(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ---- Vakiot --------------------------------------------------------------
  var SIZE = 15;
  var RACK = 7;
  var CENTER = 7; // (7,7)
  var BLANK = "_";
  var BINGO_BONUS = 50; // kaikki 7 laattaa kerralla

  // Kirjainten pistearvot (oma asteikko, ei Scrabblesta). Tyhjä = 0.
  var LETTER_VALUES = {
    a: 1, e: 1, i: 1, n: 1, s: 1, t: 1,
    o: 2, u: 2, k: 2, l: 2,
    "ä": 3, r: 3, m: 3,
    p: 4, v: 4, h: 4, y: 4,
    j: 6,
    d: 7,
    g: 8, "ö": 8,
    // harvinaiset (mahdollisia vain tyhjällä laatalla): korkea arvo
    b: 8, c: 8, f: 8, q: 8, w: 8, x: 8, z: 8, "å": 8,
  };

  // Pussin kokoonpano: yhteensä 100 laattaa (98 kirjainta + 2 tyhjää).
  var BAG_COUNTS = {
    a: 10, i: 9, e: 7, o: 5, u: 6, "ä": 5, y: 2, "ö": 1,          // vokaalit 45
    t: 9, s: 7, k: 7, n: 7, l: 5, r: 4, p: 3, m: 3, v: 2, h: 2, j: 2, d: 1, g: 1, // konsonantit 53
  };
  var BLANK_COUNT = 2;

  // Aakkosto ristikkotarkistuksen kirjainkokeiluja varten (kattaa myös
  // lainakirjaimet, jotta tyhjän laatan kaikki sanat kelpaavat).
  var ALPHABET = "abcdefghijklmnopqrstuvwxyzäöå".split("");

  // ---- Kerroinruutujen asettelu (15×15, oma layout) ------------------------
  // Tunnukset: '.' tavallinen, '2' tuplasana, '3' kolmesana,
  //            'd' tuplakirjain, 't' kolmekirjain, '*' keskusruutu (tuplasana).
  // Symmetrinen molempien akselien suhteen.
  //
  // Tuplasanat (5): keskus + vinot (4,4)/(4,10)/(10,4)/(10,10) — mid-game-
  // laajennus; eivät ole avausakseleilla (ei ×4 tavallisella avauksella).
  //
  // Kolmekirjaimet (8): "toisen kehän" paikat (1,5)/(1,9)/(5,1)/(5,13) ja
  // peilaukset. Logiikka:
  //  • Tarpeeksi lähellä keskustaa, jotta rinnakkaiset sanat / koukut
  //    mid-gamessa osuvat — ei reunakuolleita ruutuja.
  //  • Poissa avausriviltä/-sarakkeelta 7, joten avaus ei nappaa 3×K.
  //  • Eivät vierekkäin 2×S-vinojen kanssa → ei automaattista 3×K+2×S
  //    samaan lyhyeen sanaan.
  //  • Eivät reunalla 3×S-kulmien kanssa samalla reunaviivalla yhtä tiiviisti
  //    kuin vanha asettelu (0,3)+(0,0) — hillitsee reunojen ylilyöntejä.
  var PREMIUM_LAYOUT = [
    "3.............3",
    ".d...t...t...d.",
    "..d.........d..",
    "...d.......d...",
    "....2.d.d.2....",
    ".t...d...d...t.",
    "......d.d......",
    ".......*.......",
    "......d.d......",
    ".t...d...d...t.",
    "....2.d.d.2....",
    "...d.......d...",
    "..d.........d..",
    ".d...t...t...d.",
    "3.............3",
  ];

  // Palauttaa "", "2L", "3L", "2W" tai "3W" ruudulle (r,c).
  function premiumAt(r, c) {
    if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return "";
    switch (PREMIUM_LAYOUT[r].charAt(c)) {
      case "2": return "2W";
      case "3": return "3W";
      case "d": return "2L";
      case "t": return "3L";
      case "*": return "2W"; // keskusruutu
      default: return "";
    }
  }

  function letterValue(ch) { return LETTER_VALUES[ch] || 0; }

  // ---- Pussi ---------------------------------------------------------------
  // Palauttaa sekoitetun taulukon laattoja (kirjain tai BLANK).
  function createBag(rng) {
    var tiles = [];
    for (var ch in BAG_COUNTS) {
      if (!BAG_COUNTS.hasOwnProperty(ch)) continue;
      for (var i = 0; i < BAG_COUNTS[ch]; i++) tiles.push(ch);
    }
    for (var b = 0; b < BLANK_COUNT; b++) tiles.push(BLANK);
    return shuffle(tiles, rng);
  }

  // Nostaa telineen täyteen pussista (muokkaa molempia taulukoita).
  // size: tavoitekoko (oletus RACK = 7).
  function refill(rack, bag, size) {
    var target = size == null ? RACK : size;
    while (rack.length < target && bag.length > 0) rack.push(bag.pop());
    return rack;
  }

  // ---- Trie sanastolle -----------------------------------------------------
  function buildTrie(words) {
    var root = { c: {} };
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!w) continue;
      var node = root;
      for (var k = 0; k < w.length; k++) {
        var ch = w[k];
        var next = node.c[ch];
        if (!next) { next = { c: {} }; node.c[ch] = next; }
        node = next;
      }
      node.w = true;
    }
    return root;
  }

  function trieNode(trie, word) {
    var node = trie;
    for (var i = 0; i < word.length; i++) {
      node = node.c[word[i]];
      if (!node) return null;
    }
    return node;
  }

  function trieHas(trie, word) {
    var node = trieNode(trie, word);
    return !!(node && node.w);
  }

  // ---- Lauta ---------------------------------------------------------------
  // Lauta = taulukko, jonka pituus SIZE*SIZE. Kukin ruutu null tai
  // { ch: "a", blank: false }.
  function emptyBoard() {
    var b = new Array(SIZE * SIZE);
    for (var i = 0; i < b.length; i++) b[i] = null;
    return b;
  }
  function idx(r, c) { return r * SIZE + c; }
  function cellAt(board, r, c) {
    if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return null;
    return board[idx(r, c)];
  }
  function isBoardEmpty(board) {
    for (var i = 0; i < board.length; i++) if (board[i]) return false;
    return true;
  }

  // ---- Siirron laillisuus & pisteytys --------------------------------------
  // placed: taulukko { r, c, ch, blank }. opts: { rackSize } bingolle (oletus RACK).
  // Palauttaa { ok:true, score, words:[..], main, bingo } tai { ok:false, reason }.
  function validateMove(board, placed, trie, opts) {
    opts = opts || {};
    var rackSize = opts.rackSize == null ? RACK : opts.rackSize;
    if (!placed || placed.length === 0) return { ok: false, reason: "Aseta ainakin yksi laatta." };

    var first = isBoardEmpty(board);
    var overlay = {}; // idx -> {ch,blank}
    var i, p;
    var rows = {}, cols = {};
    for (i = 0; i < placed.length; i++) {
      p = placed[i];
      if (p.r < 0 || p.c < 0 || p.r >= SIZE || p.c >= SIZE)
        return { ok: false, reason: "Laatta laudan ulkopuolella." };
      var k = idx(p.r, p.c);
      if (overlay[k]) return { ok: false, reason: "Kaksi laattaa samassa ruudussa." };
      if (board[k]) return { ok: false, reason: "Ruutu on jo käytössä." };
      overlay[k] = { ch: p.ch, blank: !!p.blank, placed: true };
      rows[p.r] = 1; cols[p.c] = 1;
    }

    var rowKeys = Object.keys(rows), colKeys = Object.keys(cols);
    var horiz;
    if (placed.length === 1) horiz = true; // suunta selviää muodostuvista sanoista
    else if (rowKeys.length === 1) horiz = true;
    else if (colKeys.length === 1) horiz = false;
    else return { ok: false, reason: "Laatat yhdelle riville tai sarakkeelle." };

    function get(r, c) {
      var k = idx(r, c);
      if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return null;
      return overlay[k] || board[k] || null;
    }

    // Kokoaa maksimaalisen sanan (r,c):n läpi suuntaan (dr,dc).
    function gatherRun(r, c, dr, dc) {
      var hr = r, hc = c;
      while (get(hr - dr, hc - dc)) { hr -= dr; hc -= dc; }
      var cells = [];
      var word = "";
      var cr = hr, cc = hc;
      var cell = get(cr, cc);
      while (cell) {
        cells.push({ r: cr, c: cc, ch: cell.ch, blank: cell.blank, placed: !!cell.placed });
        word += cell.ch;
        cr += dr; cc += dc;
        cell = get(cr, cc);
      }
      return { word: word, cells: cells };
    }

    var words = [];
    if (placed.length >= 2) {
      var mainRun = gatherRun(placed[0].r, placed[0].c, horiz ? 0 : 1, horiz ? 1 : 0);
      // Kaikkien asetettujen laattojen on oltava samassa yhtenäisessä sanassa.
      var inMain = {};
      for (i = 0; i < mainRun.cells.length; i++) inMain[idx(mainRun.cells[i].r, mainRun.cells[i].c)] = 1;
      for (i = 0; i < placed.length; i++) {
        if (!inMain[idx(placed[i].r, placed[i].c)])
          return { ok: false, reason: "Laattojen väliin jää tyhjä ruutu." };
      }
      words.push(mainRun);
      for (i = 0; i < placed.length; i++) {
        var cross = gatherRun(placed[i].r, placed[i].c, horiz ? 1 : 0, horiz ? 0 : 1);
        if (cross.cells.length >= 2) words.push(cross);
      }
    } else {
      var h = gatherRun(placed[0].r, placed[0].c, 0, 1);
      var v = gatherRun(placed[0].r, placed[0].c, 1, 0);
      if (h.cells.length >= 2) words.push(h);
      if (v.cells.length >= 2) words.push(v);
    }

    if (words.length === 0) return { ok: false, reason: "Sana on liian lyhyt." };

    // Yhteys: ensisiirron oltava keskiruudun kautta; muuten sanassa oltava
    // vähintään yksi laudalla jo ollut laatta.
    if (first) {
      var onCenter = false;
      for (i = 0; i < placed.length; i++) if (placed[i].r === CENTER && placed[i].c === CENTER) onCenter = true;
      if (!onCenter) return { ok: false, reason: "Ensimmäisen sanan on kuljettava keskiruudun kautta." };
    } else {
      var connected = false;
      for (i = 0; i < words.length && !connected; i++) {
        var cs = words[i].cells;
        for (var j = 0; j < cs.length; j++) if (!cs[j].placed) { connected = true; break; }
      }
      if (!connected) return { ok: false, reason: "Sanan on liityttävä laudalla oleviin laattoihin." };
    }

    // Sanaston tarkistus.
    for (i = 0; i < words.length; i++) {
      if (!trieHas(trie, words[i].word))
        return { ok: false, reason: "\u201c" + words[i].word.toUpperCase() + "\u201d ei ole sanalistassa.", badWord: words[i].word };
    }

    // Pisteytys: kerroinruudut vain uusille laatoille.
    var total = 0;
    for (i = 0; i < words.length; i++) {
      var wcells = words[i].cells;
      var sum = 0, wordMult = 1;
      for (var m = 0; m < wcells.length; m++) {
        var cc2 = wcells[m];
        var base = cc2.blank ? 0 : letterValue(cc2.ch);
        if (cc2.placed) {
          var pr = premiumAt(cc2.r, cc2.c);
          if (pr === "2L") base *= 2;
          else if (pr === "3L") base *= 3;
          else if (pr === "2W") wordMult *= 2;
          else if (pr === "3W") wordMult *= 3;
        }
        sum += base;
      }
      total += sum * wordMult;
    }
    if (placed.length === rackSize) total += BINGO_BONUS;

    return {
      ok: true,
      score: total,
      words: words.map(function (w) { return w.word; }),
      main: words[0].word,
      bingo: placed.length === rackSize,
    };
  }

  // ---- Tekoälyn siirtogeneraattori -----------------------------------------
  // Ankkuripohjainen: käy rivit (vaaka) ja sarakkeet (pysty, transponoituna).
  // Jokaiselle ankkurille laajennetaan sanaa trien läpi, ristikkotarkistus
  // rajaa mahdolliset kirjaimet. Palauttaa siirtoehdokkaat (placed-listat).

  function transpose(board) {
    var t = emptyBoard();
    for (var r = 0; r < SIZE; r++)
      for (var c = 0; c < SIZE; c++)
        t[idx(c, r)] = board[idx(r, c)];
    return t;
  }

  function rackState(rack) {
    var counts = {}, blanks = 0;
    for (var i = 0; i < rack.length; i++) {
      if (rack[i] === BLANK) blanks++;
      else counts[rack[i]] = (counts[rack[i]] || 0) + 1;
    }
    return { counts: counts, blanks: blanks };
  }

  // Ristikkojoukot (pysty) grid-kehyksessä: idx -> {any:true} tai Set(kirjaimet).
  function crossSets(grid, trie) {
    var sets = {};
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (grid[idx(r, c)]) continue; // vain tyhjät
        var prefix = "", suffix = "";
        var rr = r - 1;
        while (rr >= 0 && grid[idx(rr, c)]) { prefix = grid[idx(rr, c)].ch + prefix; rr--; }
        rr = r + 1;
        while (rr < SIZE && grid[idx(rr, c)]) { suffix += grid[idx(rr, c)].ch; rr++; }
        if (!prefix && !suffix) continue; // ei pystynaapureita -> kaikki sallittu
        var set = {};
        for (var a = 0; a < ALPHABET.length; a++) {
          var L = ALPHABET[a];
          if (trieHas(trie, prefix + L + suffix)) set[L] = 1;
        }
        sets[idx(r, c)] = set;
      }
    }
    return sets;
  }

  // Kerää yhden suunnan siirrot annetusta ruudukosta. transposed=true kääntää
  // koordinaatit takaisin alkuperäisiin (r,c).
  function genDir(grid, trie, rack, first, transposed, sink) {
    var sets = crossSets(grid, trie);
    var rs = rackState(rack);

    function crossOk(r, c, L) {
      var set = sets[idx(r, c)];
      return !set || set[L]; // ei joukkoa = ei pystynaapureita = sallittu
    }

    function emit(r, placedList, anchorCol) {
      var covers = false;
      for (var i = 0; i < placedList.length; i++) if (placedList[i].c === anchorCol) { covers = true; break; }
      if (!covers) return;
      var cells = [];
      for (var k = 0; k < placedList.length; k++) {
        var pc = placedList[k];
        cells.push(transposed
          ? { r: pc.c, c: r, ch: pc.ch, blank: pc.blank }
          : { r: r, c: pc.c, ch: pc.ch, blank: pc.blank });
      }
      sink(cells);
    }

    // Laajenna sanaa oikealle sarakkeesta col alkaen. placed = tähän mennessä
    // asetetut (vain uudet laatat). node = trie-solmu luetun sanan jälkeen.
    function extendRight(r, col, node, placed, anchorCol) {
      var atFilled = col < SIZE && grid[idx(r, col)];
      if (!atFilled) {
        // Oikea reuna: sana voi päättyä tähän.
        if (node.w && placed.length > 0) emit(r, placed, anchorCol);
        if (col >= SIZE) return;
        var set = sets[idx(r, col)];
        for (var ch in node.c) {
          if (!node.c.hasOwnProperty(ch)) continue;
          if (set && !set[ch]) continue; // ristikkotarkistus
          // Valitse laatta: mieluiten oikea kirjain, muuten tyhjä.
          if (rs.counts[ch] > 0) {
            rs.counts[ch]--;
            placed.push({ c: col, ch: ch, blank: false });
            extendRight(r, col + 1, node.c[ch], placed, anchorCol);
            placed.pop();
            rs.counts[ch]++;
          } else if (rs.blanks > 0) {
            rs.blanks--;
            placed.push({ c: col, ch: ch, blank: true });
            extendRight(r, col + 1, node.c[ch], placed, anchorCol);
            placed.pop();
            rs.blanks++;
          }
        }
      } else {
        var L = grid[idx(r, col)].ch;
        var nx = node.c[L];
        if (nx) extendRight(r, col + 1, nx, placed, anchorCol);
      }
    }

    for (var r = 0; r < SIZE; r++) {
      // Ankkurit tällä rivillä.
      var anchors = {};
      for (var c = 0; c < SIZE; c++) {
        if (grid[idx(r, c)]) continue;
        if (first) { if (r === CENTER && c === CENTER) anchors[c] = 1; }
        else if (cellAt(grid, r - 1, c) || cellAt(grid, r + 1, c) ||
                 cellAt(grid, r, c - 1) || cellAt(grid, r, c + 1)) anchors[c] = 1;
      }
      for (var a in anchors) {
        if (!anchors.hasOwnProperty(a)) continue;
        var c0 = a | 0;
        if (c0 > 0 && grid[idx(r, c0 - 1)]) {
          // Kiinteä vasen osa laudalta.
          var pc = c0 - 1, prefix = "";
          while (pc >= 0 && grid[idx(r, pc)]) { prefix = grid[idx(r, pc)].ch + prefix; pc--; }
          var start = pc + 1;
          var node = trieNode(trie, prefix);
          if (node) extendRight(r, c0, node, [], c0);
          // (start-muuttuja pidetään selvyyden vuoksi; extendRight kulkee c0:sta)
          void start;
        } else {
          // Vasen naapuri tyhjä: kokeile eri aloituskohtia (vasen osa telineestä).
          var limit = 0, cc = c0 - 1;
          while (cc >= 0 && !grid[idx(r, cc)] && !anchors[cc]) { limit++; cc--; }
          for (var len = 0; len <= limit; len++) {
            var s = c0 - len;
            if (s > 0 && grid[idx(r, s - 1)]) continue; // ei-maksimaalinen vasen reuna
            extendRight(r, s, trie, [], c0);
          }
        }
      }
    }
  }

  // Palauttaa uniikit lailliset siirrot pisteytettynä, laskevassa järjestyksessä.
  function generateMoves(board, rack, trie) {
    var first = isBoardEmpty(board);
    var seen = {};
    var moves = [];
    var rackSize = rack.length;
    function sink(cells) {
      // Dedup + pisteytys yhteisellä validoinnilla.
      var key = cells.map(function (x) { return x.r + "," + x.c + x.ch + (x.blank ? "*" : ""); })
        .sort().join("|");
      if (seen[key]) return;
      seen[key] = 1;
      var res = validateMove(board, cells, trie, { rackSize: rackSize });
      if (res.ok) moves.push({ cells: cells, score: res.score, words: res.words, main: res.main, bingo: res.bingo });
    }
    genDir(board, trie, rack, first, false, sink);
    genDir(transpose(board), trie, rack, first, true, sink);
    moves.sort(function (x, y) { return y.score - x.score; });
    return moves;
  }

  // ---- Loppupisteet: jäljelle jääneiden laattojen arvo ---------------------
  function rackValue(rack) {
    var s = 0;
    for (var i = 0; i < rack.length; i++) if (rack[i] !== BLANK) s += letterValue(rack[i]);
    return s;
  }

  var API = {
    SIZE: SIZE, RACK: RACK, CENTER: CENTER, BLANK: BLANK, BINGO_BONUS: BINGO_BONUS,
    LETTER_VALUES: LETTER_VALUES, BAG_COUNTS: BAG_COUNTS, BLANK_COUNT: BLANK_COUNT,
    PREMIUM_LAYOUT: PREMIUM_LAYOUT,
    makeRNG: makeRNG, shuffle: shuffle,
    premiumAt: premiumAt, letterValue: letterValue,
    createBag: createBag, refill: refill,
    buildTrie: buildTrie, trieHas: trieHas, trieNode: trieNode,
    emptyBoard: emptyBoard, cellAt: cellAt, idx: idx, isBoardEmpty: isBoardEmpty,
    validateMove: validateMove, generateMoves: generateMoves,
    transpose: transpose, rackValue: rackValue,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.SanaseppaEngine = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
