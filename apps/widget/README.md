# @cabina/widget

Widget embedded per il virtual try-on. Si integra come singolo file IIFE (`widget.js`) sul negozio del merchant — zero dipendenze runtime, bundle <50KB.

## Stack

- **Linguaggio:** TypeScript (target ES2020)
- **Build:** Vite 7 → IIFE single-file
- **i18n:** JSON lazy-loaded per lingua (IT, EN, FR, ES, DE)
- **Test:** Vitest

## Build

```bash
# Dalla root del monorepo
npm run build

# Solo widget
npx turbo build --filter=@cabina/widget

# Dev (hot reload)
npx turbo dev --filter=@cabina/widget
```

Output: `dist/widget.js` + `dist/locales/*.json`

Dopo il build, genera l'hash SRI dalla root:
```bash
npm run sri
```

## Integrazione (snippet manuale)

```html
<script
  src="https://cabina.io/widget.js"
  integrity="sha384-<hash>"
  crossorigin="anonymous"
  data-api-key="<merchant-api-key>"
></script>
```

Opzionale: `data-api-url` per sovrascrivere l'URL base (default `https://cabina.io`).

## Integrazione Shopify (ScriptTag)

Shopify ScriptTag non supporta `data-*` attributes — il widget legge i parametri dai query string come fallback:

```
https://cabina.io/widget.js?cabina_api_key=<key>&cabina_api_url=<url>
```

## Struttura

```
src/
├── index.ts          — entry point: legge api-key, chiama initWidget()
├── widget.ts         — state machine principale + iniezione pulsante nel DOM
│
├── api/
│   └── widget-api.ts — fetch config, sessioni, render, tabelle taglie
│
├── features/
│   ├── avatar/       — form misure acquirente + localStorage
│   ├── consent/      — consent banner foto GDPR
│   ├── photo/        — PhotoCapture (upload o camera)
│   ├── size/         — taglia consigliata
│   └── tryon/        — overlay risultato try-on
│
├── i18n/
│   ├── i18n.ts       — loadLocale(), getLocaleString()
│   └── *.json        — file lingua (it, en, fr, es, de)
│
├── state/
│   ├── machine.ts    — reducer
│   └── types.ts      — WidgetContext
│
└── utils/
    ├── browser.ts    — check compatibilità + link aggiornamento
    ├── sanitize.ts   — prevenzione XSS
    └── validation.ts — validazione input misure
```

## Flusso acquirente

1. Pulsante "Prova" iniettato **subito dopo il blocco d'acquisto** del tema
   (`BUTTON_ANCHORS` in `@cabina/shared`); `[data-cabina-target]` è la scelta
   esplicita del merchant e vince su tutto, `body` è l'ultima spiaggia
2. Schermata foto: spunta di consenso e caricamento — **oppure** una modella
   preset, che non richiede consenso perché non c'è nessuna foto personale
3. L'AI Vision stima le misure dalla foto → campi pre-compilati
4. Schermata revisione misure
5. Try-on generativo. **Nessun fallback**: un fallimento si vede, e porta con
   sé la causa (crediti finiti / consenso negato / servizio giù)
6. Taglia consigliata dalla tabella taglie del merchant

⚠️ Questo elenco era fermo a luglio: prometteva un «consent banner», lo scatto
da camera e un «overlay risultato» di ripiego, tutti e tre rimossi tra il 02 e il
17/08. La versione per i merchant sta su <https://cabina.io/en/docs>, e quella
per gli agent su `/en/docs/agent.md`.

## Localizzazione

La lingua viene rilevata in cascata:
1. `document.documentElement.lang`
2. `navigator.language`
3. `default_language` configurato dal merchant
4. Fallback: `en`

I file locale vengono caricati dinamicamente (<5KB ciascuno).

## Note tecniche

- Le misure vengono salvate in `localStorage` (mai server-side)
- Il peso è opzionale nel form misure
- Il widget avvisa l'acquirente se il browser non è compatibile invece di scomparire silenziosamente
- Input sanitizzati prima di ogni operazione DOM
