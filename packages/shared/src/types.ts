import type { WidgetLanguage } from './schemas';

export type SupportedLanguage = WidgetLanguage;

export interface WidgetPublicConfig {
  primaryColor: string;
  buttonText: string;
  enabledCategories: string[];
  defaultLanguage: WidgetLanguage;
  /** URL pubblico del logo del merchant (branding). Assente se non caricato. */
  logoUrl?: string | null;
  /** True se il widget è disattivato (limite sessioni piano raggiunto, Story 5.2).
   *  Il widget non renderizza il bottone. Gate spostato qui (2026-07-15) dal
   *  vecchio conteggio-al-load: la sessione ora si conta al primo OPEN. */
  widgetDisabled?: boolean;
  /** True se i crediti generativi non bastano più per una prova (2026-08-04).
   *  Stesso trattamento di `widgetDisabled`: nessun bottone renderizzato. Senza
   *  questo, l'acquirente faceva tutto il percorso — foto, consenso, stima misure
   *  via AI (a pagamento) — per leggere solo alla fine che le prove sono finite,
   *  e ricominciava da capo a ogni click. */
  creditsExhausted?: boolean;
  /** «Completa il look» (18/09/2026): il merchant l'ha acceso dalla dashboard
   *  (`widget_configs.outfit_enabled`, spento di default). Assente = spento. */
  outfitEnabled?: boolean;
  /** Percentuale accanto alla taglia consigliata (18/09/2026): spenta di default,
   *  la accende il merchant dalla dashboard (`widget_configs.show_size_score`). */
  showSizeScore?: boolean;
}

export interface Measures {
  heightCm: number;
  weightKg?: number;
  bustCm: number;
  waistCm: number;
  hipsCm: number;
  /** Lunghezza del piede (cm), per le scarpe. Opzionale: stimata dall'altezza se manca. */
  footCm?: number;
}

/**
 * Sesso letto dalla foto dall'AI Vision (18/09/2026). Serve SOLO a scegliere i
 * coefficienti della formula altezza+peso (`stima-da-peso.ts` nel widget): non
 * si mostra all'acquirente, non si salva, non viaggia oltre il form misure.
 * Misurato sul modello di produzione: giusto 21 volte su 21 (7 foto × 3 giri).
 */
export type SessoStimato = 'female' | 'male';

/** Ciò che restituisce la stima dalla foto: le misure e, se riconosciuto, il sesso. */
export type StimaMisure = Partial<Measures> & { sex?: SessoStimato };

export interface WidgetConfig {
  apiKey: string;
  primaryColor: string;
  buttonText: string;
  enabledCategories: string[];
  defaultLanguage: WidgetLanguage;
}

export type MerchantPlan = 'freemium' | 'starter' | 'growth' | 'pro';

// ─── Studio (Story 11.2+) ──────────────────────────────────────────────────

/**
 * Stato async per operazioni client-side (upload, generazione, ecc.).
 * Invariante di progetto: MAI usare booleani separati (loading/error/success),
 * sempre un `AsyncState<T>` discriminato.
 */
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; message: string };

/** Mime accettati per le immagini Studio (background remove, ecc.). */
export const STUDIO_IMAGE_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** Limite dimensione singola immagine Studio (10 MB). */
export const STUDIO_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** Bucket storage privato per asset Studio. */
export const STUDIO_ASSETS_BUCKET = 'merchant-studio-assets';

// ─── Try-on generativo (Story 12.1 — Epic 12) ───────────────────────────────

/** Bucket storage pubblico per i risultati cache-ati del try-on generativo. */
export const TRYON_RESULTS_BUCKET = 'merchant-tryon-results';

/**
 * Costo di una prova, in unità di `PLAN_GENERATIVE_LIMITS`. **Vale 1: un'unità
 * è una prova.**
 *
 * ⚠️ 2026-08-05 — era 30, un placeholder dichiarato tale nel codice e mai
 * calibrato: valeva $0,30 contro i **$0,075** che costa davvero una generazione
 * `fal-ai/fashn/tryon/v1.6`. Sovrastimava di 4×, e con lo Starter a 680 unità
 * significava 22 prove al mese mentre la vetrina ne prometteva 500.
 *
 * Con Cabina Studio rimosso resta una sola operazione a consumare il pool, quindi
 * l'unità intermedia non serve più: il limite del piano È il numero di prove.
 * I nomi tecnici dicono ancora «crediti» (`extra_credits` è una colonna, e
 * rinominarla costerebbe una migration per nulla), ma al merchant si parla di
 * prove — sono la stessa cosa, 1:1.
 *
 * ⚠️ Il conteggio resta **per capo**, con un'eccezione dal 18/09/2026: con 3
 * capi insieme il terzo è gratis (`proveAddebitate`) — i capi partono in una
 * sola generazione, non più in cascata.
 */
