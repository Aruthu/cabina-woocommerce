const STORAGE_PREFIX = 'cabina_measures_';

/**
 * ⚠️ 2026-08-17 — di questo modulo resta **solo la cancellazione**.
 *
 * La casella «Ricorda le mie misure» è stata tolta insieme agli altri passaggi:
 * le misure le stima l'AI dalla foto a ogni prova, quindi ricordarle valeva poco
 * e costava una spunta in più su dati del corpo di una persona reale.
 *
 * 🔑 Ma smettere di leggere una chiave **non cancella ciò che c'è già dentro**:
 * chi ha spuntato «Ricorda» nelle settimane scorse ha altezza, busto, vita e
 * fianchi nel proprio `localStorage`, e senza questa riga ce li terrebbe per
 * sempre, senza più nemmeno una schermata da cui toglierli. *Cancellare una
 * funzione non cancella i dati che ha prodotto.* Perciò `initWidget` chiama
 * questa a ogni avvio: costa un `removeItem` e chiude la coda.
 */
export function clearMeasurements(apiKey: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${apiKey}`);
  } catch (e) {
    console.warn('[widget] Failed to clear measurements from localStorage', e);
  }
}
