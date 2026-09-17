/**
 * Story 12.4 — Azioni sul risultato: salva, condividi, segnala (AC3).
 *
 * Factory DOM `createResultActions` — 3 bottoni. Pattern `model-gallery.ts`
 * (12.2): nessuna libreria, stili inline, vanilla DOM.
 *
 * Decisioni chiave (Dev Notes):
 * - **Salva**: download client-side puro (blob cross-origin, nessun backend).
 * - **Condividi**: `navigator.share({ files: [...] })` con il FILE immagine,
 *   non l'URL (signed URL Supabase TTL 1h → si romperebbe entro un'ora sui
 *   social). Fallback al download se Web Share API non supporta i file.
 * - **Segnala**: fire-and-forget a `/api/widget/tryon-report` + conferma
 *   OTTIMISTICA immediata (non attende la rete, NFR-12).
 * - Mai condividere/salvare la signed URL diretta oltre la sessione corrente.
 *
 * Code review 12.4: `updateResult(url, resultId)` permette allo swap capo
 * (Task 2/`tryon-overlay.ts`) di aggiornare l'immagine e il resultId usati da
 * queste azioni senza ricostruire il componente — stesso pattern di
 * `updateGenerated` in `reveal-slider.ts`.
 */

import { sendTryonReport } from '../../api/widget-api';

/** Timeout per il fetch del blob immagine (Salva/Condividi) — evita bottoni bloccati a tempo indeterminato su una fetch cross-origin appesa. */
const FETCH_BLOB_TIMEOUT_MS = 15_000;

export interface ResultActionsStrings {
  save: string;
  share: string;
  report: string;
  reportConfirm: string;
}

export interface ResultActionsCallbacks {
  /** Fornisce apiKey e baseUrl per la chiamata fire-and-forget del report. */
  getApiContext: () => { apiKey: string; baseUrl: string };
}

/** Estensione file dal content-type del blob (fallback png se sconosciuto/assente). */
function extensionFromMime(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('webp')) return 'webp';
  return 'png';
}

/**
 * Scarica un'immagine cross-origin come Blob (per Salva/Condividi).
 * `generatedUrl` è una signed URL Supabase cross-origin: l'attributo `download`
 * su un `<a>` viene ignorato dal browser per il cross-origin, quindi serve
 * fetchare il blob e creare un object URL. Timeout esplicito: una fetch
 * appesa non deve lasciare i bottoni bloccati senza feedback.
 */
async function fetchImageBlob(url: string): Promise<Blob> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_BLOB_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Download fallito: HTTP ${res.status}`);
    return await res.blob();
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Scarica un'immagine via blob e triggera il download client-side.
 * Fallback difensivo: se il fetch fallisce (CORS, rete, timeout), prova
 * l'`<a download>` diretto (funziona solo same-origin, ma è meglio di niente).
 * Il nome file usa l'estensione reale del blob, non un'ipotesi fissa.
 */
async function downloadImage(url: string, filenameBase: string): Promise<void> {
  try {
    const blob = await fetchImageBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `${filenameBase}.${extensionFromMime(blob.type)}`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Cleanup ritardato (il click è async)
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    }, 100);
  } catch {
    // Fallback: <a download> diretto (same-origin o browser permissivo).
    // Nessun blob disponibile qui → estensione ignota, .png come default ragionevole.
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenameBase}.png`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => document.body.removeChild(a), 100);
  }
}

type ShareOutcome = 'shared' | 'cancelled' | 'unsupported';

/**
 * Condivide un'immagine via Web Share API con il FILE (non l'URL).
 * Distingue "annullato dall'utente" (AbortError sulla share sheet nativa, NON
 * un errore, nessun fallback) da "non supportato/fallito" (il chiamante fa
 * fallback al download) — un annullamento intenzionale non deve innescare un
 * download automatico indesiderato (code review 12.4).
 */
