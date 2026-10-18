<?php
/**
 * Statistiche su ordini e rimborsi per il pannello Cabina («Ordini e resi»).
 *
 * Spente finché il negoziante non accende la casella «Order statistics» in
 * Settings → Cabina (serve anche la Admin API key). Da accese:
 *
 * 1. il widget, a prova completata, scrive nel form del prodotto un campo
 *    nascosto `properties[_cabina]` con l'id della prova (un UUID casuale);
 * 2. qui lo si legge all'«aggiungi al carrello» e lo si porta sulla riga
 *    d'ordine (meta `_cabina`, nascosta perché inizia con `_`);
 * 3. quando l'ordine diventa «in lavorazione», «in sospeso» o «completato», e
 *    a ogni rimborso, si manda a Cabina (`POST /api/v1/orders`) solo: id
 *    dell'ordine e delle righe, quantità, totale netto della riga, valuta,
 *    data e id della prova. Nessun dato del cliente.
 *
 * L'invio passa da Action Scheduler (incluso in WooCommerce): il checkout non
 * aspetta Cabina, e se Cabina non risponde si ritenta più tardi. Ogni invio è
 * idempotente lato server: mandare due volte lo stesso ordine non lo conta due
 * volte.
 *
 * Solo API CRUD di WooCommerce (`wc_get_order`, `get_items`, `get_meta`):
 * funziona con l'archivio ordini HPOS e con quello classico.
 *
 * @package Cabina
 */

defined('ABSPATH') || exit;

/**
 * Raccoglie e invia le statistiche ordini.
 */
class Cabina_Orders {

	/** Hook dell'azione di Action Scheduler che fa l'invio. */
	const ACTION = 'cabina_order_stats_send';

	/** Meta della riga d'ordine (e chiave del dato nel carrello). */
	const META = '_cabina';

	/** Tentativi massimi di un invio fallito per un errore temporaneo. */
	const MAX_TENTATIVI = 6;

	/**
	 * Vero mentre il plugin stesso aggiorna l'opzione (risposta «spente» dal
	 * server): la sanitize della casella non deve richiamare Cabina.
	 *
	 * @var bool
	 */
	public static $dal_server = false;

	/**
	 * Registra gli hook.
	 */
	public static function init(): void {
		add_filter('woocommerce_add_cart_item_data', [self::class, 'add_cart_item_data'], 10, 3);
		add_action('woocommerce_checkout_create_order_line_item', [self::class, 'add_line_item_meta'], 10, 4);
		// Ordine «vero»: pagato, o in attesa di un pagamento manuale (bonifico,
		// contrassegno). Non al checkout: un pagamento fallito lascia un ordine
		// «in attesa di pagamento» che non va contato.
		foreach (['processing', 'on-hold', 'completed'] as $stato) {
			add_action('woocommerce_order_status_' . $stato, [self::class, 'on_order_paid'], 10, 1);
		}
		add_action('woocommerce_order_refunded', [self::class, 'on_order_refunded'], 10, 2);
		add_action(self::ACTION, [self::class, 'send'], 10, 3);
	}

	/**
	 * Accese? (casella del plugin e Admin API key).
	 */
	public static function enabled(): bool {
		return (bool) get_option(CABINA_ORDER_STATS_OPTION, false) && '' !== self::admin_key();
	}

	/**
	 * La Admin API key salvata.
	 */
	public static function admin_key(): string {
		$key = get_option(CABINA_ADMIN_KEY_OPTION, '');
		return is_string($key) ? trim($key) : '';
	}

	/**
	 * Il negozio come lo vede Cabina: host (con porta) e percorso del sito.
	 */
	public static function store_id(): string {
		$parti = wp_parse_url(home_url());
		$store = strtolower((string) ($parti['host'] ?? ''));
		if (!empty($parti['port'])) {
			$store .= ':' . (int) $parti['port'];
		}
		if (!empty($parti['path'])) {
			$store .= '/' . trim(strtolower((string) $parti['path']), '/');
		}
		return rtrim($store, '/');
	}

	/**
	 * Il carrello prende l'id della prova dal form del prodotto.
	 *
	 * @param array $cart_item_data Dati della riga di carrello.
	 * @param int   $product_id     Prodotto.
	 * @param int   $variation_id   Variante.
	 * @return array
	 */
	public static function add_cart_item_data($cart_item_data, $product_id, $variation_id): array {
		$cart_item_data = is_array($cart_item_data) ? $cart_item_data : [];
		if (!self::enabled()) {
			return $cart_item_data;
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- è il form «aggiungi al carrello» di WooCommerce, che non ha un nonce; il valore si accetta solo se è un UUID e non cambia niente da solo.
		$raw = isset($_POST['properties']['_cabina']) ? sanitize_text_field(wp_unslash($_POST['properties']['_cabina'])) : '';
		if (1 === preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $raw)) {
			$cart_item_data[self::META] = strtolower($raw);
		}
		return $cart_item_data;
	}

