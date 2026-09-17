/**
 * Rotation Handler — gestisce la rotazione 360° del capo tramite drag/swipe.
 *
 * Desktop: pointerdown → pointermove (verso destra/sinistra) → snap angle
 * Mobile: touchstart → touchmove (1 dito) → snap angle
 * Threshold: 50px di drag per cambiare angolo.
 * Risposta entro 100ms dal gesture.
 *
 * Story 10.4 (AD-D3): la rotazione cicla **solo tra gli indici disponibili** (le
 * viste effettivamente presenti) invece di assumere 4 angoli fissi. Un capo con
 * sole viste [0,2] alterna 0↔2, senza mai passare per gli angoli mancanti.
 *
 * [Source: architecture.md#Story 3.7 — FR-10, AC1; Story 10.4 — AC3]
 */

export interface RotationHandler {
  /** Attacca i listener di rotazione al container. */
  attach(container: HTMLElement): void;
  /** Rimuove tutti i listener. */
  detach(): void;
  /** Restituisce l'indice dell'angolo corrente (0-3 → 0°/90°/180°/270°). */
  getAngle(): number;
}

export interface RotationCallbacks {
  /** Chiamato quando l'angolo cambia (indice 0-3). */
  onAngleChange: (index: number) => void;
}

/**
 * Crea un RotationHandler.
 *
 * @param callbacks - Callback chiamato quando l'angolo cambia.
 * @param availableIndices - Indici degli angoli disponibili su cui ciclare
 *   (default [0,1,2,3]). Duplicati/valori ignorati; ordinati crescenti.
 * @param initialAngle - Indice dell'angolo iniziale (default = primo disponibile).
 */
export function createRotationHandler(
  callbacks: RotationCallbacks,
  availableIndices: number[] = [0, 1, 2, 3],
  initialAngle?: number,
): RotationHandler {
  // Indici disponibili ordinati e deduplicati; fallback a [0] se vuoto (mai ciclo vuoto).
  const cycle = [...new Set(availableIndices)].sort((a, b) => a - b);
  const indices = cycle.length > 0 ? cycle : [0];

  let currentAngle = initialAngle !== undefined && indices.includes(initialAngle)
    ? initialAngle
    : indices[0]!;
  let container: HTMLElement | null = null;

  // State per il tracking del drag
  let pointerStartX = 0;
  let isDragging = false;
  const DRAG_THRESHOLD = 50; // px per swipe lento

  // Tracking pointer attivi per distinguere pinch (2 dita) da swipe (1 dito) — AC4
  const activePointers = new Set<number>();
  const pointerLastX = new Map<number, number>(); // ultima posizione X per pointerId

  // Velocity detection per swipe rapidi — AC5
  let pointerStartTime = 0;
  const VELOCITY_THRESHOLD_PX_MS = 0.5; // px/ms — soglia per swipe "rapido"
  const MIN_VELOCITY_SWIPE_PX = 15;     // distanza minima anche per swipe veloci

  function handlePointerDown(e: PointerEvent): void {
    activePointers.add(e.pointerId);
    pointerLastX.set(e.pointerId, e.clientX);
    if (e.button !== 0) return;
    // Con 2+ dita attive → pinch in corso, non avviare rotazione (AC4)
    if (activePointers.size > 1) {
      isDragging = false;
      return;
    }
    isDragging = true;
    pointerStartX = e.clientX;
    pointerStartTime = performance.now();
    e.preventDefault();
  }

  function handlePointerMove(e: PointerEvent): void {
    pointerLastX.set(e.pointerId, e.clientX);
    // Sopprime rotazione se sono attivi più pointer (pinch) — AC4
    if (!isDragging || activePointers.size > 1) return;

    const deltaX = e.clientX - pointerStartX;
    const elapsedMs = Math.max(performance.now() - pointerStartTime, 1);
    const velocity = Math.abs(deltaX) / elapsedMs;

    // Cambia angolo per soglia standard o per swipe rapido (AC5)
    const isThresholdSwipe = Math.abs(deltaX) >= DRAG_THRESHOLD;
    const isQuickSwipe = velocity >= VELOCITY_THRESHOLD_PX_MS && Math.abs(deltaX) >= MIN_VELOCITY_SWIPE_PX;

    if (isThresholdSwipe || isQuickSwipe) {
      // Cicla sul solo elenco degli indici disponibili (data-driven, non 0..3 fissi).
      const pos = indices.indexOf(currentAngle);
      const safePos = pos === -1 ? 0 : pos;
      const nextPos = deltaX > 0
        ? (safePos + 1) % indices.length
        : (safePos - 1 + indices.length) % indices.length;
      currentAngle = indices[nextPos]!;
      pointerStartX = e.clientX;
      pointerStartTime = performance.now();
      callbacks.onAngleChange(currentAngle);
    }
  }

  function handlePointerUp(e: PointerEvent): void {
    pointerLastX.delete(e.pointerId);
    activePointers.delete(e.pointerId);
    if (activePointers.size === 1) {
      isDragging = true;
      const remainingId = [...activePointers][0]!;
      pointerStartX = pointerLastX.get(remainingId) ?? e.clientX;
      pointerStartTime = performance.now();
    } else {
      isDragging = false;
    }
  }

  function attach(el: HTMLElement): void {
    detach(); // Previeni doppio attach
    container = el;

    el.style.touchAction = 'none';
    el.style.userSelect = 'none';

    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerup', handlePointerUp);
    el.addEventListener('pointercancel', handlePointerUp);
    el.addEventListener('pointerleave', handlePointerUp);
  }

  function detach(): void {
    if (!container) return;

    container.style.touchAction = '';
    container.style.userSelect = '';

    container.removeEventListener('pointerdown', handlePointerDown);
    container.removeEventListener('pointermove', handlePointerMove);
    container.removeEventListener('pointerup', handlePointerUp);
    container.removeEventListener('pointercancel', handlePointerUp);
    container.removeEventListener('pointerleave', handlePointerUp);

    container = null;
    isDragging = false;
    activePointers.clear();
    pointerLastX.clear();
  }

  return {
    attach,
    detach,
    getAngle: () => currentAngle,
  };
}