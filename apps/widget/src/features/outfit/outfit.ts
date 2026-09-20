/**
 * «Completa il look» (18/09/2026, Arou): dopo la prima prova — sempre col solo
 * capo della pagina — l'acquirente aggiunge fino a 2 capi e li prova insieme.
 * Il merchant la accende (`widget_configs.outfit_enabled`, spenta di default) e
 * con 3 capi insieme paga 2 prove.
 *
 * Da dove vengono i capi proposti, in quest'ordine (scelta di Arou: A + B):
 *  B. le collezioni Mix & Match del merchant, se ne ha create — la sua scelta;
 *  A. altrimenti i prodotti del negozio, letti da soli: su Shopify il catalogo
 *     pubblico `/products.json` è sullo stesso dominio del widget e non chiede
 *     chiavi. Niente da configurare, sempre aggiornato.
 *
 * Il merchant non deve fare altro lavoro, e il cliente non deve scrivere nulla:
 * vedi [[non-contare-sul-cliente]] nella memoria del progetto.
 */
import { MAX_MIX_AND_MATCH_GARMENTS, type FashnGarmentCategory } from '@cabina/shared';
import type { CatalogData } from '../../api/widget-api';
import type { GarmentCategory, SelectedGarment } from '../../state/types';
import { removeExistingForCategory } from '../garment-select/garment-select';

/** Categorie che un outfit sa combinare. `null` = non riconosciuta. */
export type CategoriaOutfit = 'top' | 'outerwear' | 'bottom' | 'dress' | 'footwear';
export type Genere = 'men' | 'women';

export interface CapoOutfit {
  id: string;
  label: string;
  imageUrl: string;
  categoria: CategoriaOutfit | null;
  genere: Genere | null;
}

// ── Classificazione per parole ───────────────────────────────────────────────
//
// ⚠️ L'ORDINE conta ed è la cosa da non rompere:
//  1. scarpe per prime — Completo ha un «Derby Shoe» di tipo «Dress» (scarpa
//     elegante): letto come vestito, finirebbe addosso come un abito;
//  2. confini di parola (\b) — «Bootcut Jeans» non è uno stivale;
//  3. niente «oxford» fra le scarpe — «Oxford Button-Down» è una camicia.
// Cinque lingue come il widget. Una parola che manca fa solo sparire un capo
// dalle proposte: il danno è piccolo, un capo nella categoria sbagliata no.
const REGOLE: Array<[CategoriaOutfit, RegExp]> = [
  ['footwear', /\b(shoes?|sneakers?|trainers?|boots?|loafers?|flats|heels?|pumps?|sandals?|mules?|espadrilles?|slippers?|moccasins?|brogues?|scarp[ae]|stival[ei]|stivalett[io]|sandal[oi]|mocassin[oi]|d[ée]collet[ée]|ballerin[ae]|chaussures?|baskets?|bottes?|bottines?|sandales?|escarpins?|zapat(o|os|illa|illas)|botas?|sandalias?|schuhe?|stiefel|sandalen?|turnschuhe?)\b/i],
  ['outerwear', /\b(jackets?|coats?|parkas?|blazers?|trench|puffers?|gilets?|anoraks?|bombers?|outerwear|giacc[ah][ei]?|giubbott[oi]|cappott[oi]|piumin[oi]|capispalla|vestes?|manteaux?|manteau|blousons?|chaquetas?|abrigos?|jacken?|m[äa]ntel)\b/i],
  ['bottom', /\b(jeans|trousers|pants|chinos?|shorts|skirts?|leggings|joggers|bottoms|pantalon[ie]?|pantalones|gonn[ae]|bermudas?|jupes?|faldas?|vaqueros|hosen?|r[öo]cke?)\b/i],
  ['top', /\b(shirts?|t-shirts?|tees?|tops?|blouses?|sweaters?|jumpers?|knit|knitwear|cardigans?|hoodies?|sweatshirts?|polos?|henleys?|crewnecks?|roll-neck|turtlenecks?|tanks?|camici[ae]|magli[ae]|maglion[ei]|felp[ae]|chemises?|pulls?|pullovers?|camisas?|camisetas?|sudaderas?|hemd(en)?|blusen?)\b/i],
  ['dress', /\b(dress(es)?|jumpsuits?|abit[oi]|vestit[oi]|robes?|vestidos?|kleid(er)?)\b/i],
];

