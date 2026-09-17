import { PRODUCT_IMAGE_SELECTORS } from '@cabina/shared';

/**
 * Estrae l'URL dell'immagine prodotto dalla pagina corrente.
 *
 * Strategia:
 * 1. Cerca <meta property="og:image"> — Open Graph image (standard)
 * 2. Fallback: cerca <meta name="twitter:image"> — Twitter card image
 * 3. Fallback: cerca il primo <img> dentro un contenitore prodotto comune
 *
 * @returns L'URL dell'immagine prodotto o null se non trovato.
 */
export function extractProductImageUrl(): string | null {
  // 1. Open Graph image (standard più comune per e-commerce)
  const ogImage = document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
  if (ogImage?.content) {
    const url = resolveUrl(ogImage.content);
    if (url) return url;
  }

  // 2. Twitter card image
  const twitterImage = document.querySelector<HTMLMetaElement>('meta[name="twitter:image"]');
  if (twitterImage?.content) {
    const url = resolveUrl(twitterImage.content);
    if (url) return url;
  }

  // 3. Fallback: primo <img> in un contenitore prodotto.
  //
  // L'elenco vive in `@cabina/shared` insieme ai punti d'aggancio del pulsante:
  // e' documentato su /en/docs, e una copia nella documentazione non saprebbe
  // quando questa lista cambia. Il perche' di ogni selettore sta li'.
  for (const selector of PRODUCT_IMAGE_SELECTORS) {
    try {
      const img = document.querySelector<HTMLImageElement>(selector);
      if (img?.src && !isPlaceholderOrIcon(img.src)) {
        const url = resolveUrl(img.src);
        if (url) return url;
      }
    } catch {
      // Selector parsing error — skip this selector
    }
  }

  return null;
}

/**
 * Verifica se un URL è probabilmente un placeholder o icona.
 * Filtra immagini di tracking (1x1 pixel), icone, placeholder SVG.
 */
function isPlaceholderOrIcon(src: string): boolean {
  const lower = src.toLowerCase();
  return (
    lower.includes('placeholder') ||
    lower.includes('icon-') ||
    lower.includes('logo') ||
    lower.includes('spacer') ||
    lower.includes('1x1') ||
    lower.includes('pixel') ||
    lower.includes('blank') ||
    lower.includes('no-image') ||
    lower.includes('noimage')
  );
}

/**
 * Risolve URL relativi in URL assoluti.
 * Restituisce null se l'URL non è valido.
 */
function resolveUrl(url: string): string | null {
  try {
    // URL già assoluto
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return toHttps(new URL(url).href);
    }

    // URL protocol-relative (//example.com/image.jpg)
    if (url.startsWith('//')) {
      return new URL(`https:${url}`).href;
    }

    // URL relativo — risolvi rispetto all'href completo (preserva path base su sottodirectory)
    return toHttps(new URL(url, window.location.href).href);
  } catch {
    return null;
  }
}

/**
 * Promuove http → https.
 *
 * ⚠️ 2026-07-29 — Shopify emette l'Open Graph standard, dove `og:image` è in
 * **http** e la versione sicura sta in `og:image:secure_url`. Siccome
 * `/api/widget/analyze-garment` accetta solo https (difesa SSRF), l'URL veniva
 * rifiutato con INVALID_IMAGE_URL su OGNI negozio Shopify — e il widget, che
 * fallisce in silenzio, proseguiva senza la categoria del capo.
 *
 * Si promuove invece di leggere `og:image:secure_url` perché così la difesa
 * vale per tutte le fonti (twitter:image, src degli <img>, temi custom), non
 * solo per quel meta tag. Se il negozio serve davvero solo http l'immagine non
 * si scarica — ma sarebbe stata rifiutata comunque, quindi non si perde nulla.
 */
function toHttps(url: string): string {
  return url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url;
}