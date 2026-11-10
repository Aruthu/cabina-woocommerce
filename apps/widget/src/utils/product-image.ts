import { PRODUCT_IMAGE_SELECTORS } from '@cabina/shared';
import { trovaPulsanteAcquisto } from '../features/reveal-result/add-to-cart';

/**
 * Estrae l'URL dell'immagine prodotto dalla pagina corrente.
 *
 * Strategia:
 * 0. Su Shopify, la foto della **variante scelta** (vedi `caricaImmaginiVarianti`)
 * 1. Cerca <meta property="og:image"> — Open Graph image (standard)
 * 2. Fallback: cerca <meta name="twitter:image"> — Twitter card image
 * 3. Fallback: cerca il primo <img> dentro un contenitore prodotto comune
 *
 * @returns L'URL dell'immagine prodotto o null se non trovato.
 */
export function extractProductImageUrl(): string | null {
  // Wix cambia prodotto senza ricaricare la pagina: gli scarti valgono solo per la pagina che li ha fatti (rilievo Kilo #414).
  if (paginaScarti !== null && paginaScarti !== percorso()) resetFotoScartate();
  if (galleriaRifiutata) return null;
  const principale = fotoPrincipale();
  if (!fotoScartate.size || (principale && !scartata(principale))) return principale;
  // La principale è stata scartata (capo piegato): la prima foto della galleria che non lo è.
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content;
  for (const img of document.querySelectorAll<HTMLImageElement>(GALLERIA)) {
    if (!img.src || isPlaceholderOrIcon(img.src)) continue;
    const url = resolveUrl(fotoPsGrande(piuGrandeDelloSrcset(img) ?? img.src, og));
    if (url && !scartata(url)) return url;
  }
  return null;
}

/**
 * Foto del capo scartate dall'analisi perché il capo è piegato (10/11/2026,
 * Arou: «scarta»). Il Floral Tea Dress del sito Wix di prova ha come prime due
 * foto il vestito piegato: la prova inventava i pantaloni. Una per pagina.
 */
const fotoScartate = new Set<string>();
// Senza query: su Shopify la stessa foto torna con `?width=` diversi (principale contro srcset).
const chiave = (url: string) => url.split('?')[0]!;
const scartata = (url: string) => fotoScartate.has(chiave(url));
let paginaScarti: string | null = null;
const percorso = () => String(window.location.pathname);
export function scartaFotoCapo(url: string): void {
  fotoScartate.add(chiave(url));
  paginaScarti = percorso();
}
/**
 * Dopo il tetto di analisi tutte piegate: nessuna foto della pagina, nemmeno una
 * non ancora analizzata (rilievo Kilo #413: la quinta sarebbe partita senza verifica).
 */
let galleriaRifiutata = false;
export function rifiutaFotoCapo(): void {
  galleriaRifiutata = true;
  paginaScarti = percorso();
}
export function resetFotoScartate(): void {
  fotoScartate.clear();
  galleriaRifiutata = false;
  paginaScarti = null;
}

/** Tutte le foto della galleria del prodotto, nell'ordine della pagina. */
const GALLERIA = [
  '[data-hook="ProductImageDataHook.ProductImage"] img', // Wix: il carosello principale (non i prodotti correlati)
  '.js-images-container img', // PrestaShop: copertina, slide e miniature
  ...PRODUCT_IMAGE_SELECTORS,
].join(', ');

function fotoPrincipale(): string | null {
  // 0. La variante scelta sulla pagina (Shopify)
  const variante = immagineVarianteScelta();
  if (variante) {
    const url = resolveUrl(variante);
    if (url) return url;
  }

  const ogImage = document.querySelector<HTMLMetaElement>('meta[property="og:image"]');

  // 0b. La foto mostrata nella galleria (PrestaShop, WooCommerce)
  const mostrata = document.querySelector<HTMLImageElement>(FOTO_MOSTRATA);
  if (mostrata?.src && !isPlaceholderOrIcon(mostrata.src)) {
    const url = resolveUrl(fotoPsGrande(piuGrandeDelloSrcset(mostrata) ?? mostrata.src, ogImage?.content));
    if (url) return url;
  }

  // 1. Open Graph image (standard più comune per e-commerce)
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
        const url = resolveUrl(piuGrandeDelloSrcset(img) ?? img.src);
        if (url) return url;
      }
    } catch {
      // Selector parsing error — skip this selector
    }
  }

  return null;
}

