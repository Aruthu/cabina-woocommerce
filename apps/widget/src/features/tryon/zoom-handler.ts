/**
 * Zoom Handler — gestisce zoom e pan dell'immagine try-on.
 *
 * Desktop: wheel → zoom (1×–3×), pointermove (drag con left button) → pan
 * Mobile: pinch (2 dita) → zoom, 1 dito drag → pan
 * Doppio tap → reset zoom e pan a default (1×, centrato).
 * Pan abilitato solo quando scale > 1.01.
 *
 * [Source: architecture.md#Story 3.7 — FR-11, AC2]
 */

export interface ZoomTransform {
  scale: number;
  translateX: number;
  translateY: number;
}

export interface ZoomHandler {
  /** Attacca i listener di zoom/pan al container. */
  attach(container: HTMLElement): void;
  /** Rimuove tutti i listener. */
  detach(): void;
  /** Restituisce la trasformazione corrente. */
  getTransform(): ZoomTransform;
  /** Resetta zoom e pan ai valori di default. */
  reset(): void;
}

export interface ZoomCallbacks {
  /** Chiamato ogni volta che la trasformazione cambia. */
  onTransformChange: (transform: ZoomTransform) => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const ZOOM_SENSITIVITY = 0.001; // wheel delta multiplier
const DOUBLE_TAP_DELAY = 300; // ms per riconoscere doppio tap
const PINCH_PAN_THRESHOLD = 10; // px per distinguere pinch da pan a 2 dita

export function createZoomHandler(callbacks: ZoomCallbacks): ZoomHandler {
  let container: HTMLElement | null = null;
  let currentTransform: ZoomTransform = { scale: 1, translateX: 0, translateY: 0 };

  // State per pinch (mobile)
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let isPinching = false;

  // State per pan
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panStartTranslateX = 0;
  let panStartTranslateY = 0;

  // State per doppio tap
  let lastTapTime = 0;

  function clampScale(scale: number): number {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
  }

  function clampPan(tx: number, ty: number, scale: number): { tx: number; ty: number } {
    // Limita il pan a +/- 50% dell'immagine zoommata rispetto al centro
    const maxPan = Math.max(0, (scale - 1) * 100);
    return {
      tx: Math.max(-maxPan, Math.min(maxPan, tx)),
      ty: Math.max(-maxPan, Math.min(maxPan, ty)),
    };
  }

  function updateTransform(partial: Partial<ZoomTransform>): void {
    currentTransform = { ...currentTransform, ...partial };
    // Clamp scale
    if (partial.scale !== undefined) {
      currentTransform.scale = clampScale(currentTransform.scale);
    }
    // Clamp pan se scale è ~1
    if (currentTransform.scale <= 1.01) {
      currentTransform.translateX = 0;
      currentTransform.translateY = 0;
    } else if (partial.translateX !== undefined || partial.translateY !== undefined) {
      const clamped = clampPan(
        currentTransform.translateX,
        currentTransform.translateY,
        currentTransform.scale,
      );
      currentTransform.translateX = clamped.tx;
      currentTransform.translateY = clamped.ty;
    }
    callbacks.onTransformChange({ ...currentTransform });
  }

  // ── Wheel (desktop zoom) ──────────────────────────────────────────────

  function handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const delta = -e.deltaY * ZOOM_SENSITIVITY;
    const newScale = currentTransform.scale + delta;
    updateTransform({ scale: newScale });
  }

  // ── Touch per pinch e pan (mobile) ────────────────────────────────────