export const TRYON_GENERATIVE_CREDIT_COST = 1;

/**
 * Limite capi per composizione mix&match (Story 12.3). Dal 18/09/2026 i capi
 * partono in UNA chiamata a Pruna (11,7 s per tre, misurato; la cascata di
 * prima, un capo per volta, ne impiegava 36–40): la cascata resta solo come
 * ripiego se il rendering ne applica meno. Unico posto di verità — riusato da dashboard (route + catalog
 * CRUD) e widget (garment-select), stesso pattern di `FashnGarmentCategorySchema`
 * (code review 12.3, patch P11: era duplicato manualmente in 3 file).
 */
export const MAX_MIX_AND_MATCH_GARMENTS = 3;

/**
 * Prove addebitate al merchant per una composizione di `capi` capi (18/09/2026,
 * decisione di Arou): con 3 capi insieme il terzo è gratis — pagano 2 prove.
 * Con 1 o 2 capi, una prova per capo come sempre. Da quando i capi partono in
 * una sola chiamata, tre capi costano a noi $0,031 invece di $0,045.
 */
export function proveAddebitate(capi: number): number {
  return capi >= MAX_MIX_AND_MATCH_GARMENTS ? capi - 1 : capi;
}

/**
 * Prove extra (wallet, decisione Arou 2026-07-16): acquistabili quando il
 * plafond mensile è esaurito. Non scadono; consumate solo dopo quelle del piano.
 *
 * ⚠️ 2026-08-30 — **il listino di Cabina è uno solo, in dollari, in tutti e due
 * i canali.** Non è una preferenza: i piani su Shopify App Pricing sono in USD,
 * sono già davanti a un revisore e non si toccano finché la revisione è aperta.
 * Gli altri due pezzi (Stripe e la vetrina) erano ancora nostri, quindi si sono
 * adeguati loro. Prima di oggi convivevano due tabelle — €34/79/119 di qua,
 * $40/93/140 di là — e lo stesso piano costava due cifre diverse a seconda di
 * dove lo guardavi.
 *
 * ⚠️ **$0,36 non è il costo, è un prezzo che deve stare sopra il piano.** Se
 * l'extra costasse meno del credito incluso più caro, converrebbe restare sul
 * piano piccolo e comprare a consumo invece di fare upgrade. Le prove incluse
 * valgono $0,200 / $0,186 / $0,175 (40/200, 93/500, 140/800): $0,36 sta sopra
 * il più caro dei tre — quello dello Starter — e la leva regge.
 *
 * Il costo vivo di una prova resta in euro, perché in euro lo paghiamo al
 * fornitore: €0,015 dal 15/08 (motore PrunaAI, era €0,07). Il margine c'è
 * abbondante in qualunque valuta lo si guardi.
 *
 * (Il ragionamento non è cambiato, i numeri sì. Un commento che cita cifre morte
 * è come una costante disallineata: qualcuno ci ricalcola sopra.)
 *
 * ⚠️ 2026-08-07 — **questa costante non addebita nulla.** Il checkout legge il
 * prezzo unitario da Stripe (`credits-checkout/route.ts`) e lo moltiplica; qui
 * serve a due cose sole: il totale mostrato in `CreditsPurchaseCard` e
 * l'invariante di prezzo in `apply-checkout.ts` — che però **non blocca**
 * l'accredito, si limita a segnalare a Sentry (Stripe ha già addebitato).
 *
 * Perciò le due fonti possono divergere senza che nulla si fermi, ed è già
 * successo: la costante diceva 60 mentre il catalogo incassava 10 — €12 promessi
 * al merchant, €2,00 addebitati, e un alert Sentry a ogni acquisto che nessuno
 * ha collegato. **Cambiare questo numero senza rifare il Price su Stripe
 * rimette in piedi lo stesso difetto, in silenzio.**
 */
export const EXTRA_CREDIT_PRICE_USD_CENTS = 36;

/**
 * La valuta del listino, in un posto solo. Prima era scritta a mano in ogni
 * punto che formattava un prezzo — card, crediti, JSON-LD — e cambiarla
 * significava trovarli tutti.
 */
export const PLAN_CURRENCY = 'USD' as const;
export const EXTRA_CREDITS_MIN_PURCHASE = 40; // $14,40 — sotto non copre i costi fissi Stripe
export const EXTRA_CREDITS_MAX_PURCHASE = 2000; // $720 — anti errore di battitura

