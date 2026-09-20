/** Formati immagine supportati per upload.
 *  HEIC/HEIF sono qui perché **alcuni browser li decodificano davvero** (Safari
 *  17+, macOS Sonoma e iOS 17): su quelli la pipeline canvas li normalizza in
 *  WebP come qualsiasi altro formato, senza una riga di codice in più. Dove il
 *  browser non sa decodificarli, `new Image()` fallisce e l'acquirente riceve il
 *  messaggio dedicato `heic_unsupported` — mai quello generico (Story 12.6:
 *  si prova, si rifiuta solo se il browser dice di no). */
export const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

/** Limite dimensione file in byte (10MB) */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

/** Soglie per indicatore qualità (in pixel totali) */
const QUALITY_THRESHOLD_OPTIMAL = 1_000_000; // ≥1MP → Ottima
const QUALITY_THRESHOLD_SUFFICIENT = 400_000; // ≥400KP → Sufficiente, <400KP → Bassa

export type PhotoQuality = 'optimal' | 'sufficient' | 'low';

export interface PhotoValidationResult {
  valid: boolean;
  error?: 'unsupported_format' | 'file_too_large';
}

export interface PhotoQualityResult {
  quality: PhotoQuality;
  width: number;
  height: number;
}

/** Verifica che il MIME type del file sia tra quelli supportati */
export function isSupportedMimeType(mimeType: string): mimeType is SupportedMimeType {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(mimeType);
}

/**
 * Predicato puro HEIC/HEIF. Guarda ANCHE l'estensione perché molti OS non
 * valorizzano `file.type` per l'HEIC (arriva vuoto o `application/octet-stream`):
 * fidarsi del solo mime lascerebbe passare il file fino a `new Image()`, dove
 * fallisce senza spiegazioni.
 *
 * `startsWith` invece dell'uguaglianza: i mime IANA includono
 * `image/heic-sequence` e `image/heif-sequence` (Live Photos e burst iPhone).
 * Estensioni: `.heic`/`.heif`, le sequenze `.heics`/`.heifs`, e `.hif` (HEIF di
 * Canon e Fujifilm).
 */
export function isHeicFile(name: string, mimeType: string): boolean {
  return (
    mimeType.startsWith('image/heic') ||
    mimeType.startsWith('image/heif') ||
    /\.(hei[cf]s?|hif)$/i.test(name)
  );
}

/** Valida formato e dimensione del file. Ritorna risultato della validazione. */
export function validatePhotoFile(file: File): PhotoValidationResult {
  // HEIC/HEIF: accettati qui e lasciati provare (Safari 17+ li decodifica). Se il
  // browser non ce la fa, `handleFile` intercetta l'errore di decodifica e mostra
  // il messaggio dedicato — vedi `isHeicFile` per il perché del predicato.
  if (!isSupportedMimeType(file.type) && !isHeicFile(file.name, file.type)) {
    return { valid: false, error: 'unsupported_format' };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: 'file_too_large' };
  }
  return { valid: true };
}

/**
 * Legge un File come data URL (base64).
 * La foto rimane in memoria locale — mai trasmessa ai server.
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Stima la qualità della foto in base alle dimensioni dell'immagine.
 * Carica l'immagine per ottenere larghezza/altezza reali.
 */
export function assessPhotoQuality(dataUrl: string): Promise<PhotoQualityResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const pixels = img.naturalWidth * img.naturalHeight;
      let quality: PhotoQuality;
      if (pixels >= QUALITY_THRESHOLD_OPTIMAL) {
        quality = 'optimal';
      } else if (pixels >= QUALITY_THRESHOLD_SUFFICIENT) {
        quality = 'sufficient';
      } else {
        quality = 'low';
      }
      // Cleanup: revoca l'URL se usato (non necessario per data URL ma safe)
      resolve({ quality, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => reject(new Error('Failed to load image for quality assessment'));
    img.src = dataUrl;
  });
}

/** Etichette localizzate per i livelli di qualità */
export function getQualityLabel(quality: PhotoQuality, locale: Record<string, string>): string {
  const key = `photo.quality_${quality}`;
  return locale[key] ?? quality;
}

