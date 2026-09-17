import {
  validatePhotoFile,
  readFileAsDataUrl,
  assessPhotoQuality,
  downscalePhotoDataUrl,
  isHeicFile,
  type PhotoQualityResult,
} from './photo-utils';

/**
 * Pagine legali linkate dalla spunta di consenso. Sono sull'**apex**
 * (`cabina.io`), non su `www`: `www.cabina.io/privacy` è 404, perché lì vive la
 * dashboard. ⚠️ Non è in contraddizione con la regola «mai l'apex» dell'incidente
 * CDN del 21/07: quella riguarda le richieste del bundle e delle API, dove il 308
 * apex→www rompe CORS. Qui è una **navigazione** aperta dal browser, che i
 * redirect li segue senza problemi.
 */
const PRIVACY_URL = 'https://cabina.io/privacy';
const TERMS_URL = 'https://cabina.io/termini';

export interface PhotoCaptureStrings {
  title: string;
  /** La postura consigliata. Va detta PRIMA dello scatto: dopo è solo un rimprovero.
   *  Misurato il 06/08: sulla stessa persona, la posa in tre quarti con la mano in
   *  tasca fa applicare l'abito sopra i jeans e sposta la vita stimata di 7 cm
   *  (più di una fascia di taglia). Vedi `docs/wiki/stima-misure.md` e /guida-foto. */
  postureHint: string;
  uploadButton: string;
  fileTooLarge: string;
  unsupportedFormat: string;
  heicNotSupported: string;
  qualityOptimal: string;
  qualitySufficient: string;
  qualityLow: string;
  /** Testo della spunta. Contiene i segnaposto `{termini}` e `{privacy}`, che
   *  diventano link cliccabili: così ogni lingua decide il proprio ordine delle
   *  parole invece di ricevere una frase spezzata in tre pezzi da concatenare. */
  consentText: string;
  consentPrivacyLabel: string;
  consentTermsLabel: string;
  /** Perché «Carica foto» è inerte. Va detto: un bottone spento e muto è un
   *  guasto, per chi guarda. Reso come testo **sotto il bottone**, non come
   *  `title`: un tooltip su un controllo `disabled` non compare mai. */
  consentRequired: string;
}

export interface PhotoCaptureCallbacks {
  onPhotoReady: (dataUrl: string) => void;
  /** Spunta cambiata: `true` = consenso dato, `false` = **revocato**. Chi chiama
   *  registra entrambi (`given` / `revoked`) — togliere la spunta è l'unico modo
   *  che l'acquirente ha di ritirare il consenso (Art. 7(3)). */
  onConsentChange: (given: boolean) => void;
  onClose: () => void;
}

/**
 * Schermata di acquisizione foto: è il **primo** schermo del widget dal
 * 2026-08-17, e porta con sé il consenso.
 *
 * 🔑 Tre passaggi tolti, e uno spostato:
 * - la modale «Consenso Privacy» che apriva il widget non esiste più (spostava
 *   soltanto allo step successivo, senza registrare niente);
 * - «Scatta foto» è sparito: su mobile `<input type="file" accept="image/*">`
 *   apre già la fotocamera, e qui restava un percorso `getUserMedia` intero da
 *   mantenere per la sola webcam da desktop;
 * - «Continua» è sparito: a foto valida si prosegue da soli.
 *   ⚠️ Ma il **controllo qualità che quel bottone applicava non è sparito con
 *   lui**: con qualità `low` non si avanza e lo si dice. Toglierlo insieme al
 *   bottone sarebbe stata l'ottimizzazione che porta via anche l'effetto
 *   collaterale del passaggio saltato.
 */