/**
 * La foto grande della galleria, che il tema cambia quando l'acquirente sceglie
 * una variante (colore).
 *
 * 10/11/2026 — su PrestaShop 8 e 9 `og:image` è sempre la copertina: con il
 * Bianco scelto (e mostrato) la prova usciva con la t-shirt nera (prova vera sui
 * banchi). Il cambio combinazione sostituisce `.js-images-container` via ajax;
 * su WooCommerce lo script delle variazioni riscrive `src`/`srcset` della prima
 * foto della galleria. Hummingbird (PS9): `.carousel-item.active`; Classic: `.js-qv-product-cover`.
 */
const FOTO_MOSTRATA = [
  '.js-images-container .carousel-item.active img',
  '.js-images-container .js-qv-product-cover',
  '.woocommerce-product-gallery__image img',
].join(', ');

/**
 * Su PrestaShop la galleria serve una copia più piccola di `og:image`
 * (Hummingbird: `product_main` 720 px contro `product_main_2x`): si tiene il
 * formato di `og:image` e si cambia solo il numero dell'immagine
 * (`/2-product_main/x.jpg` → `/2-product_main_2x/x.jpg`). Senza URL amichevoli
 * i due indirizzi non combaciano e resta la foto della galleria.
 */
function fotoPsGrande(mostrata: string, og: string | undefined): string {
  if (!(window as unknown as { prestashop?: unknown }).prestashop) return mostrata;
  // `[-\w]`: PrestaShop ammette il trattino nei nomi dei formati (rilievo Kilo #412).
  const id = /\/(\d+)-[-\w]+\/[^/]+$/.exec(mostrata)?.[1];
  if (!id || !og || !/\/\d+-[-\w]+\/[^/]+$/.test(og)) return mostrata;
  return og.replace(/\/\d+-([-\w]+\/[^/]+)$/, `/${id}-$1`);
}

/**
 * La voce più grande dello `srcset` di una `<img>`, o null se non c'è.
 *
 * 09/11/2026 — WooCommerce senza plugin SEO non emette og:image, e il `src`
 * della foto in galleria è la copia «single» da 600 px (misurato su un banco
 * WooCommerce): con una foto piccola il modello sbaglia i dettagli (vedi la
 * fascia al collo su Wix, #410). Lo `srcset` elenca anche l'originale, e
 * WordPress non ci mette immagini più larghe di 2048 px: il tetto c'è già.
 * Si confrontano solo descrittori dello stesso tipo (`w` o `x`).
 */
function piuGrandeDelloSrcset(img: HTMLImageElement): string | null {
  // ⚠️ Né `.split(',')` né `.split(/\s+/)` (due rilievi Kilo sulla #411): gli URL
  // di Wix e Cloudinary contengono virgole (`w_600,h_600,c_fill`), e fra due
  // voci la virgola può non avere spazio dopo (`a.jpg 600w,b.jpg 1200w`). Una
  // voce è: URL senza spazi, spazi, descrittore, poi virgola o fine. Le voci
  // senza descrittore non combaciano e si saltano.
  const voci: { url: string; n: number; tipo: string }[] = [];
  for (const m of (img.getAttribute('srcset') ?? '').matchAll(/\s*,?\s*(\S+?)\s+(\d+(?:\.\d+)?)([wx])\s*(?=,|$)/g)) {
    voci.push({ url: m[1]!.replace(/^,+/, ''), n: parseFloat(m[2]!), tipo: m[3]! });
  }
  if (voci.length === 0) return null;
  const tipo = voci.some((v) => v.tipo === 'w') ? 'w' : 'x';
  return voci.filter((v) => v.tipo === tipo).sort((a, b) => b.n - a.n)[0]!.url;
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
      return fotoWixGrande(toHttps(new URL(url).href));
    }

    // URL protocol-relative (//example.com/image.jpg)
    if (url.startsWith('//')) {
      return fotoWixGrande(new URL(`https:${url}`).href);
    }

    // URL relativo — risolvi rispetto all'href completo (preserva path base su sottodirectory)
    return toHttps(new URL(url, window.location.href).href);
  } catch {
    return null;
  }
}

