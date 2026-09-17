/**
 * Browser detection utility per Story 3.1.
 * Determina se il browser corrente supporta le funzionalità richieste dal Widget
 * e fornisce messaggi tradotti per browser non supportati.
 *
 * Supportati (NFR-5, NFR-6):
 * - Desktop: Chrome 120+, Firefox 120+, Safari 17+, Edge 120+
 * - Mobile: Safari iOS 16+, Chrome Android 100+
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface BrowserInfo {
  name: string;
  version: number;
  isMobile: boolean;
}

// ── Detection ──────────────────────────────────────────────────────────────

/**
 * Estrae nome e versione del browser dall'user agent.
 * Il parsing è minimalista e si basa su stringhe note degli user agent.
 */
export function parseBrowser(ua: string): BrowserInfo {
  let name = 'unknown';
  let version = 0;
  let isMobile = false;

  const uaLower = ua.toLowerCase();

  // Mobile detection
  if (/mobi|android|iphone|ipad/i.test(uaLower)) {
    isMobile = true;
  }

  // Edge (deve venire prima di Chrome — Edge include "chrome" nell'UA)
  const edgeMatch = /edg(?:e|a|ios)?\/(\d+)/i.exec(uaLower);
  if (edgeMatch) {
    name = 'edge';
    version = parseInt(edgeMatch[1]!, 10);
    return { name, version, isMobile };
  }

  // Chrome (Android Chrome / desktop Chrome)
  const chromeMatch = /(?:chrome|crios)\/(\d+)/i.exec(uaLower);
  if (chromeMatch && !/opr|opera/i.test(uaLower)) {
    name = 'chrome';
    version = parseInt(chromeMatch[1]!, 10);
    return { name, version, isMobile };
  }

  // Firefox
  const firefoxMatch = /(?:firefox|fxios)\/(\d+)/i.exec(uaLower);
  if (firefoxMatch) {
    name = 'firefox';
    version = parseInt(firefoxMatch[1]!, 10);
    return { name, version, isMobile };
  }

  // Safari (deve venire dopo Chrome/Edge perché l'UA di Chrome su iOS contiene "safari")
  const safariMatch = /version\/(\d+).*safari/i.exec(uaLower);
  if (safariMatch && !/chrome|crios|edg/i.test(uaLower)) {
    name = 'safari';
    version = parseInt(safariMatch[1]!, 10);
    return { name, version, isMobile };
  }

  return { name, version, isMobile };
}

// ── Support Check ──────────────────────────────────────────────────────────

/**
 * Versione minima richiesta per browser.
 * NFR-5: Desktop Chrome 120+, Firefox 120+, Safari 17+, Edge 120+
 * NFR-6: Mobile Safari iOS 16+, Chrome Android 100+
 */
const MIN_VERSIONS: Record<string, { desktop: number; mobile: number }> = {
  chrome: { desktop: 120, mobile: 100 },
  firefox: { desktop: 120, mobile: 120 },
  safari: { desktop: 17, mobile: 16 },
  edge: { desktop: 120, mobile: 100 },
};

/**
 * Verifica se il browser corrente soddisfa i requisiti minimi di versione (NFR-5, NFR-6).
 * Browser sconosciuti non vengono bloccati per evitare falsi negativi.
 */
export function isBrowserSupported(): boolean {
  if (typeof navigator === 'undefined') return true;

  const { name, version, isMobile } = parseBrowser(navigator.userAgent);

  const minVersions = MIN_VERSIONS[name];
  if (!minVersions) return true;

  const min = isMobile ? minVersions.mobile : minVersions.desktop;
  return version >= min;
}

// ── Unsupported Message ────────────────────────────────────────────────────

const BROWSER_UPDATE_URLS: Record<string, string> = {
  chrome: 'https://www.google.com/chrome/',
  firefox: 'https://www.mozilla.org/firefox/',
  safari: 'https://support.apple.com/safari',
  edge: 'https://www.microsoft.com/edge',
  unknown: 'https://browsehappy.com/',
};

/**
 * Restituisce il link di aggiornamento per il browser corrente.
 */
export function getBrowserUpdateLink(): string {
  if (typeof navigator === 'undefined') return BROWSER_UPDATE_URLS.unknown!;

  const { name } = parseBrowser(navigator.userAgent);
  return BROWSER_UPDATE_URLS[name] ?? BROWSER_UPDATE_URLS.unknown!;
}