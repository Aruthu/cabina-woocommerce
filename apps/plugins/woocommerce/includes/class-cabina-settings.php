<?php
/**
 * Pagina di configurazione Cabina in WordPress Admin.
 * Registra una voce in Settings → Cabina con un campo per l'API key.
 *
 * @package Cabina
 */

defined('ABSPATH') || exit;

/**
 * Gestisce la registrazione e il rendering della pagina Settings → Cabina.
 */
class Cabina_Settings {

	/**
	 * La Admin API key come esce dalla sanitize di questo salvataggio (null =
	 * non ancora passata): la casella la usa direttamente, invece di rileggerla
	 * con get_option (rilievo Kilo sulla 1.3.0).
	 *
	 * @var string|null
	 */
	private static $chiave_ora = null;

	/**
	 * Vero se in questo salvataggio il negoziante ha tolto la chiave.
	 *
	 * @var bool
	 */
	private static $chiave_rimossa = false;

	/**
	 * Esito dell'accensione già deciso in questa richiesta: al primo
	 * salvataggio WordPress passa due volte dalla sanitize (update_option →
	 * add_option), e Cabina non va chiamata due volte.
	 *
	 * @var bool|null
	 */
	private static $esito_casella = null;

	/**
	 * Inizializza gli hook per la settings page.
	 */
	public static function init(): void {
		add_action('admin_menu', [self::class, 'add_settings_page']);
		add_action('admin_init', [self::class, 'register_settings']);
	}

	/**
	 * Registra la pagina sotto il menu Settings di WordPress.
	 */
	public static function add_settings_page(): void {
		add_options_page(
			__('Cabina — Virtual Try-On', 'cabina'),
			__('Cabina', 'cabina'),
			'manage_options',
			'cabina-settings',
			[self::class, 'render_settings_page']
		);
	}

	/**
	 * Registra i campi delle impostazioni.
	 */
	public static function register_settings(): void {
		register_setting(
			CABINA_SETTINGS_OPTION_GROUP,
			CABINA_APIKEY_OPTION,
			[
				'type'              => 'string',
				'sanitize_callback' => [self::class, 'sanitize_api_key'],
				'default'           => '',
			]
		);

		add_settings_section(
			'cabina_main_section',
			__('Widget configuration', 'cabina'),
			[self::class, 'render_section_description'],
			'cabina-settings'
		);

		add_settings_field(
			'cabina_api_key',
			__('API Key', 'cabina'),
			[self::class, 'render_api_key_field'],
			'cabina-settings',
			'cabina_main_section'
		);

		// Statistiche ordini: la Admin API key PRIMA della casella, perché
		// WordPress sanifica le opzioni nell'ordine di registrazione e la
		// casella, accendendosi, usa la chiave che la sanitize le passa
		// (`$chiave_ora`). In ordine inverso userebbe la chiave salvata prima.
		register_setting(
			CABINA_SETTINGS_OPTION_GROUP,
			CABINA_ADMIN_KEY_OPTION,
			[
				'type'              => 'string',
				'sanitize_callback' => [self::class, 'sanitize_admin_key'],
				'default'           => '',
			]
		);
		register_setting(
			CABINA_SETTINGS_OPTION_GROUP,
			CABINA_ORDER_STATS_OPTION,
			[
				'type'              => 'boolean',
				'sanitize_callback' => [self::class, 'sanitize_order_stats'],
				'default'           => false,
			]
		);

		add_settings_section(
			'cabina_orders_section',
			__('Order statistics', 'cabina'),
			[self::class, 'render_orders_section_description'],
			'cabina-settings'
		);

		add_settings_field(
			'cabina_admin_key',
			__('Admin API key', 'cabina'),
			[self::class, 'render_admin_key_field'],
			'cabina-settings',
			'cabina_orders_section'
		);

		add_settings_field(
			'cabina_order_stats',
			__('Order statistics', 'cabina'),
			[self::class, 'render_order_stats_field'],
			'cabina-settings',
			'cabina_orders_section'
		);
	}

