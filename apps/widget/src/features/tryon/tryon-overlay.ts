/**
 * Overlay try-on: mostra l'immagine composita restituita dal Cloud Rendering
 * con supporto per rotazione 360° (4 angoli) e zoom/pan.
 *
 * L'acquirente vede il capo sovrapposto alla propria foto in un overlay full-screen,
 * può ruotare il capo con drag/swipe e zoomare con scroll/pinch.
 *
 * [Source: architecture.md#Story 3.6 + 3.7]
 */

import { PRODUCT_IMAGE_SELECTORS } from '@cabina/shared';
import { createRotationHandler, type RotationHandler } from './rotation-handler';
import { createZoomHandler, type ZoomHandler, type ZoomTransform } from './zoom-handler';
import { type SizeRecommendation } from '../size/size-recommendation';
import { preselectSizeOnPage } from '../size/preselect-size';
import { getLocaleString } from '../../i18n/i18n';
import { createRevealSlider } from '../reveal-result/reveal-slider';
import { createSelectStyle } from '../reveal-result/select-style';
import { createResultActions } from '../reveal-result/result-actions';
import { createAddToCartButton } from '../reveal-result/add-to-cart';
import { tryonGenerative, type CatalogData, type TryonIdentity } from '../../api/widget-api';

let overlayElement: HTMLElement | null = null;
let rotationHandler: RotationHandler | null = null;
let zoomHandler: ZoomHandler | null = null;
let imageElements: HTMLImageElement[] = [];
let currentAngleIndex = 0;

/**
 * Il badge taglia montato adesso, qualunque sia il suo genitore.
 *
 * Serve perché inline il badge vive FUORI dall'overlay, nel riquadro del tema:
 * `overlay.remove()` non se lo porta dietro e `overlay.querySelector` non lo
 * trova. Un riferimento puntuale, e non una query
 * `document.querySelectorAll('[data-cabina-size-badge]')`, perché quella
 * toglierebbe di mezzo anche un badge non nostro — di un'altra istanza del
 * widget sulla stessa pagina, o di chiunque altro usi quell'attributo.
 * (Oggi la guardia `window.__cabinaCaricato` rende improbabile la seconda
 * istanza, ma è una guardia altrove: qui non ci si appoggia.)
 */
let sizeBadgeElement: HTMLElement | null = null;

/**
 * Contenitori che il TEMA può offrire per ospitare la prova dentro la pagina
 * prodotto, invece che in un overlay che la copre.
 *
 * Nasce dal problema originale (Arou, 2026-08-20): il senso della prova è
 * vedere il capo addosso *senza* perdere di vista le foto del prodotto e i
 * controlli d'acquisto. Un overlay `position:fixed` con fondale li nasconde
 * per definizione — abbassare l'opacità del fondale, come fatto il 07/08, ne
 * riduce il sintomo ma non lo toglie.
 *
 * Se il tema non li espone non cambia nulla: si ricade sull'overlay
 * full-screen di sempre. È l'unico modo di introdurre l'inline senza rompere
 * i negozi che montano un tema qualsiasi.
 */
const STAGE_ATTR = 'data-cabina-stage';
const SIZE_HOST_ATTR = 'data-cabina-size';
/** Marca lo stage/size che ha creato il widget, da togliere alla chiusura. */
const AUTO_ATTR = 'data-cabina-auto';

/**
 * Il riquadro visivo della foto: si sale finché i genitori sono grandi quanto
 * lei (Wix e molti temi avvolgono l'img in più livelli della stessa misura).
 */
function riquadroDellaFoto(img: HTMLElement): HTMLElement {
  const w = img.offsetWidth;
  const h = img.offsetHeight;
  let el: HTMLElement | null = img.parentElement;
  let ultimo: HTMLElement = img.parentElement ?? img;
  for (let i = 0; i < 6 && el && el !== document.body; i++) {
    if (el.offsetWidth > w + 4 || el.offsetHeight > h + 4) break;
    ultimo = el;
    el = el.parentElement;
  }
  return ultimo;
}

/**
 * Lo stage sopra la foto del prodotto, creato dal widget quando il tema non
 * espone `[data-cabina-stage]` (06/09/2026, demo Wix). Prima lo faceva a mano
 * lo snippet Custom Code; qui vale per ogni negozio in cui si trova la foto
 * (`PRODUCT_IMAGE_SELECTORS`, gli stessi dell'estrazione del capo) con una
 * misura reale. Si toglie alla chiusura: uno stage bianco lasciato lì
 * coprirebbe la foto.
 */
