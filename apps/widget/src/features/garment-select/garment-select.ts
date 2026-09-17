import { MAX_MIX_AND_MATCH_GARMENTS, type FashnGarmentCategory } from '@cabina/shared';
import type { GarmentAnalysis, SelectedGarment } from '../../state/types';
import type { CatalogData, CatalogGarment } from '../../api/widget-api';

/**
 * Story 12.3 — Step "Cosa provi": selezione capo + mix&match (AC1, AC2, AC3).
 *
 * Factory DOM (pattern `model-gallery.ts` di 12.2): nessuna libreria, stili
 * inline, vanilla DOM. Tre sezioni:
 *  1. Azione default "Prova in Cabina" (AC1): usa `extractProductImageUrl()`
 *     già esistente, category 'auto', un click → GARMENTS_CONFIRMED con 1 elemento.
 *  2. Tab categorie (collezioni da `fetchCatalog`, silent-failure → solo
 *     l'azione default disponibile, MAI un errore bloccante).
 *  3. Griglia capi selezionabili con multi-select limitato a
 *     MAX_MIX_AND_MATCH_GARMENTS (3, `@cabina/shared`) + bottone "Applica" →
 *     GARMENTS_CONFIRMED.
 */

/**
 * Sotto questa confidenza NON sovrascriviamo la scelta di FASHN.
 *
 * ⚠️ Il punto non è "quanto ci fidiamo del modello" ma *cosa succede se sbaglia*:
 * passare `tops` per un vestito corto rende l'errore **garantito** (FASHN
 * sostituisce solo la parte alta), mentre con `auto` FASHN — che ha un
 * classificatore suo, sulla stessa immagine — poteva azzeccarci. Si sovrascrive
 * una decisione altrui solo da sicuri. Misurato su Qwen3-VL il 2026-07-30:
 * confidenza 0.98-0.99 su tutti e 4 i capi del dev store, quindi questa soglia
 * non tocca il caso normale. Il gemello `confidence > 0.7` di widget.ts (`CATEGORIE_CON_AVVISO`) è
 * più permissivo perché là si *rifiuta* un non-capo, qui si *forza* una scelta.
 */
const FASHN_CATEGORY_MIN_CONFIDENCE = 0.9;

/**
 * Traduce la categoria rilevata da `analyze-garment` in quella attesa da FASHN.
 *
 * ⚠️ 2026-07-30 — prima il capo della pagina prodotto partiva SEMPRE con
 * `'auto'`, cioè FASHN indovinava: su un corsetto+gonna ha scelto "tops" e ha
 * sostituito solo la parte alta, restituendo un'immagine quasi identica alla
 * foto di partenza (l'acquirente vede due immagini uguali e conclude che il
 * try-on non funziona). L'analisi del capo esisteva già ma serviva solo ad
 * angoli e taglia, e in produzione rispondeva comunque sempre `unknown` perché
 * le env dei provider vision non erano configurate.
 *
 * `footwear`/`accessory` → `auto`: FASHN non ha una categoria per loro, e il
 * motore attivo (PrunaAI) assegna i capi da sé — la categoria non gli arriva
 * proprio: `invoke_pruna_tryon` riceve byte e timeout, niente altro
 * (`tryon.py:363-368`; il commento a 288-290 dice la stessa cosa ma di Runware).
 * Nessun blocco a monte: la nota in `widget.ts` è informativa e dal 19/08
 * riguarda solo `accessory`.
 */
export function fashnCategoryFor(analysis: GarmentAnalysis | null): FashnGarmentCategory {
  if (!analysis || analysis.confidence < FASHN_CATEGORY_MIN_CONFIDENCE) return 'auto';
  switch (analysis.category) {
    case 'top':
    case 'outerwear':
      return 'tops';
    case 'bottom':
      return 'bottoms';
    case 'dress':
      return 'one-pieces';
    default:
      return 'auto';
  }
}