	/**
	 * Valida la Admin API key (`cab_admin_`): una chiave sbagliata lascia la
	 * precedente, come per la API key del widget. Il campo arriva vuoto
	 * quando non la si cambia (la pagina non la ristampa): vuoto = resta la
	 * chiave salvata.
	 *
	 * Dal form arriva un array (`[key]` e la casella `[remove]`, così non serve
	 * leggere `$_POST`); una stringa resta accettata (update_option diretto e
	 * seconda passata di add_option).
	 *
	 * «Rimuovi la chiave» spegne anche le statistiche: lo si dice a Cabina
	 * subito, con la chiave che sta per sparire (dopo non ci sarebbe più con
	 * che mandare il `disable` in coda).
	 *
	 * @param mixed $value Valore inviato dal form.
	 */
	public static function sanitize_admin_key($value): string {
		$rimuovi = is_array($value) && !empty($value['remove']);
		$key     = sanitize_text_field((string) (is_array($value) ? ($value['key'] ?? '') : $value));

		if ($rimuovi) {
			if (Cabina_Orders::enabled()) {
				Cabina_Orders::call(['event' => 'disable']);
			}
			Cabina_Orders::$dal_server = true;
			update_option(CABINA_ORDER_STATS_OPTION, false);
			Cabina_Orders::$dal_server = false;
			self::$chiave_rimossa = true;
			self::$chiave_ora     = '';
			return '';
		}

		if ('' === $key) {
			$key = Cabina_Orders::admin_key();
		} elseif (1 !== preg_match('/^cab_admin_[0-9a-f]{32}$/', $key)) {
			add_settings_error(
				CABINA_ADMIN_KEY_OPTION,
				'cabina_admin_key_invalid',
				esc_html__('The Cabina Admin API key must start with "cab_admin_" followed by 32 characters. The key was not saved.', 'cabina')
			);
			$key = Cabina_Orders::admin_key();
		}

		self::$chiave_ora = $key;
		return $key;
	}

	/**
	 * La casella «Order statistics». Accenderla chiede a Cabina di aprire la
	 * raccolta (`enable`); se Cabina dice di no (chiave, piano) resta spenta e
	 * la pagina dice perché. Spegnerla lo dice a Cabina (`disable`).
	 *
	 * @param mixed $value Valore inviato dal form (assente = casella tolta).
	 */
	public static function sanitize_order_stats($value): bool {
		$accesa = !empty($value);
		if (Cabina_Orders::$dal_server) {
			return $accesa;
		}
		if (null === self::$esito_casella) {
			self::$esito_casella = self::decidi_casella($accesa);
		}
		return self::$esito_casella;
	}

	/**
	 * La decisione vera della casella, una volta per richiesta.
	 *
	 * @param bool $accesa Casella spuntata nel form.
	 */
	private static function decidi_casella(bool $accesa): bool {
		// Chiave appena tolta: le statistiche sono già spente e Cabina avvisata.
		if (self::$chiave_rimossa) {
			return false;
		}
		$prima = (bool) get_option(CABINA_ORDER_STATS_OPTION, false);
		if ($accesa === $prima) {
			return $accesa;
		}

		if (!$accesa) {
			Cabina_Orders::queue_disable();
			return false;
		}

		$chiave = null === self::$chiave_ora ? Cabina_Orders::admin_key() : self::$chiave_ora;
		if ('' === $chiave) {
			add_settings_error(
				CABINA_ORDER_STATS_OPTION,
				'cabina_order_stats_no_key',
				esc_html__('Order statistics need the Admin API key: generate it in the Cabina Dashboard → API REST and paste it above.', 'cabina')
			);
			return false;
		}

		list($codice, $json, $errore) = Cabina_Orders::call(['event' => 'enable'], $chiave);
		if (200 === $codice && is_array($json) && !empty($json['data']['enabled'])) {
			$dal = isset($json['data']['enabled_at']) ? strtotime((string) $json['data']['enabled_at']) : false;
			update_option(CABINA_ORDER_STATS_SINCE_OPTION, $dal ? $dal : time(), false);
			delete_option(CABINA_ORDER_STATS_ERROR_OPTION);
			return true;
		}

		if (200 === $codice && is_array($json) && isset($json['data']['reason']) && 'plan' === $json['data']['reason']) {
			$messaggio = __('Order statistics are available from the Starter plan. Upgrade in the Cabina Dashboard → Billing, then turn them on again.', 'cabina');
		} else {
			/* translators: %s: error message returned by Cabina */
			$messaggio = sprintf(__('Cabina did not turn on order statistics: %s', 'cabina'), $errore);
		}
		add_settings_error(CABINA_ORDER_STATS_OPTION, 'cabina_order_stats_failed', esc_html($messaggio));
		return false;
	}