export function createPhotoCapture(
  strings: PhotoCaptureStrings,
  callbacks: PhotoCaptureCallbacks,
): DocumentFragment {
  const fragment = document.createDocumentFragment();

  // ── Contenitore principale ──────────────────────────────────────────
  const container = document.createElement('div');
  container.setAttribute('data-cabina-photo', '');

  // Titolo
  const title = document.createElement('h2');
  title.textContent = strings.title;
  title.style.cssText = 'margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a1a;';
  container.appendChild(title);

  // Perché «Carica foto» è inerte. Deve stare NEL DOM, non in un `title`: un
  // bottone `disabled` non riceve eventi del mouse (niente tooltip, e niente
  // `:hover`, quindi nemmeno il `cursor:not-allowed` che stava qui) e sta fuori
  // dall'ordine di tabulazione, quindi nessuno screen reader lo incontra.
  // `role="status"` perché la frase RICOMPARE quando si toglie la spunta, e quel
  // ritorno va annunciato.
  // ⚠️ E per questo il paragrafo **non viene mai nascosto**: `display:none` toglie
  // l'elemento dall'albero di accessibilità, quindi una live region spenta non è
  // sorvegliata da nessuno — riaccenderla e riempirla nello stesso giro fa
  // comparire un nodo nuovo invece di un contenuto cambiato, e l'annuncio non è
  // garantito. Cambia SOLO `textContent`: un `<p>` vuoto non disegna niente, e
  // così sparisce anche il salto di layout dell'alternanza none/block.
  // 📌 Questo rimuove un ostacolo documentato; non dimostra che un lettore di
  // schermo annunci davvero — nessun test qui può provarlo.
  const consentHint = document.createElement('p');
  consentHint.setAttribute('data-cabina-photo-consent-hint', '');
  consentHint.setAttribute('role', 'status');
  // IN TESTA, subito sotto il titolo, in ambra: la casella non si può spuntare
  // al posto dell'acquirente, quindi la prima cosa che legge dev'essere cosa
  // deve fare. Grigia in fondo al pannello passava per una nota a piè di pagina
  // e nessuno la leggeva (Arou, 2026-08-22, prima prova con foto vera e v4).
  consentHint.style.cssText = 'margin:0 0 12px;font-size:13px;line-height:1.4;color:#b45309;font-weight:500;';
  container.appendChild(consentHint);

  const postureHint = document.createElement('p');
  postureHint.textContent = strings.postureHint;
  postureHint.setAttribute('data-cabina-photo-posture', '');
  postureHint.style.cssText = 'margin:0 0 16px;font-size:13px;line-height:1.4;color:#6b7280;';
  container.appendChild(postureHint);

  // Area anteprima
  const preview = document.createElement('div');
  preview.setAttribute('data-cabina-photo-preview', '');
  preview.style.cssText = [
    'width:100%',
    'height:200px',
    'border:2px dashed #d1d5db',
    'border-radius:8px',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'margin-bottom:12px',
    'background:#f9fafb',
    'overflow:hidden',
    'position:relative',
  ].join(';');
  container.appendChild(preview);

  // Indicatore qualità
  const qualityIndicator = document.createElement('div');
  qualityIndicator.setAttribute('data-cabina-photo-quality', '');
  qualityIndicator.style.cssText = [
    'font-size:13px',
    'margin-bottom:12px',
    'min-height:20px',
    'text-align:center',
  ].join(';');
  container.appendChild(qualityIndicator);

  // Area errore
  const errorArea = document.createElement('div');
  errorArea.setAttribute('data-cabina-photo-error', '');
  // Senza live region il messaggio di rifiuto è testo rosso che nessuno screen
  // reader annuncia: per quell'acquirente l'errore sarebbe muto davvero.
  errorArea.setAttribute('role', 'alert');
  errorArea.style.cssText = [
    'color:#dc2626',
    'font-size:13px',
    'margin-bottom:8px',
    'min-height:20px',
    'display:none',
  ].join(';');
  container.appendChild(errorArea);

  // ── Consenso ───────────────────────────────────────────────────────
  // Sta QUI, sopra il bottone che manda via la foto, perché è l'unico punto in
  // cui il consenso precede il trasferimento: dallo step successivo la foto è
  // già partita verso il servizio di visione per la stima misure.
  const consentRow = document.createElement('label');
  consentRow.setAttribute('data-cabina-photo-consent-row', '');
  consentRow.style.cssText = [
    'display:flex',
    'align-items:flex-start',
    'gap:8px',
    'margin-bottom:12px',
    'font-size:12px',
    'line-height:1.45',
    'color:#4b5563',
    'cursor:pointer',
  ].join(';');

  const consentCheckbox = document.createElement('input');
  consentCheckbox.type = 'checkbox';
  // Nasce VUOTA, sempre — anche se in `localStorage` c'è un consenso valido
  // dato un'altra volta. Fino al 22/08 la spunta rinasceva già data dal
  // salvataggio: l'acquirente apriva «La tua foto» e la trovava accettata al
  // posto suo (Arou). La spunta la dà lui, ogni volta; il salvataggio serve
  // dentro la stessa visita (`identitaTryon`, `shouldAttemptGenerative`) e
  // come traccia della versione accettata.
  consentCheckbox.checked = false;
  consentCheckbox.setAttribute('data-cabina-photo-consent-check', '');
  consentCheckbox.style.cssText = 'margin-top:2px;cursor:pointer;flex-shrink:0;';

  const consentLabel = document.createElement('span');
  appendConsentText(consentLabel, strings);

  consentRow.appendChild(consentCheckbox);
  consentRow.appendChild(consentLabel);
  container.appendChild(consentRow);

  // ── Bottoni azione ─────────────────────────────────────────────────
  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

  // Upload file. L'input nascosto va APPESO al DOM: `fileInput.click()` funziona
  // anche da staccato, ma un elemento detached non è raggiungibile da test E2E
  // (Playwright setInputFiles) né da screen reader/autofill.
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  // HEIC/HEIF NON sono dichiarati di proposito: iOS Safari transcodifica in JPEG
  // all'upload solo quando l'accept non li menziona. Dichiararli farebbe arrivare
  // l'HEIC originale proprio sul canale mobile. Chi ne sceglie uno lo stesso
  // (picker desktop, drag&drop) viene comunque gestito: si prova a decodificarlo.
  fileInput.accept = 'image/jpeg,image/png,image/webp';
  fileInput.style.display = 'none';
  fileInput.setAttribute('data-cabina-file-input', '');
  container.appendChild(fileInput);

  const uploadBtn = document.createElement('button');
  uploadBtn.textContent = strings.uploadButton;
  uploadBtn.setAttribute('data-cabina-upload-btn', '');
  uploadBtn.style.cssText = buttonStyle();
  uploadBtn.addEventListener('click', () => {
    if (!consentCheckbox.checked) return;
    fileInput.click();
  });

  buttonRow.appendChild(uploadBtn);
  container.appendChild(buttonRow);


  fragment.appendChild(container);

  // ── Stato interno ──────────────────────────────────────────────────
  let currentDataUrl: string | null = null;

  function applyConsentState(): void {
    const given = consentCheckbox.checked;
    uploadBtn.disabled = !given;
    uploadBtn.style.opacity = given ? '1' : '0.5';
    consentHint.textContent = given ? '' : strings.consentRequired;
  }
  applyConsentState();

  consentCheckbox.addEventListener('change', () => {
    applyConsentState();
    // Anche il `false`: togliere la spunta è la revoca, e chi chiama la registra.
    callbacks.onConsentChange(consentCheckbox.checked);
  });

  function showError(message: string): void {
    errorArea.textContent = message;
    errorArea.style.display = 'block';
  }

  function hideError(): void {
    errorArea.textContent = '';
    errorArea.style.display = 'none';
  }

  function showQuality(quality: PhotoQualityResult): void {
    const labels: Record<string, string> = {
      optimal: strings.qualityOptimal,
      sufficient: strings.qualitySufficient,
      low: strings.qualityLow,
    };
    const colors: Record<string, string> = {
      optimal: '#16a34a',
      sufficient: '#ca8a04',
      low: '#dc2626',
    };
    const label = labels[quality.quality] ?? quality.quality;
    qualityIndicator.textContent = `${label} (${quality.width}×${quality.height})`;
    qualityIndicator.style.color = colors[quality.quality] ?? '#6b7280';
  }

  function showPreview(dataUrl: string): void {
    preview.innerHTML = '';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.cssText = [
      'max-width:100%',
      'max-height:100%',
      'object-fit:contain',
      'border-radius:4px',
    ].join(';');
    preview.appendChild(img);
  }

  /** Invalida la foto corrente: un file rifiutato non deve lasciare selezionabile
   *  quella di prima, o l'acquirente prosegue con una foto che crede sostituita. */
  function clearPhoto(): void {
    currentDataUrl = null;
    qualityIndicator.textContent = '';
  }

  /** Cresce a ogni selezione: solo la più recente può scrivere lo stato. Senza
   *  questo, due scelte ravvicinate fanno vincere la più LENTA — e da quando ogni
   *  foto passa dalla ricodifica, anche le piccole percorrono la via asincrona. */
  let selectionToken = 0;

  async function handleFile(file: File): Promise<void> {
    hideError();
    const token = ++selectionToken;

    const validation = validatePhotoFile(file);
    if (!validation.valid) {
      clearPhoto();
      if (validation.error === 'unsupported_format') {
        showError(strings.unsupportedFormat);
      } else if (validation.error === 'file_too_large') {
        showError(strings.fileTooLarge);
      }
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      // Resize UNA volta qui (2026-07-31, bug PHOTO_TOO_LARGE): photoData resta
      // gestibile per la stima misure e per il try-on.
      const downscaled = await downscalePhotoDataUrl(dataUrl);
      const quality = await assessPhotoQuality(downscaled);
      if (token !== selectionToken) return; // sorpassata da una selezione più recente
      currentDataUrl = downscaled;
      showPreview(downscaled);
      showQuality(quality);

      // ⚠️ Il gate di qualità sopravvive al bottone «Continua» che lo applicava:
      // con `low` si resta qui, l'indicatore rosso dice perché, e l'acquirente
      // ne sceglie un'altra. Con qualità accettabile si prosegue da soli — ed è
      // qui che si risparmia il clic.
      // ⚠️ Ricontrolla anche la spunta: fra la scelta del file e la decodifica
      // l'acquirente può averla tolta, e quella revoca deve valere.
      if (quality.quality !== 'low' && consentCheckbox.checked) {
        callbacks.onPhotoReady(downscaled);
      }
    } catch {
      if (token !== selectionToken) return;
      clearPhoto();
      // Qui la decodifica è fallita davvero. Se il file era HEIC, il browser non
      // sa aprirlo (Safari 17+ sì): messaggio dedicato che dice cosa fare, non
      // il generico "formato non supportato".
      showError(isHeicFile(file.name, file.type) ? strings.heicNotSupported : strings.unsupportedFormat);
    }
  }

  // ── Event listeners ────────────────────────────────────────────────

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleFile(file);
    // Reset input per permettere lo stesso file in caso di retry
    fileInput.value = '';
  });

  return fragment;
}

