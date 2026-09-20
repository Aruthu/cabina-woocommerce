import {
  PRESET_MODELS,
  MORE_MODELS,
  ALL_MODELS,
  AGE_BANDS,
  MODEL_GENDERS,
  GENDER_LABEL_KEYS,
  ageBandLabel,
  type PresetModel,
} from './presets';
import { getLocaleString } from '../../i18n/i18n';

/**
 * Story 12.2 — Libreria modelle predefinite (AC2) e conversione in data URL (AC1).
 *
 * Tre responsabilità:
 *  1. `createModelGallery` — factory DOM (miniature selezionabili). Segue lo
 *     STESSO pattern di `createPhotoCapture` (strings + callbacks → DocumentFragment
 *     da appendere nel modale). Nessuna libreria, stili inline, vanilla DOM.
 *  2. `createMoreModelsScreen` — dal 2026-09-18 la seconda schermata con le 32
 *     modelle per fascia d'età, aperta dal pulsante fra donne e uomini.
 *  3. `fetchModelAsDataUrl` — recupera l'asset statico e lo converte in data URL,
 *     così che il `photoData` prodotto dal percorso modella abbia lo STESSO
 *     formato del percorso foto (invariante verso `tryonGenerative`/`callRenderApi`,
 *     che consumano data URL — Dev Notes Task 1.3).
 */

export interface ModelGalleryStrings {
  title: string;
  subtitle: string;
}

export interface ModelGalleryCallbacks {
  /** Chiamata quando l'acquirente seleziona una modella. La factory NON fetcha
   *  l'asset: notifica solo la selezione; è il chiamante (widget.ts) a orchestrare
   *  la conversione in data URL e il dispatch del reducer. */
  onModelSelected: (model: PresetModel) => void;
  /** Pulsante «altre modelle» fra le donne e gli uomini: il chiamante apre la
   *  seconda schermata (`createMoreModelsScreen`). Assente = nessun pulsante. */
  onShowMore?: () => void;
}

/** Risolve l'etichetta localizzata di una modella via i18n (`labelKey`). */
function modelLabel(model: PresetModel): string {
  return getLocaleString(model.labelKey);
}

/**
 * Etichetta annunciata dallo screen reader: "Donna Slim", non "Slim".
 * Sotto la miniatura resta la sola corporatura (la card è larga 64px e il genere
 * è già dato dall'intestazione del gruppo), ma chi naviga a voce salta le
 * intestazioni e sentirebbe quattro "Slim" identici senza il genere davanti.
 * Per le 32 anche la fascia, "Donna 18–25 Slim": o le quattro fasce suonano uguali.
 */
function modelAriaLabel(model: PresetModel): string {
  const band = model.ageBand ? ` ${ageBandLabel(model.ageBand)}` : '';
  return `${getLocaleString(GENDER_LABEL_KEYS[model.gender])}${band} ${modelLabel(model)}`;
}

function createModelCard(model: PresetModel, onSelect: (model: PresetModel) => void): HTMLButtonElement {
  const card = document.createElement('button');
  card.type = 'button';
  card.setAttribute('data-cabina-model-card', model.id);
  card.setAttribute('aria-label', modelAriaLabel(model));
  card.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'gap:4px',
    'padding:6px',
    'border:1px solid #d1d5db',
    'border-radius:8px',
    'background:#fff',
    'cursor:pointer',
    'width:64px',
  ].join(';');

  const thumb = document.createElement('img');
  // L'anteprima usa la miniatura dedicata (`thumbPath`, ~5 KB), non l'asset
  // pieno: la card la disegna a 44x88 CSS, scaricare 8 foto da 300 KB per
  // altrettanti francobolli costerebbe 2,5 MB all'apertura della galleria.
  // Il file pieno parte solo alla selezione, in `fetchModelAsDataUrl`.
  thumb.setAttribute('data-cabina-model-thumb', model.id);
  // Nella seconda schermata le miniature sono 32 in una griglia che scorre:
  // si scaricano quando entrano in vista, non tutte all'apertura.
  thumb.loading = 'lazy';
  // a11y (P8): img decorativa → alt="". L'etichetta è già annunciata dal
  // bottone (`aria-label`) e dallo `<span>` testuale: un alt qui la ripeterebbe.
  thumb.alt = '';
  thumb.style.cssText = ['width:44px', 'height:88px', 'object-fit:contain', 'display:block'].join(';');
  // Fallback anteprima rotta (P9): asset 404 o baseUrl errato → nascondi l'img
  // (resta l'etichetta) invece di mostrare l'icona-immagine-rotta del browser.
  thumb.addEventListener('error', () => { thumb.style.display = 'none'; });
  card.appendChild(thumb);

  const label = document.createElement('span');
  label.textContent = modelLabel(model);
  label.style.cssText = 'font-size:11px;color:#374151;text-align:center;';
  card.appendChild(label);

  card.addEventListener('click', () => onSelect(model));
  return card;
}