	/**
	 * Cosa fanno le statistiche e cosa esce dal negozio.
	 */
	public static function render_orders_section_description(): void {
		printf(
			'<p>%s</p>',
			esc_html__(
				'Optional, off until you turn it on (Starter plan or higher). Cabina\'s dashboard then shows how many orders come from a try-on, what they are worth and how many are refunded, with and without a try-on. For each paid order the plugin sends to Cabina only the order and line IDs, quantity, line total, currency, date and the try-on ID: no customer data (no names, emails, addresses, phone numbers or IP addresses).',
				'cabina'
			)
		);
	}

	/**
	 * Il campo della Admin API key. È una chiave segreta: la pagina non la
	 * ristampa (rilievo Kilo sulla #341), mostra solo le ultime 4 cifre nel
	 * segnaposto. Lasciato vuoto, al salvataggio resta quella salvata.
	 */
	public static function render_admin_key_field(): void {
		$salvata     = Cabina_Orders::admin_key();
		$segnaposto  = '' === $salvata
			? 'cab_admin_...'
			/* translators: %s: the last characters of the saved key, e.g. cab_admin_…1a2b */
			: sprintf(__('Saved (%s)', 'cabina'), 'cab_admin_…' . substr($salvata, -4));
		printf(
			'<input type="password" id="cabina_admin_key" name="%s[key]" value="" class="regular-text" placeholder="%s" autocomplete="new-password" />',
			esc_attr(CABINA_ADMIN_KEY_OPTION),
			esc_attr($segnaposto)
		);
		if ('' !== $salvata) {
			printf(
				'<p><label><input type="checkbox" id="cabina_admin_key_remove" name="%s[remove]" value="1" /> %s</label></p>',
				esc_attr(CABINA_ADMIN_KEY_OPTION),
				esc_html__('Remove the saved key (also turns order statistics off)', 'cabina')
			);
		}
		printf(
			'<p class="description">%s</p>',
			esc_html__(
				'Needed only for order statistics. Generate it in the Cabina Dashboard → API REST. It is secret: it is never shown again, here or on your store pages. Leave the field empty to keep the saved key; if you regenerate it, paste the new one here.',
				'cabina'
			)
		);
	}

	/**
	 * La casella, con l'ultimo errore di invio se c'è.
	 */
	public static function render_order_stats_field(): void {
		printf(
			'<label><input type="checkbox" id="cabina_order_stats" name="%s" value="1" %s /> %s</label>',
			esc_attr(CABINA_ORDER_STATS_OPTION),
			checked((bool) get_option(CABINA_ORDER_STATS_OPTION, false), true, false),
			esc_html__('Send order statistics to Cabina', 'cabina')
		);
		$errore = get_option(CABINA_ORDER_STATS_ERROR_OPTION, '');
		if (is_string($errore) && '' !== $errore) {
			printf(
				'<p class="description" style="color:#b32d2e;">%s</p>',
				/* translators: %s: date and error message of the last failed delivery */
				esc_html(sprintf(__('Last delivery error: %s', 'cabina'), $errore))
			);
		}
		printf(
			'<p class="description">%s</p>',
			esc_html__(
				'WooCommerce does not record returns: refunds are counted, the "size" return reason is not available.',
				'cabina'
			)
		);
	}

