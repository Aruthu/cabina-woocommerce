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
import { DRAG_THRESHOLD, eDoppioTocco } from '../tryon/zoom-handler';

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
    // 17/10/2026: `pan-y`, non `none` — un dito in verticale sopra la prova
    // scorre la pagina. Il drag della maniglia è protetto sulla maniglia stessa,
    // e da ingrandita lo zoom mette `none` sul contenitore (vince il più stretto).
    'touch-action:pan-y',
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
    'touch-action:none', // trascinata un po' in diagonale non deve scorrere la pagina
    'z-index:2',
    // `--cabina-zoom` lo scrive la prova quando si zooma (27/09): la riga, il
    // pomello e l'etichetta seguono il punto del confronto ma non si ingrandiscono.
    'transform:translateX(-50%) scaleX(calc(1 / var(--cabina-zoom, 1)))',
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
    // Solo in verticale: in orizzontale lo compensa già la riga, che lo contiene.
    'transform:translate(-50%,-50%) scaleY(calc(1 / var(--cabina-zoom, 1)))',
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
  // di capire cosa dicesse. Ora resta finché l'acquirente non muove la riga, col
  // pomello o toccando la foto: a quel punto ha capito, e la scritta copriva le
  // scarpe (Arou, 04/11/2026; solo col trascinamento, al tocco restava lì).
  const hint = document.createElement('div');
  hint.setAttribute('data-cabina-reveal-hint', '');
  // ⚠️ Con `getLocaleString` qui si leggeva «reveal_result.drag_hint» in chiaro,
  // visto dal vivo sul negozio di test: il bundle è nuovo, ma i JSON dei locali
  // si servono a parte e hanno la loro cache — una chiave nuova non c'è ancora.
  // Il ripiego è una stringa che esiste da prima e dice comunque cos'è.
  hint.textContent = `↔  ${getLocaleStringOr('reveal_result.drag_hint', 'reveal_result.slider_label')}`;
  // ⚠️ SOPRA IL POMELLO, e si muove con la riga (`applyClip`). In alto al
  // centro (fino al 14/10/2026) copriva il viso; in basso a sinistra (fino al
  // 05/11/2026) la scarpa (Arou, dal telefono sulla demo). In una foto a figura
  // intera non c'è un angolo libero: la scritta sta allora sulla cosa che
  // descrive, e sparisce al primo gesto.
  hint.style.cssText = [
    'position:absolute',
    `left:${INITIAL_CLIP_PERCENT}%`,
    'bottom:calc(50% + 36px)',
    'max-width:calc(100% - 32px)',
    'overflow:hidden',
    'text-overflow:ellipsis',
    'transform:translateX(-50%) scale(calc(1 / var(--cabina-zoom, 1)))',
    'transform-origin:bottom center',
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
  // Il puntatore si è mosso con la maniglia premuta: il click che segue chiude
  // un trascinamento, non è un tocco.
  let haTrascinato = false;
  let pressioneX = 0;
  let corrente = INITIAL_CLIP_PERCENT;

  function applyClip(percent: number): void {
    const clamped = Math.max(0, Math.min(100, percent));
    corrente = clamped;
    generatedImg.style.clipPath = buildClipPath(clamped);
    handle.style.left = `${clamped}%`;
    hint.style.left = `${clamped}%`;
    handle.setAttribute('aria-valuenow', String(Math.round(clamped)));
    callbacks.onClipChange?.(clamped);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!isDragging) return;
    // Sotto la soglia è il tremolio di un dito che tocca, non un trascinamento.
    if (Math.abs(e.clientX - pressioneX) > DRAG_THRESHOLD) {
      haTrascinato = true;
      hint.remove();
    }
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

  // ⚠️ Sul CONTENITORE, non solo sulla maniglia. La scritta dice «trascina» e
  // sul telefono si trascina la foto, non una riga da 4 px: fino al 05/11/2026
  // quel gesto non muoveva niente e non toglieva la scritta (riprodotto con un
  // Pixel 7 emulato su sole-completo: la riga ferma, «Drag to compare» lì).
  // Ingrandita, il trascinamento sulla foto è il pan dello zoom-handler.
  container.addEventListener('pointerdown', (e: PointerEvent) => {
    // Guardia re-entrancy: un secondo pointer (es. altro dito) che preme la
    // maniglia mentre il primo è già in drag non deve sovrascrivere lo stato.
    if (isDragging) return;
    // `--cabina-zoom` non c'è finché non si zooma: vuoto = 1. La soglia è la
    // stessa 1.01 dello zoom-handler (lì è un letterale in sei punti).
    if ((parseFloat(getComputedStyle(container).getPropertyValue('--cabina-zoom')) || 1) > 1.01) return;
    e.preventDefault();
    // Sulla foto la scritta si toglie al primo movimento (`onPointerMove`), non
    // alla pressione: con `touch-action: pan-y` anche uno scroll verticale che
    // parte sulla foto passa di qui, e non è un'interazione col confronto
    // (rilievo Kilo, PR #390). Sul pomello la pressione è già l'intenzione.
    if (handle.contains(e.target as Node)) hint.remove();
    isDragging = true;
    haTrascinato = false;
    pressioneX = e.clientX;
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
    // Niente salto alla pressione: la riga segue il dito dal primo movimento.
    // Un tocco fermo è un click, e lì `primaDelClick` deve leggere la posizione
    // di PRIMA del tocco, o il secondo tocco non riporterebbe più la riga indietro.
  });

  // Click sul container (non solo sulla maniglia) sposta la clip lì.
  //
  // ⚠️ Il doppio tocco è dello zoom (zoom-handler), e ogni suo tocco è anche un
  // click: la riga finiva nel punto toccato, cioè in mezzo al dettaglio appena
  // ingrandito, metà prova e metà foto di partenza (13/10/2026). Il secondo
  // click riporta quindi la riga dov'era prima del primo. Ritardare il primo di
  // 300 ms toglierebbe anche il mezzo passo, ma renderebbe lento ogni tocco singolo.
  let ultimoClick = { t: 0, x: 0, y: 0 };
  let primaDelClick = INITIAL_CLIP_PERCENT;
  container.addEventListener('click', (e: MouseEvent) => {
    if (isDragging) return;
    hint.remove();
    // Il click che chiude un trascinamento della maniglia: la riga è già al suo
    // posto, e contarlo come primo tocco farebbe annullare il trascinamento dopo.
    // ⚠️ Non «il click è sulla maniglia»: dopo il primo tocco la maniglia è
    // proprio sotto il dito, e il secondo tocco cade su di lei (visto nel
    // browser: con quel controllo la riga restava nel punto toccato).
    if (haTrascinato) {
      haTrascinato = false;
      return;
    }
    // Lo stesso criterio dello zoom (`eDoppioTocco`): vicini nel tempo E nello
    // spazio. Due tocchi rapidi in punti diversi restano due spostamenti.
    const click = { t: Date.now(), x: e.clientX, y: e.clientY };
    if (eDoppioTocco(ultimoClick, click)) {
      ultimoClick = { t: 0, x: 0, y: 0 };
      applyClip(primaDelClick);
      return;
    }
    ultimoClick = click;
    primaDelClick = corrente;
    const rect = container.getBoundingClientRect();
    const percent = computeClipPercent(rect, e.clientX);
    applyClip(percent);
  });

  // ── a11y: tastiera (frecce sinistra/destra) ─────────────────────────────
  handle.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') hint.remove();
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