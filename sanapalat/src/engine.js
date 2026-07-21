// Sanapalat — pelin puhdas ydin (ei DOM:ia).
//
// Scrabble-tyylinen laudanladontapeli, mutta oma toteutus: oma bonusruutukartta,
// oma palasarja ja oma nimi. Lauta on 15×15 ja keskiruudusta saa kaksinkertaiset
// sanapisteet (aloitussiirto peittää keskiruudun).
//
// Ajetaan sekä selaimessa (build.js upottaa) että Nodessa (testit). UMD-häntä.
(function (root) {
  "use strict";

  var SIZE = 15;

  // ---- Siemenellinen RNG (mulberry32) -------------------------------------
  function makeRNG(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
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

  // ---- Palasarja (oma jakauma, 100 palaa + 2 jokeria) ---------------------
  // [kirjain, määrä, pisteet]. '?' = jokeri (0 p, edustaa mitä tahansa kirjainta).
  var TILE_BAG = [
    ["a", 10, 1], ["i", 10, 1], ["t", 9, 1], ["n", 9, 1], ["e", 8, 1],
    ["s", 7, 1], ["l", 5, 1], ["o", 5, 1], ["k", 5, 1], ["u", 5, 1],
    ["ä", 5, 2], ["m", 3, 2], ["v", 2, 2], ["r", 2, 2], ["j", 2, 3],
    ["h", 2, 3], ["y", 2, 3], ["p", 2, 3], ["d", 1, 4],
    ["ö", 1, 4], ["g", 1, 5], ["b", 1, 6], ["f", 1, 8], ["?", 2, 0],
  ];
  // Kirjainten pistearvot (myös harvinaisille varmuuden vuoksi; jokerit 0).
  var VALUES = {};
  TILE_BAG.forEach(function (t) { VALUES[t[0]] = t[2]; });
  var RARE = { c: 8, w: 8, z: 10, x: 10, q: 10, "å": 10 };
  for (var rk in RARE) if (VALUES[rk] == null) VALUES[rk] = RARE[rk];

  function letterValue(letter, blank) { return blank ? 0 : (VALUES[letter] || 0); }

  function buildBag(rng) {
    var bag = [];
    TILE_BAG.forEach(function (t) { for (var i = 0; i < t[1]; i++) bag.push(t[0]); });
    return shuffle(bag, rng);
  }

  // ---- Bonusruudukko (oma, 4-kertainen symmetria) -------------------------
  // Neljännes 8×8 (r,c = 0..7); täysi lauta peilataan tästä. Merkit:
  //   T=kolminkert. sana, D=kaksinkert. sana, t=kolminkert. kirjain,
  //   d=kaksinkert. kirjain, .=tavallinen, *=keskiruutu (kaksinkert. sana).
  var QUAD = [
    "T..d...D",
    ".D...t..",
    "..D...d.",
    "d..D....",
    "....t..d",
    ".t...D..",
    "..d...t.",
    "D...d..*",
  ];
  function buildPremium() {
    var g = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) {
        var qr = Math.min(r, SIZE - 1 - r);
        var qc = Math.min(c, SIZE - 1 - c);
        row.push(QUAD[qr][qc]);
      }
      g.push(row);
    }
    return g;
  }
  var PREMIUM = buildPremium();
  function premiumAt(r, c) { return PREMIUM[r][c]; }
  function letterMult(p) { return p === "t" ? 3 : p === "d" ? 2 : 1; }
  function wordMult(p) { return p === "T" ? 3 : (p === "D" || p === "*") ? 2 : 1; }

  // ---- Sanasto: trie ------------------------------------------------------
  function buildTrie(words) {
    var root = { c: {} };
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (w.length < 2) continue;
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
  function trieHas(trie, word) {
    var node = trie;
    for (var i = 0; i < word.length; i++) { node = node.c[word[i]]; if (!node) return false; }
    return !!node.w;
  }

  // ---- Lauta --------------------------------------------------------------
  // Ruutu: null tai { l:"a", blank:false }.
  function emptyBoard() {
    var b = [];
    for (var r = 0; r < SIZE; r++) { b.push(new Array(SIZE).fill(null)); }
    return b;
  }
  function isEmptyBoard(bd) {
    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) if (bd[r][c]) return false;
    return true;
  }
  function cloneBoard(bd) { return bd.map(function (row) { return row.slice(); }); }

  // ---- Sanan keräys laudalta ----------------------------------------------
  function collectWord(bd, r, c, dr, dc) {
    // palaa alkuun
    var sr = r, sc = c;
    while (inb(sr - dr, sc - dc) && bd[sr - dr][sc - dc]) { sr -= dr; sc -= dc; }
    var cells = [];
    var rr = sr, cc = sc;
    while (inb(rr, cc) && bd[rr][cc]) { cells.push([rr, cc]); rr += dr; cc += dc; }
    return cells;
  }
  function inb(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
  function wordStr(bd, cells) { return cells.map(function (p) { return bd[p[0]][p[1]].l; }).join(""); }

  // ---- Siirron tarkistus ja pisteytys -------------------------------------
  // placements: [{r,c,l,blank}]. Palauttaa {ok, score, words:[{word,cells}], error}.
  function validateAndScore(bd, placements, trie) {
    if (!placements.length) return { ok: false, error: "Ei asetettuja paloja." };
    // 1) samalla rivillä tai sarakkeella?
    var rows = placements.map(function (p) { return p.r; });
    var cols = placements.map(function (p) { return p.c; });
    var sameRow = rows.every(function (v) { return v === rows[0]; });
    var sameCol = cols.every(function (v) { return v === cols[0]; });
    if (!sameRow && !sameCol) return { ok: false, error: "Palat on asetettava yhteen riviin tai sarakkeeseen." };

    // 2) ruudut vapaat & ei päällekkäisiä
    var seen = {};
    for (var i = 0; i < placements.length; i++) {
      var p = placements[i];
      if (!inb(p.r, p.c)) return { ok: false, error: "Pala laudan ulkopuolella." };
      if (bd[p.r][p.c]) return { ok: false, error: "Ruutu on jo varattu." };
      var key = p.r + "," + p.c;
      if (seen[key]) return { ok: false, error: "Kaksi palaa samaan ruutuun." };
      seen[key] = true;
    }

    // 3) väliaikainen lauta
    var tmp = cloneBoard(bd);
    placements.forEach(function (p) { tmp[p.r][p.c] = { l: p.l, blank: !!p.blank }; });

    // suunta: usea pala määrää; yksittäinen pala päätellään naapureista
    var dr, dc;
    if (placements.length === 1) {
      var p0 = placements[0];
      var horiz = (inb(p0.r, p0.c - 1) && tmp[p0.r][p0.c - 1]) || (inb(p0.r, p0.c + 1) && tmp[p0.r][p0.c + 1]);
      dr = horiz ? 0 : 1; dc = horiz ? 1 : 0;
    } else { dr = sameRow ? 0 : 1; dc = sameRow ? 1 : 0; }

    // 4) pääsana yhtenäinen (ei aukkoja asetettujen välissä)
    var line = placements.map(function (p) { return dr === 0 ? p.c : p.r; }).sort(function (a, b) { return a - b; });
    var fixedIdx = dr === 0 ? placements[0].r : placements[0].c;
    for (var q = line[0]; q <= line[line.length - 1]; q++) {
      var rr = dr === 0 ? fixedIdx : q;
      var cc = dr === 0 ? q : fixedIdx;
      if (!tmp[rr][cc]) return { ok: false, error: "Sanassa on aukko." };
    }

    var isFirst = isEmptyBoard(bd);
    var newSet = {};
    placements.forEach(function (p) { newSet[p.r + "," + p.c] = true; });

    // 5) kerää kaikki muodostuneet sanat: pääsana + ristisanat
    var words = [];
    var main = collectWord(tmp, placements[0].r, placements[0].c, dr, dc);
    if (main.length >= 2) words.push(main);
    // ristisanat kohtisuoraan jokaisesta uudesta palasta
    placements.forEach(function (p) {
      var cross = collectWord(tmp, p.r, p.c, dc, dr); // kohtisuora suunta
      if (cross.length >= 2) words.push(cross);
    });
    if (words.length === 0) return { ok: false, error: "Sana on liian lyhyt (väh. 2 kirjainta)." };

    // 6) kytkentä: ensisiirto keskiruudun kautta; muuten kosketus vanhoihin
    if (isFirst) {
      var touchesCenter = placements.some(function (p) { return p.r === 7 && p.c === 7; });
      if (!touchesCenter) return { ok: false, error: "Aloitussana on asetettava keskiruudun kautta." };
    } else {
      var touches = false;
      // jokin muodostettu sana sisältää vanhan palan, TAI ristisanoja syntyi
      if (words.length > 1) touches = true;
      main.forEach(function (cell) { if (!newSet[cell[0] + "," + cell[1]]) touches = true; });
      if (!touches) return { ok: false, error: "Sanan on liityttävä aiempiin paloihin." };
    }

    // 7) validointi + pisteytys
    var total = 0;
    var wordInfos = [];
    for (var wi = 0; wi < words.length; wi++) {
      var cells = words[wi];
      var str = wordStr(tmp, cells);
      if (!trieHas(trie, str)) return { ok: false, error: '"' + str.toUpperCase() + '" ei ole sanalistalla.' };
      var wScore = 0, wMult = 1;
      for (var ci = 0; ci < cells.length; ci++) {
        var rc = cells[ci], cell = tmp[rc[0]][rc[1]];
        var isNew = newSet[rc[0] + "," + rc[1]];
        var base = letterValue(cell.l, cell.blank);
        if (isNew) {
          var pr = premiumAt(rc[0], rc[1]);
          wScore += base * letterMult(pr);
          wMult *= wordMult(pr);
        } else {
          wScore += base;
        }
      }
      wScore *= wMult;
      total += wScore;
      wordInfos.push({ word: str, cells: cells, score: wScore });
    }
    if (placements.length === 7) total += 50; // kaikki 7 palaa = bonus

    return { ok: true, score: total, words: wordInfos, dir: (dr === 0 ? "H" : "V") };
  }

  // ---- Ristintarkistukset (AI:lle) ----------------------------------------
  // Vaakasiirroille: kullekin tyhjälle ruudulle sallitut kirjaimet (pystysana
  // pysyy laillisena) sekä pystysuoran olemassaolevan sanan pistesumma.
  var ALPHA = "abcdefghijklmnoprstuvyäö".split("");
  function crossChecks(bd, trie) {
    var allowed = [], cross = [];
    for (var r = 0; r < SIZE; r++) {
      allowed.push(new Array(SIZE));
      cross.push(new Array(SIZE).fill(0));
      for (var c = 0; c < SIZE; c++) {
        if (bd[r][c]) { allowed[r][c] = null; continue; }
        var up = "", down = "", sc = 0;
        var rr = r - 1;
        while (inb(rr, c) && bd[rr][c]) { up = bd[rr][c].l + up; sc += letterValue(bd[rr][c].l, bd[rr][c].blank); rr--; }
        rr = r + 1;
        while (inb(rr, c) && bd[rr][c]) { down += bd[rr][c].l; sc += letterValue(bd[rr][c].l, bd[rr][c].blank); rr++; }
        cross[r][c] = sc;
        if (!up && !down) { allowed[r][c] = null; continue; }
        var set = {};
        for (var a = 0; a < ALPHA.length; a++) {
          var w = up + ALPHA[a] + down;
          if (trieHas(trie, w)) set[ALPHA[a]] = true;
        }
        allowed[r][c] = set;
      }
    }
    return { allowed: allowed, cross: cross };
  }

  // ---- Siirtogeneraattori (AI) --------------------------------------------
  // Palauttaa parhaan siirron { placements, score, words } tai null.
  // Menetelmä: ankkurit + trie-laajennus (Appel–Jacobson -tyylinen). Vaaka
  // suoraan, pysty transponoimalla lauta.
  function bestMove(bd, rack, trie) {
    var best = null;
    function consider(placements) {
      if (!placements.length) return;
      var res = validateAndScore(bd, placements, trie);
      if (res.ok && (!best || res.score > best.score)) best = { placements: placements, score: res.score, words: res.words };
    }
    genOrientation(bd, rack, trie, false, consider);       // vaaka
    var tb = transpose(bd);
    genOrientation(tb, rack, trie, true, function (pl) {
      // transponoi takaisin
      consider(pl.map(function (p) { return { r: p.c, c: p.r, l: p.l, blank: p.blank }; }));
    });
    return best;
  }

  function transpose(bd) {
    var t = emptyBoard();
    for (var r = 0; r < SIZE; r++) for (var c = 0; c < SIZE; c++) t[c][r] = bd[r][c];
    return t;
  }

  // Generoi vaakasiirrot annetulle laudalle (transponoituna kutsuja hoitaa pystyn).
  function genOrientation(bd, rack, trie, transposed, emit) {
    var cc = crossChecks(bd, trie);
    var allowed = cc.allowed;
    var empty = isEmptyBoard(bd);

    for (var r = 0; r < SIZE; r++) {
      // ankkurit rivillä
      var anchors = [];
      if (empty) { if (r === 7) anchors = [7]; }
      else {
        for (var c = 0; c < SIZE; c++) {
          if (bd[r][c]) continue;
          if ((inb(r, c - 1) && bd[r][c - 1]) || (inb(r, c + 1) && bd[r][c + 1]) ||
              (inb(r - 1, c) && bd[r - 1][c]) || (inb(r + 1, c) && bd[r + 1][c])) anchors.push(c);
        }
      }
      for (var ai = 0; ai < anchors.length; ai++) {
        var anchor = anchors[ai];
        // jos vasemmalla on jo pala, vasen osa on kiinteä
        if (inb(r, anchor - 1) && bd[r][anchor - 1]) {
          var pre = collectWord(bd, r, anchor - 1, 0, 1); // vasemman sanan solut
          var preStr = pre.map(function (p) { return bd[p[0]][p[1]].l; }).join("");
          var node = walk(trie, preStr);
          if (node) extendRight(bd, r, anchor, node, rack.slice(), [], allowed, r, anchor, emit, trie, preStr);
        } else {
          // laske vapaa tila vasemmalle (ei ohita toista ankkuria)
          var limit = 0, cc2 = anchor - 1;
          while (inb(r, cc2) && !bd[r][cc2] && anchors.indexOf(cc2) < 0) { limit++; cc2--; }
          leftPart(bd, r, anchor, trie, "", trie, rack.slice(), [], limit, allowed, emit);
        }
      }
    }
  }
  function walk(node, str) {
    for (var i = 0; i < str.length; i++) { node = node.c[str[i]]; if (!node) return null; }
    return node;
  }
  // rakenna vasen osa ankkurin vasemmalle (tyhjiin ruutuihin), sitten laajenna oikealle
  function leftPart(bd, r, anchor, root, partial, node, rack, placed, limit, allowed, emit) {
    extendRight(bd, r, anchor, node, rack, placed, allowed, r, anchor, emit, root, partial);
    if (limit <= 0) return;
    for (var i = 0; i < rack.length; i++) {
      var tile = rack[i];
      var letters = tile === "?" ? ALPHA : [tile];
      for (var li = 0; li < letters.length; li++) {
        var L = letters[li];
        var child = node.c[L];
        if (!child) continue;
        var col = anchor - partial.length - 1;
        if (!inb(r, col)) continue;
        var nr = rack.slice(); nr.splice(i, 1);
        var np = placed.concat([{ r: r, c: col, l: L, blank: tile === "?" }]);
        leftPart(bd, r, anchor, root, partial + L, child, nr, np, limit - 1, allowed, emit);
      }
    }
  }
  // laajenna oikealle ankkurista alkaen
  function extendRight(bd, r, col, node, rack, placed, allowed, aRow, aCol, emit, root, wordSoFar) {
    if (!inb(r, col)) {
      if (node.w && placed.length) emit(placed);
      return;
    }
    if (bd[r][col]) {
      var L = bd[r][col].l;
      var child = node.c[L];
      if (child) {
        if (child.w && placed.length && !(inb(r, col + 1) && bd[r][col + 1]))
          maybeEmit(bd, r, col, child, placed, emit);
        extendRight(bd, r, col + 1, child, rack, placed, allowed, aRow, aCol, emit, root, wordSoFar + L);
      }
      return;
    }
    // tyhjä ruutu: kokeile rackin paloja
    for (var i = 0; i < rack.length; i++) {
      var tile = rack[i];
      var letters = tile === "?" ? ALPHA : [tile];
      for (var lj = 0; lj < letters.length; lj++) {
        var Lx = letters[lj];
        var childx = node.c[Lx];
        if (!childx) continue;
        var allow = allowed[r][col];
        if (allow && !allow[Lx]) continue; // ristisana ei kelpaa
        var nr = rack.slice(); nr.splice(i, 1);
        var np = placed.concat([{ r: r, c: col, l: Lx, blank: tile === "?" }]);
        if (childx.w && np.length && !(inb(r, col + 1) && bd[r][col + 1])) emit(np);
        extendRight(bd, r, col + 1, childx, nr, np, allowed, aRow, aCol, emit, root, (wordSoFar || "") + Lx);
      }
    }
  }
  function maybeEmit(bd, r, col, node, placed, emit) { if (placed.length) emit(placed); }

  var API = {
    SIZE: SIZE,
    makeRNG: makeRNG, shuffle: shuffle,
    TILE_BAG: TILE_BAG, VALUES: VALUES, letterValue: letterValue, buildBag: buildBag,
    PREMIUM: PREMIUM, premiumAt: premiumAt, letterMult: letterMult, wordMult: wordMult,
    buildTrie: buildTrie, trieHas: trieHas,
    emptyBoard: emptyBoard, isEmptyBoard: isEmptyBoard, cloneBoard: cloneBoard,
    validateAndScore: validateAndScore, bestMove: bestMove, crossChecks: crossChecks,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.SanapalatEngine = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
