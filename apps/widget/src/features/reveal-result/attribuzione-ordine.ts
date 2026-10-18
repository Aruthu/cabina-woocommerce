/**
 * Attribuzione dell'ordine alla prova (story 14.1, AC1).
 *
 * Quando l'acquirente arriva al risultato, il widget scrive nel form prodotto
 * del tema un campo nascosto `properties[_cabina]` con l'id della sessione di
 * prova. Shopify lo porta sulla riga d'ordine (`line_items[].properties`),
 * da qualunque strada il capo entri nel carrello: pulsante del tema,
 * `/cart/add.js`, «Buy it now» (T0.4). Il prefisso `_` lo nasconde al
 * checkout e nelle email; il negoziante lo legge solo nell'admin (T0.5).
 *
 * 🔑 Si scrive **al completamento della prova**, non al clic sul nostro
 * pulsante: vale anche se l'acquirente chiude la cabina e compra dal tema.
 *
 * 📌 Niente attributo di carrello: con «Buy it now» il carrello viene
 * saltato e `note_attributes` arriva vuoto (T0.4), quindi la proprietà di
 * riga è l'unica fonte. Solo dove c'è chi lo legge: Shopify, e dal 18/10/2026
 * WooCommerce, dove il plugin Cabina prende lo stesso campo dal POST
 * dell'«aggiungi al carrello» (`form.cart`) e lo porta sulla riga d'ordine.
 * Il nome resta `properties[_cabina]` anche lì: al plugin arriva come
 * `$_POST['properties']['_cabina']`. Così anche su PrestaShop (modulo 1.4.0):
 * il form è `#add-to-cart-or-refresh`, che il tema manda serializzato al
 * carrello, e il modulo lo legge in `actionCartUpdateQuantityBefore`.
 *
 * ⚠️ Un tema che ridisegna il form perde il campo: `rimettiAttribuzione` lo
 * riscrive quando il widget reinserisce il proprio pulsante, con l'ultima
 * sessione segnata.
 */

import { trovaPulsanteAcquisto } from './add-to-cart';

export const CAMPO_ATTRIBUZIONE = 'properties[_cabina]';

let ultimaSessione: string | null = null;

/** Solo per Vitest. */
export function __resetAttribuzioneForTesting(): void {
  ultimaSessione = null;
}

function conLettore(): boolean {
  if (typeof window === 'undefined') return false;
  if ('Shopify' in window) return true;
  // WooCommerce: il form d'acquisto della scheda prodotto è `form.cart`
  // (temi classici e blocco «Aggiungi al carrello» con opzioni). PrestaShop:
  // `#add-to-cart-or-refresh` (tema classic e derivati). Wix non ancora.
  return document.querySelector('form.cart, form#add-to-cart-or-refresh') !== null;
}

/**
 * Il form prodotto a cui il widget è agganciato (`closest('form')` dal nostro
 * pulsante, come `trovaPulsanteAcquisto`). Senza un form attorno si accetta
 * l'unico `form[action*="/cart/add"]` della pagina: con più d'uno (prodotti
 * correlati con acquisto rapido) non si sa quale sia il capo provato, e un
 * campo scritto nel form sbagliato segnerebbe «con prova» un altro capo.
 */
export function formAcquisto(): HTMLFormElement | null {
  const vicino = document.querySelector('[data-cabina-widget-btn]')?.closest('form');
  if (vicino) return vicino;
  // Pulsante fuori dal form (target esplicito, fallback sul body): il form è
  // quello del pulsante d'acquisto del tema, cercato con le stesse regole del
  // nostro «aggiungi al carrello». Review Opus 07/10: su Dawn e derivati i
  // `form[action*="/cart/add"]` sono SEMPRE due (c'è quello delle rate), e il
  // ripiego «unico form» qui sotto non prendeva mai niente.
  const delTema = trovaPulsanteAcquisto()?.closest('form');
  if (delTema) return delTema;
  const candidati = document.querySelectorAll<HTMLFormElement>('form[action*="/cart/add"]');
  return candidati.length === 1 ? candidati[0] : null;
}

/** C'è una prova segnata, un form, e il campo non c'è più (il tema ha ridisegnato il form). */
export function attribuzioneDaRimettere(): boolean {
  if (!ultimaSessione || !conLettore()) return false;
  const form = formAcquisto();
  return form !== null && !form.querySelector(`input[name="${CAMPO_ATTRIBUZIONE}"]`);
}

/**
 * Scrive (o aggiorna) il campo nascosto con l'id della sessione.
 * @returns true se il campo è nel form adesso.
 */
export function segnaProvaNelForm(sessionId: string | null): boolean {
  if (!sessionId || !conLettore()) return false;
  ultimaSessione = sessionId;
  const form = formAcquisto();
  if (!form) return false;
  let campo = form.querySelector<HTMLInputElement>(`input[name="${CAMPO_ATTRIBUZIONE}"]`);
  if (!campo) {
    campo = document.createElement('input');
    campo.type = 'hidden';
    campo.name = CAMPO_ATTRIBUZIONE;
    form.appendChild(campo);
  }
  campo.value = sessionId;
  return true;
}

/** Dopo un ridisegno del form: rimette il campo dell'ultima prova, se c'è stata. */
export function rimettiAttribuzione(): void {
  if (ultimaSessione) segnaProvaNelForm(ultimaSessione);
}
