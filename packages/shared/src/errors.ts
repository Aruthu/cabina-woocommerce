/**
 * Error codes centralizzati per Cabina.
 * REGOLA: nessun componente inventa nuovi codici localmente.
 * Aggiungere qui, poi importare da '@cabina/shared'.
 * [Source: architecture.md#Process Patterns]
 */
export type ErrorCode =
  | 'INVALID_API_KEY'
  | 'SESSION_LIMIT_REACHED'
  | 'SIZE_TABLE_NOT_FOUND'
  | 'RENDER_FAILED'
  | 'INVALID_MEASURES'
  | 'UNAUTHORIZED'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INTERNAL_ERROR'
  | 'MERCHANT_NOT_CONFIGURED'
  | 'CSV_INVALID_COLUMNS'
  | 'CSV_INVALID_VALUES'
  | 'CSV_FILE_TOO_LARGE'
  | 'CSV_UNSUPPORTED_FORMAT'
  | 'PLAN_LIMIT_ALERT'
  | 'INVALID_PLAN_CHANGE'
  | 'ALREADY_MAX_PLAN'
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'GENERATIVE_QUOTA_EXCEEDED'
  // Story 12.7: nessun provider vision ha risposto (timeout/rete/5xx dopo il
  // retry). Distinto da "ha risposto ma non ha riconosciuto misure", che resta
  // `data: {}` — il client li tratta diversamente.
  | 'VISION_UNAVAILABLE';

/**
 * Sentinella usata dal widget per riconoscere l'indisponibilità della vision
 * lungo il canale eccezione (il form la cattura già). Esportata perché il valore
 * viaggia fra tre punti — route, client API, form — e una stringa ripetuta a
 * mano è una sentinella che prima o poi diverge.
 */
export const VISION_UNAVAILABLE_ERROR = 'VISION_UNAVAILABLE';

export interface ApiError {
  code: ErrorCode;
  message: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
}
