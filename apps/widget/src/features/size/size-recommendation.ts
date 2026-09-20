import type { Measures, SizeTableRow, SizeTableCategory } from '@cabina/shared';
import type { GarmentCategory } from '../../state/types';

/** Il peso di ogni dimensione nel calcolo della distanza. */
type Pesi = { height: number; bust: number; waist: number; hips: number; foot: number };

// ── Types ──────────────────────────────────────────────────────────────────

export type Confidence = 'exact' | 'between';

export interface SizeRecommendation {
  /** Taglia consigliata (es. 'M', 'L') */
  size: string;
  /** Livello di confidenza del match */
  confidence: Confidence;
  /** Taglia alternativa (solo per confidence 'between') */
  alternative?: string;
  /** Punteggio di confidenza 0–100 (Story 9.3). Dal 18/09 si mostra solo se il
   *  merchant lo chiede (`showSizeScore`): finché non è tarato su persone vere,
   *  un «95%» su una taglia sbagliata costa più di nessun numero. */
  score: number;
  /** Solo scarpe (18/09/2026, Arou): il numero successivo della tabella, da
   *  suggerire «se la preferisci più comoda». Mai più di un numero sopra. */
  comfortSize?: string;
  /** A cavallo: true se l'alternativa è la taglia MAGGIORE (18/09/2026). Serve
   *  al badge per scrivere le due taglie in ordine crescente e per non dire «per
   *  maggiore comfort» quando il consiglio è la minore. */
  alternativeLarger?: boolean;
}

/**
 * Vestibilità scelta dall'acquirente (18/09/2026, Arou): «Aderente / Normale /
 * Comoda». Sposta di UNA taglia al massimo, e solo quando le misure sono entro
 * `FIT_MARGIN_CM` dal confine: fuori da lì la taglia la decidono le misure.
 */
export type FitPreference = 'fitted' | 'regular' | 'relaxed';

/**
 * Sorgente delle misure dell'acquirente (Story 9.3).
 *
 * ⚠️ 2026-08-04 — prima era `'ai' | 'manual'`, dove `'ai'` copriva sia MediaPipe
 * sia l'AI Vision con la stessa penalità. MediaPipe è stato poi rimosso dal
 * prodotto (vedi `docs/wiki/stima-misure.md`), quindi restano due sorgenti:
 *  - `vision`: stimata dall'AI dalla foto. Include l'altezza, ma da una foto
 *    singola non è determinabile con certezza, e due chiamate possono cadere su
 *    modelli diversi via failover.
 *  - `manual`: dichiarata dall'acquirente — l'unica misurata davvero.
 *
 * Il punteggio del consiglio deve distinguerle: erano lo stesso -5 forfettario.
 */
export type MeasureSource = 'vision' | 'manual';

export interface RecommendationOptions {
  /** Come sono state ottenute le misure. Le misure AI ricevono una penalità di confidenza. */
  measureSource?: MeasureSource;
  /** Analisi capo AI (Story 9.2): pesa le misure rilevanti per la categoria. */
  garment?: { category: GarmentCategory; confidence: number } | null;
  /** `footCm` non l'ha dichiarato nessuno: è la stima dall'altezza (05/09/2026).
   *  Su una tabella che usa il piede vale come misura stimata, con la sua penalità. */
  footEstimated?: boolean;
  /** Vestibilità scelta dall'acquirente; assente = `regular`. */
  fit?: FitPreference;
}

/**
 * Lunghezza del piede stimata dall'altezza, quando l'acquirente non l'ha
 * dichiarata (05/09/2026): serve alle scarpe, per cui la foto a figura intera
 * non dà una misura utilizzabile.
 *
 * ponytail: 0,15 è il rapporto medio piede/altezza (≈ 25,5 cm a 170 cm) ed è
 * la manopola di taratura — da rifare sui resi veri, come i pesi qui sopra.
 * Lo scarto tipico è ±1 cm, cioè ±1,5 numeri: per questo la stima entra col
 * peso di una misura stimata, mai di una dichiarata.
 */
export const FOOT_HEIGHT_RATIO = 0.15;
export function stimaPiedeDaAltezza(heightCm: number): number {
  return Math.round(heightCm * FOOT_HEIGHT_RATIO * 2) / 2;
}

// ── Score tuning ─────────────────────────────────────────────────────────────

