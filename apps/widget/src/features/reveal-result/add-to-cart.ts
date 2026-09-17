/**
 * «Aggiungi al carrello» dentro il risultato della prova.
 *
 * 🔑 **Il momento conta.** L'acquirente ha appena visto il capo addosso a sé: è
 * lì che decide, non dopo aver chiuso la cabina, essere tornato alla scheda e
 * aver ritrovato il pulsante del tema. Fino a oggi la prova finiva in un vicolo
 * cieco — salva, condividi, segnala — e il passo successivo se lo doveva
 * ricordare da solo.
 *
 * 🔑 **Non chiamiamo nessuna API del carrello: premiamo il pulsante del tema.**
 * Le ragioni stanno accanto ai selettori, in `@cabina/shared`
 * (`ADD_TO_CART_ROWS`). In breve: la taglia scelta resta quella scelta, il
 * drawer del carrello si apre come sempre, e non c'è una versione di API da
 * inseguire per ognuna delle quattro piattaforme.
 */

import { ADD_TO_CART_SELECTORS } from '@cabina/shared';
import { buttonStyle } from './result-actions';

/**
 * Il pulsante d'acquisto della pagina, se ce n'è uno **utilizzabile**.
 *
 * ⚠️ `disabled` conta come assente: su quasi tutti i temi significa «taglia non
 * scelta» o «variante esaurita», e un nostro pulsante che prema quello non
 * farebbe niente — cioè prometterebbe un acquisto che non avviene.
 *
 * 📌 **Nessun controllo di visibilità**, di proposito. I temi tengono più
 * pulsanti nel DOM (barra sticky, quick-view, variante mobile) e verrebbe la
 * tentazione di scartare quelli nascosti; ma sono tutti pulsanti *della stessa
 * scheda prodotto*, quindi premerne uno nascosto aggiunge comunque il capo
 * giusto — e `.click()` non chiede che l'elemento sia visibile. Il controllo
 * costerebbe righe che in jsdom non si possono nemmeno provare (là ogni
 * elemento è "nascosto"), per distinguere due casi che finiscono uguale.
 */
/**
 * Il blocco d'acquisto **a cui il widget è già agganciato**.
 *
 * 🔑 È la risposta al caso che rovinerebbe tutto: su una scheda prodotto i
 * `form[action*="/cart/add"]` sono spesso più d'uno — i prodotti correlati con
 * l'acquisto rapido ne hanno uno ciascuno — e prendere il primo nell'ordine del
 * DOM può voler dire mettere nel carrello **un altro capo**, non quello appena
 * provato. Il nostro pulsante «Prova» invece nasce accanto al blocco d'acquisto
 * giusto: `closest('form')` da lì risale a quello, e non a un altro.
 *
 * 📌 Se il pulsante è finito sul fallback `document.body` (nessun punto
 * d'aggancio riconosciuto) non c'è nessun form attorno, e si torna a cercare in
 * tutta la pagina: meno preciso, ma è esattamente il caso in cui non abbiamo
 * niente di meglio.
 */
function contestoAcquisto(): ParentNode {
  const nostroPulsante = document.querySelector('[data-cabina-widget-btn]');
  return nostroPulsante?.closest('form') ?? document;
}

/**
 * Il primo pulsante utilizzabile, eventualmente ristretto a un contenitore.
 *
 * ⚠️ **Si cerca sempre da `document` e si filtra con `contains`**, invece di
 * chiamare `querySelectorAll` sul contenitore. Non è pignoleria: in jsdom
 * `form.querySelectorAll('form[action*="/cart/add"] [type="submit"]')`
 * restituisce **zero** — il selettore nomina un antenato che nel contesto
 * ristretto non viene considerato — e il primo giro di questa funzione
 * scivolava quindi sul fallback, riportando il pulsante del prodotto
 * *correlato*. Il test lo ha colto subito; in un browser vero non si sarebbe
 * visto, ed è il tipo di differenza d'ambiente che si scopre tardi e male.
 */
function primoUtilizzabile(dentro: ParentNode | null): HTMLElement | null {
  for (const selettore of ADD_TO_CART_SELECTORS) {
    for (const nodo of Array.from(document.querySelectorAll(selettore))) {
      const elemento = nodo as HTMLElement;
      if (dentro && dentro !== document && !(dentro as Element).contains(elemento)) continue;
      // `matches(':disabled')` e non `.disabled`: la seconda vede solo
      // l'attributo sull'elemento, e i temi disattivano l'acquisto anche
      // avvolgendo il blocco in un `<fieldset disabled>` — dove il pulsante
      // resta `disabled === false` ma non risponde a niente (rilievo Kilo).
      if (elemento.matches(':disabled')) continue;
      if (elemento.getAttribute('aria-disabled') === 'true') continue;
      return elemento;
    }
  }
  return null;
}

