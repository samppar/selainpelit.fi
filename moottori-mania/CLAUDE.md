# Moottori-Mania (pelit/moottori-mania)

Elasto Mania -henkinen ajopeli yhtenä HTML-tiedostona. Fysiikka on portattu virallisesta
lähdekoodista (github.com/elastomania/across, CC BY-NC-SA 4.0), joten **fysiikkaan ei kosketa**
ilman erittäin hyvää syytä — kaikki säätö tehdään kenttägeometriaan tai bottiin.

## Rakenne

```
index.html              koko peli (2 <script>-lohkoa: script0 = fysiikka+logiikka+valikko+DEMOS,
                        script1 = piirto + tick)
tools/bot.js            testibotti: ajaa kentät ilman ihmistä
tools/trace.js          sama botti + kuolinruutujen ja lentoratojen tulostus
tools/embed.js          nauhoittaa demot ja upottaa ne HTML:n DEMOS-vakioon
tools/verify.js         toistaa upotetut demot ja tarkistaa että ne yhä vievät maaliin
```

## Työnkulku

```bash
node tools/bot.js                  # regressio: kaikki 10 kenttää
node tools/bot.js 7                # yksi kenttä (indeksi 7 = K8), budjetti automaattinen
node tools/bot.js 7 700            # oma sekuntibudjetti
node tools/trace.js 7              # kuolemaa edeltävät 24 ruutua
node tools/trace.js 8 --arc 3000 5000   # lentorata x-väliltä (kaarien mittaus)
node tools/embed.js && node tools/verify.js   # demot talteen ja tarkistus (pitää olla 10/10)
```

Geometriamuutoksen jälkeen **aina**: `node tools/bot.js` → `node tools/embed.js` → `node tools/verify.js`.
Vanhat demot eivät kelpaa muuttuneelle kentälle.

## Tavoitetila

Kaikki 10 kenttää läpi nollalla kuolemalla ja alle 60 sekunnissa. Nykyiset ajat:
K1 23,8 · K2 33,2 · K3 58,0 · K4 17,7 · K5 12,6 · K6 19,8 · K7 20,8 · K8 27,0 · K9 23,1 · K10 26,6.

## Tärkein sääntö: älä väännä bottia kentän puolesta

**Jos samassa pisteessä on yli 5 kuolemaa, vika on kentässä, ei botissa.** Tämä sääntö ratkaisi
neljä umpisolmua, joissa botin viilaus oli jo kierteessä:

- K6:n ahtain kohta oli 90 px kun pyörän kova minimi on ~100 px → geometrisesti mahdoton (72 kuolemaa).
- K8:ssa 96 kuolemaa pisteessä 4153 ei johtunut saaresta vaan **pergolalaatan päädystä lentoradalla**.
- K9 karkasi äärettömyyteen, koska painovoiman palautusomena jäi mitatun kaaren ohi.
- K3 hukkasi 24 s yhteen kohtaan: omena leijui 55 px ulottumattomissa ja botti hakkasi edestakaisin.

## Mitattua fysiikkaa (älä arvaa näitä uudelleen)

- `G=10`, `DT=0.003`, 6 askelta/ruutu, `SCALE=34` px/yksikkö.
- `VOLT_IMP=12.0`, `VOLT_RETURN=3.0`, `VOLT_HOLD=0.4`. **Voltit ovat jousipalautteisia:** yksi voltti
  antaa av +5…+9, mutta jousi vetää takaisin ~6 ruudussa ja jäähdytys on 0,4 s. Ilmarotaatiota **ei**
  voi korjata volteilla → lento-ongelmat ratkaistaan laukaisugeometrialla, ei botin voltituksella.
- Kyykkyaukon kova minimi ~100 px (pyörän korkeus 65–72 px; 62 px aukko tappoi päähän).
- `angDeg = atan2(w4.y-w2.y, w4.x-w2.x) * 57.3`. `stepFrame`-syöte: `{gas,brake,voltL,voltR}`.
  `voltR` = nokka alas, kun `dir=1`.

## Toimivat kenttäsuunnittelun työkalut