// ⚠️ 2026-08-06 — RISCRITTO, perché il numero non diceva più niente.
//
// Com'era: tre punteggi già espressi in [80, 95], meno una penalità di 5 per le
// misure stimate, poi un clamp a 80. Con le misure stimate dall'AI — che è il
// percorso normale, non un caso limite — un consiglio "a cavallo" usciva
// **sempre esattamente 80**: la fascia [80, 85] meno 5 finiva tutta sotto il
// pavimento, che la riportava su. Misurato: chi era a 1 cm dalla taglia e chi
// era completamente fuori scala leggevano lo stesso «80% di affidabilità».
//
// Com'è ora: la qualità del match si calcola in **[0, 1]** e si proietta sulla
// fascia mostrata **alla fine**. Nulla scende sotto 80 (decisione di Arou del
// 03/08, invariata) e nulla viene più tagliato, quindi il numero torna a
// variare. È anche meno codice: sparita la penalità sottrattiva e il clamp.
//
// L'ORDINE è ciò che il numero deve dire, ed è quel che i test difendono:
// match in una sola taglia > match in più taglie > a cavallo, e le misure
// dichiarate valgono più di quelle stimate.
//
// ponytail: i valori restano scelti a occhio — è misurato l'ordine, non la
// taratura. Va rifatta sui resi veri (a quale punteggio un consiglio finisce in
// un reso), non a colpo d'occhio come qui.
const Q_EXACT_SINGLE = 1;
const Q_EXACT_MULTIPLE = 0.7;
/** Un "a cavallo" non deve mai raggiungere un match esatto, nemmeno multiplo. */
const Q_BETWEEN_MAX = 0.5;
/**
 * Quanto vale meno una misura stimata dall'AI rispetto a una dichiarata.
 *
 * ⚠️ 2026-08-04 — era una penalità unica per MediaPipe e AI Vision insieme. Ora
 * la sorgente è una sola oltre al manuale, ma il punto regge: l'AI si è
 * misurata instabile fino a ±17 cm sul busto fra due chiamate identiche, e due
 * stime che si contraddicono non possono uscire col punteggio di una misura
 * presa col metro.
 */
const Q_VISION_PENALTY = 0.15;

const SCORE_FLOOR = 80;
/** Fascia mostrata: [80, 98]. Il 100 è escluso di proposito — nessun consiglio
 *  di taglia calcolato da una tabella merita di dirsi certo. */
const SCORE_SPAN = 18;

/**
 * Soglie colore del badge, **derivate** dalle fasce qui sopra invece di essere
 * riscritte a mano in `tryon-overlay`.
 *
 * ⚠️ Il 04/08 le soglie erano 80/60 su un punteggio che non scendeva sotto 80:
 * il verde era l'unico colore raggiungibile e gli altri due rami erano codice
 * morto. Quel difetto nasceva dall'avere le soglie in un file e i punteggi in
 * un altro: esportarle è ciò che impedisce di ripeterlo.
 *
 *  - verde  → match esatto su misure **dichiarate** (il solo caso pienamente
 *    affidabile): sta sopra il massimo ottenibile da una stima AI;
 *  - ambra  → match esatto su stima AI, oppure match multiplo;
 *  - neutro → a cavallo fra due taglie.
 */
export const SCORE_GREEN_MIN =
  Math.round(SCORE_FLOOR + SCORE_SPAN * (Q_EXACT_SINGLE - Q_VISION_PENALTY)) + 1;
export const SCORE_AMBER_MIN =
  Math.round(SCORE_FLOOR + SCORE_SPAN * (Q_EXACT_MULTIPLE - Q_VISION_PENALTY));
const CATEGORY_WEIGHT_EXTRA = 0.5; // peso aggiuntivo per le misure rilevanti (max moltiplicatore = 1 + 0.5 = 1.5)

/**
 * Nella scelta fra due taglie, una misura SOTTO il minimo della riga pesa la
 * metà di una SOPRA il massimo (18/09/2026, Arou). Sotto il minimo il capo lì
 * sta un po' largo e si porta; sopra il massimo stringe e non si porta.
 *
 * Il caso che l'ha fatto nascere: Arou, 92/76/90, porta M o L. I suoi fianchi
 * (90) cadono nella S della tabella, e a distanza simmetrica il consiglio era
 * «tra S e M» — un'alternativa che lui non porta mai. Con questo peso è «tra M
 * e L». Non vale zero: chi è molto più piccolo di una taglia deve comunque
 * allontanarsene.
 */
const LOOSE_WEIGHT = 0.5;

/**
 * Margine della vestibilità (18/09/2026): «Comoda» sale di taglia solo se una
 * misura che conta per il capo è entro 2 cm dal massimo della sua taglia;
 * «Aderente» scende solo se tutte sono entro 2 cm dal minimo. Una taglia è
 * larga 6–8 cm: 2 cm restano dentro il confine, senza saltare una taglia intera.
 *
 * ⚠️ Non è il «±7 cm» del banco misure: quello è quanto varia la STIMA fra due
 * foto della stessa persona, un rumore da ridurre, non una tolleranza scelta.
 */
