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
**Jatko:** erottele tilanteet (oma alhaalla / molemmat alhaalla / vastustaja
nousulla) omilla kynnyksillä; aja isompi otos korkeammalla sims-arvolla
merkitsevyyden varmistamiseksi.

## 3. Muuta

- Selainpelissä paikan valinta poistettu; pelaaja istuu paikalla 0 ja pelaa
  oletuksena parasta tekoälyä (Mestari) vastaan.