/**
 * 2026-08-09 — «va spogliata?» disaccoppiato da «che capo è» (PR B, piano
 * `.kilo/plans/1786288519756-residuo-vestiti-e-consiglio-taglia.md`).
 *
 * Fino a oggi la rimozione dei vestiti che l'acquirente ha già addosso era
 * legata alla categoria FASHN (`segmentation_free = category != one-pieces`):
 * su tops/bottoms/auto il residuo era la condizione PERMANENTE. Il difetto
 * dell'08/08 (maniche nere sotto l'abito tartan senza maniche) è partito con
 * `category=auto` perché l'analisi non era arrivata — log Railway alla mano.
 *
 * ⚠️ 2026-08-13 — «quasi sempre» è diventato «solo dove serve». La regola
 * precedente chiedeva la rimozione per OGNI capo, sulla base del banco del
 * 09/08: «la rimozione è per-regione e sicura — su un top la maglia sparisce e
 * i pantaloni restano». La prima metà regge, la seconda no. La regione viene
 * rimossa per davvero, ma poi FASHN la **ridisegna da zero**, e ridisegnandola
 * inventa: due prove in produzione su due (camicia azzurra `render_id`
 * 732049284003, camicia rossa `92aa1ea3dc90`) hanno restituito una collana e
 * una cintura che non esistono in nessuno dei due input, con la camicia
 * sbottonata benché il packshot sia chiuso. Non è il «caso raro» previsto.
 *
 * Verificato a parità di tutto il resto sugli input della seconda prova:
 *   remove_existing=true  + auto      → collana + cintura + camicia aperta
 *   remove_existing=true  + flat-lay  → idem, camicia ancora più aperta
 *   remove_existing=false + auto      → pulito, pantaloni dell'acquirente intatti
 * Il colpevole è questo campo, non `garment_photo_type` e non le foto.
 *
 * Quindi la rimozione si chiede SOLO dove il non chiederla è un guasto peggiore:
 *  - `one-pieces` — l'abito dell'08/08 che resta sotto quello nuovo;
 *  - `auto` — categoria non risolta: potrebbe essere un abito, e l'errore
 *    grave si evita a prezzo di qualche allucinazione nei casi in cui
 *    l'analisi del capo non risponde (scelta Arou, 13/08).
 * Su `tops`/`bottoms` il capo si appoggia sopra i vestiti esistenti: con una
 * maglia aderente sotto è esattamente il risultato che si vuole.
 *
 * Unico caso senza richiesta: footwear/accessory — su una scarpa o una borsa
 * «togli quello che hai addosso» non vuol dire niente, quindi non si chiede.
 * ⚠️ 2026-08-19 — la ragione scritta qui prima («il try-on lì non è comunque
 * supportato») era falsa: le scarpe funzionano (prove del 17/08). Il ramo resta
 * perché è comunque giusto, non perché il try-on non vada.
 * `undefined` = campo assente nel payload → il rendering applica la regola
 * legacy legata alla categoria (retrocompatibilità coi widget vecchi).
 */
export function removeExistingFor(analysis: GarmentAnalysis | null): boolean | undefined {
  if (analysis && (analysis.category === 'footwear' || analysis.category === 'accessory')) {
    return undefined;
  }
  return removeExistingForCategory(fashnCategoryFor(analysis));
}

/**
 * La regola sopra espressa sulla categoria FASHN già risolta — per i capi del
 * catalogo merchant, dove la categoria arriva dal catalogo e non da un'analisi.
 *
 * Unico punto in cui vive la decisione, e le strade sono TRE: il capo di pagina
 * (`removeExistingFor` qui sopra), il bottone «Applica» del mix&match (in questo
 * file) e la riga di swap di reveal-result (`select-style.ts`). Le ultime due
 * avevano `true` cablato: chiamare questa funzione da tutte e tre è ciò che
 * impedisce alla prossima modifica di sistemarne una sola.
 */
export function removeExistingForCategory(category: FashnGarmentCategory): boolean {
  return category !== 'tops' && category !== 'bottoms';
}

/** Parametri FASHN del capo di pagina, risolti al click (non alla costruzione). */
export interface PageGarmentParams {
  category: FashnGarmentCategory;
  removeExisting?: boolean;
}

/**
 * Categoria + rimozione del capo di pagina in un colpo solo. È anche il punto
 * in cui il fallback su `auto` smette di essere muto (Fase 4 del piano): fino
 * all'08/08 una richiesta poteva partire senza categoria certa e nessuno
 * poteva saperlo — il difetto si vedeva solo nell'immagine generata.
 */
export function resolvePageGarmentParams(analysis: GarmentAnalysis | null): PageGarmentParams {
  const category = fashnCategoryFor(analysis);
  if (category === 'auto') {
    const perche = !analysis
      ? 'analisi assente o fallita'
      : analysis.confidence < FASHN_CATEGORY_MIN_CONFIDENCE
        ? `confidenza ${analysis.confidence} sotto la soglia ${FASHN_CATEGORY_MIN_CONFIDENCE}`
        : `categoria "${analysis.category}" non mappabile su FASHN`;
    console.error(
      `[cabina] Categoria capo ricaduta su "auto" (${perche}): FASHN classificherà il capo da sé. ` +
        'La rimozione dei vestiti esistenti resta richiesta via removeExisting.',
    );
  }
  return { category, removeExisting: removeExistingFor(analysis) };
}

