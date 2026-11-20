/**
 * Script Wix di Cabina (story 14.2): ascolta il carrello per collegare gli
 * ordini alle prove. Servito da `https://www.cabina.io/wix-eventi.js` e
 * caricato da un embedded script dell'app tutto suo (`cabina-eventi`, tipo
 * Analytics, dal 19/11/2026; prima stava nel frammento del widget):
 *
 *   <script type="module" accesstoken="true" src="https://www.cabina.io/wix-eventi.js" data-api-key="{{apiKey}}"></script>
 *
 * Perché un file a parte e non dentro il widget (decisione di Arou, 09/11):
 * l'unica strada documentata da Wix per sentire `AddToCart` e
 * `InitiateCheckout` è `analytics.registerEventListener` di `@wix/site`, in
 * uno script a moduli con un client dell'SDK (`site.auth()`, `site.host()`):
 * è la forma provata nel T0 dell'08/11. Il widget resta un IIFE senza
 * dipendenze, uguale per Shopify, WooCommerce e PrestaShop.
 *
 * La logica (cosa si manda, quando) sta in `attribuzione-wix.ts`, provata a
 * parte; qui solo l'aggancio all'SDK e l'invio.
 */
import { site, analytics } from '@wix/site';
import { createClient } from '@wix/sdk';
import { gestisciEventoWix, type Legame } from '../features/reveal-result/attribuzione-wix';

/** L'app Cabina pubblicata. `?app=` nell'URL dello script la cambia (collaudo con l'app di prova «Cabina T0»). */
const APP_PUBBLICATA = 'bf706b4d-54db-4b1c-a9c0-0aac0557f34f';
const quiUrl = new URL(import.meta.url);
const applicationId = quiUrl.searchParams.get('app') ?? APP_PUBBLICATA;

const client = createClient({ auth: site.auth(), host: site.host({ applicationId }) });

// Wix lo chiede agli script con `accesstoken="true"` (T0: senza, il client non parte).
export const injectAccessTokenFunction = client.auth.getAccessTokenInjector();

// 19/11/2026 — su un sito passato dalla 3.x alla v4 lo script arriva DUE volte
// (il vecchio frammento del widget, scritto senza componentId, resta accanto al
// nuovo embed `cabina-eventi`): due ascoltatori = ogni legame mandato due volte.
// Come `window.__cabinaCaricato` nel widget, la seconda copia non ascolta.
const giaAttivo = window.__cabinaWix === true;
window.__cabinaWix = true;

/**
 * La chiave del merchant. Dal 19/11/2026 questo script ha un embed suo
 * (`cabina-eventi`, Analytics) col proprio `data-api-key`; i siti fermi a una
 * versione precedente dell'app lo caricano ancora nel frammento del widget, e
 * lì la chiave sta sullo `<script>` del widget. Uno script a moduli non ha
 * `document.currentScript`: lo si cerca per `src`.
 */
function widget(): { apiKey: string; base: string } | null {
  for (const sel of ['script[src*="wix-eventi.js"][data-api-key]', 'script[src*="widget.iife.js"]']) {
    const tag = document.querySelector<HTMLScriptElement>(sel);
    if (!tag?.src) continue;
    const sorgente = new URL(tag.src);
    const apiKey = tag.dataset.apiKey ?? sorgente.searchParams.get('cabina_api_key') ?? '';
    if (apiKey) return { apiKey, base: tag.dataset.apiUrl ?? sorgente.origin };
  }
  return null;
}

function invia(legame: Legame): void {
  const w = widget();
  if (!w) return;
  // text/plain = nessun preflight; keepalive = arriva anche se la pagina cambia (checkout).
  fetch(`${w.base}/api/widget/wix-cart-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ api_key: w.apiKey, ...legame }),
    keepalive: true,
  }).catch(() => {});
}

if (giaAttivo) {
  console.warn('[cabina] warn=WIX_EVENTI_GIA_CARICATO — seconda copia di wix-eventi.js ignorata');
} else {
  try {
    analytics.registerEventListener((nome: string, dati: unknown) => {
      try {
        gestisciEventoWix(nome, dati, { pagina: location.pathname, url: location.href, invia });
      } catch {
        // Un errore qui non deve mai toccare il sito del merchant.
      }
    });
  } catch (err) {
    // Nessun ascoltatore: il segnale non deve dire il contrario (il widget smette
    // di annotare le prove, una seconda copia può riprovare) — rilievi Kilo, #451.
    window.__cabinaWix = false;
    console.warn('[cabina] warn=WIX_EVENTI_REGISTRAZIONE_FALLITA — ordini non collegati alle prove su questa pagina', err);
  }
}