// «women» contiene «men»: con \b la parola intera decide.
const DONNA = /\b(women|woman|womens|female|ladies|donna|donne|femme|femmes|mujer|mujeres|damen|frauen)\b/i;
const UOMO = /\b(men|man|mens|male|uomo|uomini|homme|hommes|hombre|hombres|herren|m[äa]nner)\b/i;

export function classifica(testi: readonly string[]): { categoria: CategoriaOutfit | null; genere: Genere | null } {
  const t = testi.filter(Boolean).join(' · ');
  const categoria = REGOLE.find(([, re]) => re.test(t))?.[0] ?? null;
  const d = DONNA.test(t);
  const u = UOMO.test(t);
  return { categoria, genere: d === u ? null : d ? 'women' : 'men' };
}

// ── Fonte A: i prodotti del negozio (Shopify) ────────────────────────────────

interface ProdottoShopify {
  id: number;
  title: string;
  handle: string;
  product_type?: string;
  tags?: string[] | string;
  images?: { src: string }[];
}

function daProdotto(p: ProdottoShopify): CapoOutfit | null {
  const img = p.images?.[0]?.src;
  if (!img) return null;
  const tags = Array.isArray(p.tags) ? p.tags : (p.tags ?? '').split(',');
  return { id: p.handle, label: p.title, imageUrl: img, ...classifica([p.title, p.product_type ?? '', ...tags]) };
}

/**
 * I prodotti del negozio. Solo su Shopify (`window.Shopify`): altrove quell'URL
 * non esiste e la chiamata sarebbe solo una 404 in console. Silenzioso: senza
 * prodotti il pannello semplicemente non compare.
 */
export async function leggiProdottiNegozio(): Promise<ProdottoShopify[]> {
  if (typeof window === 'undefined' || !(window as { Shopify?: unknown }).Shopify) return [];
  try {
    const res = await fetch('/products.json?limit=250', { credentials: 'same-origin' });
    if (!res.ok) return [];
    const body = (await res.json()) as { products?: ProdottoShopify[] };
    return body.products ?? [];
  } catch {
    return [];
  }
}

