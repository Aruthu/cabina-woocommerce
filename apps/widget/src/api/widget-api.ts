import type { ApiResponse, Measures, SizeTableRow, SizeTableCategory, WidgetPublicConfig, FashnGarmentCategory } from '@cabina/shared';
import { normalizeProductUrl, VISION_UNAVAILABLE_ERROR } from '@cabina/shared';
import type { GarmentAnalysis, SelectedGarment } from '../state/types';

export type PartialMeasures = Partial<Measures>;

// ── Tipi ─────────────────────────────────────────────────────────────────

export interface SessionStartResult {
  ok: boolean;
  sessionId?: string;
  errorCode?: string;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWidgetConfig(
  apiKey: string,
  baseUrl = ''
): Promise<WidgetPublicConfig | null> {
  try {
    const sanitizedBase = baseUrl.replace(/\/+$/, '');
    const url = `${sanitizedBase}/api/widget/config?api_key=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(url);
    const body: ApiResponse<WidgetPublicConfig> = await res.json().catch((err: unknown) => {
      if (err instanceof SyntaxError) {
        console.error('[widget] error=INVALID_JSON');
      }
      throw err;
    });
    if (!res.ok || body.error) {
      console.error(`[widget] error=${body.error?.code ?? 'INTERNAL_ERROR'}`);
      return null;
    }
    if (!body.data) {
      console.error('[widget] error=INTERNAL_ERROR');
      return null;
    }
    return body.data;
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.error('[widget] error=TIMEOUT');
    } else if (!(err instanceof SyntaxError)) {
      console.error('[widget] error=INTERNAL_ERROR');
    }
    return null;
  }
}

export interface SizeTableResult {
  id: string;
  name: string;
  /** Per quale capo vale; `null` = qualsiasi (tabelle di prima del 05/09/2026). */
  category: SizeTableCategory | null;
  data: SizeTableRow[];
}

/**
 * Recupera le tabelle taglie pubbliche del merchant.
 * GET /api/widget/size-tables?api_key=...
 *
 * Restituisce array di tabelle (ciascuna con id, name, data).
 * Array vuoto se il merchant non ha tabelle.
 * null in caso di errore (timeout, rete, api_key invalida).
 */
export async function fetchSizeTables(
  apiKey: string,
  baseUrl = '',
): Promise<SizeTableResult[] | null> {
  try {
    const sanitizedBase = baseUrl.replace(/\/+$/, '');
    const url = `${sanitizedBase}/api/widget/size-tables?api_key=${encodeURIComponent(apiKey)}`;
    const res = await fetchWithTimeout(url);
    const body: ApiResponse<SizeTableResult[]> = await res.json().catch((err: unknown) => {
      if (err instanceof SyntaxError) {
        console.error('[widget] error=INVALID_JSON');
      }
      throw err;
    });
    if (!res.ok || body.error) {
      console.error(`[widget] error=${body.error?.code ?? 'INTERNAL_ERROR'}`);
      return null;
    }
    return body.data ?? [];
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.error('[widget] error=TIMEOUT');
    } else if (!(err instanceof SyntaxError)) {
      console.error('[widget] error=INTERNAL_ERROR');
    }
    return null;
  }
}


/**
 * Chiama il backend AI Vision per stimare le misure dalla foto.
 * POST /api/widget/estimate-measures con X-Api-Key e foto base64.
 *
 * Ritorna `{}` quando la stima non produce misure (foto non leggibile, errore di
 * rete), MA **lancia** `Error(VISION_UNAVAILABLE_ERROR)` quando il servizio non è
 * disponibile — incluso il caso in cui sia questo client ad abortire per timeout,
 * che è precisamente lo scenario "provider lento". Il chiamante distingue i due
 * casi per mostrare messaggi diversi; chi non li distingue riceve `{}` come prima.
 */
export async function estimateMeasuresFromPhoto(
  apiKey: string,
  photoDataUrl: string,
  baseUrl = '',
): Promise<PartialMeasures> {
  try {
    const sanitizedBase = baseUrl.replace(/\/+$/, '');
    const url = `${sanitizedBase}/api/widget/estimate-measures`;

    const colonIdx = photoDataUrl.indexOf(',');
    const base64 = colonIdx !== -1 ? photoDataUrl.slice(colonIdx + 1) : photoDataUrl;
    const mimeMatch = photoDataUrl.match(/data:(image\/[\w+]+)/);
    const mimeType = mimeMatch?.[1] ?? 'image/jpeg';

    // POST con Content-Type text/plain (CORS-safelisted) → nessun preflight
    // cross-origin; api_key nel body (pattern garment-views). Con
    // application/json + X-Api-Key il browser faceva un preflight che nessuna
    // route del widget sa gestire, e la chiamata moriva prima di partire.
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ api_key: apiKey, photo: base64, mimeType }),
      },
      15_000,
    );

    const body = (await res.json().catch(() => null)) as ApiResponse<PartialMeasures> | null;
    if (!res.ok) {
      // 2026-07-31: il fallimento resta silenzioso per l'acquirente (form
      // opzionale), non per chi diagnostica. Mai loggare il body della richiesta:
      // contiene la foto in base64.
      console.error(`[cabina] estimate-measures HTTP ${res.status}`, body?.error ?? '');
      return {};
    }
    if (body?.error) {
      console.error('[cabina] estimate-measures errore', body.error);
      // Story 12.7: "il servizio non ha risposto" e "la foto non dava misure"
      // hanno esiti diversi per l'acquirente. Il primo viaggia sul canale
      // eccezione, che il form già cattura, così nessuna firma cambia.
      if (body.error.code === VISION_UNAVAILABLE_ERROR) throw new Error(VISION_UNAVAILABLE_ERROR);
      return {};
    }
    return body?.data ?? {};
  } catch (e) {
    if (e instanceof Error && e.message === VISION_UNAVAILABLE_ERROR) throw e;
    // Timeout o abort di QUESTO client: il server non ha fatto in tempo, che è
    // la forma più comune di "servizio non disponibile" proprio quando il
    // provider è lento. Senza questo ramo l'acquirente leggerebbe "foto non
    // leggibile" nello scenario che ha motivato la Story 12.7.
    // `instanceof DOMException` come nel resto del file: DOMException non è
    // garantito essere `instanceof Error` su tutti i browser target.
    if (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
      console.error('[cabina] estimate-measures: nessuna risposta entro il timeout del client');
      throw new Error(VISION_UNAVAILABLE_ERROR);
    }
    return {};
  }
}

/**
 * Chiama il backend AI per analizzare la categoria del capo dall'URL immagine prodotto.
 * Timeout breve (3s) per non rallentare il flusso principale.
 * Silent failure: ritorna null se il server non è raggiungibile o l'analisi fallisce.
 */
export async function analyzeGarmentFromUrl(
  apiKey: string,
  productImageUrl: string,
  baseUrl = '',
): Promise<GarmentAnalysis | null> {
  try {
    const sanitizedBase = baseUrl.replace(/\/+$/, '');
    const url = `${sanitizedBase}/api/widget/analyze-garment`;

    // text/plain + api_key nel body: vedi estimateMeasuresFromPhoto.
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ api_key: apiKey, productImageUrl }),
      },
      // ⚠️ 2026-07-30 — erano 3_000, e il client abortiva SEMPRE: misurato in
      // produzione, la route risponde in 3,7-8,5s perché scarica l'immagine dal
      // CDN del negozio e poi interroga il modello vision. Il valore andava bene
      // finché l'analisi era spenta e tornava `unknown` in mezzo secondo: appena
      // ha iniziato a funzionare davvero, il timeout del client l'ha resa
      // inutile — `catch → return null`, categoria `auto`, FASHN di nuovo a
      // indovinare. Allineato a `estimateMeasuresFromPhoto`, che chiama lo
      // stesso backend vision con gli stessi tempi. Non blocca nulla:
      // l'analisi parte al DOMContentLoaded e serve solo al click sul try-on.
      15_000,
    );

    const body = (await res.json().catch(() => null)) as
      | { data?: GarmentAnalysis }
      | null;
    if (!res.ok || !body?.data) return null;
    return body.data;
  } catch {
    return null; // silent failure
  }
}


/**
 * Recupera il catalogo mix&match del merchant (Story 12.3).
 * POST /api/widget/catalog con api_key (pattern garment-views, text/plain).
 * Silent failure → `null` (mai rompere il flusso try-on): se il catalogo non
 * è disponibile, il widget mostra solo l'azione default "Prova in Cabina".
 */
export interface CatalogCollection {
  id: string;
  label: string;
  sortOrder: number;
}
export interface CatalogGarment {
  id: string;
  collectionId: string;
  label: string;
  imageUrl: string;
  fashnCategory: FashnGarmentCategory;
  productUrl: string | null;
}
export interface CatalogData {
  collections: CatalogCollection[];
  garments: CatalogGarment[];
}

export async function fetchCatalog(
  apiKey: string,
  baseUrl = '',
): Promise<CatalogData | null> {
  try {
    const sanitizedBase = baseUrl.replace(/\/+$/, '');
    const url = `${sanitizedBase}/api/widget/catalog`;

    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ api_key: apiKey }),
      },
      5_000,
    );

    const body = (await res.json().catch(() => null)) as ApiResponse<CatalogData> | null;
    if (!res.ok || !body?.data) return null;
    return body.data;
  } catch {
    return null; // silent failure
  }
}

/**
 * Chiama il try-on generativo (FASHN via fal.ai — Story 12.1 AC1/AC3/AC4).
 * POST /api/widget/tryon-generative con la foto dell'acquirente, l'array di capi
 * (Story 12.3: mix&match in cascata) e la pagina prodotto (per la cache lato server).
 *
 * Story 12.4 (Task 3.2): ritorna `{url, resultId}` — `resultId` è la cache key
 * server-side (hash non sensibile, deterministico per coppia foto+capi+pagina),
 * usato per collegare una segnalazione qualità alla generazione giusta (AC3).
 *
 * ⚠️ 2026-08-02 — **non ritorna più `null` per tutto.** Finché esisteva
 * l'overlay 2D come fallback, il motivo del fallimento non serviva a nessuno:
 * qualunque cosa andasse storta, l'acquirente vedeva comunque un'immagine.
 * Tolto l'overlay, quel `null` indistinto lascerebbe il widget senza niente da
 * dire — e «hai finito i crediti» e «il servizio non risponde» sono due cose
 * diverse, per l'acquirente e ancor più per il merchant. L'esito ora porta con
 * sé la causa (vedi `TryonOutcome`).
 *
 * Timeout ampio e scalare con il numero di capi (Story 12.3 Task 6.5): base 75s +
 * 25s per ogni capo oltre il primo (cascata sequenziale di chiamate FASHN).
 *
 * ⚠️ Chiamare SOLO dopo il gate di consenso GDPR foto (AC2) — questo client
 * non verifica il consenso, è un invariante del chiamante (fail-closed lato
 * widget, CAP-1).
 */
/**
 * Esito del try-on generativo. `reason` distingue i due casi che l'acquirente
 * vive in modo diverso:
 *  - `quota`     → il merchant ha esaurito i crediti del mese. Non è un guasto,
 *                  e riprovare non serve a nulla.
 *  - `technical` → tutto il resto (rete, timeout, errore del motore, richiesta
 *                  duplicata in volo): riprovare ha senso.
 */
export type TryonOutcome =
  | { ok: true; url: string; resultId: string }
  | { ok: false; reason: 'quota' | 'technical' };

/**
 * Chi c'è nella foto, e cosa ha autorizzato. 2026-08-22 — la route lo legge per
 * decidere se il **giudice vision** può guardare il risultato: un'immagine con
 * la sembianza dell'acquirente va a Novita solo se il consenso che la nomina
 * per quello scopo (v4) è stato dato; la modella preset non è un dato personale
 * e passa sempre. Non è opzionale di proposito: un bundle che non manda questi
 * campi non attiva il giudice, e deve essere una scelta visibile, non un default.
 */
export interface TryonIdentity {
  photoSource: 'preset' | 'upload';
  /** Versione del consenso foto salvata sul dispositivo; assente se mai dato. */
  consentVersion?: number;
}

export async function tryonGenerative(
  apiKey: string,
  baseUrl: string,
  modelImageData: string,
  garments: SelectedGarment[],
  productPageUrl: string,
  identity: TryonIdentity,
): Promise<TryonOutcome> {
  try {
    const sanitizedBase = baseUrl.replace(/\/+$/, '');
    const url = `${sanitizedBase}/api/widget/tryon-generative`;

    // Timeout scalare: base 100s + 25s per ogni capo oltre il primo.
    //
    // ⚠️ 2026-08-13 — la base era 75s, sotto il tetto per passo del server
    // (`TRYON_FETCH_TIMEOUT_MS_PER_STEP`, 100s): questo è il timeout che scatta
    // per PRIMO, ed è il solo che l'acquirente vede. Ma abortire qui non ferma
    // la function Vercel (debito noto, `deferred-work.md`): il render prosegue,
    // consuma quota, viene fatturato e cache-ato mentre l'acquirente ha già
    // ricevuto l'errore. Con FASHN misurato a 23,5s e oltre 30s, la finestra
    // 75-100s non era più il caso limite. I due valori vanno mossi in coppia.
    const timeoutMs = 100_000 + 25_000 * Math.max(0, garments.length - 1);

    // POST con Content-Type text/plain (CORS-safelisted) → nessun preflight
    // cross-origin; api_key nel body, mai in query (pattern garment-views).
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({
          api_key: apiKey,
          modelImageData,
          // ⚠️ 2026-07-26 — `SelectedGarment` usa `imageUrl`, ma lo schema della
          // route vuole `url`: serializzare l'array com'era faceva rispondere
          // `VALIDATION_ERROR: Required` a OGNI richiesta, quindi il try-on
          // generativo non è mai riuscito da quando 12.3 ha introdotto l'array
          // (prima il campo era un singolo `garmentImageUrl`). Il widget tratta
          // ogni errore come fallback silenzioso verso l'overlay, per questo il
          // guasto non si è mai visto da fuori. Mappare qui, non rinominare il
          // campo nello stato: `imageUrl` è il nome usato in tutto il widget.
          // 2026-08-09 — anche `removeExisting` passa com'è: quando è undefined
          // JSON.stringify fa sparire la chiave e la route applica il default
          // retrocompatibile (regola legacy lato rendering).
          // 2026-08-12 — anche `garmentPhotoType` passa com'è: undefined sparisce,
          // e la route applica il default "auto".
          garments: garments.map((g) => ({
            url: g.imageUrl,
            category: g.category,
            removeExisting: g.removeExisting,
            garmentPhotoType: g.garmentPhotoType,
          })),
          productPageUrl: normalizeProductUrl(productPageUrl),
          photoSource: identity.photoSource,
          // undefined → la chiave sparisce dal JSON, come `removeExisting`.
          consentVersion: identity.consentVersion,
        }),
      },
      timeoutMs,
    );

    const body = (await res.json().catch(() => null)) as ApiResponse<{ url: string; resultId: string }> | null;
    if (!res.ok || body?.error || !body?.data) {
      // La quota esaurita è l'unico esito che non è un guasto: il merchant ha
      // finito i crediti del mese e riprovare non cambierà nulla.
      const quota = body?.error?.code === 'GENERATIVE_QUOTA_EXCEEDED';
      return { ok: false, reason: quota ? 'quota' : 'technical' };
    }
    return { ok: true, ...body.data };
  } catch {
    return { ok: false, reason: 'technical' }; // rete, timeout, abort
  }
}

/**
 * Invia una segnalazione qualità del risultato try-on (Story 12.4 / AC3).
 * POST /api/widget/tryon-report, FIRE-AND-FORGET: `keepalive: true` +
 * `.catch(() => {})`, MAI `await`-ata sul percorso UI (pattern `sendConsentEvent`).
 *
 * `resultId` è opzionale (nullable sul backend): il Report funziona anche sul
 * fallback overlay (nessun resultId disponibile quando il generativo non è
 * stato usato). La conferma è OTTIMISTICA lato client (il widget mostra
 * "Grazie per la segnalazione" senza attendere la risposta di rete).
 */
export function sendTryonReport(
  apiKey: string,
  baseUrl: string,
  resultId: string | null,
  reason?: string,
): void {
  const sanitizedBase = baseUrl.replace(/\/+$/, '');
  const url = `${sanitizedBase}/api/widget/tryon-report`;

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    keepalive: true,
    body: JSON.stringify({
      api_key: apiKey,
      resultId: resultId ?? null,
      reason: reason ?? null,
    }),
  }).catch(() => {});
}

/**
 * Segna la sessione widget come completata (Story 7.4 / AC2, ri-cablata
 * 2026-07-15): l'acquirente ha raggiunto il risultato del try-on. Alimenta la
 * metrica di conversione (dashboard/API v1/MCP) e il webhook `session.completed`.
 *
 * POST /api/widget/session/complete, FIRE-AND-FORGET: `keepalive: true` +
 * `.catch(() => {})`, MAI `await`-ata sul percorso UI (pattern sendTryonReport).
 * Un fallimento qui non deve mai toccare l'esperienza dell'acquirente: al
 * peggio la conversione non viene contata (under-counting a favore di nessuno).
 */
export function notifySessionComplete(
  apiKey: string,
  baseUrl: string,
  sessionId: string,
): void {
  const sanitizedBase = baseUrl.replace(/\/+$/, '');
  const url = `${sanitizedBase}/api/widget/session/complete`;

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    keepalive: true,
    body: JSON.stringify({
      api_key: apiKey,
      session_id: sessionId,
    }),
  }).catch(() => {});
}

/**
 * Genera un `session_ref` casuale ex-novo (AD-1) in modo DIFENSIVO: usa
 * `crypto.randomUUID()` quando disponibile, ma NON lancia se manca (contesto
 * non-secure / http, browser datato). Il session_ref deve solo essere casuale e
 * non-identificante (AD-1) — non crittograficamente forte — quindi il fallback
 * non-crypto è adeguato. [code review 12.1 — un throw qui congelava il gate]
 */
function randomSessionRef(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // crypto.randomUUID può lanciare in contesto non-secure → fallback sotto.
  }
  return `sref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Notifica un evento di consenso foto (dato/revocato/rinnovato) al log
 * server-side non identificante (Story 12.1 / CAP-7, AD-4).
 * POST /api/widget/consent-event, FIRE-AND-FORGET: `keepalive: true` +
 * `.catch(() => {})`, MAI `await`-ata sul percorso del gate (AD-4) — un
 * fallimento qui non deve mai bloccare o rallentare il consenso/generativo.
 *
 * Il `session_ref` è generato QUI (nel widget, AD-1) via `randomSessionRef()`
 * difensivo: il chiamante non passa più un UUID, così un `crypto.randomUUID()`
 * che lancia (contesto non-secure) non può congelare il percorso del gate.
 */
export function sendConsentEvent(
  apiKey: string,
  baseUrl: string,
  payload: { consentVersion: number; eventType: 'given' | 'revoked' },
): void {
  const sanitizedBase = baseUrl.replace(/\/+$/, '');
  const url = `${sanitizedBase}/api/widget/consent-event`;

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    keepalive: true,
    body: JSON.stringify({
      api_key: apiKey,
      sessionRef: randomSessionRef(),
      consentVersion: payload.consentVersion,
      eventType: payload.eventType,
    }),
  }).catch(() => {});
}

/**
 * Notifica l'inizio di una sessione widget al backend.
 * POST /api/widget/session con api_key.
 *
 * Story 5.2: se il piano ha raggiunto il 100%, il backend restituisce
 * SESSION_LIMIT_REACHED e il Widget NON deve essere renderizzato.
 *
 * Restituisce { ok: false, errorCode } se il limite è raggiunto o c'è un errore.
 * Restituisce { ok: true, sessionId } se la sessione è stata creata.
 */
export async function notifySessionStart(
  apiKey: string,
  baseUrl = '',
): Promise<SessionStartResult> {
  try {
    const sanitizedBase = baseUrl.replace(/\/+$/, '');
    const url = `${sanitizedBase}/api/widget/session`;

    // POST con Content-Type text/plain (CORS-safelisted) → nessun preflight
    // cross-origin; api_key nel body, mai in query (pattern garment-views).
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ api_key: apiKey }),
      },
      10_000,
    );

    const body: ApiResponse<{ session_id: string }> = await res.json().catch(() => null);

    if (!res.ok || body?.error) {
      const code = body?.error?.code ?? 'INTERNAL_ERROR';
      console.error(`[widget] error=${code}`);
      return { ok: false, errorCode: code };
    }

    return { ok: true, sessionId: body?.data?.session_id };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.error('[widget] error=TIMEOUT');
    } else {
      console.error('[widget] error=INTERNAL_ERROR');
    }
    return { ok: false, errorCode: 'INTERNAL_ERROR' };
  }
}
