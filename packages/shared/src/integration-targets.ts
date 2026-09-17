/**
 * Dove il widget cerca il pulsante e dove cerca l'immagine del capo.
 *
 * ⚠️ **Questi due elenchi stanno qui perché sono documentati.** Vivevano in
 * `apps/widget/src/widget.ts` e `apps/widget/src/utils/product-image.ts`, e
 * finché ci sono rimasti la pagina `/en/docs` avrebbe dovuto **ricopiarli**.
 * Una copia non sa quando l'originale cambia: il 19/08 lo stesso repo ha speso
 * una PR intera a rettificare una riga di documentazione che era vera quando fu
 * scritta e falsa il giorno dopo, e nessun test l'aveva vista.
 *
 * 🔑 Importati, invece, i due documenti non possono invecchiare in silenzio:
 * togliere un selettore lo toglie anche dalla tabella che lo promette.
 *
 * I commenti che spiegano *perché* un selettore c'è restano qui, non nella
 * documentazione: la pagina pubblica dice a un negoziante cosa fare, non
 * perché il 26/07 WooCommerce ci abbia colto in fallo.
 *
 * ⚠️ **La piattaforma sta accanto al selettore, non si deduce dal suo testo**
 * (rilievo Kilo del 19/08). Prima la guida la indovinava da una `piattaformaDi`
 * che, per qualunque selettore non riconosciuto, rispondeva `'Shopify'`: un
 * selettore PrestaShop chiamato `.foo` sarebbe finito nella tabella pubblica
 * etichettato Shopify, **senza che niente si rompesse**. Qui invece il tipo
 * pretende il campo: aggiungere una riga senza dire di chi è non compila.
 */

/**
 * Punti d'aggancio del pulsante, **dal più specifico al più generico**: va
 * SUBITO DOPO il blocco d'acquisto, dove l'acquirente sta già decidendo.
 *
 * ⚠️ 2026-07-29 — prima esisteva solo `[data-cabina-target]`, che **nessun tema
 * contiene**: in pratica si finiva sempre sul fallback `document.body`, cioè una
 * striscia in fondo alla pagina, sotto la piega, dove nessuno la cerca. Il
 * pulsante c'era e sembrava "sparito". Stessa classe di problema dei selettori
 * immagine prodotto (26/07): un fallback tecnicamente valido che nel mondo reale
 * è la strada presa sempre.
 */
export const BUTTON_ANCHOR_ROWS = [
  // Shopify — form del carrello e blocco pulsanti dei temi moderni
  { selector: '.product-form__buttons', platform: 'Shopify' },
  { selector: 'form[action*="/cart/add"] .product-form__submit', platform: 'Shopify' },
  { selector: 'form[action*="/cart/add"]', platform: 'Shopify' },
  { selector: 'form.cart', platform: 'WooCommerce' },
  { selector: '.single_add_to_cart_button', platform: 'WooCommerce' },
  { selector: '.product-add-to-cart', platform: 'PrestaShop' },
  { selector: '#add-to-cart-or-refresh', platform: 'PrestaShop' },
] as const;

/** Solo i selettori, nell'ordine: e' cio' che serve a `injectButton`. */
export const BUTTON_ANCHORS: readonly string[] = BUTTON_ANCHOR_ROWS.map((r) => r.selector);

/**
 * Attributo con cui il merchant sceglie **lui** dove va il pulsante. Vince su
 * `BUTTON_ANCHORS`, e il pulsante finisce DENTRO l'elemento, non accanto.
 */
export const BUTTON_TARGET_ATTR = 'data-cabina-target';

/**
 * Parametro con cui una pagina *diversa* chiede di aprire la cabina appena si
 * arriva, senza far premere il pulsante una seconda volta.
 *
 * Nasce dal badge "Prova" sulle card di collezione (tema Cabina, 2026-08-20).
 * Il badge non può aprire la cabina dov'è: in una griglia non c'è un riquadro
 * `[data-cabina-stage]` in cui montarla, e il capo verrebbe preso dall'`og:image`
 * della collezione — cioè un capo qualsiasi. Porta quindi alla pagina prodotto,
 * dove entrambe le cose sono a posto, e questo parametro dice «l'acquirente ha
 * gia' chiesto la prova, non chiederglielo di nuovo».
 *
 * ⚠️ Va consumato all'arrivo (`history.replaceState`): l'apertura conta una
 * sessione e la prova spende crediti del merchant, quindi un URL che se lo
 * tiene riaprirebbe la cabina a ogni ricarica — e condiviso o messo nei
 * preferiti, la aprirebbe a chiunque.
 */
export const AUTO_OPEN_PARAM = 'cabina';
export const AUTO_OPEN_VALUE = 'prova';

