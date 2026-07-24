# Käpysota

Worms-henkinen vuoropohjainen tykistöpeli, jossa madot on vaihdettu oraviin:
punaoravat vastaan harmaaoravat, kolme oravaa per lauma. Aseina käpysinko,
pomppiva terhokranaatti ja viideksi hajoava marjapommi. Maasto tuhoutuu
räjähdyksistä, tuuli kääntyy joka vuoro ja järveen pudonnut orava hukkuu.

## Pelimuodot

- **Konetta vastaan** — rento (kone tähtää huolimattomasti) tai tarkka
  (kone hakee parhaan laukauksen simuloimalla lentoratoja).
- **Kaksi pelaajaa** — hotseat samalla laitteella.

## Rakenne

| Tiedosto | Rooli |
|----------|-------|
| `src/engine.js` | Puhdas pelilogiikka ilman DOM:ia: maastogeneraattori (seedattu), fysiikka kiinteällä 60 Hz askeleella, vuorot, aseet, äkkikuolema, tekoäly (lentoratasimulaatio + pisteytys) |
| `src/game.js` | Canvas-piirto, syötteet (näppäimistö/hiiri/kosketus), efektit, WebAudio-äänet, AI-ohjuri |
| `src/style.css` | Syysmetsäteema |
| `build.js` | Niputtaa yhden itsenäisen `index.html`:n |
| `test/run_tests.js` | Regressiotestit: maasto, determinismi, ammukset, tuuli, kävely, hukkuminen, vuororotaatio, voitto, AI |

## Komennot

```sh
npm test        # moottorin regressiotestit (Node, ei riippuvuuksia)
npm run build   # kirjoittaa index.html:n
```

## Suunnittelunotit

- Kaikki satunnaisuus kulkee seedatun rng:n kautta → sama seed tuottaa saman
  maaston, spawnit ja tuulet; testit ja AI-simulaatiot ovat toistettavia.
- Tekoäly käyttää samaa integraattoria kuin pelifysiikka (`simulateShot`),
  joten "tarkka" kone osuu oikeasti sinne minne tähtää.
- UI lukee moottoria vain `getView`/`drainEvents`-rajapinnan kautta;
  selain-smoke onnistuu konsolista `window.KapysotaUI`-kahvalla.