// ── Resize client-side (2026-07-31, bug PHOTO_TOO_LARGE) ────────────────────
// Le foto da telefono (2-8MB) diventano 3-11M caratteri base64: la route
// estimate-measures rifiuta oltre 1,5M char (400 PHOTO_TOO_LARGE) e oltre ~4,5MB
// il body sbatte sul limite della piattaforma Vercel (413 su tryon-generative).
// Risultato: la stima misure falliva SEMPRE sulle foto reali e il try-on era a
// rischio. Il resize avviene UNA volta, qui: photoData è gestibile per tutti i
// consumatori (AI Vision, FASHN).
// ⚠️ 2026-08-04 — il limite di 1,5M caratteri della route resta la ragione
// principale; il vincolo "MediaPipe sfora i 4s" citato qui non esiste più,
// MediaPipe è stato rimosso (vedi `docs/wiki/stima-misure.md`).

/** Lato lungo massimo della foto dopo il resize.
 *
 *  ⚠️ 2026-09-11 — da 1600 a **2048**. I 1600 erano tarati su FASHN, che aveva
 *  un tetto interno a ~1,1 MP. `p-image-try-on` di Pruna restituisce la
 *  **risoluzione dell'input**: misurato l'11/09, 1363×2048 in ingresso dà
 *  1363×2048 in uscita nello stesso tempo del 1154 (5,7-6,5 s contro 5,4-6,4) e
 *  con la stampa del capo intatta — dove l'upscale la ridisegnava. Qui si decide
 *  quindi la risoluzione del risultato, preset comprese (1360×2048).
 *  La stima misure resta a 1024 (`MEASURE_MAX_EDGE_PX`). */
export const PHOTO_MAX_EDGE_PX = 2048;
/**
 * Lato lungo della foto inviata alla STIMA MISURE, più corto di quello usato per
 * il try-on.
 *
 * ⚠️ 2026-08-04 — non è un'ottimizzazione, è la correzione di un difetto. A
 * 1600px la vision impiega ~5,3s, e il primo provider ha ~7s di budget prima che
 * scatti il failover: ogni tanto sforava e a rispondere era un **secondo modello**,
 * con misure sue. Da qui il sintomo «la stima balla fra una prova e l'altra»
 * (fino a ±20 cm, più di una taglia). A 1024px la latenza scende a ~3,3s e il
 * margine raddoppia.
 *
 * Misurato: a 1024 le stime sono **identiche** a quelle a 1600 (178/92/76-78/90
 * sulla stessa foto). ⚠️ Sotto i 768 **cambiano** (180-185/95-98/…): non scendere.
 * FASHN continua a ricevere la foto piena — lì la risoluzione serve davvero.
 */
export const MEASURE_MAX_EDGE_PX = 1024;
/** Qualità JPEG della ricodifica dopo il resize (fallback quando manca il WebP). */
export const PHOTO_JPEG_QUALITY = 0.85;
/** Qualità WebP della ricodifica dopo il resize (formato preferito, Story 12.6):
 *  −17% sul peso rispetto al JPEG a parità di foto, misurato nel pre-check. */
export const PHOTO_WEBP_QUALITY = 0.85;
/** Oltre questa lunghezza la foto normalizzata si avvicina al limite più stretto
 *  che incontra: il corpo di `tryon-generative`, ~4,5 MB sulla piattaforma Vercel.
 *  Serve solo a dirlo nel log (vedi la post-condizione in `downscalePhotoDataUrl`).
 *  ⚠️ 2026-09-11 — era 1,2M, tarato sul limite di `estimate-measures` (1,5M char):
 *  ma alla stima misure la foto arriva a 1024 px, ben sotto; a 2048 px una foto
 *  normale supera 1,2M e il log avrebbe gridato al lupo a ogni prova. */
const DATA_URL_SAFE_LENGTH = 4_000_000;

/**
 * Dimensioni ridotte per stare entro `maxEdge` preservando l'aspect ratio.
 * Funzione pura (testabile): se già entro il limite ritorna le dimensioni invariate.
 */
export function fitWithinMaxEdge(
  width: number,
  height: number,
  maxEdge: number = PHOTO_MAX_EDGE_PX,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest <= 0) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Esito del feature-detect WebP, valutato una sola volta per sessione. */
let webpEncodeSupported: boolean | null = null;

/**
 * Il browser sa CODIFICARE in WebP?
 *
 * Va verificato sull'OUTPUT, mai sulla richiesta: la spec di `toDataURL` impone
 * il fallback SILENZIOSO a PNG quando il formato chiesto non è supportato — nessun
 * errore, nessun avviso, e un PNG non compresso al posto di un WebP leggero.
 * (Encode WebP: Chrome 50+, Firefox 96+, Safari 16+.)
 */
