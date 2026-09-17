import { fetchWidgetConfig, notifySessionStart, notifySessionComplete, estimateMeasuresFromPhoto, analyzeGarmentFromUrl, fetchCatalog, tryonGenerative, sendConsentEvent, type CatalogData, type TryonIdentity } from './api/widget-api';
import type { SelectedGarment } from './state/types';
import type { FashnGarmentCategory } from '@cabina/shared';
import { resolveLanguage, loadLocale, getLocaleString, getLocaleStringOr, getCurrentLanguage } from './i18n/i18n';
import { widgetReducer, createInitialContext, resetSessionContext } from './state/machine';
import { isBrowserSupported, getBrowserUpdateLink } from './utils/browser';
import { extractProductImageUrl } from './utils/product-image';
import { createPhotoCapture } from './features/photo/PhotoCapture';
import { downscalePhotoDataUrl, MEASURE_MAX_EDGE_PX } from './features/photo/photo-utils';
import { createMeasuresForm } from './features/avatar/measures-form';
import { clearMeasurements } from './features/avatar/measurements-storage';
import {
  loadPhotoConsent,
  savePhotoConsent,
  clearPhotoConsent,
  shouldAttemptGenerative,
  CURRENT_PHOTO_CONSENT_VERSION,
} from './features/photo-consent/photo-consent-storage';
import { createModelGallery, resolveModelThumbs, setModelError, fetchModelAsDataUrl } from './features/model-gallery/model-gallery';
import { createGarmentSelect, resolvePageGarmentParams, type PageGarmentParams } from './features/garment-select/garment-select';
import { showTryOnOverlay, removeTryOnOverlay, updateSizeBadge } from './features/tryon/tryon-overlay';
import { recommendFromTables, stimaPiedeDaAltezza } from './features/size/size-recommendation';
import { fetchSizeTables } from './api/widget-api';
import type { SupportedLanguage, WidgetPublicConfig, Measures } from '@cabina/shared';
import { BUTTON_ANCHORS, BUTTON_TARGET_ATTR, AUTO_OPEN_PARAM, AUTO_OPEN_VALUE } from '@cabina/shared';
import type { GarmentAnalysis, GarmentCategory } from './state/types';

/** `getLocaleString` restituisce la chiave stessa quando manca (locale in
 *  cache più vecchio del bundle — lezione della 12.6): qui vale `undefined`. */
function senzaChiave(valore: string): string | undefined {
  return valore.startsWith('form.') ? undefined : valore;
}

// Misure europee medie usate come default quando le stime non sono disponibili (AC7).
const DEFAULT_MEASURES: Measures = {
  heightCm: 168,
  bustCm: 90,
  waistCm: 75,
  hipsCm: 96,
  weightKg: 65,
};
import type { WidgetContext } from './state/types';

let initStarted = false; // Guard: impedisce doppio snippet → doppio pulsante + doppia sessione

/**
 * Story 12.2 — feature-flag del percorso "modella predefinita".
 * Spento il 2026-07-13 perché i preset erano SVG placeholder e il motore
 * generativo FASHN pretende una fotografia vera; **riacceso il 2026-07-26**,
 * quando `src/models/` ha ricevuto le 4 foto raster delle corporature
 * (slim/regular/curvy/plus). Spegnerlo di nuovo (→ false) è il rimedio
 * immediato se il percorso modella desse problemi in produzione: il percorso
 * foto è indipendente e resta invariato.
 * Tipizzato `boolean` (non letterale) di proposito: evita che TS marchi il
 * blocco come dead-code e per non tree-shakare la galleria dal bundle. */
const MODEL_GALLERY_ENABLED: boolean = true;

/** Guard re-entrancy: impedisce che due selezioni modella concorrenti (doppio
 *  click sulla galleria, nessun feedback durante la fetch) lancino due volte il
 *  rendering generativo → doppia chiamata FASHN a pagamento. */
let modelSelectionInFlight = false;

/**
 * Categorie su cui il widget avvisa l'acquirente che il try-on potrebbe non
 * riuscire (sopra 0,7 di confidenza, durante il rendering).
 *
 * ⚠️ 2026-08-19 — si chiamava `NON_CLOTHING` e conteneva anche `footwear`, e il
 * nome era metà del difetto: «non è un capo» non vuol dire «non funziona». La
 * frase descriveva un limite di **FASHN**, sostituito il 16/08. Le otto prove del
 * 17/08 (tabella in `docs/wiki/qualita-generativa.md`) dicono l'opposto: un
 * décolleté sostituisce le sneaker della modella lasciando i vestiti intatti, in
 * 3,8s. Novita classifica le scarpe a 0,99, quindi l'avviso compariva su
 * praticamente ogni scarpa e scoraggiava un percorso che funziona.
 *
 * `accessory` resta perché **nessuna prova l'ha mai toccato**, non perché sappiamo
 * che vada male. Il giorno in cui qualcuno prova una borsa, questa lista si
 * rivaluta — e il test che la copre dice solo cosa contiene, mai se sia vero.
 *
 * 📌 `readonly GarmentCategory[]`, non `string[]` (rilievo Kilo del 19/08): con
 * `string[]` un refuso — `'accesory'` — compilava e faceva sparire l'avviso in
 * silenzio, che è il modo in cui questo prodotto si rompe più spesso. E siccome
 * la lista è esportata per il test, senza `readonly` chiunque potrebbe farci un
 * `push('footwear')` e rimettere il difetto da un altro file.
 */
export const CATEGORIE_CON_AVVISO: readonly GarmentCategory[] = ['accessory'];

/** Reset stato inizializzazione — solo per Vitest. Non chiamare in produzione. */
export function __resetWidgetForTesting(): void {
  initStarted = false;
  currentSessionId = null;
  sessionCompleteSent = false;
  sessionStarted = false;
  widgetContext = createInitialContext(); // lo stato del reducer non deve trapelare tra i test
  osservatoreBottone?.disconnect();
  osservatoreBottone = null;
  bottoneIniettato = null;
  if (timerReinserimento) clearTimeout(timerReinserimento);
  timerReinserimento = null;
}
let currentLang: SupportedLanguage | null = null;
let currentApiKey: string | null = null;
// Story 7.4 (ri-cablata 2026-07-15): id della widget_session creata da
// notifySessionStart. Serve al completamento fire-and-forget quando
// l'acquirente raggiunge il risultato.
let currentSessionId: string | null = null;
// Guard once-per-sessione: 'tryon' può essere ri-entrato (BACK → nuovo render);
// la conversione conta una volta sola (il server è comunque idempotente).
let sessionCompleteSent = false;
// Story 5.2 (rivisto 2026-07-15): la sessione si conta al PRIMO OPEN del widget,
// non al load della pagina — una visita senza aprire la cabina non consuma il
// piano; chiudere e riaprire nella stessa visita resta UNA sessione.
let sessionStarted = false;
let widgetContext: WidgetContext = createInitialContext();

/**
 * 2026-08-22 — chi c'è nella foto e quale consenso ha dato, per `tryonGenerative`.
 * La route ne fa dipendere il giudice vision sul risultato (vedi `TryonIdentity`).
 * Si legge dallo stato e dal dispositivo nel momento della chiamata, non da una
 * costante: è ciò che l'acquirente ha davvero autorizzato, non ciò che il bundle
 * sa essere corrente.
 */
