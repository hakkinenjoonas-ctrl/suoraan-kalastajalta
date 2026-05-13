# Julkaisun Testitaulukko

Kayta tata taulukkoa ennen julkaisua. Merkitse jokainen kohta `OK`, `EI OK` tai `N/A`, ja kirjoita tarvittaessa huomio.

| # | Testi | Missa testataan | Odotettu lopputulos | Tulos | Huomiot |
|---|---|---|---|---|---|
| 1 | Uusi ostaja rekisteroityy | Puhelin / emulaattori | Rekisteroityminen onnistuu ja ostaja paasee heti appiin ilman yllapitajan hyvaksyntaa |  |  |
| 2 | Uusi kalastaja rekisteroityy | Puhelin / emulaattori | Rekisteroityminen onnistuu ja kalastaja paasee heti appiin ilman yllapitajan hyvaksyntaa |  |  |
| 3 | Uusi kayttaja nakyy yllapitajalle | Selain | Uusi ostaja tai kalastaja nakyy `Kayttajat`-valilehdella ilman erillista hyvaksyntaa |  |  |
| 4 | Kalastaja kirjautuu sisaan | Puhelin | Kirjautuminen onnistuu ja valilehdet toimivat |  |  |
| 5 | Ostaja kirjautuu sisaan | Puhelin / emulaattori | Kirjautuminen onnistuu ja tarjoukset-nakyma latautuu oikein |  |  |
| 6 | Kalastaja tallentaa saaliin ilman myyntia | Puhelin | Saalis tallentuu ilman virhetta |  |  |
| 7 | Kalastaja tallentaa saaliin ja lahettaa tarjouksen | Puhelin | Saalis tallentuu ja tarjous lahtee oikeille ostajille |  |  |
| 8 | Tarjous saapuu ostajalle appiin | Puhelin / emulaattori | Tarjous nakyy `Tarjoukset`-listassa |  |  |
| 9 | Tarjous saapuu ostajalle sahkopostiin | Oikea sahkoposti | Sahkoposti tulee ja linkki avautuu oikein |  |  |
| 10 | Push-ilmoitus saapuu ostajalle | Oikea puhelin | Push tulee aanella ja avaa appin oikein |  |  |
| 11 | Ostaja ei voi varata ilman omia tietoja | Puhelin / emulaattori | Punainen viesti nakyy nappien ylapuolella ja `Omat tiedot` aukeaa |  |  |
| 12 | Ostaja tayttaa omat tiedot | Puhelin / selain | Tallennus onnistuu ja pakolliset kentat validioituvat oikein |  |  |
| 13 | Ostaja voi asettaa min kg / max kg | Selain / puhelin | Kentat nakyvat, tallentuvat ja `0` = ei rajaa |  |  |
| 14 | Ostaja varaa yksilajisen eran | Puhelin / emulaattori | Varaus onnistuu ja nakyy kalastajalle |  |  |
| 15 | Ostaja tekee vastatarjouksen yksilajisesta erasta | Puhelin / emulaattori | Vastatarjous onnistuu ja ALV 0 % / sis. ALV lasketaan oikein |  |  |
| 16 | Ostaja tekee vastatarjouksen ravuista | Puhelin / emulaattori | Yksikko on `€/kpl`, ei `€/kg` |  |  |
| 17 | Kalastaja saa ilmoituksen ostajan varauksesta / vastatarjouksesta | Puhelin | Ilmoitus tulee appiin oikein |  |  |
| 18 | Kalastaja hyvaksyy varauksen | Puhelin | Hyvaksytty kauppa nakyy ostajalle oikein |  |  |
| 19 | Ostaja nakee kalastajan tiedot hyvaksytyssa kaupassa | Puhelin | Nimi, Y-tunnus, yhteystiedot ja erätiedot nakyvat |  |  |
| 20 | Eratunnus rivittyy oikein mobiilissa | Puhelin | Eratunnus ei mene paallekain muiden tietojen kanssa |  |  |
| 21 | Ostaja kuittaa erän vastaanotetuksi | Puhelin | Toiminto onnistuu ja kalastajalle lahtee ilmoitus laskutusvalmiudesta |  |  |
| 22 | Kalastaja tekee laskun apissa | Selain / puhelin | Lasku muodostuu oikein |  |  |
| 23 | Ostaja nakee laskun `Laskut`-valilehdella | Puhelin / selain | Lasku nakyy oikeilla tiedoilla |  |  |
| 24 | Ostaja avaa PDF-laskun | Puhelin / selain | PDF aukeaa, ei kuollutta nappia |  |  |
| 25 | Kalastaja merkitsee laskun maksetuksi | Selain / puhelin | Lasku siirtyy maksettuihin eika sotke ownerin komissioita |  |  |
| 26 | Owner nakee komission oikein | Selain | Kaupan arvo ja 3 % komissio lasketaan oikein |  |  |
| 27 | Monilajisen eraan komissio | Selain | Monilajisen erän kaupan arvo ja komissio eivät ole nollia |  |  |
| 28 | Ostajaraportti muodostuu | Selain / puhelin | Raportissa nakyvat oikeat lajit, maarat ja keskihinnat |  |  |
| 29 | Virallinen saalisraportti muodostuu | Selain | Raportti muodostuu ilman puuttuvia pakollisia tietoja |  |  |
| 30 | Virallisessa raportissa kalastajan tiedot nakyvat | Selain | Kalastajan nimi, yritys, tunnukset ja yhteystiedot ovat mukana |  |  |
| 31 | Pyydyskoodit ovat oikein virallisessa raportissa | Selain | Koodit vastaavat virallista ohjetta |  |  |
| 32 | Troolin raportointi | Selain / puhelin | Troolausaika + vetonopeus tallentuvat ja raportoidaan oikein |  |  |
| 33 | Nuotan raportointi | Selain / puhelin | Nuottausaika + vetonopeus tallentuvat ja raportoidaan oikein |  |  |
| 34 | Verkon lisakentat | Selain / puhelin | Solmuvali ja tarvittavat lisatiedot tallentuvat oikein |  |  |
| 35 | Etiketin tulostus Munbylla | Oikea puhelin + Munby | Tulostuu juuri viimeksi valitulla etiketilla |  |  |
| 36 | QR-koodi Androidilla | Oikea puhelin | QR avaa eran tiedot eika vaaria toimintoja |  |  |
| 37 | QR-koodi iPhonella | Oikea iPhone | QR avaa eran tiedot eika Mailia |  |  |
| 38 | Vaakasuuntainen valilehtirivi | Puhelin | Kayttaja huomaa vihjeen `Lisaa ->` ja voi pyyhkaista lisaa valilehtia |  |  |
| 39 | Ostajan poistaminen ownerina | Selain | Ostaja poistuu kokonaan eika voi kirjautua sisaan |  |  |
| 40 | Kayttajan poistaminen ownerina | Selain | Kayttaja poistuu kokonaan eika voi kirjautua sisaan |  |  |

## Julkaisupaatos

### Valmis julkaisuun
- Kaikki kriittiset kohdat 1-10, 14-27, 29-37 = `OK`

### Viela korjattavaa ennen julkaisua
- Jos yksikin kriittinen kohta on `EI OK`

### Suositellut kriittiset kohdat
- 7, 8, 9, 10
- 14, 15, 18, 21
- 22, 23, 24, 26
- 29, 30, 31
- 35, 36, 37
