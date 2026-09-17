import { initWidget } from './widget';

// Legge l'API key da data-api-key (integrazione manuale, app embed Shopify) o
// da query param cabina_api_key (vecchi ScriptTag Shopify, che non supportano
// data-*).
const script = document.currentScript as HTMLScriptElement | null;
const srcUrl = script?.src
  ? new URL(script.src)
  : null;

const apiKey =
  script?.dataset.apiKey ??
  srcUrl?.searchParams.get('cabina_api_key') ??
  '';
// `www` e non l'apex: cabina.io fa 308 verso www e un redirect non porta gli
// header CORS, quindi ogni fetch cross-origin del widget (API, /locales, /models)
// fallirebbe prima di seguirlo.
const apiUrl =
  script?.dataset.apiUrl ??
  srcUrl?.searchParams.get('cabina_api_url') ??
  'https://www.cabina.io';

declare global {
  interface Window {
    __cabinaCaricato?: boolean;
  }
}

// ⚠️ 2026-08-10 — una cabina per pagina, chiunque abbia messo il tag.
//
// Nasce dal passaggio a theme app extension: i negozi Shopify installati prima
// hanno ancora il vecchio ScriptTag sul tema, e cancellarlo avrebbe richiesto di
// tenere in vita lo scope `write_script_tags` proprio mentre lo si toglieva —
// uno scope chiesto al merchant solo per fare pulizia, che in review Shopify si
// paga («richiedi solo cio' che usi»). Un negozio con entrambi caricherebbe il
// bundle due volte: due bottoni, due sessioni, due volte i crediti.
//
// La guardia sta qui e non nella callback OAuth perche' il doppio tag non e' un
// problema di Shopify: e' di chiunque incolli lo snippet due volte, su qualsiasi
// canale. Un negozio con due tag resta da sistemare, ma non fa danni.
if (window.__cabinaCaricato) {
  console.warn(
    '[widget] warn=GIA_CARICATO — il bundle Cabina e gia stato eseguito su ' +
    'questa pagina, questa seconda esecuzione si ferma. Probabile doppio tag ' +
    'sul tema (es. vecchio ScriptTag + app embed): rimuoverne uno.'
  );
} else if (apiKey) {
  window.__cabinaCaricato = true;
  initWidget(apiKey, apiUrl).catch(() => {
    console.error('[widget] error=INTERNAL_ERROR');
  });
} else {
  console.error(
    '[widget] error=WIDGET_CONFIG_MISSING — API key not found. ' +
    'Add data-api-key attribute or cabina_api_key query param to the script tag.'
  );
}
