const DEFAULT_USD_PRICE = 20
const DEFAULT_USD_FLOOR = 5
const DEFAULT_CAP_MULTIPLIER = 1.5
const DEFAULT_SORT = 'currency_code'
const SHARE_BASE_URL = 'https://ppp-pricing.bfoos.net'

const state = {
  data: [],
  usdPrice: DEFAULT_USD_PRICE,
  usdFloor: DEFAULT_USD_FLOOR,
  usdCapMultiplier: DEFAULT_CAP_MULTIPLIER,
  showExtra: false,
  sortBy: DEFAULT_SORT,
  search: ''
}
const SORT_OPTIONS = new Set([
  'country_name',
  'currency_code',
  'ppp_rate',
  'exchange_rate',
  'adjusted_ppp_rate',
  'adjustment_pct',
  'currency_price',
  'usd_equiv_adjusted',
  'ppp_year',
  'ppp_source',
  'exchange_rate_date',
  'exchange_rate_source'
])

const formatters = {
  rate: new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }),
  integer: new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }),
  usd: new Intl.NumberFormat('en', {
    style: 'currency',
    currency: 'USD'
  }),
  percent: new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })
}

const stringCollator = new Intl.Collator('en', { sensitivity: 'base' })
const currencyFormatterCache = new Map()
const { parseNumber, computeRow, buildYaml } = window.PPP

function escapeHtml (value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatCurrency (value, currencyCode) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  if (!currencyCode) return formatters.usd.format(value)
  const code = currencyCode.toUpperCase()
  if (!currencyFormatterCache.has(code)) {
    try {
      currencyFormatterCache.set(
        code,
        new Intl.NumberFormat('en', {
          style: 'currency',
          currency: code
        })
      )
    } catch (error) {
      currencyFormatterCache.set(code, formatters.usd)
    }
  }
  return currencyFormatterCache.get(code).format(value)
}

function formatValue (value, formatter) {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return formatter.format(value)
}

function buildColumns (showExtra) {
  const base = [
    { key: 'country_name', label: 'Country', sortable: true },
    { key: 'currency_code', label: 'Currency', sortable: true },
    {
      key: 'ppp_rate',
      label: 'PPP rate',
      format: (v) => formatValue(v, formatters.rate),
      sortable: true
    },
    {
      key: 'exchange_rate',
      label: 'FX rate',
      format: (v) => formatValue(v, formatters.rate),
      sortable: true
    },
    {
      key: 'adjusted_ppp_rate',
      label: 'Adjusted PPP',
      format: (v) => formatValue(v, formatters.rate),
      sortable: true
    },
    {
      key: 'adjustment_pct',
      label: 'ADJ %',
      format: (v) => (v === null ? '-' : formatters.percent.format(v)),
      sortable: true
    },
    {
      key: 'currency_price',
      label: 'Local price',
      format: (v, row) => formatCurrency(v, row.currency_code),
      sortable: true
    },
    {
      key: 'usd_equiv_adjusted',
      label: 'USD equiv',
      format: (v) => formatValue(v, formatters.usd),
      sortable: true
    }
  ]

  const extra = [
    {
      key: 'ppp_year',
      label: 'PPP year',
      sortable: true
    },
    { key: 'ppp_source', label: 'PPP source', sortable: true },
    { key: 'exchange_rate_date', label: 'FX date', sortable: true },
    { key: 'exchange_rate_source', label: 'FX source', sortable: true }
  ]

  return base.concat(showExtra ? extra : [])
}