	/**
	 * Dalla riga di carrello alla riga d'ordine (checkout classico e a blocchi).
	 *
	 * @param WC_Order_Item_Product $item          Riga d'ordine.
	 * @param string                $cart_item_key Chiave della riga di carrello.
	 * @param array                 $values        Dati della riga di carrello.
	 * @param WC_Order              $order         Ordine.
	 */
	public static function add_line_item_meta($item, $cart_item_key, $values, $order): void {
		if (!empty($values[self::META]) && is_string($values[self::META])) {
			$item->add_meta_data(self::META, $values[self::META], true);
		}
	}

	/**
	 * Ordine pagato (o in attesa di un pagamento manuale): in coda l'invio.
	 *
	 * @param int $order_id Ordine.
	 */
	public static function on_order_paid($order_id): void {
		if (self::enabled() && self::dopo_accensione((int) $order_id)) {
			self::enqueue('order', (int) $order_id);
		}
	}

	/**
	 * Rimborso: in coda l'invio delle righe rimborsate.
	 *
	 * @param int $order_id  Ordine.
	 * @param int $refund_id Rimborso.
	 */
	public static function on_order_refunded($order_id, $refund_id): void {
		if (self::enabled() && self::dopo_accensione((int) $order_id)) {
			self::enqueue('refund', (int) $refund_id);
		}
	}

	/**
	 * Un ordine nato prima dell'accensione non si manda: il pannello conta
	 * dalla data di accensione, e i suoi rimborsi arriverebbero «monchi».
	 *
	 * @param int $order_id Ordine.
	 */
	private static function dopo_accensione(int $order_id): bool {
		$order = wc_get_order($order_id);
		if (!$order || !$order->get_date_created()) {
			return false;
		}
		$dal = (int) get_option(CABINA_ORDER_STATS_SINCE_OPTION, 0);
		return $order->get_date_created()->getTimestamp() >= $dal;
	}

	/**
	 * Casella tolta: `disable` in coda, con gli stessi ritentativi degli
	 * ordini. Mandato una volta sola e perso, il pannello Cabina mostrerebbe
	 * «accese» un negozio che non manda più niente (rilievo Kilo sulla #341).
	 */
	public static function queue_disable(): void {
		if ('' !== self::admin_key()) {
			self::enqueue('disable', 0);
		}
	}

	/**
	 * Mette in coda un invio (subito, in background).
	 *
	 * @param string $event   `order`, `refund` o `disable`.
	 * @param int    $id      Id dell'ordine o del rimborso.
	 * @param int    $attempt Tentativo (0 = il primo).
	 * @param int    $delay   Secondi di attesa.
	 */
	private static function enqueue(string $event, int $id, int $attempt = 0, int $delay = 0): void {
		$args = [$event, $id, $attempt];
		if ($delay > 0 && function_exists('as_schedule_single_action')) {
			as_schedule_single_action(time() + $delay, self::ACTION, $args, 'cabina');
		} elseif (function_exists('as_enqueue_async_action')) {
			as_enqueue_async_action(self::ACTION, $args, 'cabina');
		} else {
			// Senza Action Scheduler (non dovrebbe succedere con WooCommerce): subito, una volta.
			self::send($event, $id, self::MAX_TENTATIVI);
		}
	}

	/**
	 * L'invio vero (azione di Action Scheduler).
	 *
	 * @param string $event   `order`, `refund` o `disable`.
	 * @param int    $id      Id dell'ordine o del rimborso (0 per `disable`).
	 * @param int    $attempt Tentativo.
	 */
	public static function send($event, $id, $attempt = 0): void {
		if ('disable' === $event) {
			// Riaccese nel frattempo: l'`enable` è già passato, lo spegnimento
			// in coda non vale più.
			if ((bool) get_option(CABINA_ORDER_STATS_OPTION, false) || '' === self::admin_key()) {
				return;
			}
			$corpo = ['event' => 'disable'];
		} elseif (!self::enabled()) {
			return;
		} else {
			$corpo = 'order' === $event ? self::order_payload((int) $id) : self::refund_payload((int) $id);
		}
		if (null === $corpo) {
			return;
		}
		$esito = self::post($corpo);
		if ('retry' === $esito && (int) $attempt + 1 < self::MAX_TENTATIVI) {
			// 1, 2, 4, 8, 16 minuti.
			self::enqueue((string) $event, (int) $id, (int) $attempt + 1, 60 * (2 ** (int) $attempt));
		}
	}