/**
 * Fallback per l'immagine del capo, quando né `og:image` né `twitter:image`
 * sono presenti: il primo `<img>` dentro un contenitore prodotto noto.
 *
 * ⚠️ 2026-07-26 — fino ad allora questa lista conteneva **solo selettori
 * Shopify**, e su WooCommerce nessuno dei dieci matchava. Siccome WooCommerce
 * non emette `og:image` senza un plugin SEO, l'estrazione tornava `null` e il
 * pulsante "Prova in Cabina" non faceva nulla, **in silenzio**: il try-on era
 * irraggiungibile su qualsiasi negozio WooCommerce senza Yoast o simili.
 *
 * I selettori WooCommerce stanno PRIMA perché sono i più specifici. Nota:
 * `.woocommerce-product-gallery img` (generico) NON va usato — cattura l'icona
 * lente d'ingrandimento di WordPress (`s.w.org/.../1f50d.svg`).
 */
export const PRODUCT_IMAGE_ROWS = [
  // Wix Stores (06/09/2026): il data-hook della foto principale della PDP. Serve
  // anche allo stage automatico della prova (vedi tryon-overlay `creaStageSullaFoto`).
  { selector: '[data-hook="ProductImageDataHook.ProductImage"]', platform: 'Wix' },
  { selector: '.woocommerce-product-gallery__image img', platform: 'WooCommerce' },
  { selector: 'img.wp-post-image', platform: 'WooCommerce' },
  { selector: '.wp-block-woocommerce-product-image img', platform: 'WooCommerce' },
  { selector: '.product__image img', platform: 'Shopify' },
  { selector: '.product-image img', platform: 'Shopify' },
  { selector: '.product-photo img', platform: 'Shopify' },
  { selector: '.product-single__photo img', platform: 'Shopify' },
  { selector: '[data-product-image] img', platform: 'Shopify' },
  { selector: '.product-featured-image img', platform: 'Shopify' },
  { selector: '.product-gallery img', platform: 'Shopify' },
  { selector: '.product-img img', platform: 'Shopify' },
  { selector: '.product__media img', platform: 'Shopify' },
  { selector: '.main-product-image img', platform: 'Shopify' },
] as const;

/** Solo i selettori, nell'ordine: e' cio' che serve a `extractProductImageUrl`. */
export const PRODUCT_IMAGE_SELECTORS: readonly string[] = PRODUCT_IMAGE_ROWS.map((r) => r.selector);

/**
 * Il pulsante «aggiungi al carrello» **della pagina**, quello vero del tema.
 *
 * 🔑 **Perché cerchiamo il loro pulsante invece di chiamare l'API del
 * carrello.** Dopo la prova l'acquirente ha appena visto il capo addosso, ed è
 * il momento in cui compra: ma per metterlo nel carrello ci sono quattro API
 * diverse (`/cart/add.js`, `?add-to-cart=`, PrestaShop, Wix), ognuna con la sua
 * versione, i suoi token e i suoi cambiamenti. Azionare il pulsante che è già
 * nella pagina costa una riga e:
 *
 * - **rispetta la taglia e la variante** che l'acquirente ha già scelto, senza
 *   che noi si debba leggere lo stato del selettore del tema;
 * - fa scattare **quello che il tema fa di suo** — il drawer del carrello, le
 *   validazioni, gli upsell — invece di scavalcarlo;
 * - funziona anche sui temi su misura, che nessun elenco di API coprirebbe.
 *
 * ⚠️ **Se non lo troviamo, il nostro pulsante non compare.** Un «aggiungi al
 * carrello» che non aggiunge niente è peggio della sua assenza: l'acquirente
 * crede di aver comprato. Vale anche per un pulsante nativo `disabled`, che di
 * solito significa taglia non scelta o variante esaurita.
 *
 * 📌 Qui NON c'è Wix: il suo selettore non è stato verificato su un sito vero,
 * e questo elenco contiene solo ciò che è stato visto funzionare. Su Wix il
 * pulsante semplicemente non compare, che è il comportamento giusto finché la
 * riga non si può scrivere con cognizione.
 *
 * ⚠️ **Sono selettori generici, e da soli non bastano.** Una scheda prodotto
 * ne contiene spesso più d'uno: i prodotti correlati con l'acquisto rapido
 * hanno anche loro un `form[action*="/cart/add"]`, e il primo nell'ordine del
 * DOM può essere quello di **un altro capo** — che finirebbe nel carrello al
 * posto di quello provato. Per questo `trovaPulsanteAcquisto` cerca prima
 * dentro il blocco d'acquisto a cui il widget è già agganciato, e solo in
 * mancanza di quello guarda l'intera pagina (rilievo Kilo del 04/09).
 *
 * 📌 `.add-to-cart` nudo è stato tolto per la stessa ragione: su PrestaShop
 * resta `[data-button-action="add-to-cart"]`, che è del pulsante vero e non di
 * una classe che chiunque può riusare in una card.
 */
export const ADD_TO_CART_ROWS = [
  { selector: 'form[action*="/cart/add"] [type="submit"]', platform: 'Shopify' },
  { selector: '.product-form__submit', platform: 'Shopify' },
  { selector: '.single_add_to_cart_button', platform: 'WooCommerce' },
  { selector: '[data-button-action="add-to-cart"]', platform: 'PrestaShop' },
] as const;

/** Solo i selettori, nell'ordine: è ciò che serve a `trovaPulsanteAcquisto`. */
export const ADD_TO_CART_SELECTORS: readonly string[] = ADD_TO_CART_ROWS.map((r) => r.selector);
