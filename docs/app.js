const state = {
  data: [],
  usdPrice: 19,
  usdFloor: 5,
  usdCapMultiplier: 1.5,
  showExtra: false,
  sortBy: "currency_code",
  search: "",
};

const DEFAULT_CAP_MULTIPLIER = 1.5;

const formatters = {
  rate: new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }),
  integer: new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }),
  usd: new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
  }),
  percent: new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }),
};

const currencyFormatterCache = new Map();

function formatCurrency(value, currencyCode) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (!currencyCode) return formatters.usd.format(value);
  const code = currencyCode.toUpperCase();
  if (!currencyFormatterCache.has(code)) {
    try {
      currencyFormatterCache.set(
        code,
        new Intl.NumberFormat("en", {
          style: "currency",
          currency: code,
        }),
      );
    } catch (error) {
      currencyFormatterCache.set(code, formatters.usd);
    }
  }
  return currencyFormatterCache.get(code).format(value);
}

function parseNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function computeRow(row, usdPrice, usdFloor, usdCapMultiplier) {
  const pppRate = parseNumber(row.ppp_rate);
  const exchRate = parseNumber(row.exchange_rate);
  const valid =
    pppRate !== null &&
    exchRate !== null &&
    pppRate > 0 &&
    exchRate > 0 &&
    usdPrice > 0;
  if (!valid) {
    return {
      ...row,
      isMissing: true,
      isAdjusted: false,
      ppp_scaled_raw: null,
      ppp_scaled_rounded: null,
      adjusted_ppp_scaled: null,
      adjustment_pct: null,
      usd_equiv_raw: null,
      usd_equiv_adjusted: null,
    };
  }

  const pppScaledRaw = pppRate * 1000;
  const pppScaledRounded = Math.ceil(pppScaledRaw);
  const exchScaled = exchRate * 1000;
  const minPppScaled = Math.ceil((usdFloor * exchScaled) / usdPrice);
  const capPppScaled = Math.floor(
    (usdPrice * usdCapMultiplier * exchScaled) / usdPrice,
  );
  const adjustedPppScaled = Math.max(pppScaledRounded, minPppScaled);
  const finalPppScaled = Math.min(adjustedPppScaled, capPppScaled);
  const adjustmentPct =
    pppScaledRounded > 0 ? finalPppScaled / pppScaledRounded - 1 : null;
  const usdEquivRaw = (usdPrice * pppScaledRaw) / exchScaled;
  const usdEquivAdjusted = (usdPrice * finalPppScaled) / exchScaled;

  return {
    ...row,
    isMissing: false,
    isAdjusted: finalPppScaled !== pppScaledRounded,
    isCapped: finalPppScaled < adjustedPppScaled,
    ppp_scaled_raw: pppScaledRaw,
    ppp_scaled_rounded: pppScaledRounded,
    adjusted_ppp_scaled: finalPppScaled,
    adjustment_pct: adjustmentPct,
    currency_price: (usdPrice * finalPppScaled) / 1000,
    usd_equiv_raw: usdEquivRaw,
    usd_equiv_adjusted: usdEquivAdjusted,
    cap_ppp_scaled: capPppScaled,
  };
}

function formatValue(value, formatter) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return formatter.format(value);
}

function buildColumns(showExtra) {
  const base = [
    { key: "country_name", label: "Country" },
    { key: "currency_code", label: "Currency" },
    {
      key: "ppp_rate",
      label: "PPP rate",
      format: (v) => formatValue(v, formatters.rate),
    },
    {
      key: "exchange_rate",
      label: "Exchange rate",
      format: (v) => formatValue(v, formatters.rate),
    },
    {
      key: "adjusted_ppp_scaled",
      label: "Adjusted PPP rate",
      format: (v) => formatValue(v, formatters.integer),
    },
    {
      key: "adjustment_pct",
      label: "Adjustment %",
      format: (v) => (v === null ? "-" : formatters.percent.format(v)),
    },
    {
      key: "currency_price",
      label: "Currency price",
      format: (v, row) => formatCurrency(v, row.currency_code),
    },
    {
      key: "usd_equiv_adjusted",
      label: "USD equiv (adj)",
      format: (v) => formatValue(v, formatters.usd),
    },
  ];

  const extra = [
    {
      key: "ppp_year",
      label: "PPP year",
    },
    { key: "ppp_source", label: "PPP source" },
    { key: "exchange_rate_date", label: "FX date" },
    { key: "exchange_rate_source", label: "FX source" },
  ];

  return base.concat(showExtra ? extra : []);
}

