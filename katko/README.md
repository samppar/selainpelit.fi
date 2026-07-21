# Katko

Perinteinen suomalainen tikkipeli (a.k.a. "viimeinen tikki") selaimessa: sinä kolmea
tekoälyä vastaan. Vain viimeinen tikki tuottaa pisteen; kakkossäännöllä viimeisen
tikin voittaminen kakkosella tuo kaksi.

## Rakenne

```
engine.js           Puhdas pelimoottori: säännöt, pakka, siemennettävä RNG,
                    turvakääre (safeChoose) ja synkroninen playDeal. EI DOM:ia,
                    ei ajastimia — sama koodi ajaa selaimen ja Node-harnessin.
index.html          Käyttöliittymä + animaatio. Tuo säännöt engine.js:stä ja
                    tekoälyt agents/-moduuleina.
tournament.mjs      Päätön turnaus: neljä agenttia, tuhansia siemennettyjä jakoja,
                    voitto-% ja pisteet per agentti.
eval.js             Yksittäisen agentin itsetesti (laillisuus / vahvuus / nopeus),
                    paluukoodilla — sopii tekoälyn edit-run-silmukkaan.
agents/
  base.js           Jaettu perusta: Agent-rajapinta, kortinlaskenta, perusstrategia,
                    kakkoslopetuksen tunnistus.
  aino.js           Aino  — Rohkea:  laskee kortit ja METSÄSTÄÄ kakkoslopetuksia.
  eino.js           Eino  — Laskija: laskee kortit, varmaa peruspeliä, ei lopetuksia.
  vaino.js          Väinö — Tarkka:  laskee kortit, ottaa vain VARMAN kakkoslopetuksen.
```

## Tekoälyn esitystapa (Agent / Strategy -malli)

Jokainen vastustaja on **agentti**, joka toteuttaa saman rajapinnan:

```js
Agent = {
  name:  string,
  style: string,
  chooseCard(view) -> Card
}
```

Tämä on peliohjelmoinnin vakiintunut tapa: erota *politiikka* (miten valitaan siirto)
*moottorista* (säännöt ja kulku), ja anna agentille vain **havainto** (`view`) siitä,
mitä pelaaja saa nähdä — ei pääsyä muiden piilokortteihin.

```js
view = {
  me, hand, trick, ledSuit, trickNumber, kakko,
  played,      // JULKINEN historia kaikista pelatuista korteista
  handCounts,  // montako korttia kullakin pelaajalla
  legal        // sallitut siirrot juuri nyt
}
```

**Kaikki kolme laskevat kortteja** johtamalla `view.played`-historiasta, montako kunkin
maan korttia on yhä muilla ja mikä on korkein näkymätön kortti. Uuden agentin lisääminen
on yhden tiedoston työ: toteuta `chooseCard(view)` ja tuo se `index.html`:ssä.

## Miten agentit eroavat

Kaikilla on sama vankka perusstrategia (haali korkeat, nappaa 4. tikki, säästä
lyömätön "pomokortti" viimeiseen tikkiin). Ero on suhteessa kakkoslopetukseen:

- **Aino** ajaa maata korkeilla korteillaan tyhjäksi, suojelee kakkosta ja yrittää
  lopettaa siihen aina kun näkee mahdollisuuden. Näyttävää — mutta hieman
  epäoptimaalista, koska korkeiden korttien polttaminen epäonnistuviin yrityksiin
  maksaa joskus tavallisen tikin.
- **Väinö** ei jahtaa lopetusta, mutta jos laskenta osoittaa maan loppuneen muilta ja
  hän pitää sen kakkosta, hän ottaa ilmaiset kaksi pistettä.
- **Eino** ei välitä kakkoslopetuksesta; kakkonen on sille pelkkä matala kortti.

## Käynnistys

ES-moduulit eivät lataudu suoraan `file://`-osoitteesta, joten avaa peli pienen
paikallisen palvelimen kautta:

```bash
cd katko
python3 -m http.server 8000
# avaa selaimessa: http://localhost:8000/index.html
```

(Mikä tahansa staattinen palvelin käy, esim. `npx serve`.)

## Tekoälyn testaus (päätön, ei selainta)

Koska säännöt asuvat puhtaassa `engine.js`:ssä, agentteja voi ajaa ja mitata
suoraan Nodessa — ilman selainta ja ilman palvelinta.

Peli pelataan **täysinä otteluina 10 pisteeseen** (vakiintunut pelipituus), ja
vertailut tehdään sen pohjalta: mittarina ovat otteluvoitot, ei per-jako-pisteet.

```bash
# Kaikki agentit vastakkain (otteluvoitto-%, ottelut 10 pisteeseen):
node tournament.mjs --matches 2000 --target 10

# Yhden agentin itsetesti vertailuagenttia vastaan:
node eval.js --agent agents/aino.js --baseline eino --matches 1000 --target 10

# Monte Carlo -agentti (Martta) on raskas; kevennä otoksia evalissa:
KATKO_MC_SAMPLES=40 node tournament.mjs --matches 500
```

`eval.js` tarkistaa kolme asiaa ja palauttaa paluukoodin 0 vain kun laillisuus
on kunnossa (sopii "kirjoita agentti → aja testi → korjaa" -silmukkaan):

1. **Laillisuus** — palauttaako agentti aina kortin `view.legal`-joukosta eikä kaadu.
2. **Vahvuus** — otteluvoitto-% vertailuagenttia vastaan (verdikti 55/45 % rajoilla).
3. **Nopeus** — ms / `chooseCard`.

Agentit näkevät `view.scores` (ottelupisteet) ja `view.target` (voittoraja), joten
ne voivat säätää taktiikkaa pistetilanteen mukaan (esim. Martta tavoittelee
kakkoslopetusta aggressiivisemmin kun se voittaisi ottelun).

Uuden agentin lisääminen: toteuta `chooseCard(view)` omaan tiedostoon
`agents/`-kansiossa, aja `node eval.js --agent agents/oma.js`, ja kun se läpäisee,
tuo se `index.html`:ssä pelipöytään.
