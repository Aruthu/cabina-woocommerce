<?php
/**
 * Plugin Name: Cabina — Virtual Try-On for WooCommerce
 * Plugin URI: https://cabina.io/en/integrations/woocommerce
 * Description: Add a try-on button to your product pages. Cabina lets your customers virtually try on garments using their own photo. Zero code required.
 * Version: 1.3.1
 * Author: Cabina
 * Author URI: https://cabina.io
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: cabina
 * Requires at least: 6.5
 * Requires PHP: 7.4
 * Requires Plugins: woocommerce
 * WC requires at least: 5.0
 * WC tested up to: 11.0
 *
 * @package Cabina
 */

defined('ABSPATH') || exit;

define('CABINA_VERSION', '1.3.1');
define('CABINA_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('CABINA_PLUGIN_URL', plugin_dir_url(__FILE__));
// 📌 2026-09-09 — il widget e' DENTRO il plugin (assets/widget.iife.js, build
// non minificata), non piu' caricato dal CDN: WordPress.org ha rifiutato la
// 1.0.0 perche' la funzione centrale era uno script esterno con aggiornamenti
// automatici da fuori. Al CDN restano solo le chiamate API del servizio
// (config, traduzioni, foto delle modelle, prova). Conseguenza: ogni rilascio
// del widget vuole `npm run build:plugin -w apps/widget`, un bump di
// CABINA_VERSION e una release su SVN. (L'SRI resta fuori: stessa origine.)
define('CABINA_WIDGET_SRC', CABINA_PLUGIN_URL . 'assets/widget.iife.js');
// Ridefinibile in wp-config.php (es. `http://host.docker.internal:3000` per
// provare contro il server di sviluppo).
if (!defined('CABINA_API_URL')) {
	define('CABINA_API_URL', 'https://www.cabina.io');
}
define('CABINA_SETTINGS_OPTION_GROUP', 'cabina_settings_group');
define('CABINA_APIKEY_OPTION', 'cabina_api_key');
define('CABINA_ADMIN_KEY_OPTION', 'cabina_admin_key');
define('CABINA_ORDER_STATS_OPTION', 'cabina_order_stats');
define('CABINA_ORDER_STATS_SINCE_OPTION', 'cabina_order_stats_since');
define('CABINA_ORDER_STATS_ERROR_OPTION', 'cabina_order_stats_error');

require_once CABINA_PLUGIN_DIR . 'includes/class-cabina-settings.php';
require_once CABINA_PLUGIN_DIR . 'includes/class-cabina-injector.php';
require_once CABINA_PLUGIN_DIR . 'includes/class-cabina-orders.php';

/**
 * Compatibilità dichiarata con l'archivio ordini HPOS e col checkout a
 * blocchi: le statistiche ordini usano solo le API CRUD di WooCommerce.
 */
add_action(
	'before_woocommerce_init',
	function () {
		if (class_exists(\Automattic\WooCommerce\Utilities\FeaturesUtil::class)) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', __FILE__, true);
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('cart_checkout_blocks', __FILE__, true);
		}
	}
);

/**
 * Bootstrap del plugin.
 * Registra settings page, script injection, e WooCommerce integration hooks.
 */
function cabina_init(): void {
	Cabina_Settings::init();
	Cabina_Injector::init();
	Cabina_Orders::init();
}
add_action('init', 'cabina_init');

/**
 * Verifica compatibilità con WooCommerce.
 * Mostra un admin notice se WooCommerce non è attivo.
 */
function cabina_check_woocommerce(): void {
	if (!class_exists('WooCommerce')) {
		add_action('admin_notices', function () {
			printf(
				'<div class="notice notice-warning is-dismissible"><p>%s</p></div>',
				esc_html__(
					'Cabina requires WooCommerce to work. Install and activate WooCommerce before using Cabina.',
					'cabina'
				)
			);
		});
	}
}
add_action('admin_init', 'cabina_check_woocommerce');