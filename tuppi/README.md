# Neljän tuppi — JavaScript (Node.js)

Neljän pelaajan **tuppi** ammattilaistason tekoälyillä. Jokaisen pelaajan
tekoäly on **omassa tiedostossaan** `players/`-kansiossa, ja uuden pelaajan
voi pudottaa mukaan ilman että muuhun koodiin tarvitsee koskea. Voit siis
antaa toiselle tekoälylle tiedoston [`WRITING_A_PLAYER.md`](WRITING_A_PLAYER.md)
ja pyytää sitä kirjoittamaan oman pelaajan.

Pelkkää Node-vakiokirjastoa, ei asennettavia riippuvuuksia. Vaatii Node 18+.

## Kolme käyttötapaa, yksi lähde

Botit, bottitestit ja palvelinvapaa peli jakavat **samat** tiedostot
`players/`- ja `src/`-kansioissa:

```bash
# 1) BOTIT — pelaa/tarkkaile komentorivillä (Node)
node play.js                 # oletusottelu tuppeen asti (4 eri tekoälyä)
node play.js --deals 16      # 16 jaon turnaus
node play.js --p0 human      # pelaa itse paikassa 0

# 2) BOTTITESTIT — yhden komennon itsetesti (Node, ei palvelinta)
node eval.js --player players/myPlayer.js
npm test                     # säännöt, moottori ja vahvuushierarkia

# 3) PERUSPELI ILMAN PALVELINTA — paketoi selainpeli ja avaa se
node build.js                # tuottaa tuppi.html (botit samasta lähteestä)
#   -> avaa tuppi.html selaimessa tuplaklikkaamalla; ei palvelinta, ei npm-asennuksia
```

Kun muokkaat bottia `players/`-kansiossa, aja `node build.js` uudelleen niin
selainpeli päivittyy — komentorivi ja testit käyttävät samaa koodia heti.

## Pelaajien valinta

Paikat 0..3 istuvat myötäpäivään. **Parit istuvat vastakkain:**
joukkue 0 = paikat 0 & 2, joukkue 1 = paikat 1 & 3.

```bash
node play.js --p0 champion --p1 heuristic --p2 counting --p3 random
node play.js --p1 ./players/omaPelaaja.js     # oma tiedosto polulla
node play.js --p2 /polku/mihin/tahansa.js     # mikä tahansa ES-moduuli
```

Lyhytnimet: `champion`, `counting`, `heuristic`, `random`, `human`.
Muuten anna polku `.js`-tiedostoon, joka vie `createPlayer()`-funktion.

Valitsimet: `--seed n` (toistettava peli), `--deals n` (turnaus, muuten
pelataan tuppeen = yhtäjaksoinen nousu ≥ 52), `--max-deals n`, `--quiet`.

## Tekoälyt (vahvimmasta heikoimpaan)

| Tiedosto | Nimi | Kuvaus |
|---|---|---|
| `players/championPlayer.js`  | Mestari  | Determinoitu Monte Carlo (PIMC): arpoo vastustajien kädet voidit huomioiden ja simuloi jaon loppuun. |
| `players/countingPlayer.js`  | Laskuri  | Laskee pelatut kortit, tietää boss-kortit ja vastustajien tyhjät maat. |
| `players/heuristicPlayer.js` | Heuristi | Vankka sääntöpohjainen: ramissa halpa voitto, nolossa alitus ja sakkaus. |
| `players/randomPlayer.js`    | Satku    | Satunnainen — myös **mallipohja** uudelle pelaajalle. |
| `players/humanPlayer.js`     | Sinä     | Ihmispelaaja komentoriviltä. |

Mitattu testeissä: Heuristi voittaa Randomin selvästi, Mestari voittaa
Heuristin, ja Laskuri pelaa Heuristia tarkemmin.

## Säännöt lyhyesti

52 kortin pakka, ei valttia, 13 korttia / pelaaja. Ässä korkein, kakkonen
matalin. **Maantuntopakko:** aloitusmaata on pelattava jos sitä on; muuten
saa sakata (lyödä mitä vain). Kasan voittaa suurin aloitusmaan kortti,
voittaja aloittaa seuraavan.

**Näyttö:** jakajasta seuraava (etukäsi) aloittaa ja kierretään
myötäpäivään. Ensimmäinen "rami" tekee pelistä ramin ja hänestä ramaajan;
jos kaikki sanovat "nolo", pelataan noloa. Ramissa aloittaa ramaajaa
edeltävä pelaaja, nolossa etukäsi.

**Pisteet 7. kasasta:** 4 p / kasa yli kuuden (7.=4p … 13.=28p).
- *Rami:* yli 6 kasaa kerännyt pari voittaa. Jos vastapari ryöstää (vie itse
  yli 6), pisteet **tuplaantuvat**.
- *Nolo:* vähemmän kasoja kerännyt pari voittaa. Ei tuplausta.

**Nousu / tuppi:** vain toinen joukkue on nousulla kerrallaan. Jaon voittaja
nousee pisteillään tai jatkaa nousuaan. Jos nousulla oleva joukkue häviää
jaon, se putoaa nollaan ja tulee pöytäpeli — eikä voittaja tällöin pankkaa.
Yhtäjaksoinen nousu ≥ 52 = **tuppi**, ottelu päättyy.

**Sooli:** rami-näytön jälkeen puolustaja voi pelata **yksin** ramaajia
vastaan. Ässä on pienin, soolaaja pelaa viimeisenä, pari ei pelaa; yksi
kortti vaihdetaan parin kanssa. Soolaaja ei saa ottaa yhtään tikkiä (24p
kummallekin suuntaan). Selainpelissä voit lähteä sooliin kun vastustaja
ramaa. Kilpailevia sooli-tekoälyjä voi kirjoittaa ja mitata — ks.
[`WRITING_A_SOOLI_STRATEGY.md`](WRITING_A_SOOLI_STRATEGY.md).

## Rakenne

```
src/            pelin ydin (ei tarvitse muokata uutta pelaajaa varten)
  cards.js        maat, kortit, pakka, sekoitus/jako, RNG
  rules.js        joukkueet, maantunto, tikin voittaja, pisteytys
  views.js        pelaajille annettavat rajatut (jäädytetyt) näkymät
  player.js       TuppiPlayer — pelaajan rajapinta
  analysis.js     vapaaehtoiset apufunktiot (näkymättömät kortit, voidit…)
  engine.js       jaon kulku, näyttö, nousu/tuppi, koko ottelu
  index.js        yksi tuontipiste kaikelle julkiselle rajapinnalle
players/        yksi tiedosto per tekoäly
play.js         komentorivi­ajuri (botit vastakkain / ihminen mukana)
eval.js         yhden komennon itsetesti pelaajalle (Codex-silmukka)
build.js        niputtaja: tekee palvelinvapaan tuppi.html:n samasta lähteestä
tuppi.html      (tuotettu) itsenäinen selainpeli — avaa ilman palvelinta
dist/           (tuotettu) tuppi.bundle.cjs, jos haluat nipun erikseen
test/run_tests.js  testit
```

Uuden pelaajan tekeminen: katso [`WRITING_A_PLAYER.md`](WRITING_A_PLAYER.md).
