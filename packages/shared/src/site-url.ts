/**
 * URL pubblico del sito, ripulito e validato — **unico punto di lettura** di
 * `NEXT_PUBLIC_SITE_URL` in tutto il monorepo.
 *
 * ⚠️ 2026-07-30 — in produzione quella env valeva **`" https://www.cabina.io"`,
 * con uno spazio iniziale** finito dentro un copia-incolla. Essendo inlineata a
 * build time, lo spazio si propagava in ogni consumatore:
 *  - `success_url`/`cancel_url` di Stripe → l'API rispondeva `Invalid URL`,
 *    quindi **nessun merchant poteva fare upgrade né comprare crediti** (500);
 *  - `emailRedirectTo` del Magic Link e `redirectTo` di OAuth → redirect che non
 *    combacia con l'allowlist Supabase.
 * Nessuno dei `?? 'https://cabina.io'` sparsi nel codice interveniva: il valore
 * c'era, era solo sbagliato. Il valore arriva da un incolla umano: va trattato
 * come input non fidato, non come costante.
 *
 * ⛔ 2026-08-19 — **lo stesso spazio, ancora lì, e ancora dannoso.** Questo file
 * stava in `apps/dashboard/src/lib/`, e `apps/web` non l'ha mai ricevuto: sei
 * punti leggevano l'env grezza con un `?? 'https://cabina.io'`. Risultato in
 * produzione: **quarantuno `<loc>` su quarantuno** nel sitemap valevano
 * `" https://cabina.io/it"`, invalidi per il protocollo Sitemap, più la riga
 * `Sitemap:` di robots.txt e tutti i link di `/llms.txt`.
 *
 * 🔑 **Perché non se n'era accorto nessuno**: il `canonical` e gli OpenGraph
 * erano puliti, perché passano da `metadataBase: new URL(BASE)` — e il
 * costruttore `URL` gli spazi li toglie da sé. Il difetto era visibile **solo
 * dove il valore NON veniva parsificato**, cioè nelle concatenazioni di stringa.
 * Sorvegliato ora sull'artefatto pubblicato da `scripts/check-prod.mjs`, perché
 * in entrambi i casi il **codice** era corretto: sbagliata era la configurazione.
 *
 * 📌 Sta qui e non in una delle due app proprio per questo: una lezione imparata
 * in `apps/dashboard` e non copiata in `apps/web` è una lezione che il monorepo
 * non ha imparato.
 *
 * Perché validare e non solo `trim()`: uno spazio è il caso benigno. Un valore
 * senza schema (`www.cabina.io`) o con un `/` di troppo produce gli stessi 500
 * silenziosi, e un URL rotto propagato è peggio del default.
 */

/**
 * True per gli URL che accettiamo: https, oppure http **solo** su localhost (dev).
 *
 * ⚠️ 2026-08-19 (rilievo Kilo) — fino a oggi la seconda condizione era il solo
 * `hostname === 'localhost'`, senza dire nulla sul protocollo: passavano
 * `ftp://localhost`, `ws://localhost` e perfino `javascript://localhost`. Il
 * commento sopra prometteva già «http solo su localhost»: **la funzione non
 * faceva quello che dichiarava**, e chi la leggeva per decidere se fidarsi
 * leggeva la promessa, non il codice.
 *
 * Non è una via d'attacco — il valore arriva da una nostra env, non da un
 * utente — ma è il difetto che questa funzione esiste per intercettare: un
 * incolla sbagliato. Una guardia che accetta l'incolla sbagliato è decorazione.
 */
function isUsable(u: URL): boolean {
  return u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === 'localhost');
}

/**
 * @param fallback usato se l'env è assente, vuota o inutilizzabile.
 *   `auth/confirm` passa l'origin della richiesta; gli altri il dominio pubblico.
 * @returns URL senza spazi né slash finali, pronto per la concatenazione.
 */
export function getSiteUrl(fallback = 'https://cabina.io'): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return fallback;

  try {
    const parsed = new URL(raw);
    if (!isUsable(parsed)) {
      // Non silenzioso: un env sbagliato deve lasciare una traccia, altrimenti
      // si ripresenta come "Stripe dà 500" e si cerca il bug nel posto sbagliato.
      console.error(`[site-url] NEXT_PUBLIC_SITE_URL non utilizzabile (${parsed.protocol}) → uso ${fallback}`);
      return fallback;
    }
    return raw.replace(/\/+$/, '');
  } catch {
    console.error('[site-url] NEXT_PUBLIC_SITE_URL non è un URL valido → uso il fallback');
    return fallback;
  }
}
