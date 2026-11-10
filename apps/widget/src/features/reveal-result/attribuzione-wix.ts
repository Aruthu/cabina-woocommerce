/**
 * Attribuzione dell'ordine alla prova su Wix (story 14.2, AC1).
 *
 * Su Wix non c'è un form d'acquisto in cui scrivere la sessione (come
 * `properties[_cabina]` su Shopify, WooCommerce e PrestaShop): il pulsante è
 * di Wix Stores. Il legame si fa in due pezzi:
 *
 * 1. il widget principale, quando la prova del capo della pagina è finita,
 *    annota `{sessione, pagina}` in `sessionStorage` (`registraProvaWix`),
 *    solo se lo script Wix di Cabina si è annunciato (`window.__cabinaWix`);
 * 2. lo script Wix (`src/wix/wix-eventi.ts`, modulo con l'SDK di Wix) sente
 *    gli eventi standard e chiama `gestisciEventoWix`, che manda a Cabina il
 *    legame `checkoutId + prodotto → sessione`:
 *    - `AddToCart` sulla pagina della prova: `cartId` (in Cart V2 È il
 *      `checkoutId` dell'ordine, T0.2);
 *    - `InitiateCheckout` di «Compra ora» (carrello saltato, T0.5): il
 *      `checkoutId` sta nell'URL del checkout, il prodotto in `contents[]`.
 *      Quale pagina lo mostrava si sa da `CustomizeProduct`/`AddToCart`
 *      (prodotto con opzioni); senza, vale solo se nel checkout c'è un capo
 *      solo e l'ultima pagina prodotto vista è quella della prova.
 *
 * 🔒 Gli eventi di Wix portano `visitorId`, `userId` e (`Purchase`) nome e
 * città: da qui escono solo `checkoutId`, prodotto, variante e la nostra
 * sessione. Mai l'evento intero.
 *
 * Tutto lo stato sta in `sessionStorage`: fra la pagina prodotto e il checkout
 * la pagina può ricaricarsi. Se lo storage non c'è (finestra privata, bloccato)
 * non succede niente: l'ordine resta «senza prova», nessun errore.
 */

export const CHIAVE_PROVE = 'cabina:wix:prove';
const CHIAVE_PRODOTTI = 'cabina:wix:prodotti';
const CHIAVE_ULTIMA_PAGINA = 'cabina:wix:ultima-pagina';
const CHIAVE_INVIATI = 'cabina:wix:inviati';

/** Una prova vale per il carrello entro un giorno. */
const VALIDITA_MS = 24 * 60 * 60 * 1000;
const MAX_PROVE = 10;
const MAX_INVIATI = 50;
const MAX_PRODOTTI = 50;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface Legame {
  checkoutId: string;
  catalogItemId: string;
  variantId?: string;
  sessionId: string;
}

export type InviaLegame = (legame: Legame) => void;

interface Prova {
  s: string;
  p: string;
  t: number;
}

declare global {
  interface Window {
    /** Messo dallo script Wix di Cabina: c'è chi ascolta il carrello. */
    __cabinaWix?: boolean;
  }
}

function leggi<T>(chiave: string, vuoto: T): T {
  try {
    const raw = sessionStorage.getItem(chiave);
    return raw ? (JSON.parse(raw) as T) : vuoto;
  } catch {
    return vuoto;
  }
}

function scrivi(chiave: string, valore: unknown): void {
  try {
    sessionStorage.setItem(chiave, JSON.stringify(valore));
  } catch {
    // Storage pieno o bloccato: niente legame, nessun errore.
  }
}

/** Solo per Vitest. */
export function __resetWixForTesting(): void {
  for (const k of [CHIAVE_PROVE, CHIAVE_PRODOTTI, CHIAVE_ULTIMA_PAGINA, CHIAVE_INVIATI]) {
    try {
      sessionStorage.removeItem(k);
    } catch {
      // jsdom ha sempre lo storage
    }
  }
}

/** Il widget principale: la prova del capo di questa pagina è finita. */
export function registraProvaWix(sessionId: string | null, pagina: string, ora = Date.now()): void {
  if (!sessionId || typeof window === 'undefined' || !window.__cabinaWix) return;
  const prove = leggi<Prova[]>(CHIAVE_PROVE, []).filter((x) => x.p !== pagina && ora - x.t < VALIDITA_MS);
  prove.push({ s: sessionId, p: pagina, t: ora });
  scrivi(CHIAVE_PROVE, prove.slice(-MAX_PROVE));
}