- **Pergola** (kattolaatta ajolinjan yllä): pakottaa botin vauhdin. Vapaa korkeus < 3,9 u → vCap 11,
  < 2,3 u → 6. Varo: laatan **pääty** on este — pidä se pois lentoradalta.
- **Kicker + pergola-cap** yhdessä → toistettava laukaisunopeus ja -kulma.
- **Pyyntiluiska**: laskeutumisramppi lentoradan tangenttiin. Nouseva reuna laskevalle radalle = endo.
- **Progressiivinen kaarikuppi** 11°→68° pysäyttää vauhdin turvallisesti (sakkaus ≤60° vyöhykkeellä,
  syöttö ≤14, korkeus ≥ v²/2g).
- **Pyöristetyt kumpuharjat** (4 segmenttiä) eivät sinkoa pyörää.
- Heilurikuoppa **ei** toimi kääntöpisteenä. Terävät pyyntikiilat kaatavat pyörän — tasainen käytävä
  on anteeksiantavampi.

## Botin säännöt ja miksi ne ovat siellä

Jokainen näistä syntyi konkreettisesta kuolemasta — älä poista ilman regressiota:

1. **Jarru vain takarenkaalla.** Etupyöräjarru = endo. Sääntö on globaali: `inp.brake` perutaan,
   jos vain etupyörä koskettaa. Endo löytyi kolmesta eri mekanismista (kääntö-, kattotutka-, steepFar-jarru).
2. **Kattotutka v3.** Per luotain kerätään kaikki reunaylitykset; ajopinta = korkein reuna ≤ pyörä+0,5,
   katto = pienin sen yllä. v1 mittasi maasta (osui leijuvan saaren alapintaan), v2 luki mäenrinteet katoksi.
3. **Rinnesuhteellinen wheelie-esto** (`rel = (a - slopeA) * dir`, rajat 40/60) **plus absoluuttinen
   katto 62°/80°** — pelkkä suhteellinen sääntö piti 45° nokkanostoa 20° mäessä "vain 25 asteena"
   eikä katkaissut kaasua, ja pyörä kiepsahti selälleen.
4. **Kiepsahduksen esto**: etupyörä irti + nokka nousee (rel > 34) → kaasu pois ja nokka alas.
5. Wheelie-, hätänokka- ja etukenosäännöt **vain maakosketuksella** — ilmassa ne sotkivat K5:n lennon.
6. **g3/g7-luotaimet lähtevät y+9:stä** (ei y+2). Matalalta 55° ylämäki luki valejyrkänteenä ja botti
   jarrutti keskellä nousua.
7. **Tahallinen droppi sallittu**: jyrkännejarru ohitetaan kun kohde on ≥8 yksikköä alempana.
8. **Peräkenobias** (`vy<-9 → target+=18`) vain loivalle pinnalle (`target>-8`). Jyrkällä
   pyyntilaskulla se aiheutti peräpää-edellä-loopin 38 vauhdissa.
9. **Mikropomppuportti**: ei ilmavoltteja kun `airT<8 && |vy|<6`.

## Testauskäytännöt, jotka säästävät tunteja

- **Determinismi on diagnoosi.** Jos tulos on täsmälleen sama muokkauksen jälkeen (sama kuolinpaikka,
  sama lukumäärä), muutettu koodipolku ei suoritu kyseisellä radalla. Älä oleta regenerointivirhettä
  — etsi oikea syy muualta.
- **Kuolinruutudumppi ensin** (`tools/trace.js`), arvaukset vasta sitten. Se paljasti käytännössä
  joka juurisyyn: 16–24 ruutua ennen kuolemaa kertoo asennon, kontaktit ja syötteet.
- **Mittaa, älä arvaa lentoratoja**: `--arc` ja sijoita omenat/rampit mitattuihin koordinaatteihin.
- **Kohdennusansa**: botti valitsee lähimmän omenan. Väärin sijoitettu omena vetää botin pois reitiltä
  tai jumittaa sen (K3 hukkasi 24 s). Ulottumaton omena on kenttävirhe.
- Sisältötyökaluissa (python-skriptit ym.) käytä `assert old in h` ennen `str.replace` — hiljaa
  epäonnistuva korvaus on tämän projektin yleisin virhelähde.