export const FIT_MARGIN_CM = 2;

type Dimensione = 'height' | 'bust' | 'waist' | 'hips' | 'foot';

/** Le misure che decidono la vestibilità di un capo. */
function dimensioniChiave(category: GarmentCategory | null | undefined): Dimensione[] {
  switch (category) {
    case 'top':
    case 'outerwear':
    case 'dress':
      return ['bust', 'waist'];
    case 'bottom':
      return ['waist', 'hips'];
    case 'footwear':
      return ['foot'];
    default:
      return ['bust', 'waist', 'hips'];
  }
}

/** Valore della misura e range della riga per una dimensione; `null` se la riga non la dichiara. */
function rangeDi(measures: Measures, row: SizeTableRow, d: Dimensione): { v: number; min: number; max: number } | null {
  const [v, min, max] =
    d === 'height' ? [measures.heightCm, row.heightMin, row.heightMax]
    : d === 'bust' ? [measures.bustCm, row.bustMin, row.bustMax]
    : d === 'waist' ? [measures.waistCm, row.waistMin, row.waistMax]
    : d === 'hips' ? [measures.hipsCm, row.hipsMin, row.hipsMax]
    : [measures.footCm ?? 0, row.footMin ?? 0, row.footMax ?? 0];
  return isRangeUnspecified(min, max) ? null : { v, min, max };
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Verifica se una singola misura rientra in un range.
 * Se il range è [0,0] (non specificato), considera sempre match.
 *
 * ⚠️ 2026-08-06 — il commento qui sopra diceva già la cosa giusta, **il codice
 * faceva l'opposto**: `value >= 0 && value <= 0` è falso per qualunque misura
 * reale, quindi una riga con anche UNA sola dimensione non dichiarata dal
 * merchant non poteva **mai** dare un match esatto. Conseguenza a valle: ogni
 * consiglio diventava «a cavallo di due taglie», e con le misure stimate
 * dall'AI il punteggio usciva **sempre 80** (vedi `scoreFrom`) — un badge
 * costante per tutto il negozio. La distanza e la scala ignoravano già le
 * dimensioni non dichiarate (`isRangeUnspecified`, P4-fix): mancava qui.
 */
function measureInRange(value: number, min: number, max: number): boolean {
  if (isRangeUnspecified(min, max)) return true;
  return value >= min && value <= max;
}

/**
 * Verifica se TUTTE le misure dell'acquirente rientrano nei range
 * della riga taglia. Il peso non è considerato (non fa parte della tabella taglie).
 */
function measuresMatchRow(measures: Measures, row: SizeTableRow): boolean {
  return (
    measureInRange(measures.heightCm, row.heightMin, row.heightMax) &&
    measureInRange(measures.bustCm, row.bustMin, row.bustMax) &&
    measureInRange(measures.waistCm, row.waistMin, row.waistMax) &&
    measureInRange(measures.hipsCm, row.hipsMin, row.hipsMax) &&
    // Il piede: dichiarato solo dalle tabelle scarpe (05/09/2026); altrove è
    // [0,0] e non conta, come ogni dimensione non dichiarata.
    measureInRange(measures.footCm ?? 0, row.footMin ?? 0, row.footMax ?? 0)
  );
}

/** Una tabella «usa il piede» se almeno una riga lo dichiara: è una tabella scarpe. */
function usaIlPiede(sizeTable: readonly SizeTableRow[]): boolean {
  return sizeTable.some((r) => !isRangeUnspecified(r.footMin ?? 0, r.footMax ?? 0));
}

/**
 * Pesi per misura in base alla categoria capo (Story 9.3 / AC3).
 * Le misure rilevanti per la categoria pesano di più nel calcolo della distanza.
 */
/**
 * Pesi per misura in base alla categoria capo (Story 9.3 / AC3).
 * Le misure rilevanti per la categoria pesano di più nel calcolo della distanza.
 * Il peso extra è scalato dalla `garment.confidence` (Story 9.2): classificazioni
 * AI incerte riducono proporzionalmente l'influenza della pesatura.
 *
 * Formula: peso = 1 + CATEGORY_WEIGHT_EXTRA * garment.confidence
 * Es. confidence 100% → peso 1.5; confidence 60% → peso 1.3; confidence 0% → peso 1.0.
 */
function categoryWeights(
  garment: RecommendationOptions['garment'],
): Pesi {
  const base = { height: 1, bust: 1, waist: 1, hips: 1, foot: 1 };
  if (!garment) return base;
  // Scala il peso extra in base alla confidenza della classificazione AI
  const effectiveExtra = CATEGORY_WEIGHT_EXTRA * Math.max(0, Math.min(1, garment.confidence));
  const boosted = 1 + effectiveExtra;
  switch (garment.category) {
    case 'top':
    case 'outerwear':
      return { ...base, bust: boosted, waist: boosted };
    case 'bottom':
      return { ...base, waist: boosted, hips: boosted };
    case 'footwear':
      // Le scarpe si scelgono col piede (05/09/2026): è l'unica misura che conta.
      return { ...base, foot: boosted };
    default:
      // dress / accessory / unknown → peso uniforme (nessun boost)
      return base;
  }
}

/**
 * Distanza pesata tra le misure e una riga: somma delle differenze fuori range,
 * moltiplicate per il peso della misura. Con pesi tutti = 1 coincide con la
 * distanza euclidea-L1 della Story 4.2.
 */
/** Un range è considerato «non specificato» se entrambi gli estremi sono 0. */
function isRangeUnspecified(min: number, max: number): boolean {
  return min === 0 && max === 0;
}

/**
 * Somma dei massimi dichiarati di una riga taglia: chi li ha più alti è la
 * taglia «maggiore». Non esiste un ordinamento canonico delle etichette (sono
 * stringhe libere: «XS/S/M/L», «38/40», «S-M»), quindi le etichette non si
 * possono confrontare; i range dichiarati sì. Le dimensioni non dichiarate
 * ([0,0]) non contano. A parità totale decide l'ordine della tabella (il
 * merchant la carica in genere crescente) — è solo uno spareggio.
 */
function upperLimitsSum(row: SizeTableRow): number {
  let total = 0;
  if (!isRangeUnspecified(row.heightMin, row.heightMax)) total += row.heightMax;
  if (!isRangeUnspecified(row.bustMin, row.bustMax)) total += row.bustMax;
  if (!isRangeUnspecified(row.waistMin, row.waistMax)) total += row.waistMax;
  if (!isRangeUnspecified(row.hipsMin, row.hipsMax)) total += row.hipsMax;
  if (!isRangeUnspecified(row.footMin ?? 0, row.footMax ?? 0)) total += row.footMax ?? 0;
  return total;
}

/**
 * La riga «sta stretta» a chi prova quando almeno una misura supera il suo
 * massimo dichiarato. È la condizione dell'AC 4.2 per salire alla taglia
 * maggiore — senza, chi è sotto la taglia minima si sentirebbe consigliare una
 * taglia ancora più larga (il ramo `between` copre anche il fuori scala).
 */
function exceedsRowMax(measures: Measures, row: SizeTableRow): boolean {
  return (
    (!isRangeUnspecified(row.heightMin, row.heightMax) && measures.heightCm > row.heightMax) ||
    (!isRangeUnspecified(row.bustMin, row.bustMax) && measures.bustCm > row.bustMax) ||
    (!isRangeUnspecified(row.waistMin, row.waistMax) && measures.waistCm > row.waistMax) ||
    (!isRangeUnspecified(row.hipsMin, row.hipsMax) && measures.hipsCm > row.hipsMax) ||
    (!isRangeUnspecified(row.footMin ?? 0, row.footMax ?? 0) && (measures.footCm ?? 0) > (row.footMax ?? 0))
  );
}

/**
 * Distanza pesata tra le misure e una riga: somma delle differenze fuori range,
 * moltiplicate per il peso della misura. Con pesi tutti = 1 coincide con la
 * distanza euclidea-L1 della Story 4.2.
 *
 * P4-fix: le dimensioni con range [0,0] (non specificate dal merchant) vengono
 * ignorate (peso effettivo 0) perché altrimenti gonfierebbero la distanza
 * anche quando le altre misure matchano perfettamente.
 */
function weightedDistanceFromRow(
  measures: Measures,
  row: SizeTableRow,
  w: Pesi,
): number {
  let dist = 0;
  if (!isRangeUnspecified(row.heightMin, row.heightMax)) {
    dist += w.height * (Math.max(0, row.heightMin - measures.heightCm) + Math.max(0, measures.heightCm - row.heightMax));
  }
  if (!isRangeUnspecified(row.bustMin, row.bustMax)) {
    dist += w.bust * (Math.max(0, row.bustMin - measures.bustCm) + Math.max(0, measures.bustCm - row.bustMax));
  }
  if (!isRangeUnspecified(row.waistMin, row.waistMax)) {
    dist += w.waist * (Math.max(0, row.waistMin - measures.waistCm) + Math.max(0, measures.waistCm - row.waistMax));
  }
  if (!isRangeUnspecified(row.hipsMin, row.hipsMax)) {
    dist += w.hips * (Math.max(0, row.hipsMin - measures.hipsCm) + Math.max(0, measures.hipsCm - row.hipsMax));
  }
  const footMin = row.footMin ?? 0;
  const footMax = row.footMax ?? 0;
  if (!isRangeUnspecified(footMin, footMax)) {
    const foot = measures.footCm ?? 0;
    dist += w.foot * (Math.max(0, footMin - foot) + Math.max(0, foot - footMax));
  }
  return dist;
}

/**
 * Distanza usata per scegliere le due taglie più vicine: stringere (sopra il
 * massimo) conta intero, stare larghi (sotto il minimo) conta `LOOSE_WEIGHT`.
 *
 * ⚠️ 2026-09-18 — prima era la distanza simmetrica della Story 4.2: i fianchi
 * di un uomo sotto il minimo della M lo spingevano verso la S (vedi `LOOSE_WEIGHT`).
 */
function distanceFromRow(measures: Measures, row: SizeTableRow): number {
  let dist = 0;
  for (const d of ['height', 'bust', 'waist', 'hips', 'foot'] as const) {
    const r = rangeDi(measures, row, d);
    if (!r) continue;
    dist += Math.max(0, r.v - r.max) + LOOSE_WEIGHT * Math.max(0, r.min - r.v);
  }
  return dist;
}

/**
 * Ampiezza totale (pesata) dei range di una riga — scala di riferimento per
 * normalizzare la distanza nel punteggio "between".
 */
/**
 * Ampiezza totale (pesata) dei range di una riga — scala di riferimento per
 * normalizzare la distanza nel punteggio "between".
 *
 * P4-fix: le dimensioni con range [0,0] vengono ignorate (non contribuiscono
 * alla scala, coerentemente con weightedDistanceFromRow).
 */
function weightedRangeWidth(
  row: SizeTableRow,
  w: Pesi,
): number {
  let total = 0;
  if (!isRangeUnspecified(row.heightMin, row.heightMax)) {
    total += w.height * (row.heightMax - row.heightMin);
  }
  if (!isRangeUnspecified(row.bustMin, row.bustMax)) {
    total += w.bust * (row.bustMax - row.bustMin);
  }
  if (!isRangeUnspecified(row.waistMin, row.waistMax)) {
    total += w.waist * (row.waistMax - row.waistMin);
  }
  if (!isRangeUnspecified(row.hipsMin, row.hipsMax)) {
    total += w.hips * (row.hipsMax - row.hipsMin);
  }
  if (!isRangeUnspecified(row.footMin ?? 0, row.footMax ?? 0)) {
    total += w.foot * ((row.footMax ?? 0) - (row.footMin ?? 0));
  }
  return total;
}

/**
 * Proietta una qualità di match [0,1] sul punteggio mostrato, applicando la
 * penalità della sorgente **prima** della proiezione — è la differenza che
 * conta: sottraendola dopo, il pavimento se la mangiava.
 */
function scoreFrom(quality: number, options?: RecommendationOptions): number {
  const penalty = (options?.measureSource ?? 'manual') === 'vision' || options?.footEstimated ? Q_VISION_PENALTY : 0;
  const q = Math.max(0, Math.min(1, quality - penalty));
  return Math.round(SCORE_FLOOR + SCORE_SPAN * q);
}

// ── Main API ───────────────────────────────────────────────────────────────

/**
 * Calcola la taglia consigliata confrontando le misure dell'acquirente
 * con una tabella taglie.
 *
 * Algoritmo (Story 4.2, invariato):
 * 1. Cerca match esatti (tutte le misure nei range)
 * 2. Se match multipli, sceglie la prima (ordine della tabella = ordine del merchant)
 * 3. Se nessun match, cerca le due taglie più vicine per distanza → boundary
 * 4. Se tabella vuota o misure non plausibili → null
 *
 * Story 9.3: aggiunge `score` (0–100). La sorgente misure AI (`options.measureSource`)
 * applica una penalità; l'analisi capo (`options.garment`) pesa le misure rilevanti
 * per la categoria nel calcolo della distanza che alimenta lo score "between".
 *
 * 2026-09-18: sopra il consiglio di base si applicano la vestibilità scelta
 * dall'acquirente e, sulle scarpe, il numero «più comoda» (`applicaVestibilita`).
 *
 * @returns SizeRecommendation o null se nessuna taglia è calcolabile
 */
export function computeRecommendedSize(
  measures: Measures,
  sizeTable: SizeTableRow[],
  options?: RecommendationOptions,
): SizeRecommendation | null {
  const base = consiglioBase(measures, sizeTable, options);
  return base && conOrdine(applicaVestibilita(base, measures, sizeTable, options), sizeTable);
}

/** Dice se l'alternativa è la taglia maggiore, letto dai range come ogni ordine. */
function conOrdine(rec: SizeRecommendation, sizeTable: readonly SizeTableRow[]): SizeRecommendation {
  if (!rec.alternative) return rec;
  const [a, b] = [rec.size, rec.alternative].map((s) => sizeTable.find((r) => r.size === s));
  return a && b ? { ...rec, alternativeLarger: upperLimitsSum(b) > upperLimitsSum(a) } : rec;
}

/** Le righe dalla più piccola alla più grande, per range dichiarati (sort stabile:
 *  a parità decide l'ordine del merchant). */
function riga(sizeTable: readonly SizeTableRow[], size: string, passo: -1 | 1): SizeTableRow | undefined {
  const ordinate = [...sizeTable].sort((a, b) => upperLimitsSum(a) - upperLimitsSum(b));
  const i = ordinate.findIndex((r) => r.size === size);
  return i < 0 ? undefined : ordinate[i + passo];
}

/** «42» → «43» va bene, «42» → «45» no: le etichette numeriche non salgono più di 1. */
function saltoAmmesso(da: string, a: string): boolean {
  const [x, y] = [da, a].map((s) => parseFloat(s.replace(',', '.')));
  return Number.isNaN(x) || Number.isNaN(y) || (y > x && y - x <= 1);
}

/**
 * La vestibilità scelta dall'acquirente e il numero «più comoda» delle scarpe.
 *
 * Tre regole, tutte al massimo di UNA taglia:
 *  - **Comoda**: a cavallo sceglie la maggiore; su un match esatto sale solo se
 *    una misura chiave è entro `FIT_MARGIN_CM` dal massimo. Sulle scarpe prende
 *    il numero «più comoda».
 *  - **Aderente**: a cavallo sceglie la minore se nessuna misura chiave la
 *    supera di più di `FIT_MARGIN_CM`; su un match esatto scende solo se TUTTE
 *    le misure chiave sono entro `FIT_MARGIN_CM` dal minimo.
 *  - **Normale**: il consiglio di base.
 *
 * Lo `score` resta quello del consiglio di base, anche quando un match esatto
 * diventa «tra due taglie»: dice quanto le misure cadono nella tabella, e la
 * preferenza dell'acquirente non le cambia. Il confronto fra tabelle lo usa
 * prima della vestibilità (`consiglioBase`), quindi non sposta la scelta.
 */
function applicaVestibilita(
  base: SizeRecommendation,
  measures: Measures,
  sizeTable: SizeTableRow[],
  options?: RecommendationOptions,
): SizeRecommendation {
  const fit = options?.fit ?? 'regular';

  if (usaIlPiede(sizeTable)) {
    // Scarpe (Arou, 18/09): il numero dalla stima resta il consiglio, e accanto
    // si suggerisce il successivo — lui porta il 42 e compra il 43 per comodità.
    const successiva = riga(sizeTable, base.size, 1);
    const comfortSize = successiva && saltoAmmesso(base.size, successiva.size) ? successiva.size : undefined;
    if (fit === 'relaxed' && comfortSize) {
      return { ...base, size: comfortSize, confidence: 'between', alternative: base.size };
    }
    return comfortSize ? { ...base, comfortSize } : base;
  }

  if (fit === 'regular') return base;
  const chiave = dimensioniChiave(options?.garment?.category);
  const rigaDi = (size: string) => sizeTable.find((r) => r.size === size);

  if (base.confidence === 'between' && base.alternative) {
    const [a, b] = [rigaDi(base.size), rigaDi(base.alternative)];
    if (!a || !b) return base;
    const [minore, maggiore] = upperLimitsSum(a) <= upperLimitsSum(b) ? [a, b] : [b, a];
    if (fit === 'relaxed') {
      return { ...base, size: maggiore.size, alternative: minore.size };
    }
    const entraNellaMinore = chiave.every((d) => {
      const r = rangeDi(measures, minore, d);
      return !r || r.v <= r.max + FIT_MARGIN_CM;
    });
    return entraNellaMinore ? { ...base, size: minore.size, alternative: maggiore.size } : base;
  }

  const attuale = rigaDi(base.size);
  if (!attuale) return base;
  const range = chiave.map((d) => rangeDi(measures, attuale, d)).filter((r) => r != null);
  if (range.length === 0) return base;

  if (fit === 'relaxed') {
    const maggiore = riga(sizeTable, base.size, 1);
    const alLimite = range.some((r) => r.v >= r.max - FIT_MARGIN_CM);
    return maggiore && alLimite
      ? { ...base, size: maggiore.size, confidence: 'between', alternative: base.size }
      : base;
  }

  const minore = riga(sizeTable, base.size, -1);
  const tuttoAlMinimo = range.every((r) => r.v <= r.min + FIT_MARGIN_CM);
  return minore && tuttoAlMinimo
    ? { ...base, size: minore.size, confidence: 'between', alternative: base.size }
    : base;
}

function consiglioBase(
  measures: Measures,
  sizeTable: SizeTableRow[],
  options?: RecommendationOptions,
): SizeRecommendation | null {
  if (!sizeTable || sizeTable.length === 0) return null;
  // La penalità del piede stimato vale solo dove il piede conta: su una
  // tabella vestiti la stima non ha toccato niente e non deve costare nulla.
  if (options?.footEstimated && !usaIlPiede(sizeTable)) {
    options = { ...options, footEstimated: false };
  }

  // Verifica che le misure essenziali siano presenti e plausibili
  if (
    measures.heightCm <= 0 ||
    measures.bustCm <= 0 ||
    measures.waistCm <= 0 ||
    measures.hipsCm <= 0
  ) {
    return null;
  }

  // 1. Cerca match esatti
  const exactMatches = sizeTable.filter((row) => measuresMatchRow(measures, row));

  if (exactMatches.length === 1) {
    return {
      size: exactMatches[0]!.size,
      confidence: 'exact',
      score: scoreFrom(Q_EXACT_SINGLE, options),
    };
  }

  if (exactMatches.length > 1) {
    // Match multipli: scegli la prima (la tabella è già ordinata dal merchant)
    return {
      size: exactMatches[0]!.size,
      confidence: 'exact',
      score: scoreFrom(Q_EXACT_MULTIPLE, options),
    };
  }

  // 2. Nessun match esatto → cerca le due taglie più vicine
  const weights = categoryWeights(options?.garment);

  if (sizeTable.length >= 2) {
    const withDistances = sizeTable.map((row) => ({
      row,
      distance: distanceFromRow(measures, row),
    }));
    withDistances.sort((a, b) => a.distance - b.distance);

    const closest = withDistances[0]!;
    const second = withDistances[1]!;

    // ⚠️ 2026-08-09 — AC 4.2 (`epics.md:655`) e PRD: a cavallo di due taglie si
    // consiglia la MAGGIORE. Prima restituiva la più vicina per distanza: la
    // card diceva «Tra XL e L — consigliamo L», e la taglia consigliata viene
    // preselezionata nel selettore della pagina prodotto (`preselect-size.ts`),
    // quindi la taglia sbagliata finiva nel carrello. Il vecchio ramo pareggio
    // applicava già la regola giusta: ora è il caso generale, e quel ramo è
    // sparito (meno codice, stesso P3-fix dello score ricalcolato sulla riga
    // restituita).
    //
    // Due regole:
    //  1. «La maggiore» si legge dai range dichiarati (`upperLimitsSum`), non
    //     dall'etichetta né dal solo indice di tabella — che resta spareggio.
    //  2. Si sale solo se la minore STA STRETTA (`exceedsRowMax`): chi è sotto
    //     la taglia minima non deve salire ancora.
    // Effetto voluto: con `alternative` sempre uguale alla minore, la frase
    // composta dall'overlay (`tryon-overlay.ts` passa prima l'alternativa)
    // torna in ordine crescente senza toccare l'overlay.
    const larger =
      upperLimitsSum(closest.row) !== upperLimitsSum(second.row)
        ? upperLimitsSum(closest.row) > upperLimitsSum(second.row)
          ? closest
          : second
        : sizeTable.indexOf(closest.row) > sizeTable.indexOf(second.row)
          ? closest
          : second;
    const smaller = larger === closest ? second : closest;
    const chosen = exceedsRowMax(measures, smaller.row) ? larger : closest;
    const other = chosen === closest ? second : closest;
    const chosenWeightedDist = weightedDistanceFromRow(measures, chosen.row, weights);
    const chosenScale = weightedRangeWidth(chosen.row, weights);
    const chosenNormalized =
      chosenScale > 0 ? Math.min(1, chosenWeightedDist / chosenScale) : 1;
    return {
      size: chosen.row.size,
      confidence: 'between',
      alternative: other.row.size,
      score: scoreFrom(Q_BETWEEN_MAX * (1 - chosenNormalized), options),
    };
  }

  // Una sola riga nella tabella
  // P2-fix: verifica se le misure rientrano effettivamente nel range
  if (measuresMatchRow(measures, sizeTable[0]!)) {
    return {
      size: sizeTable[0]!.size,
      confidence: 'exact',
      score: scoreFrom(Q_EXACT_SINGLE, options),
    };
  }
  // Una sola riga senza match → calcola score from distance
  const singleRow = sizeTable[0]!;
  const singleDist = weightedDistanceFromRow(measures, singleRow, weights);
  const singleScale = weightedRangeWidth(singleRow, weights);
  const singleNormalized = singleScale > 0 ? Math.min(1, singleDist / singleScale) : 1;
  return {
    size: singleRow.size,
    confidence: 'between',
    score: scoreFrom(Q_BETWEEN_MAX * (1 - singleNormalized), options),
  };
}

// ── La tabella giusta per il capo (05/09/2026) ───────────────────────────────

export interface SizeTableCandidate {
  name: string;
  category: SizeTableCategory | null;
  data: SizeTableRow[];
}

/**
 * Le tabelle fra cui scegliere per un capo.
 *
 * ⚠️ Fino al 05/09/2026 il widget usava **la prima** tabella del merchant —
 * cioè l'ultima caricata — qualunque fosse il capo: su un pantalone
 * consigliava «M» dove le taglie sono 34–44, e la preselezione nella pagina
 * non trovava niente. Ora le candidate sono le tabelle con la categoria del
 * capo; se non ce ne sono, le generiche (senza categoria: tutte quelle di
 * prima del 05/09); se nemmeno, la prima — così nessun merchant peggiora
 * rispetto a oggi. Due ripieghi di categoria: `outerwear` → `top` (stesse
 * misure: busto e vita) e `dress` → `top` (un abito si sceglie dal busto
 * prima che dai fianchi; rilievo di Kilo sulla #192).
 */
export function pickSizeTables(
  tables: readonly SizeTableCandidate[],
  category: GarmentCategory | null | undefined,
): SizeTableCandidate[] {
  if (tables.length === 0) return [];
  const volute: SizeTableCategory[] =
    category === 'outerwear' ? ['outerwear', 'top']
    : category === 'dress' ? ['dress', 'top']
    : category === 'top' || category === 'bottom' || category === 'footwear' ? [category]
    : [];
  for (const voluta of volute) {
    const trovate = tables.filter((t) => t.category === voluta);
    if (trovate.length > 0) return trovate;
  }
  const generiche = tables.filter((t) => t.category === null);
  return generiche.length > 0 ? generiche : [tables[0]!];
}

/**
 * Il consiglio di taglia su TUTTE le tabelle candidate: vince quella in cui le
 * misure rientrano (match esatto), poi la più vicina.
 *
 * 🔑 **Fra più tabelle decidono le misure, non l'ordine di caricamento.** Un
 * merchant che vende ad adulti e bambini ha due tabelle `bottom` — «34–44»
 * con altezze 160–190 e «4–14 anni» con altezze 100–160 — e un bambino cade
 * nella seconda perché le sue misure rientrano lì. Le etichette («40», «8
 * anni», «M») non si guardano mai: sono stringhe libere, e l'unica cosa
 * confrontabile sono i range in centimetri.
 */
export function recommendFromTables(
  measures: Measures,
  tables: readonly SizeTableCandidate[],
  options?: RecommendationOptions,
): { recommendation: SizeRecommendation; table: SizeTableCandidate; candidates: number } | null {
  const candidate = pickSizeTables(tables, options?.garment?.category ?? null);
  let migliore: { recommendation: SizeRecommendation; table: SizeTableCandidate } | null = null;
  for (const table of candidate) {
    // Il confronto fra tabelle si fa sul consiglio di BASE: la vestibilità
    // trasforma un match esatto in «tra due taglie», e applicata qui farebbe
    // vincere la tabella sbagliata (un bambino nella tabella adulti). Si
    // applica dopo, sulla tabella scelta.
    const recommendation = consiglioBase(measures, table.data, options);
    if (!recommendation) continue;
    const vince =
      !migliore ||
      (recommendation.confidence === 'exact' && migliore.recommendation.confidence !== 'exact') ||
      (recommendation.confidence === migliore.recommendation.confidence &&
        recommendation.score > migliore.recommendation.score);
    if (vince) migliore = { recommendation, table };
  }
  if (!migliore) return null;
  return {
    recommendation: conOrdine(
      applicaVestibilita(migliore.recommendation, measures, migliore.table.data, options),
      migliore.table.data,
    ),
    table: migliore.table,
    candidates: candidate.length,
  };
}
