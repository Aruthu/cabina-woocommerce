import type { Measures, StimaMisure } from '@cabina/shared';
import type { FitPreference, MeasureSource } from '../size/size-recommendation';
import { calibrateCircumferences, REFERENCE_HEIGHT_CM } from './measure-estimation';
import { misureDaAltezzaPeso, type Sesso } from './stima-da-peso';
import { VISION_UNAVAILABLE_ERROR } from '@cabina/shared';

export interface MeasuresFormStrings {
  title: string;
  height: string;
  weight: string;
  bust: string;
  waist: string;
  hips: string;
  confirm: string;
  cancel: string;
  autoDetected: string;
  detectionFailed: string;
  detectionUnavailable: string;
  detecting: string;
  detectingAI: string;
  aiDetected: string;
  invalidHeight: string;
  invalidWeight: string;
  invalidBust: string;
  invalidWaist: string;
  invalidHips: string;
  heightCalibrationHint: string;
  /** Il piede (scarpe, 05/09/2026). Opzionali: con un locale in cache più
   *  vecchio del bundle mancano, e il form ripiega sull'inglese. */
  foot?: string;
  invalidFoot?: string;
  /** Vestibilità (18/09/2026). Opzionali per la stessa ragione del piede. */
  fit?: string;
  fitFitted?: string;
  fitRegular?: string;
  fitRelaxed?: string;
}

export interface MeasuresFormCallbacks {
  /** Può restituire una Promise: il bottone resta spento finché non si risolve
   *  (la conferma ora avvia una generazione a pagamento, non un cambio schermata). */
  onConfirm: (measures: Partial<Measures>, source: MeasureSource, fit: FitPreference) => void | Promise<void>;
  onCancel: () => void;
  /** Stima le misure dalla foto chiamando il backend AI Vision (livello 1) */
  /** Dal 18/09/2026 può portare anche `sex`: affina la formula altezza+peso. */
  onRequestAiEstimate?: (photoDataUrl: string) => Promise<StimaMisure>;
}

export interface MeasuresFormConfig {
  strings: MeasuresFormStrings;
  callbacks: MeasuresFormCallbacks;
  /** Data URL della foto per il rilevamento automatico (opzionale) */
  photoData?: string | null;
  /** Misure pre-compilate (da localStorage o sessione precedente) */
  prefillMeasures?: Partial<Measures> | null;
}

type MeasureField = keyof Omit<Measures, 'weightKg'> | 'weightKg';

interface FieldState {
  label: string;
  placeholder: string;
  min: number;
  max: number;
  step: number;
  required: boolean;
  invalidMessage: string;
}

// Tutti i campi sono opzionali — l'AI Vision o il rilevamento automatico li pre-compila.
// L'acquirente può sempre confermare senza inserire nulla (AC1).
const FIELD_CONFIG: Record<Exclude<MeasureField, 'weightKg'>, Omit<FieldState, 'invalidMessage'>> & { weightKg: Omit<FieldState, 'invalidMessage'> } = {
  heightCm: { label: '', placeholder: '170', min: 100, max: 220, step: 0.5, required: false },
  weightKg: { label: '', placeholder: '70', min: 30, max: 250, step: 0.5, required: false },
  bustCm: { label: '', placeholder: '90', min: 50, max: 200, step: 0.5, required: false },
  waistCm: { label: '', placeholder: '70', min: 50, max: 200, step: 0.5, required: false },
  hipsCm: { label: '', placeholder: '95', min: 50, max: 200, step: 0.5, required: false },
  footCm: { label: '', placeholder: '26', min: 15, max: 40, step: 0.5, required: false },
};

/**
 * Crea il form misure con validazione inline Zod.
 * Supporta pre-compilazione da rilevamento automatico o localStorage.
 * Pattern: factory function → HTMLElement, come createConsentBanner e createPhotoCapture.
 */
