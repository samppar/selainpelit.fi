# Omat tekoälyohjeet — tuppibotin strategia (Samppa)

Nämä ovat **omia strategialinjauksiani** tuppibotille. Osa on aitoja omia
oivalluksiani (analyysia pelin säännöistä), osa taas soveltaa lähdeoppaita
(Oulun Seniorit / Antti Auer -strategiaopas ja Atso Suopajärven *Tupen
todennäköisyysanalyysi*). Alla ne on eroteltu rehellisesti.

Toteutettu: `players/probabilityPlayer.js` ("Analyytikko") ja
`players/strategyPlayer.js` ("Seniori"). Kytkimet A/B-vertailuun: `track`
(korttilaskenta), `aggressiveUp` (rohkea rami ylhäällä), `advanced`
(vastustajaluenta).

---

## A. Omat oivallukseni (ei suoraan oppaissa)

### A1. Ylhäällä ryöstö on vaaraton → maksimoi voittotodennäköisyys
Kun oma joukkue on nousulla, epäonnistuneen tai ryöstetyn ramin kustannus on
**vain nousun romahtaminen nollille** — vastustaja ei pankkaa eikä hyödy ryöstön
tuplauksesta (`_applyNousu`: häviäjän haarassa `points` heitetään roskiin).
Tämä on suora johtopäätös pisteytyssäännöistä, ei oppaista.

**Seuraus:** ramivarovaisuus (nolo turvallisempana) EI päde ylhäällä. Päätös
typistyy: kummassa muodossa on suurempi todennäköisyys voittaa seuraava jako —
rami vai nolo? Valitse se. Pöytäpelissä/kuopassa varovaisuus taas pätee (siellä
ryöstö oikeasti antaa vastustajalle tuplapisteet).
*Mitattu: Seniorilla selvä parannus, Analyytikolla neutraali.*

### A2. Molemmat vastustajat tyhjä maasta → ilmainen tikki
Looginen päätelmä: koska tupessa ei ole valttia, jos MOLEMMAT vastustajat ovat
sakanneet jonkin maan, mikä tahansa siitä maasta johdettu kortti voittaa tikin
varmasti. Ramissa: johda halvin (voitat ilmaiseksi, säästä kovat). Nolossa:
vältä sitä maata (jäisit itse voittamaan).

### A3. Ramaaja säilyttää johdon ottamalla tikin kaverin yli
Jos olet itse ramannut, voi olla järkevää ottaa tikki itselle **vaikka kaveri
laittoi jo suurimman** — koska voittajana päätät seuraavan tikin maan. Johdon
hallinta on ramissa arvokasta. Kannattaa vain jos: on tuottava jatko (boss
kotiutettavana / ilmaistikkimaa), otat sen halvalla (ei-kuvakortilla) etkä hukkaa
oikeaa voittajaa, eikä tikki ole viimeinen.

---

## B. Sovelluksia oppaista (toteutin, mutta idea on lähteessä)

### B1. Korttilaskenta — boss-kortit
*(Molemmat oppaat: "pidä muistissa mitä kortteja on mennyt".)* Muista pelatut
kortit → boss-kortti = maan korkein jäljellä oleva. Kotiuta se ramissa (varma
tikki); Nolossa älä koskaan johda boss-kortilla, ja sakatessa pudota boss-kortit
ensin. *Mitattu ratkaisevaksi: ~72 % voitto laskennattomasta versiosta tupessa.*

### B2. Pelaajakohtaiset voidit ja leikkaus
*(Auer: "arvioi kenellä on mistäkin maasta kiinniotot/ulosannit".)*
`voidsFromHistory` + `unseenInSuit`: älä johda maahan, jonka vastustaja voi vielä
leikata (ohittaa korkeammalla).

### B3. Kaverin signaali
*(Auer: "ratkaiseva vihje on, millä kortilla kaveri aloittaa".)* Lyö takaisin
kaverin aloittamaa (toivomaa) maata, kun sinulla on siellä varma kortti.

### B4. Nolo: tyhjennä lyhyt maa ja auta kaveria sakkaamaan
*(Auer, Nolo-osio: "aloita maasta jota on vähiten"; "jos 1 kortti maata, pääset
sakkaamaan heti"; "lyö takaisin kaverin maata, jotta hän pääsee sakkaamaan".)*
Perusaloitus lyhimmästä maasta oli Seniorissa alusta asti. Pelaajakohtaista
void-tietoa hyödyntävä kaverin auttaminen (johda maata josta *kaveri* on tyhjä)
ja orvon kuvakortin tyhjennys lisättiin `advanced`-kerroksessa.

---

## Tärkeysjärjestys (mitattu, oikea tuppi)

1. **Korttilaskenta / boss-kotiutus** (B1) — ratkaiseva.
2. **Todennäköisyystarjous** (pisteet/kuvat/jalalliset, Suopajärvi) — keskisuuri.
3. **Vastustajaluenta + kaverikoordinaatio** (A2, A3, B2–B4) — pieni–keskisuuri
   (~56 % head-to-head).
4. **Aggressiivinen rami ylhäällä** (A1) — hienosäätö.
