# Oulun kaupunginvaltuuston äänestykset valtuustokaudella 2025–2029

Koottu **suoraan pöytäkirjoista** (asiakirjat.ouka.fi) `node
data/hae-aanestystulokset.js`-skriptillä 23.7.2026, kausi 1.6.2025–23.7.2026.
Raakadata: `data/aanestystulokset/kaikki.json` (kaikki löydetyt pykälät +
lähdelinkit). Tämä tiedosto on käsin kirjoitettu, ihmisluettava tiivistelmä
samasta datasta — luvut on tarkistettu alkuperäisistä pöytäkirjateksteistä.

## ⚠︎ Tärkeä havainto: valtuutettukohtaisia ääniä EI julkaista

Käytiin läpi **kaikki 10 kokousta ja 63 pöytäkirja-asiaa** tällä kaudella.
Tulos: Oulun kaupunginvaltuuston (n. 67 jäsentä) äänestyksistä julkaistaan
**vain kokonaislukemat** (esim. "JAA 61, EI 5, tyhjää 0, poissa 1") —
**ei kertaakaan** valtuutettukohtaista jaa/ei/tyhjä/poissa-nimilistaa,
ei erillisenä "äänestysliitteenä" eikä muutenkaan. Tarkistettu myös kaikki
asioiden liitteet (63 asiaa, 40 erillistä liitelistaa): mikään liite ei ole
nimeltään "äänestysliite" tai sisällä nimitason ääniä.

