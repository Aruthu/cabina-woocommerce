<?php
/**
 * Injector del Widget JS Cabina nelle pagine prodotto WooCommerce.
 * Nessuna logica di business — solo lo script tag con la API key.
 *
 * @package Cabina
 */

defined('ABSPATH') || exit;

/**
 * Gestisce l'iniezione del tag <script> del Widget nelle pagine prodotto.
 *
 * 📌 2026-09-07 — riscritto per il Plugin Check di WordPress.org: lo script
 * passa SEMPRE da `wp_enqueue_script` (prima il fallback stampava il tag a
 * mano, e il check lo segnava come errore), e gli attributi che WordPress
 * non conosce (`data-api-key`, `data-api-url`) si aggiungono
 * al tag generato con un `str_replace` su ` src=` — senza riscrivere il tag,
 * che il check considera uno script non accodato. `async` lo mette WordPress
 * stesso (`strategy`, dalla 6.3).
 */
class Cabina_Injector {

	/**
	 * Handle dello script accodato.
	 */
	const HANDLE = 'cabina-widget';

	/**
	 * Inizializza gli hook di iniezione.
	 */
	public static function init(): void {
		// Hook primario: prima del single product summary
		add_action('woocommerce_before_single_product', [self::class, 'inject_widget']);

		// Fallback: dopo i meta prodotto (temi non standard). Accodare due volte
		// lo stesso handle è innocuo: WordPress lo stampa una volta sola.
		add_action('woocommerce_product_meta_end', [self::class, 'inject_widget']);

		add_filter('script_loader_tag', [self::class, 'add_attributes'], 10, 2);
	}

	/**
	 * Accoda lo script del Widget nella pagina prodotto.
	 *
	 * Se l'hook scatta dopo `wp_head`, WordPress lo stampa nel footer: va bene
	 * lo stesso, lo script è `async` e aspetta da solo il DOM.
	 */
	public static function inject_widget(): void {
		if (!is_product()) {
			return;
		}

		$api_key = self::get_api_key();
		if (empty($api_key)) {
			return;
		}

		wp_enqueue_script(
			self::HANDLE,
			CABINA_WIDGET_SRC,
			[],
			CABINA_VERSION,
			[
				'strategy'  => 'async',
				'in_footer' => false,
			]
		);
	}

	/**
	 * Aggiunge al tag generato da WordPress gli attributi che il Widget legge.
	 *
	 * @param string $tag    Il tag <script> generato da WordPress.
	 * @param string $handle L'handle dello script.
	 * @return string
	 */
	public static function add_attributes(string $tag, string $handle): string {
		if (self::HANDLE !== $handle) {
			return $tag;
		}

		$attributes = sprintf(
			' data-api-key="%s" data-api-url="%s"',
			esc_attr(self::get_api_key()),
			esc_url(CABINA_API_URL)
		);

		// Ancorato a `<script`, non a ` src=`: un ottimizzatore che filtra prima
		// (WP Rocket «Delay JavaScript» rinomina `src` in `data-rocket-src`)
		// toglierebbe l'ancora e gli attributi cadrebbero in silenzio.
		$pos = strpos($tag, '<script');
		if (false === $pos) {
			return $tag;
		}

		return substr_replace($tag, $attributes, $pos + strlen('<script'), 0);
	}

	/**
	 * Legge l'API key dalle opzioni WordPress.
	 *
	 * @return string API key o stringa vuota se non configurata.
	 */
	private static function get_api_key(): string {
		$api_key = get_option(CABINA_APIKEY_OPTION, '');
		return is_string($api_key) ? trim($api_key) : '';
	}
}
