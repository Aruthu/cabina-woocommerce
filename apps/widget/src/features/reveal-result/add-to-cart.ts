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
  /** Chiude la cabina. Solo dove l'esito non si può leggere (fuori da Shopify):
   *  lì il tema apre il suo carrello o ricarica la pagina, ed è quello il
   *  riscontro. */
  onAdded: () => void;
}

/** I testi del pulsante nei suoi stati. */
export interface AddToCartLabels {
  add: string;
  adding: string;
  /** Riuscito; il pulsante porta poi al carrello. */
  added: string;
  /** Non confermato entro l'attesa; anche questo porta al carrello. */
  failed: string;
}

/** Quanto si aspetta che il carrello cambi dopo il clic sul pulsante del tema. */
const ATTESA_MS = 8000;
const PASSO_MS = 400;

/**
 * L'URL di `cart.js`, o null fuori da Shopify.
 *
 * `Shopify.routes.root` porta il prefisso della lingua o del mercato (`/it/`):
 * un `/cart.js` fisso funziona lo stesso, ma su un mercato con dominio suo
 * lascerebbe la sessione del carrello sbagliata.
 */
function cartJsUrl(): string | null {
  const shopify = (window as unknown as { Shopify?: { routes?: { root?: string } } }).Shopify;
  if (!shopify) return null;
  return `${shopify.routes?.root ?? '/'}cart.js`;
}

/**
 * Quanti pezzi della variante `variante` ci sono nel carrello (tutte le righe);
 * null se `cart.js` non si legge o non elenca le righe.
 *
 * La variante e mai il totale (review #244): un altro prodotto aggiunto nel
 * frattempo, da un'altra scheda o dal drawer, farebbe dire «Aggiunto» per un
 * capo che nel carrello non c'è. Senza `items` non si ripiega su `item_count`,
 * per la stessa ragione: il carrello conta come illeggibile.
 */
async function contaCarrello(url: string, variante: string): Promise<number | null> {
  try {
    // `no-store`: un conteggio vecchio dalla cache darebbe un falso «non confermato» (review #244).
    const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const cart = (await res.json()) as { items?: { variant_id?: unknown; quantity?: unknown }[] };
    if (!Array.isArray(cart.items)) return null;
    return cart.items
      .filter((riga) => String(riga.variant_id) === variante)
      .reduce((somma, riga) => somma + (typeof riga.quantity === 'number' ? riga.quantity : 0), 0);
  } catch {
    return null;
  }
}

/** True appena il carrello ha più pezzi di `prima`, false allo scadere dell'attesa. */
async function attendiAumento(url: string, variante: string, prima: number): Promise<boolean> {
  const fine = Date.now() + ATTESA_MS;
  while (Date.now() < fine) {
    await new Promise((r) => setTimeout(r, PASSO_MS));
    const ora = await contaCarrello(url, variante);
    if (ora != null && ora > prima) return true;
  }
  return false;
}

/**
 * Il pulsante, **o `null` se la pagina non ne ha uno da premere**.
 *
 * ⚠️ Restituire `null` invece di un pulsante inerte è la scelta importante di
 * questo file: un «aggiungi al carrello» che non aggiunge niente fa credere a
 * chi compra di aver comprato, e il difetto si scopre al momento di pagare.
 *
 * 🔑 2026-09-23 (Arou, collaudo con Mem): **l'acquirente deve sapere se il capo
 * è nel carrello.** Prima il clic chiudeva la cabina contando sul drawer del
 * tema; su un tema senza drawer la prova spariva e non succedeva niente di
 * visibile. Su Shopify ora la cabina resta aperta e il pulsante dice l'esito,
 * **letto dal carrello** (`cart.js` prima e dopo il clic), non supposto:
 * «Aggiunto ✓» porta poi al carrello. Fuori da Shopify l'esito non si legge, e
 * resta la chiusura di prima.
 *
 * ⚠️ **Il pulsante del tema si preme una volta sola** (review #244). Se il
 * carrello non cambia entro l'attesa il pulsante dice «non confermato» e porta
 * al carrello, invece di offrire un «riprova»: un'aggiunta più lenta
 * dell'attesa arriverebbe comunque, e il secondo clic comprerebbe due volte.
 * Un rifiuto vero (esaurito, quantità) lo mostra il tema sul suo pulsante.
 */
export function createAddToCartButton(
  testi: AddToCartLabels,
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
  // L'esito cambia il testo del pulsante: annunciato anche a chi usa uno screen reader.
  bottone.setAttribute('aria-live', 'polite');
  bottone.textContent = testi.add;
  // Lo stesso stile degli altri bottoni della barra, in variante piena: è
  // l'azione per cui l'acquirente è qui, non la quarta di una fila.
  bottone.style.cssText = buttonStyle({ primario: true });

  // Dopo l'esito, confermato o no, il pulsante porta al carrello.
  let carrello: string | null = null;

  const esito = (url: string, stato: 'added' | 'failed'): void => {
    carrello = url.replace(/\.js$/, '');
    bottone.disabled = false;
    bottone.setAttribute('data-cabina-cart-state', stato);
    bottone.textContent = stato === 'added' ? testi.added : testi.failed;
  };

  bottone.addEventListener('click', async () => {
    if (bottone.disabled) return;
    if (carrello) {
      window.location.assign(carrello);
      return;
    }
    bottone.disabled = true;

    // Il click parte comunque, anche se il pulsante del tema è coperto
    // dall'overlay della cabina: `.click()` non ha bisogno che l'elemento sia
    // visibile o raggiungibile dal mouse.
    const url = cartJsUrl();
    if (!url) {
      pulsanteTema.click();
      callbacks.onAdded();
      return;
    }

    bottone.textContent = testi.adding;
    // La variante che il tema sta per aggiungere: quella nel suo form, al momento del clic.
    const variante =
      pulsanteTema.closest('form')?.querySelector<HTMLInputElement | HTMLSelectElement>('[name="id"]')?.value || null;
    // Senza variante o con il carrello illeggibile l'esito non si verifica: si
    // preme il tema e si chiude come prima, mai un esito indovinato (review #244).
    const prima = variante ? await contaCarrello(url, variante) : null;
    if (!variante || prima == null) {
      pulsanteTema.click();
      callbacks.onAdded();
      return;
    }
    pulsanteTema.click();
    esito(url, (await attendiAumento(url, variante, prima)) ? 'added' : 'failed');
  });

  return bottone;
}
