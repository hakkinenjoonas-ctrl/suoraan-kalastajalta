# Kuluttajamyynnin laki- ja GDPR-tarkistus 9.9.2026

Tämä on toteutukseen perustuva compliance-tarkistus, ei asianajotoimiston oikeudellinen lausunto. Lopullinen julkaisu kannattaa hyväksyttää suomalaisella tietosuoja- ja kuluttajaoikeuteen perehtyneellä juristilla.

## Tarkastettu toteutus

Kuluttajasta kerätään varauksessa nimi, sähköposti, puhelinnumero, vapaaehtoinen viesti sekä tuotetta, määrää, painoa, hintaa, ALV:tä, noutoa, maksutapaa ja varauksen tilaa koskevat tiedot. Varaus voidaan tehdä ilman tiliä. Tilille tallentuvat lisäksi tunnistautumistiedot, käyttäjätunniste, nimi, sähköposti, rooli ja käyttöehtojen hyväksymistieto.

Kalaeräilmoitukset ovat erillinen vapaaehtoinen toiminto. Niihin tallennetaan käyttäjä, kalalaji, paikkakunta, suostumuksen versio ja ajat sekä viestien toimituslokit ja mahdollinen push-tunniste. Markkinointi lähetetään sähköpostilla ja push-ilmoituksena. Varausvahvistukset ja peruutusviestit ovat sopimuksen toteuttamiseen liittyviä palveluviestejä.

Kuluttajan varaus- ja yhteystiedot näkyvät kyseisen erän kalastajalle. Palvelun ylläpitäjä käyttää tietoja lisäksi varausvahvistuksiin, komission laskentaan ja hallinnolliseen raportointiin.

## Toteutetut korjaukset

- Vierasvarauksen yhteyteen lisättiin käyttöehtojen hyväksyntä ja tietosuojainformaatio ennen varausta.
- Maksullisen varauksen painike muutettiin ilmaisemaan maksuvelvollisuus.
- Tietosuojaselosteen lukeminen erotettiin markkinointisuostumuksesta ja käyttöehtojen hyväksymisestä.
- Kalaeräilmoitusten suostumusteksti täsmennettiin vapaaehtoiseksi sähköposti- ja push-markkinointisuostumukseksi.
- Käyttäjälle lisättiin toiminto kaikkien kalaeräilmoitusten lopettamiseen.
- Suostumuksen versio, antamisaika ja peruuttamisaika tallennetaan auditointia varten.
- Jokaiseen kalaeräilmoitussähköpostiin lisättiin lopetusohje, asetussivun linkki, yhteysosoite ja List-Unsubscribe-otsake.
- Rekisteröitymiseen tallennettava ehtoversio päivitettiin päivään 9.9.2026.
- Julkiseen kalaerään ja varausvahvistukseen lisättiin profiilista yritysmyyjän nimi, Y-tunnus, osoite, sähköposti ja puhelin. Uuden julkaistavan kuluttajaerän luonti estetään, jos tiedot puuttuvat.
- Laadittiin julkaistava korvaava tietosuojaseloste ja käyttöehdot.

## Ennen kuluttajamyynnin laajaa julkaisua korjattavat puutteet

### 1. Aiemmin julkaistujen erien myyjätiedot on tarkistettava

Uusien erien pakolliset myyjätiedot tarkistetaan julkaisussa ja näytetään kuluttajalle. Ennen tarkistuksen käyttöönottoa julkaistujen aktiivisten erien taustalla olevat kalastajaprofiilit on käytävä läpi. Puutteellinen erä tulee täydentää tai keskeyttää, jotta kuluttajalle ei näytetä vajaata myyjäkokonaisuutta.

### 2. Kalan pakolliset ennakkotiedot eivät kaikki näy kuluttajan tilauspolussa

Julkisessa kuluttajaerässä tulee näyttää soveltuvin osin kalan kauppanimi ja tieteellinen nimi, tuotantomenetelmä, pyyntialue, pyydystyyppi, sulatustieto sekä pakatun tuotteen muut pakolliset elintarviketiedot. Etämyynnissä pakattujen elintarvikkeiden pakolliset tiedot on annettava ennen kauppaa lukuun ottamatta erikseen sallittuja muuttuvia tietoja. Nykyinen erätunnus ei yksin korvaa näitä tietoja.

### 3. Kuluttajan oma peruutustoiminto puuttuu

Ehtoluonnos antaa maksuttoman peruutusmahdollisuuden tilausmääräaikaan asti. Käyttöliittymään tulee lisätä tätä vastaava peruutuspainike Omiin varauksiin ja vierasvaraukselle turvallinen peruutuslinkki tai muu helppo menettely. Vaihtoehtoisesti ehtokohta on muutettava vastaamaan hyväksyttyä liiketoimintamallia ennen julkaisua. Nopeasti pilaantuvalla tuotteella ei ole lakisääteistä 14 päivän peruuttamisoikeutta, mutta siitä on kerrottava ennen tilausta.