function creaStageSullaFoto(): HTMLElement | null {
  for (const selettore of PRODUCT_IMAGE_SELECTORS) {
    let img: HTMLElement | null = null;
    try {
      img = document.querySelector<HTMLElement>(selettore);
    } catch {
      continue;
    }
    if (!img || !img.offsetWidth || !img.offsetHeight) continue;
    const host = riquadroDellaFoto(img);
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const stage = document.createElement('div');
    stage.setAttribute(STAGE_ATTR, '');
    stage.setAttribute(AUTO_ATTR, '');
    stage.style.cssText = 'position:absolute;inset:0;z-index:1;overflow:hidden;background:#fff;';
    host.appendChild(stage);
    return stage;
  }
  return null;
}

/** La card taglia sotto il pulsante, se il tema non offre `[data-cabina-size]`. */
function creaSizeHostSottoIlPulsante(): HTMLElement | null {
  const bottone = document.querySelector<HTMLElement>('[data-cabina-widget-btn]');
  if (!bottone || !bottone.parentElement) return null;
  const host = document.createElement('div');
  host.setAttribute(SIZE_HOST_ATTR, '');
  host.setAttribute(AUTO_ATTR, '');
  bottone.insertAdjacentElement('afterend', host);
  return host;
}

function findStage(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${STAGE_ATTR}]`) ?? creaStageSullaFoto();
}

/** true quando l'overlay è montato dentro il tema, non sopra la pagina. */
function isInline(overlay: HTMLElement): boolean {
  return overlay.getAttribute('data-cabina-tryon-inline') === '';
}

/**
 * Verde fisso, **decisione di Arou del 2026-08-07**: il punteggio deve dire
 * all'acquirente «va bene così», non metterlo in guardia.
 *
 * ⚠️ Cosa questa scelta costa, scritto qui perché nessuno lo riscopra come
 * difetto: fino al 07/08 il colore *era* l'informazione — verde per un match su
 * misure dichiarate col metro, ambra per una stima AI, neutro per un consiglio a
 * cavallo fra due taglie (`SCORE_GREEN_MIN`/`SCORE_AMBER_MIN`, tuttora esportate
 * e coperte dai test di `size-recommendation`). Ora il **numero** continua a dire
 * la verità e a variare; il **colore** non distingue più i tre casi.
 *
 * Non è il difetto del 04/08, che era un verde nato per errore da soglie
 * irraggiungibili: quello era codice morto senza che nessuno lo sapesse, questo
 * è un ramo solo perché ne è stato chiesto uno solo. Per tornare ai tre colori
 * bastano le due costanti, che sono rimaste al loro posto.
 */
const SCORE_COLOR = '#4ade80';

/**
 * Costruisce lo span inline del punteggio di confidenza (Story 9.3 / AC4).
 * Formato atteso dalla localizzazione: " · 87%".
 */
function buildScoreSpan(score: number): HTMLElement {
  const el = document.createElement('span');
  el.style.cssText = `font-size:18px;font-weight:500;color:${SCORE_COLOR};margin-left:8px;`;
  el.textContent = getLocaleString('size.confidence_score', { score: String(score) });
  return el;
}

/**
 * Costruisce il badge della taglia consigliata.
 *
 * ⚠️ Fonte unica. Lo stesso markup viveva in DUE punti — la creazione
 * dell'overlay e `updateSizeBadge` — e quello che l'acquirente vede davvero è
 * quasi sempre il secondo, costruito quando la fetch delle tabelle taglie
 * ritorna. Spostare il badge cambiando solo il primo non produceva alcun
 * effetto visibile: scoperto provando, il 2026-08-03.
 */
function buildSizeBadge(recommendation: SizeRecommendation, inline = false): HTMLElement {
  // Preselezione sulla pagina prodotto (Arou, 07/08: la cabina consigliava L e
  // sulla pagina restava XS). Sta QUI e non ai due chiamanti di proposito: sono
  // gli stessi due punti che nel 2026-08-03 avevano già fatto divergere il
  // markup del badge, e il rischio si ripeterebbe identico. Il momento è quello
  // giusto — è esattamente quando il consiglio viene mostrato all'acquirente.
  //
  // ⚠️ 2026-08-10 (Arou) — spenta insieme al badge: era il badge a spiegare
  // all'acquirente perché la taglia nel menu del negozio cambiava da sola, e
  // senza spiegazione restava una scrittura silenziosa nel DOM di un sito
  // altrui — l'unica che il widget faccia.
  // ⚠️ 2026-08-13 (Arou) — **riaccesa, insieme al badge**: le due cose si
  // muovono insieme per la stessa ragione, e i due commenti si citano a
  // vicenda perché nessuno ne muova metà.
  const PRESELEZIONA_TAGLIA = true;
  if (PRESELEZIONA_TAGLIA) {
    preselectSizeOnPage(recommendation.size);
  }

  const badge = document.createElement('div');
  badge.setAttribute('data-cabina-size-badge', '');
  badge.style.cssText = [
    // ⚠️ 2026-08-13 (Arou) — il badge torna visibile: tolto il `display:none`
    // che lo nascondeva dal 10/08, e con lui torna la preselezione sulla
    // pagina prodotto (qui sopra). Le due cose si muovono insieme: i due
    // commenti si citano a vicenda perché nessuno ne muova metà.
    //
    // Sta dentro `buildSizeBadge` e non ai chiamanti perché questa è la fonte
    // unica dei due percorsi — creazione dell'overlay e `updateSizeBadge` — e
    // quello che l'acquirente vede davvero è quasi sempre il secondo: lo
    // stesso inciampo del 2026-08-03 vale per qualunque proprietà del badge.
    // ── Posizione ──
    // Sovrapposto (overlay): in basso a DESTRA sopra il risultato — decisione
    // di Arou, al centro il badge si prendeva tutta la larghezza davanti alla
    // prova, che è la cosa da guardare.
    // Inline (tema con [data-cabina-size]): il tema gli dà un posto suo sotto
    // la prova, quindi qui il badge smette di sovrapporsi e diventa una card
    // in flusso — sovrapporlo coprirebbe l'immagine senza motivo, visto che
    // lo spazio c'è.
    ...(inline
      ? ['position:static', 'width:100%', 'max-width:100%']
      : ['position:absolute', 'bottom:20px', 'right:20px', 'max-width:70%', 'z-index:2']),
    // 2026-08-07 (Arou): più trasparente, perché il box copriva i piedi della
    // modella. Il testo regge lo sfondo che si vede sotto grazie a due cose,
    // non a una: la sfocatura più forte (che appiattisce il contrasto
    // dell'immagine sottostante) e l'ombra sul testo più sotto. Abbassare la
    // sola opacità avrebbe reso il badge illeggibile sulle foto chiare.
    // Inline il fondale non è più un'immagine ma la pagina del negozio: il
    // nero pieno regge da sé, la sfocatura non ha nulla da appiattire.
    inline ? 'background:rgb(31,31,31)' : 'background:rgba(0,0,0,0.45)',
    'color:#fff',
    'padding:14px 22px',
    'border-radius:10px',
    'text-align:center',
    ...(inline
      ? []
      : [
          'text-shadow:0 1px 3px rgba(0,0,0,0.8)',
          'backdrop-filter:blur(14px)',
          '-webkit-backdrop-filter:blur(14px)',
        ]),
    'box-sizing:border-box',
    'animation:cabina-fade-in 0.3s ease-out',
  ].join(';');

  const label = document.createElement('span');
  label.style.cssText = 'display:block;font-size:13px;color:rgba(255,255,255,0.85);margin-bottom:5px;text-transform:uppercase;letter-spacing:0.5px;';
  label.textContent = getLocaleString('size.recommended_label') || 'Taglia Consigliata';

  // AC4: taglia e score sulla stessa riga (es. "M · 87%")
  const sizeLine = document.createElement('div');
  sizeLine.style.cssText = 'display:flex;align-items:baseline;justify-content:center;gap:0;';

  const sizeText = document.createElement('span');
  sizeText.style.cssText = 'font-size:26px;font-weight:700;';
  sizeText.textContent = recommendation.size;

  sizeLine.appendChild(sizeText);
  sizeLine.appendChild(buildScoreSpan(recommendation.score));

  badge.appendChild(label);
  badge.appendChild(sizeLine);

  const sub = document.createElement('span');
  sub.style.cssText = 'display:block;font-size:14px;color:rgba(255,255,255,0.85);margin-top:5px;';
  sub.textContent = recommendation.confidence === 'between' && recommendation.alternative
    ? getLocaleString('size.between', {
        size1: recommendation.alternative,
        size2: recommendation.size,
        recommended: recommendation.size,
      })
    : getLocaleString('size.recommended');
  badge.appendChild(sub);

  return badge;
}

/**
 * Costruisce e monta il badge taglia, scegliendo dove.
 *
 * ⚠️ Fonte unica dell'*ancoraggio*, per la stessa ragione per cui
 * `buildSizeBadge` è la fonte unica del markup: i percorsi che mostrano il
 * badge sono due — la creazione dell'overlay e `updateSizeBadge` — e quello
 * che l'acquirente vede davvero è quasi sempre il secondo, perché arriva con
 * la fetch delle tabelle taglie. Nel 2026-08-03 i due percorsi avevano già
 * fatto divergere il markup; con l'inline divergerebbe anche il *genitore*,
 * che è peggio: il badge finirebbe montato sull'immagine in un caso e sotto
 * nell'altro, a seconda di quale dei due percorsi ha vinto la corsa.
 */
function mountSizeBadge(
  overlay: HTMLElement,
  recommendation: SizeRecommendation,
  /** Passato in creazione, quando il riquadro non è ancora figlio dell'overlay
   *  e la query qui sotto non lo troverebbe. `updateSizeBadge` lo omette. */
  imageContainerRef?: HTMLElement,
): HTMLElement {
  const inline = isInline(overlay);

  // Inline il tema offre un posto dedicato sotto la prova. È fuori
  // dall'overlay, quindi lo si cerca nel documento e non dentro `overlay`.
  const themeHost = inline
    ? (document.querySelector<HTMLElement>(`[${SIZE_HOST_ATTR}]`) ?? creaSizeHostSottoIlPulsante())
    : null;

  // Sovrapposto: dentro il riquadro dell'immagine, non nell'overlay a tutto
  // schermo — con `right:20px` sull'overlay il badge finirebbe al bordo della
  // finestra, cioè sopra la pagina del negozio invece che sopra la prova.
  const imageContainer =
    imageContainerRef ?? overlay.querySelector<HTMLElement>('[data-cabina-tryon-image-container]');

  const badge = buildSizeBadge(recommendation, themeHost != null);
  (themeHost ?? imageContainer ?? overlay).appendChild(badge);
  sizeBadgeElement = badge;
  return badge;
}

/** Toglie il badge montato, ovunque sia finito. Idempotente. */
function removeSizeBadge(): void {
  sizeBadgeElement?.remove();
  sizeBadgeElement = null;
}

/**
 * Mostra l'overlay try-on con le immagini composite per i 4 angoli.
 *
 * @param renderResults - Array di 4 dataUrl (indice 0=0°, 1=90°, 2=180°, 3=270°).
 *                        Un elemento può essere null se il rendering per quell'angolo è fallito.
 * @param onClose - Callback chiamato quando l'utente clicca "Chiudi"
 * @param onAngleChange - Callback chiamato quando cambia l'angolo di rotazione (0-3)
 * @returns L'elemento overlay creato
 */
export function showTryOnOverlay(
  renderResults: (string | null)[],
  onClose: () => void,
  onAngleChange?: (index: number) => void,
  sizeRecommendation?: SizeRecommendation | null,
  /** Story 12.4: foto originale (acquirente o modella) per il reveal slider (AC1). */
  photoData?: string | null,
  /** Story 12.4: catalog data per select-style (AC2). Null se non disponibile. */
  catalog?: CatalogData | null,
  /** Story 12.4: resultId ultima generazione (per segnalazione AC3). */
  resultId?: string | null,
  /** Story 12.4: apiKey+baseUrl — necessari sia per lo swap capo (tryonGenerative
   *  interno) sia per il report fire-and-forget (AC2/AC3). */
  apiContext?: { apiKey: string; baseUrl: string; identity: TryonIdentity },
  /** Story 12.5: torna allo step "Cosa provi" (garment_select). Se assente
   *  (nessun caso attuale, difensivo), nessun bottone indietro è montato. */
  onBack?: () => void,
): HTMLElement {
  // Rimuovi eventuale overlay esistente (idempotente)
  removeTryOnOverlay();

  // Dove va la prova: dentro il riquadro che il tema offre, se c'è, altrimenti
  // sopra la pagina come sempre.
  const stage = findStage();
  const inline = stage != null;

  // `position:absolute; inset:0` si misura sull'antenato posizionato più
  // vicino, non sul genitore. Il tema Cabina espone lo stage su un elemento
  // già `position:absolute`, quindi lì combacia — ma il contratto
  // `[data-cabina-stage]` è pubblico, e su un tema che lo mettesse su un
  // elemento `static` la prova scapperebbe a un antenato qualsiasi, larga
  // quanto lui. Meglio garantirlo che scoprirlo dal negozio di qualcun altro.
  if (stage && getComputedStyle(stage).position === 'static') {
    stage.style.position = 'relative';
  }

  // Overlay container — inline riempie il riquadro del tema, altrimenti
  // full-screen con fondale scuro.
  const overlay = document.createElement('div');
  overlay.setAttribute('data-cabina-tryon', '');
  if (inline) overlay.setAttribute('data-cabina-tryon-inline', '');
  overlay.style.cssText = [
    // Inline: riempie il riquadro del tema, che è `position:relative` e porta
    // già le proporzioni giuste (il tema le fissa da `--cabina-stage-ratio`).
    // Niente fondale — è tutto il punto dell'inline: la pagina del negozio non
    // va oscurata, sta lì intorno e deve restare leggibile e cliccabile.
    // Niente z-index da record: dentro il flusso della pagina competerebbe con
    // header sticky e drawer del carrello del tema, e vincerebbe a sproposito.
    ...(inline
      ? ['position:absolute', 'inset:0', 'z-index:1']
      : [
          'position:fixed',
          'inset:0',
          // 2026-08-07 (Arou): da 0.85 a 0.55. Il fondale nascondeva la pagina del
          // negozio quasi del tutto, e ora dietro c'è qualcosa da vedere — la taglia
          // che la cabina ha appena preselezionato nel selettore del merchant.
          // Scelto guardando i quattro valori sopra la pagina vera del dev store:
          // a 0.65 il selettore non si legge ancora, a 0.4 la foto prodotto del
          // negozio compete con la prova. La separazione la fa l'ombra del riquadro,
          // non il buio del fondale — per questo sotto è stata rinforzata.
          'background:rgba(0,0,0,0.55)',
          'z-index:2147483645',
        ]),
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
    'animation:cabina-fade-in 0.2s ease-out',
  ].join(';');

  // Contenitore immagine con bordo e ombra — qui applichiamo le trasformazioni di zoom/pan
  const imageContainer = document.createElement('div');
  imageContainer.setAttribute('data-cabina-tryon-image-container', '');
  imageContainer.style.cssText = [
    'position:relative',
    // Inline il limite è il riquadro del tema, non la finestra. E l'ombra
    // sparisce: serviva a staccare la prova dal fondale scuro (07/08), ma
    // qui non c'è fondale — resterebbe un alone sopra la pagina del negozio.
    // Inline riempie il riquadro del tema, e sono le IMMAGINI ad adattarsi
    // dentro con `object-fit:contain`. Prima il riquadro si allargava per stare
    // dietro all'immagine e l'`overflow:hidden` dello stage tagliava quel che
    // avanzava — in pratica i piedi, che per una prova di scarpe sono tutto
    // (Arou, 2026-08-20).
    ...(inline
      ? ['width:100%', 'height:100%', 'max-width:100%', 'max-height:100%', 'border-radius:inherit']
      : ['max-width:90vw', 'max-height:90vh', 'border-radius:12px', 'box-shadow:0 12px 48px rgba(0,0,0,0.55)']),
    'overflow:hidden',
    'transition:transform 0.08s ease-out',
  ].join(';');

  // Wrapper per tutte le immagini degli angoli (posizionate una sopra l'altra)
  const imagesWrapper = document.createElement('div');
  imagesWrapper.setAttribute('data-cabina-tryon-images', '');
  imagesWrapper.style.cssText = [
    'position:relative',
    'width:100%',
    // Inline l'altezza arriva dallo stage del tema; full-screen la detta il
    // sizer qui sotto, che è l'unico figlio in flusso.
    ...(inline ? ['height:100%'] : []),
  ].join(';');

  // Story 10.4 (AC3): l'immagine visibile all'apertura è la PRIMA vista realmente
  // disponibile, non l'indice 0 fisso. Se il fronte (0) è null ma esistono viste
  // lato/retro, il box non deve aprirsi vuoto. `initialIndex` è sempre un angolo
  // con vista reale (o 0 se non ce n'è nessuno — caso già gestito a monte).
  const availableIndices = renderResults
    .map((dataUrl, index) => (dataUrl ? index : -1))
    .filter((index) => index >= 0);
  const initialIndex = availableIndices.length > 0 ? availableIndices[0]! : 0;
  currentAngleIndex = initialIndex;

  // ── Story 12.4: reveal slider sul fronte (angolo 0) ──────────────────────
  // Il reveal slider SOSTITUISCE l'<img> statico del fronte. Sugli angoli 1-3
  // nessun cambiamento (immagine statica + rotazione/zoom invariati).
  let revealSlider: ReturnType<typeof createRevealSlider> | null = null;
  let resultActions: ReturnType<typeof createResultActions> | null = null;

  // Fix (code review 12.4): confronto esplicito, non `!== null` — un
  // `renderResults[0]` `undefined` (es. array vuoto) passava comunque il
  // check e produceva `dataUrl!` = undefined più sotto.
  const hasFront = renderResults[0] != null && photoData != null;
  const isFrontAngle = initialIndex === 0;

  // Selettore capi (AC2) e azioni (AC3) sono montati fuori dal container immagine
  // per non essere affetti da zoom/pan/rotazione. Visibili solo su angolo 0.
  // `apiContext` è richiesto (non `onStyleSwap`, rimosso): lo swap capo chiama
  // `tryonGenerative` direttamente qui dentro — la vecchia indirection tramite
  // callback esterno `Promise<void>` non poteva mai restituire il nuovo URL al
  // chiamante (code review 12.4, bug architetturale bloccante).
  let bottomBar: HTMLElement | null = null;
  if (hasFront && catalog && catalog.garments.length > 0 && apiContext) {
    bottomBar = document.createElement('div');
    bottomBar.setAttribute('data-cabina-tryon-bottom-bar', '');
    bottomBar.style.cssText = [
      'position:absolute',
      'bottom:80px',
      'left:0',
      'right:0',
      'z-index:3',
      'display:flex',
      'flex-direction:column',
      'gap:8px',
      `opacity:${isFrontAngle ? '1' : '0'}`,
      `pointer-events:${isFrontAngle ? 'auto' : 'none'}`,
      'transition:opacity 0.3s ease-in-out',
    ].join(';');

    const selectStyleUI = createSelectStyle(
      catalog,
      { label: getLocaleString('reveal_result.select_style_label') },
      {
        onGarmentSelected: async (garment) => {
          // Swap capo (AC2): UN SOLO capo (non l'intero mix&match), aggiornamento
          // imperativo locale — nessun dispatch reducer, "non ricomincia il flusso".
          const swapResult = await tryonGenerative(
            apiContext.apiKey,
            apiContext.baseUrl,
            photoData!,
            [garment],
            window.location.href,
            apiContext.identity,
          );
          // Qui il silenzio è ancora la scelta giusta, al contrario del try-on
          // iniziale: l'acquirente sta già guardando un risultato valido e non
          // ha chiesto di ricominciare. Se lo swap non riesce, resta ciò che
          // vede — nessun messaggio che sostituisca un'immagine buona.
          if (!swapResult.ok) return;
          revealSlider?.updateGenerated(swapResult.url);
          resultActions?.updateResult(swapResult.url, swapResult.resultId);
        },
        getPhotoData: () => photoData ?? null,
      },
    );
    bottomBar.appendChild(selectStyleUI);

    /**
     * «Aggiungi al carrello», **prima** delle altre azioni: è il passo che
     * l'acquirente vuole fare adesso, appena visto il capo addosso. Salva e
     * condividi vengono dopo.
     *
     * 📌 Può essere `null` — se la pagina non ha un pulsante d'acquisto da
     * premere non mostriamo niente, invece di un pulsante che non compra.
     */
    const addToCart = createAddToCartButton(getLocaleString('reveal_result.add_to_cart'), {
      // La stessa uscita del pulsante ✕: dopo l'aggiunta l'acquirente deve
      // vedere il carrello del negozio — spesso un drawer che si apre da solo —
      // non restare davanti alla propria foto.
      onAdded: onClose,
    });
    if (addToCart) bottomBar.appendChild(addToCart);

    resultActions = createResultActions(
      renderResults[0]!,
      resultId ?? null,
      {
        save: getLocaleString('reveal_result.save'),
        share: getLocaleString('reveal_result.share'),
        report: getLocaleString('reveal_result.report'),
        reportConfirm: getLocaleString('reveal_result.report_confirm'),
      },
      {
        getApiContext: () => apiContext,
      },
    );
    bottomBar.appendChild(resultActions.fragment);
  }

  // ⚠️ 2026-07-29 — Elemento di misura: è l'UNICO figlio in flusso di
  // `imagesWrapper`. Senza, il box del risultato si apriva a 0x0 e l'overlay
  // restava vuoto: `imageContainer` non ha dimensioni proprie (solo `max-*`),
  // `imagesWrapper` chiedeva `height:100%` di un'altezza indefinita (= 0), e
  // TUTTI gli altri figli — le img degli angoli e il wrapper del reveal slider —
  // sono `position:absolute`, quindi non contribuiscono all'altezza. Difetto
  // presente dalla Story 10.4: il risultato non si è mai visto, né generativo né
  // di fallback. Il sizer dà al contenitore le proporzioni reali dell'immagine;
  // gli altri angoli ci si stendono sopra con `inset:0`.
  // Nessun costo di rete: stessa URL già scaricata dall'angolo iniziale.
  const sizer = document.createElement('img');
  sizer.setAttribute('data-cabina-tryon-sizer', '');
  sizer.src = renderResults[initialIndex] ?? '';
  sizer.alt = '';
  sizer.setAttribute('aria-hidden', 'true');
  sizer.style.cssText = [
    'display:block',
    'object-fit:contain',
    // ⚠️ `90vw`/`90vh` sono le misure della FINESTRA: giuste quando la prova la
    // occupa, prive di senso dentro il riquadro del tema, dove lo spazio è
    // quello dello stage. Con quei limiti il sizer prendeva la sua altezza
    // naturale, il riquadro cresceva e lo stage tagliava il fondo.
    ...(inline
      ? ['width:100%', 'height:100%', 'max-width:100%', 'max-height:100%']
      : ['max-width:90vw', 'max-height:90vh']),
    'visibility:hidden', // occupa spazio ma non si vede: a mostrare sono gli angoli sopra
  ].join(';');
  imagesWrapper.appendChild(sizer);

  // Crea un'immagine per ogni angolo — angolo 0 con slider al posto dell'img statica
  imageElements = [];
  const angleLabels = ['front', 'right', 'back', 'left'];
  renderResults.forEach((dataUrl, index) => {
    if (index === 0 && hasFront && isFrontAngle) {
      // Angolo 0 con foto originale → reveal slider invece di img statica
      const slider = createRevealSlider(photoData!, dataUrl!);
      const wrapper = document.createElement('div');
      wrapper.setAttribute('data-cabina-angle', String(index));
      wrapper.style.cssText = [
        'position:absolute',
        'inset:0',
        'transition:opacity 0.3s ease-in-out',
        'opacity:1',
      ].join(';');
      wrapper.appendChild(slider.fragment);
      imagesWrapper.appendChild(wrapper);
      imageElements.push(wrapper as unknown as HTMLImageElement);
      revealSlider = slider;
      return;
    }

    const img = document.createElement('img');
    img.setAttribute('data-cabina-tryon-image', '');
    img.setAttribute('data-cabina-angle', String(index));
    img.src = dataUrl ?? ''; // Se null, src vuoto (mostrato solo se = currentAngle)
    img.alt = `Try-on preview — ${angleLabels[index]}`;
    img.style.cssText = [
      'display:block',
      'max-width:100%',
      inline ? 'max-height:100%' : 'max-height:90vh',
      'object-fit:contain',
      'position:absolute',
      'inset:0',
      'transition:opacity 0.3s ease-in-out',
      // Solo l'angolo iniziale (prima vista disponibile) è visibile
      `opacity:${index === initialIndex ? '1' : '0'}`,
    ].join(';');

    // Story 10.4 (AC3): un angolo senza vista disponibile (null) NON viene mostrato
    // e NON ricade sull'angolo 0 (niente capo ruotato finto). La rotazione cicla
    // solo tra gli angoli reali, quindi non ci si sposta mai su un'immagine vuota.
    if (!dataUrl) {
      img.style.opacity = '0';
    }

    imagesWrapper.appendChild(img);
    imageElements.push(img);
  });

  imageContainer.appendChild(imagesWrapper);

  // ── Rotation Handler ──────────────────────────────────────────────────
  // Attiva la rotazione solo se almeno 2 angoli sono disponibili; altrimenti
  // drag/swipe resterebbe abilitato ma mostrerebbe sempre la stessa immagine.
  // Story 10.4 (AC3): il ciclo è limitato ai soli indici con vista reale, e parte
  // dall'angolo iniziale effettivamente mostrato.

  if (availableIndices.length >= 2) {
    rotationHandler = createRotationHandler(
      {
        onAngleChange: (index: number) => {
          currentAngleIndex = index;
          imageElements.forEach((img, i) => {
            img.style.opacity = i === index ? '1' : '0';
          });
          // Fix (code review 12.4): la barra select-style/azioni ha senso solo
          // sul fronte (angolo 0) — va aggiornata ad OGNI cambio angolo, non
          // solo impostata una volta al montaggio iniziale.
          if (bottomBar) {
            const onFront = index === 0;
            bottomBar.style.opacity = onFront ? '1' : '0';
            bottomBar.style.pointerEvents = onFront ? 'auto' : 'none';
          }
          onAngleChange?.(index);
        },
      },
      availableIndices,
      initialIndex,
    );
    rotationHandler.attach(overlay);
  }

  // ── Zoom Handler ──────────────────────────────────────────────────────

  zoomHandler = createZoomHandler({
    onTransformChange: (transform: ZoomTransform) => {
      imageContainer.style.transform = `scale(${transform.scale}) translate(${transform.translateX}px, ${transform.translateY}px)`;
    },
  });
  zoomHandler.attach(imageContainer);

  // ── Bottone chiudi (X in alto a destra) ───────────────────────────────
  // Fondo SCURO, non bianco traslucido: full-screen il fondale è nero e il
  // bianco si vedeva; inline le bande ai lati del riquadro del tema sono
  // chiare e la ✕ era invisibile (Arou, 2026-08-22). Il nero traslucido regge
  // su entrambi, come già fa il badge taglia.

  const closeButton = document.createElement('button');
  closeButton.setAttribute('data-cabina-tryon-close', '');
  closeButton.textContent = '✕';
  closeButton.setAttribute('aria-label', 'Close try-on');
  closeButton.style.cssText = [
    'position:absolute',
    'top:12px',
    'right:12px',
    'width:36px',
    'height:36px',
    'border-radius:50%',
    'border:none',
    'background:rgba(0,0,0,0.45)',
    'color:#fff',
    'font-size:18px',
    'line-height:1',
    'cursor:pointer',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'transition:background 0.15s ease',
    'backdrop-filter:blur(4px)',
    '-webkit-backdrop-filter:blur(4px)',
    'z-index:1',
  ].join(';');

  // Hover effect via event listeners
  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.background = 'rgba(0,0,0,0.65)';
  });
  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.background = 'rgba(0,0,0,0.45)';
  });

  closeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    onClose();
  });

  imageContainer.appendChild(closeButton);

  // ── Bottone indietro (← in alto a sinistra, simmetrico al chiudi) ─────
  // Story 12.5 (Task 2.4): torna allo step "Cosa provi" preservando il
  // risultato corrente (BACK non lo azzera, machine.ts).
  if (onBack) {
    const backButton = document.createElement('button');
    backButton.setAttribute('data-cabina-tryon-back', '');
    backButton.textContent = '←';
    backButton.setAttribute('aria-label', getLocaleString('common.back'));
    backButton.style.cssText = [
      'position:absolute',
      'top:12px',
      'left:12px',
      'width:36px',
      'height:36px',
      'border-radius:50%',
      'border:none',
      'background:rgba(0,0,0,0.45)',
      'color:#fff',
      'font-size:18px',
      'line-height:1',
      'cursor:pointer',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'transition:background 0.15s ease',
      'backdrop-filter:blur(4px)',
      '-webkit-backdrop-filter:blur(4px)',
      'z-index:1',
    ].join(';');

    backButton.addEventListener('mouseenter', () => {
      backButton.style.background = 'rgba(0,0,0,0.65)';
    });
    backButton.addEventListener('mouseleave', () => {
      backButton.style.background = 'rgba(0,0,0,0.45)';
    });

    backButton.addEventListener('click', (e) => {
      e.stopPropagation();
      onBack();
    });

    imageContainer.appendChild(backButton);
  }

  // Click sullo sfondo chiude — solo full-screen. Inline "lo sfondo" sono le
  // bande ai lati della prova dentro il riquadro del tema: chiuderla da lì
  // sarebbe un click distruttivo su qualcosa che non sembra un fondale. Il
  // pulsante ✕ resta e basta a sé.
  if (!inline) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        onClose();
      }
    });
  }

  // ── Size Recommendation Badge (Story 4.2) ─────────────────────────────

  let badgeElement: HTMLElement | null = null;
  if (sizeRecommendation) {
    // Ancoraggio in `mountSizeBadge`, mai qui: è l'altro dei due percorsi che
    // mostrano il badge, e devono restare d'accordo su dove va.
    badgeElement = mountSizeBadge(overlay, sizeRecommendation, imageContainer);
  }

  // Keyboard: Escape chiude
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
  // Salva il listener per cleanup
  (overlay as unknown as Record<string, unknown>).__escHandler = escHandler;

  overlay.appendChild(imageContainer);
  // Fix (code review 12.4): bottomBar era costruita ma mai montata nel DOM —
  // sibling di imageContainer (non figlio) per restare immune a zoom/pan.
  if (bottomBar) overlay.appendChild(bottomBar);
  (stage ?? document.body).appendChild(overlay);

  // Inietta animazione CSS se non già presente
  if (!document.getElementById('cabina-tryon-styles')) {
    const style = document.createElement('style');
    style.id = 'cabina-tryon-styles';
    style.textContent = `
      @keyframes cabina-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  overlayElement = overlay;
  return overlay;
}

