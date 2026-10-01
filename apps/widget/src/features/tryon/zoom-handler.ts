/**
 * Zoom Handler — gestisce zoom e pan dell'immagine try-on.
 *
 * Desktop: wheel → zoom (1×–3×) **verso il puntatore**, drag col tasto sinistro → pan
 * Mobile: pinch (2 dita) → zoom verso il centro delle dita, 1 dito drag → pan
 * Doppio tap/click → a 1× ingrandisce sul punto toccato, altrimenti torna a 1×.
 * Pan abilitato solo quando scale > 1.01.
 *
 * 28/09 (Arou): «l'app può provare fino a tre capi insieme: maglia più scarpe,
 * come farà il cliente a zoomare per vederle bene?». Fino a ieri lo zoom
 * partiva da un punto fisso deciso dalla categoria del capo della pagina
 * (`puntoDelCapo`): con due o tre capi non esiste un punto giusto. Ora lo zoom
 * va **dove il cliente indica** — il puntatore, il centro del pinch, il tocco —
 * come in qualunque visore di foto: per vedere le scarpe si punta alle scarpe.
 *
 * La trasformazione è `translate(t) scale(s)` con origine `0 0`: un punto `p`
 * della foto (in px del contenitore, non trasformati) finisce in `t + s·p`.
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

/** Misure in px del contenitore, non trasformate: dove sta la foto dentro
 *  (`object-fit: contain` lascia bande). */
export interface MisureZoom {
  larghezza: number;
  altezza: number;
  foto: { x0: number; y0: number; x1: number; y1: number };
}

export interface ZoomCallbacks {
  /** Chiamato ogni volta che la trasformazione cambia. */
  onTransformChange: (transform: ZoomTransform) => void;
  /** Se c'è, lo scorrimento resta dentro i bordi della foto (27/09). */
  misure?: () => MisureZoom | null;
}

/**
 * Quanto si può traslare su un asse perché la foto non lasci mai vedere la
 * pagina sotto (Arou, 27/09: «permettere lo scorrimento dell'immagine così si
 * vede come si desidera»). Con `translate(t) scale(s)` il bordo `fotoDa` finisce
 * in `t + s·fotoDa`: se la foto ingrandita è più larga della vista deve coprirla
 * tutta, se è più stretta resta centrata (una sola posizione ammessa).
 */