/** Titolo e sottotitolo della sezione, uguali nelle due schermate. */
function appendHeading(container: HTMLElement, strings: ModelGalleryStrings): void {
  const title = document.createElement('h3');
  title.textContent = strings.title;
  title.style.cssText = 'margin:0 0 4px;font-size:15px;font-weight:600;color:#1a1a1a;';
  container.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.textContent = strings.subtitle;
  subtitle.style.cssText = 'margin:0 0 12px;font-size:12px;color:#6b7280;';
  container.appendChild(subtitle);
}

/** Un gruppo: intestazione (genere, o genere · fascia) + griglia di miniature. */
function appendGroup(
  container: HTMLElement,
  heading: string,
  group: string,
  models: readonly PresetModel[],
  onSelect: (model: PresetModel) => void,
): void {
  const groupTitle = document.createElement('h4');
  groupTitle.setAttribute('data-cabina-model-group', group);
  groupTitle.textContent = heading;
  groupTitle.style.cssText =
    'margin:8px 0 6px;font-size:12px;font-weight:600;color:#6b7280;text-align:center;';
  container.appendChild(groupTitle);

  const grid = document.createElement('div');
  grid.setAttribute('data-cabina-model-grid', group);
  grid.style.cssText = [
    'display:flex',
    'flex-wrap:wrap',
    'gap:8px',
    'justify-content:center',
  ].join(';');
  for (const model of models) grid.appendChild(createModelCard(model, onSelect));
  container.appendChild(grid);
}

/** Area errore fetch (nascosta finché `setModelError` non la popola). */
function appendErrorArea(container: HTMLElement): void {
  const errorArea = document.createElement('p');
  errorArea.setAttribute('data-cabina-model-error', '');
  errorArea.style.cssText = ['color:#dc2626', 'font-size:12px', 'margin:8px 0 0', 'display:none'].join(';');
  container.appendChild(errorArea);
}

function createShowMoreButton(onShowMore: () => void): HTMLButtonElement {
  const more = document.createElement('button');
  more.type = 'button';
  more.setAttribute('data-cabina-model-more', '');
  more.textContent = getLocaleString('model_gallery.more_button');
  more.style.cssText = [
    'display:block',
    'margin:12px auto 4px',
    'padding:8px 14px',
    'border:1px solid #d1d5db',
    'border-radius:999px',
    'background:#fff',
    'color:#1a1a1a',
    'font-size:12px',
    'font-family:inherit',
    'cursor:pointer',
  ].join(';');
  more.addEventListener('click', onShowMore);
  return more;
}

/**
 * Crea la galleria di modelle predefinite come DocumentFragment.
 * Renderizza una miniatura cliccabile per ciascuna `PRESET_MODELS`.
 * L'area errore (`data-cabina-model-error`) resta nascosta finché il chiamante
 * non segnala un fallimento di fetch (vedi `setModelError` esposto sotto).
 */
export function createModelGallery(
  strings: ModelGalleryStrings,
  callbacks: ModelGalleryCallbacks,
): DocumentFragment {
  const fragment = document.createDocumentFragment();

  const container = document.createElement('div');
  container.setAttribute('data-cabina-model-gallery', '');
  appendHeading(container, strings);

  // Una griglia per genere. Con 8 voci in un unico blocco l'acquirente si trova
  // otto francobolli indistinti e due volte la stessa etichetta di corporatura;
  // le intestazioni rendono la scelta due decisioni piccole invece di una grande.
  MODEL_GENDERS.forEach((gender, i) => {
    const models = PRESET_MODELS.filter((m) => m.gender === gender);
    if (models.length === 0) return; // set ridotto → nessuna intestazione orfana

    // Il pulsante sta FRA le donne e gli uomini (disegno di Arou, 11/09): chi non
    // trova la sua età o corporatura nelle 8 lo incontra prima di scorrere oltre.
    if (i > 0 && callbacks.onShowMore) container.appendChild(createShowMoreButton(callbacks.onShowMore));

    appendGroup(container, getLocaleString(GENDER_LABEL_KEYS[gender]), gender, models, callbacks.onModelSelected);
  });

  appendErrorArea(container);

  fragment.appendChild(container);
  return fragment;
}

