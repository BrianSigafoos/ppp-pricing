(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.PPP = factory()
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function parseNumber (value) {
    if (value === null || value === undefined || value === '') return null
    const num = Number(value)
    return Number.isFinite(num) ? num : null
  }

  function roundTo (value, increment) {
    if (value === null || value === undefined || Number.isNaN(value)) return value
    return Math.round(value / increment) * increment
  }

  function computeRow (row, usdPrice, usdFloor, usdCapMultiplier) {
    const pppRate = parseNumber(row.ppp_rate)
    const exchRate = parseNumber(row.exchange_rate)
    const valid =
      pppRate !== null &&
      exchRate !== null &&
      pppRate > 0 &&
      exchRate > 0 &&
      usdPrice > 0
    if (!valid) {
      return {
        ...row,
        isMissing: true,
        isAdjusted: false,
        isCapped: false,
        ppp_scaled_raw: null,
        ppp_scaled_rounded: null,
        adjusted_ppp_scaled: null,
        adjusted_ppp_rate: null,
        adjustment_pct: null,
        usd_equiv_raw: null,
        usd_equiv_adjusted: null,
        cap_ppp_scaled: null
      }
    }

    const pppScaledRaw = pppRate * 1000
    const pppScaledRounded = Math.ceil(pppScaledRaw)
    const exchScaled = exchRate * 1000
    const minPppScaled = Math.ceil((usdFloor * exchScaled) / usdPrice)
    const capPppScaled = Math.floor(usdCapMultiplier * exchScaled)
    const adjustedPppScaled = Math.max(pppScaledRounded, minPppScaled)
    const finalPppScaled = Math.min(adjustedPppScaled, capPppScaled)
    const adjustmentPct =
      pppScaledRounded > 0 ? finalPppScaled / pppScaledRounded - 1 : null
    const usdEquivRaw = (usdPrice * pppScaledRaw) / exchScaled
    const usdEquivAdjusted = (usdPrice * finalPppScaled) / exchScaled

    return {
      ...row,
      isMissing: false,
      isAdjusted: finalPppScaled !== pppScaledRounded,
      isCapped: finalPppScaled < adjustedPppScaled,
      ppp_scaled_raw: pppScaledRaw,
      ppp_scaled_rounded: pppScaledRounded,
      adjusted_ppp_scaled: finalPppScaled,
      adjusted_ppp_rate: finalPppScaled / 1000,
      adjustment_pct: adjustmentPct,
      currency_price: roundTo((usdPrice * finalPppScaled) / 1000, 0.25),
      usd_equiv_raw: usdEquivRaw,
      usd_equiv_adjusted: usdEquivAdjusted,
      cap_ppp_scaled: capPppScaled
    }
  }

  function buildYaml (rows, options) {
    const usdPrice = options?.usdPrice ?? 0
    const usdFloor = options?.usdFloor ?? 0
    const usdCapMultiplier = options?.usdCapMultiplier ?? 0
    const sourceUrl = options?.sourceUrl || null

    const computed = rows
      .map((row) => computeRow(row, usdPrice, usdFloor, usdCapMultiplier))
      .filter((row) => !row.isMissing)

    const grouped = new Map()
    for (const row of computed) {
      if (!row.currency_code) continue
      const code = row.currency_code.toLowerCase()
      if (!grouped.has(code)) grouped.set(code, [])
      grouped.get(code).push(row.adjusted_ppp_scaled)
    }

    const entries = [...grouped.entries()].sort((a, b) =>
      a[0].localeCompare(b[0])
    )

    const lines = [
      `# Generated ${new Date().toISOString().slice(0, 10)}`,
      `# USD price: ${usdPrice}, USD floor: ${usdFloor}`,
      `# USD cap multiplier: ${usdCapMultiplier}x`
    ]
    if (sourceUrl) lines.push(`# Source: ${sourceUrl}`)

    for (const [code, values] of entries) {
      const sorted = values.slice().sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      const median =
        sorted.length % 2 === 1
          ? sorted[mid]
          : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      const finalValue = code === 'usd' ? 1000 : median
      lines.push(`${code}: ${finalValue}`)
    }
    return `${lines.join('\n')}\n`
  }

  return {
    parseNumber,
    roundTo,
    computeRow,
    buildYaml
  }
}))
