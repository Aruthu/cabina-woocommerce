/**
 * Preseleziona la taglia consigliata nel selettore della PAGINA PRODOTTO.
 *
 * Nasce dal collaudo del 2026-08-07: la cabina consigliava L mentre sulla
 * pagina restava selezionata XS. Il consiglio si leggeva e poi andava
 * riapplicato a mano — cioè quasi mai.
 *
 * ⚠️ Questo è l'unico punto del widget che **scrive** nel DOM del negozio
 * invece di limitarsi a leggerlo. Da qui le due regole che governano il file:
 *
 *  1. **Nel dubbio non si tocca.** Si agisce solo su un gruppo di opzioni
 *     riconosciuto come «taglia» (per nome, legend o label). Un negozio che
 *     chiama l'opzione in un modo che non riconosciamo resta com'è: preferibile
 *     a selezionare per sbaglio il colore, che è ciò che accadrebbe cercando
 *     ovunque un `value` uguale a "S" o "M".
 *  2. **Mai dentro la cabina.** Qualunque `input`/`select` con un antenato
 *     `data-cabina-*` è roba nostra (catalogo mix&match, form misure) e va
 *     saltato.
 *
 * L'evento è quello che il tema si aspetta: `.click()` sui radio (Shopify Dawn
 * ascolta il click sulla label/input, non un `checked` scritto a mano) e
 * `change` che bolla sui `select`. Scrivere la proprietà senza notificare
 * lascerebbe il tema convinto della variante vecchia — prezzo e "Aggiungi al
 * carrello" resterebbero su quella sbagliata.
 */

/** Come si chiama «taglia» nei temi delle 5 lingue che serviamo, più le grafie
 *  tedesche senza umlaut che i temi usano spesso negli attributi. */
const SIZE_OPTION_NAME = /(size|taglia|talla|gr(ö|oe|o)sse|taille|maat)/i;

/** True se l'elemento vive dentro l'interfaccia del widget e non nel negozio. */
function isInsideWidget(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    for (const attr of Array.from(node.attributes)) {
      if (attr.name.startsWith('data-cabina')) return true;
    }
  }
  return false;
}

/**
 * Tutto il testo che, attorno a un controllo, può dire che è la taglia:
 * l'attributo `name`, l'`id`, l'`aria-label`, la `<legend>` del fieldset che lo
 * contiene e la `<label for>` che lo descrive.
 */
function optionContext(el: HTMLInputElement | HTMLSelectElement): string {
  const parts = [el.name, el.id, el.getAttribute('aria-label') ?? ''];
  const legend = el.closest('fieldset')?.querySelector('legend')?.textContent;
  if (legend) parts.push(legend);
  if (el.id) {
    // `CSS.escape` non è garantito su tutti i browser supportati: l'id qui
    // arriva dal tema del merchant e può contenere caratteri che romperebbero
    // il selettore, quindi si confronta l'attributo invece di interpolarlo.
    for (const label of Array.from(document.querySelectorAll('label[for]'))) {
      if (label.getAttribute('for') === el.id) parts.push(label.textContent ?? '');
    }
  }
  return parts.join(' ');
}

/** Confronto fra etichette di taglia: "L" == " l " == "l". */
function sameSize(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Cerca il selettore taglia del negozio e ci seleziona `size`.
 *
 * @returns true se una selezione è stata applicata (o era già quella giusta),
 *          false se nessun selettore taglia riconoscibile è stato trovato.
 */
export function preselectSizeOnPage(size: string): boolean {
  if (!size.trim()) return false;

  // ── Radio / pill (Shopify Dawn, WooCommerce con varianti a bottoni) ────────
  const radios = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
  ).filter((el) => !isInsideWidget(el) && SIZE_OPTION_NAME.test(optionContext(el)));

  const radio = radios.find((el) => sameSize(el.value, size));
  if (radio) {
    if (!radio.checked) radio.click();
    return true;
  }

  // ── Select (Dawn in modalità dropdown, PrestaShop, temi classici) ──────────
  const selects = Array.from(document.querySelectorAll<HTMLSelectElement>('select')).filter(
    (el) => !isInsideWidget(el) && SIZE_OPTION_NAME.test(optionContext(el)),
  );

  for (const select of selects) {
    const option = Array.from(select.options).find(
      (o) => sameSize(o.value, size) || sameSize(o.textContent ?? '', size),
    );
    if (!option) continue;
    if (select.value !== option.value) {
      select.value = option.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }

  return false;
}
