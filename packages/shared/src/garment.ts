/**
 * Catalogo viste multiple del capo (Story 10.3 / AD-D4).
 *
 * La **chiave** di un capo è l'URL della pagina prodotto normalizzato — non
 * l'og:image, che è un file su CDN e cambia con ri-upload/cache-busting. La
 * normalizzazione qui è l'UNICA fonte di verità: la usano sia la scrittura
 * (dashboard) sia la lettura (endpoint widget + helper widget). Se le due parti
 * divergessero, il lookup fallirebbe in silenzio.
 */

/** Angolazioni delle viste del capo. */
export type GarmentViewAngle = 'front' | 'right' | 'back' | 'left';

/** URL pubblici delle viste caricate (assente = vista non disponibile). */
export interface GarmentViews {
  front?: string | null;
  right?: string | null;
  back?: string | null;
  left?: string | null;
}

/** Gradi di rotazione per ciascuna angolazione (0/90/180/270). */
export const GARMENT_ANGLE_DEGREES: Record<GarmentViewAngle, number> = {
  front: 0,
  right: 90,
  back: 180,
  left: 270,
};

/** Ordine canonico delle angolazioni. */
export const GARMENT_ANGLE_ORDER: readonly GarmentViewAngle[] = ['front', 'right', 'back', 'left'];

/**
 * Angoli (in gradi) per cui esiste una vista esplicitamente caricata.
 * Nota: il fronte (0°) è comunque coperto a runtime dall'og:image anche se
 * `front` è assente qui — questo helper riflette solo le viste memorizzate.
 */
export function availableAngles(views: GarmentViews): number[] {
  return GARMENT_ANGLE_ORDER.filter((a) => {
    const url = views[a];
    return typeof url === 'string' && url.length > 0;
  }).map((a) => GARMENT_ANGLE_DEGREES[a]);
}

/** Parametri query considerati tracking (rimossi dalla chiave). `?variant=` è preservato. */
const TRACKING_PARAM = /^(utm_|fbclid$|gclid$|yclid$|msclkid$|mc_eid$|mc_cid$|_ga$)/i;

/**
 * Normalizza un URL di pagina prodotto in una **chiave** stabile e deterministica.
 *
 * Scelte (documentate — devono restare identiche in scrittura e lettura):
 *  - schema forzato a `https://` (evita mismatch http/https e rende l'output
 *    ri-parsabile → idempotenza); input senza schema (`shop.com/p`) → https se
 *    l'host sembra un dominio; schemi non-http (`ftp:`/`mailto:`) → fallback;
 *  - host in minuscolo **con porta** (`u.host`), prefisso `www.` rimosso;
 *  - hash (`#...`) rimosso; trailing slash del path rimosso;
 *  - query di tracking rimosse (`utm_*`, `fbclid`, `gclid`, …), le restanti
 *    **ordinate** per stabilità; `?variant=` **preservato** (multi-variante);
 *  - il case del path è preservato (i path possono essere case-sensitive).
 *
 * URL non parsabile → fallback deterministico (lowercase host-less, senza hash
 * né trailing slash), così scrittura e lettura sullo stesso input coincidono.
 *
 * `normalizeProductUrl(normalizeProductUrl(x)) === normalizeProductUrl(x)`.
 */
function tryParseUrl(s: string): URL | null {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

/** Fallback deterministico per input che non sono URL (lowercase, senza hash/trailing slash). */
function rawFallback(trimmed: string): string {
  return trimmed.toLowerCase().replace(/#.*$/, '').replace(/\/+$/, '');
}

export function normalizeProductUrl(rawUrl: string): string {
  const trimmed = (rawUrl ?? '').trim();
  let u = tryParseUrl(trimmed);

  // Schema omesso ("shop.com/prod") è un input reale in dashboard: ritenta con
  // https:// e accettalo SOLO se sembra un dominio vero (host con punto), così la
  // chiave scritta combacia con `window.location.href` (sempre assoluto) del widget.
  if (!u) {
    const withScheme = tryParseUrl(`https://${trimmed}`);
    if (withScheme && withScheme.hostname.includes('.')) {
      u = withScheme;
    } else {
      return rawFallback(trimmed);
    }
  }

  // Solo http/https producono chiavi valide; altri schemi (ftp:/mailto:/data:) → fallback.
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return rawFallback(trimmed);
  }

  const host = u.host.toLowerCase().replace(/^www\./, ''); // `host` include la porta (no collisioni)
  const path = u.pathname.replace(/\/+$/, ''); // rimuove trailing slash (root → '')

  const params = [...u.searchParams.entries()]
    .filter(([k]) => !TRACKING_PARAM.test(k))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const query = new URLSearchParams(params).toString();

  return `https://${host}${path}${query ? `?${query}` : ''}`;
}