	/**
	 * Valida la chiave prima di salvarla.
	 *
	 * Il prefisso `cab_live_` e' la promessa fatta al merchant nella descrizione
	 * del campo: senza controllo una chiave incollata male si salvava in
	 * silenzio, il widget non partiva e la pagina non diceva perche'.
	 * Una chiave rifiutata lascia in posto quella precedente.
	 *
	 * `strpos` e non `str_starts_with`: l'header dichiara PHP 7.4.
	 *
	 * @param mixed $value Valore inviato dal form.
	 */
	public static function sanitize_api_key($value): string {
		$key = sanitize_text_field((string) $value);

		if ('' !== $key && 0 !== strpos($key, 'cab_live_')) {
			add_settings_error(
				CABINA_APIKEY_OPTION,
				'cabina_api_key_invalid',
				esc_html__('The Cabina API key must start with "cab_live_". The key was not saved.', 'cabina')
			);
			return (string) get_option(CABINA_APIKEY_OPTION, '');
		}

		return $key;
	}

	/**
	 * Renderizza la descrizione della sezione principale.
	 */
	public static function render_section_description(): void {
		printf(
			'<p>%s</p>',
			esc_html__(
				'Enter your Cabina API key to activate the try-on widget on your store\'s product pages. Generate the key in the Cabina Dashboard → Installation → Your API key.',
				'cabina'
			)
		);
	}

	/**
	 * Renderizza il campo input per l'API key.
	 */
	public static function render_api_key_field(): void {
		$api_key = get_option(CABINA_APIKEY_OPTION, '');
		printf(
			'<input type="text" id="cabina_api_key" name="%s" value="%s" class="regular-text" placeholder="cab_live_..." />',
			esc_attr(CABINA_APIKEY_OPTION),
			esc_attr($api_key)
		);
		printf(
			'<p class="description">%s</p>',
			esc_html__(
				'The API key of your Cabina account. It must start with "cab_live_".',
				'cabina'
			)
		);
	}

	/**
	 * Renderizza l'intera pagina Settings → Cabina.
	 */
	public static function render_settings_page(): void {
		if (!current_user_can('manage_options')) {
			wp_die(esc_html__('You do not have permission to access this page.', 'cabina'));
		}

		?>
		<div class="wrap">
			<h1><?php echo esc_html__('Cabina — Virtual Try-On', 'cabina'); ?></h1>

			<div class="card" style="max-width: 100%; padding: 10px 20px; margin: 20px 0 20px 0;">
				<h2><?php echo esc_html__('How it works', 'cabina'); ?></h2>
				<ol>
					<li><?php echo esc_html__('Log in to your Cabina Dashboard, open Installation and generate your API key. It is shown only once: copy it right away.', 'cabina'); ?></li>
					<li><?php echo esc_html__('Paste the API key below and click "Save changes".', 'cabina'); ?></li>
					<li><?php echo esc_html__('Visit a product page of your store: the try-on button will appear automatically.', 'cabina'); ?></li>
				</ol>
				<p>
					<?php
					printf(
						/* translators: %1$s / %2$s: opening and closing link tag to the dashboard */
						esc_html__('Need help? Visit the %1$sCabina Dashboard%2$s to manage categories, colors and the widget appearance.', 'cabina'),
						'<a href="https://cabina.io/dashboard" target="_blank" rel="noopener noreferrer">',
						'</a>'
					);
					?>
				</p>
			</div>

			<form method="post" action="options.php">
				<?php
				settings_fields(CABINA_SETTINGS_OPTION_GROUP);
				do_settings_sections('cabina-settings');
				submit_button();
				?>
			</form>

			<div class="card" style="max-width: 100%; padding: 10px 20px; margin: 20px 0;">
				<h3><?php echo esc_html__('Widget updates', 'cabina'); ?></h3>
				<p><?php echo esc_html__('The Cabina widget ships inside this plugin. New widget versions arrive as plugin updates, through the regular WordPress update mechanism.', 'cabina'); ?></p>
			</div>
		</div>
		<?php
	}
}