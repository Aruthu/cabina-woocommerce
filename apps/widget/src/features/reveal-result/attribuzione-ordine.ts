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
 * riga è l'unica fonte. Solo su Shopify: altrove il campo non avrebbe lettore.
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

function suShopify(): boolean {
  return typeof window !== 'undefined' && 'Shopify' in window;
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
  if (!ultimaSessione || !suShopify()) return false;
  const form = formAcquisto();
  return form !== null && !form.querySelector(`input[name="${CAMPO_ATTRIBUZIONE}"]`);
}

/**
 * Scrive (o aggiorna) il campo nascosto con l'id della sessione.
 * @returns true se il campo è nel form adesso.
 */
export function segnaProvaNelForm(sessionId: string | null): boolean {
  if (!sessionId || !suShopify()) return false;
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
