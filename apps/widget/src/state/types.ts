import type { Measures, FashnGarmentCategory } from '@cabina/shared';
import type { SizeRecommendation, MeasureSource } from '../features/size/size-recommendation';

export type GarmentCategory =
  | 'top'
  | 'bottom'
  | 'dress'
  | 'outerwear'
  | 'footwear'
  | 'accessory'
  | 'unknown';

export interface GarmentAnalysis {
  category: GarmentCategory;
  confidence: number;
  suggestedAngles: number[];
}

/** ⚠️ 2026-08-17 — via `'consent'` e `'photo_consent'`: il consenso è UNA spunta
 *  dentro `'photo'`, data prima che la foto lasci il dispositivo. */
export type WidgetState = 'idle' | 'photo' | 'form' | 'garment_select' | 'rendering' | 'tryon' | 'closed';

export type WidgetContext = {
  state: WidgetState;
  error: string | null;
  /** Array di 4 dataUrl (una per angolo: 0°, 90°, 180°, 270°).
   *  Un elemento può essere null se il rendering per quell'angolo è fallito. */
  renderResult: (string | null)[] | null;
  photoData: string | null;
  measures: Partial<Measures> | null;
  baseUrl: string;
  /** Indice dell'angolo corrente (0-3 → 0°/90°/180°/270°) */
  currentAngle: number;
  /** Raccomandazione taglia calcolata (Story 4.2). Null = non ancora calcolata / non disponibile. */
  recommendedSize: SizeRecommendation | null;
  /** Come sono state ottenute le misure (Story 9.3). Null/assente = non ancora confermate. */
  measureSource?: MeasureSource | null;
  /** Story 12.2: discriminante ESPLICITO dell'origine di `photoData`.
   *  - 'user_photo'    → foto personale dell'acquirente (percorso PhotoCapture).
   *                      Attiva il gate GDPR foto 12.1 (fail-closed, CAP-1).
   *  - 'preset_model'  → modella predefinita hostata da Cabina (AC2/AC3).
   *                      NESSUN gate foto: nessuna foto personale lascia il device.
   *  - null            → non ancora scelto (step 'photo' iniziale / reset).
   *
   *  Mai inferito da `photoData`: il gate deve basarsi solo su questo campo
   *  (Task 2.2, Dev Notes). Reset a ogni sessione (CLOSE → createInitialContext). */
  identityMode: 'user_photo' | 'preset_model' | null;
  /** Story 12.3: capi selezionati per il try-on (mix&match). Null finché
   *  l'acquirente non conferma nello step 'garment_select'. Array di 1-3 capi
   *  (il capo della pagina è il default con category 'auto', AC1). */
  selectedGarments: SelectedGarment[] | null;
};

/** Story 12.3: un capo selezionato per il try-on generativo. */
export interface SelectedGarment {
  imageUrl: string;
  category: FashnGarmentCategory;
  /** 2026-08-09 — rimozione dei vestiti che l'acquirente ha già addosso,
   *  richiesta esplicitamente e disaccoppiata dalla categoria (vedi
   *  `removeExistingFor` in garment-select). Assente = regola legacy lato
   *  rendering (legata alla categoria). */
  removeExisting?: boolean;
  /** 2026-08-12 — tipo di foto del capo per FASHN (auto/flat-lay/model).
   *  Permette di scegliere il parametro `garment_photo_type` per capo,
   *  utile per packshot/ghost-mannequin vs capi fotografati indossati. */
  garmentPhotoType?: 'auto' | 'flat-lay' | 'model';
}

export type WidgetEvent =
  | { type: 'OPEN' }
  | { type: 'PHOTO_UPLOADED'; dataUrl: string }
  | { type: 'PHOTO_CAPTURED'; dataUrl: string }
  | { type: 'PRESET_MODEL_SELECTED'; dataUrl: string }
  | { type: 'PHOTO_RETRY' }
  // `garments` presente → si va dritti in cabina saltando "Cosa provi" (il capo
  // della pagina è già noto). Assente → lo step resta, ed è l'unica strada quando
  // il tema del merchant non espone l'immagine del prodotto.
  | { type: 'MEASURES_CONFIRMED'; measures: Partial<Measures>; measureSource?: MeasureSource; garments?: SelectedGarment[] }
  | { type: 'RENDER_SUCCESS'; results: (string | null)[] }
  | { type: 'RENDER_ERROR'; error: string }
  | { type: 'ANGLE_CHANGED'; angle: number }
  | { type: 'GARMENTS_CONFIRMED'; garments: SelectedGarment[] }
  | { type: 'BACK' }
  | { type: 'CLOSE' };