Poikkeus: **kaupunginhallituksen** (13 jäsentä) pöytäkirjoissa nimet
mainitaan toisinaan proosassa suoraan tekstissä ("äänin 7-6: JAA Husso,
Karjula, ... EI Hiltunen, Koivuniemi, ..."), koska ryhmä on niin pieni että
se on käytännöllistä kirjata sanallisesti. Tämä ei koske valtuustoa.

**Seuraus:** `data/valtuutetut-vaalikone.js` (yksilötason vaalikone) ei voi
täyttyä oikealla Oulun valtuustodatalla asiakirjat.ouka.fi:stä — dataa ei ole
julkaistuna siinä muodossa, oli hakuyrityksiä kuinka monta tahansa. Ainoa
tapa saada valtuutettukohtaiset äänet olisi tietopyyntö kirjaamoon (jos
äänestysjärjestelmä säilyttää raakadatan) tai paneutua kokousvideoihin.
Ryhmätason vaalikone (`oulu-ryhmavaalikone.js`) on siis tällä lähteellä
realistinen tarkkuustaso.

## Äänestykset (kokonaisluvut, primäärilähde: pöytäkirjat)

| Pvm | § | Aihe | JAA–EI (tyhjä/poissa) | Kuka esitti vastaesityksen |
|-----|---|------|------------------------|------|
| 10.11.2025 | 83 | Tulovero 2026: pysyy 8,10 % (kh) vs. laskee 7,90 % (Huotari) | **61–5** | Jukka Huotari (ps.), kannattaja Jani Törmi |
| 10.11.2025 | 83 | Rakentamattoman rakennuspaikan kiinteistövero: ei muutosta (kh) vs. 4,00 % (Sirviö) | **36–30** | Pirjo Sirviö, kannattaja Marika Koivuniemi |
| 10.11.2025 | 93 | Raksilan vesiliikuntakeskuksen asemakaava ja tonttijako | **50–10** (poissa 7) | — (asemakaavapäätös, ei nimettyä vastaesitystä pöytäkirjassa) |
| 8.12.2025 | 97 | Talousarvio 2026: 21 muutos/lisäysehdotusta + 2 ponsiesitystä (ks. taulukko alla) | kh:n pohja voitti **21/23:sta** | ks. alla — kaikki esittäjät nimetty |
| 27.4.2026 | 24 | Lähijunaliikenteen käynnistäminen (Oulu+Kempele+Liminka) vs. Huotarin hylkäysesitys | **59–8** | Jukka Huotari (ps.), kannattaja Aittakumpu |
| 30.3.2026 | 13 | Kaupunkistrategia Oulu 2035: 8 muutosesitystä (Huotari+Haho) | kh:n pohja voitti kaikki 8: **63–4** … **62–5** | Urho Haho / Jukka Huotari |
| 30.3.2026 | 18 | Asemakaava ja tonttijako, Tapionranta (Kaijonharju) vs. Kohosen vastaesitys | **50–15** (poissa 2) | Olli Kohonen, kannattaja Miina-? |
| 18.5.2026 | 35 | Hyvinvointisuunnitelma 2026–2029: Huotarin 12 muutosesitystä | kh:n pohja voitti **kaikki 12**: **61–4** … **58–4** | Jukka Huotari (ps.), kannattaja Aittakumpu |
| 8.6.2026 | 38–56 | Palveluverkko (19 päätöskohtaa, koulut/päiväkodit/liikunta/kulttuuri) | kh:n pohja voitti **läh. kaikki**, tyyp. **62–4**; ks. poikkeukset alla | Pääosin ps.-ryhmä (Huotari), koulukohtaisissa myös yksittäisiä valtuutettuja |

### Talousarvio 8.12.2025 — kaikki 23 äänestystä (§97)

Kaikissa: **kh:n pohjaesitys = JAA, esittäjän muutos = EI.** Kahdessa (7. ja
15.) ei äänestetty, koska esitys hyväksyttiin yksimielisesti.

| # | Esittäjä | Aihe (sivu) | Tulos |
|---|----------|-------------|-------|
| 1 | Anneli Näppä | s.20 Työllistymisen edistäminen | JAA 43–EI 24 |
| 2 | Johanna Karjula | s.20 Yritystoiminta ja vienti | JAA 42–EI 25 |
| 3 | Susa Vikeväkorva | s.25 Vaikutusten arviointi | JAA 34–EI 33 |
| 4 | Esa Aalto | s.28 Katuverkon korjausvelka | JAA 49–EI 18 |
| 5 | Jukka Huotari | s.30 Hallinnon sopeuttamisohjelma | JAA 62–EI 5 |
| 6 | Jukka Huotari | s.30 Hankintojen lisäsäästö | JAA 62–EI 5 |
| 7 | Pirjo Sirviö | s.43 "Venäjän Ukrainaan tekemä hyökkäyssota" -termi | **hyväksytty yksimielisesti** |
| 8 | Jorma Leskelä | s.65 Hankintojen ohjaus | JAA 43–EI 24 |
| 9 | Mariam Kandelberg | s.72 Loistokarin luonnonsuojelu | JAA 36–EI 31 |
| 10 | Onni-Jonatan Matilainen | s.103 ONE:n puhe-/läsnäolo-oikeus | JAA 41–EI 25 (tyhjä 1) |
| 11 | Jorma Leskelä | s.113 Kotihoidon tuen kuntalisä | JAA 47–EI 19 (tyhjä 1) |
| 12 | Mikko Viitanen | s.115 Resursseja työpajatoimintaan | JAA 43–EI 24 |
| 13 | Outi Einistö | s.122 Koulujen pihat vehreämmiksi | JAA 37–EI 30 |
| 14 | Miia Immonen | s.123 1,4 M€ oppimisen tuen uudistukseen | JAA 48–EI 18 (tyhjä 1) |
| 15 | Joni Meriläinen | s.135–136 Hyte-kertoimen kohdennus | **hyväksytty yksimielisesti** |
| 16 | Olli Kohonen | s.136 Lisää yhteisöllistä asumista | JAA 36–EI 31 |
| 17 | Jukka Huotari | s.138 Kiintiöpakolaisten vastaanoton keskeytys | JAA 62–EI 5 |
| 18 | Johanna Karjula | s.152 Kadut ja liikenne | JAA 51–EI 16 |
| 19 | Mariam Kandelberg | s.153 Metsämaan hiilinielun palautus | JAA 47–EI 18 (tyhjä 2) |
| 20–22 | Raudaskoski, Meriläinen, Koivuniemi (yhdistetty) | s.159 Joukkoliikenteen rahoitus | JAA 36–EI 30 (tyhjä 1) |
| 23 | Jukka Huotari | s.213 Prosenttitaiteesta luopuminen | JAA 62–EI 5 |
| Ponsi 1 | Joni Meriläinen | Oppimisen tuen uudistus | Hyväksytty JAA 64–EI 1 (tyhjä 2) |
| Ponsi 2 | Miia Immonen | Sivistyslautakunnan lisä-TA keväällä | Hyväksytty JAA 47–EI 20 |

**Lopputulos:** talousarvio 2026 hyväksyttiin kh:n esityksen mukaisena,
täydennettynä Sirviön termimuutoksella (#7) ja Meriläisen hyte-lisäyksellä
(#15) — kaikki muut 21 muutos-/lisäysehdotusta hylättiin.

⚠︎ Aiemmassa versiossa tässä tiedostossa oli virheellinen tieto: "Parkkisen
(kesk.) esitys Ylikiiminki–Muhos-pilottilinjasta, 45–19". Tätä esitystä **ei
löydy** pöytäkirjasta (dok. 3555963) — 23 äänestyksen joukossa ei ole ketään
"Parkkista" eikä Ylikiiminki–Muhos-linjaa. Poistettu virheellisenä.

### Palveluverkko 8.6.2026 — huomionarvoiset äänestykset

Kaikissa 19 päätöskohdassa (§38–56) kh:n esitys voitti. Yleisin tulos oli
**62–4** (poissa 1). Poikkeukset, joissa vastustus oli laajempaa:

- **§38 Aseman koulu**: JAA 61–EI 5, JAA 62–EI 4 (kaksi äänestystä)
- **§39 Martinniemen koulu**: JAA 60–EI 6, JAA 62–EI 4
- **§55 Liikuntapalvelut** (Raatin uimahalli, Pateniemen uimaranta ym.):
  neljä äänestystä — **JAA 52–EI 14**, **JAA 54–EI 12**, JAA 61–EI 5,
  JAA 60–EI 5 (tyhjä 1). Vastaesitykset: Mikko Viitanen (Raatti jatkaa
  uimahallina, Värtön korvaavat tilat) ja Jukka Huotari (Raatti + Pateniemen
  uimaranta säilyvät, laajempi vastustus loppuraportille).
- **§56 Kulttuuripalvelut** (kirjastot): 4 äänestystä kh:n pohjasta (62–4),
  lisäksi useita ponsiesityksiä samassa pykälässä (esim. Kohosen ponsi
  hyväksytty 62–4, Huotarin ponsi hylätty 26–40, Immosen ponsi hyväksytty
  62–4).

Alkuperäisestä palveluverkkoselvityksestä poiketen mm. **Aseman koulu**,
**Martinniemen koulu** ja **Kontion koulun Huttukylän yksikkö** jatkavat —
näissä kohdissa käytiin siis kaksi äänestystä (ensin selvityksen sisältö,
sitten muutosesitys, joka nosti vastustuksen 61–5/60–6:een ennen kuin
lopputulos kääntyi säilyttämisen suuntaan poliittisessa käsittelyssä).

## Kokoukset ilman äänestyksiä (tarkistettu pöytäkirjoista)

- **2.6.2025** — järjestäytymiskokous: puheenjohtajisto ja kaupunginhallitus
  valittiin (vaalit, ei jaa/ei-äänestyksiä samassa mielessä).
- **6.10.2025** — 150-vuotisjuhlakokous (22 min), ei äänestyksiä.
- **8.12.2025** kattaa myös 24.11.2025 aloitetun keskustelun (kokous
  keskeytettiin ja jatkui 8.12.2025, jolloin äänestettiin).

## Suurimmat päätökset taustaksi

- **Kunnallisvero pysyi 8,10 %:ssa** (ei nousua — se oli 8,10 % jo 2025).
  Huotarin (ps.) esitys laskea 7,90 %:iin kaatui 61–5.
- **Talousarvio 2026**: investoinnit 2026–2028 n. 655 M€, nettolainanotto
  2026 n. 191,2 M€. 21/23 muutosesityksestä hylättiin.
- **Lähijunaliikenne** käynnistetään Oulu–Kempele–Liminka-akselilla
  2030-luvulla; Oulu rahoittaa kolmasosan. Huotarin hylkäysesitys kaatui
  59–8; ps.-ryhmä jätti eriävän mielipiteen.
- **Kaupunkistrategia Oulu 2035**: Huotarin ja Hahon 8 muutosesitystä
  (mm. ilmastotavoitteiden ja "3-30-300"-periaatteen poistamisesta)
  kaatuivat kaikki, tyypillisesti 62–5.
- **Palveluverkko 8.6.2026** (säästötavoite n. 18 M€): koulujen,
  päiväkotien, kirjastojen ja liikuntapaikkojen (Raatin uimahalli)
  lakkautuksia/muutoksia. Vastustus oli suurinta Raatin uimahallin
  (52–14) ja yksittäisten koulujen kohdalla.

## Valmiita kyllä/ei-väitteitä vaalikoneeseen

1. Kunnallisveroprosentin olisi pitänyt laskea 7,90 prosenttiin vuodelle
   2026 sen 8,10 prosentissa pitämisen sijaan.
2. Oulun oli oikein lähteä mukaan lähijunaliikenteen käynnistämiseen.
3. Palveluverkon leikkaukset (koulujen ja päiväkotien lakkautukset) olivat
   välttämättömiä.
4. Raatin uimahalli olisi pitänyt säilyttää sellaisenaan.
5. Talousarvion 2026 muutosesityksiin (esim. hankintojen ohjaus, koulujen
   pihojen vehreys) olisi pitänyt käyttää enemmän rahaa.
6. Kaupunkistrategian ilmasto- ja kestävyystavoitteita ei pitänyt
   lieventää Huotarin/Hahon esittämällä tavalla.
7. Kaupungin pitäisi mieluummin ottaa lisää velkaa kuin leikata
   palveluista.

## Mistä tämä data on peräisin ja mitä siitä EI saa

1. **Pöytäkirjat (kokonaisluvut)**: <http://asiakirjat.ouka.fi> →
   Pöytäkirjat → Toimielin: Kaupunginvaltuusto → kokous → pykälän otsikko
   (fileshow-linkki avaa PDF:n, jossa "Päätös"-kohdassa lukee äänten
   kokonaismäärä, jos äänestettiin). **Ei sisällä nimiä.**
2. **Valtuutettukohtaisia ääniä ei ole julkisesti tässä arkistossa.**
   Ks. yllä oleva huomautus. Jos joku haluaa yksilötason vaalikoneen
   (`data/valtuutetut-vaalikone.js`), data pitää hankkia muualta (esim.
   tietopyyntö kirjaamo@ouka.fi, tai kokousvideoiden nimenhuutokohdat).
3. **Avoin data**: <https://www.avoindata.fi/data/fi/dataset/oulun-kaupungin-kokoukset-ja-paatokset>
   — tarkistettu ei sisällä äänestysten nimitietoja tätä kirjoitettaessa.
4. **Kokousvideot**: Oulun kaupungin YouTube-kanava (nimenhuutoäänestykset
   voi kuulla videolta, mutta niiden litterointi manuaalisesti 60+ hengen
   äänestyksestä ei ole tässä tehty).

## Lähteet (primäärit, pöytäkirjat)

- 10.11.2025 §83 <http://asiakirjat.ouka.fi/ktwebscr/fileshow?doctype=3&docid=3527805>
- 10.11.2025 §93 <http://asiakirjat.ouka.fi/ktwebscr/fileshow?doctype=3&docid=3527825>
- 8.12.2025 §97 <http://asiakirjat.ouka.fi/ktwebscr/fileshow?doctype=3&docid=3555963>
- 30.3.2026 §13 <http://asiakirjat.ouka.fi/ktwebscr/fileshow?doctype=3&docid=3647523>
- 30.3.2026 §18 <http://asiakirjat.ouka.fi/ktwebscr/fileshow?doctype=3&docid=3647533>
- 27.4.2026 §24 <http://asiakirjat.ouka.fi/ktwebscr/fileshow?doctype=3&docid=3676030>
- 18.5.2026 §35 <http://asiakirjat.ouka.fi/ktwebscr/fileshow?doctype=3&docid=3698932>
- 8.6.2026 §38–56 <http://asiakirjat.ouka.fi/ktwebscr/pk_asil_tweb.htm?bid=48240>

Uutislähteet (tausta, ei äänestyslukujen ensisijainen lähde):

- [Yle: Oulun veroprosentti nousee sittenkin](https://yle.fi/a/74-20123888) — ⚠︎ otsikko harhaanjohtava, ks. korjaus yllä (vero ei nouse, pysyy 8,1 %:ssa)
- [Mun Oulu: Raksilan vesiliikuntakeskus](https://www.munoulu.fi/kaupunki/raksilan-vesiliikuntakeskuksessa-kuntalaiset-paasevat-uimaan-myos-kilpailujen-aikana/)
- [Mun Oulu: Valtuusto kannatti lähijunaa](https://www.munoulu.fi/kaupunki/oulun-kaupunginvaltuusto-kannatti-lahijunaa-selvalla-enemmistolla/)
- [Yle: Oulu ja kaksi lähikuntaa sanoivat lähijunalle kyllä](https://yle.fi/a/74-20222609)
- [Kaleva: Tilinpäätös 16,5 M€ miinuksella](https://www.kaleva.fi/valtuusto-hyvaksyi-oulun-165-miljoonaa-miinukselle/13499706)
- [Yle: Oulu sulkee tukun kouluja, päiväkoteja ja kirjastoja](https://yle.fi/a/74-20230399)
- [Kaleva: Oulu lakkauttaa kouluja ja Raatin uimahallin](https://www.kaleva.fi/oulu-lakkauttaa-kouluja-ja-raatin-uimahallin-kaikk/13532602)
- [Mun Oulu: Valtuusto hyväksyi palveluverkkomuutokset](https://www.munoulu.fi/kaupunki/oulun-kaupunginvaltuusto-hyvaksyi-palveluverkkoon-esitetyt-muutokset/)