export interface GarmentSelectStrings {
  title: string;
  defaultAction: string;
  browseLabel: string;
  addToMix: string;
  remove: string;
  apply: string;
  mixLimitReached: string;
  loading: string;
  error: string;
}

export interface GarmentSelectCallbacks {
  /** Chiamata quando l'acquirente conferma la selezione (1-3 capi). */
  onGarmentsConfirmed: (garments: SelectedGarment[]) => void;
  /** Fornisce l'URL del capo della pagina prodotto (per l'azione default). */
  getProductImageUrl: () => string | null;
  /**
   * Parametri FASHN del capo di pagina (categoria + rimozione), risolti **al
   * click** e non alla costruzione: `analyze-garment` gira in background e può
   * non essere ancora arrivata quando questo step viene montato. Assente →
   * `{ category: 'auto', removeExisting: true }`.
   *
   * Può restituire una Promise: il click la attende invece di ripiegare sul
   * default (vedi il listener del bottone default).
   */
  getProductGarmentParams?: () => PageGarmentParams | Promise<PageGarmentParams>;
}

/**
 * Crea lo step "Cosa provi" come DocumentFragment.
 *
 * @param catalog Dati del catalogo merchant (collezioni + capi). Null se la
 *                fetch è fallita (silent-failure): solo l'azione default disponibile.
 * @param strings Etichette localizzate.
 * @param callbacks Callback per la conferma e per ottenere l'URL del capo di pagina.
 */
