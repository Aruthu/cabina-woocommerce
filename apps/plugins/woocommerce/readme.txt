=== Cabina — Virtual Try-On for WooCommerce ===
Contributors: actry
Tags: virtual try-on, fitting room, woocommerce, apparel, size recommendation
Requires at least: 6.5
Requires Plugins: woocommerce
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Add a "Try it on" button to your WooCommerce product pages: customers try garments on their own photo, no app required.

== Description ==

Cabina turns your WooCommerce store into a virtual fitting room. Your customers can:

* **Virtually try on** garments using their own photo
* **See themselves wearing the garment** in a photorealistic AI-generated image
* **Try up to three garments together** — a full outfit in one image
* **Get a size recommendation** based on their real measurements, with a fit preference (fitted, regular, relaxed)
* **Rotate and zoom** to see every detail

**Zero code required.** Install, paste your API key, and the try-on button appears automatically on your product pages.

= How it works =

1. **Sign up on Cabina** — Create a free account at https://cabina.io
2. **Generate your API key** — In the Cabina Dashboard → Installation → Your API key. It is shown only once: copy it right away
3. **Install this plugin** — From the WordPress Plugin Directory or by uploading the ZIP
4. **Paste your API key** — In Settings → Cabina
5. **Done!** — The widget appears on your WooCommerce product pages

= Why Cabina =

* **Increase conversion** — Customers who try on virtually buy more
* **Reduce returns** — Size recommendations cut returns caused by wrong sizes
* **Nothing for shoppers to install** — Runs directly in the customer's browser, mobile included
* **No external code** — The widget script ships inside the plugin and is served from your own site; the try-on, the widget configuration, its translations and the model photos come from Cabina's API
* **Privacy and consent** — Nothing leaves the customer's device without explicit, revocable consent. With consent, the photo is sent to external AI providers to estimate measurements and generate the try-on image; the estimated measurements are not stored, and the generated image is kept for at most 7 days

= Privacy and security =

The customer's photo is sent to external processing providers only after explicit and revocable consent: one service estimates body measurements from the photo for the size recommendation (the numbers are shown to the customer, can be corrected, and are not stored on our servers), another generates the try-on image. Customers who prefer not to send their own photo can try the garment on one of Cabina's models. The resulting image is stored in a private archive for at most 7 days and then removed. Full details in Cabina's privacy policy.

== External Services ==

This plugin connects your store to Cabina, a third-party service operated by Cabina (https://cabina.io). It is required for the virtual try-on functionality: without it the plugin does nothing.

* The widget script itself is bundled with the plugin (`assets/widget.iife.js`, unminified) and served from your own site. No code is loaded from Cabina's servers.
* On product pages the widget requests from the Cabina API (`https://www.cabina.io`) the store's widget configuration, its translations (JSON) and the photos of Cabina's models, using the store's API key.
* When a customer uses the widget, it sends to the Cabina API (`https://www.cabina.io`) the store's API key, the product page URL and the product image URL, plus the data needed to run the try-on. The customer's photo is uploaded only after their explicit, revocable consent, and is used to estimate body measurements for the size recommendation and to generate the try-on image; both happen on external AI providers listed in Cabina's privacy policy.

Service provided by Cabina — [Privacy policy](https://cabina.io/privacy) · [Terms of service](https://cabina.io/termini)

== Source code ==

`assets/widget.iife.js` is compiled (TypeScript, bundled with Vite, not minified). Its full source code, together with this plugin, is public:

https://github.com/Aruthu/cabina-woocommerce

To rebuild the file from source (Node.js 20 or later):

`npm install`
`npm run build:plugin`

The build writes `apps/plugins/woocommerce/assets/widget.iife.js`, byte-identical to the file shipped with the plugin.

== Installation ==

1. Upload the `cabina` folder to the `/wp-content/plugins/` directory, or install directly from the WordPress Plugin Directory
2. Activate the plugin from the WordPress 'Plugins' menu
3. Go to Settings → Cabina
4. Enter your Cabina API key (generate it in the Cabina Dashboard → Installation → Your API key)
5. Click "Save changes"
6. Visit a product page: the try-on button will appear automatically

== Frequently Asked Questions ==

= Is WooCommerce required? =

Yes. Cabina integrates with WooCommerce product page hooks. If WooCommerce is not active, the plugin shows a notice and the widget is not injected.

= Can I customize the widget's appearance? =

Yes! Log in to the Cabina Dashboard (https://cabina.io/dashboard): colors, button text and language are in Widget & Branding, and the garments customers can try on are in Garment Views.

= Do I need to update the plugin when new features are released? =

Yes. The widget ships inside the plugin, so new widget versions arrive as plugin updates through the regular WordPress update mechanism. Widget settings (colors, texts, categories) are managed in the Cabina Dashboard and do not require a plugin update.

= What happens if I uninstall the plugin? =

All settings (API key included) are removed from the database. No leftovers.

= Does it work with any WooCommerce theme? =

Yes. The plugin uses standard WooCommerce hooks. If your theme does not support the primary hook, the widget is injected in a fallback position below the product description.

== Screenshots ==

1. The try-on button on a product page
2. Shoppers try garments on their own photo or on one of 40 preset models (8 shown, the others by age and body type)
3. The result, with a before/after slider and a size recommendation
4. The Cabina Dashboard, where you customize the widget

== Changelog ==

= 1.2.0 =

* Widget updated: three garments can be tried on together, fit preference (fitted, regular, relaxed), size recommendation from height and weight, and 40 preset models instead of 8
* Widget interface available in 8 languages: Italian, English, French, Spanish, German, Japanese, Brazilian Portuguese and Indonesian
* Generated images are kept for 7 days (was 30)
* The API key is now rejected with a message if it does not start with `cab_live_`, instead of being saved silently
* Requires WordPress 6.5 or later, the version that introduced the `Requires Plugins` header this plugin uses

= 1.1.0 =

* The widget is now bundled with the plugin and served from your site, instead of being loaded from Cabina's CDN
* Only API calls to the Cabina service leave the store

= 1.0.0 =

* First stable release
* Try-on button on WooCommerce product pages
* API key configuration in Settings → Cabina
* Fallback for non-standard themes
* Clean uninstall with no leftovers
