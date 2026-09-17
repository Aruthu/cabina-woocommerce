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
				'sanitize_callback' => 'sanitize_text_field',
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
	}

	/**
	 * Renderizza la descrizione della sezione principale.
	 */
	public static function render_section_description(): void {
		printf(
			'<p>%s</p>',
			esc_html__(
				'Enter your Cabina API key to activate the try-on widget on your store\'s product pages. You can find the API key in the Cabina Dashboard → Settings → API Key.',
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
					<li><?php echo esc_html__('Log in to your Cabina Dashboard and copy the API key from Settings → API Key.', 'cabina'); ?></li>
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