/**
 * Compone il testo della spunta sostituendo `{termini}` e `{privacy}` con due
 * link. Niente `innerHTML`: il testo arriva da un dizionario, ma comporlo con
 * nodi veri toglie di mezzo la domanda «e se una traduzione contenesse markup».
 */
function appendConsentText(target: HTMLElement, strings: PhotoCaptureStrings): void {
  const link = (href: string, label: string): HTMLAnchorElement => {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = label;
    a.target = '_blank';
    // `noopener` non è cerimonia: senza, la pagina aperta può manipolare la
    // nostra via `window.opener` — e questa gira dentro il negozio di un altro.
    a.rel = 'noopener noreferrer';
    a.style.cssText = 'color:#1a1a1a;text-decoration:underline;';
    // Il click sul link non deve spuntare la casella: il `label` che li contiene
    // inoltrerebbe il click alla checkbox, dando un consenso a chi voleva solo
    // leggere.
    a.addEventListener('click', (e) => e.stopPropagation());
    return a;
  };

  const pezzi = strings.consentText.split(/(\{termini\}|\{privacy\})/);
  for (const pezzo of pezzi) {
    if (pezzo === '{termini}') {
      target.appendChild(link(TERMS_URL, strings.consentTermsLabel));
    } else if (pezzo === '{privacy}') {
      target.appendChild(link(PRIVACY_URL, strings.consentPrivacyLabel));
    } else if (pezzo) {
      target.appendChild(document.createTextNode(pezzo));
    }
  }
}

function buttonStyle(): string {
  return [
    'padding:8px 16px',
    'border:1px solid #d1d5db',
    'border-radius:4px',
    'background:#fff',
    'cursor:pointer',
    'font-size:14px',
    'font-family:inherit',
    'color:#1a1a1a',
    'transition:background 0.15s',
  ].join(';');
}