function provaDellaPagina(pagina: string | null | undefined, ora: number): string | null {
  if (!pagina) return null;
  const prova = leggi<Prova[]>(CHIAVE_PROVE, []).find((x) => x.p === pagina);
  return prova && ora - prova.t < VALIDITA_MS ? prova.s : null;
}

const guid = (v: unknown): string | null => (typeof v === 'string' && GUID.test(v) ? v.toLowerCase() : null);

function ricordaProdotto(pagina: string, prodotto: string): void {
  const mappa = leggi<Record<string, string>>(CHIAVE_PRODOTTI, {});
  delete mappa[prodotto]; // in fondo: l'ordine di inserimento è l'ordine di visita
  mappa[prodotto] = pagina;
  // Tetto come le altre chiavi (rilievo Kilo #406): restano gli ultimi prodotti visti.
  scrivi(CHIAVE_PRODOTTI, Object.fromEntries(Object.entries(mappa).slice(-MAX_PRODOTTI)));
}

function manda(legame: Legame, invia: InviaLegame): void {
  const chiave = `${legame.checkoutId}|${legame.catalogItemId}`;
  const inviati = leggi<string[]>(CHIAVE_INVIATI, []);
  if (inviati.includes(chiave)) return;
  scrivi(CHIAVE_INVIATI, [...inviati, chiave].slice(-MAX_INVIATI));
  invia(legame);
}

export interface ContestoEvento {
  /** `location.pathname` della pagina in cui è nato l'evento. */
  pagina: string;
  /** `location.href`, per il `checkoutId` di «Compra ora». */
  url: string;
  ora?: number;
  invia: InviaLegame;
}

/** Un evento standard di Wix (`analytics.registerEventListener`). */
export function gestisciEventoWix(nome: string, dati: unknown, ctx: ContestoEvento): void {
  if (!dati || typeof dati !== 'object') return;
  const d = dati as Record<string, unknown>;
  const ora = ctx.ora ?? Date.now();

  if (nome === 'PageView') {
    if (d.pageTypeIdentifier === 'product_page' && typeof d.pagePath === 'string') {
      scrivi(CHIAVE_ULTIMA_PAGINA, d.pagePath.split('?')[0]);
    }
    return;
  }

  if (nome === 'CustomizeProduct') {
    const prodotto = guid(d.id);
    if (prodotto) ricordaProdotto(ctx.pagina, prodotto);
    return;
  }

  if (nome === 'AddToCart') {
    const prodotto = guid(d.id);
    const carrello = guid(d.cartId);
    if (!prodotto) return;
    ricordaProdotto(ctx.pagina, prodotto);
    const sessione = provaDellaPagina(ctx.pagina, ora);
    if (!carrello || !sessione) return;
    manda({ checkoutId: carrello, catalogItemId: prodotto, variantId: guid(d.variantId) ?? undefined, sessionId: sessione }, ctx.invia);
    return;
  }

  if (nome === 'InitiateCheckout') {
    let checkout: string | null = null;
    try {
      checkout = guid(new URL(ctx.url).searchParams.get('checkoutId'));
    } catch {
      checkout = null;
    }
    if (!checkout) return;
    const righe = Array.isArray(d.contents) ? (d.contents as Record<string, unknown>[]) : [];
    const pagine = leggi<Record<string, string>>(CHIAVE_PRODOTTI, {});
    const ultimaPagina = leggi<string | null>(CHIAVE_ULTIMA_PAGINA, null);
    for (const riga of righe) {
      const ref = (riga.catalogReference ?? {}) as Record<string, unknown>;
      const prodotto = guid(ref.catalogItemId) ?? guid(riga.id);
      if (!prodotto) continue;
      // Pagina nota dagli eventi di quel prodotto; altrimenti, con un capo
      // solo nel checkout, l'ultima pagina prodotto vista.
      const pagina = pagine[prodotto] ?? (righe.length === 1 ? ultimaPagina : null);
      const sessione = provaDellaPagina(pagina, ora);
      if (!sessione) continue;
      const opzioni = (ref.options ?? {}) as Record<string, unknown>;
      manda({ checkoutId: checkout, catalogItemId: prodotto, variantId: guid(opzioni.variantId) ?? undefined, sessionId: sessione }, ctx.invia);
    }
  }
}