/**
 * Giorni fra il soft-delete di un merchant (disinstallazione dell'app o
 * chiusura account) e la purga definitiva dei suoi dati.
 *
 * ⚠️ **Non e' una costante come le altre: e' una promessa pubblica.** Il numero
 * e' scritto nei documenti legali in cinque lingue — privacy («i dati e i file
 * dell'account vengono eliminati definitivamente dopo N giorni») e termini
 * («alla disinstallazione i dati restano recuperabili per N giorni»), in
 * `apps/web/src/i18n/<lang>.json`. Cambiarlo qui senza aggiornare quelli
 * significa cancellare prima di quanto dichiarato ai merchant.
 *
 * Sta in `@cabina/shared` — modulo senza dipendenze — e non nella route del
 * cron, perche' lo leggono anche una pagina e un componente **client**:
 * importarlo da `api/cron/purge-deleted-merchants` trascinava il client
 * `supabaseAdmin` (service role) dentro un Server Component di pagina.
 *
 * Portato da 30 a 7 il 2026-08-29.
 */
export const MERCHANT_PURGE_GRACE_DAYS = 7;

/**
 * Durata del periodo di conteggio per chi **non ha una fattura** (freemium), in
 * giorni. Per chi paga il periodo lo scandisce il rinnovo incassato.
 */
export const PERIOD_DAYS = 30;

/**
 * Rete di sicurezza per chi paga: quanti giorni può durare un periodo prima che
 * il plafond riparta comunque, se il rinnovo non è arrivato.
 *
 * ⚠️ Più largo di 30 di proposito. Per un abbonato il plafond lo dà il rinnovo
 * incassato (`invoice.paid` → `handleInvoicePaid`), che cade ogni 28-31 giorni:
 * una rete a 30 anticiperebbe il rinnovo di un giorno nei mesi lunghi e
 * regalerebbe un plafond in più ogni volta. A 35 la rete interviene solo quando
 * il rinnovo davvero non è arrivato.
 */
export const PERIOD_FALLBACK_DAYS = 35;

/**
 * Il periodo di conteggio delle prove è scaduto (contatore e alert vanno azzerati)?
 *
 * ⚠️ 2026-08-05 — **c'era un secondo orologio, ed è stato rimosso**. Le prove si
 * contavano sul mese di **calendario** (`date_trunc('month')` dentro la RPC),
 * mentre l'abbonamento decorre dal giorno dell'iscrizione: chi si abbonava il 28
 * riceveva il plafond pieno e tre giorni dopo un altro. Ora il periodo parte da
 * `merchants.sessions_reset_at`, che il rinnovo sposta in avanti.
 *
 * ⚠️ Il nome della colonna dice ancora «sessions» perché rinominarla costerebbe
 * una migration per nulla: è **l'inizio del periodo corrente**, e vale per le
 * prove. Chi paga lo fa avanzare col rinnovo; il freemium, che fattura non ha,
 * coi 30 giorni — ed è l'unico motivo per cui questa funzione esiste ancora.
 */
export function isPeriodExpired(
  periodStart: string | null | undefined,
  plan: MerchantPlan | string | null | undefined = null,
): boolean {
  if (!periodStart) return false;
  const start = new Date(periodStart).getTime();
  if (!Number.isFinite(start)) return false;
  const soglia = plan && plan !== 'freemium' ? PERIOD_FALLBACK_DAYS : PERIOD_DAYS;
  return (Date.now() - start) / (1000 * 60 * 60 * 24) >= soglia;
}