function identitaTryon(apiKey: string): TryonIdentity {
  return {
    photoSource: widgetContext.identityMode === 'preset_model' ? 'preset' : 'upload',
    consentVersion: loadPhotoConsent(apiKey)?.version,
  };
}
let widgetModal: HTMLElement | null = null;
/** Listener Escape della modale: vive su document, va staccato con la modale. */
let modalEscHandler: ((e: KeyboardEvent) => void) | null = null;
let garmentAnalysis: GarmentAnalysis | null = null; // Analisi capo in background (AC8)
// Si risolve quando l'analisi di cui sopra è finita, comunque sia andata: serve
// al bottone "Prova in Cabina", che deve attenderla invece di ripiegare su
// `'auto'` quando il click arriva prima della risposta. Già risolta = nessuna
// analisi in corso (widget non inizializzato, o pagina senza immagine prodotto).
let garmentAnalysisDone: Promise<void> = Promise.resolve();
/** Ingresso corrente nello step "Cosa provi" (vedi il case 'garment_select'). */
let garmentSelectEntryId = 0;
// Story 12.4 (Task 5.3): resultId dell'ultima generazione try-on, tracciato
// come variabile modulo (NON nel reducer, stesso trattamento di garmentAnalysis).
// Usato per collegare la segnalazione qualità (AC3) alla generazione giusta.
let lastTryonResultId: string | null = null;
// Story 12.4 (Task 5.3): catalogo merchant per select-style (AC2). Fetchato
// una volta all'arrivo in 'tryon' (non ad ogni render) e passato all'overlay.
let lastCatalog: CatalogData | null = null;
let currentLogoUrl: string | null = null; // Logo del merchant (branding), mostrato nel modal
// Story 12.5 (Task 2.5): colore brand del merchant, filato nei moduli step UI
// sulle sole azioni primarie (AC3). Default = fallback di sanitizeColor.
let currentPrimaryColor = '#1a1a1a';

function sanitizeColor(value: string, fallback = '#1a1a1a'): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

/** Accetta solo URL https valide (il logo è iniettato come <img src>). */
function sanitizeLogoUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

// ── Tooltip per browser non supportato ────────────────────────────────────

function showUnsupportedTooltip(button: HTMLElement): void {
  // Rimuovi tooltip esistente
  const existing = document.querySelector('[data-cabina-tooltip]');
  if (existing) existing.remove();

  const tooltip = document.createElement('div');
  tooltip.setAttribute('data-cabina-tooltip', '');
  tooltip.style.cssText = [
    'position:absolute',
    'bottom:calc(100% + 8px)',
    'left:50%',
    'transform:translateX(-50%)',
    'background:#1a1a1a',
    'color:#fff',
    'padding:10px 14px',
    'border-radius:6px',
    'font-size:13px',
    'max-width:280px',
    'text-align:center',
    'z-index:2147483647',
    'box-shadow:0 2px 12px rgba(0,0,0,0.2)',
    'white-space:normal',
    'pointer-events:auto',
  ].join(';');

  // Messaggio
  const message = document.createElement('p');
  message.textContent = getLocaleString('browser.unsupported_message');
  message.style.cssText = 'margin:0 0 8px;line-height:1.4;';

  // Link aggiornamento
  const link = document.createElement('a');
  link.textContent = getLocaleString('browser.update_link_text');
  link.href = getBrowserUpdateLink();
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.cssText = [
    'color:#6eb5ff',
    'text-decoration:underline',
    'cursor:pointer',
    'font-size:12px',
  ].join(';');

  tooltip.appendChild(message);
  tooltip.appendChild(link);

  // Posizionamento relativo al pulsante
  const parent = button.parentElement;
  if (parent) {
    // Contenitore per posizionamento relativo
    const wrapper = document.createElement('span');
    wrapper.style.cssText = 'position:relative;display:inline-block;';
    button.parentNode?.insertBefore(wrapper, button);
    wrapper.appendChild(button);
    wrapper.appendChild(tooltip);
  }

  // Auto-rimozione dopo 8 secondi
  setTimeout(() => {
    const el = document.querySelector('[data-cabina-tooltip]');
    if (el) el.remove();
  }, 8000);
}

// ── Widget Modal ──────────────────────────────────────────────────────────

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < 640;
}

