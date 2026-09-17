import { PhotoConsentSchema, type PhotoConsentState } from '@cabina/shared';

// Consenso GDPR foto (Story 12.1 / CAP-1, CAP-2, CAP-6) — persistenza on-device,
// versionata e revocabile. Chiave e schema SEPARATI dal consenso misure/AI
// generico (`consent.*`, Story 3.1): stessa STILE di `measurements-storage.ts`
// (validazione Zod in lettura/scrittura, auto-pulizia corrotti), MAI la stessa
// chiave — il consenso foto riguarda l'invio della foto intera a un provider
// esterno (PrunaAI), un trattamento distinto e più sensibile. Lo schema Zod vive
// in `@cabina/shared` (pattern `MeasuresSchema`/`measurements-storage.ts`): zod
// è già nel bundle widget tramite quello, nessun peso aggiuntivo di libreria.
const STORAGE_PREFIX = 'cabina_photo_consent_';

/**
 * Versione corrente del testo di consenso foto (CAP-6). Bump manuale quando il
 * testo (i18n `photo_consent.*`) o il provider esterno cambiano — un consenso
 * dato su una versione precedente NON è più valido (vedi `isPhotoConsentValid`).
 *
 * ⚠️ 2026-08-22 — **4: Novita riceve anche il RISULTATO, per un secondo scopo.**
 * Dopo la generazione un giudice vision confronta la foto del capo con
 * l'immagine prodotta — cioè la sembianza dell'acquirente col capo addosso — per
 * accorgersi dei sorteggi sbagliati del motore prima che restino in cache
 * (`apps/dashboard/src/lib/tryon-judge.ts`). Il testo v3 nominava Novita «per
 * stimare le misure» e basta: chi l'ha accettato ha autorizzato un'immagine
 * diversa per uno scopo diverso. Non è un guasto, quindi nessun log lo direbbe:
 * l'unica difesa è questo numero, che la route confronta (`consentVersion >= 4`,
 * o modella preset) prima di far guardare il risultato al giudice. Chi cambia
 * ancora il testo o lo scopo alza il numero QUI e la soglia LÀ, insieme.
 *
 * ⚠️ 2026-08-17 — **3: il consenso diventa UNO e copre un trattamento in più.**
 * Fino a ieri erano due schermate: una modale «Consenso Privacy» che spostava
 * soltanto allo step successivo — **nessuna versione, nessun `consent_events`,
 * nessun blocco** — e questo gate, l'unico registrato, ma chiesto solo prima di
 * PrunaAI. In mezzo, entrando nello step misure, la foto partiva già verso il
 * servizio di **visione**: un trasferimento coperto solo dal consenso che non
 * lasciava traccia. Ora la spunta sta sulla schermata foto, **prima che la foto
 * lasci il dispositivo**, e il testo nomina **entrambi** i destinatari. Chi aveva
 * dato il consenso v2 ha autorizzato meno di quanto questo testo dichiara:
 * ridarlo non è una formalità.
 *
 * ⚠️ 2026-08-15 — **2: cambia il destinatario della foto**, non il testo. Il
 * try-on passa da FASHN/fal.ai a `p-image try-on` di PrunaAI
 * (`apps/rendering/src/routers/tryon.py`, `TRYON_PROVIDER`). Chi aveva già
 * acconsentito ha autorizzato fal.ai e nessun altro: senza questo bump la sua
 * foto partirebbe verso un destinatario mai nominato, e non se ne accorgerebbe
 * nessuno — non è un guasto, quindi non c'è log che lo segnali.
 *
 * Il testo sta in `apps/widget/src/i18n/*.json`, cinque lingue. La copia servita
 * in pagina (`/locales/{lang}.json`) è un artefatto di build — `copy-locales` in
 * `vite.config.ts` più il `prebuild` del dashboard — quindi non c'è nulla da
 * sincronizzare a mano. `i18n/locales-allineati.test.ts` verifica che tutte e
 * cinque nominino il fornitore giusto.
 */
