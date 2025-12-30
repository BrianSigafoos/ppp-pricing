# AGENTS.md

## Project Overview

PPP Pricing Calculator is a static site that computes PPP-adjusted pricing with a USD floor and exports `currency_ppp.yml`.
It loads `docs/data/ppp_rates.json`, displays the calculated columns, and ships on GitHub Pages.

## Development Commands

```bash
# Run the local server
make serve

# Refresh PPP + exchange rates
make refresh

```

## Data Refresh Notes

- PPP rates come from the World Bank API (`PA.NUS.PPP`).
- Exchange rates default to open.er-api.com (USD base).
- Output files live under `docs/data/`.

## Project Conventions

- Keep the site static (no build step). Avoid adding dependencies unless needed.
- Maintain provenance fields for PPP and exchange rates per currency.
- Ability to export as YAML: `currency_ppp.yml`.