export function createGarmentSelect(
  catalog: CatalogData | null,
  strings: GarmentSelectStrings,
  callbacks: GarmentSelectCallbacks,
  /** Story 12.5 (Task 2.5/2.6): colore brand del merchant, applicato alle
   *  sole azioni primarie (bottone default/applica, bordo card selezionata,
   *  tab attivo). Default = fallback di `sanitizeColor` in widget.ts. */
  primaryColor = '#1a1a1a',
  /** Story 12.5 (fix code review): mix&match preservato su BACK da 'tryon'.
   *  Se presente, pre-popola la selezione multipla dei capi corrispondenti nel
   *  catalogo (match per imageUrl + category), così l'acquirente ritrova il suo
   *  mix invece di ripartire da zero. Null/assente = nessuna pre-selezione. */
  prefillSelected?: SelectedGarment[] | null,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const container = document.createElement('div');
  container.setAttribute('data-cabina-garment-select', '');

  // Titolo
  const title = document.createElement('h3');
  title.textContent = strings.title;
  title.style.cssText = 'margin:0 0 12px;font-size:15px;font-weight:600;color:#1a1a1a;';
  container.appendChild(title);

  // ── 1. Azione default "Prova in Cabina" (AC1) ──
  const defaultBtn = document.createElement('button');
  defaultBtn.type = 'button';
  defaultBtn.setAttribute('data-cabina-default-tryon', '');
  defaultBtn.textContent = strings.defaultAction;
  defaultBtn.style.cssText = [
    'display:block',
    'width:100%',
    'padding:12px',
    'margin:0 0 16px',
    `background:${primaryColor}`,
    'color:#fff',
    'border:none',
    'border-radius:8px',
    'font-size:14px',
    'font-weight:600',
    'cursor:pointer',
  ].join(';');
  /** Bottone spento mentre si attende la categoria (nessuna nuova stringa da tradurre). */
  function setDefaultBtnBusy(busy: boolean): void {
    defaultBtn.disabled = busy;
    defaultBtn.setAttribute('aria-busy', busy ? 'true' : 'false');
    defaultBtn.style.opacity = busy ? '0.6' : '1';
    defaultBtn.style.cursor = busy ? 'progress' : 'pointer';
  }

  defaultBtn.addEventListener('click', async () => {
    const url = callbacks.getProductImageUrl();
    if (!url) {
      // Il ritorno muto qui ha nascosto per mesi il fatto che su WooCommerce
      // l'estrazione dell'immagine falliva sempre: il pulsante non reagiva e
      // non c'era nulla, da nessuna parte, che dicesse perché. Il tema di un
      // merchant può sempre sfuggire ai selettori noti, quindi almeno lo si dice.
      console.warn(
        '[cabina] Immagine prodotto non trovata: il try-on non può partire. ' +
          'Il tema non espone og:image né un contenitore immagine riconosciuto ' +
          '(vedi extractProductImageUrl in utils/product-image.ts).',
      );
      return;
    }
    // ⚠️ 2026-08-02 — Chi clicca in fretta batteva l'analisi del capo (3,7-8,5s
    // misurati in produzione) e partiva con `'auto'`: FASHN sceglieva da sé e su
    // un corsetto+gonna restituiva un'immagine quasi identica alla foto di
    // partenza. Riprodotto: script veloce → `auto`, script con attesa →
    // `one-pieces`. Ora si attende, col bottone spento, invece di indovinare.
    // Tetto dell'attesa: il timeout di `analyzeGarmentFromUrl` (15s), oltre il
    // quale la promise si risolve comunque e si riparte con `'auto'`.
    setDefaultBtnBusy(true);
    // 2026-08-09 — il default senza callback chiede comunque la rimozione dei
    // vestiti: l'acquirente è vestito nel 100% dei casi e il residuo è il
    // difetto permanente, non il caso limite (vedi `removeExistingFor`).
    // 2026-08-12 — `garmentPhotoType` di default è "auto" (FASHN sceglie da sé).
    let params: PageGarmentParams = { category: 'auto', removeExisting: true };
    try {
      params = (await callbacks.getProductGarmentParams?.()) ?? params;
    } catch {
      // Analisi fallita: resta il default sopra (categoria come prima + rimozione).
    }
    setDefaultBtnBusy(false);
    // ⚠️ Chi decide se questa conferma è ancora valida è `onGarmentsConfirmed`
    // (widget.ts): durante l'attesa l'acquirente può tornare indietro o chiudere.
    // Non lo si può dedurre da qui guardando il DOM — questo step viene rimontato
    // anche quando il catalogo arriva in ritardo, e un bottone staccato non
    // distingue i due casi.
    callbacks.onGarmentsConfirmed([{
      imageUrl: url,
      category: params.category,
      removeExisting: params.removeExisting,
      garmentPhotoType: 'auto',
    }]);
  });
  container.appendChild(defaultBtn);

  // ── 2-3. Catalogo (solo se disponibile) ──
  if (catalog && catalog.collections.length > 0 && catalog.garments.length > 0) {
    const browseLabel = document.createElement('p');
    browseLabel.textContent = strings.browseLabel;
    browseLabel.style.cssText = 'margin:0 0 8px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;';
    container.appendChild(browseLabel);

    // Stato selezione (array di capi selezionati, max 3)
    const selected: CatalogGarment[] = [];

    // Story 12.5 (fix code review): ripristina il mix preservato dal reducer su
    // BACK da 'tryon'. Match per imageUrl + category contro il catalogo; rispetta
    // il cap MAX_MIX_AND_MATCH_GARMENTS e preserva l'ordine del catalogo.
    if (prefillSelected && prefillSelected.length > 0) {
      for (const g of catalog.garments) {
        if (selected.length >= MAX_MIX_AND_MATCH_GARMENTS) break;
        if (prefillSelected.some((p) => p.imageUrl === g.imageUrl && p.category === g.fashnCategory)) {
          selected.push(g);
        }
      }
    }

    // Tab categorie
    const tabsContainer = document.createElement('div');
    tabsContainer.setAttribute('data-cabina-catalog-tabs', '');
    tabsContainer.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;margin-bottom:12px;';

    // Griglia capi (aggiornata al cambio tab)
    const grid = document.createElement('div');
    grid.setAttribute('data-cabina-catalog-grid', '');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:8px;margin-bottom:12px;';

    // Bottone "Applica"
    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.textContent = strings.apply;
    applyBtn.style.cssText = [
      'display:block',
      'width:100%',
      'padding:10px',
      `background:${primaryColor}`,
      'color:#fff',
      'border:none',
      'border-radius:8px',
      'font-size:14px',
      'font-weight:600',
      'cursor:pointer',
    ].join(';');
    applyBtn.addEventListener('click', () => {
      if (selected.length === 0) return;
      const garments: SelectedGarment[] = selected.map((g) => ({
        imageUrl: g.imageUrl,
        category: g.fashnCategory,
        // 2026-08-09 — i capi di catalogo sono capi per costruzione (li sceglie
        // il merchant a mano): rimozione sempre richiesta, misurata sicura sul
        // banco (vedi `removeExistingFor`).
        // 2026-08-13 — non più "sempre": stessa regola delle altre due strade.
        // Cablato a `true`, questo flusso avrebbe continuato a produrre le
        // collane inventate del 13/08 — ed è il flusso che manda PIÙ capi
        // insieme, quindi il difetto si sarebbe moltiplicato per la cascata.
        removeExisting: removeExistingForCategory(g.fashnCategory),
        // 2026-08-12 — tipo di foto del capo: catalogo = "auto" (il merchant
        // potrebbe aver caricato packshot o model-worn, FASHN sceglie da sé).
        garmentPhotoType: 'auto',
      }));
      callbacks.onGarmentsConfirmed(garments);
    });

    // Contatore selezione
    const counter = document.createElement('p');
    counter.setAttribute('data-cabina-mix-counter', '');
    counter.style.cssText = 'font-size:12px;color:#6b7280;margin:0 0 4px;';

    // Messaggio "cap raggiunto" — nascosto di default, mostrato solo quando
    // l'acquirente prova ad aggiungere oltre MAX_MIX_AND_MATCH_GARMENTS.
    const limitMsg = document.createElement('p');
    limitMsg.setAttribute('data-cabina-mix-limit', '');
    limitMsg.textContent = strings.mixLimitReached;
    limitMsg.style.cssText = 'font-size:12px;color:#dc2626;margin:0 0 8px;display:none;';

    updateCounter();

    function updateCounter(): void {
      counter.textContent = `${selected.length}/${MAX_MIX_AND_MATCH_GARMENTS}`;
      applyBtn.disabled = selected.length === 0;
      applyBtn.style.opacity = selected.length === 0 ? '0.5' : '1';
    }

    function renderGarments(collectionId: string): void {
      grid.innerHTML = '';
      const garments = catalog!.garments.filter((g) => g.collectionId === collectionId);
      for (const garment of garments) {
        const card = document.createElement('button');
        card.type = 'button';
        card.setAttribute('data-cabina-garment-card', garment.id);
        card.style.cssText = [
          'display:flex',
          'flex-direction:column',
          'align-items:center',
          'gap:4px',
          'padding:6px',
          'border:1px solid #d1d5db',
          'border-radius:8px',
          'background:#fff',
          'cursor:pointer',
        ].join(';');

        const img = document.createElement('img');
        img.alt = '';
        img.src = garment.imageUrl;
        img.style.cssText = 'width:60px;height:60px;object-fit:contain;display:block;';
        img.addEventListener('error', () => { img.style.display = 'none'; });
        card.appendChild(img);

        const label = document.createElement('span');
        label.textContent = garment.label;
        label.style.cssText = 'font-size:10px;color:#374151;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:72px;';
        card.appendChild(label);

        function refreshCardStyle(): void {
          const isSelected = selected.some((s) => s.id === garment.id);
          card.style.borderColor = isSelected ? primaryColor : '#d1d5db';
          card.style.background = isSelected ? '#eff6ff' : '#fff';
          card.setAttribute('aria-label', `${isSelected ? strings.remove : strings.addToMix}: ${garment.label}`);
        }
        refreshCardStyle();

        card.addEventListener('click', () => {
          const idx = selected.findIndex((s) => s.id === garment.id);
          if (idx >= 0) {
            selected.splice(idx, 1);
            limitMsg.style.display = 'none';
          } else {
            if (selected.length >= MAX_MIX_AND_MATCH_GARMENTS) {
              limitMsg.style.display = 'block';
              return;
            }
            selected.push(garment);
            limitMsg.style.display = 'none';
          }
          refreshCardStyle();
          updateCounter();
        });

        grid.appendChild(card);
      }
    }

    // Crea i tab
    for (const collection of catalog.collections) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.textContent = collection.label;
      tab.setAttribute('data-cabina-catalog-tab', collection.id);
      tab.style.cssText = [
        'padding:6px 12px',
        'border:1px solid #d1d5db',
        'border-radius:6px',
        'background:#fff',
        'color:#374151',
        'font-size:12px',
        'cursor:pointer',
      ].join(';');
      tab.addEventListener('click', () => {
        // Reset stile di tutti i tab
        tabsContainer.querySelectorAll('[data-cabina-catalog-tab]').forEach((t) => {
          (t as HTMLElement).style.borderColor = '#d1d5db';
          (t as HTMLElement).style.background = '#fff';
          (t as HTMLElement).style.color = '#374151';
        });
        // Evidenzia il tab attivo
        tab.style.borderColor = primaryColor;
        tab.style.background = '#eff6ff';
        tab.style.color = primaryColor;
        renderGarments(collection.id);
      });
      tabsContainer.appendChild(tab);
    }

    container.appendChild(tabsContainer);
    container.appendChild(grid);
    container.appendChild(counter);
    container.appendChild(limitMsg);
    container.appendChild(applyBtn);

    // Seleziona il primo tab di default
    const firstTab = tabsContainer.querySelector('[data-cabina-catalog-tab]') as HTMLElement | null;
    if (firstTab) firstTab.click();
  }

  fragment.appendChild(container);
  return fragment;
}
