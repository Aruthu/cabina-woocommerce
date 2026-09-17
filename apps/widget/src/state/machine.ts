import type { WidgetContext, WidgetEvent } from './types';

export function widgetReducer(context: WidgetContext, event: WidgetEvent): WidgetContext {
  switch (context.state) {
    case 'idle':
      // ⚠️ 2026-08-17 — si apriva su `'consent'`: una modale «Accetta/Rifiuta»
      // che spostava soltanto allo step successivo, senza versione, senza
      // `consent_events`, senza bloccare niente. Attrito senza valore
      // probatorio. Ora il consenso è una spunta DENTRO lo step foto, dove sta
      // la cosa che autorizza — e viene registrato.
      if (event.type === 'OPEN') return { ...context, state: 'photo' };
      return context;
    case 'photo':
      // Step "Chi sei" (Story 12.2): due percorsi d'ingresso che producono
      // entrambi un `photoData` (data URL) valido per il motore try-on 12.1,
      // ma con discriminante `identityMode` esplicito (Task 2.2):
      //  - user_photo    → foto personale, passa per `form` (misure) → rendering
      //                    con gate GDPR foto (fail-closed, CAP-1).
      //  - preset_model  → modella Cabina (AC2/AC3): SALTA `form` (nessuna misura
      //                    personale) e va diretto a `rendering` SENZA gate foto.
      if (event.type === 'PHOTO_UPLOADED') return { ...context, state: 'form', photoData: event.dataUrl, identityMode: 'user_photo', error: null };
      if (event.type === 'PHOTO_CAPTURED') return { ...context, state: 'form', photoData: event.dataUrl, identityMode: 'user_photo', error: null };
      if (event.type === 'PRESET_MODEL_SELECTED') return {
        ...context,
        // Proposta (a) 2026-07-31: il percorso modella ora PASSA dal `form`
        // misure (auto-rilevamento dalla foto della modella + conferma
        // dell'acquirente), così la raccomandazione taglia è disponibile anche
        // "senza foto". Prima saltava il form (Task 2.5) → niente consiglio.
        state: 'form',
        photoData: event.dataUrl,
        identityMode: 'preset_model',
        // Form fresco: le misure le popolano l'auto-rilevamento sulla foto
        // modella e gli edit dell'acquirente. Anchor azzerati fino alla stima.
        measures: null,
        measureSource: null,
        error: null,
      };
      if (event.type === 'PHOTO_RETRY') return { ...context, state: 'photo', photoData: null, identityMode: null, error: null };
      if (event.type === 'CLOSE') return { ...context, state: 'closed' };
      return context;
    case 'form':
      // 2026-08-03: con i capi già risolti (il capo della pagina prodotto) si va
      // dritti in 'rendering' — lo step "Cosa provi" ripeteva una scelta che
      // l'acquirente ha già fatto arrivando su QUELLA pagina, e altri capi si
      // provano dal risultato ("Sfoglia altri capi") o tornando indietro.
      // Senza capi si passa da 'garment_select' come prima: non è un caso di
      // scuola, è ciò che accade quando il tema non espone l'immagine del
      // prodotto (`extractProductImageUrl` → null, successo su WooCommerce).
      if (event.type === 'MEASURES_CONFIRMED') {
        const base = { ...context, measures: event.measures, measureSource: event.measureSource ?? 'manual' };
        return event.garments && event.garments.length > 0
          ? { ...base, state: 'rendering' as const, selectedGarments: event.garments, error: null }
          : { ...base, state: 'garment_select' as const };
      }
      // Story 12.5: torna allo step "Chi sei" — stesso reset di PHOTO_RETRY,
      // riparte pulito (non ha senso conservare una foto senza il suo step di provenienza).
      if (event.type === 'BACK') return { ...context, state: 'photo', photoData: null, identityMode: null, error: null };
      if (event.type === 'CLOSE') return { ...context, state: 'closed' };
      return context;
    case 'garment_select':
      // Story 12.3: step "Cosa provi". GARMENTS_CONFIRMED → 'rendering' (setta
      // selectedGarments). CLOSE → 'closed'.
      if (event.type === 'GARMENTS_CONFIRMED') return { ...context, state: 'rendering', selectedGarments: event.garments, error: null };
      // Story 12.5 / Proposta (a) 2026-07-31: BACK torna a 'form' per ENTRAMBI
      // i percorsi, preservando photoData/measures (l'acquirente aggiusta le
      // misure, non rifà la foto né riseleziona la modella). Anche il percorso
      // modella ora ha un `form` — prima tornava a 'photo' perché non lo aveva.
      if (event.type === 'BACK') return { ...context, state: 'form', error: null };
      if (event.type === 'CLOSE') return { ...context, state: 'closed' };
      return context;
    case 'rendering':
      if (event.type === 'RENDER_SUCCESS') return { ...context, state: 'tryon', renderResult: event.results, currentAngle: 0, error: null };
      // Proposta (a) 2026-07-31: su errore di rendering ENTRAMBI i percorsi
      // tornano al `form` misure (foto e modella preset lo hanno entrambi) —
      // l'acquirente ritenta senza perdere foto/modella/misure. Prima il
      // percorso modella tornava a `photo` perché il form non esisteva lì.
      if (event.type === 'RENDER_ERROR') return { ...context, state: 'form', error: event.error };
      // ⚠️ 2026-08-17 — qui c'era il ramo `PHOTO_CONSENT_NEEDED` → stato
      // `'photo_consent'`, il secondo consenso. Non serve più: la foto non può
      // essere arrivata fin qui senza spunta, che si dà PRIMA del caricamento.
      // L'invariante fail-closed non è sparita con lo stato: vive in
      // `shouldAttemptGenerative`, valutata qui sotto in `widget.ts`.
      return context;
    case 'tryon':
      if (event.type === 'ANGLE_CHANGED') return { ...context, currentAngle: event.angle };
      // Story 12.5: torna a "Cosa provi" preservando renderResult/selectedGarments
      // (restano visibili finché non si rigenera scegliendo un altro capo — non un reset).
      if (event.type === 'BACK') return { ...context, state: 'garment_select', error: null };
      if (event.type === 'CLOSE') return { ...context, state: 'closed' };
      return context;
    default:
      return context;
  }
}

export function createInitialContext(): WidgetContext {
  return { state: 'idle', error: null, renderResult: null, photoData: null, measures: null, baseUrl: '', currentAngle: 0, recommendedSize: null, measureSource: null, identityMode: null, selectedGarments: null };
}

/** Reset per una nuova sessione (chiusura widget): azzera TUTTO lo stato di
 *  sessione ma preserva `baseUrl`, che è di livello deployment — impostato una
 *  sola volta da `initWidget` e mai più (guard `initStarted`). Senza preservarlo,
 *  la 2ª apertura risolverebbe le URL root-relative sull'origine merchant →
 *  rotte su CDN cross-origin. */
export function resetSessionContext(prev: WidgetContext): WidgetContext {
  return { ...createInitialContext(), baseUrl: prev.baseUrl };
}
