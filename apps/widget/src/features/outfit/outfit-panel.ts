/**
 * Il pannello «Completa il look» sotto il risultato (18/09/2026).
 *
 * Stessa fila compatta del vecchio «scambia capo» (`select-style.ts`), con due
 * differenze che sono il senso della funzione: i capi si AGGIUNGONO a quello
 * della pagina invece di sostituirlo, e partono tutti insieme con «Prova
 * insieme» — una generazione, ~12 s, 2 prove al merchant con 3 capi.
 *
 * A differenza dello scambio, qui un errore si DICE: l'acquirente ha chiesto
 * esplicitamente il look e aspetta ~12 s, il silenzio sembrerebbe un blocco.
 */
import { tocca, MAX_CAPI_AGGIUNTI, type CapoOutfit } from './outfit';

export interface OutfitPanelStrings {
  label: string;
  tryTogether: string;
  loading: string;
  error: string;
}

export function createOutfitPanel(
  capi: readonly CapoOutfit[],
  strings: OutfitPanelStrings,
  /** Prova il capo della pagina più la selezione; `false` = non è riuscito. */
  onProva: (selezione: CapoOutfit[]) => Promise<boolean>,
): HTMLElement {
  const container = document.createElement('div');
  container.setAttribute('data-cabina-outfit', '');
  // Centrato e stretto: la barra sotto il risultato è larga quanto la finestra,
  // e a sinistra il pannello finiva lontano dalla foto (visto nell'anteprima).
  // Fondo scuro come il badge taglia: sta sopra la foto e deve restare leggibile.
  container.style.cssText = [
    'display:flex', 'flex-direction:column', 'gap:4px', 'padding:8px 12px',
    'align-self:center', 'box-sizing:border-box', 'max-width:min(460px, 92vw)',
    'background:rgba(0,0,0,0.45)', 'border-radius:10px',
    'backdrop-filter:blur(10px)', '-webkit-backdrop-filter:blur(10px)',
  ].join(';');

  // L'intestazione è un pulsante: dopo un look riuscito il pannello si chiude
  // (copriva gambe e scarpe, cioè proprio il look appena provato — visto
  // nell'anteprima) e da qui si riapre.
  const label = document.createElement('button');
  label.type = 'button';
  label.setAttribute('data-cabina-outfit-toggle', '');
  label.textContent = strings.label;
  label.style.cssText = 'align-self:flex-start;padding:0;border:none;background:none;font-family:inherit;cursor:pointer;font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.05em;';
  container.appendChild(label);

  const row = document.createElement('div');
  row.setAttribute('data-cabina-outfit-row', '');
  row.style.cssText = 'display:flex;gap:6px;overflow-x:auto;padding:4px 0;-webkit-overflow-scrolling:touch;scrollbar-width:none;';
  container.appendChild(row);

  const azioni = document.createElement('div');
  azioni.style.cssText = 'display:flex;align-items:center;gap:8px;';
  const prova = document.createElement('button');
  prova.type = 'button';
  prova.setAttribute('data-cabina-outfit-try', '');
  prova.style.cssText = 'padding:8px 14px;border:none;border-radius:999px;background:#fff;color:#1a1a1a;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;';
  const esito = document.createElement('span');
  esito.setAttribute('data-cabina-outfit-status', '');
  esito.setAttribute('role', 'status');
  esito.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.85);';
  azioni.appendChild(prova);
  azioni.appendChild(esito);
  container.appendChild(azioni);

  let selezione: CapoOutfit[] = [];
  let inCorso = false;
  const apri = (aperto: boolean): void => {
    row.style.display = aperto ? 'flex' : 'none';
    azioni.style.display = aperto ? 'flex' : 'none';
    label.setAttribute('aria-expanded', aperto ? 'true' : 'false');
  };
  label.addEventListener('click', () => apri(row.style.display === 'none'));
  const carte: Array<[CapoOutfit, HTMLButtonElement]> = [];

  const aggiorna = (): void => {
    for (const [capo, carta] of carte) {
      const scelto = selezione.some((s) => s.id === capo.id);
      carta.setAttribute('aria-pressed', scelto ? 'true' : 'false');
      carta.style.borderColor = scelto ? '#fff' : 'rgba(255,255,255,0.2)';
      carta.style.background = scelto ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)';
    }
    prova.textContent = inCorso ? strings.loading : `${strings.tryTogether} (${selezione.length}/${MAX_CAPI_AGGIUNTI})`;
    prova.disabled = inCorso || selezione.length === 0;
    prova.style.opacity = prova.disabled ? '0.5' : '1';
  };

  for (const capo of capi) {
    const carta = document.createElement('button');
    carta.type = 'button';
    carta.setAttribute('data-cabina-outfit-card', capo.id);
    carta.setAttribute('aria-label', capo.label);
    carta.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px;padding:4px;border:1px solid rgba(255,255,255,0.2);border-radius:6px;background:rgba(255,255,255,0.1);cursor:pointer;flex-shrink:0;width:56px;';
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = capo.imageUrl;
    img.style.cssText = 'width:40px;height:40px;object-fit:contain;display:block;';
    img.addEventListener('error', () => { img.style.display = 'none'; });
    carta.appendChild(img);
    const nome = document.createElement('span');
    nome.textContent = capo.label;
    nome.style.cssText = 'font-size:9px;color:rgba(255,255,255,0.85);text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:50px;';
    carta.appendChild(nome);
    carta.addEventListener('click', () => {
      if (inCorso) return;
      selezione = tocca(selezione, capo);
      esito.textContent = '';
      aggiorna();
    });
    carte.push([capo, carta]);
    row.appendChild(carta);
  }

  prova.addEventListener('click', async () => {
    if (inCorso || selezione.length === 0) return;
    inCorso = true;
    esito.textContent = '';
    aggiorna();
    let ok = false;
    try {
      ok = await onProva(selezione);
    } catch {
      ok = false;
    }
    inCorso = false;
    esito.textContent = ok ? '' : strings.error;
    aggiorna();
    if (ok) apri(false);
  });

  aggiorna();
  apri(true);
  return container;
}