function renderTable (rows, columns) {
  const head = document.getElementById('tableHead')
  const body = document.getElementById('tableBody')

  head.innerHTML = `<tr>${columns
    .map((col) => {
      const isSorted = col.key === state.sortBy
      const classes = [
        col.sortable ? 'sortable' : '',
        isSorted ? 'is-sorted' : ''
      ]
        .filter(Boolean)
        .join(' ')
      const indicator = isSorted ? '<span class="sort-indicator">▾</span>' : ''
      return `<th class="${classes}" data-sort="${col.key}">${col.label}${indicator}</th>`
    })
    .join('')}</tr>`

  body.innerHTML = rows
    .map((row) => {
      const classes = [
        row.isCapped ? 'is-capped' : '',
        row.isAdjusted ? 'is-adjusted' : '',
        row.isMissing ? 'is-missing' : ''
      ]
        .filter(Boolean)
        .join(' ')
      return `<tr class="${classes}">${columns
        .map((col) => {
          let value = row[col.key]
          if (col.key === 'currency_code' && value) {
            value = value.toUpperCase()
          }
          const isZeroAdjustment =
            col.key === 'adjustment_pct' &&
            typeof value === 'number' &&
            Math.abs(value) < 1e-6
          const text = col.format
            ? col.format(value, row)
            : value === null || value === undefined || value === ''
              ? '-'
              : value
          const safeText = escapeHtml(text)
          const cellClasses = [
            col.key === 'currency_code' ? 'pill' : '',
            col.key === 'adjusted_ppp_rate' && !row.isAdjusted
              ? 'is-muted'
              : '',
            col.key === 'adjusted_ppp_rate' && row.isAdjusted
              ? 'is-adjusted-value'
              : '',
            isZeroAdjustment ? 'is-muted' : ''
          ]
            .filter(Boolean)
            .join(' ')
          if (cellClasses) {
            return `<td><span class="${cellClasses}">${safeText}</span></td>`
          }
          return `<td>${safeText}</td>`
        })
        .join('')}</tr>`
    })
    .join('')
}

function isMissingValue (value) {
  return value === null || value === undefined || Number.isNaN(value)
}

function sortRows (rows, sortBy) {
  const sorted = [...rows]
  sorted.sort((a, b) => {
    const valA = a[sortBy]
    const valB = b[sortBy]
    const missingA = isMissingValue(valA)
    const missingB = isMissingValue(valB)
    if (missingA && missingB) return 0
    if (missingA) return 1
    if (missingB) return -1
    if (typeof valA === 'number' && typeof valB === 'number') {
      return valB - valA
    }
    return stringCollator.compare(String(valA), String(valB))
  })
  return sorted
}

function getDuplicateNote (data) {
  const counts = {}
  data.forEach((row) => {
    if (!row.currency_code) return
    const code = row.currency_code.toLowerCase()
    counts[code] = (counts[code] || 0) + 1
  })
  const duplicates = Object.entries(counts).filter(([, count]) => count > 1)
  if (!duplicates.length) return ''
  return `Duplicate currencies: ${duplicates.length}. YAML export uses the median adjusted PPP per currency.`
}

function updateStripeCurrencyCount (rows) {
  const stripeCountEl = document.getElementById('stripeCurrencyCount')
  if (!stripeCountEl) return
  const currencies = new Set()
  rows.forEach((row) => {
    if (row.currency_code) currencies.add(row.currency_code.toLowerCase())
  })
  stripeCountEl.textContent = currencies.size
}

function updateSummary (rows, computed) {
  const summaryRows = state.data.length ? state.data : rows
  const total = computed.length
  const adjusted = computed.filter((row) => row.isAdjusted).length
  const capped = computed.filter((row) => row.isCapped).length
  const missing = computed.filter((row) => row.isMissing).length
  const exchangeDate =
    summaryRows.find((row) => row.exchange_rate_date)?.exchange_rate_date || '-'

  document.getElementById('countTotal').textContent = total
  document.getElementById('countAdjusted').textContent = adjusted
  document.getElementById('countCapped').textContent = capped
  document.getElementById('countMissing').textContent = missing
  document.getElementById('exchangeDate').textContent = exchangeDate
  const note = getDuplicateNote(summaryRows)
  const noteEl = document.getElementById('duplicateNote')
  noteEl.textContent = note
  noteEl.style.display = note ? 'block' : 'none'
  updateStripeCurrencyCount(summaryRows)
}

