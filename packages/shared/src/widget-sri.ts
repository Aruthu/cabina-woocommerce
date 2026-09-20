/**
 * Impronta sha384 dell'ultimo bundle widget rilasciato (`apps/widget/dist/widget.iife.js`).
 *
 * ⚠️ **2026-08-07 — NON è più un attributo `integrity`, e cambiarla non rompe
 * più nessun negozio.** Serviva a fissare l'SRI negli snippet e nei plugin, ma
 * l'hash restava **congelato all'installazione** mentre l'URL del bundle non è
 * versionato: al primo rilascio nuovo il browser rifiutava lo script e la cabina
 * spariva dal negozio, in silenzio e senza un canale per avvisare il merchant.
 * Su Shopify e Wix non è mai esistito (lo ScriptTag non porta attributi custom),
 * quindi la rimozione ha allineato gli altri canali a com'era già lì.
 *
 * **A cosa serve oggi, e perché va comunque tenuta aggiornata**: è l'impronta
 * con cui `scripts/check-prod.mjs` confronta il bundle *servito* in produzione
 * con quello committato, per stabilire se un deploy è davvero arrivato. È
 * l'unico modo di verificarlo senza sondare il dominio in loop — cosa che il
 * 30/07 ha causato 20 minuti di fermo su tutti i negozi. Il gate CI la protegge
 * dal drift.
 *
 * ⚠️ **Cosa si è perso**: l'SRI difendeva dal caso «bundle manomesso sul CDN».
 * Si accetta perché il bundle è servito dal nostro stesso deploy Vercel su
 * HTTPS, non da un CDN di terzi — e perché una protezione che rende il prodotto
 * inservibile a ogni rilascio non è una protezione, è un guasto programmato.
 * Se un domani servisse davvero, la strada è un **URL versionato**
 * (`widget-<versione>.iife.js`) con l'hash che cambia insieme all'URL, più un
 * bump del plugin a ogni rilascio — che però lega gli hotfix ai tempi di review
 * dei marketplace.
 *
 * ⚠️ **STORICAMENTE** il build non era byte-identico tra Windows e Linux: i chunk
 * col nome content-hashed (`vision_bundle-*.js`, MediaPipe) uscivano diversi, e
 * l'unico valore buono era quello del job CI su linux. La nota diceva di non
 * rigenerarlo mai in locale.
 *
 * ✅ **2026-09-04 — oggi coincidono, e si può calcolarlo in locale.** Verificato
 * su due build consecutive: l'hash di una build Windows è risultato *identico* a
 * quello stampato dal CI. La ragione sta in `apps/widget/dist/`, che ormai
 * contiene **un solo** `widget.iife.js` e **nessun** chunk col nome
 * content-hashed — `vision_bundle` non c'è più. Sparita la causa, sparita la
 * divergenza.
 *
 * 🔑 In pratica: `npm run build -w apps/widget && npm run sri`, e si committa il
 * valore **insieme** alle modifiche del widget. Cosi' il gate passa al primo
 * colpo, invece del giro «push → CI rosso → leggo l'hash → ripush» che a ogni
 * modifica del widget manda una notifica di fallimento.
 *
 * ⛔ **Se un domani `dist/` tornasse a contenere chunk col nome content-hashed,
 * torna a valere la regola vecchia**: in quel caso il CI fallisce e il log dello
 * step riporta il valore "Reale" corretto da incollare qui — che resta comunque
 * la fonte autorevole quando i due numeri non combaciano.
 *
 * Non serve però aspettare il CI: lo stesso hash si ottiene in locale riproducendo
 * il build su Linux in un container, su una COPIA del repo (mai sul repo stesso:
 * `npm ci` dentro il container sostituirebbe i `node_modules` di Windows con binari
 * Linux). Comando usato il 2026-08-03:
 *
 *   docker run --rm -v "<copia-del-repo>:/repo" -w /repo node:20 bash -lc \
 *     "npm ci --include-workspace-root -w apps/widget -w packages/shared && \
 *      npm run build -w apps/widget && node scripts/generate-sri.mjs apps/widget/dist/widget.iife.js"
 *
 * Quel giro ha prodotto un hash IDENTICO alla build Windows — per questo bundle i
 * due ambienti coincidono. Resta comunque la regola: verificare su Linux, non
 * dedurre, perché la divergenza dipende dalle dipendenze del momento.
 */
