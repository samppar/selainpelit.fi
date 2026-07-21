# AGENTS.md — selainpelit.fi

Ohjeet **koodausagentille** koko monorepoon. Pelikohtaiset ohjeet (botit,
testit): kunkin pelin oma `AGENTS.md` / README.

**Kaikki selainpelit toteutetaan alla olevat asiat huomioiden** — sekä mitä
pelaajat arvostavat että miten pelistä tulee koukuttava (terveellä tavalla).
Tämä koskee uutta peliä, UI-muutosta ja pelin “valmiiksi” julistamista.

**Jokaisen pelin on oltava kaunis.** Toimiva mekaniikka ei riitä: ulkoasu,
typografia, värit, materiaalit ja mikroliike ovat osa “valmis”-kriteeriä.
Rumaa, geneeristä tai keskeneräisen näköistä UI:ta ei julisteta valmiiksi.

---

## 1. Mitä pelaajat arvostavat

Pelimekaniikka ja tekoäly saavat olla monimutkaisia; **pelaajan näkymän** on
silti täytettävä nämä vaatimukset.

### Tutkimus (tiivis)

| Lähde | Keskeinen väite |
|-------|-----------------|
| **SDT** — Ryan, Rigby & Przybylski (2006/2010) | Nautinto ja sitoutuminen riippuvat *competence*, *autonomy*, *relatedness* -tarpeiden täyttymisestä |
| **MDA** — Hunicke, LeBlanc & Zubek | Kilpailussa tarvitaan selvä voittotavoite ja palaute kuka voittaa |
| **PXI** — Abeele ym. | Funktionaaliset: goals clarity, progress feedback, challenge, ease of control, audiovisual appeal |
| **Kortti-/lautapeli-HCI** (esim. GNNetic) | Laillisten siirtojen korostus vähentää virheitä ja kognitiivista kuormaa |
| **Reiluus** (pelitutkimukset) | Liian vaikea / epäoikeudenmukainen haaste heikentää kokemusta |

### Vaatimukset

1. **Goals clarity** — voitto-/häviötavoite näkyy yhdellä silmäyksellä ilman
   erillistä “lue säännöt ensin” -pakkoa.
2. **Progress feedback** — pelaaja näkee jatkuvasti missä mennään (pisteet,
   vuoro, edistyminen kohti voittoa).
3. **Ease of control** — lailliset siirrot erottuvat selvästi; laittomat eivät
   näytä klikattavilta / on himmennetty.
4. **Autonomy** — säännöt ja asetukset saatavilla, mutta älä pakota pitkää
   valintaporttia ennen kuin peli alkaa (pääsy lautaan/pöytään nopeasti).
5. **Competence / mastery** — merkitsevä palaute siirron ja erän/jaon jälkeen
   (onnistui / epäonnistui / tilanne muuttui), ei vain hiljaista pistelaskua.
6. **Relatedness** (jos joukkue- tai vastustajarakenne) — kuka on puolellasi /
   ketä vastaan, visuaalisesti selvästi.
7. **Challenge / fairness** — oletusvaikeus on kohtuullinen uudelle pelaajalle;
   kovempi taso valittavissa, ei pakotettu heti.
8. **Audiovisual appeal / kauneus** — yksi selkeä, viimeistelty visuaalinen
   kieli (ei “default dashboard”); palaute (korostus, lyhyt toast/animaatio)
   tukee ymmärrystä. Peli näyttää ja tuntuu *haluttavalta* pelata, ei vain
   toimivalta.

---

## 2. Miten pelistä saadaan koukuttava (tutkimus → design)

Tavoite: **haluaa pelata uudelleen** (harmonious passion / “want to”), ei
pakkoa (obsessive passion / “have to”). Katso Przybylski, Weinstein, Ryan &
Rigby (2009): tarvetäyttö → terve intohimo ja nautinto; tarvevaje → pakonomainen
pelaaminen, enemmän tunteja mutta vähemmän nautintoa.

### Tutkimus (tiivis)