/**
 * **Prove try-on incluse nel piano, al mese** (un'unità = una prova, vedi
 * `TRYON_GENERATIVE_CREDIT_COST`). `null` sarebbe illimitato: nessun piano lo è.
 *
 * ⚠️ 2026-08-07 — **ridimensionati sul mercato, non sul costo.** I numeri del
 * 05/08 (75/175/275) erano corretti come conto ma mai confrontati con nessuno:
 * a €0,45 per credito incluso stavamo a **4-6× i concorrenti dell'App Store**
 * ($0,067-0,20). Ora €0,23 / €0,20 / €0,17, cioè ~1,7-2,5×.
 *
 * **I prezzi non cambiano** (34/79/119): sale il plafond. È la stessa leva sul
 * €/credito, ma non tocca né i Price su Stripe né gli abbonamenti in corso.
 *
 * ⚠️ **2026-08-15 — RICALCOLATI SUL MOTORE NUOVO, a margine 90% (scelta di Arou).**
 * Il try-on passa da FASHN a `p-image try-on` di PrunaAI, che sul banco batte
 * FASHN su ogni voce (colori, capi che scoprono, camicia abbottonata) in metà
 * tempo. Una prova costa ora **€0,015** (€0,0138 di `p-image-try-on` + €0,001 di
 * vision) contro i €0,07 di prima: costo variabile €0,30 / €3,00 / €7,50 / €12,00,
 * cioè **margine 91,2% / 90,5% / 89,9%** a plafond interamente consumato.
 *
 * I plafond salgono comunque (+33% / +25% / +14%) e il €/prova scende da
 * €0,227/€0,198/€0,170 a **€0,170 / €0,158 / €0,149**.
 *
 * 📌 2026-08-30 — **le cifre qui sopra restano in euro apposta.** I costi al
 * fornitore in euro li paghiamo davvero; i ricavi per prova erano calcolati sui
 * canoni di allora (34/79/119 €), che dal 30/08 sono $40/93/140. Il margine non
 * è peggiorato — la valuta sì. Chi rifà il conto lo rifaccia su
 * `PLAN_PRICES_USD`, non su questi numeri, che restano perché documentano la
 * decisione del 15/08.
 *
 * ⚠️ **Perché NON siamo al livello del mercato, che pure era l'obiettivo.** Con
 * l'altro rivenditore dello stesso modello (Runware, $0,0045) gli stessi 90% di
 * margine avrebbero consentito 300/900/2.000, cioè **sotto i concorrenti su tutti
 * e tre i livelli**. L'API di Pruna costa **tre volte tanto**, e quel costo si
 * mangia esattamente quella leva: qui si è scelta la qualità del servizio del
 * fornitore (e un upscale da 3-5s invece di 15-73s) al posto del plafond.
 * ⛔ Se un domani il plafond tornasse a essere l'argomento di vendita, la leva
 * è cambiare fornitore — non abbassare il margine.
 *
 * Il Freemium resta **10** (€0,15 a registrazione, nessun ricavo): il costo per
 * prova è crollato, ma quel numero non è tarato sul costo — è quanto danno due
 * dei tre concorrenti, e alzarlo è spesa pura più **superficie d'abuso**, che
 * col costo non c'entra. Alzato a 20 il 15/08 e riportato a 10 lo stesso giorno.
 */
export const PLAN_GENERATIVE_LIMITS: Record<MerchantPlan, number | null> = {
  freemium: 10,
  starter: 200,
  growth: 500,
  pro: 800,
};

/**
 * Prezzi mensili dei piani, in USD — **gli stessi nei due canali** (vedi
 * `EXTRA_CREDIT_PRICE_USD_CENTS` per il perché della valuta).
 *
 * Su Shopify vivono nel Partner Dashboard, fuori dal repo: qui sono la copia
 * che mostriamo, e vanno tenuti allineati a mano. Su Stripe vivono nei quattro
 * Price del catalogo, referenziati dalle env `STRIPE_PRICE_*`. In nessuno dei
 * due casi è questa costante ad addebitare — ed è per questo che può divergere
 * senza che nulla si fermi.
 */
export const PLAN_PRICES_USD: Record<MerchantPlan, number> = {
  freemium: 0,
  starter: 40,
  growth: 93,
  pro: 140,
};

/** Ordine crescente dei piani — per validare upgrade/downgrade (Story 5.3). */
export const PLAN_RANK: Record<MerchantPlan, number> = {
  freemium: 0,
  starter: 1,
  growth: 2,
  pro: 3,
};

/** Stato della subscription Stripe associata al merchant (Story 5.3). */
export type SubscriptionStatus = 'active' | 'past_due' | 'grace' | 'canceled';

// ─── Billing & Plan Status (Story 5.2) ────────────────────────────────────

/** Stato piano merchant restituito da GET /api/merchant/plan-status. */
export interface PlanStatus {
  plan: MerchantPlan;
  planLimit: number | null;
  sessionsUsed: number;
  usagePercent: number;
  widgetDisabled: boolean;
  alertSent80: boolean;
  alertSent100: boolean;
}

// ─── Billing / Stripe (Story 5.3) ─────────────────────────────────────────

/** Stato di fatturazione del merchant per la pagina Billing. */
export interface BillingStatus {
  plan: MerchantPlan;
  subscriptionStatus: SubscriptionStatus | null;
  planRenewsAt: string | null;
  gracePeriodEndsAt: string | null;
}

/** Risposta di POST /api/billing/checkout — URL di redirect a Stripe Checkout. */
export interface CheckoutSessionResult {
  url: string;
}

/** Risposta di POST /api/billing/cancel — data di fine periodo pagato. */
export interface CancelSubscriptionResult {
  cancelAt: string | null;
}