export const CURRENT_PHOTO_CONSENT_VERSION = 4;

export type { PhotoConsentState };

function getKey(apiKey: string): string {
  return `${STORAGE_PREFIX}${apiKey}`;
}

/** Persiste la decisione di consenso foto in localStorage. */
export function savePhotoConsent(apiKey: string, given: boolean): void {
  try {
    const key = getKey(apiKey);
    const state: PhotoConsentState = { given, version: CURRENT_PHOTO_CONSENT_VERSION };
    localStorage.setItem(key, JSON.stringify(state));
  } catch (e) {
    // localStorage pieno o non disponibile (es. incognito mode in alcuni browser).
    console.warn('[widget] Failed to save photo consent to localStorage', e);
  }
}

/** Carica lo stato di consenso foto. `null` se assente, corrotto o non conforme. */
export function loadPhotoConsent(apiKey: string): PhotoConsentState | null {
  const key = getKey(apiKey);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn('[widget] Corrupted JSON in localStorage, clearing key', key);
      localStorage.removeItem(key);
      return null;
    }

    const result = PhotoConsentSchema.safeParse(parsed);
    if (!result.success) {
      console.warn('[widget] Corrupted photo consent in localStorage, clearing', result.error);
      localStorage.removeItem(key);
      return null;
    }
    return result.data;
  } catch (e) {
    console.warn('[widget] Failed to load photo consent from localStorage', e);
    return null;
  }
}

/** Azione "Dimentica il consenso" (CAP-6) — rimuove la decisione persistita. */
export function clearPhotoConsent(apiKey: string): void {
  try {
    const key = getKey(apiKey);
    localStorage.removeItem(key);
  } catch (e) {
    console.warn('[widget] Failed to clear photo consent from localStorage', e);
  }
}

/**
 * Predicato puro: il consenso è valido SOLO se dato esplicitamente (`given === true`)
 * E riferito alla versione corrente del testo (CAP-6) — un consenso su una
 * versione superata (testo o provider cambiati) non è più valido, il gate
 * ricompare. Nessun accesso a localStorage: solo la decisione, testabile in isolamento.
 *
 * Questo predicato è anche il gate FAIL-CLOSED del try-on generativo (CAP-1): la
 * foto è inviata a fal.ai (`tryonGenerative`) SOLO quando ritorna `true`. Il
 * call-site in `widget.ts` (case 'rendering') è un semplice ternario su questo
 * valore — l'invariante "invio a fal ⟺ consenso valido" vive qui.
 */
export function isPhotoConsentValid(stored: PhotoConsentState | null): boolean {
  return stored != null && stored.given === true && stored.version === CURRENT_PHOTO_CONSENT_VERSION;
}

/** Origine dell'immagine passata al motore try-on (Story 12.2). */
export type PhotoIdentityMode = 'user_photo' | 'preset_model' | null;

/**
 * Predicato puro, FAIL-CLOSED: la foto dell'acquirente va al generativo **solo**
 * con un consenso valido. **Solo** la modella preset (immagine Cabina, nessuna
 * foto personale sul dispositivo) non ne ha bisogno; qualsiasi altro valore —
 * `'user_photo'` **e anche `null`/non-scelto** — richiede il consenso.
 *
 * ⚠️ 2026-08-17 — sostituisce `decidePhotoConsentGate` + `shouldShowPhotoConsentGate`,
 * che decidevano anche *se mostrare una schermata di gate*: quella schermata non
 * esiste più, il consenso si dà con la spunta sulla schermata foto. Resta un
 * predicato perché **questo è l'invariante GDPR più sensibile del widget**, e non
 * deve dipendere da un ramo di `renderState` che nessun test copre: qui si prova
 * in isolamento.
 */
export function shouldAttemptGenerative(
  identityMode: PhotoIdentityMode,
  stored: PhotoConsentState | null,
): boolean {
  if (identityMode === 'preset_model') return true;
  return isPhotoConsentValid(stored);
}