async function shareImageFile(url: string, filenameBase: string): Promise<ShareOutcome> {
  // Verifica supporto Web Share API con file
  if (typeof navigator === 'undefined' || !navigator.share) return 'unsupported';
  if (!navigator.canShare) return 'unsupported';

  try {
    const blob = await fetchImageBlob(url);
    const file = new File([blob], `${filenameBase}.${extensionFromMime(blob.type)}`, { type: blob.type || 'image/png' });
    if (!navigator.canShare({ files: [file] })) return 'unsupported';
    await navigator.share({ files: [file] });
    return 'shared';
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}

/**
 * Crea la fila di azioni come DocumentFragment.
 *
 * @param generatedUrl URL iniziale dell'immagine Generated (signed URL Supabase)
 * @param resultId ID iniziale della generazione (nullable per fallback overlay)
 * @param strings Etichette localizzate
 * @param callbacks Callback per il contesto API (report fire-and-forget)
 * @returns `{ fragment, updateResult }` — il fragment da appendere + una
 *          funzione per aggiornare URL/resultId dopo uno swap capo (Task 2),
 *          stesso pattern di `updateGenerated` in `reveal-slider.ts`.
 */
export function createResultActions(
  generatedUrl: string,
  resultId: string | null,
  strings: ResultActionsStrings,
  callbacks: ResultActionsCallbacks,
): {
  fragment: DocumentFragment;
  updateResult: (url: string, newResultId: string | null) => void;
} {
  const fragment = document.createDocumentFragment();

  // Stato mutabile aggiornato da `updateResult` — i click handler leggono
  // sempre il valore corrente, non quello catturato alla creazione.
  let currentUrl = generatedUrl;
  let currentResultId = resultId;

  const container = document.createElement('div');
  container.setAttribute('data-cabina-result-actions', '');
  container.style.cssText = [
    'display:flex',
    'gap:8px',
    'justify-content:center',
    'padding:12px',
    'background:rgba(0,0,0,0.6)',
    'backdrop-filter:blur(8px)',
    '-webkit-backdrop-filter:blur(8px)',
    'border-radius:8px',
  ].join(';');

  const filenameBase = `cabina-tryon-${Date.now()}`;

  // ── Salva ──
  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.setAttribute('data-cabina-action-save', '');
  saveBtn.textContent = strings.save;
  saveBtn.style.cssText = buttonStyle();
  saveBtn.addEventListener('click', async () => {
    if (saveBtn.disabled) return; // guard re-entrancy: click ripetuti durante il download
    saveBtn.disabled = true;
    saveBtn.style.opacity = '0.6';
    try {
      await downloadImage(currentUrl, filenameBase);
    } finally {
      saveBtn.disabled = false;
      saveBtn.style.opacity = '1';
    }
  });
  container.appendChild(saveBtn);

  // ── Condividi ──
  const shareBtn = document.createElement('button');
  shareBtn.type = 'button';
  shareBtn.setAttribute('data-cabina-action-share', '');
  shareBtn.textContent = strings.share;
  shareBtn.style.cssText = buttonStyle();
  shareBtn.addEventListener('click', async () => {
    if (shareBtn.disabled) return; // guard re-entrancy
    shareBtn.disabled = true;
    shareBtn.style.opacity = '0.6';
    try {
      const outcome = await shareImageFile(currentUrl, filenameBase);
      // Fallback al download SOLO se non supportato/fallito — un annullamento
      // intenzionale dell'utente (share sheet chiusa) non deve innescare un
      // download automatico indesiderato (code review 12.4).
      if (outcome === 'unsupported') {
        await downloadImage(currentUrl, filenameBase);
      }
    } finally {
      shareBtn.disabled = false;
      shareBtn.style.opacity = '1';
    }
  });
  container.appendChild(shareBtn);

  // ── Segnala ──
  const reportBtn = document.createElement('button');
  reportBtn.type = 'button';
  reportBtn.setAttribute('data-cabina-action-report', '');
  reportBtn.textContent = strings.report;
  reportBtn.style.cssText = buttonStyle();
  reportBtn.addEventListener('click', () => {
    if (reportBtn.disabled) return;
    // Conferma OTTIMISTICA immediata (non attende la rete, NFR-12)
    reportBtn.textContent = strings.reportConfirm;
    reportBtn.disabled = true;
    reportBtn.style.opacity = '0.6';

    // Fire-and-forget (pattern sendConsentEvent) — mai await-ata sul percorso UI.
    const { apiKey, baseUrl } = callbacks.getApiContext();
    sendTryonReport(apiKey, baseUrl, currentResultId);
  });
  container.appendChild(reportBtn);

  fragment.appendChild(container);

  return {
    fragment,
    updateResult: (url: string, newResultId: string | null) => {
      currentUrl = url;
      currentResultId = newResultId;
    },
  };
}

/**
 * Lo stile dei bottoni sulla barra del risultato.
 *
 * 📌 `primario` è pieno e non traslucido: serve all'«aggiungi al carrello», che
 * non è un'azione pari alle altre tre — salva, condividi e segnala si fanno
 * dopo aver deciso, quello *è* la decisione. Senza distinzione sarebbe il
 * quarto bottone identico di una fila, cioè invisibile.
 *
 * ⚠️ Esportata perché la usa anche `add-to-cart.ts`: un bottone costruito
 * altrove ma appeso alla stessa barra deve vestirsi uguale, e finché lo stile è
 * rimasto privato quel bottone è nato **senza stile**, con l'aspetto di
 * default del browser accanto a tre bottoni curati (rilievo Kilo).
 */
export function buttonStyle(opzioni: { primario?: boolean } = {}): string {
  return [
    'padding:8px 16px',
    opzioni.primario ? 'background:#fff' : 'background:rgba(255,255,255,0.15)',
    opzioni.primario ? 'color:#111' : 'color:#fff',
    opzioni.primario ? 'border:1px solid #fff' : 'border:1px solid rgba(255,255,255,0.3)',
    'border-radius:6px',
    'font-size:13px',
    opzioni.primario ? 'font-weight:600' : 'font-weight:500',
    'cursor:pointer',
    'transition:background 0.15s ease',
  ].join(';');
}