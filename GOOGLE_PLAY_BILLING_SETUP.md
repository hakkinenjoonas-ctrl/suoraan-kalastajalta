# Google Play Billing -käyttöönotto

Premium-tuotetunnus on `fisher_premium_monthly` ja Android-paketti on
`fi.suoraankalastajalta.app`.

## 1. Tietokanta ja varmennuspalvelu

1. Ota käyttöön migraatio `supabase/migrations/2026072001_secure_fisher_premium_and_google_play.sql`.
2. Anna nykyiselle FCM-palvelutilille Play Consolessa oikeus tarkastella tilauksia ja
   hallita tilauksia/tilausmaksuja. Supabasessa olevia `FCM_CLIENT_EMAIL`- ja
   `FCM_PRIVATE_KEY`-salaisuuksia käytetään automaattisesti.
3. Jos myöhemmin halutaan käyttää erillistä Google Play -palvelutiliä, sen koko JSON
   voidaan tallentaa Supabasen salaisuudeksi. Älä lisää JSON-tiedostoa repositorioon:

   ```sh
   supabase secrets set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON='<koko JSON>'
   ```

4. Julkaise varmennusfunktio:

   ```sh
   supabase functions deploy verify-google-play-subscription
   ```

## 2. Android-paketti

1. Rakenna web-sisältö ja synkronoi Android:

   ```sh
   npm run build
   npm run sync:android
   ```

2. Allekirjoita version 3 / 1.0.2 AAB nykyisellä upload-avaimella
   `android/suoraan-kalastajalta-upload.jks` Android Studiossa. Älä tallenna
   salasanoja Git-repositorioon.
3. Lähetä allekirjoitettu AAB ensin Play Consolen sisäiseen testaukseen.

## 3. Tilaustuote Play Consolessa

Kun Billing-tuettu AAB on käsitelty:

1. Avaa **Kaupallista Playn avulla > Tuotteet > Tilaukset**.
2. Luo tilaus tunnuksella `fisher_premium_monthly`.
3. Luo automaattisesti uusiutuva yhden kuukauden peruspaketti.
4. Aseta Suomen hinnaksi 12,99 euroa kuukaudessa ja aktivoi tuote.
5. Lisää testikäyttäjä lisenssitestaajaksi ja sisäisen testauksen käyttäjäksi.

Oston jälkeen Android lähettää ostotunnisteen Supabase-funktiolle. Funktio tarkistaa
tilauksen Googlelta, kuittaa uuden ostoksen ja avaa Premiumin vasta onnistuneen
palvelinvarmennuksen jälkeen. Admin-oikeus säilyy erillisenä testi- ja
poikkeusmekanismina.