export function limitiScorrimento(vista: number, fotoDa: number, fotoA: number, scala: number): [number, number] {
  if (scala * (fotoA - fotoDa) <= vista) {
    const centro = vista / 2 - (scala * (fotoDa + fotoA)) / 2;
    return [centro, centro];
  }
  return [vista - scala * fotoA, -scala * fotoDa];
}

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const ZOOM_SENSITIVITY = 0.001; // wheel delta multiplier
/** Quanto ingrandisce un doppio tap a 1×: abbastanza da vedere una scarpa, non da perdersi. */
const DOUBLE_TAP_SCALE = 2.5;
/** Oltre questi px un pointerdown→pointerup è un trascinamento, non un click. */
const DRAG_THRESHOLD = 4;
const DOUBLE_TAP_DELAY = 300; // ms per riconoscere doppio tap

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

  // Un trascinamento per spostarsi nello zoom finisce con un click: senza
  // fermarlo, il reveal slider lo leggeva come «sposta qui la maniglia» e
  // la prova spariva dietro la foto originale (visto il 27/09 sulle scarpe).
  let trascinato = false;

  function clampScale(scale: number): number {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
  }

  function updateTransform(partial: Partial<ZoomTransform>): void {
    currentTransform = { ...currentTransform, ...partial };
    if (partial.scale !== undefined) {
      currentTransform.scale = clampScale(currentTransform.scale);
    }
    // Senza misure (foto non ancora caricata, o chiamante senza callback) la
    // foto si assume grande quanto il contenitore: i limiti restano veri, e
    // l'ancora di `zoomVerso` non viene schiacciata da un tetto arbitrario
    // (rilievo Kilo sulla #268: prima ±100 px per unità di scala).
    const m = callbacks.misure?.() ?? misureDelContenitore();
    if (currentTransform.scale <= 1.01) {
      currentTransform.scale = 1;
      currentTransform.translateX = 0;
      currentTransform.translateY = 0;
    } else if (m) {
      // Anche a zoom cambiato, non solo a scorrimento: rimpicciolendo, la foto
      // spostata al massimo lascerebbe una banda vuota.
      const s = currentTransform.scale;
      const [x0, x1] = limitiScorrimento(m.larghezza, m.foto.x0, m.foto.x1, s);
      const [y0, y1] = limitiScorrimento(m.altezza, m.foto.y0, m.foto.y1, s);
      currentTransform.translateX = Math.max(x0, Math.min(x1, currentTransform.translateX));
      currentTransform.translateY = Math.max(y0, Math.min(y1, currentTransform.translateY));
    }
    callbacks.onTransformChange({ ...currentTransform });
  }

  function misureDelContenitore(): MisureZoom | null {
    if (!container) return null;
    const larghezza = container.clientWidth;
    const altezza = container.clientHeight;
    // Senza layout (nascosto, non ancora montato) non c'è niente da limitare:
    // un rettangolo 0×0 inchioderebbe la traslazione a zero (Kilo, #268).
    if (!larghezza || !altezza) return null;
    return { larghezza, altezza, foto: { x0: 0, y0: 0, x1: larghezza, y1: altezza } };
  }

  /** Coordinate di un evento dentro il contenitore (px non trasformati). */
  function puntoNelContenitore(clientX: number, clientY: number): { x: number; y: number } {
    const r = container?.getBoundingClientRect();
    return r ? { x: clientX - r.left, y: clientY - r.top } : { x: clientX, y: clientY };
  }

  /**
   * Porta la scala a `nuovaScala` tenendo fermo, sullo schermo, il punto della
   * foto che sta sotto `(x, y)`: quello che il cliente indica resta dov'è e
   * cresce intorno a sé. Da `x = t + s·p` segue `p = (x − t)/s` e `t' = x − s'·p`.
   */
  function zoomVerso(nuovaScala: number, x: number, y: number): void {
    const s = currentTransform.scale;
    const s2 = clampScale(nuovaScala);
    const px = (x - currentTransform.translateX) / s;
    const py = (y - currentTransform.translateY) / s;
    updateTransform({ scale: s2, translateX: x - s2 * px, translateY: y - s2 * py });
  }

  // ── Wheel (desktop zoom) ──────────────────────────────────────────────

  function handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const delta = -e.deltaY * ZOOM_SENSITIVITY;
    const { x, y } = puntoNelContenitore(e.clientX, e.clientY);
    zoomVerso(currentTransform.scale + delta, x, y);
  }

  // ── Touch per pinch e pan (mobile) ────────────────────────────────────

  function getTouchDistance(touches: TouchList): number {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function centroDelPinch(touches: TouchList): { x: number; y: number } {
    return puntoNelContenitore(
      (touches[0].clientX + touches[1].clientX) / 2,
      (touches[0].clientY + touches[1].clientY) / 2,
    );
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
      // Pinch in corso: la scala cresce verso il centro delle due dita, e se
      // le dita si spostano insieme il centro le segue (pan a due dita).
      const currentDist = getTouchDistance(e.touches);
      if (pinchStartDist > 0) {
        const { x, y } = centroDelPinch(e.touches);
        zoomVerso(pinchStartScale * (currentDist / pinchStartDist), x, y);
      }
      e.preventDefault();
    } else if (isPanning && e.touches.length === 1 && currentTransform.scale > 1.01) {
      // Pan in corso: il translate è fuori dalla scala, quindi un px di dito
      // è un px di foto.
      updateTransform({
        translateX: panStartTranslateX + (e.touches[0].clientX - panStartX),
        translateY: panStartTranslateY + (e.touches[0].clientY - panStartY),
      });
      e.preventDefault();
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
    trascinato = false;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    pointerStartTx = currentTransform.translateX;
    pointerStartTy = currentTransform.translateY;
    e.preventDefault();
    // Il trascinamento continua anche se il puntatore esce dal riquadro
    // (a 3× il bordo è vicino): senza la cattura il pan si fermava lì.
    try {
      container?.setPointerCapture(e.pointerId);
    } catch {
      /* jsdom e browser vecchi: si trascina finché si resta dentro */
    }
  }

  function handlePointerMove(e: PointerEvent): void {
    if (!pointerPanning) return;

    const deltaX = e.clientX - pointerStartX;
    const deltaY = e.clientY - pointerStartY;
    if (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD) trascinato = true;
    updateTransform({ translateX: pointerStartTx + deltaX, translateY: pointerStartTy + deltaY });
  }

  function handlePointerUp(): void {
    pointerPanning = false;
  }

  /**
   * Le tre `<img>` della prova sono trascinabili di loro: al secondo px di
   * movimento il browser avviava il drag nativo dell'immagine (il fantasma
   * semitrasparente) e mandava `pointercancel` al nostro pan — con un mouse
   * vero la foto ingrandita restava ferma (Arou, 28/09: «quando ingrandisce
   * l'immagine non si sposta più»). I banchi non lo vedevano: gli eventi
   * sintetici non fanno partire il drag nativo.
   */
  function handleDragStart(e: DragEvent): void {
    e.preventDefault();
  }

  /** In cattura, prima dei figli (il reveal slider): il click di fine trascinamento non arriva. */
  function handleClickCapture(e: MouseEvent): void {
    if (!trascinato) return;
    trascinato = false;
    e.stopPropagation();
  }

  // ── Doppio tap: ingrandisce sul punto, o torna a 1× ──────────────────

  function handleClick(e: MouseEvent): void {
    const now = Date.now();
    if (now - lastTapTime < DOUBLE_TAP_DELAY) {
      if (currentTransform.scale > 1.01) {
        updateTransform({ scale: 1, translateX: 0, translateY: 0 });
      } else {
        const { x, y } = puntoNelContenitore(e.clientX, e.clientY);
        zoomVerso(DOUBLE_TAP_SCALE, x, y);
      }
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
    el.addEventListener('dragstart', handleDragStart);
    // Niente selezione di testo né gesti del browser (scroll, zoom della
    // pagina) sopra la prova: qui i gesti sono nostri.
    el.style.userSelect = 'none';
    el.style.touchAction = 'none';

    // Doppio tap
    el.addEventListener('click', handleClick);
    el.addEventListener('click', handleClickCapture, true);
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
    container.removeEventListener('dragstart', handleDragStart);
    container.removeEventListener('click', handleClick);
    container.removeEventListener('click', handleClickCapture, true);

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