### 4. Sopimusvahvistuksen ehdot tulee toimittaa pysyvällä tavalla

Sähköpostivahvistukseen lisättiin myyjän yhteystiedot, tieto nopeasti pilaantuvan tuotteen peruuttamisoikeuden puuttumisesta ja ehtolinkki. Pelkkä muuttuva verkkolinkki ei välttämättä täytä pysyvän välineen vaatimusta koko säilytysajan. Julkaistu ehtoversio kannattaa siksi liittää vahvistukseen PDF-tiedostona tai tallentaa muuttumattomana ehtoversioon sidottuun osoitteeseen.

### 5. Säilytysaikojen poistoajot tulee toteuttaa

Uusi seloste määrittelee tavoiteajat, mutta tietokannassa ei löytynyt automaattista elinkaaripoistoa kuluttajavarausten yhteystiedoille, ilmoitusten toimituslokeille tai teknisille lokeille. Ajastetut poistot tai anonymisoinnit ja dokumentoitu poikkeusmenettely on toteutettava ennen kuin teksti voidaan katsoa toteutusta täysin vastaavaksi.

### 6. Kuluttajatilin poistaminen tulee varmistaa päästä päähän

Yleisessä sovelluksessa on tilin poistotoiminto, mutta kuluttajan erillisessä näkymässä ei ole vastaavaa painiketta. Lisäksi kuluttajatilin poistaminen on testattava tilanteessa, jossa tiliin liittyy säilytettäviä varauksia: tarpeettomat yhteystiedot poistetaan tai anonymisoidaan, mutta kirjanpito- ja oikeusvaadetiedot säilytetään vain tarpeellisessa laajuudessa.

### 7. Rekisterinpitäjä–käsittelijä- ja siirtodokumentaatio

Supabasen, Resendin, Vercelin, Googlen, Applen ja muiden tosiasiallisten toimittajien roolit, käsittelysopimukset, sijainnit ja EU/ETA-siirtoperusteet on koottava sisäiseen käsittelytoimien selosteeseen. Julkisen selosteen yleinen sanamuoto ei korvaa näitä velvoitteita.

### 8. Google Sites -evästeet

Nykyinen tietosuojasivu on Google Sitesissa, joka näyttää oman evästeilmoituksensa ja kertoo liikenneanalytiikasta. Rekisterinpitäjän tulee kartoittaa ei-välttämättömät evästeet ja varmistaa, ettei niitä aseteta ennen asianmukaista suostumusta. Myös sovelluksen ja julkisen markkinapaikan analytiikka on tarkistettava erikseen.

### 9. Kalastustuotteiden suoramyynnin määrärajojen automaattinen valvonta puuttuu

Ruokaviraston ohjeen mukaan kaupallinen kalastaja saa luovuttaa alkutuotannon kalastustuotteita suoraan kuluttajille enintään 5 000 kg vuodessa. Merikalastuksessa raja on lisäksi enintään 30 kg yhtä ostosta kohden. Palvelu tarkistaa eräkohtaisen saldon, mutta siitä ei löytynyt kalastaja- ja vuosikohtaista 5 000 kg:n valvontaa eikä merikalastuksen 30 kg:n ostokohtaista estoa. Vesi-/toimintatyyppi, vuosisumma ja ostosraja on validoitava palvelimella tai kuluttajamyynti rajattava vain tapauksiin, joissa poikkeussäännöt eivät sovellu.

## Keskeiset lähteet

- EU:n yleinen tietosuoja-asetus 2016/679, erityisesti 5, 6, 7, 12–14, 15–22, 28 ja 44–49 artikla: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- Laki sähköisen viestinnän palveluista 917/2014, erityisesti 200 ja 203 §: https://www.finlex.fi/fi/lainsaadanto/2014/917
- KKV, kuluttajalle annettavat tiedot ja niiden esittäminen verkkokaupoissa: https://www.kkv.fi/kuluttaja-asiat/tietoa-ja-ohjeita-yrityksille/verkkokauppiaille/kuluttajalle-annettavat-tiedot-ja-niiden-esittaminen-verkkokaupoissa/
- KKV, verkon markkinapaikka-alustat: https://www.kkv.fi/kuluttaja-asiat/verkkokauppa/verkon-markkinapaikka-alustat/
- KKV, peruuttamisoikeus ja nopeasti pilaantuvat tuotteet: https://www.kkv.fi/kuluttaja-asiat/tietoa-ja-ohjeita-yrityksille/verkkokauppiaille/peruuttamisoikeus-ja-peruuttamisaika/
- Ruokavirasto, Kalastustuoteohje, luku 11: https://www.ruokavirasto.fi/elintarvikkeet/oppaat/kalastustuoteohje/kalastustuoteohje/
- Ruokavirasto, kalastustuotteiden suoramyynti kuluttajille: https://www.ruokavirasto.fi/yritykset/oppaat/alkutuotanto/7.-vesiviljely-ja-kalastus/7.-vesiviljelyn-ja-kalastuksen-erityisvaatimukset