function renderTable(rows, columns) {
  const head = document.getElementById("tableHead");
  const body = document.getElementById("tableBody");

  head.innerHTML = `<tr>${columns
    .map((col) => `<th>${col.label}</th>`)
    .join("")}</tr>`;

  body.innerHTML = rows
    .map((row) => {
      const classes = [
        row.isCapped ? "is-capped" : "",
        row.isAdjusted ? "is-adjusted" : "",
        row.isMissing ? "is-missing" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<tr class="${classes}">${columns
        .map((col) => {
          let value = row[col.key];
          if (col.key === "currency_code" && value) {
            value = value.toUpperCase();
          }
          const text = col.format
            ? col.format(value, row)
            : value === null || value === undefined || value === ""
              ? "-"
              : value;
          const cellClass = col.key === "currency_code" ? "pill" : "";
          return `<td>${cellClass ? `<span class="${cellClass}">${text}</span>` : text}</td>`;
        })
        .join("")}</tr>`;
    })
    .join("");
}

function sortRows(rows, sortBy) {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    const valA = a[sortBy];
    const valB = b[sortBy];
    if (typeof valA === "number" && typeof valB === "number") {
      return valB - valA;
    }
    return String(valA || "").localeCompare(String(valB || ""));
  });
  return sorted;
}

function getDuplicateNote(data) {
  const counts = {};
  data.forEach((row) => {
    if (!row.currency_code) return;
    const code = row.currency_code.toLowerCase();
    counts[code] = (counts[code] || 0) + 1;
  });
  const duplicates = Object.entries(counts).filter(([, count]) => count > 1);
  if (!duplicates.length) return "";
  return `Duplicate currencies: ${duplicates.length}. YAML export keeps the first country per currency (alphabetical).`;
}

function updateSummary(rows, computed) {
  const total = computed.length;
  const adjusted = computed.filter((row) => row.isAdjusted).length;
  const capped = computed.filter((row) => row.isCapped).length;
  const missing = computed.filter((row) => row.isMissing).length;
  const exchangeDate =
    rows.find((row) => row.exchange_rate_date)?.exchange_rate_date || "-";

  document.getElementById("countTotal").textContent = total;
  document.getElementById("countAdjusted").textContent = adjusted;
  document.getElementById("countCapped").textContent = capped;
  document.getElementById("countMissing").textContent = missing;
  document.getElementById("exchangeDate").textContent = exchangeDate;
  const note = getDuplicateNote(rows);
  const noteEl = document.getElementById("duplicateNote");
  noteEl.textContent = note;
  noteEl.style.display = note ? "block" : "none";
}

function buildYaml(rows, usdPrice, usdFloor, usdCapMultiplier) {
  const computed = rows
    .map((row) => computeRow(row, usdPrice, usdFloor, usdCapMultiplier))
    .filter((row) => !row.isMissing)
    .sort(
      (a, b) =>
        a.currency_code.localeCompare(b.currency_code) ||
        a.country_name.localeCompare(b.country_name),
    );

  const deduped = new Map();
  for (const row of computed) {
    const code = row.currency_code.toLowerCase();
    if (deduped.has(code)) continue;
    deduped.set(code, row.adjusted_ppp_scaled);
  }

  const lines = [
    `# Generated ${new Date().toISOString().slice(0, 10)}`,
    `# USD price: ${usdPrice}, USD floor: ${usdFloor}`,
    `# USD cap multiplier: ${usdCapMultiplier}x`,
  ];
  for (const [code, value] of deduped.entries()) {
    lines.push(`${code}: ${value}`);
  }
  return `${lines.join("\n")}\n`;
}

function buildJson(rows, usdPrice, usdFloor, usdCapMultiplier) {
  const computed = rows.map((row) =>
    computeRow(row, usdPrice, usdFloor, usdCapMultiplier),
  );
  const payload = {
    generated_at: new Date().toISOString(),
    usd_price: usdPrice,
    usd_floor: usdFloor,
    usd_cap_multiplier: usdCapMultiplier,
    rows: computed,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function downloadFile(filename, content, type) {
  const mimeType = type || "text/plain;charset=utf-8";
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function render() {
  const columns = buildColumns(state.showExtra);
  const filtered = state.data.filter((row) => {
    if (!state.search) return true;
    const term = state.search.toLowerCase();
    return (
      (row.country_name || "").toLowerCase().includes(term) ||
      (row.currency_code || "").toLowerCase().includes(term) ||
      (row.iso2 || "").toLowerCase().includes(term) ||
      (row.iso3 || "").toLowerCase().includes(term)
    );
  });

  const computed = filtered.map((row) =>
    computeRow(row, state.usdPrice, state.usdFloor, state.usdCapMultiplier),
  );
  const sorted = sortRows(computed, state.sortBy);

  renderTable(sorted, columns);
  updateSummary(filtered, computed);

  const capNote = document.getElementById("capNote");
  if (capNote) {
    capNote.textContent = `Cap: USD equiv <= ${state.usdCapMultiplier.toFixed(2)}x`;
  }
}

async function init() {
  const res = await fetch("data/ppp_rates.json");
  if (!res.ok) {
    throw new Error("Failed to load data/ppp_rates.json");
  }
  state.data = await res.json();

  const usdPrice = document.getElementById("usdPrice");
  const usdFloor = document.getElementById("usdFloor");
  const capMultiplier = document.getElementById("capMultiplier");
  const showExtra = document.getElementById("showExtra");
  const sortBy = document.getElementById("sortBy");
  const searchInput = document.getElementById("searchInput");
  const exportYaml = document.getElementById("exportYaml");
  const exportJson = document.getElementById("exportJson");
  const themeToggle = document.getElementById("themeToggle");

  usdPrice.addEventListener("input", (event) => {
    state.usdPrice = parseNumber(event.target.value) || 0;
    render();
  });

  usdFloor.addEventListener("input", (event) => {
    state.usdFloor = parseNumber(event.target.value) || 0;
    render();
  });

  if (capMultiplier) {
    capMultiplier.innerHTML = "";
    for (let value = 1; value <= 3.001; value += 0.25) {
      const option = document.createElement("option");
      option.value = value.toFixed(2);
      option.textContent = `${value.toFixed(2)}x`;
      if (Math.abs(value - DEFAULT_CAP_MULTIPLIER) < 0.001) {
        option.selected = true;
      }
      capMultiplier.appendChild(option);
    }
    capMultiplier.addEventListener("change", (event) => {
      state.usdCapMultiplier = parseNumber(event.target.value) || 1;
      render();
    });
    state.usdCapMultiplier =
      parseNumber(capMultiplier.value) || DEFAULT_CAP_MULTIPLIER;
  }

  showExtra.addEventListener("change", (event) => {
    state.showExtra = event.target.checked;
    render();
  });

  sortBy.addEventListener("change", (event) => {
    state.sortBy = event.target.value;
    render();
  });

  searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim();
    render();
  });

  exportYaml.addEventListener("click", () => {
    const yaml = buildYaml(
      state.data,
      state.usdPrice,
      state.usdFloor,
      state.usdCapMultiplier,
    );
    downloadFile("currency_ppp.yml", yaml, "text/yaml;charset=utf-8");
  });

  exportJson.addEventListener("click", () => {
    const json = buildJson(
      state.data,
      state.usdPrice,
      state.usdFloor,
      state.usdCapMultiplier,
    );
    downloadFile("currency_ppp.json", json, "application/json;charset=utf-8");
  });

  if (themeToggle) {
    const root = document.documentElement;
    const saved = localStorage.getItem("theme");
    const prefersDark =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = saved || (prefersDark ? "dark" : "light");
    root.setAttribute("data-theme", initial);

    themeToggle.addEventListener("click", () => {
      const current = root.getAttribute("data-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      localStorage.setItem("theme", next);
    });
  }

  render();
}

init().catch((err) => {
  console.error(err);
  const body = document.getElementById("tableBody");
  if (body) {
    body.innerHTML =
      "<tr><td>Failed to load PPP data. Check data/ppp_rates.json.</td></tr>";
  }
});