export function supportsWebpEncode(): boolean {
  if (webpEncodeSupported === null) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      webpEncodeSupported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
    } catch {
      webpEncodeSupported = false; // niente canvas (jsdom, browser vecchi)
    }
  }
  return webpEncodeSupported;
}

/** Il formato in cui normalizziamo ogni foto: WebP se il browser lo codifica,
 *  JPEG altrimenti (comportamento di PR #20). */
export function preferredPhotoMime(): 'image/webp' | 'image/jpeg' {
  return supportsWebpEncode() ? 'image/webp' : 'image/jpeg';
}

/** Codifica un canvas nel formato normalizzato. Usata sia dal resize sia dallo
 *  scatto camera, così il formato in uscita è uno solo, deciso in un punto solo. */
export function encodePhotoCanvas(canvas: HTMLCanvasElement): string {
  return supportsWebpEncode()
    ? canvas.toDataURL('image/webp', PHOTO_WEBP_QUALITY)
    : canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY);
}

/**
 * Normalizza un data URL immagine: lato lungo entro `maxEdge` e ricodifica nel
 * formato preferito (WebP, JPEG di riserva). Ritorna il data URL originale solo
 * se è GIÀ nel formato preferito ed entro i limiti di dimensioni e peso, o se il
 * canvas non è disponibile (fallback sicuro: comportamento precedente).
 */
export function downscalePhotoDataUrl(
  dataUrl: string,
  maxEdge: number = PHOTO_MAX_EDGE_PX,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = fitWithinMaxEdge(img.naturalWidth, img.naturalHeight, maxEdge);
      // 🔑 **Ogni foto passa dal canvas, senza scorciatoie.** Fino al 16/08 qui
      // c'era una via veloce: foto già alle dimensioni giuste, già sotto il
      // limite di peso e già nel formato di uscita → si restituiva l'originale
      // senza ricodificarlo. Risparmiava una codifica e **conservava gli EXIF**,
      // coordinate GPS comprese: una foto scattata col telefono può portarsi
      // dietro il luogo dello scatto, e da qui la foto parte verso un file
      // storage negli Stati Uniti (vedi il TIA in
      // `_bmad-output/specs/spec-e12-prep-consenso-gdpr-dpa/tia-pruna-usa.md`).
      //
      // `drawImage` + `toDataURL` ricostruiscono l'immagine dai soli pixel:
      // **nessun metadato sopravvive**. È la misura di minimizzazione su cui
      // poggia la valutazione del trasferimento, e un'eccezione la annullava.
      //
      // ⚠️ Non è nemmeno un risparmio che si vedeva: gli asset delle modelle
      // preset sono `.jpg` e il formato di uscita è WebP, quindi la via veloce
      // non scattava per loro. Scattava per una foto **dell'utente** già nel
      // formato giusto — cioè esattamente nel caso in cui i metadati ci sono.
      // Tutto il blocco canvas sta in un try: un throw qui dentro avverrebbe
      // FUORI dall'esecutore della Promise (siamo in un handler onload), quindi
      // non risolverebbe né rifiuterebbe nulla — `await` resterebbe appeso per
      // sempre, senza anteprima, senza errore e senza log.
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // Tenere l'originale è l'unica opzione, ma va detto: se la foto è
          // grande, a valle diventerà un PHOTO_TOO_LARGE che nessuno collega a qui.
          console.error(
            `[cabina] canvas non disponibile: foto non normalizzata (${dataUrl.length} char)`,
          );
          resolve(dataUrl);
          return;
        }
        // Il JPEG non ha canale alfa: senza questo riempimento `toDataURL`
        // compone la trasparenza su NERO. Riempire prima costa una chiamata e
        // vale anche per il WebP (che l'alfa la conserva, ma su bianco).
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const encoded = encodePhotoCanvas(canvas);
        // Post-condizione: questa funzione esiste per stare sotto il limite della
        // route. Se non ci riesce (immagine ad altissima entropia), dirlo qui è
        // l'unico modo per non doverlo dedurre da un `{}` lato client.
        if (encoded.length > DATA_URL_SAFE_LENGTH) {
          console.error(
            `[cabina] foto normalizzata ancora pesante: ${encoded.length} char (soglia ${DATA_URL_SAFE_LENGTH})`,
          );
        }
        resolve(encoded);
      } catch (e) {
        console.error('[cabina] normalizzazione foto fallita, uso l\'originale:', e);
        resolve(dataUrl);
      }
    };
    img.onerror = () => reject(new Error('Failed to load image for downscale'));
    img.src = dataUrl;
  });
}