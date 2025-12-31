#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const ppp = require('../docs/ppp.js')

const DEFAULT_USD_PRICE = 20
const DEFAULT_USD_FLOOR = 5
const DEFAULT_CAP_MULTIPLIER = 1.5
const EXPECTED_CURRENCY_COUNT = 130

function parseYaml (yaml) {
  const lines = yaml
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  const entries = new Map()
  for (const line of lines) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = Number(line.slice(idx + 1).trim())
    entries.set(key, value)
  }
  return entries
}

function assert (condition, message) {
  if (!condition) throw new Error(message)
}

function main () {
  const dataPath = path.resolve('docs/data/ppp_rates.json')
  const rows = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
  const yaml = ppp.buildYaml(rows, {
    usdPrice: DEFAULT_USD_PRICE,
    usdFloor: DEFAULT_USD_FLOOR,
    usdCapMultiplier: DEFAULT_CAP_MULTIPLIER
  })
  const entries = parseYaml(yaml)

  assert(entries.get('usd') === 1000, 'Expected usd to be 1000')
  assert(
    entries.size === EXPECTED_CURRENCY_COUNT,
    `Expected ${EXPECTED_CURRENCY_COUNT} currencies, got ${entries.size}`
  )

  console.log(
    `OK: ${entries.size} currencies, usd=${entries.get('usd')}`
  )
}

main()