/**
 * Su Wix la foto del capo nella versione grande (fino a 2048 px, mai ingrandita).
 *
 * 09/11/2026 — Wix mette in `og:image` una copia da 500 px
 * (`…/v1/fit/w_500,h_500,q_90/file.jpg`, anche quando dichiara 1024), e la
 * galleria serve ritagli AVIF da 788. Con la copia piccola il modello lasciava
 * il collo della t-shirt della modella sopra lo scollo del maglione; con la foto
 * grande lo scollo veniva pulito (provato in produzione sul sito Wix di prova).
 * `fit` a 2048 riduce le foto enormi e lascia com'è una da 1024 (misurato).
 */
const FOTO_WIX = /^https:\/\/static\.wixstatic\.com\/media\/([^/]+\.(jpe?g|png|webp))(?:\/v1\/.*)?$/i;

function fotoWixGrande(url: string): string {
  const m = FOTO_WIX.exec(url);
  if (!m) return url;
  // Stesso formato dell'originale (Wix rispetta l'estensione di `file.*`): un
  // PNG scontornato resta trasparente invece di finire su un fondo pieno.
  const formato = m[2].toLowerCase() === 'jpeg' ? 'jpg' : m[2].toLowerCase();
  return `https://static.wixstatic.com/media/${m[1]}/v1/fit/w_2048,h_2048,q_90/file.${formato}`;
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
/**
 * Le foto delle varianti del prodotto della pagina, per id di variante.
 *
 * 🔑 2026-09-23 (Arou, collaudo con Mem): `og:image` è la foto della pagina
 * **com'era all'apertura**. L'acquirente sceglieva «sage» e la cabina provava
 * la maglietta bianca, perché nessun tema aggiorna i meta del `<head>` al cambio
 * variante. La variante scelta invece sta sempre nel form d'acquisto
 * (`[name="id"]`), perché è quella che il tema mette nel carrello; la sua foto
 * sta nel JSON pubblico del prodotto (`/products/<handle>.js`), letto una volta
 * all'avvio. Così la prova e l'acquisto guardano la stessa variante.
 */
let immaginiVarianti: Map<string, string> | null = null;

/**
 * Legge una volta le foto delle varianti. Solo su Shopify e su una pagina
 * prodotto; altrove, o se la richiesta fallisce, resta `og:image` come prima.
 */
export async function caricaImmaginiVarianti(): Promise<void> {
  immaginiVarianti = null;
  if (!(window as unknown as { Shopify?: unknown }).Shopify) return;
  // `/it/products/x`, `/collections/y/products/x`: il `.js` si aggiunge al percorso della pagina.
  const percorso = window.location.pathname.replace(/\/+$/, '');
  if (!/\/products\/[^/]+$/.test(percorso)) return;
  try {
    const res = await fetch(`${percorso}.js`, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    const prodotto = (await res.json()) as {
      variants?: { id?: unknown; featured_image?: { src?: unknown } | null }[];
    };
    const mappa = new Map<string, string>();
    for (const v of prodotto.variants ?? []) {
      const src = v.featured_image?.src;
      if (v.id != null && typeof src === 'string' && src) mappa.set(String(v.id), src);
    }
    immaginiVarianti = mappa;
  } catch {
    // Nessuna foto per variante: si ricade su og:image.
  }
}

/** La foto della variante nel form d'acquisto, se la conosciamo. */
function immagineVarianteScelta(): string | null {
  if (!immaginiVarianti?.size) return null;
  // Lo stesso form che «Aggiungi al carrello» usa: mai quello di un prodotto correlato.
  const form = trovaPulsanteAcquisto()?.closest('form');
  const id = form?.querySelector<HTMLInputElement | HTMLSelectElement>('[name="id"]')?.value;
  return id ? (immaginiVarianti.get(id) ?? null) : null;
}

/** Solo per i test. */
export function resetImmaginiVarianti(): void {
  immaginiVarianti = null;
}
