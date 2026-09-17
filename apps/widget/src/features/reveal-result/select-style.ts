/**
 * Story 12.4 — Select style: fila orizzontale di capi selezionabili (AC2).
 *
 * Dati da `fetchCatalog` (Story 12.3, silent-failure → riga vuota/nascosta).
 * Click su un capo → `tryonGenerative` con **un solo capo** (non l'intero
 * mix&match) — lo scambio è "prova quest'altro capo", non "aggiungi al mix".
 *
 * NON introduce un nuovo WidgetState — aggiornamento imperativo locale,
 * stesso stile di `updateSizeBadge` (tryon-overlay.ts).
 */

import type { CatalogData, CatalogGarment } from '../../api/widget-api';
import { removeExistingForCategory } from '../garment-select/garment-select';
import type { SelectedGarment } from '../../state/types';

export interface SelectStyleStrings {
  label: string;
}

export interface SelectStyleCallbacks {
  /** Chiamata quando un capo è selezionato per il try-on swap. */
  onGarmentSelected: (garment: SelectedGarment) => void;
  /** Restituisce la foto corrente per la chiamata tryonGenerative. */
  getPhotoData: () => string | null;
}

/**
 * Crea la fila orizzontale di capi come DocumentFragment.
 *
 * @param catalog Dati del catalogo merchant (null = riga vuota, nessun errore)
 * @param strings Etichette localizzate
 * @param callbacks Callback per la selezione capo
 */
export function createSelectStyle(
  catalog: CatalogData | null,
  strings: SelectStyleStrings,
  callbacks: SelectStyleCallbacks,
): DocumentFragment {
  const fragment = document.createDocumentFragment();

  const container = document.createElement('div');
  container.setAttribute('data-cabina-select-style', '');
  container.style.cssText = [
    'display:flex',
    'flex-direction:column',
    'gap:4px',
    'padding:4px 12px',
  ].join(';');

  const label = document.createElement('span');
  label.textContent = strings.label;
  label.style.cssText = 'font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.05em;';
  container.appendChild(label);

  if (!catalog || catalog.garments.length === 0) {
    // Nessun capo disponibile → riga vuota (silent-failure, NFR-12)
    container.style.display = 'none';
    fragment.appendChild(container);
    return fragment;
  }

  // Solo i primi 12 capi (non scroll infinito, la fila è orizzontale compatta)
  const maxGarments = Math.min(catalog.garments.length, 12);
  const garments = catalog.garments.slice(0, maxGarments);

  const row = document.createElement('div');
  row.setAttribute('data-cabina-select-style-row', '');
  row.style.cssText = [
    'display:flex',
    'gap:6px',
    'overflow-x:auto',
    'padding:4px 0',
    '-webkit-overflow-scrolling:touch',
    'scrollbar-width:none', // Firefox
  ].join(';');

  for (const garment of garments) {
    const card = document.createElement('button');
    card.type = 'button';
    card.setAttribute('data-cabina-style-card', garment.id);
    card.setAttribute('aria-label', garment.label);
    card.style.cssText = [
      'display:flex',
      'flex-direction:column',
      'align-items:center',
      'gap:2px',
      'padding:4px',
      'border:1px solid rgba(255,255,255,0.2)',
      'border-radius:6px',
      'background:rgba(255,255,255,0.1)',
      'cursor:pointer',
      'flex-shrink:0',
      'width:56px',
    ].join(';');

    const img = document.createElement('img');
    img.alt = '';
    img.src = garment.imageUrl;
    img.style.cssText = 'width:40px;height:40px;object-fit:contain;display:block;';
    img.addEventListener('error', () => { img.style.display = 'none'; });
    card.appendChild(img);

    const nameSpan = document.createElement('span');
    nameSpan.textContent = garment.label;
    nameSpan.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.85);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:50px;';
    card.appendChild(nameSpan);

    card.addEventListener('click', () => {
      callbacks.onGarmentSelected({
        imageUrl: garment.imageUrl,
        category: garment.fashnCategory,
        // 2026-08-09 — capo da catalogo merchant: rimozione dei vestiti sempre
        // richiesta (misurata sicura sul banco, vedi `removeExistingFor`).
        // 2026-08-13 — non più "sempre": stessa regola del capo di pagina, qui
        // applicata alla categoria del catalogo. Cablato a `true`, il mix&match
        // avrebbe continuato a produrre le collane inventate del 13/08.
        removeExisting: removeExistingForCategory(garment.fashnCategory),
      });
    });

    row.appendChild(card);
  }

  container.appendChild(row);
  fragment.appendChild(container);
  return fragment;
}