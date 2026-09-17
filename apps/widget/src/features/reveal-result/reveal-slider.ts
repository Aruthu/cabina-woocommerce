/**
 * Story 12.4 — Reveal slider: confronto Original ↔ Generated (AC1, AC4).
 *
 * Due responsabilità:
 *  1. **Geometria pura** (`computeClipPercent`/`buildClipPath`): funzioni pure
 *     testabili senza DOM, determinano la clip dell'immagine "Generated" in
 *     overlay sull'"Original" sottostante.
 *  2. **Factory DOM** (`createRevealSlider`): due `<img>` sovrapposte + maniglia
 *     trascinabile via pointer events (desktop + touch unificati). Aggiornamento
 *     sincrono diretto (nessun re-render) → risposta <100ms.
 *
 * Nessuna chiamata di rete (AC1 "frontend puro") — riceve URL già pronti.
 */

import { getLocaleString, getLocaleStringOr } from '../../i18n/i18n';

export interface RevealSliderCallbacks {
  /** Chiamato quando l'utente sposta la maniglia (per persistenza stato, se serve). */
  onClipChange?: (percent: number) => void;
}

/** Step di spostamento da tastiera (frecce sinistra/destra), in percentuale. */
const KEYBOARD_STEP_PERCENT = 5;

/** Percentuale iniziale della clip (50 = maniglia al centro). */
const INITIAL_CLIP_PERCENT = 50;

/**
 * Calcola la percentuale di clip (0-100) dalla posizione del pointer relativa
 * al container. Pura: nessun accesso DOM, solo matematica.
 *
 * - `containerRect` — il bounding rect del container dello slider.
 * - `pointerX` — coordinata X del pointer (clientX).
 * - Ritorna 0 se il pointer è a sinistra del container, 100 se a destra.
 * - Clampata: mai fuori range (negativa o >100).
 */
export function computeClipPercent(containerRect: DOMRect, pointerX: number): number {
  const width = containerRect.width;
  if (width <= 0) return INITIAL_CLIP_PERCENT;
  const relativeX = pointerX - containerRect.left;
  const percent = (relativeX / width) * 100;
  return Math.max(0, Math.min(100, percent));
}

/**
 * Costruisce la stringa `clip-path` CSS per l'immagine "Generated" in overlay.
 * L'immagine Generated è sopra l'Original; la clip rivela l'Original sottostante
 * quando la maniglia si sposta a destra (percent cresce → più Original visibile).
 *
 * `inset(0 ${100 - percent}% 0 0)` ritaglia da destra: a percent=100 l'intera
 * immagine Generated è visibile (0% di margine destro), a percent=0 è completamente
 * nascosta (100% di margine destro → rivela tutto l'Original).
 *
 * Invertito: a percent=50 metà Generated (sinistra) + metà Original (destra).
 */
export function buildClipPath(percent: number): string {
  const clamped = Math.max(0, Math.min(100, percent));
  return `inset(0 ${100 - clamped}% 0 0)`;
}

/**
 * Crea il reveal slider come DocumentFragment.
 *
 * Struttura DOM:
 * ```
 * <div data-cabina-reveal-slider> (container, position:relative)
 *   <img data-cabina-reveal-original> (sotto, visibile)
 *   <img data-cabina-reveal-generated> (sopra, clip-path dinamico)
 *   <div data-cabina-reveal-handle> (maniglia trascinabile)
 * </div>
 * ```
 *
 * @param originalUrl URL dell'immagine "Original" (foto acquirente o modella)
 * @param generatedUrl URL dell'immagine "Generated" (try-on risultato)
 * @param callbacks Callback opzionali
 * @returns `{ fragment, updateGenerated, setClipPercent }` — il fragment da
 *          appendere + funzioni per aggiornare l'immagine generata (swap capo,
 *          Task 2) e per impostare la clip programmaticamente (test/a11y).
 */
