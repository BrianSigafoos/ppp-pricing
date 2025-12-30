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

## YAML export

- Use the "Export YAML" button in the UI.
- The export de-dupes currencies and keeps the first country per currency
  (alphabetical by country name).

## JSON export

- Use the "Export JSON" button to download the full computed dataset.
