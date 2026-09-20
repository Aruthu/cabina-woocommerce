import { z } from 'zod';

/**
 * Le lingue di Cabina: widget, dashboard, email e sito (18/09/2026). Le 5 di
 * sempre più giapponese, portoghese brasiliano e indonesiano — prima nel widget,
 * poi nella dashboard, poi nel sito: da qui in avanti sono una lista sola.
 */
export const SUPPORTED_LANGUAGES = ['it', 'en', 'fr', 'es', 'de', 'ja', 'pt-BR', 'id'] as const;

/** Stessa lista: il nome resta per chi parla della lingua del widget. */
export const WIDGET_LANGUAGES = SUPPORTED_LANGUAGES;
export type WidgetLanguage = (typeof WIDGET_LANGUAGES)[number];

export const MeasuresSchema = z.object({
  heightCm: z.number().min(100).max(220),
  weightKg: z.number().min(30).max(250).optional(),
  bustCm: z.number().min(50).max(200),
  waistCm: z.number().min(50).max(200),
  hipsCm: z.number().min(50).max(200),
  /** Lunghezza del piede in cm, per le scarpe (05/09/2026). Opzionale: se
   *  manca, il widget la stima dall'altezza. */
  footCm: z.number().min(15).max(40).optional(),
});

export const WidgetConfigSchema = z.object({
  apiKey: z.string().min(1),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  buttonText: z.string().min(1).max(30),
  enabledCategories: z.array(z.string()),
  defaultLanguage: z.enum(WIDGET_LANGUAGES).default('en'),
});

// ─── Size Table Schemas (Story 4.1) ─────────────────────────────────────

/**
 * Per quale capo vale una tabella taglie (05/09/2026). Sono le categorie
 * dell'analisi capo del widget (`GarmentCategory`) senza `accessory` e
 * `unknown`; `null`/assente = tabella generica, per qualsiasi capo.
 *
 * 🔑 Il widget sceglie la tabella con la categoria del capo — è ciò che fa
 * consigliare «40» su un pantalone e «42» su una scarpa invece della «M» della
 * prima tabella caricata. Le etichette restano stringhe libere: la taglia si
 * legge SOLO dai range in centimetri, mai dal numero o dalla lettera.
 */
export const SizeTableCategorySchema = z.enum(['top', 'bottom', 'dress', 'outerwear', 'footwear']);
export type SizeTableCategory = z.infer<typeof SizeTableCategorySchema>;

/** Singola riga della tabella taglie. */
export const SizeTableRowSchema = z
  .object({
    size: z.string().min(1, 'La taglia è obbligatoria').max(20),
    heightMin: z.number().int().min(0).max(300),
    heightMax: z.number().int().min(0).max(300),
    bustMin: z.number().int().min(0).max(300),
    bustMax: z.number().int().min(0).max(300),
    waistMin: z.number().int().min(0).max(300),
    waistMax: z.number().int().min(0).max(300),
    hipsMin: z.number().int().min(0).max(300),
    hipsMax: z.number().int().min(0).max(300),
    /** Lunghezza del piede (cm) per le scarpe: opzionale, con i decimali —
     *  una misura di scarpa vale ~0,67 cm, un intero non basta. Assenti o
     *  [0,0] = non dichiarata, come le altre dimensioni. */
    footMin: z.number().min(0).max(60).optional(),
    footMax: z.number().min(0).max(60).optional(),
  })
  .refine((r) => (r.footMin ?? 0) <= (r.footMax ?? 0), {
    message: 'footMin deve essere <= footMax',
    path: ['footMin'],
  })
  .refine((r) => r.heightMin <= r.heightMax, {
    message: 'heightMin deve essere <= heightMax',
    path: ['heightMin'],
  })
  .refine((r) => r.bustMin <= r.bustMax, {
    message: 'bustMin deve essere <= bustMax',
    path: ['bustMin'],
  })
  .refine((r) => r.waistMin <= r.waistMax, {
    message: 'waistMin deve essere <= waistMax',
    path: ['waistMin'],
  })
  .refine((r) => r.hipsMin <= r.hipsMax, {
    message: 'hipsMin deve essere <= hipsMax',
    path: ['hipsMin'],
  });

export type SizeTableRow = z.infer<typeof SizeTableRowSchema>;

/** Array di righe per una tabella taglie completa. */
export const SizeTableDataSchema = z
  .array(SizeTableRowSchema)
  .min(1, 'La tabella deve contenere almeno una riga')
  .max(100, 'Massimo 100 righe per tabella');

/** Payload per upload CSV / inserimento manuale. */
export const SizeTableCreateSchema = z.object({
  name: z.string().min(1).max(100),
  data: SizeTableDataSchema,
  category: SizeTableCategorySchema.nullable().optional(),
});

// ─── Garment Views Schemas (Story 10.3) ─────────────────────────────────

/** Angolazione di una vista del capo. */
export const GarmentViewAngleSchema = z.enum(['front', 'right', 'back', 'left']);

/** Cap di lunghezza condiviso per gli URL di pagina prodotto (widget + Studio). */
export const PRODUCT_URL_MAX_LENGTH = 2048;

/** URL della pagina prodotto fornita dal client (chiave capo, prima della normalizzazione). */
export const ProductPageUrlSchema = z
  .string({ required_error: 'productPageUrl mancante' })
  .trim()
  .min(1, 'productPageUrl mancante')
  .max(PRODUCT_URL_MAX_LENGTH, 'productPageUrl troppo lungo');

/** Input dell'endpoint widget `garment-views`. */
export const GarmentViewsQuerySchema = z.object({
  productPageUrl: ProductPageUrlSchema,
});

// Nota Studio (11.2): l'allowlist mime e il limite dimensione sono un'unica sorgente
// in types.ts (STUDIO_IMAGE_MIME / STUDIO_IMAGE_MAX_BYTES), usati sia client sia server.

// ─── Consenso GDPR foto (Story 12.1 — Epic 12) ───────────────────────────────

/**
 * Stato del consenso GDPR foto persistito on-device (widget). Chiave/schema
 * SEPARATI dal consenso misure/AI generico (Story 3.1) — riguarda l'invio della
 * foto intera dell'acquirente a un provider esterno (fal.ai), un trattamento
 * distinto e più sensibile (CAP-1, CAP-2 dello SPEC E12-PREP).
 */
export const PhotoConsentSchema = z.object({
  given: z.boolean(),
  version: z.number().int().positive(),
});

export type PhotoConsentState = z.infer<typeof PhotoConsentSchema>;

// ─── FASHN Garment Category (Story 12.3 — Epic 12) ───────────────────────────

/**
 * Enum REALE accettato dal parametro `category` di FASHN
 * (fal-ai/fashn/tryon/v1.6, verificato luglio 2026).
 *
 * ATTENZIONE: ≠ `GarmentCategory` (widget state/types.ts), che è l'euristica
 * client-side di `analyzeGarmentFromUrl` (`top|bottom|dress|...`). Questo enum
 * è lo slot tecnico FASHN per il mix&match — non unificarli né rinominarli.
 */
export const FashnGarmentCategorySchema = z.enum(['tops', 'bottoms', 'one-pieces', 'auto']);

export type FashnGarmentCategory = z.infer<typeof FashnGarmentCategorySchema>;
