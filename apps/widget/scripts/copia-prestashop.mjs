// Copia nel modulo PrestaShop il bundle appena scritto per WooCommerce, con l'intestazione di
// licenza che il validator di Addons vuole in ogni file. Il bundle WooCommerce resta senza.
import fs from 'node:fs';

const dest = '../plugins/prestashop/views/js';
if (!fs.existsSync(dest)) {
  console.log('PrestaShop: cartella assente (mirror pubblico), copia saltata');
} else {
  const intestazione = `/**
 * Cabina widget, bundled for PrestaShop.
 *
 * @author    Cabina
 * @copyright 2026 Cabina
 * @license   MIT
 */
`;
  const bundle = fs.readFileSync('../plugins/woocommerce/assets/widget.iife.js', 'utf8');
  fs.writeFileSync(`${dest}/widget.iife.js`, intestazione + bundle);
  console.log('PrestaShop: bundle copiato');
}
