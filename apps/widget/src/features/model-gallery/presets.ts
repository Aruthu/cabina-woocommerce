/**
 * Story 12.2 — Libreria modelle predefinite (AC2).
 *
 * Metadata tipizzato per il set di modelle con corporature eterogenee,
 * servite come asset statici del widget su CDN Cabina (stesso `baseUrl` del
 * widget, path `/models/...`). Le immagini NON sono inline nel bundle JS e NON
 * provengono da un endpoint backend (Task 1.1/1.2, AC2): il plugin `copyModels`
 * di `vite.config.ts` le copia in `dist/models/` esattamente come già avviene
 * per i locale JSON (`copyLocales`).
 *
 * Gli `id` sono COSTANTI e stabili — nei test si referenzia sempre `PRESET_MODELS`
 * anziché stringhe duplicate (Task 1.4). Le immagini sono sostituibili: basta
 * sovrascrivere il file in `src/models/` senza toccare questo metadata, finché
 * `id`/`assetPath` restano stabili.
 *
 * 2026-07-26: i placeholder SVG sono stati sostituiti da **fotografie raster**
 * (le silhouette vettoriali erano rifiutate dal motore generativo, che pretende
 * una foto vera) e la galleria è stata riaccesa — vedi `MODEL_GALLERY_ENABLED`
 * in `widget.ts`. Nella stessa passata il set è raddoppiato a **8 modelli**:
 * le 4 corporature per entrambi i generi, perché con sole modelle femminili un
 * negozio di abbigliamento maschile non aveva nulla da mostrare.
 *
 * 2026-09-18 (disegno deciso da Arou l'11/09): le 8 restano la prima schermata,
 * invariate negli `id`; un pulsante apre una seconda schermata con **32 modelle
 * nuove** (`MORE_MODELS`): 4 fasce d'età × 2 generi × 4 corporature, origini e
 * carnagioni varie. Il brief che le ha prodotte è codice, in
 * `apps/rendering/poc_generativo/genera_modelle.py`; gli asset escono da
 * `asset_cdn.py` nella stessa cartella. Tutte e 40 sono a **1360×2048**: il try-on
 * di Pruna restituisce la risoluzione della modella, quindi è lei a decidere se il
 * risultato è 2K (le 8 di luglio sono state ingrandite dal 768 originale).
 */

/** Corporature eterogenee del set (AC2: "small but clearly heterogeneous"). */
export type BodyType = 'slim' | 'regular' | 'curvy' | 'plus';

/** Asse aggiunto il 2026-07-26 insieme al set maschile. */
export type ModelGender = 'female' | 'male';

/** Asse aggiunto il 2026-09-18 con le 32 nuove. L'etichetta è il numero: non si traduce. */
export type AgeBand = '18-25' | '26-35' | '36-45' | '46-55';

/** Fasce nell'ordine della seconda schermata. */
export const AGE_BANDS: readonly AgeBand[] = ['18-25', '26-35', '36-45', '46-55'];

export interface PresetModel {
  /** Identificatore stabile `{gender}-{bodyType}`, usato nei test e come
   *  attributo DOM. Mai cambiarlo senza bumpare i test. */
  id: string;
  gender: ModelGender;
  /** Solo le 32 della seconda schermata: le 8 di luglio non hanno una fascia. */
  ageBand?: AgeBand;
  /** Etichetta di corporatura, per eventuale logica futura. */
  bodyType: BodyType;
  /** Chiave i18n dell'etichetta mostrata sotto la miniatura (la sola corporatura:
   *  il genere è già dato dall'intestazione del gruppo e dalla foto stessa). */
  labelKey: string;
  /** Path relativo al `baseUrl` del widget (es. '/models/model-female-slim.webp').
   *  È l'immagine **inviata al motore**: WebP q90 1360×2048, ~320 KB, scaricata solo
   *  alla selezione da `fetchModelAsDataUrl`. Il widget la ricodifica comunque in
   *  WebP 0,85 (toglie i metadati): q90 qui tiene la doppia compressione a 1,6/255
   *  da ciò che il banco ha provato. Non ridurla: la sua risoluzione è quella del
   *  risultato. */
  assetPath: string;
  /** Path della **miniatura** (128px, ~5 KB) usata nella griglia. Esiste perché
   *  la card mostra l'immagine a 44x88 CSS: senza, aprire la galleria a 8 voci
   *  scaricherebbe 1,2 MB di foto piene per disegnare otto francobolli. */
  thumbPath: string;
}

function preset(gender: ModelGender, bodyType: BodyType, labelKey: string, ageBand?: AgeBand): PresetModel {
  const id = ageBand ? `${gender}-${ageBand}-${bodyType}` : `${gender}-${bodyType}`;
  return {
    id,
    gender,
    ...(ageBand && { ageBand }),
    bodyType,
    labelKey,
    assetPath: `/models/model-${id}.webp`,
    thumbPath: `/models/model-${id}-thumb.jpg`,
  };
}

/**
 * Set di 8 modelle: 4 corporature (slim / regular / curvy / plus) per genere.
 * La galleria le raggruppa per genere e renderizza una miniatura per voce (Task 4.3).
 *
 * Le corporature femminili riusano le etichette neutre; il maschile ha una chiave
 * dedicata per `curvy`, che in italiano come in inglese è un termine femminile:
 * applicarlo a un uomo sarebbe una traduzione sciatta, non una scorciatoia.
 */
export const PRESET_MODELS: readonly PresetModel[] = [
  preset('female', 'slim', 'model_gallery.body_slim'),
  preset('female', 'regular', 'model_gallery.body_regular'),
  preset('female', 'curvy', 'model_gallery.body_curvy'),
  preset('female', 'plus', 'model_gallery.body_plus'),
  preset('male', 'slim', 'model_gallery.body_slim'),
  preset('male', 'regular', 'model_gallery.body_regular'),
  preset('male', 'curvy', 'model_gallery.body_curvy_male'),
  preset('male', 'plus', 'model_gallery.body_plus'),
];

/**
 * Le 32 della seconda schermata: genere × fascia × corporatura, stesse etichette
 * di corporatura delle 8 (compreso il `curvy` maschile dedicato).
 */
export const MORE_MODELS: readonly PresetModel[] = PRESET_MODELS.flatMap((base) =>
  AGE_BANDS.map((band) => preset(base.gender, base.bodyType, base.labelKey, band)),
).sort((a, b) =>
  // Ordine di rendering: genere, poi fascia, poi corporatura come nelle 8.
  a.gender.localeCompare(b.gender) || a.ageBand!.localeCompare(b.ageBand!),
);

/** Tutte e 40, per risolvere un `id` qualunque (miniature, selezione). */
export const ALL_MODELS: readonly PresetModel[] = [...PRESET_MODELS, ...MORE_MODELS];

/** «26-35» → «26–35»: il trattino lungo è quello tipografico degli intervalli. */
export function ageBandLabel(band: AgeBand): string {
  return band.replace('-', '–');
}

/** Chiave i18n dell'intestazione di gruppo, per genere. */
export const GENDER_LABEL_KEYS: Record<ModelGender, string> = {
  female: 'model_gallery.gender_female',
  male: 'model_gallery.gender_male',
};

/** Generi presenti nel set, nell'ordine di rendering. */
export const MODEL_GENDERS: readonly ModelGender[] = ['female', 'male'];