/**
 * ⚠️ **Se il blocco d'acquisto del widget non offre un pulsante utilizzabile,
 * la risposta è «nessuno» — non si va a cercarne uno altrove.**
 *
 * Il primo giro di questa funzione ripiegava su tutta la pagina, e quel ripiego
 * riportava dentro esattamente il difetto che il contesto serve a togliere
 * (rilievo Kilo del 04/09). Il caso che lo dimostra: il capo provato è
 * **esaurito**, quindi il suo pulsante è `disabled`; la ricerca globale lo
 * scarta, trova il pulsante *abilitato* di un prodotto correlato, e nel
 * carrello finisce un altro capo. Il ripiego non era una rete di sicurezza:
 * era il modo di sbagliare prodotto proprio quando quello giusto non si poteva
 * comprare.
 *
 * 📌 Resta la ricerca su tutta la pagina quando il widget **non ha** un blocco
 * attorno (fallback `document.body`, nessun punto d'aggancio riconosciuto): lì
 * non esiste un contesto più stretto da preferire.
 */
/** C'è un controllo d'acquisto qui dentro, **anche se disabilitato**? */
function haControlloAcquisto(dentro: Element): boolean {
  return ADD_TO_CART_SELECTORS.some((selettore) =>
    Array.from(document.querySelectorAll(selettore)).some((nodo) => dentro.contains(nodo)),
  );
}

export function trovaPulsanteAcquisto(): HTMLElement | null {
  const contesto = contestoAcquisto();
  const utilizzabile = primoUtilizzabile(contesto);
  if (utilizzabile) return utilizzabile;

  // Nessun contesto ristretto: si era già guardata tutta la pagina.
  if (contesto === document) return null;

  // 🔑 **I due modi in cui il blocco può non dare niente, e vogliono risposte
  // opposte.**
  //
  // ⛔ Il blocco **ha** un controllo d'acquisto, ma disabilitato: è il capo
  //    provato, e non si può comprare. Cercare altrove significherebbe mettere
  //    nel carrello un prodotto **diverso** proprio quando quello giusto è
  //    esaurito o senza taglia scelta.
  //
  // ✅ Il blocco **non ne ha nessuno**: allora non è un blocco d'acquisto — il
  //    merchant può aver messo `data-cabina-target` dentro un altro form, per
  //    dire quello della ricerca. Lì il contesto non dice niente sul prodotto,
  //    e nascondere il pulsante toglierebbe l'acquisto a un negozio che ce
  //    l'ha eccome.
  //
  // 📌 Le due revisioni di questa funzione hanno sbagliato una per parte:
  // prima ripiegava sempre (e sbagliava capo), poi non ripiegava mai (e
  // spariva dove serviva). La distinzione è la sintesi delle due.
  if (haControlloAcquisto(contesto as Element)) return null;
  return primoUtilizzabile(null);
}

export interface AddToCartCallbacks {
  /** Chiude la cabina: dopo l'aggiunta l'acquirente deve vedere il suo carrello,
   *  non restare davanti alla propria foto. */
  onAdded: () => void;
}

/**
 * Il pulsante, **o `null` se la pagina non ne ha uno da premere**.
 *
 * ⚠️ Restituire `null` invece di un pulsante inerte è la scelta importante di
 * questo file: un «aggiungi al carrello» che non aggiunge niente fa credere a
 * chi compra di aver comprato, e il difetto si scopre al momento di pagare.
 */
export function createAddToCartButton(
  etichetta: string,
  callbacks: AddToCartCallbacks,
): HTMLButtonElement | null {
  const pulsanteTema = trovaPulsanteAcquisto();
  if (!pulsanteTema) return null;

  const bottone = document.createElement('button');
  // ⚠️ `type` esplicito: se un giorno questo finisse dentro un `<form>`, un
  // `<button>` senza type vale `submit`. È lo stesso inciampo del 19/08 sul
  // pulsante «Prova», che apriva la cabina e inviava il form nello stesso clic.
  bottone.type = 'button';
  bottone.setAttribute('data-cabina-action-cart', '');
  bottone.textContent = etichetta;
  // Lo stesso stile degli altri bottoni della barra, in variante piena: è
  // l'azione per cui l'acquirente è qui, non la quarta di una fila.
  bottone.style.cssText = buttonStyle({ primario: true });

  bottone.addEventListener('click', () => {
    if (bottone.disabled) return;
    bottone.disabled = true;
    // Il click parte comunque, anche se il pulsante del tema è coperto
    // dall'overlay della cabina: `.click()` non ha bisogno che l'elemento sia
    // visibile o raggiungibile dal mouse.
    pulsanteTema.click();
    callbacks.onAdded();
  });

  return bottone;
}
