# MaJa Kitchen

Web app responsive per gestire la dispensa, le ricette, il piano settimanale dei pasti e la lista della spesa condivisa.

## Requisiti

- Node.js `^22.22.3`, `^24.15.0` oppure `>=26.0.0`
- npm 10 o successivo

## Avvio locale

```bash
npm install
cp .env.example .env
npm start
```

Apri <http://localhost:4200>. Se `.env` non contiene entrambe le credenziali Supabase, l’app usa i dati demo salvati nel browser (`localStorage`). Con Supabase configurato, accedi o crea un account e segui la procedura per creare la casa.

Per predisporre le credenziali pubbliche Supabase, inserisci in `.env`:

```dotenv
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<publishable-or-anon-key>
```

La chiave `service_role` non deve mai essere usata nel frontend.

## Database Supabase

Lo script completo è `supabase/setup.sql`. Eseguilo da **Supabase Dashboard → SQL Editor**; non serve collegare la CLI. Crea tabelle, vincoli, policy RLS, controlli per household, le funzioni RPC e Realtime sulla lista. Se avevi già eseguito una versione precedente, riesegui lo script aggiornato: migra gli ingredienti delle ricette al solo nome e rende facoltative le quantità della lista fino alla spesa.

Le ricette non prevedono dosi. La lista generata contiene gli ingredienti delle ricette pianificate; puoi rimuovere ciò che hai già e indicare quantità e unità quando acquisti gli articoli. Solo gli articoli acquistati con quantità inserita vengono aggiunti alla dispensa.

Per importare il ricettario, esegui `supabase/import_ricettario.sql` dopo `setup.sql`. Lo script è già impostato sulla casa configurata; per importare in un’altra casa, aggiorna il relativo ID. L’importazione aggiunge titoli, ingredienti senza dosi e procedure sintetiche; se eseguito di nuovo, completa quelle ricette che non hanno ancora istruzioni.

Il piano genera un piatto principale e un contorno separato per ogni pranzo e cena. Dopo la migrazione aggiornata, riesegui `setup.sql` e poi `import_ricettario.sql`: le 16 ricette di contorno vengono incluse nel piano e gli ingredienti di entrambi i piatti entrano nella lista della spesa. I piani già salvati senza contorno vanno rigenerati o completati prima dell’approvazione.

L’app gestisce registrazione/accesso, creazione iniziale della casa e dati remoti condivisi con RLS. L’invito del secondo account non è ancora incluso.

## Comandi

```bash
npm start
npm run build
```

I test unitari non sono inclusi, come richiesto.