// ⚠️ 2026-08-04 — la fonte storica di divergenza Windows/Linux era proprio il
// chunk `vision_bundle-*.js` citato sopra: veniva da MediaPipe, che è stato
// RIMOSSO dal widget (vedi `docs/wiki/stima-misure.md`). Il bundle è ora un
// file singolo senza chunk content-hashed, quindi i due ambienti non hanno più
// motivo di divergere. Resta il check CI come gate: se sbaglia, il log riporta
// il valore reale.
// ⚠️ 2026-08-06 — rigenerato dopo la riscrittura del punteggio di affidabilità
// (`size-recommendation.ts` + `tryon-overlay.ts`): **qualunque** modifica al
// sorgente del widget cambia il bundle, non solo quelle a `packages/shared`.
// Valore da build Windows: se il job CI "Verifica SRI widget" lo contesta,
// incollare il "Reale" che stampa lui — è quello l'autorità.
// ⚠️ 2026-08-06 (2) — rigenerato di nuovo per la riga sulla postura in
// `PhotoCapture.ts` (una `<p>` di testo: basta quella).
// ⚠️ 2026-08-09 — rigenerato per il fix del consiglio taglia (a cavallo → la
// maggiore, `size-recommendation.ts`). Valore da build Windows: se il CI lo
// contesta, incollare il «Reale» che stampa lui.
// ⚠️ 2026-08-09 (2) — rigenerato per la rimozione esplicita dei vestiti
// (`removeExisting` in garment-select / widget-api / select-style).
// ⚠️ 2026-08-10 — rigenerato per la guardia sul doppio caricamento
// (`window.__cabinaCaricato` in `index.ts`), che nasce dal passaggio a theme app
// extension: i negozi Shopify installati prima hanno ancora il vecchio
// ScriptTag e senza guardia caricherebbero il bundle due volte.
// ⚠️ 2026-08-10 (2) — rigenerato per il consiglio taglia messo a riposo
// (richiesta di Arou): badge `display:none` e preselezione sulla pagina
// prodotto spenta, entrambi in `tryon-overlay.ts`. Il bundle cala di ~1 KB
// perché `preselectSizeOnPage` non è più raggiungibile e il tree-shaking la
// elimina — il codice resta nel repo, con i suoi sei test.
// ⚠️ 2026-08-12 — rigenerato per `garmentPhotoType` (PR #85: `widget-api.ts` +
// `garment-select.ts`). Il valore era rimasto quello di prima della PR: il gate
// CI non l'ha segnalato perché lo step `lint` fallisce PRIMA — la PR aveva
// riscritto `WidgetEvent` rimuovendo eventi ancora emessi, quindi il job moriva
// su `tsc` e non arrivava mai né al build né a questa verifica. Misurato: la
// build del commit pre-PR (fe45fda) riproduce esattamente l'hash committato,
// quindi il drift veniva dalle modifiche runtime della PR, non da questo fix.
// Valore da build Windows: se il job CI lo contesta, incollare il «Reale».
// ⚠️ 2026-08-13 — rigenerato per il consiglio taglia riattivato (richiesta di
// Arou): badge di nuovo visibile e preselezione sulla pagina prodotto
// riaccesa, entrambi in `tryon-overlay.ts` — l'inverso esatto del riposo del
// 10/08. Il bundle ricresce di ~1 KB perché `preselectSizeOnPage` torna
// raggiungibile e il tree-shaking non la elimina più.
// Valore da build Windows: se il job CI lo contesta, incollare il «Reale».
// ⚠️ 2026-08-13 (2) — rigenerato per `remove_existing` legato alla categoria
// (`garment-select.ts` + `select-style.ts`): su tops/bottoms la rimozione non si
// chiede più, perché FASHN ridisegnava la regione rimossa inventandoci collane e
// cinture (due prove in produzione su due, render_id 732049284003 e 92aa1ea3dc90).
// ⚠️ 2026-08-13 (3) — rigenerato di nuovo dopo la code review Kilo: il fix
// copriva due strade su tre (il bottone «Applica» del mix&match cablava ancora
// `true`) e il timeout del client è salito a 100s per restare sopra il tetto per
// passo del server, che a 75s scattava per primo facendo pagare render che
// l'acquirente non vedeva più.
// ⚠️ 2026-08-15 — rigenerato per il passaggio del consenso a **PrunaAI**:
// `CURRENT_PHOTO_CONSENT_VERSION` sale a 2, quindi chi aveva già acconsentito
// per fal.ai viene richiesto. La costante è nel bundle, e cambiarla lo cambia.
// 📌 Verificato che l'impronta calcolata dal job CI (Linux) coincide con quella
// del build Windows: stavolta non divergono, ma il controllo va fatto lo stesso
// — è il motivo per cui questa nota esiste.
// ⚠️ 2026-08-17 — rigenerato per la cabina a **tre schermate**: via la modale di
// consenso iniziale e il gate generativo (due stati interi), via «Scatta foto»
// col suo percorso `getUserMedia`, via «Continua» e via il salvataggio delle
// misure sul dispositivo; dentro, la spunta di consenso sulla schermata foto.
// `CURRENT_PHOTO_CONSENT_VERSION` sale a **3**: chi aveva acconsentito alla v2
// aveva autorizzato meno di quanto il testo nuovo dichiara, e viene richiesto.
// ⚠️ 2026-08-17 (2) — rigenerato per la spiegazione del bottone spento: era in un
// `title` sul bottone `disabled`, dove nessun browser la mostra, e ora è un
// paragrafo `role="status"` sotto il bottone. Cambia il codice del widget, non
// solo i dizionari (quelli sono file copiati in `dist/locales/` e non toccano
// l'impronta).
// ⚠️ 2026-08-17 (3) — e rigenerato di nuovo poche ore dopo: quel paragrafo veniva
// **nascosto** con `display:none` a consenso dato, il che toglie la live region
// dall'albero di accessibilità e rende l'annuncio del suo ritorno inaffidabile.
// Ora si svuota e basta.
// Valore da build Windows: se il job CI lo contesta, incollare il «Reale».
// ⚠️ 2026-08-19 — rigenerato per il debito #29: `footwear` esce dalla lista delle
// categorie che fanno comparire la nota «potrebbe non supportare il try-on»
// (`widget.ts`). Una stringa in meno in un array, e il bundle cambia: la lezione
// del 06/08 («basta una `<p>`») vale anche al contrario, per ciò che si toglie.
// 📌 Questo valore NON viene da una build Windows fidata alla cieca: è lo stesso
// che ha stampato il job CI (Linux) fallendo sul drift — confrontati carattere per
// carattere prima di incollarlo, non dedotti uguali.
// ⚠️ 2026-08-19 (2) — rigenerato di nuovo dopo la code review Kilo: la lista è
// uscita dalla funzione ed è diventata `CATEGORIE_CON_AVVISO` esportata, per
// poterla coprire con un test. Valore da build Windows: il giro precedente di
// oggi ha dato lo stesso hash del job Linux, ma è una constatazione su quel
// bundle, non una regola — se il CI contesta, incollare il «Reale».
// ⚠️ 2026-08-20 — rigenerato per la prova montata DENTRO la pagina prodotto:
// `showTryOnOverlay` (`tryon-overlay.ts`) cerca `[data-cabina-stage]` e, se il
// tema lo espone, monta lì con `position:absolute` e senza fondale invece che in
// un overlay full-screen. Senza il contenitore non cambia nulla, quindi i temi
// che non lo offrono non vedono differenza — ma il bundle sì.
// Valore da build Windows: se il job CI lo contesta, incollare il «Reale».
// ⚠️ 2026-08-20 (2) — rigenerato dopo la code review Kilo sulla PR #126: il
// badge taglia si rimuove ora per riferimento e non con una query globale su
// `[data-cabina-size-badge]` (che avrebbe tolto anche badge non nostri), e lo
// stage del tema viene reso `position:relative` se è statico, altrimenti
// `inset:0` si misurerebbe su un antenato qualsiasi.
// ⚠️ 2026-08-20 (3) — rigenerato per l'apertura automatica da `?cabina=prova`
// (`apriSeChiestoDallUrl` in `widget.ts`), che serve al badge "Prova" sulle card
// di collezione del tema: si arriva sulla pagina prodotto e la cabina si apre da
// sé. Il parametro viene consumato con `history.replaceState`, o una ricarica
// riaprirebbe la cabina spendendo crediti che nessuno ha chiesto.
// ⚠️ 2026-08-20 (4) — rigenerato per la guardia sul referrer dell'apertura
// automatica (`arrivaDalNegozio` in `widget.ts`, rilievo della review su #127):
// `?cabina=prova` apre solo se si arriva da una pagina dello stesso negozio.
// Aprire conta una sessione del piano, e quando le sessioni finiscono il widget
// si spegne per tutti: quel link incollato fuori dal negozio ne avrebbe aperta
// una per ogni persona che lo tocca.
// ⚠️ 2026-08-20 (5) — rigenerato per il rifiuto diagnosticabile della guardia
// referrer: confronto su hostname invece che origin (lo schema qui non dice
// nulla) e `console.debug` quando l'apertura automatica non scatta. Una guardia
// che nega in silenzio lascia chi collauda a dedurre il perché, ed è la forma
// di guasto che questo progetto ha già pagato più volte.
// ⚠️ 2026-08-20 (6) — rigenerato per due rilievi sulla guardia referrer:
// confronto su `host` invece di `hostname` (ignorare lo schema è voluto,
// ignorare la porta no), e il referrer grezzo non finisce più in console — è
// un URL, e gli URL si portano dietro query string con token.
// ⚠️ 2026-08-20 (7) — rigenerato perche inline la prova non si misura piu in
// unita di viewport: `90vw`/`90vh` sono la FINESTRA, mentre dentro il riquadro
// del tema lo spazio e lo stage, che ha `overflow:hidden`. Con quei limiti
// l'immagine prendeva la sua altezza naturale e il fondo veniva tagliato via:
// i piedi, che per una prova di scarpe sono l'unica cosa che conta.
// ⚠️ 2026-08-20 (8) — rigenerato per il pomello del confronto portato da 36 a
// 48px: dentro il riquadro del tema la prova e piu piccola che a tutto schermo,
// e a 36 il pomello si perdeva sulla foto. Chi non lo nota vede meta risultato
// e se ne va senza sapere che c'era un confronto da trascinare.
// ⚠️ 2026-08-20 (9) — rigenerato perche il pomello del confronto e diventato
// afferrabile: aveva `pointer-events:none`, quindi il bersaglio era 48px e
// l'area di presa 4 (la larghezza della maniglia sotto). Chi mirava al cerchio
// e trascinava non otteneva nulla.
// ⚠️ 2026-08-22 — rigenerato per il consenso **v4** e i due campi nuovi verso
// `tryon-generative` (`photoSource`, `consentVersion`): dopo la generazione un
// giudice vision manda a Novita l'immagine PRODOTTA — la sembianza
// dell'acquirente col capo addosso — per bocciare i sorteggi sbagliati del
// motore prima che restino in cache. Il testo v3 nominava Novita solo per le
// misure: chi l'aveva accettato viene richiesto, e la route non fa guardare al
// giudice una foto vera sotto la v4. Cambiano i dizionari (che non toccano
// l'impronta) E il codice (che la tocca).
// Valore da build Windows: se il job CI lo contesta, incollare il «Reale».
// ⚠️ 2026-08-22 (2) — rigenerato per due ritocchi visti alla prima prova con
// foto vera: la ✕ e la ← della prova inline passano a fondo scuro (bianco
// traslucido sulle bande chiare del tema era invisibile), e la nota «spunta il
// consenso per caricare la foto» sale sotto la casella, in ambra.
// ⚠️ 2026-08-22 (3) — la nota sale ancora: in testa, sotto «La tua foto», e
// dice cosa accettare («Accetta i termini e condizioni e l'informativa
// privacy per caricare la tua foto»): la casella non si spunta al posto
// dell'acquirente. Cambiano dizionari e codice.
// ⚠️ 2026-08-22 (4) — la casella del consenso nasce VUOTA ogni volta: prima
// rinasceva spuntata dal `localStorage`, e l'acquirente la trovava accettata al
// posto suo. Il salvataggio resta per la stessa visita e come traccia.
export const WIDGET_SRI = 'sha384-Dwec0IP7W1GqmgftM3P3JhuIEOLjJ+Mn2XiQk3ZFCR/Rh8ufzxGcSEDhxuBhaXrg';

