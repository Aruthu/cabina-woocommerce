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
import { trovaTaglia } from '../size/preselect-size';
import { getLocaleString, getLocaleStringDefault, getLocaleStringOr } from '../../i18n/i18n';
import { createRevealSlider } from '../reveal-result/reveal-slider';
import { createSelectStyle } from '../reveal-result/select-style';
import { createResultActions } from '../reveal-result/result-actions';
import { createAddToCartButton } from '../reveal-result/add-to-cart';
import { tryonGenerative, type CatalogData, type TryonIdentity } from '../../api/widget-api';
import { leggiProdottiNegozio, proposteOutfit, handleDellaPagina, comeCapoSelezionato } from '../outfit/outfit';
import { createOutfitPanel } from '../outfit/outfit-panel';
import type { GarmentCategory, SelectedGarment } from '../../state/types';

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
/** La barra delle azioni: inline vive nello slot del tema, fuori dall'overlay (24/09). */
let bottomBarElement: HTMLElement | null = null;
let barraObserver: ResizeObserver | null = null;
/** Spazio fra il riquadro e la barra a tutto schermo: è il `gap` dell'overlay
 *  ED è quello che l'osservatore sottrae al riquadro — un numero solo. */
const SPAZIO_BARRA = 10;

/**
 * Percentuale accanto alla taglia: SPENTA di default dal 18/09/2026 (Arou).
 * Il numero è scelto a occhio, non tarato su persone vere, e «95%» su una
 * taglia sbagliata costa più credibilità di nessun numero. Il merchant che la
 * vuole la accende dalla dashboard (`widget_configs.show_size_score`); il
 * widget la imposta qui all'avvio, dalla config pubblica.
 */
let showSizeScore = false;
export function setShowSizeScore(value: boolean): void {
  showSizeScore = value;
}

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
/** Nero pieno del badge E della barra quando stanno in flusso sulla pagina del
 *  negozio (inline): sul bianco un nero al 60% sfocato usciva grigio (24/09). */
const NERO_INLINE = 'rgb(31,31,31)';

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
  // Preselezione sulla pagina prodotto: dal 07/08 la taglia consigliata veniva
  // scelta da sola nel selettore del negozio (spenta il 10/08, riaccesa il
  // 13/08 insieme al badge).
  // ⚠️ 2026-09-23 (Arou, collaudo con Mem): **non più da sola**. «Cabina
  // consiglia la taglia, il cliente deve confermare se va bene o no, e può
  // prenderne un'altra.» Nel collaudo la pagina è passata da L a XL senza che
  // l'acquirente toccasse niente. Ora il badge offre un pulsante «Scegli XL»
  // (sotto, `buildSizeChoice`) e la scrittura nel DOM del negozio parte solo da
  // quel tocco.
  const badge = document.createElement('div');
  badge.setAttribute('data-cabina-size-badge', '');
  badge.style.cssText = [
    // ⚠️ 2026-08-13 (Arou) — il badge torna visibile: tolto il `display:none`
    // che lo nascondeva dal 10/08, e con lui torna la preselezione sulla
    // pagina prodotto (qui sopra). Le due cose si muovono insieme: i due
    // commenti si citano a vicenda perché nessuno ne muova metà. Dal
    // 2026-09-23 la preselezione è il pulsante «Scegli» dentro questo badge.
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
    inline ? `background:${NERO_INLINE}` : 'background:rgba(0,0,0,0.45)',
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
  // 24/09 (Arou): la taglia in verde come la percentuale — è la risposta, si
  // deve vedere per prima.
  sizeText.style.cssText = `font-size:26px;font-weight:700;color:${SCORE_COLOR};`;
  sizeText.textContent = recommendation.size;

  sizeLine.appendChild(sizeText);
  if (showSizeScore) sizeLine.appendChild(buildScoreSpan(recommendation.score));

  badge.appendChild(label);
  badge.appendChild(sizeLine);

  const sub = document.createElement('span');
  sub.style.cssText = 'display:block;font-size:14px;color:rgba(255,255,255,0.85);margin-top:5px;';
  // Le due taglie sempre in ordine crescente. «Per maggiore comfort» solo se il
  // consiglio è la maggiore: dal 18/09 può essere la minore («M, tra M e L»),
  // e lì quella frase sarebbe falsa. Il ripiego sulla chiave vecchia vale solo
  // finché il locale nuovo non è in cache (lezione della 12.6).
  const alt = recommendation.alternative;
  sub.textContent = recommendation.confidence === 'between' && alt
    ? recommendation.alternativeLarger
      ? getLocaleStringOr('size.between_smaller', 'size.between', {
          size1: recommendation.size,
          size2: alt,
          recommended: recommendation.size,
        })
      : getLocaleString('size.between', {
          size1: alt,
          size2: recommendation.size,
          recommended: recommendation.size,
        })
    : getLocaleString('size.recommended');
  badge.appendChild(sub);

  // Scarpe (18/09/2026, Arou): il numero successivo «se la preferisci più
  // comoda», e la scelta resta dell'acquirente — il consiglio non la impone.
  if (recommendation.comfortSize) {
    const comfort = document.createElement('span');
    comfort.setAttribute('data-cabina-comfort-size', '');
    comfort.style.cssText = 'display:block;font-size:13px;color:rgba(255,255,255,0.85);margin-top:4px;';
    comfort.textContent = getLocaleString('size.comfort_hint', { size: recommendation.comfortSize });
    badge.appendChild(comfort);
  }

  const scelta = buildSizeChoice(recommendation.size);
  if (scelta) badge.appendChild(scelta);

  return badge;
}

