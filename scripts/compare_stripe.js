#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const DEFAULT_MAPPING = 'docs/data/currency_map.json'
const DEFAULT_STRIPE_OUT = 'data/stripe_country_specs.json'
const STRIPE_API_URL = 'https://api.stripe.com/v1/country_specs'
const DEFAULT_ENV_FILES = ['.env', path.join(__dirname, '.env')]

function parseArgs (argv) {
  const args = {
    mapping: DEFAULT_MAPPING,
    stripeFile: null,
    stripeKey: null,
    stripeOut: DEFAULT_STRIPE_OUT,
    saveStripe: false,
    saveFullStripe: false
  }

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--mapping') {
      const value = argv[++i]
      if (!value) throw new Error('--mapping requires a path')
      args.mapping = value
    } else if (arg === '--stripe') {
      const value = argv[++i]
      if (!value) throw new Error('--stripe requires a path')
      args.stripeFile = value
    } else if (arg === '--stripe-key') {
      const value = argv[++i]
      if (!value) throw new Error('--stripe-key requires a value')
      args.stripeKey = value
    } else if (arg === '--save-stripe') {
      args.saveStripe = true
    } else if (arg === '--stripe-full') {
      args.saveStripe = true
      args.saveFullStripe = true
    } else if (arg === '--stripe-out') {
      const value = argv[++i]
      if (!value) throw new Error('--stripe-out requires a path')
      args.stripeOut = value
      args.saveStripe = true
    }
  }

  return args
}

function loadEnvFiles (files) {
  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue
    const contents = fs.readFileSync(filePath, 'utf-8')
    for (const line of contents.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx === -1) continue
      const key = trimmed.slice(0, idx).trim()
      if (!key || process.env[key] !== undefined) continue
      let value = trimmed.slice(idx + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  }
}

async function fetchStripeCountrySpecs (stripeKey) {
  if (typeof fetch !== 'function') {
    throw new Error('Node.js 18+ is required to fetch Stripe data.')
  }
  const results = []
  let startingAfter = null

  while (true) {
    const params = new URLSearchParams({ limit: '100' })
    if (startingAfter) params.set('starting_after', startingAfter)
    const res = await fetch(`${STRIPE_API_URL}?${params}`, {
      headers: { Authorization: `Bearer ${stripeKey}` }
    })
    if (!res.ok) {
      throw new Error(`Stripe API error: ${res.status}`)
    }
    const json = await res.json()
    if (!json || !Array.isArray(json.data)) {
      throw new Error('Unexpected Stripe API response')
    }
    results.push(...json.data)
    if (!json.has_more) break
    const last = json.data[json.data.length - 1]
    if (!last || !last.id) break
    startingAfter = last.id
  }

  return results
}

function normalizeStripeData (raw) {
  if (Array.isArray(raw)) return raw
  if (raw && Array.isArray(raw.data)) return raw.data
  throw new Error('Stripe data must be an array or a list response with data[]')
}

function readJson (filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function minimizeStripeData (stripeData) {
  return stripeData.map((spec) => ({
    id: spec.id || null,
    default_currency: spec.default_currency || null,
    supported_payment_currencies: Array.isArray(spec.supported_payment_currencies)
      ? spec.supported_payment_currencies
      : []
  }))
}

function writeStripeOutput (filePath, stripeData, options = {}) {
  const data = options.full ? stripeData : minimizeStripeData(stripeData)
  const payload = {
    generated_at: new Date().toISOString(),
    source: 'stripe_country_specs',
    source_url: STRIPE_API_URL,
    data
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n')
}

function summarizeMissing (mapping, usSpec) {
  const entries = Array.isArray(mapping) ? mapping : Object.values(mapping)
  const mappingCurrencies = new Set()

  for (const entry of entries) {
    if (entry.currency_code) {
      mappingCurrencies.add(String(entry.currency_code).toLowerCase())
    }
  }

  const stripeCurrencies = new Set(
    Array.isArray(usSpec?.supported_payment_currencies)
      ? usSpec.supported_payment_currencies.map((currency) =>
        String(currency).toLowerCase()
      )
      : []
  )

  const missingCurrencies = [...stripeCurrencies].filter(
    (currency) => !mappingCurrencies.has(currency)
  )
  const extraCurrencies = [...mappingCurrencies].filter(
    (currency) => !stripeCurrencies.has(currency)
  )

  missingCurrencies.sort()
  extraCurrencies.sort()

  return {
    mappingCurrencySize: mappingCurrencies.size,
    stripeCurrencySize: stripeCurrencies.size,
    missingCurrencies,
    extraCurrencies
  }
}

async function main () {
  loadEnvFiles(DEFAULT_ENV_FILES)
  const args = parseArgs(process.argv)
  const mappingPath = path.resolve(args.mapping)
  if (!fs.existsSync(mappingPath)) {
    throw new Error(`Mapping not found: ${mappingPath}`)
  }
  if (!args.stripeKey && process.env.STRIPE_API_KEY) {
    args.stripeKey = process.env.STRIPE_API_KEY
  }

  let stripeData
  if (args.stripeFile) {
    const stripePath = path.resolve(args.stripeFile)
    if (!fs.existsSync(stripePath)) {
      throw new Error(`Stripe data not found: ${stripePath}`)
    }
    stripeData = normalizeStripeData(readJson(stripePath))
  } else if (args.stripeKey) {
    stripeData = await fetchStripeCountrySpecs(args.stripeKey)
  } else {
    throw new Error('Provide --stripe <path> or set STRIPE_API_KEY/--stripe-key.')
  }

  const usSpec = stripeData.find(
    (spec) => spec && String(spec.id).toUpperCase() === 'US'
  )
  if (!usSpec) {
    throw new Error('Stripe data missing US country specs.')
  }

  if (args.saveStripe) {
    writeStripeOutput(path.resolve(args.stripeOut), [usSpec], {
      full: args.saveFullStripe
    })
  }

  const mapping = readJson(mappingPath)
  const summary = summarizeMissing(mapping, usSpec)

  console.log('Stripe country: US')
  console.log(`Stripe currencies (US): ${summary.stripeCurrencySize}`)
  console.log(`Mapping currencies: ${summary.mappingCurrencySize}`)

  if (summary.missingCurrencies.length) {
    console.log(`Missing currencies (${summary.missingCurrencies.length}):`)
    console.log(summary.missingCurrencies.join(', '))
  } else {
    console.log('Missing currencies: none')
  }

  if (summary.extraCurrencies.length) {
    console.log(`Extra currencies in mapping (${summary.extraCurrencies.length}):`)
    console.log(summary.extraCurrencies.join(', '))
  }
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