export function createMeasuresForm(
  strings: MeasuresFormStrings,
  callbacks: MeasuresFormCallbacks,
  photoData?: string | null,
  prefillMeasures?: Partial<Measures> | null,
  /** Story 12.5 (Task 2.5/2.6): colore brand del merchant sul bordo del
   *  campo in focus (azione primaria). Default = fallback di `sanitizeColor`. */
  primaryColor = '#1a1a1a',
  /** Mostra «Lunghezza piede»: solo per le scarpe (05/09/2026). */
  mostraPiede = false,
  /** Sesso, se noto (es. la modella preset scelta): affina la formula da
   *  altezza e peso. Assente = formula senza sesso (18/09/2026). */
  sesso: Sesso | null = null,
): HTMLElement {
  const container = document.createElement('div');
  container.setAttribute('data-cabina-measures-form', '');

  // ── Titolo ────────────────────────────────────────────────────────────
  const title = document.createElement('h2');
  title.textContent = strings.title;
  title.style.cssText = 'margin:0 0 8px;font-size:18px;font-weight:600;color:#1a1a1a;';
  container.appendChild(title);

  // ── Messaggio stato rilevamento ───────────────────────────────────────
  const detectionMsg = document.createElement('div');
  detectionMsg.setAttribute('data-cabina-detection-msg', '');
  detectionMsg.style.cssText = [
    'font-size:13px',
    'color:#6b7280',
    'margin-bottom:16px',
    'min-height:20px',
  ].join(';');
  container.appendChild(detectionMsg);

  // ── Barra di avanzamento del rilevamento ──────────────────────────────
  // Il rilevamento dura 3,7-8,5s (AI Vision, misurati in produzione) e finora
  // mostrava solo una riga di testo: chi aspetta non sa se sta succedendo qualcosa.
  //
  // ponytail: la percentuale è TEMPORALE, non reale — la vision non espone un
  // progresso. Avanza verso il 90% sull'attesa peggiore attesa e
  // scatta a 100% quando la stima arriva (o fallisce). Se un giorno il backend
  // desse un progresso vero, è qui che va agganciato.
  const ATTESA_PEGGIORE_MS = 9000;
  const progressWrap = document.createElement('div');
  progressWrap.setAttribute('data-cabina-detection-progress', '');
  progressWrap.style.cssText = 'display:none;align-items:center;gap:8px;margin:-8px 0 16px;';
  const progressTrack = document.createElement('div');
  progressTrack.style.cssText = 'flex:1;height:4px;border-radius:2px;background:#e5e7eb;overflow:hidden;';
  const progressFill = document.createElement('div');
  progressFill.style.cssText = `width:0%;height:100%;background:${primaryColor};transition:width 0.2s linear;`;
  progressTrack.appendChild(progressFill);
  const progressLabel = document.createElement('span');
  progressLabel.setAttribute('data-cabina-detection-percent', '');
  progressLabel.style.cssText = 'font-size:12px;color:#6b7280;min-width:34px;text-align:right;';
  progressWrap.appendChild(progressTrack);
  progressWrap.appendChild(progressLabel);
  container.appendChild(progressWrap);

  let progressTimer: ReturnType<typeof setInterval> | null = null;
  /** Rilevamento in corso: il bottone conferma resta spento (vedi updateConfirmButton). */
  let detecting = false;
  /** Conferma in volo (risoluzione del capo + avvio generazione). */
  let submitting = false;

  function setProgress(percent: number): void {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    progressFill.style.width = `${clamped}%`;
    progressLabel.textContent = `${clamped}%`;
  }

  function startProgress(): void {
    const inizio = Date.now();
    progressWrap.style.display = 'flex';
    setProgress(0);
    progressTimer = setInterval(() => {
      // Il modale può chiudersi durante il rilevamento: senza questo, l'interval
      // resterebbe vivo a scrivere su nodi staccati per sempre.
      if (!progressWrap.isConnected) return stopProgress();
      setProgress(((Date.now() - inizio) / ATTESA_PEGGIORE_MS) * 90);
    }, 100);
  }

  function stopProgress(): void {
    if (progressTimer !== null) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    progressWrap.style.display = 'none';
  }

  // ── Area errore globale ───────────────────────────────────────────────
  const globalError = document.createElement('div');
  globalError.setAttribute('data-cabina-form-error', '');
  globalError.style.cssText = [
    'color:#dc2626',
    'font-size:13px',
    'margin-bottom:8px',
    'min-height:20px',
    'display:none',
  ].join(';');
  container.appendChild(globalError);

  // ── Campi input ───────────────────────────────────────────────────────
  const fields: Record<MeasureField, HTMLInputElement> = {} as Record<MeasureField, HTMLInputElement>;
  const fieldErrors: Record<MeasureField, HTMLElement> = {} as Record<MeasureField, HTMLElement>;
  const autoDetectedLabels: Record<MeasureField, HTMLElement> = {} as Record<MeasureField, HTMLElement>;

  // ── Calibrazione altezza (Story 10.1) ─────────────────────────────────
  // Le circonferenze auto-rilevate sono riferite a `referenceHeightCm`; quando
  // l'acquirente inserisce l'altezza reale, vengono ri-scalate. I campi modificati
  // a mano (`manualFields`) non vengono mai sovrascritti dalla calibrazione.
  let autoBaseMeasures: { bustCm?: number; waistCm?: number; hipsCm?: number } | null = null;
  let referenceHeightCm = REFERENCE_HEIGHT_CM;
  const manualFields = new Set<MeasureField>();
  // Campi effettivamente popolati da un'auto-rilevazione (per mostrare la label
  // "Stimato automaticamente" solo dove ha senso).
  const autoFilledFields = new Set<MeasureField>();
  /** Le circonferenze in pagina vengono dalla formula altezza+peso (18/09/2026). */
  let stimeDalPeso = false;
  /** Sesso per la formula: quello passato (modella preset) vince su quello letto
   *  dalla foto dall'AI, che arriva con la stima (18/09/2026). */
  let sessoFormula: Sesso | null = sesso;
  let heightHintEl: HTMLElement | null = null;

  const fieldNames: MeasureField[] = ['heightCm', 'weightKg', 'bustCm', 'waistCm', 'hipsCm'];
  const invisibleLabels: string[] = [
    strings.height,
    strings.weight,
    strings.bust,
    strings.waist,
    strings.hips,
  ];
  if (mostraPiede) {
    fieldNames.push('footCm');
    invisibleLabels.push(strings.foot ?? 'Foot length (cm) - optional');
  }
  const errorMessages: Record<MeasureField, string> = {
    heightCm: strings.invalidHeight,
    weightKg: strings.invalidWeight,
    bustCm: strings.invalidBust,
    waistCm: strings.invalidWaist,
    hipsCm: strings.invalidHips,
    footCm: strings.invalidFoot ?? 'Foot length: enter a value between 15 and 40 cm',
  };

  for (let i = 0; i < fieldNames.length; i++) {
    const fieldName = fieldNames[i];
    const config = FIELD_CONFIG[fieldName];
    const labelStr = invisibleLabels[i] ?? fieldName;
    const errMsg = errorMessages[fieldName];

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom:12px;';

    // Label
    const label = document.createElement('label');
    label.textContent = labelStr;
    label.style.cssText = 'display:block;font-size:14px;font-weight:500;color:#374151;margin-bottom:4px;';
    wrapper.appendChild(label);

    // Etichetta "Stimato automaticamente"
    const autoLabel = document.createElement('span');
    autoLabel.setAttribute('data-cabina-auto-label', '');
    autoLabel.textContent = strings.autoDetected;
    autoLabel.style.cssText = [
      'font-size:11px',
      'color:#6b7280',
      'margin-left:8px',
      'font-style:italic',
      'display:none',
    ].join(';');
    label.appendChild(autoLabel);
    autoDetectedLabels[fieldName] = autoLabel;

    // Input — type=text + inputmode=numeric per tastiera numerica pura su iOS/Android (AC3)
    const input = document.createElement('input');
    input.setAttribute('type', 'text');
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('pattern', '[0-9]*');
    input.placeholder = config.placeholder;
    input.setAttribute('data-min', String(config.min));
    input.setAttribute('data-max', String(config.max));
    input.setAttribute('data-cabina-field', fieldName);
    input.style.cssText = [
      'width:100%',
      'padding:8px 12px',
      'border:1px solid #d1d5db',
      'border-radius:4px',
      'font-size:14px',
      'font-family:inherit',
      'color:#1a1a1a',
      'box-sizing:border-box',
      'outline:none',
      'transition:border-color 0.15s',
    ].join(';');
    input.addEventListener('focus', () => {
      input.style.borderColor = primaryColor;
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = '#d1d5db';
      validateField(fieldName, fieldNames);
    });
    input.addEventListener('input', () => {
      // Clear error on change
      const errEl = fieldErrors[fieldName];
      if (errEl) {
        errEl.textContent = '';
        errEl.style.display = 'none';
      }
      input.style.borderColor = '#d1d5db';
      if (fieldName === 'heightCm') {
        // L'altezza è il riferimento di calibrazione: ri-scala le circonferenze
        // auto-rilevate senza marcarle come "manuali" né cambiare measureSource.
        // Se l'altezza era un valore AI, l'edit manuale la declassa da "auto".
        autoFilledFields.delete('heightCm');
        recalibrateFromHeight();
        updateAutoLabel('heightCm');
        updateHeightHint();
      } else if (fieldName === 'weightKg') {
        // Il peso, come l'altezza, è un ingresso della stima e non una misura
        // della taglia: non rende «manuale» nulla (18/09/2026).
        recalibrateFromHeight();
      } else if (input.value.trim() === '') {
        // Campo circonferenziale svuotato → torna "auto": rimosso da manualFields
        // così la calibrazione lo ripopola dalla base auto-rilevata.
        manualFields.delete(fieldName);
        recalibrateFromHeight();
        updateAutoLabel(fieldName);
      } else {
        // Input manuale dell'utente: il campo diventa manuale e perde la label auto.
        manualFields.add(fieldName);
        measureSource = 'manual';
        updateAutoLabel(fieldName);
      }
      updateConfirmButton();
    });
    wrapper.appendChild(input);
    fields[fieldName] = input;

    // Errore inline
    const error = document.createElement('div');
    error.setAttribute('data-cabina-field-error', fieldName);
    error.style.cssText = [
      'color:#dc2626',
      'font-size:12px',
      'margin-top:2px',
      'min-height:18px',
      'display:none',
    ].join(';');
    wrapper.appendChild(error);
    fieldErrors[fieldName] = error;

    // Hint di calibrazione sotto il campo altezza (Story 10.1 / AC2)
    if (fieldName === 'heightCm') {
      const hint = document.createElement('div');
      hint.setAttribute('data-cabina-height-hint', '');
      hint.textContent = strings.heightCalibrationHint;
      hint.style.cssText = 'font-size:12px;color:#6b7280;margin-top:2px;display:none;';
      wrapper.appendChild(hint);
      heightHintEl = hint;
    }

    container.appendChild(wrapper);
  }

  // ── Vestibilità (18/09/2026, Arou) ────────────────────────────────────
  // «Aderente / Normale / Comoda»: una scelta sola, per vestiti e scarpe. Nasce
  // Normale ogni volta, come le misure (che non si salvano più dal 16/08). Tre
  // bottoni con `aria-pressed` e non un <select>: si vede tutto a colpo d'occhio.
  let fit: FitPreference = 'regular';
  const fitWrap = document.createElement('div');
  fitWrap.setAttribute('data-cabina-fit', '');
  fitWrap.style.cssText = 'margin:4px 0 12px;';
  const fitLabel = document.createElement('div');
  fitLabel.textContent = strings.fit ?? 'Fit';
  fitLabel.style.cssText = 'font-size:14px;font-weight:500;color:#374151;margin-bottom:4px;';
  fitWrap.appendChild(fitLabel);
  const fitRow = document.createElement('div');
  fitRow.setAttribute('role', 'group');
  fitRow.setAttribute('aria-label', strings.fit ?? 'Fit');
  fitRow.style.cssText = 'display:flex;gap:6px;';
  const fitButtons: Array<[FitPreference, HTMLButtonElement]> = [];
  const fitOptions: Array<[FitPreference, string]> = [
    ['fitted', strings.fitFitted ?? 'Fitted'],
    ['regular', strings.fitRegular ?? 'Regular'],
    ['relaxed', strings.fitRelaxed ?? 'Relaxed'],
  ];
  const paintFit = (): void => {
    for (const [value, b] of fitButtons) {
      const on = value === fit;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.style.background = on ? primaryColor : '#fff';
      b.style.color = on ? '#fff' : '#1a1a1a';
      b.style.borderColor = on ? primaryColor : '#d1d5db';
    }
  };
  for (const [value, text] of fitOptions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.setAttribute('data-cabina-fit-option', value);
    b.style.cssText = 'flex:1;padding:8px 4px;border:1px solid #d1d5db;border-radius:4px;font-size:13px;font-family:inherit;cursor:pointer;';
    b.addEventListener('click', () => {
      fit = value;
      paintFit();
    });
    fitButtons.push([value, b]);
    fitRow.appendChild(b);
  }
  paintFit();
  fitWrap.appendChild(fitRow);
  container.appendChild(fitWrap);

  // ── Bottoni ───────────────────────────────────────────────────────────
  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = strings.cancel;
  cancelBtn.setAttribute('data-cabina-cancel-btn', '');
  cancelBtn.style.cssText = buttonStyle('#f3f4f6', '#1a1a1a');
  cancelBtn.addEventListener('click', () => callbacks.onCancel());

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = strings.confirm;
  confirmBtn.setAttribute('data-cabina-confirm-btn', '');
  confirmBtn.disabled = true;
  confirmBtn.style.cssText = buttonStyle('#1a1a1a', '#fff') + 'opacity:0.5;';
  confirmBtn.addEventListener('click', () => handleConfirm());

  buttonRow.appendChild(cancelBtn);
  buttonRow.appendChild(confirmBtn);
  container.appendChild(buttonRow);

  // Sorgente delle misure (Story 9.3): 'vision' se stimate dall'AI, 'manual'
  // altrimenti (prefill da localStorage o inserimento a mano). Pesano
  // diversamente sul punteggio del consiglio taglia — vedi `MeasureSource`.
  let measureSource: MeasureSource = 'manual';

  // ── Pre-compilazione (localStorage o prefill) ─────────────────────────
  if (prefillMeasures) {
    // null = prefill da localStorage o sessione, non una stima
    // Solo il rilevamento automatico mostra le label "Stimato automaticamente"
    fillFromMeasures(prefillMeasures, null);
  }

  // ── Rilevamento automatico (AI Vision) ───────────────────────────────
  if (photoData) {
    startAutoDetection(photoData);
  } else {
    // Nessuna foto → form vuoto pronto per input manuale
    updateConfirmButton();
  }

  // ── Helper functions ─────────────────────────────────────────────────

  function fillFromMeasures(m: Partial<Measures>, autoSource: 'vision' | null): void {
    // Il rilevamento automatico marca le misure come stimate dall'AI: pesano
    // meno di quelle dichiarate dall'acquirente (vedi MeasureSource).
    const isAutoDetected = autoSource != null;
    if (autoSource) {
      measureSource = autoSource;
      // Story 10.1: memorizza la base auto-rilevata + altezza di riferimento per
      // la calibrazione. La vision di norma fornisce heightCm → diventa il
      // riferimento; se manca si ricade su REFERENCE_HEIGHT_CM.
      autoBaseMeasures = { bustCm: m.bustCm, waistCm: m.waistCm, hipsCm: m.hipsCm };
      referenceHeightCm = m.heightCm ?? REFERENCE_HEIGHT_CM;
    }

    const entries: Array<[MeasureField, number | undefined]> = [
      ['heightCm', m.heightCm],
      ['weightKg', m.weightKg],
      ['bustCm', m.bustCm],
      ['waistCm', m.waistCm],
      ['hipsCm', m.hipsCm],
    ];
    for (const [name, val] of entries) {
      if (val != null) {
        fields[name].value = String(val);
      } else if (!isAutoDetected) {
        // Prefill: i campi assenti vengono azzerati. In auto-rilevazione invece
        // si preservano i valori già presenti (es. altezza salvata in localStorage).
        fields[name].value = '';
      }
      if (isAutoDetected) {
        if (val != null) autoFilledFields.add(name);
        else autoFilledFields.delete(name);
      }
    }

    // Con una base auto-rilevata applica subito la calibrazione all'altezza già
    // presente (es. prefill localStorage); altezza vuota → scala 1 (valori base).
    if (isAutoDetected) recalibrateFromHeight();

    for (const name of fieldNames) updateAutoLabel(name);

    updateConfirmButton();
    updateHeightHint();
  }

  /** Mostra "Stimato automaticamente" solo su campi auto-rilevati, non manuali e valorizzati. */
  function updateAutoLabel(name: MeasureField): void {
    const label = autoDetectedLabels[name];
    if (!label) return;
    const isAuto = autoFilledFields.has(name) && !manualFields.has(name) && fields[name].value.trim() !== '';
    label.style.display = isAuto ? 'inline' : 'none';
  }

  /**
   * Ri-scala le circonferenze auto-rilevate in base all'altezza inserita (Story 10.1).
   * I campi modificati a mano (`manualFields`) non vengono toccati. Altezza
   * vuota/non valida → ripristina i valori base (scala 1).
   */
  function recalibrateFromHeight(): void {
    const numero = (field: HTMLInputElement, min: number, max: number): number | null => {
      const raw = field.value.trim();
      const n = raw === '' ? NaN : parseFloat(normalizeDecimal(raw));
      return !isNaN(n) && n >= min && n <= max ? n : null;
    };
    const target = numero(fields.heightCm, 100, 220);

    // 18/09/2026 — con altezza E peso le circonferenze vengono dalla formula
    // ANSUR (`stima-da-peso.ts`), non dalla foto: la foto schiaccia magri e
    // obesi verso la media, il peso no. I campi scritti a mano restano intatti.
    const peso = numero(fields.weightKg, 30, 250);
    const daPeso = target != null && peso != null ? misureDaAltezzaPeso(target, peso, sessoFormula) : null;
    if (daPeso) {
      for (const name of ['bustCm', 'waistCm', 'hipsCm'] as const) {
        if (manualFields.has(name)) continue;
        fields[name].value = String(daPeso[name]);
        autoFilledFields.add(name);
        updateAutoLabel(name);
      }
      stimeDalPeso = true;
      return;
    }
    // Peso tolto: senza una base dalla foto i numeri della formula non hanno più
    // una fonte, e restare lì li farebbe passare per misure dell'acquirente.
    if (stimeDalPeso && !autoBaseMeasures) {
      for (const name of ['bustCm', 'waistCm', 'hipsCm'] as const) {
        if (manualFields.has(name)) continue;
        fields[name].value = '';
        autoFilledFields.delete(name);
        updateAutoLabel(name);
      }
    }
    stimeDalPeso = false;

    if (!autoBaseMeasures) return;
    const calibrated = calibrateCircumferences(autoBaseMeasures, referenceHeightCm, target);
    for (const name of ['bustCm', 'waistCm', 'hipsCm'] as const) {
      if (manualFields.has(name)) continue;
      const v = calibrated[name];
      if (v != null) fields[name].value = String(v);
    }
  }

  /** Mostra l'hint altezza solo dopo un'auto-rilevazione e finché il campo è vuoto. */
  function updateHeightHint(): void {
    if (!heightHintEl) return;
    const show = autoBaseMeasures != null && fields.heightCm.value.trim() === '';
    heightHintEl.style.display = show ? 'block' : 'none';
  }

  function getCurrentValues(): Partial<Measures> {
    const getVal = (field: HTMLInputElement): number | undefined => {
      const v = field.value.trim();
      if (v === '') return undefined;
      const n = parseFloat(normalizeDecimal(v));
      return isNaN(n) ? undefined : n;
    };

    // Story 10.1 (AC4): includere SOLO i campi valorizzati. Le chiavi `undefined`
    // sovrascriverebbero i DEFAULT_MEASURES nello spread a valle (widget.ts),
    // inviando misure incomplete al rendering e al calcolo taglia.
    const out: Partial<Measures> = {};
    const setIf = (name: MeasureField, value: number | undefined): void => {
      if (value != null) out[name] = value;
    };
    setIf('heightCm', getVal(fields.heightCm));
    setIf('weightKg', getVal(fields.weightKg));
    setIf('bustCm', getVal(fields.bustCm));
    setIf('waistCm', getVal(fields.waistCm));
    setIf('hipsCm', getVal(fields.hipsCm));
    // Il campo esiste solo per le scarpe (`mostraPiede`).
    if (fields.footCm) setIf('footCm', getVal(fields.footCm));
    return out;
  }

  function validateField(fieldName: MeasureField, allFields: MeasureField[]): void {
    const errEl = fieldErrors[fieldName];
    const input = fields[fieldName];
    if (!errEl || !input) return;

    const value = normalizeDecimal(input.value.trim());
    if (value === '') {
      const config = FIELD_CONFIG[fieldName];
      if (config.required) {
        errEl.textContent = errorMessages[fieldName];
        errEl.style.display = 'block';
        input.style.borderColor = '#dc2626';
      } else {
        errEl.textContent = '';
        errEl.style.display = 'none';
        input.style.borderColor = '#d1d5db';
      }
      return;
    }

    if (!/^\d+(\.\d+)?$/.test(value)) {
      errEl.textContent = errorMessages[fieldName];
      errEl.style.display = 'block';
      input.style.borderColor = '#dc2626';
      return;
    }
    const num = parseFloat(value);
    if (isNaN(num)) {
      errEl.textContent = errorMessages[fieldName];
      errEl.style.display = 'block';
      input.style.borderColor = '#dc2626';
      return;
    }

    const config = FIELD_CONFIG[fieldName];
    if (num < config.min || num > config.max) {
      errEl.textContent = errorMessages[fieldName];
      errEl.style.display = 'block';
      input.style.borderColor = '#dc2626';
      return;
    }

    errEl.textContent = '';
    errEl.style.display = 'none';
    input.style.borderColor = '#16a34a';
  }

  function updateConfirmButton(): void {
    // Le misure sono opzionali — il bottone è abilitato (AC1), tranne mentre
    // qualcosa è in corso. Un solo punto decide: chi confermava a metà
    // rilevamento partiva senza le misure stimate, che arrivavano dopo e
    // andavano perse — e il consiglio taglia peggiorava senza spiegazione.
    const busy = detecting || submitting;
    confirmBtn.disabled = busy;
    confirmBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
    confirmBtn.style.opacity = busy ? '0.5' : '1';
    confirmBtn.style.cursor = busy ? 'progress' : 'pointer';
  }

  async function handleConfirm(): Promise<void> {
    // Raccoglie i valori presenti — le misure sono opzionali (AC1).
    // La validazione inline dei singoli campi rimane per feedback visivo,
    // ma non blocca più il submit. Il widget.ts completa con DEFAULT_MEASURES.
    const values = getCurrentValues();
    submitting = true;
    updateConfirmButton();
    try {
      // Da qui può partire una generazione a pagamento: `onConfirm` risolve il
      // capo della pagina (e attende l'analisi della categoria) prima di avviarla.
      // Spento nel frattempo, o un doppio click ne paga due.
      await callbacks.onConfirm(values, measureSource, fit);
    } finally {
      submitting = false;
      // Il form di solito è già smontato (si passa a un altro step): riaccendere
      // serve al caso in cui la conferma fallisce e si resta qui.
      if (container.isConnected) updateConfirmButton();
    }
  }

  async function startAutoDetection(dataUrl: string): Promise<void> {
    let aiUnavailable = false;
    detectionMsg.textContent = strings.detecting;
    detectionMsg.style.color = '#6b7280';
    detecting = true;
    updateConfirmButton();
    startProgress();

    // ⚠️ Il `finally` è la ragione di questo try: le uscite di qui sono sei (due
    // successi, un fallimento, tre `return` da modale chiuso). Riaccendere il
    // bottone in ognuna significa dimenticarsene in una — e un bottone spento
    // per sempre è un try-on che non parte più.
    try {
      // ⚠️ 2026-08-04 — DUE LIVELLI, non più tre: MediaPipe è stato RIMOSSO dal
      // prodotto. Non era una questione di precisione — non ha mai prodotto una
      // stima utilizzabile (vita sul valore minimo del clamp in 7 corporature su
      // 8) e per mesi non ha risposto affatto, mentre l'AI Vision copriva tutto
      // in silenzio. La misura è in `docs/wiki/stima-misure.md`.
      // L'AI dà misure plausibili, che distinguono le corporature (slim 85/64/91
      // contro plus 112/92/118) e soprattutto **conoscono l'altezza**: senza, la
      // scala delle circonferenze è un'ipotesi su 170 cm presunti.
      // Livello 1: AI Vision via backend (AC2, AC3).
      if (callbacks.onRequestAiEstimate) {
        detectionMsg.textContent = strings.detectingAI;
        detectionMsg.style.color = '#6b7280';
        try {
          const aiMeasures = await callbacks.onRequestAiEstimate(dataUrl);
          if (!detectionMsg.isConnected) return;
          if (aiMeasures && Object.keys(aiMeasures).length > 0) {
            // Prima del fill: il fill ricalcola, e col peso già scritto deve
            // usare subito il sesso giusto.
            if (!sesso && aiMeasures.sex) sessoFormula = aiMeasures.sex;
            fillFromMeasures(aiMeasures, 'vision');
            detectionMsg.textContent = strings.aiDetected;
            detectionMsg.style.color = '#16a34a';
            return;
          }
        } catch (e) {
          // AI Vision fallita — livello 3: form vuoto opzionale.
          // Story 12.7: se il servizio non ha risposto (≠ foto non leggibile)
          // l'acquirente merita di saperlo, perché riprovare ha davvero senso.
          if (e instanceof Error && e.message === VISION_UNAVAILABLE_ERROR) aiUnavailable = true;
        }
      }

      if (!detectionMsg.isConnected) return;
      // Livello 2: nessuna stima disponibile — form vuoto ma confermabile (AC1).
      // È l'unica riserva rimasta, ed è meglio di quella di prima: un form vuoto
      // chiede all'acquirente le sue misure vere, mentre MediaPipe rispondeva
      // con numeri fuori scala che alimentavano un consiglio taglia sbagliato.
      detectionMsg.textContent = aiUnavailable ? strings.detectionUnavailable : strings.detectionFailed;
      detectionMsg.style.color = '#ca8a04';
    } finally {
      detecting = false;
      setProgress(100);
      stopProgress();
      updateConfirmButton();
    }
  }

  return container;
}

/** Normalizza il separatore decimale: la virgola (locali EU) diventa punto. */
function normalizeDecimal(value: string): string {
  return value.replace(',', '.');
}

function buttonStyle(bg: string, color: string): string {
  return [
    `background:${bg}`,
    `color:${color}`,
    'padding:10px 20px',
    'border:1px solid #d1d5db',
    'border-radius:4px',
    'cursor:pointer',
    'font-size:14px',
    'font-family:inherit',
    'flex:1',
    'transition:background 0.15s,opacity 0.15s',
  ].join(';');
}