/**
 * «Scegli XL»: applica la taglia consigliata al selettore della pagina, **solo
 * se l'acquirente lo tocca** (2026-09-23, vedi `buildSizeBadge`).
 *
 * 📌 `null` se la pagina non ha un selettore taglia con quella voce: un
 * pulsante che non seleziona niente prometterebbe una scelta che non avviene.
 * Se la taglia è già quella della pagina il pulsante nasce confermato.
 */
function buildSizeChoice(size: string): HTMLButtonElement | null {
  const controllo = trovaTaglia(size);
  if (!controllo) return null;

  const bottone = document.createElement('button');
  // Mai `submit`: il badge inline può finire dentro il form del negozio.
  bottone.type = 'button';
  bottone.setAttribute('data-cabina-size-choose', '');
  bottone.setAttribute('aria-live', 'polite');
  bottone.style.cssText = [
    'display:block',
    'margin:10px auto 0',
    'padding:8px 16px',
    'border:1px solid rgba(255,255,255,0.85)',
    'border-radius:8px',
    'background:transparent',
    'color:#fff',
    'font:inherit',
    'font-size:14px',
    'font-weight:600',
    'cursor:pointer',
  ].join(';');

  const confermata = (): void => {
    bottone.textContent = getLocaleStringDefault('size.chosen', '{{size}} selected ✓', { size });
    bottone.disabled = true;
    bottone.style.cursor = 'default';
    bottone.style.opacity = '0.85';
  };

  if (controllo.scelta()) {
    confermata();
  } else {
    bottone.textContent = getLocaleStringDefault('size.choose', 'Choose {{size}}', { size });
    bottone.addEventListener('click', () => {
      controllo.applica();
      confermata();
    });
  }
  return bottone;
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
  // Inline nello slot c'è anche la barra delle azioni (dal 24/09): il badge le
  // va DAVANTI, qualunque dei due percorsi arrivi per primo.
  const barra = themeHost?.querySelector<HTMLElement>('[data-cabina-tryon-bottom-bar]') ?? null;
  (themeHost ?? imageContainer ?? overlay).insertBefore(badge, barra);
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
/** Il riquadro a tutto schermo non è mai più stretto di 3:4 (vedi `misuraIngrandita`). */
const RAPPORTO_MIN_INGRANDITA = 3 / 4;

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
  /** «Completa il look» (18/09/2026): presente solo se il merchant l'ha acceso.
   *  Il capo della pagina (quello della prima prova) resta sempre il primo. */
  outfit?: { capoPagina: SelectedGarment; categoriaPagina: GarmentCategory | null },
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
          // 24/09: la barra delle azioni sta SOTTO il riquadro, in flusso
          // (vedi `bottomBar`): colonna, così non copre nulla.
          'flex-direction:column',
          `gap:${SPAZIO_BARRA}px`,
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
  // ⚠️ 2026-09-18 — fino a oggi la condizione chiedeva anche un catalogo Mix &
  // Match non vuoto, perché la barra conteneva solo lo «scambia capo» (14/07).
  // Il 04/09 ci è entrato «Aggiungi al carrello» (#186), e con Salva/Condividi/
  // Segnala è rimasto nascosto a chi non ha creato collezioni: quasi tutti. Il
  // catalogo decide il pannello dei capi, non la barra.
  if (hasFront && apiContext) {
    bottomBar = document.createElement('div');
    bottomBar.setAttribute('data-cabina-tryon-bottom-bar', '');
    // ⚠️ 2026-09-24 — fino a oggi era `position:absolute; bottom:80px; left:0;
    // right:0` figlia dell'overlay: inline finiva in mezzo alla prova, sopra la
    // modella e il capo (misurato su Completo, chelsea-boot); a tutto schermo
    // era larga quanto la finestra e copriva il badge della taglia (misurato
    // su cabina.io/en/demo/crewneck: badge 686–825 px, barra 748–809). Ora è
    // in FLUSSO: inline nello slot della taglia del tema, sotto la prova e
    // sotto il badge (`mountSizeBadge` lo mette davanti); a tutto schermo
    // sotto il riquadro, larga quanto lui
    // (l'osservatore al montaggio, più sotto, cede al riquadro lo spazio
    // che la barra si prende).
    bottomBar.style.cssText = [
      ...(inline ? ['width:100%'] : ['flex:none', 'box-sizing:border-box']),
      'display:flex',
      'flex-direction:column',
      'gap:8px',
      `opacity:${isFrontAngle ? '1' : '0'}`,
      `pointer-events:${isFrontAngle ? 'auto' : 'none'}`,
      'transition:opacity 0.3s ease-in-out',
    ].join(';');

    // Il risultato nuovo sostituisce quello in vista: lo stesso per lo scambio e
    // per il look.
    const mostraRisultato = (r: { url: string; resultId: string | null }): void => {
      revealSlider?.updateGenerated(r.url);
      resultActions?.updateResult(r.url, r.resultId);
    };

    if (outfit) {
      // «Completa il look» (18/09/2026): acceso dal merchant, prende il posto
      // dello scambio. Le proposte arrivano dopo (catalogo del negozio): il
      // pannello compare quando ci sono, e non compare se non ce ne sono.
      const posto = document.createElement('div');
      bottomBar.appendChild(posto);
      void leggiProdottiNegozio().then((prodotti) => {
        const capi = proposteOutfit({
          catalog: catalog ?? null,
          prodotti,
          categoriaPagina: outfit.categoriaPagina,
          handlePagina: handleDellaPagina(window.location.pathname),
        });
        if (capi.length === 0 || !posto.isConnected) return;
        posto.replaceWith(createOutfitPanel(
          capi,
          {
            label: getLocaleString('reveal_result.outfit_label'),
            tryTogether: getLocaleString('reveal_result.outfit_try'),
            loading: getLocaleString('reveal_result.outfit_loading'),
            error: getLocaleString('reveal_result.outfit_error'),
          },
          async (selezione) => {
            const esito = await tryonGenerative(
              apiContext.apiKey,
              apiContext.baseUrl,
              photoData!,
              [outfit.capoPagina, ...selezione.map(comeCapoSelezionato)],
              window.location.href,
              apiContext.identity,
            );
            if (!esito.ok) return false;
            mostraRisultato(esito);
            return true;
          },
        ));
      });
    } else if (catalog && catalog.garments.length > 0) {
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
          mostraRisultato(swapResult);
        },
        getPhotoData: () => photoData ?? null,
      },
    );
    bottomBar.appendChild(selectStyleUI);
    }

    /**
     * «Aggiungi al carrello», **prima** delle altre azioni: è il passo che
     * l'acquirente vuole fare adesso, appena visto il capo addosso. Salva e
     * condividi vengono dopo.
     *
     * 📌 Può essere `null` — se la pagina non ha un pulsante d'acquisto da
     * premere non mostriamo niente, invece di un pulsante che non compra.
     */
    const addToCart = createAddToCartButton(
      {
        add: getLocaleString('reveal_result.add_to_cart'),
        adding: getLocaleStringDefault('reveal_result.adding_to_cart', 'Adding…'),
        added: getLocaleStringDefault('reveal_result.added_to_cart', 'Added to cart ✓ · View cart'),
        failed: getLocaleStringDefault('reveal_result.add_to_cart_failed', 'Not confirmed · Check your cart'),
      },
      {
        // Fuori da Shopify l'esito non si legge: la stessa uscita del pulsante
        // ✕, e il riscontro è il drawer o la pagina del carrello del tema.
        onAdded: onClose,
      },
    );
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
    // Inline la barra sta sulla pagina del negozio, sotto il badge: lo stesso
    // nero pieno del badge (24/09, Arou). Il 60% con sfocatura è pensato per
    // stare sopra una foto, e sul bianco veniva grigio.
    if (inline) {
      const azioni = bottomBar.querySelector<HTMLElement>('[data-cabina-result-actions]');
      if (azioni) {
        azioni.style.background = NERO_INLINE;
        azioni.style.backdropFilter = '';
        azioni.style.setProperty('-webkit-backdrop-filter', '');
      }
    }
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

  // Lo zoom va sulle sole immagini, non sul riquadro (27/09): ✕ e ← stanno
  // nel riquadro e a 3× uscivano dalla vista; il riquadro resta la finestra
  // (`overflow:hidden`) dentro cui la foto ingrandita scorre.
  // Origine `0 0` e `translate` PRIMA di `scale` (28/09): così lo zoom può
  // andare verso il punto che il cliente indica — con più capi provati insieme
  // non c'è un punto fisso buono per tutti — e un px di trascinamento è un px.
  imagesWrapper.style.transformOrigin = '0 0';
  imagesWrapper.style.transition = 'transform 0.08s ease-out';
  zoomHandler = createZoomHandler({
    onTransformChange: (transform: ZoomTransform) => {
      imagesWrapper.style.transform = `translate(${transform.translateX}px, ${transform.translateY}px) scale(${transform.scale})`;
      imagesWrapper.style.setProperty('--cabina-zoom', String(transform.scale));
    },
    // Misure di layout (client*, che la trasformazione non tocca) e rettangolo
    // della foto dentro il contenitore: `object-fit: contain` la centra e
    // lascia bande dove le proporzioni non coincidono. Si misura lo STESSO
    // elemento a cui è agganciato lo zoom e contro cui si legge il puntatore
    // (`imageContainer`): inline e ingrandito il wrapper lo riempie al 100%,
    // ma un solo riferimento non lascia il dubbio (rilievo Kilo sulla #268).
    misure: () => {
      const larghezza = imageContainer.clientWidth;
      const altezza = imageContainer.clientHeight;
      const img = [...imagesWrapper.querySelectorAll('img')].find((i) => i.naturalWidth > 0);
      if (!larghezza || !altezza || !img) return null;
      const k = Math.min(larghezza / img.naturalWidth, altezza / img.naturalHeight);
      const w = img.naturalWidth * k;
      const h = img.naturalHeight * k;
      return {
        larghezza,
        altezza,
        foto: { x0: (larghezza - w) / 2, y0: (altezza - h) / 2, x1: (larghezza + w) / 2, y1: (altezza + h) / 2 },
      };
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
    // Anche ingrandita, la ✕ chiude la prova (Arou, 28/09: «per chiuderla con
    // la x in alto non funziona»). Il 27/09 riportava solo al riquadro, e a
    // chi voleva chiudere sembrava rotta: per rimpicciolire ci sono ⤡, Esc e
    // il fondale. `removeTryOnOverlay` esce prima dall'ingrandita da sé.
    onClose();
  });

  imageContainer.appendChild(closeButton);

  // ── Ingrandisci (Arou, 27/09: «il box dell'immagine è piccolo») ────────
  // Inline il riquadro lo decide il tema (su Completo 366×457 su uno schermo
  // largo 1920), e il widget non può allargare la colonna di un tema altrui.
  // ⤢ porta LO STESSO overlay a tutto schermo e ⤡, ✕, Esc o il fondale lo
  // riportano nel riquadro: si sposta l'elemento, non si rifà la prova, così
  // confronto, capo scelto e risultato restano quelli.
  let ingrandita = false;
  const stileOverlayInline = overlay.style.cssText;
  const stileRiquadroInline = imageContainer.style.cssText;
  const misuraIngrandita = (): void => {
    const img = imagesWrapper.querySelector('img');
    const foto = img && img.naturalWidth ? img.naturalWidth / img.naturalHeight : 1360 / 2048;
    // Almeno 3:4 (Arou, 27/09: «aumenta un po' il box in larghezza»): la prova
    // è 2:3 e a misura di foto il riquadro sembrava una striscia. Più largo
    // della foto lascia due bande ai lati, meglio che tagliare testa o piedi.
    const r = Math.max(foto, RAPPORTO_MIN_INGRANDITA);
    const h = Math.min(window.innerHeight * 0.9, (window.innerWidth * 0.9) / r);
    imageContainer.style.width = `${Math.round(h * r)}px`;
    imageContainer.style.height = `${Math.round(h)}px`;
  };
  const escIngrandita = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    // In cattura, prima del listener che chiude tutta la prova.
    e.stopPropagation();
    impostaIngrandita(false);
  };
  const fondaleIngrandita = (e: MouseEvent): void => {
    if (e.target === overlay) impostaIngrandita(false);
  };
  const ingrandisci = document.createElement('button');
  function impostaIngrandita(si: boolean): void {
    if (!stage || si === ingrandita) return;
    ingrandita = si;
    zoomHandler?.reset();
    if (si) {
      overlay.style.cssText = `${stileOverlayInline};position:fixed;inset:0;z-index:2147483645;background:rgba(0,0,0,0.55);align-items:center;justify-content:center`;
      imageContainer.style.cssText = `${stileRiquadroInline};max-width:none;max-height:none;border-radius:12px;box-shadow:0 12px 48px rgba(0,0,0,0.55);background:#1a1a1a`;
      misuraIngrandita();
      // Nel body, non nello stage: un antenato con `transform` farebbe da
      // riferimento al `position:fixed` e la «pagina intera» sarebbe la colonna.
      document.body.appendChild(overlay);
      window.addEventListener('resize', misuraIngrandita);
      document.addEventListener('keydown', escIngrandita, true);
      overlay.addEventListener('click', fondaleIngrandita);
    } else {
      overlay.style.cssText = stileOverlayInline;
      imageContainer.style.cssText = stileRiquadroInline;
      stage.appendChild(overlay);
      window.removeEventListener('resize', misuraIngrandita);
      document.removeEventListener('keydown', escIngrandita, true);
      overlay.removeEventListener('click', fondaleIngrandita);
    }
    ingrandisci.textContent = si ? '⤡' : '⤢';
    const etichetta = si
      ? getLocaleStringDefault('tryon.shrink', 'Back to the page')
      : getLocaleStringDefault('tryon.enlarge', 'Enlarge');
    ingrandisci.setAttribute('aria-label', etichetta);
    ingrandisci.title = etichetta;
  }
  if (stage) {
    ingrandisci.setAttribute('data-cabina-tryon-enlarge', '');
    ingrandisci.textContent = '⤢';
    const etichetta = getLocaleStringDefault('tryon.enlarge', 'Enlarge');
    ingrandisci.setAttribute('aria-label', etichetta);
    ingrandisci.title = etichetta;
    // In basso a destra: gli angoli in alto sono di ← e ✕, il centro in alto
    // dell'etichetta del confronto.
    // Proprietà, non testo: il browser riscrive cssText («top: 12px», con lo
    // spazio) e un replace sul testo lasciava ⤢ sopra la ✕ (visto il 27/09).
    ingrandisci.style.cssText = closeButton.style.cssText;
    ingrandisci.style.top = 'auto';
    ingrandisci.style.bottom = '12px';
    ingrandisci.addEventListener('click', (e) => {
      e.stopPropagation();
      impostaIngrandita(!ingrandita);
    });
    imageContainer.appendChild(ingrandisci);
    // Se la prova si chiude da ingrandita (← , una nuova prova), i listener
    // non devono restare: Esc resterebbe catturato e riaggancerebbe allo stage
    // un overlay già tolto.
    (overlay as unknown as Record<string, unknown>).__esciIngrandita = () => {
      window.removeEventListener('resize', misuraIngrandita);
      document.removeEventListener('keydown', escIngrandita, true);
    };
  }

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
  (stage ?? document.body).appendChild(overlay);
  // Fix (code review 12.4): bottomBar era costruita ma mai montata nel DOM —
  // fuori da imageContainer per restare immune a zoom/pan. Dal 24/09 sta in
  // flusso (vedi il suo cssText): inline nello slot della taglia, dove
  // `mountSizeBadge` le mette il badge DAVANTI; a tutto schermo sotto il
  // riquadro. Lo slot è fuori dall'overlay: `removeTryOnOverlay` la toglie a parte.
  if (bottomBar) {
    const slot = inline
      ? (document.querySelector<HTMLElement>(`[${SIZE_HOST_ATTR}]`) ?? creaSizeHostSottoIlPulsante())
      : null;
    (slot ?? overlay).appendChild(bottomBar);
    bottomBarElement = bottomBar;
    if (!inline && typeof ResizeObserver !== 'undefined') {
      // Il riquadro era limitato a 90vh; ora quel 90vh se lo dividono lui e la
      // barra, che cambia altezza quando arriva il pannello del look.
      const barra = bottomBar;
      barraObserver = new ResizeObserver(() => {
        const maxH = Math.max(120, overlay.clientHeight * 0.9 - barra.offsetHeight - SPAZIO_BARRA);
        overlay
          .querySelectorAll<HTMLElement>(
            '[data-cabina-tryon-image-container],[data-cabina-tryon-sizer],[data-cabina-tryon-image]',
          )
          .forEach((el) => {
            el.style.maxHeight = `${maxH}px`;
          });
        // Larga quanto il riquadro, che ha la sua misura solo a immagine caricata.
        if (imageContainer.offsetWidth) barra.style.width = `${imageContainer.offsetWidth}px`;
      });
      barraObserver.observe(overlay);
      barraObserver.observe(bottomBar);
      barraObserver.observe(imageContainer);
    }
  }

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
    ((overlayElement as unknown as Record<string, unknown>).__esciIngrandita as (() => void) | undefined)?.();

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
    // Stessa sorte per la barra delle azioni, che inline sta nello stesso slot.
    bottomBarElement?.remove();
    bottomBarElement = null;
    barraObserver?.disconnect();
    barraObserver = null;

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