Agisci come sviluppatore senior full-stack. Devi aiutarmi a costruire da zero una web app chiamata "MaJa Kitchen" per gestire la dispensa/frigo, le ricette e la pianificazione settimanale dei pasti e della spesa. L'app la useremo io e la mia compagna.

## Prima di scrivere codice

1. Se qualcosa è ambiguo, fammi al massimo 5 domande mirate, poi procedi.
2. Proponi un piano di implementazione a step (modello dati, architettura, schermate, ordine di sviluppo) e aspetta il mio OK.
3. Lavora poi per step piccoli e verificabili, spiegando brevemente cosa hai fatto a ogni step.

## Obiettivo

App per due persone (stessa casa), responsive e usabile bene da smartphone, che:

- tiene traccia di cosa abbiamo in dispensa/frigo/freezer
- permette di inserire e gestire le nostre ricette
- genera un piano settimanale dei pasti variato
- genera la lista della spesa in base a ciò che manca per le ricette pianificate
- NON applica mai nulla in automatico: piano e lista vanno prima rivisti e approvati da noi

## Stack

- Angular (ultima versione stabile, standalone components, signals) + TypeScript strict
- Supabase (Postgres + Auth + RLS + Realtime) come backend
- UI: Angular Material o Tailwind (proponimi la scelta migliore e motivala in 2 righe)
- Test unitari per la logica di business (generazione piano, calcolo spesa)

## Database e migrazioni

- La Supabase CLI è già installata, autenticata e il progetto è già collegato (`supabase link`). Verifica con un comando che sia così prima di iniziare.
- Gestisci tutto lo schema tramite migrazioni in `supabase/migrations`, create con `npx supabase migration new <nome>`. Niente modifiche manuali fuori dalle migrazioni.
- Prima di applicare una migrazione, mostrami l'SQL e aspetta la mia conferma; poi esegui `npx supabase db push`.
- Includi le policy RLS in ogni migrazione che crea tabelle.
- Non scrivere mai chiavi o password nel codice o nel prompt: usa variabili d'ambiente (`.env`, già nel `.gitignore`) e crea un `.env.example`. Nel frontend usa solo la anon key; la service_role key non deve mai finire nel client.
- Aggiungi dati di esempio (seed) per ingredienti e alcune ricette, così posso provare subito l'app.

## Funzionalità

### 1. Dispensa

- CRUD degli ingredienti presenti: nome, quantità, unità di misura (g, kg, ml, l, pz, ecc.), luogo (dispensa / frigo / freezer), data di scadenza opzionale
- Evidenzia gli articoli in scadenza (es. entro 3 giorni) e dai loro priorità nella generazione del piano pasti
- Ricerca e filtri per luogo e scadenza

### 2. Ricette

- CRUD ricette: titolo, descrizione, porzioni, tempo di preparazione, categoria (colazione / pranzo / cena / altro), tag (es. veloce, vegetariano), istruzioni a step
- Ingredienti della ricetta con quantità e unità, collegati al catalogo ingredienti (evita duplicati tipo "pomodoro"/"pomodori")
- Possibilità di segnare una ricetta come preferita o "escludila dal piano"
- Vista "cosa posso cucinare ora": ricette realizzabili con quello che abbiamo già (completamente o con pochi ingredienti mancanti)

### 3. Piano settimanale dei pasti

- Genera una proposta per i 7 giorni, con slot configurabili (es. pranzo e cena)
- Logica di varietà:
  - evita di ripetere la stessa ricetta nella stessa settimana (salvo poche ricette ripetibili o se il catalogo è piccolo)
  - penalizza le ricette cucinate nelle ultime 2-3 settimane (mantieni lo storico)
  - dà priorità a ricette che usano ingredienti in scadenza o già presenti
  - la ripetizione di una ricetta tra settimane diverse è ammessa, solo non deve essere la norma
- Ogni proposta ha uno stato: bozza → approvata. Finché è in bozza possiamo:
  - sostituire una singola ricetta (con una nuova proposta o scegliendola noi)
  - spostare/scambiare ricette tra giorni
  - rimuovere un pasto o bloccarne alcuni ("lock") e rigenerare solo il resto
- Solo dopo l'approvazione il piano diventa quello attivo e viene salvato nello storico

### 4. Lista della spesa

- Viene calcolata dal piano approvato: ingredienti necessari – ingredienti già in dispensa (con conversione tra unità compatibili e somma delle quantità duplicate)
- Anche qui flusso bozza → revisione → approvazione:
  - possiamo eliminare voci, modificare quantità, aggiungere voci manuali
  - raggruppamento per categoria (frutta/verdura, latticini, ecc.)
- A lista approvata si possono spuntare gli articoli mentre si fa la spesa; con un'azione esplicita "spesa completata" gli articoli acquistati vengono aggiunti alla dispensa
- Esportazione/condivisione semplice (copia come testo)

### 5. Condivisione tra due utenti

- Ogni persona ha il suo account, ma entrambi accedono allo stesso "household": dispensa, ricette, piani, liste e storico sono condivisi
- Modello semplice: un household con due membri (invito via email o codice); RLS Supabase basata sull'appartenenza all'household
- L'approvazione di piano e lista può farla uno dei due; mostra chi ha approvato e quando
- Aggiornamenti in tempo reale (Supabase Realtime) almeno sulla lista della spesa, così possiamo spuntare gli articoli insieme al supermercato

## Modello dati (proponi lo schema SQL)

Indicativamente: households, household_members, ingredients, pantry_items, recipes, recipe_ingredients, meal_plans (status draft/approved, approved_by), meal_plan_entries (data, slot, recipe_id, locked), shopping_lists (status), shopping_list_items, cooking_history. Tutte le tabelle collegate a household_id. Presentami lo schema prima di creare le migrazioni.

## Requisiti non funzionali

- Codice pulito, tipizzato, organizzato per feature; logica di generazione piano/spesa in servizi puri e testabili, separata dalla UI
- Algoritmo di generazione deterministico e spiegabile (punteggio per ricetta con pesi configurabili), senza dipendere da AI esterne nella v1; lascia però un punto di estensione per suggerimenti AI in futuro
- Gestione errori e stati di caricamento/vuoto curati
- Branding: nome "MaJa Kitchen" in header, titolo pagina e manifest; proponi una palette e un logo testuale semplice
- README con setup, variabili d'ambiente e comandi

## Fuori scope v1

Più di due membri per household, scansione barcode, integrazione con supermercati, calcolo calorie.

Parti con le domande iniziali e il piano a step.
