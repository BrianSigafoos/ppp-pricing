#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const DEFAULT_MAPPING = "docs/data/currency_map.json";
const DEFAULT_OUT = "docs/data/ppp_rates.json";
const DEFAULT_RAW_DIR = "data/raw";

const WB_URL =
  "https://api.worldbank.org/v2/country/all/indicator/PA.NUS.PPP?format=json&per_page=20000";
const ECB_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const OPEN_ER_API_URL = "https://open.er-api.com/v6/latest/USD";

function parseArgs(argv) {
  const args = {
    mapping: DEFAULT_MAPPING,
    out: DEFAULT_OUT,
    rawDir: null,
    saveRaw: false,
    exchangeSource: "open_er_api",
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--mapping") args.mapping = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--exchange-source") args.exchangeSource = argv[++i];
    else if (arg === "--save-raw") {
      args.saveRaw = true;
      args.rawDir = DEFAULT_RAW_DIR;
    } else if (arg === "--raw-dir") {
      args.saveRaw = true;
      args.rawDir = argv[++i];
    }
  }
  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "ppp-pricing-refresh/1.0" },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} for ${url}`);
  }
  return await res.text();
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "ppp-pricing-refresh/1.0" },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} for ${url}`);
  }
  return await res.json();
}

function parseEcbRates(xmlText) {
  const timeMatch = xmlText.match(/time=['"]([^'"]+)['"]/);
  const date = timeMatch ? timeMatch[1] : null;
  const rates = {};
  for (const match of xmlText.matchAll(/<Cube\s+([^>]+?)\/>/g)) {
    const attrs = {};
    for (const attr of match[1].matchAll(/([a-zA-Z]+)=['"]([^'"]+)['"]/g)) {
      attrs[attr[1]] = attr[2];
    }
    if (attrs.currency && attrs.rate) {
      const rate = Number(attrs.rate);
      if (!Number.isNaN(rate)) rates[attrs.currency] = rate;
    }
  }
  return { date, rates };
}

function buildUsdRates(ecbRates) {
  const usdPerEur = ecbRates.USD;
  if (!usdPerEur) {
    throw new Error("ECB USD rate missing");
  }
  const usdBaseRates = { USD: 1 };
  for (const [code, rate] of Object.entries(ecbRates)) {
    if (code === "USD") continue;
    usdBaseRates[code] = rate / usdPerEur;
  }
  return usdBaseRates;
}

function normalizeDate(input) {
  if (!input) return null;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

async function fetchExchangeRates(source) {
  if (source === "ecb") {
    const xml = await fetchText(ECB_URL);
    const { date, rates } = parseEcbRates(xml);
    return {
      date: date || null,
      rates: buildUsdRates(rates),
      source: "ecb",
    };
  }

  if (source === "open_er_api") {
    const json = await fetchJson(OPEN_ER_API_URL);
    if (!json || json.result !== "success") {
      throw new Error("open.er-api.com returned an error");
    }
    return {
      date: normalizeDate(json.time_last_update_utc),
      rates: json.rates || {},
      source: "open_er_api",
    };
  }

  throw new Error(`Unknown exchange source: ${source}`);
}

function parseWorldBankRecords(records) {
  const latest = {};
  for (const rec of records) {
    if (!rec || !rec.country || !rec.country.id) continue;
    if (rec.value === null || rec.value === undefined) continue;
    const iso2 = rec.country.id;
    const iso3 = rec.countryiso3code;
    const year = Number(rec.date);
    const value = Number(rec.value);
    if (Number.isNaN(year) || Number.isNaN(value)) continue;
    if (!latest[iso2] || year > latest[iso2].year) {
      latest[iso2] = { year, value };
    }
    if (iso3 && (!latest[iso3] || year > latest[iso3].year)) {
      latest[iso3] = { year, value };
    }
  }
  return latest;
}

function sortData(data) {
  return data.sort((a, b) => {
    if (a.currency_code === b.currency_code) {
      return a.country_name.localeCompare(b.country_name);
    }
    return a.currency_code.localeCompare(b.currency_code);
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const mappingPath = path.resolve(args.mapping);
  const outPath = path.resolve(args.out);

  if (!fs.existsSync(mappingPath)) {
    throw new Error(`Mapping not found: ${mappingPath}`);
  }

  const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf-8"));

  const [wbJson, exchange] = await Promise.all([
    fetchJson(WB_URL),
    fetchExchangeRates(args.exchangeSource),
  ]);

  if (args.saveRaw) {
    ensureDir(args.rawDir);
    fs.writeFileSync(
      path.join(args.rawDir, "world_bank_ppp.json"),
      JSON.stringify(wbJson, null, 2) + "\n",
    );
    fs.writeFileSync(
      path.join(args.rawDir, "exchange_rates.json"),
      JSON.stringify(exchange, null, 2) + "\n",
    );
  }

  const wbRecords = Array.isArray(wbJson) ? wbJson[1] : [];
  const wbLatest = parseWorldBankRecords(wbRecords || []);

  const exchangeDate = exchange.date;
  const usdRates = exchange.rates;

  const rows = [];
  let missingPpp = 0;
  let missingExch = 0;
  let missingPppYear = 0;

  for (const entry of Object.values(mapping)) {
    const ppp = wbLatest[entry.iso2] || wbLatest[entry.iso3] || null;
    if (!ppp) missingPpp++;
    if (ppp && !ppp.year) missingPppYear++;

    const currencyCode = entry.currency_code;
    const exchRate =
      currencyCode && usdRates[currencyCode.toUpperCase()]
        ? usdRates[currencyCode.toUpperCase()]
        : null;
    if (!exchRate) missingExch++;

    rows.push({
      country_name: entry.country_name,
      iso3: entry.iso3,
      iso2: entry.iso2,
      currency_code: currencyCode,
      ppp_rate: ppp ? ppp.value : null,
      ppp_year: ppp ? ppp.year : null,
      ppp_source: "world_bank",
      exchange_rate: exchRate,
      exchange_rate_date: exchangeDate,
      exchange_rate_source: exchange.source,
    });
  }

  const sorted = sortData(rows);
  ensureDir(path.dirname(outPath));
  fs.writeFileSync(outPath, JSON.stringify(sorted, null, 2) + "\n");

  console.log(`Wrote ${sorted.length} rows to ${outPath}`);
  console.log(`Missing PPP: ${missingPpp}`);
  console.log(`Missing exchange rate: ${missingExch}`);
  if (!exchangeDate) {
    console.log("Warning: exchange rate date missing.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