/**
 * Seconda schermata DENTRO la cabina (stesso overlay, nessuna navigazione né
 * nuova scheda): le 32 modelle nuove per genere e fascia d'età. Il «← Indietro»
 * lo mette il chiamante (widget.ts), come in ogni altro step. La griglia scorre
 * col contenuto del modale, anche nel riquadro inline del tema.
 */
export function createMoreModelsScreen(
  strings: ModelGalleryStrings,
  onModelSelected: (model: PresetModel) => void,
): DocumentFragment {
  const fragment = document.createDocumentFragment();

  const container = document.createElement('div');
  container.setAttribute('data-cabina-model-more-screen', '');
  appendHeading(container, strings);

  for (const gender of MODEL_GENDERS) {
    for (const band of AGE_BANDS) {
      const models = MORE_MODELS.filter((m) => m.gender === gender && m.ageBand === band);
      if (models.length === 0) continue;
      appendGroup(
        container,
        `${getLocaleString(GENDER_LABEL_KEYS[gender])} · ${ageBandLabel(band)}`,
        `${gender}-${band}`,
        models,
        onModelSelected,
      );
    }
  }

  appendErrorArea(container);

  fragment.appendChild(container);
  return fragment;
}

/**
 * Mostra un messaggio di errore non bloccante nella galleria (es. fetch fallita).
 * Operazione idempotente: se il contenitore non è (più) montato, no-op.
 */
export function setModelError(container: ParentNode, message: string): void {
  const el = container.querySelector('[data-cabina-model-error]') as HTMLElement | null;
  if (!el) return;
  el.textContent = message;
  el.style.display = message ? 'block' : 'none';
}

/**
 * Imposta gli `src` delle miniature risolvendoli rispetto al `baseUrl` del widget.
 * Usa `thumbPath` (128px, ~5 KB), non l'asset pieno: serve solo per l'anteprima,
 * ed è pubblico sul CDN del widget come il resto degli asset statici.
 */
export function resolveModelThumbs(container: ParentNode, baseUrl: string): void {
  const sanitizedBase = baseUrl.replace(/\/+$/, '');
  const thumbs = container.querySelectorAll<HTMLImageElement>('[data-cabina-model-thumb]');
  thumbs.forEach((img) => {
    const id = img.getAttribute('data-cabina-model-thumb');
    const model = ALL_MODELS.find((m) => m.id === id);
    if (model) img.src = `${sanitizedBase}${model.thumbPath}`;
  });
}

/**
 * Recupera l'asset statico della modella e lo converte in **data URL** (AC1).
 *
 * Perché data URL e non URL remoto: `tryonGenerative()` e `callRenderApi()`
 * (widget-api.ts) consumano `photoData` come data URL — contratto invariato da
 * 12.1. Il percorso modella deve produrre lo stesso formato (Dev Notes Task 1.3).
 *
 * Pattern di `loadLocale` (i18n.ts): sanitize baseUrl, AbortController con
 * timeout 5s, fetch, conversione blob → data URL. Su qualsiasi errore propaga
 * l'eccezione: il chiamante (widget.ts) la gestisce con try/catch silente e
 * mostra l'errore inline nella galleria (resta sullo step, non blocca).
 */
export async function fetchModelAsDataUrl(baseUrl: string, assetPath: string): Promise<string> {
  const sanitizedBase = baseUrl.replace(/\/+$/, '');
  const url = `${sanitizedBase}${assetPath}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`Model asset HTTP ${res.status}: ${assetPath}`);
  }

  const blob = await res.blob();
  // Validazione content-type/size (P6 code review): una risposta 200 con corpo
  // vuoto o HTML (CDN mal configurato / SPA fallback) diventerebbe altrimenti un
  // data URL "valido" ma spazzatura, inoltrato al motore try-on. Il blob deve
  // essere non vuoto e di tipo immagine. `type` può essere assente in alcuni
  // ambienti: se presente deve iniziare per `image/`.
  if (blob.size === 0) {
    throw new Error(`Model asset empty: ${assetPath}`);
  }
  if (blob.type && !blob.type.startsWith('image/')) {
    throw new Error(`Model asset not an image (${blob.type}): ${assetPath}`);
  }
  return blobToDataUrl(blob);
}

/** Converte un Blob in data URL via FileReader (compatibile browser & test node). */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('FileReader produced non-string result'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsDataURL(blob);
  });
}
