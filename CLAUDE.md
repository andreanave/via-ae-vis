# CLAUDE.md

Istruzioni per Claude (e per chiunque sviluppi) su questa repository. Rispondere e scrivere testi dell'app in italiano.

## Il prodotto

Via ae Vis (nome provvisorio "RF Coaching"): app con cui un coach segue i propri atleti.
Atleta sul telefono (PWA), coach soprattutto da PC. Allenamento scritto nell'app e registrato anche offline,
piano alimentare importato dal PDF Fiber del nutrizionista, check-in settimanali, chat e notifiche.
Il piano di sviluppo a fasi è nel documento "Piano di sviluppo Via ae Vis" (fasi 0-6).

## Stack e comandi

- React 19 + Vite 7, PWA con `vite-plugin-pwa`, `HashRouter` (GitHub Pages non gestisce le rotte).
- Supabase: accesso, Postgres con Row Level Security, storage privato, realtime, edge functions.
- Pubblicazione: GitHub Pages a ogni push su `main` (`.github/workflows/deploy.yml`).
- Migrazioni: `supabase/migrations/`, applicate da `.github/workflows/database.yml` quando cambiano su `main`.

```bash
npm install
npm run dev     # app in locale
npm test        # vitest, comprese le regole RLS su PGlite (tests/rls.test.js)
npm run build
```

## Dove sta cosa

- `src/features/`, `src/lib/`, `supabase/`, `tests/`: logica, dati, database e test.
- `src/styles/`, `src/ui/`, `src/config/brand.js`: grafica, componenti e marchio.
  I token CSS esistenti (`--bg`, `--surface`, `--text`, `--accent`...) restano come alias:
  avvisare prima di rinominare classi o token.
- Nome, logo e colori del marchio solo in `src/config/brand.js` e `public/icon.svg`.

## Regole di lavoro

1. Ogni modifica passa da un branch e da una pull request in bozza. Niente push diretti su `main`.
2. Database: le migrazioni si scrivono come file in `supabase/migrations/` con test RLS in `tests/`,
   e vengono applicate solo dalla GitHub Action dopo il merge.
   Il connettore Supabase si usa liberamente solo per leggere (tabelle, log, avvisi di sicurezza e prestazioni).
   Qualunque scrittura diretta sul progetto Supabase richiede l'OK esplicito del proprietario.
3. Ogni nuova tabella ha RLS attiva e un test che prova cosa può e non può vedere ciascun ruolo.
4. Nel browser c'è solo la chiave `publishable`. Chiavi segrete, PDF personali e dati degli atleti
   non entrano mai nella repository, nei log o nelle issue.
5. Dati degli atleti, soprattutto quelli sulla salute, non vanno mai nelle richieste a servizi esterni
   (Context7, ricerca web, scanner ospitati). Per test e demo si usano dati finti.
6. Mobile first: tap di almeno 48px (56px nelle schermate da palestra), tema chiaro e scuro.
   Il test finale su Safari di un iPhone vero è manuale e nessuno strumento lo sostituisce.
7. Niente nuove dipendenze senza un motivo chiaro; preferire ciò che c'è già.
8. Non installare plugin, skill o connettori senza l'approvazione del proprietario.

## Strumenti di Claude da usare

| Bisogno | Strumento |
|---|---|
| Schema, log e avvisi del database | Connettore Supabase (solo lettura, vedi regola 2) |
| Documentazione aggiornata di React, Vite, supabase-js, Workbox, pdf.js | Context7 |
| Test nel browser, screenshot a misura di telefono, prova offline | Playwright |
| Riferimenti di schermate e flussi di app reali | Mobbin |
| Direzione visiva e nuove schermate | skill `frontend-design`, `design:design-system` |
| Revisione di schermate, testi e accessibilità | `design:design-critique`, `design:ux-copy`, `design:accessibility-review` |
| Revisione del codice prima del merge | `/code-review`, `/security-review` |
| Lettura e test del PDF Fiber | skill `pdf` |
| Piani, specifiche, documenti | Claude Docs |

Rimandati, da valutare solo se servono: WebAbility o Axe (accessibilità), Icons8 (illustrazioni),
Sentry (errori in produzione), PostHog (analytics), Expo (eventuale app nativa per HealthKit e Health Connect).
Per le icone basta una libreria open source come Lucide.
