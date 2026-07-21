// Sanasato — pelin puhdas ydin (ei DOM:ia).
//
// Sama tiedosto ajetaan sekä selaimessa (build.js upottaa tämän index.html:ään)
// että Nodessa (test/run_tests.js require:aa sen). Tästä syystä lopussa on pieni
// UMD-häntä: funktiot tarjotaan global.SanasatoEngine-oliona ja module.exports:na.
//
// Ydin sisältää: siemenellinen RNG, ruudukon arvonta suomen kirjaintaajuuksilla,
// naapuruus (8-suuntainen), sanapolun tarkistus, trie sanastolle ja ratkaisija
// joka löytää ruudukon kaikki sanaston sanat (loppuruudun "läheltä piti" -tietoa
// varten).

(function (root) {
  "use strict";

  // ---- Siemenellinen RNG (mulberry32) -------------------------------------
  // Deterministinen: sama siemen -> sama pelilauta. Päivän pulma nojaa tähän.
  function makeRNG(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- Kirjainjakauma ------------------------------------------------------
  // Painot johdettu sanaston kirjaintaajuuksista. Harvinaiset (c, w, z, x, q, å)
  // jätetään pois, jotta lautaan ei synny "kuolleita" ruutuja. Vokaalit ja
  // konsonantit erikseen, jotta voidaan taata suomelle riittävä vokaalisuhde.
  var VOWELS = [
    ["a", 11.5], ["i", 11.5], ["e", 6.7], ["u", 6.6],
    ["o", 5.5], ["ä", 3.2], ["y", 2.2], ["ö", 0.9],
  ];
  var CONSONANTS = [
    ["t", 8.5], ["s", 7.3], ["k", 6.6], ["n", 6.3], ["l", 5.8],
    ["r", 4.0], ["p", 3.1], ["m", 3.0], ["v", 2.4], ["h", 2.2],
    ["j", 1.3], ["d", 0.9], ["g", 0.3],
  ];
  var VOWEL_SET = new Set(VOWELS.map(function (x) { return x[0]; }));

  function weightedPicker(pairs) {
    var total = pairs.reduce(function (s, p) { return s + p[1]; }, 0);
    var cum = [];
    var acc = 0;
    for (var i = 0; i < pairs.length; i++) { acc += pairs[i][1]; cum.push(acc); }
    return function (rng) {
      var r = rng() * total;
      for (var i = 0; i < cum.length; i++) if (r < cum[i]) return pairs[i][0];
      return pairs[pairs.length - 1][0];
    };
  }
  var pickVowel = weightedPicker(VOWELS);
  var pickConsonant = weightedPicker(CONSONANTS);

  // Fisher–Yates siemenellisellä RNG:llä.
  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // Yksi lauta: n*n kirjainta. ~44 % vokaaleja (pientä satunnaisvaihtelua),
  // loput konsonantteja, ja sijainnit sekoitetaan.
  function rawBoard(size, rng) {
    var cells = size * size;
    var vowelCount = Math.round(cells * (0.42 + rng() * 0.06));
    var letters = [];
    for (var i = 0; i < vowelCount; i++) letters.push(pickVowel(rng));
    for (var j = vowelCount; j < cells; j++) letters.push(pickConsonant(rng));
    return shuffle(letters, rng);
  }

  // ---- Naapuruus (8-suuntainen) -------------------------------------------
  function neighborTable(size) {
    var tbl = [];
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        var list = [];
        for (var dr = -1; dr <= 1; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            var nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size) list.push(nr * size + nc);
          }
        }
        tbl.push(list);
      }
    }
    return tbl;
  }

  function isAdjacent(a, b, size) {
    var ra = (a / size) | 0, ca = a % size;
    var rb = (b / size) | 0, cb = b % size;
    var dr = Math.abs(ra - rb), dc = Math.abs(ca - cb);
    return (dr <= 1 && dc <= 1) && !(dr === 0 && dc === 0);
  }

  // Polku (ruutuindeksit) laillinen: peräkkäiset naapureita, ei ruutua kahdesti.
  function isValidPath(path, size) {
    if (!path || path.length === 0) return false;
    var seen = new Set();
    for (var i = 0; i < path.length; i++) {
      if (seen.has(path[i])) return false;
      seen.add(path[i]);
      if (i > 0 && !isAdjacent(path[i - 1], path[i], size)) return false;
    }
    return true;
  }

  function pathWord(path, board) {
    var w = "";
    for (var i = 0; i < path.length; i++) w += board[path[i]];
    return w;
  }

  // ---- Pisteytys (Boggle-tyylinen, sanan pituuden mukaan) ------------------
  function scoreWord(word) {
    var n = word.length;
    if (n < 3) return 0;
    if (n <= 4) return 1;
    if (n === 5) return 2;
    if (n === 6) return 3;
    if (n === 7) return 5;
    return 11; // 8+
  }

  // ---- Trie sanastolle -----------------------------------------------------
  // Solmu: { c: { kirjain: solmu }, w: true jos sanan loppu }. Käytetään sekä
  // etuliitekarsintaan (ratkaisija) että käyttäjän sanan tarkistukseen.
  function buildTrie(words) {
    var root = { c: {} };
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (w.length < 3) continue;
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
    for (var i = 0; i < word.length; i++) {
      node = node.c[word[i]];
      if (!node) return false;
    }
    return !!node.w;
  }

  // ---- Ratkaisija: kaikki laudalta löytyvät sanaston sanat -----------------
  // Palauttaa Map<sana, polku>. Käytetään lautojen laadun varmistukseen ja
  // loppuruudun "montako sanaa oli mahdollista löytää" -tietoon.
  function solve(board, size, trie, opts) {
    opts = opts || {};
    var minLen = opts.minLen || 3;
    var nbr = neighborTable(size);
    var found = new Map();
    var visited = new Uint8Array(board.length);

    function dfs(idx, node, path, word) {
      var next = node.c[board[idx]];
      if (!next) return;
      visited[idx] = 1;
      path.push(idx);
      word += board[idx];
      if (next.w && word.length >= minLen && !found.has(word)) {
        found.set(word, path.slice());
      }
      var list = nbr[idx];
      for (var i = 0; i < list.length; i++) {
        var ni = list[i];
        if (!visited[ni]) dfs(ni, next, path, word);
      }
      path.pop();
      visited[idx] = 0;
    }

    for (var start = 0; start < board.length; start++) {
      dfs(start, trie, [], "");
    }
    return found;
  }

  // ---- Laudan arvonta laatuvarmistuksella ----------------------------------
  // Arpoo lautoja (samasta RNG-virrasta -> deterministinen) kunnes löytyy
  // riittävän rikas lauta. Palauttaa { board, solution }.
  function generateBoard(size, trie, rng, opts) {
    opts = opts || {};
    var minWords = opts.minWords || (size <= 4 ? 24 : 70);
    var minLong = opts.minLong || 1; // väh. yksi ≥6-kirjaiminen
    var maxTries = opts.maxTries || 400;
    var best = null;
    for (var t = 0; t < maxTries; t++) {
      var board = rawBoard(size, rng);
      var sol = solve(board, size, trie, { minLen: 3 });
      var longCount = 0;
      sol.forEach(function (_p, w) { if (w.length >= 6) longCount++; });
      var cand = { board: board, solution: sol, words: sol.size, longCount: longCount };
      if (!best || sol.size > best.words) best = cand;
      if (sol.size >= minWords && longCount >= minLong) return cand;
    }
    return best; // paras yritetyistä, jos kynnys ei täyty
  }

  // Etsii laudalta laillisen polun joka kirjoittaa annetun sanan (tai null).
  // Käytetään näppäimistösyötössä: kun pelaaja kirjoittaa kirjaimia, näytetään
  // niitä vastaava polku laudalla.
  function findPath(board, size, word) {
    word = String(word).toLowerCase();
    if (!word) return null;
    var nbr = neighborTable(size);
    var visited = new Uint8Array(board.length);
    function dfs(idx, pos) {
      if (board[idx] !== word[pos]) return null;
      visited[idx] = 1;
      if (pos === word.length - 1) { visited[idx] = 0; return [idx]; }
      var list = nbr[idx];
      for (var i = 0; i < list.length; i++) {
        var ni = list[i];
        if (!visited[ni]) {
          var r = dfs(ni, pos + 1);
          if (r) { visited[idx] = 0; return [idx].concat(r); }
        }
      }
      visited[idx] = 0;
      return null;
    }
    for (var s = 0; s < board.length; s++) {
      if (board[s] === word[0]) { var r = dfs(s, 0); if (r) return r; }
    }
    return null;
  }

  // Laudan enimmäispisteet (kaikki sanat pisteytettynä).
  function maxScore(solution) {
    var s = 0;
    solution.forEach(function (_p, w) { s += scoreWord(w); });
    return s;
  }

  var API = {
    makeRNG: makeRNG,
    neighborTable: neighborTable,
    isAdjacent: isAdjacent,
    isValidPath: isValidPath,
    pathWord: pathWord,
    scoreWord: scoreWord,
    buildTrie: buildTrie,
    trieHas: trieHas,
    solve: solve,
    findPath: findPath,
    generateBoard: generateBoard,
    maxScore: maxScore,
    shuffle: shuffle,
    rawBoard: rawBoard,
    VOWEL_SET: VOWEL_SET,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.SanasatoEngine = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
