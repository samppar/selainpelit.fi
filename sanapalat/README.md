# Sanapalat

Suomenkielinen palanladontapeli tietokonetta vastaan. Ladö kirjainpaloja
15×15-laudalle ja muodosta sanoja — jokainen uusi sana pisteytetään bonusruutuineen.
Sukua tunnetuille laattapeleille, mutta oma laudan bonusasettelu, oma suomalainen
palasarja ja täysin selaimessa toimiva vastustaja-AI.

Peli on **yksi itsenäinen `index.html`** — ei palvelinta, ei riippuvuuksia,
toimii myös offline.

## Pelaaminen

Avaa `index.html` selaimessa. Tai kehittäessä:

```bash
python3 -m http.server 8732
# http://localhost:8732/index.html
```

### Säännöt lyhyesti

- Valitse pala telineestä ja klikkaa ruutua laudalla. Klikkaa asetettua palaa
  palauttaaksesi sen telineeseen.
- **Aloitussana** kulkee keskiruudun (★) kautta — keskiruutu on **2× sana**.
- Uusien sanojen on liityttävä laudalla oleviin paloihin, ja kaikkien
  syntyvien sivusanojen on oltava kelvollisia.
- Bonusruudut (vain uusille paloille): **2×K / 3×K** kirjain, **2×S / 3×S** sana.
- Kaikkien 7 palan pelaaminen kerralla antaa **+50 bonuksen**.
- Jokeri (tyhjä pala) on 0 pistettä ja edustaa mitä tahansa kirjainta.
- Voit **vaihtaa** paloja tai **ohittaa** vuoron. Peli päättyy, kun pussi on
  tyhjä ja jommankumman teline tyhjenee; jäljelle jääneiden palojen arvot
  vähennetään pisteistä.

## Palasarja

100 palaa: 98 kirjainta + 2 jokeria. Määrät ja arvot on viritetty suomen
kielen kirjainfrekvenssien mukaan (paljon `A/I/T/N/E`, harvinaiset `B/F/G`
korkea-arvoisia).

## Tekninen rakenne

```
sanapalat/
├── src/
│   ├── engine.js   # ydin: RNG, palasarja, bonuslauta, validointi+pisteytys, trie, AI
│   ├── game.js     # selainlogiikka: teline, palojen asettelu, vuorot, overlayt
│   └── style.css   # ulkoasu
├── test/
│   └── run_tests.js
├── build.js        # niputtaa osat + upottaa sanaston yhdeksi index.html:ksi
└── index.html      # generoitu, itsenäinen peli
```

Ydin (`engine.js`) on puhdasta, Nodella ajettavaa JavaScriptiä, joten se on
testattavissa ilman selainta.

### Sanasto

Sanasto **jaetaan** `sanasato`-pelin kanssa: `build.js` lukee
`../sanasato/sanat.txt` (Kotuksen *Nykysuomen sanalista*, ~95 700 sanaa) ja
upottaa sen `index.html`:ään. Erillistä kopiota ei pidetä.

### Vastustaja-AI

Siirtogeneraattori perustuu Appel–Jacobson-algoritmiin: ankkuriruudut,
kohtisuorien sanojen ristintarkistukset (cross-checks) ja trie-pohjainen
laajennus. AI valitsee ahneesti korkeimman pistemäärän siirron ja pelaa
tyypillisesti alle 10 ms:ssä.

## Kehitys

```bash
npm test     # ydintestit (node test/run_tests.js)
npm run build  # generoi index.html
```