| Mekanismi | Lähde / idea | Mitä se tarkoittaa pelissä |
|-----------|--------------|----------------------------|
| **Flow** | Csikszentmihalyi | Selvä tavoite + välitön palaute + haaste≈taito → “zone”; aika katoaa luonnollisesti |
| **Vaihteleva vahvistus** | Skinner (variable-ratio); pelitutkimukset | Epävarmat mutta reilut lopputulokset pitävät jännitteen (seuraava jako / veto voi kääntyä) |
| **Wanting vs liking** | Berridge & Robinson | Dopamiini ajaa *odotusta* (“entä seuraava?”), ei pelkkää mielihyvää — hyödynnä jännitystä, älä tyhjää grindia |
| **Lyhyt silmukka** | Compulsion / engagement loop -kirjallisuus | Toiminta → palaute → selvä seuraava teko, ilman pitkiä tyhjiä välejä |
| **Curiosity / discovery** | MDA Discovery; PXI Curiosity | Uusi tieto, uudet tilanteet, “mitä jos…” pitää kiinnostuksen |
| **Near-win / dramatiikka** | Pelipsykologia | Melkein-voitto tai käänne lisää emotionaalista panosta — kun se syntyy säännöistä, ei huijauksesta |

### Mitä toteutetaan (koukuttavuus selainpeleissä)

1. **Nopea ensimmäinen silmukka** — alle muutamassa sekunnissa pelaaja tekee
   merkityksellisen valinnan ja saa palautteen (kortti, siirto, tulos).
2. **Flow-ehdot** — tavoite näkyvissä, palaute heti, vaikeus skaalautuu tai on
   valittavissa niin että haaste pysyy “hiukan vaikeana, ei toivottomana”.
3. **Luonnollinen epävarmuus** — korttien jako, laudan avautuminen, vastustajan
   siirto: jännite syntyy pelistä itsestään. Pelaaja *haluaa* nähdä seuraavan
   jaon / erän.
4. **Selvä “vielä yksi”** — erän/jaon lopussa näkyy miksi jatkaa (nousu,
   kosto-pudotus, ennätys, uusi haaste), ja seuraava erä on yksi klikkaus.
5. **Pienet voitot matkalla** — tikki, sana, onnistunut puolustus: mikrovoitot
   ennen lopullista otteluvoittoa pitävät competence-tunteen elossa.
6. **Cliffhanger ilman manipulointia** — tilanne voi kääntyä (esim. nousu vs
   pudotus); korosta dramaa UI:ssa, älä peukaloi RNG:tä pelaajan kostoksi.
7. **Curiosity** — paljasta tietoa vähitellen (säännöt valinnaisesti, syvemmät
   työkalut auki pelatessa), älä dumppaa kaikkea etukäteen.

### Mitä EI tehdä (pimeät kuviot)

Nämä tekevät peleistä “koukuttavia” laboratoriossa / F2P-tutkimuksessa, mutta
**eivät kuulu selainpelit.fi-peleihin**:

- Loot boxit, gacha, rahapanokset, “pity”-myllyt
- Pakotetut daily login / keinotekoinen nälkä (energy gate vain retenioon)
- FOMO-ajastimet ja tekaistu niukkuus ilman pelillistä syytä
- Tahallinen near-miss -huijaus (näytä “melkein” vaikka tulos oli lukittu)
- Harhaanjohtava vaikeus tai pay-to-win

Ero: **koukuttavuus = vahva halu jatkaa koska peli palkitsee taidon, jännitteen
ja edistymisen**; ei siksi että ulkoinen palkinto / rangaistus pakottaa.

---

## 3. Älä tee (yhteenveto)

- Piilota voittoehto tai tilanne “edistyneisiin” paneeleihin.
- Aloita heti maksimivaikeudella ilman valintaa.
- Jätä lailliset siirrot epäselviksi.
- Korvaa UX-laatu bottivahvuustesteillä — ne mittaavat AI:ta, ei pelaajakokemusta.
- Rakenna reteniota pimeillä kuvioilla (yllä).
- Julkaise / julista valmiiksi ruma, geneerinen tai “väliaikainen” UI — jokaisen
  pelin on oltava kaunis.

