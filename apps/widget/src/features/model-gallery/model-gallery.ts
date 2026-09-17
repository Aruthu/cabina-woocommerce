import {
  PRESET_MODELS,
  MODEL_GENDERS,
  GENDER_LABEL_KEYS,
  type PresetModel,
} from './presets';
import { getLocaleString } from '../../i18n/i18n';

/**
 * Story 12.2 — Libreria modelle predefinite (AC2) e conversione in data URL (AC1).
 *
 * Due responsabilità:
 *  1. `createModelGallery` — factory DOM (miniature selezionabili). Segue lo
 *     STESSO pattern di `createPhotoCapture` (strings + callbacks → DocumentFragment
 *     da appendere nel modale). Nessuna libreria, stili inline, vanilla DOM.
 *  2. `fetchModelAsDataUrl` — recupera l'asset statico e lo converte in data URL,
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
 */
function modelAriaLabel(model: PresetModel): string {
  return `${getLocaleString(GENDER_LABEL_KEYS[model.gender])} ${modelLabel(model)}`;
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

  // Titolo sezione
  const title = document.createElement('h3');
  title.textContent = strings.title;
  title.style.cssText = 'margin:0 0 4px;font-size:15px;font-weight:600;color:#1a1a1a;';
  container.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.textContent = strings.subtitle;
  subtitle.style.cssText = 'margin:0 0 12px;font-size:12px;color:#6b7280;';
  container.appendChild(subtitle);

  // Una griglia per genere. Con 8 voci in un unico blocco l'acquirente si trova
  // otto francobolli indistinti e due volte la stessa etichetta di corporatura;
  // le intestazioni rendono la scelta due decisioni piccole invece di una grande.
  for (const gender of MODEL_GENDERS) {
    const models = PRESET_MODELS.filter((m) => m.gender === gender);
    if (models.length === 0) continue; // set ridotto → nessuna intestazione orfana

    const groupTitle = document.createElement('h4');
    groupTitle.setAttribute('data-cabina-model-group', gender);
    groupTitle.textContent = getLocaleString(GENDER_LABEL_KEYS[gender]);
    groupTitle.style.cssText =
      'margin:8px 0 6px;font-size:12px;font-weight:600;color:#6b7280;text-align:center;';
    container.appendChild(groupTitle);

    const grid = document.createElement('div');
    grid.setAttribute('data-cabina-model-grid', gender);
    grid.style.cssText = [
      'display:flex',
      'flex-wrap:wrap',
      'gap:8px',
      'justify-content:center',
    ].join(';');

    for (const model of models) {
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
      // pieno: la card la disegna a 44x88 CSS, scaricare 8 foto da 150 KB per
      // altrettanti francobolli costerebbe 1,2 MB all'apertura della galleria.
      // Il file pieno parte solo alla selezione, in `fetchModelAsDataUrl`.
      thumb.setAttribute('data-cabina-model-thumb', model.id);
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

      card.addEventListener('click', () => callbacks.onModelSelected(model));

      grid.appendChild(card);
    }
    container.appendChild(grid);
  }

  // Area errore fetch (nascosta finché non popolata)
  const errorArea = document.createElement('p');
  errorArea.setAttribute('data-cabina-model-error', '');
  errorArea.style.cssText = ['color:#dc2626', 'font-size:12px', 'margin:8px 0 0', 'display:none'].join(';');
  container.appendChild(errorArea);

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
    const model = PRESET_MODELS.find((m) => m.id === id);
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