  function getTouchDistance(touches: TouchList): number {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function handleTouchStart(e: TouchEvent): void {
    if (e.touches.length === 2) {
      // Pinch start
      isPinching = true;
      pinchStartDist = getTouchDistance(e.touches);
      pinchStartScale = currentTransform.scale;
      isPanning = false;
    } else if (e.touches.length === 1 && currentTransform.scale > 1.01) {
      // Pan start (solo se già zoommato)
      isPanning = true;
      panStartX = e.touches[0].clientX;
      panStartY = e.touches[0].clientY;
      panStartTranslateX = currentTransform.translateX;
      panStartTranslateY = currentTransform.translateY;
    }
  }

  function handleTouchMove(e: TouchEvent): void {
    if (isPinching && e.touches.length === 2) {
      // Pinch in corso
      const currentDist = getTouchDistance(e.touches);
      if (pinchStartDist > 0) {
        const newScale = pinchStartScale * (currentDist / pinchStartDist);
        updateTransform({ scale: newScale });
      }
      e.preventDefault();
    } else if (isPanning && e.touches.length === 1 && currentTransform.scale > 1.01) {
      // Pan in corso
      const deltaX = e.touches[0].clientX - panStartX;
      const deltaY = e.touches[0].clientY - panStartY;
      updateTransform({
        translateX: panStartTranslateX + deltaX,
        translateY: panStartTranslateY + deltaY,
      });
    }
  }

  function handleTouchEnd(): void {
    isPinching = false;
    isPanning = false;
    pinchStartDist = 0;
  }

  // ── Pointer (desktop pan) ─────────────────────────────────────────────

  let pointerPanning = false;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let pointerStartTx = 0;
  let pointerStartTy = 0;

  function handlePointerDown(e: PointerEvent): void {
    // Solo left button, e solo se già zoommato (pan abilitato)
    if (e.button !== 0) return;
    if (currentTransform.scale <= 1.01) return;

    pointerPanning = true;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    pointerStartTx = currentTransform.translateX;
    pointerStartTy = currentTransform.translateY;
    e.preventDefault();
  }

  function handlePointerMove(e: PointerEvent): void {
    if (!pointerPanning) return;

    const deltaX = e.clientX - pointerStartX;
    const deltaY = e.clientY - pointerStartY;
    updateTransform({
      translateX: pointerStartTx + deltaX * (1 / currentTransform.scale),
      translateY: pointerStartTy + deltaY * (1 / currentTransform.scale),
    });
  }

  function handlePointerUp(): void {
    pointerPanning = false;
  }

  // ── Doppio tap reset ──────────────────────────────────────────────────

  function handleClick(e: MouseEvent): void {
    const now = Date.now();
    if (now - lastTapTime < DOUBLE_TAP_DELAY) {
      // Doppio tap!
      updateTransform({ scale: 1, translateX: 0, translateY: 0 });
    }
    lastTapTime = now;
  }

  // ── Public API ────────────────────────────────────────────────────────

  function attach(el: HTMLElement): void {
    detach(); // Previeni doppio attach
    container = el;

    // Desktop zoom (wheel)
    el.addEventListener('wheel', handleWheel, { passive: false });

    // Mobile pinch + pan
    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    el.addEventListener('touchcancel', handleTouchEnd);

    // Desktop pan
    el.addEventListener('pointerdown', handlePointerDown);
    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerup', handlePointerUp);
    el.addEventListener('pointercancel', handlePointerUp);

    // Doppio tap reset
    el.addEventListener('click', handleClick);
  }

  function detach(): void {
    if (!container) return;

    container.removeEventListener('wheel', handleWheel);
    container.removeEventListener('touchstart', handleTouchStart);
    container.removeEventListener('touchmove', handleTouchMove);
    container.removeEventListener('touchend', handleTouchEnd);
    container.removeEventListener('touchcancel', handleTouchEnd);
    container.removeEventListener('pointerdown', handlePointerDown);
    container.removeEventListener('pointermove', handlePointerMove);
    container.removeEventListener('pointerup', handlePointerUp);
    container.removeEventListener('pointercancel', handlePointerUp);
    container.removeEventListener('click', handleClick);

    container = null;
    isPinching = false;
    isPanning = false;
    pointerPanning = false;
  }

  function getTransform(): ZoomTransform {
    return { ...currentTransform };
  }

  function reset(): void {
    updateTransform({ scale: 1, translateX: 0, translateY: 0 });
  }

  return { attach, detach, getTransform, reset };
}