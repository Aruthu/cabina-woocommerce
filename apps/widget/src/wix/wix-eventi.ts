/**
 * Script Wix di Cabina (story 14.2): ascolta il carrello per collegare gli
 * ordini alle prove. Servito da `https://www.cabina.io/wix-eventi.js` e
 * caricato dal frammento dell'embedded script dell'app, ACCANTO al widget:
 *
 *   <script type="module" accesstoken="true" src="https://www.cabina.io/wix-eventi.js"></script>
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

window.__cabinaWix = true;

/**
 * La chiave del merchant sta sullo `<script>` del widget, nello stesso
 * frammento (`data-api-key="{{apiKey}}"`); uno script a moduli non ha
 * `document.currentScript` per averne una sua.
 */
function widget(): { apiKey: string; base: string } | null {
  const tag = document.querySelector<HTMLScriptElement>('script[src*="widget.iife.js"]');
  if (!tag?.src) return null;
  const sorgente = new URL(tag.src);
  const apiKey = tag.dataset.apiKey ?? sorgente.searchParams.get('cabina_api_key') ?? '';
  return apiKey ? { apiKey, base: tag.dataset.apiUrl ?? sorgente.origin } : null;
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

analytics.registerEventListener((nome: string, dati: unknown) => {
  try {
    gestisciEventoWix(nome, dati, { pagina: location.pathname, url: location.href, invia });
  } catch {
    // Un errore qui non deve mai toccare il sito del merchant.
  }
});
