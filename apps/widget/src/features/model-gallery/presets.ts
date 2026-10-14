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
 *
 * 2026-09-27 (Arou): la prima schermata mostra le **26–35 native**, non più le 8
 * di luglio. L'ingrandimento aveva lasciato nella foto una trama a vermicelli
 * (pavimento, jeans) che Pruna ricopia fedelmente: a zoom 3× la prova sembrava
 * rovinata. Misurato con un PNG senza perdita: non era la compressione. I file
 * di luglio restano in `src/models/` (`MODELLE_DI_LUGLIO`) perché i widget dentro
 * i plugin (WooCommerce, PrestaShop) li chiedono ancora per id.
 *
 * 2026-10-12 (Arou): **18 modelle MINORENNI** (`KIDS_MODELS`), 7–15 anni: 3 fasce ×
 * 2 generi × slim/regular/sturdy. Si vedono SOLO su un capo da bambino, cioè quando
 * la tabella taglie del merchant che vale per il capo è `audience: 'kids'`
 * (`perChiIlCapo` in size-recommendation.ts), e lì sono l'unica via: niente foto
 * propria, perché un minore non può consentire da solo (art. 8 GDPR, soglia 16).
 * Brief in `genera_minorenni.py`, asset da `asset_cdn.py minorenni_candidate/scelte`.
 */

/** Corporature eterogenee del set (AC2: "small but clearly heterogeneous"). */
export type BodyType = 'slim' | 'regular' | 'curvy' | 'plus' | 'sturdy';

/** Asse aggiunto il 2026-07-26 insieme al set maschile. */
export type ModelGender = 'female' | 'male';

/** Asse aggiunto il 2026-09-18 con le 32 nuove. L'etichetta è il numero: non si traduce. */
export type AgeBand = '7-9' | '10-12' | '13-15' | '18-25' | '26-35' | '36-45' | '46-55';

/** Fasce ADULTE nell'ordine della seconda schermata. */
export const AGE_BANDS: readonly AgeBand[] = ['18-25', '26-35', '36-45', '46-55'];

/** Fasce dei MINORENNI (12/10/2026): fino a 15, dai 16 si è adulti. */
export const KIDS_AGE_BANDS: readonly AgeBand[] = ['7-9', '10-12', '13-15'];

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

const MODEL_GENDERS_ORDER: readonly ModelGender[] = ['female', 'male'];

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
 * Ogni corporatura ha una chiave per genere (06/10/2026): in italiano, spagnolo e
 * portoghese l'aggettivo si accorda («Snella» / «Snello»), e `curvy` è femminile
 * anche in inglese. Dove la parola non cambia, le due chiavi hanno lo stesso testo.
 */
export const PRESET_MODELS: readonly PresetModel[] = [
  preset('female', 'slim', 'model_gallery.body_slim', '26-35'),
  preset('female', 'regular', 'model_gallery.body_regular', '26-35'),
  preset('female', 'curvy', 'model_gallery.body_curvy', '26-35'),
  preset('female', 'plus', 'model_gallery.body_plus', '26-35'),
  preset('male', 'slim', 'model_gallery.body_slim_male', '26-35'),
  preset('male', 'regular', 'model_gallery.body_regular_male', '26-35'),
  preset('male', 'curvy', 'model_gallery.body_curvy_male', '26-35'),
  preset('male', 'plus', 'model_gallery.body_plus_male', '26-35'),
];

/** Le 8 di luglio, ingrandite: il widget non le mostra più (27/09), ma i file
 *  restano serviti per i widget dentro i plugin, che le chiedono per id. */
export const MODELLE_DI_LUGLIO: readonly string[] = PRESET_MODELS.map((m) => `${m.gender}-${m.bodyType}`);

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

/**
 * Le 18 minorenni (12/10/2026): genere × fascia × slim/regular/sturdy, costruite
 * già nell'ordine di rendering (le fasce non si ordinano per stringa: «10-12» < «7-9»).
 * `sturdy` e non `curvy`: su un bambino «curvy» è sbagliato; in italiano, spagnolo
 * e portoghese l'etichetta si accorda («Robusta» / «Robusto»).
 */
const KIDS_BODY: ReadonlyArray<readonly [BodyType, string, string]> = [
  ['slim', 'model_gallery.body_slim', 'model_gallery.body_slim_male'],
  ['regular', 'model_gallery.body_regular', 'model_gallery.body_regular_male'],
  ['sturdy', 'model_gallery.body_sturdy', 'model_gallery.body_sturdy_male'],
];
export const KIDS_MODELS: readonly PresetModel[] = MODEL_GENDERS_ORDER.flatMap((gender) =>
  KIDS_AGE_BANDS.flatMap((band) =>
    KIDS_BODY.map(([body, keyF, keyM]) => preset(gender, body, gender === 'female' ? keyF : keyM, band)),
  ),
);

/** Tutte le modelle del widget, per risolvere un `id` (miniature, selezione).
 *  Le 32 adulte (la prima schermata ne è un sottoinsieme, le 26–35, dal 27/09)
 *  più le 18 minorenni. */
export const ALL_MODELS: readonly PresetModel[] = [...MORE_MODELS, ...KIDS_MODELS];

/** «26-35» → «26–35»: il trattino lungo è quello tipografico degli intervalli. */
export function ageBandLabel(band: AgeBand): string {
  return band.replace('-', '–');
}

/** Chiave i18n dell'intestazione di gruppo, per genere. */
export const GENDER_LABEL_KEYS: Record<ModelGender, string> = {
  female: 'model_gallery.gender_female',
  male: 'model_gallery.gender_male',
};

/** Le stesse intestazioni per le 18 minorenni: «Girls · 7–9», non «Women · 7–9»
 *  (13/10/2026). Chiavi nuove: chi le legge ricade su quelle sopra finché il
 *  locale in cache non le ha. */
export const KIDS_GENDER_LABEL_KEYS: Record<ModelGender, string> = {
  female: 'model_gallery.gender_female_kids',
  male: 'model_gallery.gender_male_kids',
};

/** Generi presenti nel set, nell'ordine di rendering. */
export const MODEL_GENDERS: readonly ModelGender[] = MODEL_GENDERS_ORDER;
