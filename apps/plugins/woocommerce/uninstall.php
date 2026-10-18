<?php
/**
 * Disinstallazione del plugin Cabina.
 * Pulizia completa: rimuove tutte le opzioni dal database WordPress.
 * Eseguito automaticamente da WordPress quando l'utente disinstalla il plugin.
 *
 * @package Cabina
 */

defined('WP_UNINSTALL_PLUGIN') || exit;

// Statistiche ordini accese: si dice a Cabina che sono spente, così il pannello
// non le mostra «accese» per un negozio che non manda più niente. Al meglio:
// se Cabina non risponde, la disinstallazione va avanti lo stesso. Qui l'invio
// è diretto e non in coda come dalla casella: dopo la disinstallazione il
// plugin non c'è più, e un'azione di Action Scheduler non avrebbe chi la
// esegue. Il file principale del plugin qui non è caricato: le costanti
// servono alla classe.
if (!defined('CABINA_API_URL')) {
	define('CABINA_API_URL', 'https://www.cabina.io');
}
if (!defined('CABINA_ADMIN_KEY_OPTION')) {
	define('CABINA_ADMIN_KEY_OPTION', 'cabina_admin_key');
}
require_once __DIR__ . '/includes/class-cabina-orders.php';
if (get_option('cabina_order_stats', false) && '' !== Cabina_Orders::admin_key()) {
	Cabina_Orders::call(['event' => 'disable']);
}
// Invii ancora in coda: senza il plugin non avrebbero chi li esegue.
if (function_exists('as_unschedule_all_actions')) {
	as_unschedule_all_actions('cabina_order_stats_send');
}

// Rimuovi tutte le opzioni registrate dal plugin
delete_option('cabina_api_key');
delete_option('cabina_admin_key');
delete_option('cabina_order_stats');
delete_option('cabina_order_stats_since');
delete_option('cabina_order_stats_error');
// `cabina_sri_hash` resta nell'elenco di proposito: l'SRI e' stato rimosso il
// 2026-08-07, ma un'installazione precedente puo' avere l'opzione a database e
// la disinstallazione deve continuare a non lasciare residui.
delete_option('cabina_sri_hash');

// Rimuovi eventuali transients
delete_transient('cabina_widget_config');

// Nessun residuo nel database dopo la disinstallazione