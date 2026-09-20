import { WIDGET_LANGUAGES, type WidgetLanguage } from '@cabina/shared';

// ── Types ──────────────────────────────────────────────────────────────────

export interface LocaleDict {
  common: {
    back: string;
  };
  error: {
    timeout: string;
    invalid_api_key: string;
    internal_error: string;
    invalid_json: string;
    config_not_loaded: string;
  };
  photo: {
    title: string;
    posture_hint: string;
    upload_button: string;
    file_too_large: string;
    unsupported_format: string;
    heic_not_supported: string;
    quality_optimal: string;
    quality_sufficient: string;
    quality_low: string;
    /** Il consenso vive QUI dal 2026-08-17: una spunta sulla schermata foto,
     *  prima che la foto lasci il dispositivo. Prima erano due schermate, e
     *  quella che veniva per prima non registrava niente. */
    consent_text: string;
    consent_terms_label: string;
    consent_privacy_label: string;
    consent_required: string;
  };
   form: {
     title: string;
     height: string;
     weight: string;
     bust: string;
     waist: string;
     hips: string;
     confirm: string;
     cancel: string;
     auto_detected: string;
     detection_failed: string;
     detection_unavailable: string;
     detecting: string;
     detecting_ai: string;
     ai_detected: string;
     invalid_height: string;
     invalid_weight: string;
     invalid_bust: string;
     invalid_waist: string;
     invalid_hips: string;
     height_calibration_hint: string;
   };
  rendering: {
    loading: string;
    /** Guasto tecnico: riprovare ha senso. */
    unavailable: string;
    /** Crediti del merchant esauriti: riprovare NON serve a nulla. */
    quota_exceeded: string;
    /** Consenso foto negato: la via d'uscita è la modella preset. */
    consent_required: string;
  };
  tryon: {
    close: string;
    rotate_hint: string;
  };
  size: {
    recommended: string;
    recommended_label: string;
    not_available: string;
    between: string;
  };
  browser: {
    unsupported_title: string;
    unsupported_message: string;
    update_link_text: string;
  };
  model_gallery: {
    or_label: string;
    title: string;
    subtitle: string;
    /** Intestazioni dei due gruppi della galleria (set a 8 modelli, 2026-07-26). */
    gender_female: string;
    gender_male: string;
    body_slim: string;
    body_regular: string;
    body_curvy: string;
    /** "Curvy" è femminile in più lingue: il maschile ha la sua etichetta. */
    body_curvy_male: string;
    body_plus: string;
    /** Seconda schermata della galleria (32 modelle per fascia d'età, 2026-09-18). */
    more_button: string;
    more_title: string;
    more_subtitle: string;
    load_error: string;
  };
  garment_select: {
    title: string;
    default_action: string;
    browse_label: string;
    add_to_mix: string;
    remove: string;
    apply: string;
    mix_limit_reached: string;
    loading: string;
    error: string;
  };
  reveal_result: {
    add_to_cart: string;
    save: string;
    share: string;
    report: string;
    report_confirm: string;
    select_style_label: string;
    slider_label: string;
    original_alt: string;
    generated_alt: string;
  };
}

// ── Constants ──────────────────────────────────────────────────────────────


const localeCache = new Map<WidgetLanguage, LocaleDict>();
const inFlightLocales = new Map<WidgetLanguage, Promise<LocaleDict>>();

let currentLocale: LocaleDict | null = null;
let currentLocaleLang: WidgetLanguage | null = null;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Da un tag di lingua (`ja-JP`, `pt-PT`, `id`) alla lingua del widget, o `null`.
 *
 * Due casi speciali (18/09/2026): del portoghese abbiamo solo il brasiliano, e
 * lo serviamo a qualunque portoghese — a un lettore portoghese si legge bene,
 * meglio dell'inglese; e `in` è il vecchio codice ISO dell'indonesiano, che
 * alcuni Android mandano ancora al posto di `id`.
 */