function buildShareUrl (baseUrl) {
  const params = new URLSearchParams()
  if (state.usdPrice !== DEFAULT_USD_PRICE) {
    params.set('price', state.usdPrice.toFixed(2))
  }
  if (state.usdFloor !== DEFAULT_USD_FLOOR) {
    params.set('floor', state.usdFloor.toFixed(2))
  }
  if (state.usdCapMultiplier !== DEFAULT_CAP_MULTIPLIER) {
    params.set('cap', state.usdCapMultiplier.toFixed(2))
  }
  if (state.sortBy !== DEFAULT_SORT) params.set('sort', state.sortBy)
  const search = state.search.trim()
  if (search) params.set('search', search)
  if (state.showExtra) params.set('extra', '1')
  const query = params.toString()
  const base = baseUrl || window.location.pathname
  return query ? `${base}?${query}` : base
}

function buildJson (rows, usdPrice, usdFloor, usdCapMultiplier) {
  const computed = rows.map((row) =>
    computeRow(row, usdPrice, usdFloor, usdCapMultiplier)
  )
  const payload = {
    generated_at: new Date().toISOString(),
    usd_price: usdPrice,
    usd_floor: usdFloor,
    usd_cap_multiplier: usdCapMultiplier,
    rows: computed
  }
  return `${JSON.stringify(payload, null, 2)}\n`
}