/**
 * URL pubblico del bundle widget. Fonte unica per snippet manuale, ScriptTag
 * Shopify, embed Wix e plugin PHP — prima erano hardcoded in 6 punti su DUE
 * domini incoerenti (`cdn.cabina.io` e `widget.cabina.ai`), nessuno dei quali
 * è mai esistito nel DNS.
 *
 * Serviamo dalla cartella `public/` del dashboard (distribuita dall'edge CDN
 * di Vercel) e non da un sottodominio dedicato: il widget risolve i propri
 * asset (`/locales/*.json`, `/models/*`) sul `baseUrl` che riceve dallo script
 * tag, quindi un CDN separato lascerebbe comunque gli asset qui — due origini
 * per sessione invece di una.
 *
 * ⚠️ `www`, NON l'apex: `cabina.io` risponde 308 verso `www` e **un redirect
 * non porta gli header CORS**. Con `crossorigin="anonymous"` (obbligatorio
 * perché l'SRI sia applicato) il browser blocca la richiesta prima di seguirlo:
 * verificato con Playwright da un'origine terza, `cabina.io` → ERR_FAILED,
 * `www.cabina.io` → bundle eseguito. Vale per ogni URL che il widget usa
 * cross-origin, non solo per questo.
 */
export const WIDGET_URL = 'https://www.cabina.io/widget.iife.js';
