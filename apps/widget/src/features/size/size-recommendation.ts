/**
 * Il consiglio taglia vive in @cabina/shared dal 21/11/2026 (lo usa anche il server
 * dell'app persone): qui si riesporta, così gli import del widget restano uguali.
 */
export {
  computeRecommendedSize,
  perChiIlCapo,
  perQuestoProdotto,
  pickSizeTables,
  recommendFromTables,
  stimaPiedeDaAltezza,
  TOLLERANZA_CM,
  FOOT_HEIGHT_RATIO,
  SCORE_AMBER_MIN,
  SCORE_GREEN_MIN,
} from '@cabina/shared';
export type {
  Confidence,
  FitPreference,
  MeasureSource,
  RecommendationOptions,
  SizeRecommendation,
  SizeTableCandidate,
} from '@cabina/shared';