export function createRevealSlider(
  originalUrl: string,
  generatedUrl: string,
  callbacks: RevealSliderCallbacks = {},
): {
  fragment: DocumentFragment;
  /** Aggiorna l'URL dell'immagine Generated (swap capo, Task 2.3). */
  updateGenerated: (url: string) => void;
  /** Imposta la clip programmaticamente (0-100). */
  setClipPercent: (percent: number) => void;
} {
  const fragment = document.createDocumentFragment();

  const container = document.createElement('div');
  container.setAttribute('data-cabina-reveal-slider', '');
  container.style.cssText = [
    'position:relative',
    'width:100%',
    'height:100%',
    'overflow:hidden',
    'touch-action:none', // impedisce scroll/gesture del browser durante il drag
    'user-select:none',
  ].join(';');

  // Original (sotto)
  const originalImg = document.createElement('img');
  originalImg.setAttribute('data-cabina-reveal-original', '');
  originalImg.alt = getLocaleString('reveal_result.original_alt');
  originalImg.src = originalUrl;
  originalImg.style.cssText = [
    'position:absolute',
    'inset:0',
    'width:100%',
    'height:100%',
    'object-fit:contain',
    'display:block',
  ].join(';');
  // Fallback anteprima rotta: nascondi l'img (resta l'altra)
  originalImg.addEventListener('error', () => { originalImg.style.opacity = '0'; });
  container.appendChild(originalImg);

  // Generated (sopra, clip-path dinamico)
  const generatedImg = document.createElement('img');
  generatedImg.setAttribute('data-cabina-reveal-generated', '');
  generatedImg.alt = getLocaleString('reveal_result.generated_alt');
  generatedImg.src = generatedUrl;
  generatedImg.style.cssText = [
    'position:absolute',
    'inset:0',
    'width:100%',
    'height:100%',
    'object-fit:contain',
    'display:block',
    `clip-path:${buildClipPath(INITIAL_CLIP_PERCENT)}`,
  ].join(';');
  generatedImg.addEventListener('error', () => { generatedImg.style.opacity = '0'; });
  container.appendChild(generatedImg);

  // Maniglia trascinabile
  const handle = document.createElement('div');
  handle.setAttribute('data-cabina-reveal-handle', '');
  handle.setAttribute('role', 'slider');
  handle.setAttribute('aria-label', getLocaleString('reveal_result.slider_label'));
  handle.setAttribute('aria-valuemin', '0');
  handle.setAttribute('aria-valuemax', '100');
  handle.setAttribute('aria-valuenow', String(INITIAL_CLIP_PERCENT));
  handle.setAttribute('tabindex', '0');
  handle.style.cssText = [
    'position:absolute',
    'top:0',
    'bottom:0',
    `left:${INITIAL_CLIP_PERCENT}%`,
    'width:4px',
    'background:#fff',
    'box-shadow:0 0 8px rgba(0,0,0,0.4)',
    'cursor:ew-resize',
    'z-index:2',
    'transform:translateX(-50%)',
  ].join(';');
  // Il pomello con le frecce, al centro della riga. ⚠️ Senza, la freccia era il
  // solo carattere «↔» dentro l'etichetta in basso: Arou, provando, non l'ha
  // vista affatto. La freccia deve stare **sulla cosa che si muove**, non in una
  // didascalia lontana — è lì che l'occhio guarda quando cerca cosa afferrare.
  const knob = document.createElement('div');
  knob.setAttribute('data-cabina-reveal-knob', '');
  knob.textContent = '‹ ›';
  knob.style.cssText = [
    'position:absolute',
    'top:50%',
    'left:50%',
    'transform:translate(-50%,-50%)',
    // ⚠️ 2026-08-20 (Arou) — da 36px a 48. A 36 il pomello si perdeva sulla
    // foto, e chi non lo nota vede meta risultato e se ne va senza aver capito
    // che c'era un confronto da trascinare. Dentro il riquadro del tema la
    // prova e piu piccola che a tutto schermo, quindi il pomello va nella
    // direzione opposta: piu grande, non proporzionale.
    'width:48px',
    'height:48px',
    'border-radius:50%',
    'background:#fff',
    'box-shadow:0 2px 10px rgba(0,0,0,0.45)',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'color:#1a1a1a',
    'font-size:22px',
    'font-weight:700',
    'letter-spacing:2px',
    'line-height:1',
    // ⚠️ Trascinabile, NON `pointer-events:none`.
    //
    // Il `pointerdown` sta sulla maniglia, che e larga 4px; il pomello ne e
    // figlio, quindi con gli eventi disattivati un dito che preme il cerchio a
    // 20px dal centro non colpiva niente — passava sotto, all'immagine. Il
    // bersaglio visivo era 48px, l'area di presa 4: chi mira al cerchio e
    // trascina non ottiene nulla, e conclude che il confronto non funziona.
    // Attivandoli, il pointerdown sul pomello risale alla maniglia per bubbling
    // e il trascinamento parte da tutta l'area del cerchio (rilievo della
    // review, PR #129). Ingrandire il pomello senza questo lo peggiorava: piu
    // grande e il bersaglio, piu spesso si manca la presa.
    'pointer-events:auto',
    'cursor:ew-resize',
  ].join(';');
  handle.appendChild(knob);
  container.appendChild(handle);

  // ── Il suggerimento che insegna il cursore ──────────────────────────────
  // Una riga bianca verticale su una foto non dice a nessuno che si trascina:
  // chi non ci prova vede metà risultato e se ne va.
  //
  // ⚠️ Prima spariva dopo ~3 secondi. Troppo poco: Arou l'ha visto svanire prima
  // di capire cosa dicesse. Ora **resta fisso** — non è un avviso da smaltire, è
  // l'etichetta di un comando che serve finché il risultato è a schermo.
  const hint = document.createElement('div');
  hint.setAttribute('data-cabina-reveal-hint', '');
  // ⚠️ Con `getLocaleString` qui si leggeva «reveal_result.drag_hint» in chiaro,
  // visto dal vivo sul negozio di test: il bundle è nuovo, ma i JSON dei locali
  // si servono a parte e hanno la loro cache — una chiave nuova non c'è ancora.
  // Il ripiego è una stringa che esiste da prima e dice comunque cos'è.
  hint.textContent = `↔  ${getLocaleStringOr('reveal_result.drag_hint', 'reveal_result.slider_label')}`;
  // ⚠️ In ALTO, non in basso: sotto c'è il badge della taglia consigliata, e
  // un'etichetta che ora resta per sempre gli finiva sopra coprendo la riga
  // «55% di affidabilità». Finché spariva dopo tre secondi la collisione non si
  // vedeva — renderla permanente l'ha resa visibile. In alto gli angoli sono
  // occupati da «indietro» e «chiudi», ma il centro è libero.
  hint.style.cssText = [
    'position:absolute',
    'left:50%',
    'top:16px',
    'transform:translateX(-50%)',
    'padding:6px 12px',
    'border-radius:999px',
    'background:rgba(0,0,0,0.6)',
    'color:#fff',
    'font-size:12px',
    'white-space:nowrap',
    'pointer-events:none',
    'z-index:3',
  ].join(';');
  container.appendChild(hint);

  // La dimostrazione: la riga va a destra, a sinistra, torna al centro. Fatta
  // con la stessa `applyClip` del trascinamento (niente animazioni CSS: la clip
  // è già ciò che si muove) così non esiste un secondo modo di spostare la riga.
  function demoSwipe(): void {
    const passi = [65, 35, INITIAL_CLIP_PERCENT];
    passi.forEach((percent, i) => {
      setTimeout(() => {
        // Se l'acquirente ha già trascinato, la dimostrazione si toglie di mezzo:
        // muovergli la riga sotto le dita è peggio che non spiegare niente.
        if (!hint.isConnected || isDragging) return;
        applyClip(percent);
      }, 600 + i * 500);
    });
  }

  // ── Pointer events (desktop + touch unificati) ──────────────────────────
  let isDragging = false;

  function applyClip(percent: number): void {
    const clamped = Math.max(0, Math.min(100, percent));
    generatedImg.style.clipPath = buildClipPath(clamped);
    handle.style.left = `${clamped}%`;
    handle.setAttribute('aria-valuenow', String(Math.round(clamped)));
    callbacks.onClipChange?.(clamped);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!isDragging) return;
    const rect = container.getBoundingClientRect();
    const percent = computeClipPercent(rect, e.clientX);
    applyClip(percent);
  }

  function endDrag(): void {
    if (!isDragging) return;
    isDragging = false;
    try {
      handle.releasePointerCapture?.(Number(handle.dataset.pointerId) || 0);
    } catch {
      // releasePointerCapture può lanciare se la capture non è mai stata ottenuta — sicuro ignorare
    }
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', endDrag);
    document.removeEventListener('pointercancel', endDrag);
  }

  handle.addEventListener('pointerdown', (e: PointerEvent) => {
    // Guardia re-entrancy: un secondo pointer (es. altro dito) che preme la
    // maniglia mentre il primo è già in drag non deve sovrascrivere lo stato.
    if (isDragging) return;
    e.preventDefault();
    isDragging = true;
    handle.dataset.pointerId = String(e.pointerId);
    try {
      handle.setPointerCapture?.(e.pointerId);
    } catch {
      // setPointerCapture può lanciare se il pointer è già stato rilasciato — sicuro ignorare
    }
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', endDrag);
    // Il sistema può annullare l'interazione (gesture OS, cambio tab durante
    // il touch) senza mai emettere pointerup — senza questo handler isDragging
    // resterebbe bloccato a true e i listener document non verrebbero mai rimossi.
    document.addEventListener('pointercancel', endDrag);
    // Aggiorna subito alla posizione del click (non solo al move)
    const rect = container.getBoundingClientRect();
    const percent = computeClipPercent(rect, e.clientX);
    applyClip(percent);
  });

  // Click sul container (non solo sulla maniglia) sposta la clip lì
  container.addEventListener('click', (e: MouseEvent) => {
    if (isDragging) return;
    const rect = container.getBoundingClientRect();
    const percent = computeClipPercent(rect, e.clientX);
    applyClip(percent);
  });

  // ── a11y: tastiera (frecce sinistra/destra) ─────────────────────────────
  handle.addEventListener('keydown', (e: KeyboardEvent) => {
    const current = Number(handle.getAttribute('aria-valuenow') ?? INITIAL_CLIP_PERCENT);
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      applyClip(current - KEYBOARD_STEP_PERCENT);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      applyClip(current + KEYBOARD_STEP_PERCENT);
    }
  });

  fragment.appendChild(container);
  demoSwipe();

  return {
    fragment,
    updateGenerated: (url: string) => {
      // Ripristina l'opacità nel caso un precedente URL avesse fallito il
      // caricamento (listener 'error' sopra la porta a 0 permanentemente) —
      // altrimenti uno swap capo riuscito con URL valido resterebbe invisibile.
      generatedImg.style.opacity = '1';
      generatedImg.src = url;
    },
    setClipPercent: (percent: number) => {
      applyClip(percent);
    },
  };
}