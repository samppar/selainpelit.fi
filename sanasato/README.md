# Sanasato

Suomenkielinen sanapeli: kokoa mahdollisimman monta sanaa yhdistämällä
vierekkäisiä kirjaimia ruudukossa (myös vinottain, ei ruudun toistoa).
Pidemmät sanat tuovat enemmän pisteitä.

**Peli on itsenäinen HTML-tiedosto** (`index.html`) — sen voi avata selaimessa
ilman palvelinta. Sanasto on upotettu tiedostoon, joten peli toimii myös
verkotta.

```
open index.html          # tai kaksoisklikkaa
```

## Miksi juuri nämä ominaisuudet? (tutkimusperusta)

Peli suunniteltiin sen pohjalta, **mitä pelaajat tieteellisen kirjallisuuden
mukaan arvostavat**. Keskeiset viitekehykset: itsemääräämisteoria (SDT:
pätevyys, autonomia, yhteenkuuluvuus) ja flow-teoria.

| Mitä pelaajat arvostavat | Lähde | Toteutus Sanasadossa |
|---|---|---|
| **Pätevyys & välitön palaute** | SDT (Ryan & Deci); PENS (Ryan, Rigby & Przybylski 2006) | Jokainen sana vahvistetaan heti: vihreä välähdys, animoituvat pisteet, putkilaskuri. |
| **Selkeät tavoitteet & edistyminen (tavoitegradientti)** | Flow (Csikszentmihalyi); goal-gradient | Arvoasteikko (Aloittelija → Sanamestari) ja edistymispalkki, joka näyttää montako pistettä seuraavaan arvoon on jäljellä. |
| **Autonomia / merkitykselliset valinnat** | SDT | Pelaaja valitsee ruudukon koon (4×4 / 5×5), keston ja aikahaasteen vs. rauhallisen tilan. |
| **Sopiva haaste + vaihteleva tahti** | Baumann ym. 2016; ESA 2025 (stressinlievitys) | Aikapaine tuo virettä, kierrosten väliin jää lepo; **Rauha-tila** ilman kelloa rentoon pelailuun. |
| **Epävarmuuden hallinta & "läheltä piti"** | Mastering uncertainty (Frontiers in Psychology 2022) | Loppuruutu paljastaa kattavuus-%:n, parhaan löytösi ja **pisimmän mahdollisen sanan** — kannustaa uuteen yritykseen. |
| **Yhteenkuuluvuus / sosiaalisuus** | SDT (relatedness); ESA 2025 | **Päivän pulma** = sama lauta kaikille (deterministinen siemen) + jaettava tulos. Paikalliset ennätykset itsevertailuun. |

> Havainto kirjallisuudesta: jäykkä, jatkuva haaste–taito-tasapaino ei ole
> optimaalinen; lievä ylikuormitus ja tauot toimivat paremmin (Baumann ym.
> 2016), ja pätevyyden tunne syntyy kun on *säännöllisesti hallinnan alueella*
> (Ryan & Deci 2017). Siksi arvoasteikon kynnykset on viritetty
> saavutettaviksi ja tarjolla on sekä aikahaaste että rauhallinen tila.

## Pelin rakenne

```
src/engine.js   Puhdas ydin (RNG, laudan arvonta, naapuruus, trie, ratkaisija,
                pisteytys). Ei DOM:ia — ajetaan myös Nodessa testeissä.
src/game.js     Selainsovellus (DOM, valinta sormella/hiirellä, HUD, overlayt).
src/style.css   Tyylit.
sanat.txt       Suomen sanalista (95 719 sanaa), lähde: Kotus (CC BY 4.0).
build.js        Kokoaa osista itsenäisen index.html:n.
test/           Ytimen testit: node test/run_tests.js
tools/          make-wordlist.js — tuottaa sanat.txt Kotuksen aineistosta.
```

### Kehitys

```
node test/run_tests.js   # ytimen testit
node build.js            # kokoaa index.html:n uudelleen
```

Muokkaa lähteitä `src/`-kansiossa ja aja `node build.js`. Sekä testit että
selainpeli käyttävät samaa `engine.js`-ydintä.

## Pisteytys

Sanan pituus → pisteet: 3–4 → 1, 5 → 2, 6 → 3, 7 → 5, 8+ → 11.

## Sanasto & lisenssi

Sanat: **Kotimaisten kielten keskus (Kotus), Nykysuomen sanalista**, lisenssi
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Lista sisältää
perusmuodot; kaikkia taivutusmuotoja ei siksi hyväksytä. `sanat.txt` voidaan
tuottaa uudelleen komennolla `node tools/make-wordlist.js` (ks. tiedoston
ohjeet lähdeaineiston lataamiseen).