/** L'handle del prodotto in pagina, da `/products/<handle>` (anche con lingua o collezione davanti). */
export function handleDellaPagina(pathname: string): string | null {
  return pathname.match(/\/products\/([^/?#]+)/)?.[1] ?? null;
}

// ── Fonte B: le collezioni Mix & Match ───────────────────────────────────────

const DA_FASHN: Record<FashnGarmentCategory, CategoriaOutfit | null> = {
  tops: 'top',
  bottoms: 'bottom',
  'one-pieces': 'dress',
  auto: null,
};

function daCatalogo(catalog: CatalogData | null): CapoOutfit[] {
  return (catalog?.garments ?? []).map((g) => ({
    id: g.id,
    label: g.label,
    imageUrl: g.imageUrl,
    categoria: DA_FASHN[g.fashnCategory] ?? null,
    genere: null,
  }));
}

// ── Quali capi proporre ──────────────────────────────────────────────────────

/** Le categorie che completano il capo della pagina. */
const COMPLEMENTARI: Record<CategoriaOutfit, CategoriaOutfit[]> = {
  top: ['bottom', 'footwear', 'outerwear'],
  outerwear: ['top', 'bottom', 'footwear'],
  bottom: ['top', 'footwear', 'outerwear'],
  dress: ['footwear', 'outerwear'],
  footwear: ['top', 'bottom', 'outerwear', 'dress'],
};

function daAnalisi(c: GarmentCategory | null | undefined): CategoriaOutfit | null {
  return c === 'top' || c === 'outerwear' || c === 'bottom' || c === 'dress' || c === 'footwear' ? c : null;
}

/** Proposte mostrate: poche per categoria, così le scarpe non finiscono dopo venti maglie. */
export const PER_CATEGORIA = 6;

export function proposteOutfit(opzioni: {
  catalog: CatalogData | null;
  prodotti: readonly ProdottoShopify[];
  /** Categoria del capo in pagina, dall'analisi del widget. */
  categoriaPagina: GarmentCategory | null | undefined;
  handlePagina: string | null;
}): CapoOutfit[] {
  const { catalog, prodotti, handlePagina } = opzioni;
  const pagina = prodotti.find((p) => p.handle === handlePagina);
  const classePagina = pagina ? daProdotto(pagina) : null;
  // La categoria dell'analisi vince (guarda la foto); le parole del prodotto la
  // sostituiscono solo se l'analisi non c'è.
  const categoriaPagina = daAnalisi(opzioni.categoriaPagina) ?? classePagina?.categoria ?? null;
  const generePagina = classePagina?.genere ?? null;

  // B prima di A: se il merchant ha composto delle collezioni, quella è la sua scelta.
  const dalMerchant = catalog != null && catalog.garments.length > 0;
  const fonte = dalMerchant
    ? daCatalogo(catalog)
    : prodotti.filter((p) => p.handle !== handlePagina).map(daProdotto).filter((c): c is CapoOutfit => c != null);

  const ammesse = categoriaPagina ? COMPLEMENTARI[categoriaPagina] : null;
  const utili = fonte.filter((c) =>
    // Un capo senza categoria passa solo se l'ha scelto il merchant (fonte B).
    (!ammesse || (c.categoria == null ? dalMerchant : ammesse.includes(c.categoria))) &&
    (!generePagina || !c.genere || c.genere === generePagina),
  );

  // Le categorie nell'ordine dei complementari, al massimo PER_CATEGORIA ciascuna.
  const ordine = ammesse ?? ['top', 'bottom', 'footwear', 'outerwear', 'dress'];
  const scelte: CapoOutfit[] = [];
  for (const cat of ordine) scelte.push(...utili.filter((c) => c.categoria === cat).slice(0, PER_CATEGORIA));
  // Dal catalogo del merchant anche i capi senza categoria: li ha scelti lui.
  if (dalMerchant) scelte.push(...utili.filter((c) => c.categoria == null).slice(0, PER_CATEGORIA));
  return scelte;
}

/** Il capo come lo vuole `tryonGenerative`, con la stessa regola di rimozione del capo di pagina. */
export function comeCapoSelezionato(c: CapoOutfit): SelectedGarment {
  const category: FashnGarmentCategory =
    c.categoria === 'top' || c.categoria === 'outerwear' ? 'tops'
    : c.categoria === 'bottom' ? 'bottoms'
    : c.categoria === 'dress' ? 'one-pieces'
    : 'auto';
  return { imageUrl: c.imageUrl, category, removeExisting: removeExistingForCategory(category), garmentPhotoType: 'auto' };
}

/** Capi in più che l'acquirente può aggiungere al capo della pagina. */
export const MAX_CAPI_AGGIUNTI = MAX_MIX_AND_MATCH_GARMENTS - 1;

/**
 * La selezione dopo un tocco: un capo per categoria (una seconda maglia prende
 * il posto della prima — due maglie addosso non sono un outfit), al massimo
 * `MAX_CAPI_AGGIUNTI`; toccare un capo già scelto lo toglie.
 */
export function tocca(selezione: readonly CapoOutfit[], capo: CapoOutfit): CapoOutfit[] {
  if (selezione.some((s) => s.id === capo.id)) return selezione.filter((s) => s.id !== capo.id);
  const senzaStessaCategoria = capo.categoria
    ? selezione.filter((s) => s.categoria !== capo.categoria)
    : [...selezione];
  if (senzaStessaCategoria.length >= MAX_CAPI_AGGIUNTI) return [...selezione];
  return [...senzaStessaCategoria, capo];
}
