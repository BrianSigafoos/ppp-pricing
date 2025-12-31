# PPP Pricing Calculator

Static site to compute PPP-adjusted pricing with a USD floor, apply a configurable
USD cap (1x–3x), and export `currency_ppp.yml` or JSON.

## Quick start

- Run the local server from `docs/`:
  - `make serve`
  - Visit `http://localhost:8000`

## GitHub Pages

- The site deploys from `docs/` using `.github/workflows/pages.yml`.

## Data files

- `docs/data/ppp_rates.json`: PPP + exchange rates with source metadata.
- `docs/data/currency_map.json`: ISO mapping for country/currency metadata.

## Refresh PPP + exchange rates

```
node scripts/refresh_data.js
```

Requires Node.js 18+ (global `fetch`).

Options:

```
node scripts/refresh_data.js --exchange-source ecb
node scripts/refresh_data.js --save-raw
```

## Tests

```
make test
```

## Compare with Stripe country specs

Provide a Stripe country specs JSON response or set `STRIPE_API_KEY` (loaded from
`.env` or `scripts/.env` if present). The comparison is US-focused and uses
the US-supported payment currencies.

```
node scripts/compare_stripe.js --stripe path/to/country_specs.json
```

Or:

```
STRIPE_API_KEY=sk_live_... node scripts/compare_stripe.js
```

Save the Stripe response to `data/stripe_country_specs.json`:

```
node scripts/compare_stripe.js --save-stripe
```

Or specify an output path:

```
node scripts/compare_stripe.js --stripe-out docs/data/stripe_country_specs.json
```

By default the saved file is trimmed to the US entry only (`id`,
`default_currency`, and `supported_payment_currencies`). Use `--stripe-full` to
store the full US response.

## YAML export

- Use the "Export YAML" button in the UI.
- The export de-dupes currencies and uses the median adjusted PPP value per
  currency.

## JSON export

- Use the "Export JSON" button to download the full computed dataset.
