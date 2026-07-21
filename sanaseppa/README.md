# Sanaseppä

Suomenkielinen **sanalaattapeli**: nosta kirjainlaattoja pussista ja muodosta
niistä ristikkomaisia sanoja 15×15-laudalle. Pelaat **0–3 nimettyä
tietokonevastustajaa** vastaan (0 = harjoittelu yksin; Aapo, Bea, Cesar), joilla
on omat pelityylinsä. Keskiruudusta (★) saa kaksinkertaiset sanapisteet.

> Sanaseppä on itsenäinen suunnittelu — **ei** Scrabble eikä yhteensopiva sen
> kanssa. Sillä on oma kirjainjakauma, omat pistearvot ja oma kerroinruutujen
> asettelu.

**Peli on itsenäinen HTML-tiedosto** (`index.html`) — sen voi avata selaimessa
ilman palvelinta. Sanasto on upotettu tiedostoon, joten peli toimii verkotta.

```
open index.html          # tai kaksoisklikkaa
```

## Pelin idea

- Aloitusnäytöstä valitset **vastustajien määrän (0–3)**, **telineen koon (5–8)** ja **tason**.
  Valinnat **muistetaan** seuraavaa kertaa varten. Pelaajat pelaavat vuorotellen:
  Sinä → vastustajat → takaisin. Jokaisella on oma teline; lauta ja pussi ovat yhteiset.
- Lauta on 15×15 ruutua. **Vain koko pelin ensimmäisen sanan** on kuljettava
  keskiruudun kautta.
- Valitse laatta telineeltä ja napauta tyhjää ruutua asettaaksesi sen. Napauta
  asetettua (vielä vahvistamatonta) laattaa palauttaaksesi sen telineeseen.
- Yhdellä vuorolla asetetut laatat menevät samalle riville tai sarakkeelle ja
  muodostavat yhtenäisen sanan. Myöhemmät sanat koskettavat laudalla olevia
  laattoja, ja kaikkien muodostuvien sanojen (myös ristiin) on löydyttävä
  sanalistasta.
- **Kerroinruudut:** 2×K / 3×K kaksin-/kolminkertaistavat yhden kirjaimen,
  2×S / 3×S koko sanan. Kerroin pätee vain kun laatta juuri asetetaan.
- **Koko teline** kerralla (kaikki laatat) tuo **+50** bonuspistettä.
- **Tyhjä laatta** on mikä tahansa kirjain (0 pistettä).
- **Vihje** paljastaa telineesi parhaan siirron. **Vaihda** palauttaa valitut
  laatat pussiin ja nostaa uudet. **Ohita** luovuttaa vuoron.
- Peli päättyy, kun pussi on tyhjä ja jonkun teline tyhjenee, **tai** kun kukaan
  ei etene (2 × pelaajamäärä pisteetöntä vuoroa peräkkäin). Jäljelle jääneiden
  laattojen arvo vähennetään pisteistä, ja ulos päässyt saa muiden jäännökset.
  Loppunäyttö asettaa pelaajat paremmuusjärjestykseen; **Sama asetus** aloittaa
  heti uudelleen samoilla valinnoilla.

Näppäimistö (**kirjoitusasettelu**): nuolet siirtävät kursoria ja lukitsevat
suunnan (oletus →). Kirjoita sana — jokainen kirjain asettaa laatan ja etenee
(hyppää vahvistettujen yli). **Askelpalautin** peruu, **Enter** pelaa, **Esc**
tyhjentää. Tyhjä: **.** + kirjain. **F1–F5** = Vihje / Palauta / Sekoita /
Vaihda / Ohita (`?` = Vihje). Aloitusnäytössä **0**/1/2/3 vastustajat, **5–8** teline,
nuolet, Tab/Enter.

## Miksi juuri nämä ominaisuudet? (tutkimusperusta)

Peli suunniteltiin sen pohjalta, **mitä pelaajat tieteellisen kirjallisuuden
mukaan arvostavat**. Keskeiset viitekehykset: itsemääräämisteoria (SDT:
pätevyys, autonomia, yhteenkuuluvuus) ja flow-teoria.

