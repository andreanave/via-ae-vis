# RF Coaching (futuro Via ae Vis)

App con cui un coach segue i propri atleti: allenamento scritto nell'app, piano alimentare digitalizzato dal PDF del professionista, check-in, chat.

- **Frontend:** React + Vite, PWA, pubblicato su GitHub Pages a ogni push su `main`.
- **Backend:** Supabase (accesso, Postgres con Row Level Security, file privati, tempo reale).
- **Marchio:** nome, logo e colori in `src/config/brand.js` (più `public/icon.svg`).

## Sviluppo

```bash
npm install
npm run dev      # app in locale
npm test         # test, comprese le regole di accesso del database (PGlite)
npm run build
```

## Database

Le migrazioni sono in `supabase/migrations/`. Il workflow `database.yml` le applica al progetto Supabase
quando cambiano su `main`, usando i segreti `SUPABASE_ACCESS_TOKEN` e `SUPABASE_DB_PASSWORD`.

Nel browser c'è solo la chiave pubblica (`publishable`). Chiavi segrete, PDF personali e dati degli atleti
non vanno mai in questa repository.

## Fasi

Il piano completo è nel documento "Piano di sviluppo Via ae Vis". Stato: fase 0 (base) e prima parte della fase 1 (accessi).