/**
 * Aggiorna il badge di size recommendation nell'overlay esistente.
 * Se l'overlay non è attivo, non fa nulla.
 */
export function updateSizeBadge(recommendation: SizeRecommendation | null): void {
  if (!overlayElement) return;

  // Inline il badge vive FUORI dall'overlay (nel riquadro del tema), quindi
  // cercarlo dentro `overlayElement` ne lascerebbe uno vecchio in pagina a
  // ogni aggiornamento. Il riferimento sa dov'è finito.
  removeSizeBadge();

  if (!recommendation) return;

  // Stessa àncora della creazione — `mountSizeBadge` è la fonte unica.
  mountSizeBadge(overlayElement, recommendation);
}

/**
 * Rimuove l'overlay try-on dal DOM e tutti i listener associati.
 */
export function removeTryOnOverlay(): void {
  if (overlayElement) {
    // Rimuovi il listener Escape
    const handler = (overlayElement as unknown as Record<string, unknown>).__escHandler as
      | ((e: KeyboardEvent) => void)
      | undefined;
    if (handler) {
      document.removeEventListener('keydown', handler);
    }

    // Rimuovi rotation e zoom handler
    if (rotationHandler) {
      rotationHandler.detach();
      rotationHandler = null;
    }
    if (zoomHandler) {
      zoomHandler.detach();
      zoomHandler = null;
    }

    // Inline il badge taglia è montato nel riquadro del TEMA, fuori
    // dall'overlay: `overlay.remove()` non se lo porta dietro e resterebbe in
    // pagina una taglia consigliata orfana, senza più la prova che la spiega.
    removeSizeBadge();

    overlayElement.remove();
    overlayElement = null;
    imageElements = [];
    currentAngleIndex = 0;
  }

  // Lo stage e la card creati dal widget (non dal tema) se ne vanno con la
  // prova, sempre — anche senza overlay o senza listener Escape: uno stage
  // bianco lasciato sopra la foto la coprirebbe (rilievo Kilo, PR #204).
  document.querySelectorAll(`[${AUTO_ATTR}]`).forEach((el) => el.remove());
}