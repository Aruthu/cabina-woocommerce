# Cabina — Virtual Try-On for WooCommerce

Source code of the [Cabina](https://cabina.io) plugin for WooCommerce, including the source of the compiled widget it ships (`assets/widget.iife.js`).

| Path | What it is |
|------|------------|
| `apps/plugins/woocommerce/` | The WordPress plugin, as distributed (PHP, `readme.txt`, compiled widget) |
| `apps/widget/` | Source of the widget (TypeScript, bundled with Vite into a single IIFE file) |
| `packages/shared/` | Types and constants the widget imports |

## Build

Node.js 20 or later.

```bash
npm install
npm run build:plugin
```

The build writes `apps/plugins/woocommerce/assets/widget.iife.js`, not minified, byte-identical to the file shipped with the plugin.

## About this repository

It is a read-only mirror, exported from Cabina's private monorepo at every plugin release. Issues are welcome; for support write to info@cabina.io.

## License

GPL-2.0-or-later — see [LICENSE](LICENSE).
