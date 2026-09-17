/**
 * Calibrazione delle misure corporee stimate.
 *
 * ⚠️ 2026-08-04 — questo file conteneva anche la stima da landmark MediaPipe
 * (`estimateFromLandmarks`, `extractPoseAnchors`). **MediaPipe è stato rimosso
 * dal prodotto**: non ha mai prodotto una stima utilizzabile, e le sue misure
 * finivano sistematicamente sul valore minimo del clamp (vita 50 cm su sette
 * corporature preset su otto). La storia completa è in
 * `docs/wiki/stima-misure.md`; le stime ora vengono dall'AI Vision.
 *
 * Resta la calibrazione, che serve a qualunque sorgente: le circonferenze sono
 * riferite a un'altezza, e quando l'acquirente dichiara la propria vanno
 * ri-scalate. [Source: architecture.md#Delta — AD-D1]
 */

/**
 * Altezza di riferimento quando la sorgente non ne fornisce una.
 *
 * L'AI Vision di norma stima anche l'altezza e quella diventa il riferimento;
 * questo valore copre il caso in cui manchi. ⚠️ Da una foto singola l'altezza
 * assoluta non è determinabile: finché l'acquirente non dichiara la propria,
 * la scala delle circonferenze resta un'ipotesi.
 */
export const REFERENCE_HEIGHT_CM = 170;

/** Circonferenze stimate, riferite a un'altezza di riferimento. */
export interface EstimatedCircumferences {
  bustCm: number;
  waistCm: number;
  hipsCm: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Ri-scala le circonferenze auto-rilevate in base all'altezza reale fornita.
 *
 * Le stime sono riferite a `referenceHeightCm` (quella restituita dall'AI
 * Vision, o `REFERENCE_HEIGHT_CM` se assente). Fornendo l'altezza reale `H`,
 * ogni circonferenza viene scalata `× H / referenceHeightCm` e clampata a [50, 200].
 *
 * @param base - Circonferenze auto-rilevate (campi assenti vengono ignorati).
 * @param referenceHeightCm - Altezza di riferimento delle stime base.
 * @param targetHeightCm - Altezza reale fornita dall'acquirente; `null` → nessuna
 *                         calibrazione (vengono restituiti i valori base clampati).
 */
export function calibrateCircumferences(
  base: { bustCm?: number; waistCm?: number; hipsCm?: number },
  referenceHeightCm: number,
  targetHeightCm: number | null,
): { bustCm?: number; waistCm?: number; hipsCm?: number } {
  const scale =
    targetHeightCm != null && targetHeightCm > 0 && referenceHeightCm > 0
      ? targetHeightCm / referenceHeightCm
      : 1;

  const out: { bustCm?: number; waistCm?: number; hipsCm?: number } = {};
  for (const key of ['bustCm', 'waistCm', 'hipsCm'] as const) {
    const value = base[key];
    if (value != null) {
      out[key] = clamp(Math.round(value * scale), 50, 200);
    }
  }
  return out;
}
