# Tuppi — tekoälyn kehitysideoita ja mietteitä

Muistiinpanoja tekoälyn parantamiseksi. Nämä ovat suunnittelulinjoja, eivät
vielä (kaikki) toteutettuja.

## 1. Sooli-päätös odotusarvona, ei pelkkänä kädenmuotona

Nykyinen botti-soolauspäätös (`estimateSooliSurvival` + kynnys) on askel
oikeaan suuntaan, mutta oikea päätös on **odotusarvovertailu**, joka huomioi
ottelutilanteen:

- **Ollaanko nousulla?** Jos OMA joukkue on nousulla, sooli on lähinnä
  **tippumisriski** — häviö pudottaa nousun nollaan. Mitä suurempi nousu, sitä
  varovaisempi (kynnys skaalautuu `upScore`:lla). Jos VASTUSTAJA on nousulla,
  sooli-voitto **pudottaa heidät** → kannattaa olla rohkeampi. Pöytäpelissä
  neutraali. *(Toteutettu selainpelissä: `sooliThreshold`.)*
- **Vertaa vaihtoehtoon.** *(Toteutettu: `estimateSooliEV`.)* Sooli ei ole
  tyhjiössä: jos et soolaa, puolustat ramia ja luovutat todennäköisesti
  pisteitä. Vertaa `EV(sooli)` vs `EV(normaali rami-puolustus)`, molemmat
  puolustajan kannalta. Rami-puolustuksen odotusarvo on kalibroitu 15 000
  jakoon (steal-% ~lineaarinen puolustusvahvuudessa; keskiluovutus 9.4p,
  keskiryöstö 17.6p). Nerokas dynamiikka: hyvä sooli-käsi (matala) on **heikko
  rami-puolustuskäsi** (ässä ramissa korkein), joten kun puolustus olisi
  tappiollinen, sooli voittaa vertailun luonnostaan. Botti soolaa nyt vain
  ~0.5–1.2 % käsistä, ja niiden ka-selviäminen ~45–52 % (vs. kaikkien 10 %).
- **Ottelutilanteen epälineaarisuus** *(toteutettu)*: voitto/häviö arvotetaan
  nousun kautta — oma joukkue nousulla → häviö pudottaa koko nousun; vastustaja
  nousulla → voitto pudottaa heidät. Huom: malli on EV-optimaalinen; se voi
  suosittaa soolia myös nousulla ollessa, JOS puolustus olisi vielä huonompi
  (matala käsi luovuttaisi ramin ja pudottaisi silti). **Mahdollinen jatko:**
  riskikaihtoisuustermi joka suojaa nousua (välttää varianssia kun ollaan
  ylhäällä, vaikka EV olisi tasan).
- **Selviämisarvio.** `estimateSooliSurvival` huomioi kortinvaihdon (yksi apu
  + pääset yhdestä kortista eroon). Kalibroitu 40 000 jaon simulaatioon
  baseline-puolustusta vastaan.
- **Kalibrointihavainto:** vahvaa puolustusta vastaan sooli on **aito
  longshot** — keskimäärin ~10 % selviää, parhaat kädet ~50–65 %. Raaka EV on
  usein negatiivinen, joten hyvän botin pitää olla valikoiva. (Ihmistä
  ramaajana vastaan selviäminen on korkeampi.)

**Jatko:** varsinainen EV-malli, joka yhdistää nousutilanteen pisteytyksen
(paljonko 24p / nousun pudotus on arvoinen juuri nyt) ja normaalin
rami-puolustuksen odotetun tappion.

## 2. Ramaavatko tekoälyt liikaa? — TESTATTU, ei tue hypoteesia

**Hypoteesi:** botit näyttävät ramia liian herkästi.

**Testi (toteutettu):** `ChampionPlayer` sai säädettävän `ramBias`-nupin
(nostaa ramauskynnystä → valitsee noloa useammin). `compare-show.mjs` pelaa
varovaisen Mestarin perus-Mestaria vastaan **pariutetusti** (samat jaot
molemmilla puolilla, vain strategia vaihtaa joukkuetta → jakojen tuuri
kumoutuu). Sanity: bias 0 → tasan 0,00 p.

**Tulos (80–240 ottelua/piste, 12 jakoa, marginaali = varovainen − perus):**

