# AGENTS.md — Tuppi

Ohjeet **koodausagentille**, joka kehittää tai arvioi tuppibotteja tässä
kansiossa. Ihmisen yleiskuvaus: `README.md`. Uuden pelaajan sopimus:
`WRITING_A_PLAYER.md`. Strategiamietteet: `IDEAT.md`, `OMAT_TEKOALYOHJEET.md`.

## Vahvuustestit (pakolliset säännöt)

Kun mitataan onko botti / muutos **parempi pelissä** (ei pelkkä
laillisuus/smoke), noudata näitä:

### 1. Pelaa aina 52 pisteeseen

Aja **kokonaisia pelejä tuppeen** (nousu ≥ 52), älä kiinteän mittaisia
`fixedDeals`-otteluita.

- Oikea komento/tyyli: `playMatch` ilman `fixedDeals`, tai
  `node compare-show.mjs --to52 …`
- Fixed-deal mittaa kertyneitä `banked`-pisteitä, jotka **eivät nollaudu**
  pudotuksessa. Juuri nousun menetys rankaisee liian innokasta ramaamista —
  fixed-deal ohittaa sen ja voi antaa väärän johtopäätöksen.

### 2. Käytä normaalin pelin siirtosyvyyttä / sim-määrää

Vertailussa käytä **samaa** PIMC-/simulaatiomäärää kuin oikeassa pelissä
(Mestari: oletus `simulations = 60`). Älä pudota sims-arvoa “nopeuden
vuoksi”, kun teet vahvuuspäätöksiä.

Alhaisempi sims muuttaa botin päätöksiä (näyttö + kortinvalinta). Silloin
et testaa tuotantobottia, ja liian innokkaan ramauksen rangaistus voi
kadota tai vääristyä.

Laillisuus-/smoke-testeissä (`eval.js`, `npm test`) sims saa olla pienempi.

### 3. Peilatut pelit (sama jako­sekvenssi, kortit joukkueelle B)

Vähennä tuuria ja tarvittavaa otoskokoa: **jokaista siementä kohti kaksi
peräkkäistä 52-peliä**.

1. Peli A — siemen *S*, `handRotate=0` (normaalit kortit).
2. Peli B — **sama siemen *S***, `handRotate=1`: jokainen jako on sama kuin
   A:ssa, mutta kädet kiertävät yhden paikan → **joukkueen A kortit menevät
   joukkueelle B** (ja päinvastoin). Strategiat pysyvät samoilla paikoilla.

Moottori: `new TuppiEngine(players, { seed: S, handRotate: 0|1 })`.
Valmis ajuri: `node compare-ram-down.mjs` (oletus sims=60, play-to-52).

Näin jakojen onni kumoutuu paremmin: jäljelle jää strategian ero, ei se
kuka sattui saamaan hyvät kortit. Sama signaali saadaan usein **pienemmällä
parimäärällä** kuin itsenäisillä siemenillä.

Älä sekoita tähän pelkkää “strategiat vaihtavat puolta, samat paikkakortit”
-mallia (`compare-show.mjs` A/B), jos tavoite on nimenomaan korttien
siirto joukkueelta toiselle — käytä `handRotate`.

Kun vertaat kahta bottia/asetusta, raportoi peilattujen parien perusteella
(voitto-% 52-peleissä, ei pelkkä pistemarginaali fixed-dealista).

## Mitä nämä eivät koske

- Yksikkötestit, sääntötestit, “ei kaadu / ei laitonta siirtoa”
- Nopeat iteraatiot ennen varsinaista vahvuusajoa

Kun teet johtopäätöksen (“X on parempi kuin Y”), sen pitää perustua
**play-to-52 + tuotanto-sims + peilattuihin peleihin** (`handRotate`).

## Alhaalla-varovaisuus (ramBiasDown)

Mestarilla on kytkin `ramBiasDown`: nostaa ramauskynnystä vain kun oma
joukkue **ei** ole nousulla. Vertailuajuri:

```bash
node compare-ram-down.mjs --pairs 40 --sims 60 --bias 0.3,0.5,0.7
```

Mitattu (40 peilattua paria, sims=60): `ramBiasDown ≈ 0.5` → ~57.5 %
voitto-osuus perus-Mestaria vastaan (alhaalla ramaa ~19 % vs perus ~33 %).
Yksityiskohdat: `IDEAT.md` §2b.