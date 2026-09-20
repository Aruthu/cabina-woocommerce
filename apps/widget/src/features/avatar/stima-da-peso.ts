/**
 * Busto, vita e fianchi da altezza + peso (18/09/2026).
 *
 * Perché esiste: la stima dalla sola foto è stabile ma **tira tutti verso la
 * media** — misurato sul banco delle corporature (`scripts/foto-misure/`): un
 * uomo magro usciva L invece di M, una donna obesa L invece di XL, e dichiarare
 * l'altezza non lo correggeva (corregge la scala, non la corporatura). Il peso
 * la corporatura la dice. Il form lo chiedeva già e nessun calcolo lo usava.
 *
 * Da dove vengono i numeri — nessuno è scelto a occhio:
 *  - regressione lineare su **ANSUR II** (esercito USA, 2012, 4.082 uomini e
 *    1.986 donne misurati col metro). Verificata su un 30% di persone tenute
 *    fuori dal calcolo: errore medio busto 2,5–3,4 cm, vita 3,4–3,9, fianchi
 *    2,0–2,2 col sesso noto (fianchi donne 4,0 senza);
 *  - ANSUR II misura la vita **all'ombelico**; le tabelle taglie usano la vita
 *    naturale, più stretta. Il rapporto viene da **ANSUR 1988**, che le misura
 *    entrambe sulle stesse persone (2.208 donne, 1.774 uomini): donne 0,919 in
 *    media, uomini 0,975, e scende col BMI. Verificata sulla vita naturale del
 *    1988: errore medio 2,9 cm donne, 3,2 uomini.
 *
 * ⚠️ Limiti da sapere: ANSUR sono militari, quindi pochi obesi (BMI oltre 35:
 * 19 donne, 187 uomini) — sopra quella soglia la formula estrapola. E non è mai
 * stata confrontata con persone vere di un negozio: la taratura vera arriva dal
 * metro (sezione 3 di `scripts/banco-misure.mjs`).
 *
 * Lo script che ha prodotto i coefficienti (dati nello scratchpad, non nel repo)
 * è riassunto qui: X = [1, altezza cm, peso kg, BMI] più, col sesso noto,
 * [maschio, maschio×altezza, maschio×peso] con maschio = 1/0.
 */

export type Sesso = 'female' | 'male';

/** Coefficienti sui dati ANSUR II completi (6.068 persone). */
const CON_SESSO = {
  bust: [16.20876, 0.1779, 0.11905, 1.62536, -1.66086, 0.03597, -0.01659],
  waistOmbelico: [11.32753, 0.07978, 0.24644, 1.76782, -5.74148, 0.0335, -0.01689],
  hips: [11.66154, 0.26867, 0.15013, 1.43309, -9.37653, 0.03628, -0.0749],
} as const;
const SENZA_SESSO = {
  bust: [-27.35888, 0.4423, -0.04132, 2.1148],
  waistOmbelico: [21.36806, 0.02579, 0.26898, 1.63968],
  hips: [86.26947, -0.15402, 0.26835, 0.76956],
} as const;

/** Vita naturale / vita all'ombelico = a + b·BMI (ANSUR 1988). */
const RAPPORTO_VITA: Record<Sesso, readonly [number, number]> = {
  female: [0.9911, -0.003101],
  male: [1.04178, -0.002611],
};

/** Fuori da qui la formula non è credibile: si ricade sulla stima dalla foto. */
const BMI_MIN = 15;
const BMI_MAX = 50;

function applica(coef: readonly number[], x: readonly number[]): number {
  return coef.reduce((somma, c, i) => somma + c * (x[i] ?? 0), 0);
}

export function misureDaAltezzaPeso(
  heightCm: number,
  weightKg: number,
  sesso?: Sesso | null,
): { bustCm: number; waistCm: number; hipsCm: number } | null {
  if (!(heightCm >= 140 && heightCm <= 210 && weightKg >= 35 && weightKg <= 200)) return null;
  const bmi = weightKg / (heightCm / 100) ** 2;
  if (bmi < BMI_MIN || bmi > BMI_MAX) return null;

  const base = [1, heightCm, weightKg, bmi];
  const [x, coef] = sesso
    ? [[...base, ...(sesso === 'male' ? [1, heightCm, weightKg] : [0, 0, 0])], CON_SESSO]
    : [base, SENZA_SESSO];
  // Senza sesso, il rapporto della vita è la media dei due: per una donna la
  // vita esce ~4 cm più larga (misurato sul 1988) — il prezzo del non sapere.
  const [a, b] = sesso
    ? RAPPORTO_VITA[sesso]
    : ([0, 1].map((i) => (RAPPORTO_VITA.female[i]! + RAPPORTO_VITA.male[i]!) / 2) as [number, number]);

  return {
    bustCm: Math.round(applica(coef.bust, x)),
    waistCm: Math.round(applica(coef.waistOmbelico, x) * (a + b * bmi)),
    hipsCm: Math.round(applica(coef.hips, x)),
  };
}