function downloadFile (filename, content, type) {
  const mimeType = type || 'text/plain;charset=utf-8'
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function render () {
  const columns = buildColumns(state.showExtra)
  const term = state.search.trim().toLowerCase()
  const filtered = term
    ? state.data.filter((row) => {
      return (
        (row.country_name || '').toLowerCase().includes(term) ||
          (row.currency_code || '').toLowerCase().includes(term) ||
          (row.iso2 || '').toLowerCase().includes(term) ||
          (row.iso3 || '').toLowerCase().includes(term)
      )
    })
    : state.data

  const computed = filtered.map((row) =>
    computeRow(row, state.usdPrice, state.usdFloor, state.usdCapMultiplier)
  )
  const sorted = sortRows(computed, state.sortBy)

  renderTable(sorted, columns)
  updateSummary(filtered, computed)
}

function readParams () {
  const params = new URLSearchParams(window.location.search)
  if (params.has('price')) {
    const price = parseNumber(params.get('price'))
    if (price !== null) state.usdPrice = price
  }
  if (params.has('floor')) {
    const floor = parseNumber(params.get('floor'))
    if (floor !== null) state.usdFloor = floor
  }
  if (params.has('cap')) {
    const cap = parseNumber(params.get('cap'))
    if (cap !== null) state.usdCapMultiplier = cap
  }
  if (params.has('sort')) {
    const sort = params.get('sort')
    if (sort && SORT_OPTIONS.has(sort)) state.sortBy = sort
  }
  if (params.has('search')) {
    state.search = (params.get('search') || '').trim()
  }
  if (params.has('extra')) {
    const extra = params.get('extra')
    if (extra === '1' || extra === 'true') state.showExtra = true
    if (extra === '0' || extra === 'false') state.showExtra = false
  }
}

function syncUrl () {
  const next = buildShareUrl(window.location.pathname)
  window.history.replaceState(null, '', next)
}

async function init () {
  const res = await fetch('data/ppp_rates.json')
  if (!res.ok) {
    throw new Error('Failed to load data/ppp_rates.json')
  }
  state.data = await res.json()
  updateStripeCurrencyCount(state.data)

  readParams()

  const usdPrice = document.getElementById('usdPrice')
  const usdFloor = document.getElementById('usdFloor')
  const capMultiplier = document.getElementById('capMultiplier')
  const showExtra = document.getElementById('showExtra')
  const searchInput = document.getElementById('searchInput')
  const exportYaml = document.getElementById('exportYaml')
  const exportJson = document.getElementById('exportJson')
  const themeToggle = document.getElementById('themeToggle')

  usdPrice.value = state.usdPrice
  usdFloor.value = state.usdFloor
  showExtra.checked = state.showExtra
  searchInput.value = state.search

  usdPrice.addEventListener('input', (event) => {
    state.usdPrice = parseNumber(event.target.value) || 0
    render()
    syncUrl()
  })

  usdFloor.addEventListener('input', (event) => {
    state.usdFloor = parseNumber(event.target.value) || 0
    render()
    syncUrl()
  })

  if (capMultiplier) {
    capMultiplier.innerHTML = ''
    for (let value = 1; value <= 3.001; value += 0.25) {
      const option = document.createElement('option')
      option.value = value.toFixed(2)
      option.textContent = `${value.toFixed(2)}x`
      if (
        Math.abs(value - state.usdCapMultiplier) < 0.001 ||
        (state.usdCapMultiplier === DEFAULT_CAP_MULTIPLIER &&
          Math.abs(value - DEFAULT_CAP_MULTIPLIER) < 0.001)
      ) {
        option.selected = true
      }
      capMultiplier.appendChild(option)
    }
    capMultiplier.addEventListener('change', (event) => {
      state.usdCapMultiplier = parseNumber(event.target.value) || 1
      render()
      syncUrl()
    })
    state.usdCapMultiplier =
      parseNumber(capMultiplier.value) || DEFAULT_CAP_MULTIPLIER
  }

  showExtra.addEventListener('change', (event) => {
    state.showExtra = event.target.checked
    render()
    syncUrl()
  })

  document.getElementById('tableHead').addEventListener('click', (event) => {
    const target = event.target.closest('th[data-sort]')
    if (!target) return
    const key = target.dataset.sort
    if (!SORT_OPTIONS.has(key)) return
    state.sortBy = key
    render()
    syncUrl()
  })

  searchInput.addEventListener('input', (event) => {
    state.search = event.target.value.trim()
    render()
    syncUrl()
  })

  exportYaml.addEventListener('click', () => {
    const yaml = buildYaml(state.data, {
      usdPrice: state.usdPrice,
      usdFloor: state.usdFloor,
      usdCapMultiplier: state.usdCapMultiplier,
      sourceUrl: buildShareUrl(SHARE_BASE_URL)
    })
    downloadFile('currency_ppp.yml', yaml, 'text/yaml;charset=utf-8')
  })

  exportJson.addEventListener('click', () => {
    const json = buildJson(
      state.data,
      state.usdPrice,
      state.usdFloor,
      state.usdCapMultiplier
    )
    downloadFile('currency_ppp.json', json, 'application/json;charset=utf-8')
  })

  if (themeToggle) {
    const root = document.documentElement
    const saved = window.localStorage.getItem('theme')
    const prefersDark =
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    const initial = saved || (prefersDark ? 'dark' : 'light')

    const applyTheme = (theme, persist) => {
      root.setAttribute('data-theme', theme)
      themeToggle.setAttribute(
        'aria-pressed',
        theme === 'dark' ? 'true' : 'false'
      )
      if (persist) window.localStorage.setItem('theme', theme)
    }

    applyTheme(initial, false)

    themeToggle.addEventListener('click', () => {
      const current = root.getAttribute('data-theme') || 'light'
      const next = current === 'dark' ? 'light' : 'dark'
      applyTheme(next, true)
    })
  }

  render()
  syncUrl()
}

init().catch((err) => {
  console.error(err)
  const body = document.getElementById('tableBody')
  if (body) {
    body.innerHTML =
      '<tr><td>Failed to load PPP data. Check data/ppp_rates.json.</td></tr>'
  }
})