---

## 4. Agentin testausvastuu (pakollinen)

**Pelin / muutoksen “valmis” ei tarkoita “koodi kirjoitettu”.** Agentti vastaa
siitä, että peli toimii — ei jätä laillisuus-, regressio- tai UI-rikkeitä
ihmisen korjattavaksi.

### Miten pelejä testataan tässä monorepossa

| Kerros | Mitä | Miten |
|--------|------|--------|
| **Ydin** | Säännöt, validointi, AI, pisteytys | Puhdas Node-JS ilman DOM:ia (`src/engine.js` tms.). `npm test` → `node test/run_tests.js` |
| **Build** | Yksi itsenäinen `index.html` | `npm run build` (ei kaadu; generoitu tiedosto aukeaa) |
| **CI** | Automaatti PR/pushilla | `.github/workflows/test.yml` — lisää uusi peli matrixiin |
| **Selain** | Näkymä, klikit, vuoro, overlayt | Agentti ajaa paikallisen `http.server`in ja smoke-testaa selaimella (Playwright / IDE-browser) |

Malli: `sanapalat/`, `sanaseppa/`, `sanasato/` — ydin testattavissa Nodella,
UI erikseen. Botiarenat (`tuppi/`, `hertta/`): omat vahvuus-/turnausajurit
pelikohtaisissa `AGENTS.md`-tiedostoissa.

### Agentin velvollisuudet ennen “valmis”

1. **Kirjoita / päivitä `npm test`** kattamaan uudet säännöt ja regressiot.
2. **Aja testit itse** ja korjaa kunnes vihreä — älä jätä punaista ihmiselle.
3. **Aja build** jos peli niputetaan (`npm run build`).
4. **Selain-smoke** uudelle tai UI-muutetulle pelille: avaa sivu, aloita peli,
   tee yksi merkityksellinen siirto, varmista ettei kaadu / lukitu.
5. **Katso ulkoasu silmällä** (kuvakaappaus tarvittaessa): onko peli kaunis ja
   yhtenäinen, vai geneerinen/ruma? Korjaa ennen “valmis”.
6. **Älä väitä valmiiksi** jos testit, build, smoke tai ulkoasu pettää.

Ihmisen tehtävä on pelata ja antaa tuote-/sääntöpalautetta — ei olla
agentin QA-varmistusverkko.

---

## 5. Itsetarkistus ennen “valmis”

**Arvostus / selkeys**

- [ ] Uusi pelaaja ymmärtää tavoitteen ilman erillistä artikkelia.
- [ ] Lailliset toiminnot erottuvat heti.
- [ ] Tilanne / edistyminen näkyy koko ajan.
- [ ] Oletusvaikeus on reilu; säännöt valinnaisesti auki.
- [ ] Siirron ja erän jälkeen tulee lyhyt, ymmärrettävä palaute.
- [ ] Ulkoasu on kaunis ja yhtenäinen (ei geneerinen / “placeholder”).

**Koukuttavuus (terve)**

- [ ] Ensimmäinen merkityksellinen silmukka on nopea.
- [ ] Haaste≈taito (flow); ei liian helppo eikä toivoton.
- [ ] Luonnollista jännitettä / epävarmuutta (seuraava erä kiinnostaa).
- [ ] “Vielä yksi erä” on ilmeinen ja kitkaton.
- [ ] Mikrovoitot matkalla, ei vain lopputulos.
- [ ] Ei loot boxeja, energy gateja, FOMO-ajastimia eikä near-miss-huijausta.

**Testaus (agentti)**

- [ ] `npm test` vihreä (ja CI-matrix päivitetty uudelle pelille).
- [ ] Build ok jos niputuspelissä.
- [ ] Selain-smoke tehty; löydetyt bugit korjattu.
- [ ] Ulkoasu tarkistettu silmällä; kauneusvaatimus täyttyy.
