# PPP Pricing Calculator Plan

## Goals

- Static site (HTML + JS + CSS) that runs on GitHub Pages.
- Use committed PPP + exchange rate data from the repo (no runtime API calls required).
- Let the user enter a USD price and a USD floor, then compute adjusted PPP rates so the USD-equivalent price does not drop below the floor.
- Show a table with PPP + exchange data and export a YAML file with final PPP rates (scaled integers).

## Data Inputs

- PPP data from the World Bank API (latest year per country).
- Exchange rates from the selected live source (default USD-based API).

## Data Refresh (CLI)

- Add a repo script to refresh PPP + exchange rates and regenerate `docs/data/ppp_rates.json`.
- PPP source:
  - World Bank API: indicator `PA.NUS.PPP` (latest year per country).
  - Optional: OECD PPP for Europe if you still want to override WB for EU (confirm).
- Exchange rates source:
  - Primary option: open.er-api.com (USD base, no API key).
  - Alternate: ECB daily reference rates (EUR base) + convert to USD base.
- Script responsibilities:
  - Download latest PPP series, pick latest non-empty value per country.
  - Map WB country codes to currency codes (via a curated mapping file).
  - Fetch exchange rates and convert to USD base.
  - Write `docs/data/ppp_rates.json` with `source_date` and `source_ppp_year`.
  - Emit a diff summary (counts, missing currencies, any invalid rates).
  - Optionally regenerate a CSV snapshot for manual review.

## Proposed Repo Data Files

- `docs/data/ppp_rates.json` (or `docs/data/ppp_rates.csv`): one record per currency.
- Fields:
  - `country_name`
  - `iso3`
  - `iso2`
  - `currency_code` (lowercase)
  - `ppp_rate` (float, local currency per USD in PPP terms)
  - `ppp_year` (int, source year for PPP)
  - `ppp_source` (string, e.g. `world_bank`, `oecd`, `manual`)
  - `exchange_rate` (float, local currency per USD)
  - `exchange_rate_date` (ISO date string)
  - `exchange_rate_source` (string, e.g. `ecb`, `openexchangerates`, `manual`)

## Calculation Logic

- Scale:
  - `ppp_scaled = ppp_rate * 1000`
  - `exch_scaled = exchange_rate * 1000`
- Given inputs `usd_price` and `usd_floor` (with a 1.5x USD cap):
  - `min_ppp_scaled = ceil((usd_floor * exch_scaled) / usd_price)`
  - `max_ppp_scaled = floor((usd_price * 1.5 * exch_scaled) / usd_price)`
  - `adjusted_ppp_scaled = min(max(ppp_scaled, min_ppp_scaled), max_ppp_scaled)`
  - `adjustment_pct = (adjusted_ppp_scaled / ppp_scaled) - 1`
  - `usd_equiv_raw = (usd_price * ppp_scaled) / exch_scaled`
  - `usd_equiv_adjusted = (usd_price * adjusted_ppp_scaled) / exch_scaled`
- Display these columns in the UI:
  - `country_name`, `currency_code`, `ppp_rate`, `exchange_rate`, `adjusted_ppp_scaled`, `adjustment_pct`, `currency_price`, `usd_equiv_adjusted`.
- Extra columns toggle:
  - `ppp_year`, `ppp_source`, `exchange_rate_date`, `exchange_rate_source`.

## UI/UX

- Top input panel:
  - USD price (default 19.00)
  - USD floor (default 5.00)
  - Toggle to show/hide extra columns
  - Export YAML button
- Table:
  - Sticky header with sortable columns (by currency code or country).
  - Highlight rows where adjustment was applied.
  - Show last updated dates for PPP and exchange data.

## YAML Export Format

- Output format:
  - Lowercase currency code keys
  - Integer values scaled by 1000
- Example:
  - `usd: 1000`
  - `inr: 22883`
- Export button builds a string and triggers a file download (Blob + `download` attribute).

## Implementation Steps

1. Build a `scripts/refresh_data` CLI (Node or Ruby) to refresh PPP + exchange rates and output `docs/data/ppp_rates.json`.
2. Build static site:
   - `index.html`, `styles.css`, `app.js`.
   - Load JSON data and render the table.
3. Implement calculation logic and per-row UI updates on input change.
4. Add YAML export and basic validation (missing rates, zero exchange rates).
5. Add lightweight styling and responsive layout for desktop/mobile.
6. Document update workflow in `README.md` (how to refresh data files).

## Open Questions

- Confirm the exact adjustment formula and rounding rules (see questions in chat).
- Decide whether to store PPP + exchange data as JSON or CSV.
- Decide whether to include any additional columns (published rates, diff, etc.).