| ramBias | ramaa-% | marginaali |
|---|---|---|
| −0,6 | 58 % | −8,8 p |
| −0,3 | 49 % | −5,7 p |
| **0,0** | **39 %** | **0,0 p** (perus) |
| +0,15 | 34 % | −0,9 p |
| +0,3 | 29 % | +0,7 p |
| +0,45 | 24 % | −1,7 p |
| +0,6 | 20 % | −4,4 p |
| +1,0 | 12 % | −13,4 p |

**HUOM — mittarilla oli väliä.** Ensimmäinen johtopäätös ("ei tue
hypoteesia") oli *fixed-deal-mittarin harha*: kiinteän mittaiset ottelut
pisteytettiin kertyneillä `banked`-pisteillä, jotka EIVÄT vähene pudotessa.
Juuri pudotus (nousun menetys) on se, mikä rankaisee liiasta ramaamisesta,
joten fixed-deal ohitti sen. `--to52` pelaa KOKONAISIA pelejä 52:een, missä
pudotus maksaa koko nousun.

**Play-to-52 -tulos (oikea testi, voitto-% = varovaisen osuus voitoista):**

| ramBias | ramaa-% | voitto-% (100–240 peliä) |
|---|---|---|
| −0,3 (ramaa enemmän) | 48 % | **39 %** (selvästi huonompi) |
| 0,0 (perus) | 39 % | 50 % (sanity ✓) |
| +0,2 | 32 % | 47 % |
| **+0,3** | **~30 %** | **54 % (toistui: 54,0 % ja 54,6 %)** |
| +0,4 | 26 % | 53 % |
| +0,6 | 20 % | 50 % |

**Oikaistu johtopäätös:** kokonaisissa 52-peleissä **hypoteesi saa
kohtalaisen tuen** — Mestari ramaa hieman liikaa. Ramauskynnyksen nosto
(`ramBias ≈ 0,3`, ramaa ~30 % eikä 39 %) antaa toistuvan ~54 % voitto-osuuden;
ramaaminen ENEMMÄN on selvästi huonompi (39 %). Efekti on maltillinen ja
merkitsevyyden rajamailla (~1,5 SE), eikä käyrä ole täysin monotoninen
(bias 0,2 notkahti 47 %:iin). *(Caveat: sims=8.)*

**Suositus:** harkitse `ramBias ≈ 0,3` selainpelin Mestarille (pahimmillaan
neutraali, todennäköisesti pieni parannus, vastaa peli-intuitiota).

## 2b. Vähemmän ramaamista ALHAALLA — TESTATTU, auttaa

**Hypoteesi:** Mestari ramaa liikaa kun oma joukkue ei ole nousulla
(alhaalla / pöytä). Ylhäällä nykyinen kynnys (6.6) saa jäädä.

**Toteutus:** `ChampionPlayer.ramBiasDown` — lisätään kynnykseen vain kun
`upTeam !== myTeam`. Ajuri: `node compare-ram-down.mjs` (play-to-52,
sims=60, peilatut parit: sama siemen + `handRotate` 0/1).

**Tulos (40 peilattua paria = 80 peliä / piste, sims=60):**

| ramBiasDown | caut ramaa-% alhaalla | base alhaalla | voitto-% |
|---|---|---|---|
| 0.3 | 23 % | 33 % | **53.8 %** |
| **0.5** | **19 %** | **33 %** | **57.5 %** |
| 0.7 | 14 % | 33 % | **56.3 %** |

Ylhäällä ramaamis-% pysyi ~50 % molemmilla (bias ei koske nousua).

**Johtopäätös:** varovaisempi näyttö **vain alhaalla** parantaa selvästi
(~54–58 % voitto-osuus vs perus). Paras piste `ramBiasDown ≈ 0.5`.
Peilaus (A↔B-kortit) piti otoksen hallittavana.

**Suositus:** aseta Mestarille `ramBiasDown: 0.5` (tuotanto / selain).
**Tila:** oletus nyt `0.5` (`ChampionPlayer`). Mitattu ramaamis-% alhaalla
~19 % (ennen ~33 %), ylhäällä ~50 %.
**Jatko:** erottele pöytäpeli vs vastustaja-nousulla omiksi kynnyksiksi.

## 4. Pluribus-oppien soveltaminen (poker-botti) — ANALYSOITU + KOE

Kysymys: voisiko Mestaria parantaa Pluribuksen (Brown & Sandholm, *Science*
2019) toimintaperiaatteella? Alla mitä siitä oikeasti kannattaa lainata ja
mitä ei.

**Mitä Pluribus tekee.**
1. *Blueprint self-playlla:* laskee offline Monte-Carlo-CFR:llä (abstraktioilla)
   likimain hyödyntämättömän perusstrategian — ei ihmisdataa, halpa laskea.
2. *Reaaliaikahaku, syvyysrajattu:* pelin aikana haetaan vain muutama siirto
   eteenpäin. **Ydinidea:** haun LEHTISOLMUISSA vastustajien EI oleteta jatkavan
   yhdellä kiinteällä tavalla, vaan he saavat valita usean (Pluribuksella 4)
   jatkostrategian väliltä. Näin haku ei ylisovita yhteen oletukseen "miten muut
   pelaavat" → robusti, vaikea ohittaa.
3. *Ei vastustajamallinnusta:* pelaa kiinteää robustia strategiaa, ei yritä
   hyödyntää yksittäistä vastustajaa. Robustius > eksploitointi.
4. *Uskomukset päättelyketjussa:* CFR päättelee **informaatiojoukoista** ja
   uskomusjakaumista — EI täyden informaation determinoinneista kuten PIMC.

**Miten tämä osuu Mestariin (= PIMC).** Mestari arpoo piilokortit ja ratkaisee
jokaisen arvonnan täydellä informaatiolla, keskiarvoistaen. Sillä on PIMC:n
kaksi tunnettua heikkoutta: *strategy fusion* (olettaa voivansa pelata eri
tavalla maailmoissa jotka ovat sille erottamattomia) ja *ei-lokaalisuus*
(sivuuttaa miten aiempi peli muokkasi vastustajien uskomuksia). PIMC+ (`Kirjo`n
emo) jo lainaa Pluribuksen kohtaa 4 kevyesti: ehdollistaa arvonnan julkiseen
näyttöön (rami/nolo = signaali kädestä, Bayes).

**KOE — jatkostrategioiden monimuotoisuus (Pluribuksen kohta 2).**
`players/pluribusPlayer.js` ("Kirjo") perii PIMC+:n, mutta rolloutissa JOKAISELLE
vastustajapaikalle arvotaan jatkotyyli joukosta {greedy, kova, kohina} —
Mestari sen sijaan olettaa KAIKKIEN pelaavan samaa kiinteää greedy-politiikkaa.
Lehtiarvo heijastaa siis jakaumaa järkeviä jatkoja. Ajuri: `compare-players.mjs`
(paritettu, play-to-52).

**Tulos (neutraali):**

| mittari | Kirjo vs Mestari |
|---|---|
| paritettu play-to-52 (60 peliä, sims=24) | **48,3 %** (29–31) |
| pankkivertailu (40 ottelua, sims=60) | **47,5 %**, nousupisteet 2360 vs 2612 |

Laillinen, ei kaatumisia, ~8 ms/siirto. Ero on kohinan sisällä (~60 peliä,
SE ~6 %). **Johtopäätös:** pelkkä jatkomonimuotoisuus lisättynä nykyheuristiikan
päälle EI paranna viritettyä Mestaria — todennäköisesti koska "kova"/"kohina"
ovat lähinnä heikompia/kohinaisempia politiikkoja eivätkä *paremmin kalibroituja
uskomuksia*. Pluribuksella idea toimii, koska sen jatkostrategiat ovat CFR-
blueprintin variantteja (kaikki vahvoja), eivät ad hoc -heuristiikkoja.

**Suositukset (tärkeysjärjestys, jos jatketaan):**
1. **Uskomusten päivitys myös pelin aikana** (Pluribuksen kohta 4, laajenna
   PIMC+:aa). Nyt tiltti tulee vain aloitusnäytöstä; jatka päivitystä pelin
   edetessä (matala/korkea aloitus, duckaus, varhainen sakkaus paljastavat
   jakaumaa kovien voidien lisäksi). Tämä osui jo mitattuun hyötyyn (PIMC+),
   joten sen syventäminen on lupaavin halpa askel.
2. **Vahvat jatkostrategiat, ei ad hoc.** Jos kohta 2 halutaan toimivaksi, tyylien
   pitää olla oikeasti hyviä (esim. `codexPlayer`- / boss-laskentapolitiikat)
   eikä heikennettyjä. Vasta silloin diversiteetti mittaa robustiutta eikä lisää
   kohinaa.
3. **Robustius-mittaus monta vastustajaa vastaan** (Pluribuksen kohta 3). Arvioi
   ehdokas EI vain Mestari-peiliä vaan koko kirjoa vastaan (heuristic, counting,
   codex, aggressiivinen/varovainen) — suojaa ylisovitukselta.

**Rehellinen varaus — Tuppi ≠ poker.** Pluribus on *ei-yhteistyöpeli* (6 itsekästä
pelaajaa, ei pareja). Tuppi on **paripeli**: suurin mallintamaton arvo on parin
signalointi ja koordinaatio (kuten bridgessä), jota Pluribus ei käsittele
lainkaan. Täysi MCCFR-blueprint 52 kortin + näytön + soolin peliin on iso urakka
ja epävarma hyöty selainpeliä varten. Realistisin polku on lainata Pluribukselta
*uskomusten ehdollistaminen julkiseen peliin* (kohdat 1–2 yllä) ja panostaa
erikseen **pari-signalointiin** (bridge-tekoälyn oppimäärä), ei koko
CFR-koneistoon.

## 5. Bridge-tekoälyn signalointi — ANALYSOITU + KOE (opettavainen nollatulos)

Jatkoa §4:lle: Pluribus ei kata paripeliä, joten otetaan mallia bridge-boteista.

**Mitä bridge-botit tekevät.** GIB (Ginsberg), Jack, Wbridge5 pelaavat kortit
Monte-Carlo + double-dummy -haulla ja valitsevat siirron **parhaalla
keskiarvolla** — eli TÄSMÄLLEEN kuten Mestari (PIMC). Ainoa asia jonka
bridge-botit tekevät ja poker-botit eivät, on **paridefenssin signalointi**:
GIB:n vakiot ovat *attitude* (korkea = rohkaisen tätä maata, matala = lannistan)
ja *count* (korkea-matala = parillinen määrä). Otanta rajataan signaaleihin
yhteensopivaksi. *(Lähde: Ginsberg, "GIB: Imperfect Information in a
Computationally Challenging Game", JAIR 2001.)*

**KOE.** `players/bridgePlayer.js` ("Silta") lisää Mestariin kevyen
signaalikerroksen ramin aloituksissa: lue kaverin signaali (maa jonka kaveri on
ITSE ALOITTANUT = rohkaistu; maa jonka kaveri on SAKANNUT = lannistettu) ja
suosi sen mukaista aloitusta — mutta VAIN pehmeänä tie-breakina PIMC:n
kärkisiirtojen kesken. `signalBand` = kuinka paljon PIMC-keskiarvoa (keskitikkiä)
aloitus saa olla parasta huonompi ja silti kelvata signaalin mukaan. Ajuri:
`compare-players.mjs --asignal <band>` (paritettu play-to-52, kortit peilattu).

**Tulos — etu KÄÄNTYY hakutarkkuuden mukaan:**

| signalBand | sims=24 (kohinainen PIMC) | **sims=60 (= oikea peli)** |
|---|---|---|
| 0.15 (turvallinen tie-break) | 50,0 % (n=80) | **52,8 %** (211–189, n=400) |
| 0.6 (ohittaa PIMC:n) | **60,5 %** (121–79, n=200) | **40,0 %** (32–48, n=80) |

Kaistan 0.15 sims=60-rivi on iso, ratkaiseva otos (200 peilattua paria = 400
peliä). Pienempi ensiajo antoi 53,8 % (43–37, n=80); yhdistettynä 254–226/480 =
52,9 %.

**Johtopäätös.** Oikeassa pelivahvuudessa (sims=60, jota selain käyttää ihmistä
vastaan) eksploitisesta signaloinnista EI ole mitattavaa hyötyä: turvallinen
tie-break on **52,8 % (n=400, ~1,1 SE yli 50 → ei tilastollisesti merkitsevä)**
— marginaalisesti positiivinen mutta kohinan rajoilla. PIMC:n *ohittaminen*
signaalilla on sen sijaan selvästi HAITALLISTA (40 %). Aito etu näkyy vain kun
PIMC on tahallaan heikennetty (sims=24 → leveä kaista +10 pp).

**Miksi.** 60 simulaation PIMC ehdollistaa jo JOKAISEEN julkiseen korttiin,
joten se tosiasiassa *päättelee jo sen mitä signaali kertoisi*. Ihmispari
tarvitsee signaaleja koska ei osaa laskea PIMC:tä käsin; tarkka botti ei.
**Suunnitteluopetus: eksplisiittisen pari-signaloinnin arvo on kääntäen
verrannollinen siihen, kuinka hyvin hakija jo päättelee julkisesta tiedosta.**
Sama pätee §4:n Pluribus-diversiteettiin — molemmat auttavat heikkoa hakijaa,
eivät vahvaa.

**Suositus.** ÄLÄ vaihda selaimen Mestaria Siltaan: parannus ei ole merkitsevä
mittarin bittiin asti. `signalBand`-oletus pidetty turvallisena (0.15), jottei
se voi heikentää. Sivuhyöty jos joskus halutaan: kaista 0.15 tekee botin
aloituksista ihmiselle *luettavampia* (jatkaa kaverin maata) rikkomatta peliä.
**Mittausmenetelmä (vahvistettu käyttäjän kanssa):** peilatut jaot (samat
kortit, joukkueet päinvastoin) + sims=60 kuten oikeassa pelissä.

## 6. Uskomuspäivitys kesken pelin (§4:n "lupaava polku") — KOE, neutraali

§4 nimesi lupaavimmaksi halvaksi askeleeksi PIMC+:n Bayes-tiltin laajentamisen
aloitusnäytöstä koko peliin. Toteutettu ja mitattu.

**Toteutus.** `players/beliefPlayer.js` ("Aavistus") perii PIMC+:n ja lisää
determinointiin GIB:n "restricted choice" -tyylisiä VARMOJA "ei voi pitää"
-päätelmiä, rajattuna tikin **viimeiseen** (4.) pelaajaan, jonka kortti
ratkaisee tikin yksin:
- Rami: jos 4. tunnusti muttei voittanut JA huippua piti vastustaja → hänellä
  ei ole korkeampaa korttia siinä maassa (olisi ottanut ilmaisen tikin).
- Nolo: jos 4. joutui voittamaan vastustajan johtaessa → ei huippua matalampaa
  duckauskorttia siinä maassa.
Nämä terävöittävät determinointia yli pelkkien voidien: korkeat/matalat
piilokortit ohjataan oikealle paikalle.

**Bugi joka kannattaa muistaa.** Ensimmäinen versio unohti parisuhteet: tikin
4. pelaaja (leader+3) on **paria** 2. pelaajan (leader+1) kanssa. Jos kaveri
johtaa tikkiä, ramaaja säästää tietoisesti korkean kortin ylittämättä kaveria —
"ei voittanut" EI silloin kerro kädestä mitään. Buginen versio poisti korkean
kortin väärin yleisessä tilanteessa → **41,7 %** (50–70, sims=60, n=120),
selvästi huonompi. Korjaus: päätelmä vain kun huippua pitää vastustaja.

**Tulos (korjattu, sims=60 = oikea peli, peilatut jaot):**

| versio | voitto-% vs Mestari |
|---|---|
| buginen (ei parirajausta) | 41,7 % (50–70, n=120) — huonompi |
| **korjattu (vastustaja-rajaus)** | **50,0 %** (60–60, n=120) — neutraali |

**Johtopäätös.** Oikein toteutettuna varma lisäpäätelmä on TÄSMÄLLEEN neutraali.
Selitys on sama kuin §4–§5:ssä: 60 simulaation PIMC ehdollistaa jo jokaiseen
julkiseen korttiin ja on lähellä kattoa siinä, mitä julkisesta tiedosta voi
päätellä — varma "ei voi pitää" -tieto on liian harvinaista ja usein jo
implisiittisesti mukana, jotta se siirtäisi keskimääräistä päätöstä. **Sama
kaava toistui kaikissa kolmessa kokeessa (Pluribus-diversiteetti §4, bridge-
signalointi §5, uskomuspäivitys §6): lisäkerrokset auttavat vain heikennettyä
hakijaa, eivät sims=60-Mestaria.**

**Käytännön suositus tästä sessiosta.** Mestarin (PIMC, sims=60) taso on jo
korkea; suoraviivaiset "lisää tietoa hakuun" -parannukset eivät tuota mitattavaa
etua. Jos halutaan aidosti vahvempi botti, seuraavat askeleet olisivat
raskaampia ja eri suuntaan: (a) parempi ROLLOUT-politiikka (nykyinen greedy on
karkea — tässä vahva jatko voisi auttaa toisin kuin diversiteetti), tai
(b) enemmän simulaatioita / hakusyvyyttä, tai (c) oikea CFR-lähestyminen. Kaikki
selvästi työläämpiä kuin tämän session kevyet kokeet.

## 3. Muuta

- Selainpelissä paikan valinta poistettu; pelaaja istuu paikalla 0 ja pelaa
  oletuksena parasta tekoälyä (Mestari) vastaan.