| Mitä pelaajat arvostavat | Lähde | Toteutus Sanasepässä |
|---|---|---|
| **Pätevyys & välitön palaute** | SDT (Ryan & Deci); PENS (Ryan, Rigby & Przybylski 2006) | Siirron jälkeen **statusrivin lastPlay** (sanat + pisteet), **+pisteet-animaatio**, **BINGO-juhlistus** / lähes-bingo -kuittaus, ja **nopeat, täsmälliset** varoitukset hylätystä siirrosta (syy, ei rankaisu). |
| **Autonomia / merkitykselliset valinnat** | SDT / PENS | **Vastustajat 0–3**, teline 5–8, taso; valinnat **localStorageen**. **0 = harjoittelu yksin** (stressinlievitys / ajanviete ilman painetta). |
| **Selkeät tavoitteet & tavoitegradientti** | Flow (Csikszentmihalyi); goal-gradient | Tulostaulussa **sijoitus (1./2./…)** ja **+N kärkeen / seuraavaan** — voitto tuntuu askeleen päässä. |
| **Sopiva haaste + vaihteleva tahti** | Baumann ym. 2016 (*Motivation and Emotion*) | Taso säätää AI:ta; **eri pelityylit** (Aapo/Bea/Cesar); ei kelloa; CPU-vuorojen väliin jää hengähdys. |
| **Epävarmuuden hallinta & uusinta** | Deterding ym. 2022 (*Frontiers in Psychology*, mastering uncertainty) | **Vihje**; lopussa **paras ohittamasi siirto** + etäisyys voitosta; **Sama asetus** -uusinta yhdellä napilla. |
| **Yhteenkuuluvuus / sosiaalisuus** | SDT (relatedness); ESA Essential Facts 2025 | **Nimetyt vastustajat** kevyillä luonnehdinnoilla (ei spämmiä); **jaettava tulos** asetuksineen. |
| **Motivaatioklusterit (hauskuus, ajanviete, stressinlievitys)** | ESA Essential Facts 2025 / Power of Play | Ei aikapainetta; **yksinharjoittelu**; lyhyt **ensikäynti-ohje** kirjoitusasettelulle (vähentää uuden pelaajan pätevyyden uhkaa). |
| **Intuitiiviset kontrollit → pätevyys** | PENS (Ryan ym. 2006): controls predict competence | **Kirjoitusasettelu** (nuolet + kirjaimet) + dismissable tip — hallinta tuntuu heti omalta. |

> Havainto kirjallisuudesta: jatkuva, jäykkä haaste–taito-tasapaino ei ole
> optimaalinen; dynaaminen tahti ja lievä vaihtelu tukevat flow’ta paremmin
> (Baumann ym. 2016). Pätevyys vahvistuu, kun kontrollit ovat intuitiivisia ja
> palaute selkeää (Ryan, Rigby & Przybylski 2006). Siksi Sanasepässä on sekä
> kilpailu vastustajia vastaan että rauhallinen yksinharjoittelu.

## Kirjainjakauma ja pistearvot

Pussissa on 100 laattaa (98 kirjainlaattaa + 2 tyhjää).

| Pisteet | Kirjaimet |
|---|---|
| 1 | a e i n s t |
| 2 | o u k l |
| 3 | ä r m |
| 4 | p v h y |
| 6 | j |
| 7 | d |
| 8 | g ö |
| 0 | (tyhjä) |

## Pelin rakenne

```
src/engine.js   Puhdas ydin (pussi, kerroinlauta, trie, siirron validointi +
                pisteytys, tekoälyn siirtogeneraattori). Ei DOM:ia — ajetaan
                myös Nodessa testeissä.
src/game.js     Selainsovellus (DOM, laattojen asettelu, vuorot, tietokone).
src/style.css   Tyylit.
sanat.txt       Suomen sanalista (95 719 sanaa), lähde: Kotus (CC BY 4.0).
build.js        Kokoaa osista itsenäisen index.html:n.
test/           Ytimen testit: node test/run_tests.js
```

### Kehitys

```
node test/run_tests.js   # ytimen testit
node build.js            # kokoaa index.html:n uudelleen
```

Muokkaa lähteitä `src/`-kansiossa ja aja `node build.js`. Sekä testit että
selainpeli käyttävät samaa `engine.js`-ydintä.

### Tekoäly

Tietokone käyttää ankkuripohjaista siirtogeneraattoria (ristikkotarkistus +
trie), joka listaa kaikki lailliset siirrot ja pisteyttää ne. Taso valitaan
aloitusnäytöstä: **helppo** pelaa heikomman siirron, **normaali** hyvän ja
**kova** lähes parhaan. Lisäksi kullakin vastustajalla on **oma pelityyli**, joka
säätää siirtovalintaa: **Aapo** pelaa varman päälle, **Bea** suosii pitkiä sanoja
ja **Cesar** ottaa riskejä (suurempi hajonta).

## Sanasto & lisenssi

Sanat: **Kotimaisten kielten keskus (Kotus), Nykysuomen sanalista**, lisenssi
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Lista sisältää
perusmuodot; kaikkia taivutusmuotoja ei siksi hyväksytä.