function linguaDelWidget(tag: string): WidgetLanguage | null {
  const primary = tag.split('-')[0]?.toLowerCase() ?? '';
  if (primary === 'pt') return 'pt-BR';
  if (primary === 'in') return 'id';
  return (WIDGET_LANGUAGES as readonly string[]).includes(primary) ? (primary as WidgetLanguage) : null;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Risolve la lingua tramite cascata:
 * 1. document.documentElement.lang
 * 2. navigator.language
 * 3. defaultLanguage configurato dal merchant
 * 4. Fallback 'en'
 */
export function resolveLanguage(defaultLanguage: WidgetLanguage): WidgetLanguage {
  // 1. document.documentElement.lang
  if (typeof document !== 'undefined' && document.documentElement) {
    const docLang = document.documentElement.lang;
    if (docLang) {
      const lingua = linguaDelWidget(docLang);
      if (lingua) return lingua;
    }
  }

  // 2. navigator.language
  if (typeof navigator !== 'undefined') {
    const navLang = navigator.language;
    if (navLang) {
      const lingua = linguaDelWidget(navLang);
      if (lingua) return lingua;
    }
  }

  // 3. defaultLanguage dal merchant
  if ((WIDGET_LANGUAGES as readonly string[]).includes(defaultLanguage)) return defaultLanguage;

  // 4. Fallback inglese
  return 'en';
}

/**
 * Carica il locale JSON dalla cache o via fetch.
 * I file devono essere serviti staticamente in `/locales/{lang}.json`
 * relativamente al base URL del widget (stesso dominio/CDN).
 *
 * @param lang - Codice lingua (es. 'it')
 * @param baseUrl - URL base del widget (es. 'https://cdn.cabina.io')
 */
export async function loadLocale(
  lang: WidgetLanguage,
  baseUrl: string,
): Promise<LocaleDict> {
  const cached = localeCache.get(lang);
  if (cached) {
    currentLocale = cached;
    currentLocaleLang = lang;
    return cached;
  }

  // In-flight deduplication: due chiamate concorrenti per la stessa lingua
  // attendono la stessa Promise invece di avviare due fetch paralleli.
  const inflight = inFlightLocales.get(lang);
  if (inflight) return inflight;

  const fallbackEn = (): Promise<LocaleDict> => {
    if (lang !== 'en') return loadLocale('en', baseUrl);
    return Promise.reject(new Error('Cannot load any locale'));
  };

  const promise = (async (): Promise<LocaleDict> => {
    try {
      const sanitizedBase = baseUrl.replace(/\/+$/, '');
      const url = `${sanitizedBase}/locales/${lang}.json`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      let res: Response;
      try {
        res = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) return fallbackEn();
      const dict = (await res.json()) as LocaleDict;
      localeCache.set(lang, dict);
      currentLocale = dict;
      currentLocaleLang = lang;
      return dict;
    } catch {
      return fallbackEn();
    }
  })();

  inFlightLocales.set(lang, promise);
  return promise.finally(() => inFlightLocales.delete(lang));
}

/**
 * Restituisce il LocaleDict corrente (caricato da loadLocale).
 * Null se non ancora caricato.
 */
export function getLocale(): LocaleDict | null {
  return currentLocale;
}

/**
 * Restituisce la lingua del locale corrente.
 */
export function getCurrentLanguage(): WidgetLanguage | null {
  return currentLocaleLang;
}

/**
 * Accede a una stringa tradotta tramite percorso puntato.
 * Supporta interpolazione `{{var}}` via parametro vars.
 *
 * @example getLocaleString('form.height') → 'Altezza (cm)'
 * @example getLocaleString('size.between', { size1: 'M', size2: 'L', recommended: 'L' })
 */
/**
 * Come `getLocaleString`, ma ricade su un'altra chiave quando la prima non è
 * ancora nel locale servito.
 *
 * Serve perché bundle e locale sono file distinti con cache indipendente: dopo
 * un rilascio che aggiunge una stringa, un browser può avere il bundle nuovo e
 * il JSON vecchio ancora in cache (max-age 60s). In quella finestra l'acquirente
 * leggerebbe la chiave grezza, es. `photo.heic_not_supported`. Meglio un
 * messaggio meno preciso ma in lingua.
 */
export function getLocaleStringOr(key: string, fallbackKey: string, vars?: Record<string, string>): string {
  const value = getLocaleString(key, vars);
  return value === key ? getLocaleString(fallbackKey, vars) : value;
}

export function getLocaleString(
  key: string,
  vars?: Record<string, string>,
): string {
  if (!currentLocale) return key;

  const keys = key.split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let value: any = currentLocale;
  for (const k of keys) {
    if (value == null || typeof value !== 'object') return key;
    value = value[k];
  }

  if (typeof value !== 'string') return key;

  if (vars) {
    return value.replace(/\{\{(\w+)\}\}/g, (_, varKey: string) =>
      vars[varKey] ?? `{{${varKey}}}`,
    );
  }

  return value;
}

/**
 * Resetta la cache dei locale (utile nei test).
 */
export function resetLocaleCache(): void {
  localeCache.clear();
  inFlightLocales.clear();
  currentLocale = null;
  currentLocaleLang = null;
}