function ensureWidgetModal(onClose?: () => void): HTMLElement {
  if (widgetModal) return widgetModal;

  const mobile = isMobileViewport();

  const overlay = document.createElement('div');
  overlay.setAttribute('data-cabina-modal', '');
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    // 2026-08-07 (Arou): alleggerito anche il fondale della cabina, non solo
    // quello del risultato — la pagina del negozio deve restare riconoscibile
    // sotto. Qui si può scendere più dell'overlay risultato perché il contenuto
    // è una scheda opaca, che si stacca da sé.
    mobile ? 'background:rgba(0,0,0,0.3)' : 'background:rgba(0,0,0,0.4)',
    'display:flex',
    mobile ? 'align-items:flex-end' : 'align-items:center',
    'justify-content:center',
    'z-index:2147483646',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  ].join(';');

  // Chiusura da tastiera e click sullo sfondo. Prima esistevano SOLO nell'overlay
  // del risultato (tryon-overlay.ts): su desktop la modale principale non aveva
  // alcun modo di essere chiusa — l'acquirente restava intrappolato e doveva
  // ricaricare la pagina del negozio (keyboard trap, WCAG 2.1.2).
  // Il listener sta su document perché la modale non ha il focus all'apertura;
  // removeWidgetModal() lo stacca, altrimenti sopravvive alla modale e un Esc
  // successivo invocherebbe un onClose ormai scaduto.
  modalEscHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose?.();
  };
  document.addEventListener('keydown', modalEscHandler);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) onClose?.(); // solo lo sfondo, non il contenuto
  });

  const container = document.createElement('div');
  container.setAttribute('data-cabina-modal-content', '');

  if (mobile) {
    container.style.cssText = [
      'background:#fff',
      'border-radius:16px 16px 0 0',
      'padding:0 24px 32px',
      'width:100%',
      'max-height:90vh',
      'overflow-y:auto',
      '-webkit-overflow-scrolling:touch',
      'position:relative',
      'animation:cabina-slide-up 0.25s ease-out',
    ].join(';');

    // Drag handle decorativo (AC1)
    const handle = document.createElement('div');
    handle.setAttribute('data-cabina-sheet-handle', '');
    handle.style.cssText = [
      'width:40px',
      'height:4px',
      'background:#e0e0e0',
      'border-radius:2px',
      'margin:12px auto 16px',
    ].join(';');
    container.appendChild(handle);

    // Swipe-down per chiudere (AC2)
    let touchStartY = 0;
    container.addEventListener('touchstart', (e: TouchEvent) => {
      touchStartY = e.touches[0]!.clientY;
    }, { passive: true });
    container.addEventListener('touchend', (e: TouchEvent) => {
      const deltaY = e.changedTouches[0]!.clientY - touchStartY;
      if (deltaY > 80 && container.scrollTop === 0) {
        onClose?.();
      }
    }, { passive: true });

    // Inietta animazione slide-up
    if (!document.getElementById('cabina-sheet-styles')) {
      const style = document.createElement('style');
      style.id = 'cabina-sheet-styles';
      style.textContent = `
        @keyframes cabina-slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }
  } else {
    container.style.cssText = [
      'background:#fff',
      'border-radius:8px',
      'padding:24px',
      'max-width:400px',
      'width:90%',
      'box-shadow:0 4px 24px rgba(0,0,0,0.15)',
      'position:relative',
    ].join(';');
  }

  // Logo brand del merchant (opzionale) — in cima al contenuto del modal.
  const logo = sanitizeLogoUrl(currentLogoUrl);
  if (logo) {
    const logoImg = document.createElement('img');
    logoImg.setAttribute('data-cabina-logo', '');
    logoImg.src = logo;
    logoImg.alt = '';
    logoImg.style.cssText = [
      'display:block',
      'max-height:36px',
      'max-width:160px',
      'width:auto',
      'object-fit:contain',
      mobile ? 'margin:0 auto 16px' : 'margin:0 0 16px',
    ].join(';');
    container.appendChild(logoImg);
  }

  overlay.appendChild(container);
  document.body.appendChild(overlay);
  widgetModal = overlay;
  return overlay;
}

function removeWidgetModal(): void {
  if (modalEscHandler) {
    document.removeEventListener('keydown', modalEscHandler);
    modalEscHandler = null;
  }
  if (widgetModal) {
    widgetModal.remove();
    widgetModal = null;
  }
}

function restoreDragHandle(content: Element): void {
  if (!isMobileViewport()) return;
  const handle = document.createElement('div');
  handle.setAttribute('data-cabina-sheet-handle', '');
  handle.style.cssText = 'width:40px;height:4px;background:#e0e0e0;border-radius:2px;margin:12px auto 16px';
  content.insertBefore(handle, content.firstChild);
}

/**
 * Banner d'errore di rendering, mostrato dallo step raggiunto da un
 * `RENDER_ERROR` — dal 2026-07-31 (Proposta a) è sempre il `form`, per entrambi
 * i percorsi (foto e modella preset).
 *
 * ⚠️ 2026-07-30 — esisteva solo nel `case 'form'`: chi arrivava dalla galleria
 * modelle veniva riportato allo step "Chi sei" SENZA una parola, e il try-on
 * sembrava semplicemente "non funzionare più". È così che si presenta all'utente
 * una quota generativa esaurita. Nessun ramo che riporta indietro l'acquirente
 * deve essere muto.
 */
export function renderRenderErrorBanner(content: Element, error: string | null): void {
  if (!error) return;
  const banner = document.createElement('p');
  banner.setAttribute('data-cabina-error', '');
  // ⚠️ 2026-08-02 — finché c'era l'overlay 2D a coprire ogni fallimento, un
  // messaggio unico bastava: l'acquirente vedeva comunque un'immagine. Ora il
  // fallimento è l'unica cosa che vede, e i tre casi non si equivalgono —
  // la quota è finita (riprovare è inutile), il consenso è negato (c'è una via
  // d'uscita), il servizio non risponde (riprovare ha senso).
  const chiavi: Record<string, string> = {
    quota: 'rendering.quota_exceeded',
    consent: 'rendering.consent_required',
    technical: 'rendering.unavailable',
  };
  const chiave = chiavi[error] ?? 'rendering.unavailable';
  const isQuota = error === 'quota';
  banner.style.cssText = isQuota
    // La quota esaurita non è un errore dell'acquirente: tono neutro, non rosso.
    ? 'color:#92400e;font-size:13px;margin:0 0 12px;padding:8px 12px;background:#fffbeb;border-radius:4px;'
    : 'color:#dc2626;font-size:13px;margin:0 0 12px;padding:8px 12px;background:#fef2f2;border-radius:4px;';
  banner.setAttribute('role', 'alert');
  banner.textContent = getLocaleString(chiave);
  content.appendChild(banner);
}

/**
 * Story 12.5 (Task 2.1): bottone "← Indietro" condiviso da `form` e
 * `garment_select` (pattern `restoreDragHandle` — helper di rendering
 * riusato, non un componente separato). Inserito subito dopo il drag
 * handle mobile (se presente), altrimenti come primo figlio del contenuto.
 * Il click ferma la propagazione: un tap sul bottone non deve attivare
 * lo swipe-down-to-close del modal mobile (Task 3.2).
 */
export function renderBackButton(content: Element, onBack: () => void): void {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('data-cabina-back-button', '');
  button.textContent = `← ${getLocaleString('common.back')}`;
  button.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'background:none',
    'border:none',
    'color:#6b7280',
    'font-size:13px',
    'cursor:pointer',
    'padding:4px 0',
    'margin:0 0 12px',
    'font-family:inherit',
  ].join(';');
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    onBack();
  });
  // Story 12.5 (fix code review): lo swipe-down-to-close mobile ascolta
  // touchstart/touchend sul container — un click stopPropagation NON lo ferma.
  // Fermiamo la propagazione dei touch originati sul bottone così un drag verso
  // il basso partito dal "←" non bolla al container e non chiude il modal.
  button.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  button.addEventListener('touchend', (e) => e.stopPropagation(), { passive: true });

  const handle = content.querySelector('[data-cabina-sheet-handle]');
  if (handle) {
    handle.insertAdjacentElement('afterend', button);
  } else {
    content.insertBefore(button, content.firstChild);
  }
}

// ── State-Driven Rendering ────────────────────────────────────────────────

function renderState(button: HTMLElement): void {
  switch (widgetContext.state) {
    case 'idle':
      // Nessuna UI attiva
      removeWidgetModal();
      break;

    case 'photo': {
      // Serve qui dal 2026-08-17: il consenso si dà e si registra su QUESTA
      // schermata, e la chiave è ciò che lo lega al negozio.
      const apiKey = currentApiKey;
      if (!apiKey) return;

      const overlay = ensureWidgetModal(() => {
        widgetContext = widgetReducer(widgetContext, { type: 'CLOSE' });
        renderState(button);
      });
      const content = overlay.querySelector('[data-cabina-modal-content]');
      if (!content) return;

      content.innerHTML = '';
      restoreDragHandle(content);

      const photoUI = createPhotoCapture(
        {
          title: getLocaleString('photo.title'),
          postureHint: getLocaleString('photo.posture_hint'),
          uploadButton: getLocaleString('photo.upload_button'),
          fileTooLarge: getLocaleString('photo.file_too_large'),
          unsupportedFormat: getLocaleString('photo.unsupported_format'),
          heicNotSupported: getLocaleStringOr('photo.heic_not_supported', 'photo.unsupported_format'),
          qualityOptimal: getLocaleString('photo.quality_optimal'),
          qualitySufficient: getLocaleString('photo.quality_sufficient'),
          qualityLow: getLocaleString('photo.quality_low'),
          consentText: getLocaleString('photo.consent_text'),
          consentPrivacyLabel: getLocaleString('photo.consent_privacy_label'),
          consentTermsLabel: getLocaleString('photo.consent_terms_label'),
          consentRequired: getLocaleString('photo.consent_required'),
        },
        {
          onPhotoReady: (dataUrl: string) => {
            widgetContext = widgetReducer(widgetContext, { type: 'PHOTO_UPLOADED', dataUrl });
            renderState(button);
          },
          // La spunta È il consenso: si registra come lo registrava il gate che
          // questa sostituisce — `localStorage` per leggerlo dentro la stessa visita
          // (`identitaTryon`, `shouldAttemptGenerative`), `consent_events` per averne
          // traccia lato nostro. ⚠️ 22/08: NON serve più a ripresentare la casella
          // già spuntata — nasce vuota ogni volta, la spunta la dà l'acquirente.
          // ⚠️ `sendConsentEvent` resta fire-and-forget (AD-4): non deve
          // congelare l'interfaccia. Quindi il consenso è dato anche se la sua
          // PROVA non arriva — è scritto nel piano, non è una svista.
          onConsentChange: (given: boolean) => {
            if (given) {
              savePhotoConsent(apiKey, true);
              sendConsentEvent(apiKey, widgetContext.baseUrl ?? '', {
                consentVersion: CURRENT_PHOTO_CONSENT_VERSION,
                eventType: 'given',
              });
            } else {
              // Togliere la spunta È la revoca (Art. 7(3): ritirare dev'essere
              // facile quanto dare). Prima stava dietro «Dimentica il consenso»
              // in un banner che non esiste più.
              clearPhotoConsent(apiKey);
              sendConsentEvent(apiKey, widgetContext.baseUrl ?? '', {
                consentVersion: CURRENT_PHOTO_CONSENT_VERSION,
                eventType: 'revoked',
              });
            }
          },
          onClose: () => {
            widgetContext = widgetReducer(widgetContext, { type: 'CLOSE' });
            renderState(button);
          },
        },
      );

      content.appendChild(photoUI);

      // ── Story 12.2: secondo percorso "oppure scegli una modella" (AC1/AC2/AC3).
      // Il PhotoCapture sopra resta il percorso PRIMARIO e INVARIATO (foto
      // personale → form → rendering con gate GDPR). Sotto appare la galleria
      // di modelle predefinite hostate da Cabina: nessuna foto personale,
      // nessun gate foto. Dal 2026-07-31 (Proposta a) anche questo percorso
      // passa dal `form` misure (auto-stima dalla foto modella) prima del
      // rendering — così il consiglio taglia è disponibile anche "senza foto".
      // MODEL_GALLERY_ENABLED resta come kill switch (dal 2026-07-26 ON, con
      // asset raster reali — prima OFF per i placeholder SVG, code review 12.2).
      if (MODEL_GALLERY_ENABLED) {
        const orLabel = document.createElement('p');
        orLabel.textContent = getLocaleString('model_gallery.or_label');
        orLabel.style.cssText = 'text-align:center;color:#9ca3af;font-size:12px;margin:16px 0 8px;text-transform:uppercase;letter-spacing:0.05em;';
        content.appendChild(orLabel);

        const gallery = createModelGallery(
          {
            title: getLocaleString('model_gallery.title'),
            subtitle: getLocaleString('model_gallery.subtitle'),
          },
          {
            // La selezione converte l'asset in data URL (contratto photoData
            // invariato verso tryonGenerative/callRenderApi) e dispatcha
            // PRESET_MODEL_SELECTED → form misure (Proposta a 2026-07-31).
            onModelSelected: async (model) => {
              // Guard re-entrancy (P1 code review): un secondo click durante la
              // fetch in volo verrebbe ignorato — niente doppio rendering/FASHN.
              if (modelSelectionInFlight) return;
              modelSelectionInFlight = true;

              const baseUrl = widgetContext.baseUrl ?? '';
              const modalContent = overlay.querySelector('[data-cabina-modal-content]');
              // Reset di un eventuale errore precedente prima del nuovo tentativo (P7).
              if (modalContent) setModelError(modalContent, '');
              try {
                // Normalizzata come una foto caricata: gli asset preset sono già
                // leggeri, ma così il formato a valle è davvero uno solo — è ciò
                // che photo-utils dichiara e su cui i consumatori possono contare.
                const dataUrl = await downscalePhotoDataUrl(
                  await fetchModelAsDataUrl(baseUrl, model.assetPath),
                );
                // Guard di ciclo di vita (P5): se durante i (fino a) 5s di fetch la
                // sessione è cambiata (modale chiuso/riaperto), NON dirottare la
                // nuova sessione in rendering con la modella vecchia.
                if (widgetContext.state !== 'photo') return;
                widgetContext = widgetReducer(widgetContext, { type: 'PRESET_MODEL_SELECTED', dataUrl });
                renderState(button);
              } catch (e) {
                // Silent non-blocking: mostra errore inline nella galleria,
                // resta sullo step 'photo' (l'acquirente può riprovare o usare la foto).
                console.warn('[widget] Failed to load preset model', model.assetPath, e);
                const errTarget = overlay.querySelector('[data-cabina-modal-content]');
                if (errTarget) setModelError(errTarget, getLocaleString('model_gallery.load_error'));
              } finally {
                modelSelectionInFlight = false;
              }
            },
          },
        );
        content.appendChild(gallery);

        // Risolve i src delle miniature rispetto al baseUrl del widget (CDN Cabina).
        // Le anteprime caricano l'asset statico direttamente (nessuna conversione).
        resolveModelThumbs(content, widgetContext.baseUrl ?? '');
      }

      break;
    }

    case 'form': {
      const apiKey = currentApiKey;
      if (!apiKey) return;

      const overlay = ensureWidgetModal(() => {
        widgetContext = widgetReducer(widgetContext, { type: 'CLOSE' });
        renderState(button);
      });
      const content = overlay.querySelector('[data-cabina-modal-content]');
      if (!content) return;

      content.innerHTML = '';
      restoreDragHandle(content);
      renderBackButton(content, () => {
        widgetContext = widgetReducer(widgetContext, { type: 'BACK' });
        renderState(button);
      });

      // Mostra errore di rendering localizzato (AC6: testo nella lingua rilevata)
      renderRenderErrorBanner(content, widgetContext.error);

      // ⚠️ 2026-08-17 — le misure non si salvano più sul dispositivo: la casella
      // «Ricorda le mie misure» è stata tolta (meno passaggi, e una cosa in meno
      // che resta addosso a chi passa di qui). Le stima l'AI dalla foto a ogni
      // prova, quindi non c'era granché da ricordare.
      const prefillMeasures = widgetContext.measures;

      const form = createMeasuresForm(
        {
          title: getLocaleString('form.title'),
          height: getLocaleString('form.height'),
          weight: getLocaleString('form.weight'),
          bust: getLocaleString('form.bust'),
          waist: getLocaleString('form.waist'),
          hips: getLocaleString('form.hips'),
          // Quel click ora avvia la prova (30 crediti), non solo un cambio
          // schermata: l'etichetta lo dice. Fallback sulla chiave vecchia
          // finché il locale nuovo non è propagato (bundle e JSON hanno cache
          // indipendenti — lezione della 12.6).
          confirm: getLocaleStringOr('form.confirm_and_try', 'form.confirm'),
          cancel: getLocaleString('form.cancel'),
          autoDetected: getLocaleString('form.auto_detected'),
          detectionFailed: getLocaleString('form.detection_failed'),
          // Fallback sulla chiave vecchia finché il locale nuovo non è propagato
          // (bundle e JSON hanno cache indipendenti — lezione della 12.6).
          detectionUnavailable: getLocaleStringOr('form.detection_unavailable', 'form.detection_failed'),
          detecting: getLocaleString('form.detecting'),
          detectingAI: getLocaleString('form.detecting_ai'),
          aiDetected: getLocaleString('form.ai_detected'),
          invalidHeight: getLocaleString('form.invalid_height'),
          invalidWeight: getLocaleString('form.invalid_weight'),
          invalidBust: getLocaleString('form.invalid_bust'),
          invalidWaist: getLocaleString('form.invalid_waist'),
          invalidHips: getLocaleString('form.invalid_hips'),
          heightCalibrationHint: getLocaleString('form.height_calibration_hint'),
          // Il piede (scarpe, 05/09/2026). Senza fallback su un'altra chiave:
          // «Altezza» al posto di «Piede» sarebbe peggio del testo inglese
          // che il form usa quando il locale non ha ancora la chiave.
          foot: senzaChiave(getLocaleString('form.foot')),
          invalidFoot: senzaChiave(getLocaleString('form.invalid_foot')),
        },
        {
          onConfirm: async (measures, measureSource) => {
            // 2026-08-03: da qui si va dritti in cabina, saltando "Cosa provi" —
            // il capo è quello della pagina su cui l'acquirente si trova già.
            // Senza immagine estraibile (tema che non espone og:image) i capi
            // restano indefiniti e il reducer riporta allo step, che lì è
            // l'unica strada.
            const url = extractProductImageUrl();
            let garments: SelectedGarment[] | undefined;
            if (url) {
              // ⚠️ Si ATTENDE la categoria, come fa il bottone di "Cosa provi":
              // partire con 'auto' fa scegliere a FASHN, e su un corsetto+gonna
              // restituiva un'immagine quasi identica alla foto di partenza
              // (accertato il 02/08). Il bottone resta spento nel frattempo.
              // 2026-08-09 — anche senza categoria certa la rimozione dei
              // vestiti la si chiede comunque (default nel resolver).
              let params: PageGarmentParams = { category: 'auto', removeExisting: true };
              try {
                params = await garmentAnalysisDone.then(() => resolvePageGarmentParams(garmentAnalysis));
              } catch {
                // Analisi fallita: resta il default sopra.
              }
              garments = [{ imageUrl: url, category: params.category, removeExisting: params.removeExisting, garmentPhotoType: 'auto' }];
            }
            // L'attesa sopra dura secondi, e nel frattempo si può chiudere o
            // tornare indietro: senza questo, una generazione da 30 crediti
            // partirebbe da uno step che l'acquirente ha già lasciato.
            if (widgetContext.state !== 'form') return;
            widgetContext = widgetReducer(widgetContext, { type: 'MEASURES_CONFIRMED', measures, measureSource, garments });
            renderState(button);
          },
          onCancel: () => {
            widgetContext = widgetReducer(widgetContext, { type: 'CLOSE' });
            renderState(button);
          },
          // ⚠️ Alla stima misure la foto va a 1024px, non ai 1600 del try-on.
          // A 1600 la vision impiega ~5,3s contro i ~7s di budget del primo
          // provider: ogni tanto sforava e rispondeva un SECONDO modello, con
          // misure sue — ed è da lì che veniva «la stima balla fra una prova e
          // l'altra». A 1024 la latenza si dimezza e le stime sono identiche.
          // Vedi `MEASURE_MAX_EDGE_PX`.
          onRequestAiEstimate: async (photoDataUrl: string) =>
            estimateMeasuresFromPhoto(
              apiKey,
              await downscalePhotoDataUrl(photoDataUrl, MEASURE_MAX_EDGE_PX),
              widgetContext.baseUrl ?? '',
            ),
        },
        widgetContext.photoData,
        prefillMeasures,
        currentPrimaryColor,
        // Il campo «lunghezza piede» compare solo per le scarpe: alle altre
        // categorie non serve, e un campo in più è un motivo in più per non
        // compilare. Se l'analisi non è ancora arrivata il campo non c'è, e
        // il consiglio usa la stima dall'altezza.
        garmentAnalysis?.category === 'footwear',
      );

      content.appendChild(form);
      break;
    }

    case 'garment_select': {
      // Story 12.3: step "Cosa provi". Mostra l'azione default "Prova in Cabina"
      // (AC1) + catalogo mix&match (AC2/AC3, silent-failure → solo default).
      const apiKey = currentApiKey;
      const baseUrl = widgetContext.baseUrl ?? '';

      const overlay = ensureWidgetModal(() => {
        widgetContext = widgetReducer(widgetContext, { type: 'CLOSE' });
        renderState(button);
      });
      const content = overlay.querySelector('[data-cabina-modal-content]');
      if (!content) return;
      content.innerHTML = '';
      restoreDragHandle(content);
      renderBackButton(content, () => {
        widgetContext = widgetReducer(widgetContext, { type: 'BACK' });
        renderState(button);
      });

      const garmentSelectStrings = {
        title: getLocaleString('garment_select.title'),
        defaultAction: getLocaleString('garment_select.default_action'),
        browseLabel: getLocaleString('garment_select.browse_label'),
        addToMix: getLocaleString('garment_select.add_to_mix'),
        remove: getLocaleString('garment_select.remove'),
        apply: getLocaleString('garment_select.apply'),
        mixLimitReached: getLocaleString('garment_select.mix_limit_reached'),
        loading: getLocaleString('garment_select.loading'),
        error: getLocaleString('garment_select.error'),
      };
      // ⚠️ La conferma del capo ora può arrivare in ritardo (il bottone attende
      // la categoria), e nel frattempo l'acquirente può tornare indietro,
      // chiudere, o rientrare qui da capo. Un handler rimasto appeso al
      // passaggio precedente farebbe partire da solo un rendering che nessuno
      // ha chiesto — una generazione a pagamento (30 crediti). Questo id
      // identifica l'ingresso corrente nello step: i callback nati in un
      // ingresso precedente vengono scartati. Il rimonto per il catalogo in
      // ritardo riusa lo STESSO oggetto callbacks, quindi non invalida nulla.
      const entryId = ++garmentSelectEntryId;
      const garmentSelectCallbacks = {
        onGarmentsConfirmed: (garments: SelectedGarment[]) => {
          if (entryId !== garmentSelectEntryId || widgetContext.state !== 'garment_select') return;
          widgetContext = widgetReducer(widgetContext, { type: 'GARMENTS_CONFIRMED', garments });
          renderState(button);
        },
        getProductImageUrl: () => extractProductImageUrl(),
        // Risolta al click, attendendo l'analisi se è ancora in volo: montare
        // questo step non garantisce che sia arrivata, e un click veloce
        // partiva con 'auto' (FASHN indovinava il capo, spesso male).
        getProductGarmentParams: () => garmentAnalysisDone.then(() => resolvePageGarmentParams(garmentAnalysis)),
      };

      // AC1 (fix regressione code review 12.3): l'azione default "Prova in
      // Cabina" è montata SUBITO, senza attendere il fetch del catalogo — il
      // catalogo è un progressive enhancement, non un prerequisito per il click
      // in un'azione che AC1 richiede sempre disponibile.
      content.appendChild(createGarmentSelect(null, garmentSelectStrings, garmentSelectCallbacks, currentPrimaryColor, widgetContext.selectedGarments));

      // Hint di caricamento non bloccante mentre il catalogo arriva (rimosso
      // in ogni esito, successo o silent-failure — non è un indicatore di
      // errore: un catalogo assente è uno stato normale, non da segnalare).
      const loadingHint = document.createElement('p');
      loadingHint.setAttribute('data-cabina-catalog-loading', '');
      loadingHint.textContent = garmentSelectStrings.loading;
      loadingHint.style.cssText = 'margin:8px 0 0;font-size:12px;color:#9ca3af;';
      content.appendChild(loadingHint);

      // Story 12.5 (fix code review): riusa il catalogo già in cache (`lastCatalog`,
      // popolato al primo fetch e condiviso con 'tryon') invece di rifare la fetch a
      // ogni ingresso — comune ora che BACK da 'tryon' rientra qui. Cache-miss (null,
      // es. silent-failure precedente o primo ingresso) → fetch come prima.
      const catalogPromise = lastCatalog
        ? Promise.resolve(lastCatalog)
        : (apiKey ? fetchCatalog(apiKey, baseUrl) : Promise.resolve(null));

      catalogPromise.then((catalog) => {
        // Fix (code review 12.4, P1-P2): il catalogo va cachato per il riuso
        // in 'tryon' (select-style, AC2) indipendentemente dal ciclo di vita
        // di QUESTA UI — la cache non dipende dal modale ancora aperto.
        lastCatalog = catalog;
        // Guard di ciclo di vita: se il modale è stato chiuso durante la fetch, esci.
        if (!content.isConnected) return;
        if (widgetContext.state !== 'garment_select') return;
        loadingHint.remove();
        if (!catalog) return; // silent-failure: il default resta l'unica opzione

        content.innerHTML = '';
        // Story 12.5: il catalogo arrivato in ritardo ripulisce content —
        // drag handle e back-button (montati nel render iniziale) vanno
        // ricreati, non solo il contenuto garment-select (regressione Task 3.1).
        restoreDragHandle(content);
        renderBackButton(content, () => {
          widgetContext = widgetReducer(widgetContext, { type: 'BACK' });
          renderState(button);
        });
        content.appendChild(createGarmentSelect(catalog, garmentSelectStrings, garmentSelectCallbacks, currentPrimaryColor, widgetContext.selectedGarments));
      });

      break;
    }

    case 'rendering': {
      // Avvia il Cloud Rendering — chiamata asincrona
      const apiKey = currentApiKey;
      const baseUrl = widgetContext.baseUrl ?? '';
      const photoData = widgetContext.photoData;

      // Misure parziali o assenti completate con DEFAULT_MEASURES (AC7).
      // Il cloud rendering riceve sempre tutti i campi richiesti.
      const measures: Measures = { ...DEFAULT_MEASURES, ...(widgetContext.measures ?? {}) };

      if (!apiKey || !photoData) {
        widgetContext = widgetReducer(widgetContext, { type: 'RENDER_ERROR', error: 'Missing data' });
        renderState(button);
        return;
      }

      // Invariante GDPR (CAP-1), FAIL-CLOSED: la foto dell'acquirente va al
      // generativo SOLO con consenso valido; **solo** la modella preset
      // (immagine Cabina, nessuna foto personale) ne fa a meno. Qualsiasi altro
      // valore di `identityMode` — `'user_photo'` e anche `null` — richiede il
      // consenso. Check sincrono su localStorage, predicato puro testato a parte.
      //
      // ⚠️ 2026-08-17 — qui prima si poteva APRIRE una schermata di consenso
      // (`showGate`). Non più: la spunta si dà sulla schermata foto, prima che la
      // foto lasci il dispositivo. Il predicato resta perché l'invariante resta:
      // se un domani un percorso portasse qui una foto senza consenso, non deve
      // partire — deve ripiegare sull'overlay 2D, in silenzio ma per scelta.
      const attemptGenerative = shouldAttemptGenerative(
        widgetContext.identityMode,
        loadPhotoConsent(apiKey),
      );

      // Mostra UI di loading
      const overlay = ensureWidgetModal(() => {
        widgetContext = widgetReducer(widgetContext, { type: 'CLOSE' });
        renderState(button);
      });
      const content = overlay.querySelector('[data-cabina-modal-content]');
      if (!content) return;
      content.innerHTML = '';
      restoreDragHandle(content);

      const loadingText = getLocaleString('rendering.loading');
      const spinner = document.createElement('div');
      spinner.setAttribute('data-cabina-rendering', '');
      spinner.style.cssText = [
        'display:flex',
        'flex-direction:column',
        'align-items:center',
        'justify-content:center',
        'gap:16px',
        'padding:32px',
        'text-align:center',
      ].join(';');

      const spinnerDot = document.createElement('div');
      spinnerDot.style.cssText = [
        'width:40px',
        'height:40px',
        'border:3px solid #e0e0e0',
        `border-top-color:${currentPrimaryColor}`,
        'border-radius:50%',
        'animation:cabina-spin 0.8s linear infinite',
      ].join(';');
      spinner.appendChild(spinnerDot);

      const label = document.createElement('p');
      label.textContent = loadingText;
      label.style.cssText = 'color:#333;font-size:14px;margin:0;';
      spinner.appendChild(label);

      // Avviso categoria (AC9)
      if (
        garmentAnalysis &&
        CATEGORIE_CON_AVVISO.includes(garmentAnalysis.category) &&
        garmentAnalysis.confidence > 0.7
      ) {
        const note = document.createElement('p');
        note.setAttribute('data-cabina-garment-note', '');
        note.textContent = getLocaleString('garment.not_clothing_note');
        note.style.cssText = 'color:#6b7280;font-size:12px;margin:0;';
        spinner.appendChild(note);
      }

      content.appendChild(spinner);

      // Inietta animazione spinner
      if (!document.getElementById('cabina-rendering-styles')) {
        const style = document.createElement('style');
        style.id = 'cabina-rendering-styles';
        style.textContent = `
          @keyframes cabina-spin {
            to { transform: rotate(360deg); }
          }
        `;
        document.head.appendChild(style);
      }

      // Story 12.3: capi selezionati nello step 'garment_select'. Fallback
      // difensivo: se null (non dovrebbe accadere dato il reducer), ricostruisce
      // un array a 1 elemento dal productImageUrl come oggi — evita un crash.
      const productImageUrl = extractProductImageUrl();
      if (!productImageUrl) {
        widgetContext = widgetReducer(widgetContext, {
          type: 'RENDER_ERROR',
          error: 'Product image not found',
        });
        renderState(button);
        return;
      }
      const selectedGarments = widgetContext.selectedGarments ?? [
        { imageUrl: productImageUrl, category: 'auto' as const },
      ];

      // ⚠️ 2026-08-02 — **il try-on È il generativo, punto.**
      //
      // Fino a oggi qui c'era una cascata a tre livelli: generativo → capo
      // ancorato alla posa nel browser → overlay Cloud. Un'immagine usciva
      // sempre, e proprio per questo il guasto non si vedeva mai. Ma l'overlay
      // 2D incollava il PNG del capo sopra la foto — su una figura intera
      // finiva sulla faccia — e gli angoli 1-3 mostravano una silhouette
      // disegnata al posto della persona. Decisione di Arou dopo averli visti:
      // fuori dal prodotto, non è roba da mostrare a un acquirente.
      //
      // Conseguenza da tenere a mente: **senza fallback, un fallimento è
      // visibile**. Per questo l'esito porta con sé la causa — «hai finito i
      // crediti» e «il servizio non risponde» richiedono due messaggi diversi.
      if (!attemptGenerative) {
        // Consenso foto negato: senza, la foto non può lasciare il dispositivo.
        // Non è un guasto, ed è l'unico caso con una via d'uscita immediata:
        // la modella Cabina non richiede alcun consenso.
        widgetContext = widgetReducer(widgetContext, { type: 'RENDER_ERROR', error: 'consent' });
        renderState(button);
        return;
      }

      tryonGenerative(apiKey, baseUrl, photoData!, selectedGarments, window.location.href, identitaTryon(apiKey))
        .then((esito) => {
          // Guardia anti-race DOM: se il modale è stato smontato durante l'await, esci.
          if (!content.isConnected) return;
          if (!esito.ok) {
            widgetContext = widgetReducer(widgetContext, { type: 'RENDER_ERROR', error: esito.reason });
            renderState(button);
            return;
          }
          // Story 12.4: resultId collega la segnalazione qualità alla generazione.
          lastTryonResultId = esito.resultId;
          widgetContext = widgetReducer(widgetContext, {
            type: 'RENDER_SUCCESS',
            results: [esito.url],
          });
          renderState(button);
        })
        .catch(() => {
          widgetContext = widgetReducer(widgetContext, { type: 'RENDER_ERROR', error: 'technical' });
          renderState(button);
        });
      break;
    }

    case 'tryon': {
      // Mostra l'overlay con le immagini composite per tutti gli angoli
      const renderResult = widgetContext.renderResult;
      if (!renderResult || renderResult.length === 0) {
        widgetContext = widgetReducer(widgetContext, { type: 'CLOSE' });
        renderState(button);
        return;
      }

      // Chiudi il modale (se ancora aperto) prima di mostrare l'overlay full-screen
      removeWidgetModal();

      // Story 7.4 (ri-cablata): l'acquirente ha raggiunto il risultato → segna la
      // sessione come completata (conversione). Fire-and-forget, una sola volta.
      if (!sessionCompleteSent && currentApiKey && currentSessionId) {
        sessionCompleteSent = true;
        notifySessionComplete(currentApiKey, widgetContext.baseUrl ?? '', currentSessionId);
      }

      // Story 12.4 (fix code review, P1-P2): apiKey/baseUrl servono SIA al calcolo
      // taglia esistente SIA al nuovo apiContext dello slider (swap capo + report) —
      // risolti una sola volta, prima di entrambi gli usi.
      const apiKeyForCalc = currentApiKey;
      const baseUrlForCalc = widgetContext.baseUrl ?? '';

      showTryOnOverlay(
        renderResult,
        () => {
          widgetContext = widgetReducer(widgetContext, { type: 'CLOSE' });
          renderState(button);
        },
        (angleIndex: number) => {
          // Sincronizza l'angolo corrente con la state machine
          widgetContext = widgetReducer(widgetContext, { type: 'ANGLE_CHANGED', angle: angleIndex });
        },
        widgetContext.recommendedSize,
        widgetContext.photoData,
        lastCatalog,
        lastTryonResultId,
        apiKeyForCalc ? { apiKey: apiKeyForCalc, baseUrl: baseUrlForCalc, identity: identitaTryon(apiKeyForCalc) } : undefined,
        () => {
          // Story 12.5 (fix code review): smonta l'overlay full-screen prima di
          // tornare a 'garment_select'. Senza questo, l'overlay resta montato dietro
          // il nuovo modal (leak DOM) e il suo listener Escape su document resta vivo
          // → premere Esc invocherebbe il vecchio onClose = CLOSE, azzerando la sessione.
          removeTryOnOverlay();
          widgetContext = widgetReducer(widgetContext, { type: 'BACK' });
          renderState(button);
        },
      );

      // Fetch size tables e calcola raccomandazione in background (Story 4.2)
      if (apiKeyForCalc) {
        // D2-fix: non calcolare la raccomandazione se l'utente non ha fornito alcuna misura.
        // DEFAULT_MEASURES sono placeholder per il rendering, non misure reali dell'utente.
        const hasMeasures = widgetContext.measures != null
          && (widgetContext.measures.heightCm != null
            || widgetContext.measures.bustCm != null
            || widgetContext.measures.waistCm != null
            || widgetContext.measures.hipsCm != null);
        if (!hasMeasures) {
          widgetContext = { ...widgetContext, recommendedSize: null };
          updateSizeBadge(null);
        } else {
          const measuresForCalc: Measures = { ...DEFAULT_MEASURES, ...(widgetContext.measures ?? {}) };
          // Il piede (scarpe, 05/09/2026): se l'acquirente non l'ha scritto, si
          // stima dall'altezza — e il consiglio lo sa, così pesa come una stima.
          const footEstimated = measuresForCalc.footCm == null;
          if (footEstimated) measuresForCalc.footCm = stimaPiedeDaAltezza(measuresForCalc.heightCm);
          fetchSizeTables(apiKeyForCalc, baseUrlForCalc).then((tables) => {
            if (tables && tables.length > 0) {
              // La tabella del capo, non la prima: su un pantalone «40», non «M».
              const scelta = recommendFromTables(measuresForCalc, tables, {
                measureSource: widgetContext.measureSource ?? undefined,
                garment: garmentAnalysis,
                footEstimated,
              });
              console.log(
                `[widget] size-table=${scelta?.table.name ?? '-'} category=${garmentAnalysis?.category ?? 'unknown'} candidate=${scelta?.candidates ?? 0}`,
              );
              const recommendation = scelta?.recommendation ?? null;
              widgetContext = { ...widgetContext, recommendedSize: recommendation };
              updateSizeBadge(recommendation);
            }
          });
        }
      }
      break;
    }

    case 'closed':
      removeWidgetModal();
      removeTryOnOverlay();
      // Preserva baseUrl attraverso il reset (l'apiKey sopravvive già via
      // currentApiKey). Vedi resetSessionContext per il perché.
      widgetContext = resetSessionContext(widgetContext);
      break;

    default:
      removeWidgetModal();
      break;
  }
}

// ── Button Injection ──────────────────────────────────────────────────────

// I punti d'aggancio e i selettori immagine vivono in `@cabina/shared`: la
// pagina /en/docs li **importa** invece di ricopiarli, cosi' togliere un
// selettore lo toglie anche dalla tabella che lo promette al merchant.
// Vedi `packages/shared/src/integration-targets.ts`.


/**
 * Il pulsante iniettato, per rimetterlo se il tema lo butta via (06/09/2026).
 *
 * Su Wix il riquadro d'acquisto viene ridisegnato dopo il caricamento (la
 * conversione di valuta, per esempio) e i nodi iniettati spariscono con lui:
 * il pulsante compariva e poi non c'era più, e il click andava a vuoto. Lo
 * snippet Custom Code del demo lo riagganciava a mano; qui lo fa il widget
 * per tutti i temi: un osservatore sul body, e alla prima mutazione che lo
 * trova staccato si rientra in `injectButton`, che lo ricrea nello stesso
 * punto. ponytail: un solo osservatore sul body, niente debounce — il costo
 * è un `isConnected` per batch di mutazioni.
 */
let bottoneIniettato: HTMLButtonElement | null = null;
let osservatoreBottone: MutationObserver | null = null;
let timerReinserimento: ReturnType<typeof setTimeout> | null = null;

function sorvegliaBottone(config: WidgetPublicConfig): void {
  if (osservatoreBottone || typeof MutationObserver === 'undefined') return;
  // L'osservatore vive quanto la pagina, di proposito: il tema può ridisegnare
  // il buybox in qualunque momento (valuta, variante, carrello) e il pulsante
  // deve tornare ogni volta. Il costo per batch è un `isConnected`.
  const osservatore = new MutationObserver(() => {
    if (timerReinserimento || !bottoneIniettato || bottoneIniettato.isConnected) return;
    // Rimandato di un giro: un ridisegno a più passi potrebbe non aver ancora
    // rimesso il blocco d'acquisto, e reinserire subito finirebbe sul body
    // (rilievo Kilo, PR #204). Il timer si tiene per annullarlo nel reset dei
    // test: scattato a documento smontato, in CI era «document is not defined».
    timerReinserimento = setTimeout(() => {
      timerReinserimento = null;
      if (typeof document === 'undefined') return;
      if (bottoneIniettato && !bottoneIniettato.isConnected) {
        bottoneIniettato = null;
        injectButton(config);
      }
    }, 0);
  });
  try {
    osservatore.observe(document.body, { childList: true, subtree: true });
  } catch {
    return; // nessun body osservabile (documento non standard): si resta senza sorveglianza
  }
  osservatoreBottone = osservatore;
}

function injectButton(config: WidgetPublicConfig): void {
  if (document.querySelector('[data-cabina-widget-btn]')) return;

  // `data-cabina-target` è la scelta esplicita del merchant e vince su tutto:
  // lì il pulsante va DENTRO, non accanto.
  const explicitTarget = document.querySelector(`[${BUTTON_TARGET_ATTR}]`) as HTMLElement | null;
  const anchor = explicitTarget
    ? null
    : BUTTON_ANCHORS.reduce<HTMLElement | null>(
        (found, selector) => {
          if (found) return found;
          try {
            return document.querySelector(selector) as HTMLElement | null;
          } catch {
            return null; // selettore non supportato dal browser — passa al prossimo
          }
        },
        null,
      );

  const container = explicitTarget ?? anchor?.parentElement ?? document.body;

  const button = document.createElement('button');
  // ⚠️ 2026-08-19 — `type` esplicito, e non è una rifinitura.
  //
  // Un `<button>` senza `type` dentro un `<form>` vale `submit`. I due punti
  // d'aggancio Shopify più specifici — `.product-form__buttons` e
  // `form[action*="/cart/add"] .product-form__submit` — stanno DENTRO il form
  // del carrello, e `.single_add_to_cart_button` dentro `form.cart`: su quei
  // temi il click apriva la cabina e **nello stesso istante inviava il form**,
  // mettendo il capo nel carrello e portando l'acquirente su /cart/add. La
  // cabina non faceva in tempo a comparire.
  //
  // 🔑 Il test che copriva l'aggancio usava il terzo selettore, l'unico che
  // lascia il pulsante FUORI dal form: verde, e cieco proprio ai due casi
  // rotti. Scoperto dal banco degli screenshot (`cattura-screenshot-docs.mjs`),
  // cioè da qualcosa che il pulsante lo ha davvero premuto.
  button.type = 'button';
  button.textContent = config.buttonText;
  button.setAttribute('data-cabina-widget-btn', '');
  button.style.cssText = [
    `background-color:${sanitizeColor(config.primaryColor)}`,
    'color:#fff',
    'border:none',
    'border-radius:4px',
    'padding:10px 20px',
    'font-size:16px',
    'cursor:pointer',
    'font-family:inherit',
  ].join(';');

  button.addEventListener('click', () => {
    // Browser detection
    if (!isBrowserSupported()) {
      showUnsupportedTooltip(button);
      return;
    }

    // Avvia la state machine
    if (widgetContext.state === 'idle') {
      // Story 5.2 (rivisto 2026-07-15): conteggio sessione al PRIMO OPEN —
      // async, MAI bloccante sull'apertura. Se questa apertura fa scattare il
      // limite piano, la sessione corrente procede comunque (grace): il gate
      // per le visite successive è config.widgetDisabled al prossimo load.
      if (!sessionStarted && currentApiKey) {
        sessionStarted = true;
        notifySessionStart(currentApiKey, widgetContext.baseUrl ?? '').then((r) => {
          currentSessionId = r.sessionId ?? null;
        }).catch(() => {});
      }
      widgetContext = widgetReducer(widgetContext, { type: 'OPEN' });
      renderState(button);
    }
  });

  // Subito dopo il blocco d'acquisto quando l'abbiamo trovato; in coda al
  // contenitore negli altri casi (target esplicito o fallback su body).
  if (anchor && anchor.parentElement === container) {
    anchor.insertAdjacentElement('afterend', button);
  } else {
    container.appendChild(button);
  }

  // Sul body il pulsante è una striscia in fondo alla pagina: dargli almeno
  // aria di elemento a sé, invece di incollarlo al contenuto che lo precede.
  if (container === document.body) {
    button.style.margin = '16px auto';
    button.style.display = 'block';
  } else {
    // Dentro il blocco d'acquisto il pulsante è uno della fila «Add to Cart /
    // Buy Now»: largo come loro (06/09/2026, demo Wix — prima lo faceva a
    // mano lo snippet Custom Code; il tema Cabina lo fa dal suo CSS).
    button.style.marginTop = '12px';
    button.style.display = 'block';
    button.style.width = '100%';
    button.style.boxSizing = 'border-box';
  }

  bottoneIniettato = button;
  sorvegliaBottone(config);
}

// ── Public API ────────────────────────────────────────────────────────────

export async function initWidget(apiKey: string, baseUrl = ''): Promise<void> {
  if (initStarted) return;
  initStarted = true;

  // Salva apiKey e baseUrl a livello modulo per uso in renderState()
  currentApiKey = apiKey;
  widgetContext = { ...widgetContext, baseUrl };

  // ⚠️ Coda della rimozione di «Ricorda le mie misure» (2026-08-17): chi l'aveva
  // spuntata ha altezza, busto, vita e fianchi nel proprio localStorage, e senza
  // questa riga se li terrebbe per sempre — non c'è più nessuna schermata da cui
  // toglierli. *Cancellare una funzione non cancella i dati che ha prodotto.*
  clearMeasurements(apiKey);

  const config = await fetchWidgetConfig(apiKey, baseUrl);
  if (!config) return;

  // Branding: memorizza il logo (sanitizzato) per il rendering nel modal.
  currentLogoUrl = sanitizeLogoUrl(config.logoUrl);
  // Story 12.5 (Task 2.5): colore brand, riusa sanitizeColor già esistente (no duplicazione validazione).
  currentPrimaryColor = sanitizeColor(config.primaryColor);

  // Story 5.2: Notifica inizio sessione — se il piano è esaurito (SESSION_LIMIT_REACHED),
  // non renderizzare il pulsante e non caricare i locale.
  // Story 5.2 (rivisto 2026-07-15): il gate limite-piano ora arriva dalla config
  // (widgetDisabled) — nessun pulsante renderizzato, il sito del merchant
  // continua a funzionare (NFR-12). La sessione NON viene più contata al load
  // della pagina: si conta al PRIMO OPEN del widget (vedi injectButton), così
  // le semplici visite alla pagina prodotto non consumano il piano.
  // ⚠️ 2026-08-04 — `creditsExhausted` segue la stessa strada: senza crediti la
  // prova non può riuscire, e farla iniziare significava spendere una stima
  // misure a pagamento per finire sul messaggio «prove esaurite» — a ogni click.
  if (config.widgetDisabled || config.creditsExhausted) {
    return;
  }

  // I18n: risolve la lingua e carica il locale
  const lang = resolveLanguage(config.defaultLanguage);
  try {
    await loadLocale(lang, baseUrl);
    currentLang = getCurrentLanguage();
  } catch {
    // Fallback silenzioso: loadLocale ha già tentato 'en' internamente
    // Se anche 'en' fallisce, il widget continua senza traduzioni (usa chiavi raw)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectButton(config);
      startGarmentAnalysis(apiKey, baseUrl);
      apriSeChiestoDallUrl();
    });
  } else {
    injectButton(config);
    startGarmentAnalysis(apiKey, baseUrl);
    apriSeChiestoDallUrl();
  }
}

/**
 * Si arriva da una pagina dello STESSO negozio?
 *
 * ⚠️ È la guardia che impedisce a `?cabina=prova` di diventare un modo per
 * spendere il piano del merchant a sua insaputa (rilievo della review, PR #127).
 * Aprire la cabina conta una sessione (`notifySessionStart`, nel click qui
 * sopra), e le sessioni sono la metrica del piano: quando finiscono,
 * `config.widgetDisabled` **spegne il widget per tutti**. Un link con quel
 * parametro incollato su WhatsApp, in una newsletter o su un social aprirebbe
 * una sessione per ogni persona che lo tocca, nessuna delle quali ha chiesto
 * una prova.
 *
 * Il badge "Prova" porta sempre da una pagina del negozio, quindi il caso vero
 * passa; tutto ciò che arriva da fuori no. Con `Referrer-Policy: no-referrer` il
 * referrer manca sempre e l'apertura automatica non scatta mai: si perde una
 * comodità, non una funzione, perché il pulsante è lì in pagina.
 *
 * ⚠️ Confronto sull'**host**, non sull'origin: `origin` include lo schema, e un
 * negozio ancora raggiungibile in http farebbe fallire la guardia su una
 * navigazione interna del tutto legittima. `host` toglie lo schema ma **tiene la
 * porta** — che va tenuta: era `hostname`, e metteva sullo stesso piano due siti
 * diversi affacciati sullo stesso host (rilievo della review su #128).
 *
 * ⚠️ Resta un caso che questa guardia rifiuta pur essendo legittimo: un negozio
 * su **più hostname** (`negozio.com` e `shop.negozio.com`, o `.myshopify.com`
 * che redirige al dominio primario portandosi dietro il referrer di partenza).
 * Non si allenta a "dominio registrabile" perché senza public suffix list quel
 * confronto si sbaglia in silenzio, ed è per questo che il rifiuto ora **si
 * legge in console**: chi collauda deve poter capire perché l'apertura non è
 * scattata, invece di dedurlo — è la forma di guasto che questo progetto ha già
 * pagato più volte.
 */
function arrivaDalNegozio(): boolean {
  const referrer = document.referrer;
  if (!referrer) {
    console.debug(
      '[cabina] apertura automatica saltata: nessun referrer. Il link ?cabina=prova ' +
      'e stato aperto direttamente (barra, WhatsApp, mail) oppure il negozio usa ' +
      'Referrer-Policy: no-referrer. Il pulsante di prova resta disponibile in pagina.'
    );
    return false;
  }
  let hostReferrer: string;
  try {
    // `host` e non `hostname`: quel che va ignorato e lo SCHEMA (un negozio
    // ancora raggiungibile in http), non la porta. `hostname` buttava via anche
    // quella, mettendo sullo stesso piano due siti diversi che condividono un
    // host — `localhost:3000` e `localhost:4322` sono la stessa cosa solo per
    // sbaglio.
    hostReferrer = new URL(referrer).host;
  } catch {
    // ⚠️ Il referrer NON si stampa: e un URL completo, e gli URL si portano
    // dietro query string — token di reset, id di sessione, parametri di
    // campagna. La console finisce nei raccoglitori di log e nelle segnalazioni
    // di errore, che non sono il posto di un token. Stessa regola del body di
    // `estimate-measures`, che non si logga perche contiene la foto.
    console.debug('[cabina] apertura automatica saltata: referrer non interpretabile.');
    return false;
  }
  if (hostReferrer !== window.location.host) {
    // Qui si nomina il solo host — nessuna query string, nessun percorso: e
    // l'informazione che serve a capire perche non si e aperto, e si ferma li.
    console.debug(
      `[cabina] apertura automatica saltata: si arriva da ${hostReferrer}, ` +
      `che non e ${window.location.host}. Aprire conta una sessione del piano, ` +
      'quindi vale solo arrivando da una pagina del negozio stesso.'
    );
    return false;
  }
  return true;
}

/**
 * Apre la cabina da sé quando si arriva con `?cabina=prova` — l'acquirente ha
 * già chiesto la prova altrove (il badge sulle card di collezione) e non deve
 * chiederla due volte.
 *
 * Preme il pulsante invece di chiamare la state machine: così l'avvio passa
 * dalle stesse guardie del click normale — browser supportato, conteggio della
 * sessione al primo OPEN — e non nasce una seconda strada d'ingresso che possa
 * divergere da quella vera.
 */
function apriSeChiestoDallUrl(): void {
  let url: URL;
  try {
    url = new URL(window.location.href);
  } catch {
    return;
  }
  if (url.searchParams.get(AUTO_OPEN_PARAM) !== AUTO_OPEN_VALUE) return;

  // Il parametro si consuma SEMPRE, anche quando non si apre: così un link
  // arrivato da fuori non se lo trascina dietro nella barra, e una ricarica non
  // ritenta. Senza, ogni ricarica riproverebbe l'apertura.
  url.searchParams.delete(AUTO_OPEN_PARAM);
  try {
    window.history.replaceState(null, '', url.toString());
  } catch {
    // Contesto senza history accessibile (iframe sandboxed): l'apertura vale
    // comunque, si perde solo la pulizia dell'URL.
  }

  if (!arrivaDalNegozio()) return;

  // `injectButton` non restituisce il pulsante: si cerca dove l'ha messo.
  // Assente quando il piano è esaurito o non c'è punto d'aggancio — casi in cui
  // non aprire è la risposta giusta.
  document.querySelector<HTMLElement>('[data-cabina-widget-btn]')?.click();
}

function startGarmentAnalysis(apiKey: string, baseUrl: string): void {
  garmentAnalysis = null;
  const productUrl = extractProductImageUrl();
  if (!productUrl) {
    garmentAnalysisDone = Promise.resolve();
    return;
  }
  garmentAnalysisDone = analyzeGarmentFromUrl(apiKey, productUrl, baseUrl)
    .then((result) => { garmentAnalysis = result; })
    .catch(() => { garmentAnalysis = null; });
}

/**
 * Restituisce la lingua corrente del widget dopo l'inizializzazione.
 * Null se initWidget non è ancora stato chiamato o è fallito.
 */
export function getWidgetLanguage(): SupportedLanguage | null {
  return currentLang;
}