<?php
/**
 * Disinstallazione del plugin Cabina.
 * Pulizia completa: rimuove tutte le opzioni dal database WordPress.
 * Eseguito automaticamente da WordPress quando l'utente disinstalla il plugin.
 *
 * @package Cabina
 */

defined('WP_UNINSTALL_PLUGIN') || exit;

// Rimuovi tutte le opzioni registrate dal plugin
delete_option('cabina_api_key');
// `cabina_sri_hash` resta nell'elenco di proposito: l'SRI e' stato rimosso il
// 2026-08-07, ma un'installazione precedente puo' avere l'opzione a database e
// la disinstallazione deve continuare a non lasciare residui.
delete_option('cabina_sri_hash');

// Rimuovi eventuali transients
delete_transient('cabina_widget_config');

// Nessun residuo nel database dopo la disinstallazione