	/**
	 * Le righe dell'ordine, con l'id della prova dove c'è.
	 *
	 * @param int $order_id Ordine.
	 * @return array|null
	 */
	private static function order_payload(int $order_id): ?array {
		$order = wc_get_order($order_id);
		if (!$order || $order instanceof WC_Order_Refund || !$order->get_date_created()) {
			return null;
		}
		$righe = [];
		foreach ($order->get_items('line_item') as $item_id => $item) {
			$sessione = $item->get_meta(self::META, true);
			$righe[]  = [
				'id'      => (int) $item_id,
				'qty'     => max(0, (int) $item->get_quantity()),
				// Totale della riga dopo gli sconti, tasse escluse.
				'total'   => max(0, round((float) $item->get_total(), 2)),
				'session' => is_string($sessione) && '' !== $sessione ? $sessione : null,
			];
		}
		if (empty($righe)) {
			return null;
		}
		return [
			'event' => 'order',
			'order' => [
				'id'         => (int) $order->get_id(),
				'created_at' => $order->get_date_created()->format(DATE_ATOM),
				'currency'   => strtoupper((string) $order->get_currency()),
				'lines'      => $righe,
			],
		];
	}

	/**
	 * Le righe rimborsate. Un rimborso del solo importo (senza righe) conta
	 * solo se rimborsa tutto l'ordine: allora sono rimborsate tutte.
	 *
	 * @param int $refund_id Rimborso.
	 * @return array|null
	 */
	private static function refund_payload(int $refund_id): ?array {
		$refund = wc_get_order($refund_id);
		if (!$refund instanceof WC_Order_Refund) {
			return null;
		}
		$order = wc_get_order($refund->get_parent_id());
		if (!$order) {
			return null;
		}
		$righe = [];
		foreach ($refund->get_items('line_item') as $item) {
			$originale = (int) $item->get_meta('_refunded_item_id', true);
			if ($originale > 0) {
				$righe[] = $originale;
			}
		}
		if (empty($righe) && 'refunded' === $order->get_status()) {
			$righe = array_map('intval', array_keys($order->get_items('line_item')));
		}
		if (empty($righe)) {
			return null;
		}
		return [
			'event'  => 'refund',
			'refund' => [
				'order_id' => (int) $order->get_id(),
				'lines'    => array_values(array_unique($righe)),
			],
		];
	}

	/**
	 * Chiama Cabina con un evento.
	 *
	 * @param array $corpo Evento, senza piattaforma e negozio.
	 * @return array{0:int,1:mixed,2:string} Codice HTTP (0 = rete), JSON, messaggio d'errore.
	 */
	public static function call(array $corpo): array {
		$risposta = wp_remote_post(
			CABINA_API_URL . '/api/v1/orders',
			[
				'timeout' => 10,
				'headers' => [
					'Content-Type' => 'application/json',
					'X-Admin-Key'  => self::admin_key(),
				],
				'body'    => wp_json_encode(array_merge(['platform' => 'woocommerce', 'store' => self::store_id()], $corpo)),
			]
		);
		if (is_wp_error($risposta)) {
			return [0, null, $risposta->get_error_message()];
		}
		$codice = (int) wp_remote_retrieve_response_code($risposta);
		$json   = json_decode((string) wp_remote_retrieve_body($risposta), true);
		$errore = is_array($json) && isset($json['error']['message']) ? (string) $json['error']['message'] : 'HTTP ' . $codice;
		return [$codice, $json, 200 === $codice ? '' : $errore];
	}

	/**
	 * Manda un ordine o un rimborso. Restituisce `ok`, `retry` (errore
	 * temporaneo) o `stop`.
	 *
	 * @param array $corpo Evento.
	 * @return string
	 */
	private static function post(array $corpo): string {
		list($codice, $json, $errore) = self::call($corpo);
		if (200 === $codice) {
			delete_option(CABINA_ORDER_STATS_ERROR_OPTION);
			// Spente dal pannello Cabina: si spegne anche la casella.
			if (is_array($json) && isset($json['data']['enabled']) && false === $json['data']['enabled']) {
				self::$dal_server = true;
				update_option(CABINA_ORDER_STATS_OPTION, false);
				self::$dal_server = false;
			}
			return 'ok';
		}
		self::ricorda_errore($errore);
		return (0 === $codice || 429 === $codice || $codice >= 500) ? 'retry' : 'stop';
	}

	/**
	 * L'ultimo errore, mostrato nella pagina delle impostazioni (es. una Admin
	 * API key rigenerata nel pannello: il plugin smette di mandare).
	 *
	 * @param string $messaggio Messaggio.
	 */
	public static function ricorda_errore(string $messaggio): void {
		update_option(
			CABINA_ORDER_STATS_ERROR_OPTION,
			gmdate('Y-m-d H:i') . ' UTC — ' . sanitize_text_field($messaggio),
			false
		);
	}
}
