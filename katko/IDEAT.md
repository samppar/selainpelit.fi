# Katko — ideat ja kehitysmuistiinpanot

Käyttäjän ohjeet ja havainnot jatkokehitystä varten.

> **Vakiopäätös:** peliä pelataan aina **10 pisteeseen**, ja vertailut sekä
> taktiikat tehdään sen pohjalta (ottelupohjainen eval). Oletus asetettu
> kaikkialle (selain, `tournament.mjs`, `eval.js`).

## 1. Pistetilanteen huomiointi tekoälyssä (comeback-riski) — OSITTAIN TEHTY

**Tehty:** `view.scores` + `view.target` lisätty viewiin (engine + selain). Martta
on nyt pistetilannetietoinen: sen Monte Carlo -arvo huomioi ratkeaako ottelu
(voitto joka yltää targetiin = iso arvo, vastustajan voitto = iso miinus). Tämä
sai comeback-logiikan esiin automaattisesti — Martan otteluvoitto-% nousi
per-jako ~28 %:sta ottelupelissä ~43 %:iin.

**Jäljellä:**
- Heuristiikat (Aino/Eino/Väinö) EIVÄT vieläkään käytä pistetilannetta — vain Martta.
- Martan arvo on yhden jaon lookahead + ottelupäätepalkkio, ei täysi
  moni-jakoinen ottelurollout. Riittää lähelle-targetia-tilanteisiin; kaukana
  targetista se pelaa käytännössä per-jako-optimia.

## 1b. Alkuperäinen ohje (säilytetty)

**Ohje:** Jos pelataan esim. 10 pisteeseen, perässä olevan pelaajan kannattaisi
ottaa isompi riski kakkoslopetuksesta voittaakseen koko kisan. Loppupelissä
riskinotto pitäisi skaalata pistetilanteen mukaan.

**Nykytila:** Tekoälyt EIVÄT näe ottelun pistetilannetta lainkaan — `view`
sisältää vain käynnissä olevan jaon (ei `scores`/`target`). Siksi mikään agentti
ei voi säätää riskiä sen mukaan, kuinka paljon on perässä.

**Kakkoslopetuksen arvo riippuu pistetilanteesta (target = 10 esimerkkinä):**
- **9/10 (target − 1):** tavallinenkin viimeisen tikin voitto (1 p) riittää
  voittoon → kakkoslopetus on HYÖDYTÖN, sitä ei kannata riskeerata lainkaan.
- **8/10 (target − 2):** kakkoslopetus (2 p) VOITTAA ottelun yhdellä tikillä →
  valtava arvo, korkeakin riski kannattaa.
- **kauempana:** kakkonen kuroo eroa nopeammin, arvo maltillinen ja skaalautuu
  sen mukaan, kuinka paljon perässä on.
Yleissääntö: kakkoslopetuksen tavoittelun arvo ei ole vakio (2 vs 1), vaan
riippuu siitä paljonko itseltä puuttuu voittoon.

**Vaatii:**
- `view.scores` (kaikkien ottelupisteet) ja `view.target` (voittoraja)
  lisättävä `buildView`hin (`engine.js`), ja välitettävä myös selaimen
  `buildView`-adapterista (`index.html`).
- Agentti painottaa kakkoslopetuksen tavoittelua yllä olevan mukaan: ei chasea
  kakkosta kun on target − 1, mutta ottaa siitä ison riskin kun on target − 2.
- Martan (Monte Carlo) tavoitefunktio: arvota EI per-jako-pisteitä vaan
  "voittiko ottelun" — eli rollout/arviointi ottelun voittotodennäköisyyteen,
  ei vain yhden jaon pisteisiin. Tämä saa yllä olevan logiikan esiin
  automaattisesti ilman käsinkoodattuja rajoja.

## 2. Vastustajan sakkaamien korttien koko signaalina

**Ohje:** Huomioidaanko, miten isoja kortteja vastustaja sakkaa (heittää pois
kun ei voi tunnustaa maata)? Antaako se tietoa?

**Nykytila:**
- `suitInfo` (`base.js`) laskee pelatut kortit per maa → tietää mitkä kortit ovat
  poissa ja päivittää `unseenMax`. Huomioi siis *että* kortti on pelattu, ei
  erikseen sakkaamisen merkitystä.
- Martta käyttää `view.voids` (kuka on pihalla mistäkin maasta) determinisoinnissa
  — tämä johdetaan sakkaamisesta, mutta vain *maasta pihalla* -tietona, ei sakatun
  kortin *koosta*.
- Kukaan agentti ei erikseen päättele: "vastustaja heitti ison kortin → hänellä on
  todennäköisesti vielä vahvempi kortti suojattavana / hän luopuu maasta."

**Vaatii:** sakattujen korttien koon mallinnus. Iso off-suit-heitto on vahva
signaali (pelaajalla ei ollut avausmaata JA hän valitsi luopua isosta kortista).

## 3. Kortinlaskennan kalibrointi (52 kortin pakka, vain 20 jaossa)

`suitInfo` olettaa 13 korttia per maa pelissä; oikeasti vain ~20/52 korttia
jaetaan (5×4), joten `outstanding` on yliarvioitu ja `isBoss`/`unseenMax` voi
erehtyä (korkeampi kortti voi olla vain jakamatta). Vaikuttaa kaikkiin
heuristiikkoihin ja Martan rollout-politiikkaan.

## 4. Virallinen pisteraja

Kysymys: onko virallinen raja 10 pistettä? — ei vahvistettua lähdettä. 10 lisätty
aloitusvalikkoon vaihtoehdoksi (3 / 5 / 7 / 10). Jos löytyy virallinen
sääntölähde, päivitä oletus sen mukaan.

## 5. Testien luonne — TEHTY

`tournament.mjs` ja `eval.js` pelaavat nyt **täysiä otteluita** targetiin
(oletus 10) ja mittaavat **otteluvoitot** per-jako-pisteiden sijaan. `engine.js`
sisältää `playMatch(agents, target, kakko, rnd, firstLeader)`. Näin
kakkoslopetuksen ja comeback-taktiikan merkitys tulee oikein mitatuksi.
