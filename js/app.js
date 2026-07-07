/* ============================================================
   CWB Kids — Dashboard de Tráfego
   Busca dados em /api/data (protegido por cookie de sessão) e
   renderiza as 6 abas. Sem framework — DOM + Chart.js puro.
   ============================================================ */

let DATA = null;
const sortState = {};
let dateFilter = { from: null, to: null };

function applyDateFilter(rows) {
  if (!dateFilter.from && !dateFilter.to) return rows;
  return rows.filter((r) => {
    const d = parseDateBR(r["DATA"]);
    if (!d) return false;
    if (dateFilter.from && d < dateFilter.from) return false;
    if (dateFilter.to   && d > dateFilter.to)   return false;
    return true;
  });
}

/* ---------------- Formatação ---------------- */
const parseNum = (v) => {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const fmtBRL   = (v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum   = (v) => Math.round(v || 0).toLocaleString("pt-BR");
const fmtPct   = (v) => ((v || 0) * 100).toFixed(2).replace(".", ",") + "%";
const fmtRatio = (v) => (v || 0).toFixed(2).replace(".", ",");

// Usa "NOME DE EXIBIÇÃO NO DASHBOARD" se preenchido, senão o nome bruto da campanha/conjunto.
const displayName = (row, fallback = "CAMPANHA") =>
  String(row["NOME DE EXIBIÇÃO NO DASHBOARD"] ?? "").trim() || row[fallback] || "";

function parseDateBR(str) {
  const s = String(str ?? "").trim();
  // DD/MM/YYYY ou D/M/YYYY
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  // YYYY-MM-DD (formato ISO retornado pelo Google Sheets)
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}
function isoDate(d) { return d.toISOString().slice(0, 10); }

/* ---------------- Autenticação ---------------- */
async function fetchData() {
  const resp = await fetch("/api/data");
  if (resp.status === 401) { window.location.href = "/login.html"; return null; }
  if (!resp.ok) {
    let detail = "";
    try { detail = (await resp.json()).error || ""; } catch {}
    throw new Error(`Erro ${resp.status}: ${detail || resp.statusText}`);
  }
  return resp.json();
}

/* ---------------- Helpers de agregação ---------------- */
function sumBy(rows, field) {
  return rows.reduce((acc, r) => acc + parseNum(r[field]), 0);
}

function dailySeries(rows, fields) {
  const map = new Map();
  rows.forEach((r) => {
    const d = parseDateBR(r["DATA"]);
    if (!d) return;
    const key = isoDate(d);
    if (!map.has(key)) map.set(key, { date: d, ...Object.fromEntries(fields.map((f) => [f, 0])) });
    const bucket = map.get(key);
    fields.forEach((f) => (bucket[f] += parseNum(r[f])));
  });
  return [...map.values()].sort((a, b) => a.date - b.date);
}

function consolidatedKpis(rows) {
  const impressoes  = sumBy(rows, "IMPRESSÕES");
  const cliques     = sumBy(rows, "CLIQUES");
  const compras     = sumBy(rows, "COMPRAS");
  const receita     = sumBy(rows, "RECEITA");
  const investimento = sumBy(rows, "INVESTIMENTO");
  const safe = (a, b) => b ? a / b : 0;
  return { impressoes, cliques, compras, receita, investimento,
    ctr:  safe(cliques, impressoes),
    cpc:  safe(investimento, cliques),
    cpa:  safe(investimento, compras),
    roas: safe(receita, investimento),
  };
}

/* ---------------- Orgânico (resíduo loja − pago) ---------------- */
function computeOrganicoSeries(organicoRows, metaRows, googleRows) {
  const metaMap   = new Map(dailySeries(metaRows,   ["COMPRAS","RECEITA"]).map((d) => [isoDate(d.date), d]));
  const googleMap = new Map(dailySeries(googleRows, ["COMPRAS","RECEITA"]).map((d) => [isoDate(d.date), d]));
  return organicoRows.map((r) => {
    const d = parseDateBR(r["DATA"]);
    if (!d) return null;
    const key = isoDate(d);
    const m = metaMap.get(key)   || { COMPRAS: 0, RECEITA: 0 };
    const g = googleMap.get(key) || { COMPRAS: 0, RECEITA: 0 };
    return {
      date:    d,
      compras: Math.max(0, parseNum(r["PEDIDOS TOTAIS DA LOJA"]) - m.COMPRAS - g.COMPRAS),
      receita: Math.max(0, parseNum(r["RECEITA TOTAL DA LOJA"])  - m.RECEITA - g.RECEITA),
      sessoes: parseNum(r["SESSÕES"]),
    };
  }).filter(Boolean);
}

/* ---------------- Render: KPI bar ---------------- */
function renderKpiBar(containerId, items) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = items.map((k) =>
    `<div class="kpi">
      <div class="label">${k.label}</div>
      <div class="value">${k.value}</div>
      ${k.delta != null
        ? `<div class="delta ${k.delta >= 0 ? "up" : "down"}">${k.delta >= 0 ? "▲" : "▼"} ${Math.abs(k.delta * 100).toFixed(1)}% vs. período anterior</div>`
        : ""}
    </div>`
  ).join("");
}

/* ---------------- Render: tabela sortável ---------------- */
function renderTable(tableId, columns, rows) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");

  if (!sortState[tableId])
    sortState[tableId] = { col: columns[columns.length - 1].key, dir: "desc" };
  const { col: sortCol, dir: sortDir } = sortState[tableId];

  thead.innerHTML = "<tr>" + columns.map((c) =>
    `<th data-col="${c.key}" class="${c.key === sortCol ? sortDir : ""}">${c.label}</th>`
  ).join("") + "</tr>";

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${columns.length}" class="empty-state">Sem dados ainda — aguardando sincronização.</td></tr>`;
    return;
  }

  const sorted = [...rows].sort((a, b) => {
    const av = parseNum(a[sortCol]) || a[sortCol];
    const bv = parseNum(b[sortCol]) || b[sortCol];
    if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === "asc" ? av - bv : bv - av;
  });

  tbody.innerHTML = sorted.map((row) =>
    "<tr>" + columns.map((c) => `<td>${c.fmt(row[c.key], row)}</td>`).join("") + "</tr>"
  ).join("");

  thead.querySelectorAll("th").forEach((th) => {
    th.onclick = () => {
      const col = th.dataset.col;
      const s = sortState[tableId];
      if (col === s.col) s.dir = s.dir === "asc" ? "desc" : "asc";
      else { s.col = col; s.dir = "desc"; }
      renderTable(tableId, columns, rows);
    };
  });
}

/* ---------------- Charts ---------------- */
const PALETTE = ["#48b8c9", "#ed4c81", "#f59e0b", "#22c55e", "#a78bfa", "#06b6d4", "#f97316"];
const charts = {};

function upsertChart(canvasId, config) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(el, config);
}

function wrapCanvas(canvasId, height) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (canvas.parentElement.classList.contains("chart-canvas-wrap")) return;
  const wrap = document.createElement("div");
  wrap.className = "chart-canvas-wrap";
  wrap.style.cssText = `position:relative;height:${height}px;`;
  canvas.parentNode.insertBefore(wrap, canvas);
  wrap.appendChild(canvas);
}

function renderTrendChart(canvasId, series, investField = "INVESTIMENTO", convField = "COMPRAS") {
  wrapCanvas(canvasId, 260);
  upsertChart(canvasId, {
    type: "line",
    data: {
      labels: series.map((s) => s.date.toLocaleDateString("pt-BR")),
      datasets: [
        { label: "Investimento (R$)", data: series.map((s) => parseNum(s[investField])),
          yAxisID: "y", borderColor: PALETTE[0], backgroundColor: PALETTE[0] + "20",
          fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2 },
        { label: "Compras", data: series.map((s) => parseNum(s[convField]) || s.compras || 0),
          yAxisID: "y1", borderColor: PALETTE[1], backgroundColor: "transparent",
          borderDash: [5, 3], tension: 0.3, pointRadius: 2, borderWidth: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { usePointStyle: true, pointStyle: "circle" } } },
      scales: {
        x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 15 } },
        y:  { position: "left",  title: { display: true, text: "Investimento (R$)" },
               ticks: { callback: (v) => fmtBRL(v) } },
        y1: { position: "right", grid: { drawOnChartArea: false },
               title: { display: true, text: "Compras" } },
      },
    },
  });
}

function renderDoughnut(canvasId, labels, values) {
  upsertChart(canvasId, {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: PALETTE.slice(0, labels.length), borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "55%",
               plugins: { legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "circle" } } } },
  });
}

function renderFunnel(containerId, steps) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const max = steps[0]?.value || 1;
  el.innerHTML = steps.map((s, i) => {
    const pct = max ? Math.max((s.value / max) * 100, 2) : 2;
    const rate = i > 0 && steps[i - 1].value
      ? `<span class="funnel-conv">${fmtPct(s.value / steps[i - 1].value)}</span>` : "";
    return `<div class="funnel-step">
      <div class="funnel-label">${s.label}</div>
      <div class="funnel-bar-outer">
        <div class="funnel-bar-inner" style="width:${pct}%"></div>
      </div>
      <div class="funnel-rate">${fmtNum(s.value)} ${rate}</div>
    </div>`;
  }).join("");
}

function renderInsights(containerId, insights) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!insights.length) {
    el.innerHTML = `<div class="empty-state">Nenhum insight para este período (aba INSIGHTS da planilha).</div>`;
    return;
  }
  el.innerHTML = insights.map((i) =>
    `<div class="insight-card ${i["Categoria"] || i["CATEGORIA"] || ""}">
      <h4>${i["Título"] || i["TÍTULO"] || ""}</h4>
      <p>${i["Texto"] || i["TEXTO"] || ""}</p>
    </div>`
  ).join("");
}

/* ---------------- Tabs ---------------- */
function setupTabs() {
  const buttons = document.querySelectorAll("#tabs button");
  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
      window.dispatchEvent(new Event("resize"));
    });
  });

  document.querySelectorAll(".detail-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById(btn.dataset.target).classList.toggle("open");
    });
  });

  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login.html";
  });
}

/* ---------------- Aba: Dados Gerais ---------------- */
function renderGeral() {
  const metaRows    = applyDateFilter(DATA.metaCampanhas);
  const googleRows  = applyDateFilter(DATA.googleCampanhas);
  const marketRows  = applyDateFilter(DATA.marketplace);
  const orgRows     = applyDateFilter(DATA.organico);
  const orgSeries   = computeOrganicoSeries(orgRows, metaRows, googleRows);

  const k = consolidatedKpis([...metaRows, ...googleRows]);
  const orgCompras  = orgSeries.reduce((a, s) => a + s.compras, 0);
  const orgReceita  = orgSeries.reduce((a, s) => a + s.receita, 0);
  const orgSessoes  = orgSeries.reduce((a, s) => a + s.sessoes, 0);
  const mkPedidos   = sumBy(marketRows, "PEDIDOS");
  const mkReceita   = sumBy(marketRows, "RECEITA");
  const comprasTot  = k.compras + orgCompras + mkPedidos;
  const receitaTot  = k.receita + orgReceita + mkReceita;

  renderKpiBar("kpi-geral", [
    { label: "Investimento Total (pago)", value: fmtBRL(k.investimento) },
    { label: "Compras — Todos os Canais", value: fmtNum(comprasTot) },
    { label: "Receita — Todos os Canais", value: fmtBRL(receitaTot) },
    { label: "Sessões Orgânico",          value: fmtNum(orgSessoes) },
    { label: "Tx. Conv. Orgânico",        value: fmtPct(orgSessoes ? orgCompras / orgSessoes : 0) },
    { label: "Pedidos Marketplace",       value: fmtNum(mkPedidos) },
  ]);

  renderDoughnut("chart-geral-canal",
    ["Meta Ads", "Google Ads"],
    [sumBy(metaRows, "INVESTIMENTO"), sumBy(googleRows, "INVESTIMENTO")]);
  renderDoughnut("chart-geral-compras",
    ["Meta Ads", "Google Ads", "Orgânico", "Marketplace"],
    [sumBy(metaRows, "COMPRAS"), sumBy(googleRows, "COMPRAS"), orgCompras, mkPedidos]);

  const metaD   = dailySeries(metaRows,   ["INVESTIMENTO", "COMPRAS"]);
  const googleD = dailySeries(googleRows, ["INVESTIMENTO", "COMPRAS"]);
  const mkD     = dailySeries(marketRows, ["PEDIDOS"]);
  const dateKeys = [...new Set([...metaD, ...googleD, ...orgSeries, ...mkD].map((d) => isoDate(d.date)))].sort();
  const combined = dateKeys.map((key) => {
    const m  = metaD.find((d) => isoDate(d.date) === key);
    const g  = googleD.find((d) => isoDate(d.date) === key);
    const o  = orgSeries.find((d) => isoDate(d.date) === key);
    const mk = mkD.find((d) => isoDate(d.date) === key);
    return {
      date:        new Date(key),
      INVESTIMENTO: (m?.INVESTIMENTO || 0) + (g?.INVESTIMENTO || 0),
      COMPRAS:      (m?.COMPRAS || 0) + (g?.COMPRAS || 0) + (o?.compras || 0) + (mk?.PEDIDOS || 0),
    };
  });
  renderTrendChart("chart-geral-evolucao", combined);
}

/* ---------------- Aba: Meta Ads ---------------- */
function renderMeta() {
  const camp = applyDateFilter(DATA.metaCampanhas);
  const conj = applyDateFilter(DATA.metaConjuntos);
  const anun = applyDateFilter(DATA.metaAnuncios);
  const k = consolidatedKpis(camp);

  renderKpiBar("kpi-meta", [
    { label: "Investimento",  value: fmtBRL(k.investimento) },
    { label: "Compras",       value: fmtNum(k.compras) },
    { label: "Receita",       value: fmtBRL(k.receita) },
    { label: "ROAS",          value: fmtRatio(k.roas) },
    { label: "CPA",           value: fmtBRL(k.cpa) },
    { label: "CTR",           value: fmtPct(k.ctr) },
  ]);

  renderTrendChart("chart-meta-tendencia", dailySeries(camp, ["INVESTIMENTO", "COMPRAS"]));

  renderFunnel("funnel-meta", [
    { label: "Impressões",  value: sumBy(camp, "IMPRESSÕES") },
    { label: "Cliques",     value: sumBy(camp, "CLIQUES") },
    { label: "Page View",   value: sumBy(camp, "PAGE VIEW") },
    { label: "Compras",     value: sumBy(camp, "COMPRAS") },
  ]);

  renderTable("table-meta-campanhas", [
    { key: "CAMPANHA",      label: "Campanha",     fmt: (v, r) => displayName(r) },
    { key: "IMPRESSÕES",    label: "Impressões",   fmt: fmtNum },
    { key: "CLIQUES",       label: "Cliques",      fmt: fmtNum },
    { key: "PAGE VIEW",     label: "Page View",    fmt: fmtNum },
    { key: "COMPRAS",       label: "Compras",      fmt: fmtNum },
    { key: "CTR",           label: "CTR",          fmt: fmtPct },
    { key: "CONNECT RATE",  label: "Connect Rate", fmt: fmtPct },
    { key: "TAXA DE CONVERSÃO", label: "Tx. Conv.", fmt: fmtPct },
    { key: "ROAS",          label: "ROAS",         fmt: fmtRatio },
    { key: "CPA",           label: "CPA",          fmt: fmtBRL },
    { key: "INVESTIMENTO",  label: "Investimento", fmt: fmtBRL },
  ], camp);

  renderTable("table-meta-conjuntos", [
    { key: "CAMPANHA",          label: "Campanha",     fmt: (v, r) => displayName(r) },
    { key: "CONJUNTO DE ANÚNCIO", label: "Conjunto",   fmt: (v) => v },
    { key: "IMPRESSÕES",        label: "Impressões",   fmt: fmtNum },
    { key: "ALCANCE",           label: "Alcance",      fmt: fmtNum },
    { key: "CLIQUES",           label: "Cliques",      fmt: fmtNum },
    { key: "FREQUÊNCIA",        label: "Frequência",   fmt: fmtRatio },
    { key: "CTR",               label: "CTR",          fmt: fmtPct },
    { key: "CPC",               label: "CPC",          fmt: fmtBRL },
    { key: "INVESTIMENTO",      label: "Investimento", fmt: fmtBRL },
  ], conj);

  renderTable("table-meta-anuncios", [
    { key: "ANÚNCIO",             label: "Anúncio",    fmt: (v, r) => displayName(r, "ANÚNCIO") },
    { key: "IMPRESSÕES",          label: "Impressões", fmt: fmtNum },
    { key: "CLIQUES",             label: "Cliques",    fmt: fmtNum },
    { key: "REPRODUÇÕES DE 3 SEG", label: "3-seg",     fmt: fmtNum },
    { key: "CTR",                 label: "CTR",        fmt: fmtPct },
    { key: "HOOK RATE",           label: "Hook Rate",  fmt: fmtPct },
    { key: "INVESTIMENTO",        label: "Investimento", fmt: fmtBRL },
  ], anun);
}

/* ---------------- Aba: Google Ads ---------------- */
function renderGoogle() {
  const camp = applyDateFilter(DATA.googleCampanhas);
  const grupos = applyDateFilter(DATA.googleGrupos);
  const k = consolidatedKpis(camp);

  renderKpiBar("kpi-google", [
    { label: "Investimento",  value: fmtBRL(k.investimento) },
    { label: "Compras",       value: fmtNum(k.compras) },
    { label: "Receita",       value: fmtBRL(k.receita) },
    { label: "ROAS",          value: fmtRatio(k.roas) },
    { label: "CPA",           value: fmtBRL(k.cpa) },
    { label: "CTR",           value: fmtPct(k.ctr) },
  ]);

  renderTrendChart("chart-google-tendencia", dailySeries(camp, ["INVESTIMENTO", "COMPRAS"]));

  renderFunnel("funnel-google", [
    { label: "Impressões",          value: sumBy(camp, "IMPRESSÕES") },
    { label: "Cliques",             value: sumBy(camp, "CLIQUES") },
    { label: "Page View",           value: sumBy(camp, "PAGE VIEW") },
    { label: "Adições ao Carrinho", value: sumBy(camp, "ADIÇÕES AO CARRINHO") },
    { label: "Checkout Iniciado",   value: sumBy(camp, "CHECKOUT INICIADO") },
    { label: "Compras",             value: sumBy(camp, "COMPRAS") },
  ]);

  renderTable("table-google-campanhas", [
    { key: "CAMPANHA",         label: "Campanha",       fmt: (v, r) => displayName(r) },
    { key: "OBJETIVO",         label: "Tipo",           fmt: (v) => v },
    { key: "IMPRESSÕES",       label: "Impressões",     fmt: fmtNum },
    { key: "CLIQUES",          label: "Cliques",        fmt: fmtNum },
    { key: "PAGE VIEW",        label: "Page View",      fmt: fmtNum },
    { key: "COMPRAS",          label: "Compras",        fmt: fmtNum },
    { key: "CTR",              label: "CTR",            fmt: fmtPct },
    { key: "CONNECT RATE",     label: "Connect Rate",   fmt: fmtPct },
    { key: "TAXA DE CONVERSÃO", label: "Tx. Conv.",     fmt: fmtPct },
    { key: "PARCELA DE IMPRESSÕES", label: "Imp. Share", fmt: fmtPct },
    { key: "ROAS",             label: "ROAS",           fmt: fmtRatio },
    { key: "CPA",              label: "CPA",            fmt: fmtBRL },
    { key: "INVESTIMENTO",     label: "Investimento",   fmt: fmtBRL },
  ], camp);

  renderTable("table-google-grupos", [
    { key: "CAMPANHA",         label: "Campanha",       fmt: (v, r) => displayName(r) },
    { key: "GRUPOS DE ANÚNCIO", label: "Grupo",         fmt: (v) => v },
    { key: "IMPRESSÕES",       label: "Impressões",     fmt: fmtNum },
    { key: "CLIQUES",          label: "Cliques",        fmt: fmtNum },
    { key: "CTR",              label: "CTR",            fmt: fmtPct },
    { key: "CPC",              label: "CPC",            fmt: fmtBRL },
    { key: "INVESTIMENTO",     label: "Investimento",   fmt: fmtBRL },
  ], grupos);
}

/* ---------------- Aba: Marketplace ---------------- */
function renderMarketplace() {
  const rows = applyDateFilter(DATA.marketplace);
  const pedidos = sumBy(rows, "PEDIDOS");
  const receita = sumBy(rows, "RECEITA");

  renderKpiBar("kpi-marketplace", [
    { label: "Pedidos",      value: fmtNum(pedidos) },
    { label: "Receita",      value: fmtBRL(receita) },
    { label: "Ticket Médio", value: fmtBRL(pedidos ? receita / pedidos : 0) },
  ]);

  renderTable("table-marketplace", [
    { key: "DATA",         label: "Data",         fmt: (v) => v },
    { key: "MARKETPLACE",  label: "Marketplace",  fmt: (v) => v },
    { key: "PEDIDOS",      label: "Pedidos",      fmt: fmtNum },
    { key: "RECEITA",      label: "Receita",      fmt: fmtBRL },
    { key: "TICKET MÉDIO", label: "Ticket Médio", fmt: fmtBRL },
  ], rows);
}

/* ---------------- Relatórios (semanal / mensal) ---------------- */
function mondayOf(d) {
  const day = (d.getDay() + 6) % 7;
  const m = new Date(d); m.setDate(d.getDate() - day); return m;
}
function weekLabel(monday) {
  const sun = new Date(monday); sun.setDate(monday.getDate() + 6);
  return `${isoDate(monday)} a ${isoDate(sun)}`;
}
function monthLabel(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function rowsInPeriod(rows, label, type) {
  return rows.filter((r) => {
    const d = parseDateBR(r["DATA"]);
    if (!d) return false;
    return (type === "semanal" ? weekLabel(mondayOf(d)) : monthLabel(d)) === label;
  });
}
function buildPeriodOptions(allRows, type) {
  const labels = new Set();
  allRows.forEach((r) => {
    const d = parseDateBR(r["DATA"]);
    if (d) labels.add(type === "semanal" ? weekLabel(mondayOf(d)) : monthLabel(d));
  });
  return [...labels].sort().reverse();
}

function renderReport(type) {
  const selectId   = type === "semanal" ? "select-semana"    : "select-mes";
  const kpiId      = type === "semanal" ? "kpi-rel-semanal"  : "kpi-rel-mensal";
  const chartId    = type === "semanal" ? "chart-rel-semanal": "chart-rel-mensal";
  const tableId    = type === "semanal" ? "table-rel-semanal": "table-rel-mensal";
  const insightsId = type === "semanal" ? "insights-rel-semanal": "insights-rel-mensal";

  const allRows = [...DATA.metaCampanhas, ...DATA.googleCampanhas];
  const select  = document.getElementById(selectId);
  const options = buildPeriodOptions(allRows, type);

  if (!select.dataset.populated) {
    select.innerHTML = options.length
      ? options.map((o) => `<option value="${o}">${o}</option>`).join("")
      : `<option value="">Sem dados ainda</option>`;
    select.dataset.populated = "1";
    select.onchange = () => renderReport(type);
  }

  const period     = select.value || options[0] || "";
  const periodRows = period ? rowsInPeriod(allRows, period, type) : [];
  const k          = consolidatedKpis(periodRows);

  renderKpiBar(kpiId, [
    { label: "Investimento", value: fmtBRL(k.investimento) },
    { label: "Compras",      value: fmtNum(k.compras) },
    { label: "Receita",      value: fmtBRL(k.receita) },
    { label: "ROAS",         value: fmtRatio(k.roas) },
    { label: "CPA",          value: fmtBRL(k.cpa) },
  ]);

  renderTrendChart(chartId, dailySeries(periodRows, ["INVESTIMENTO", "COMPRAS"]));

  const byCamp = new Map();
  periodRows.forEach((r) => {
    const key = r["CAMPANHA"] || "(sem nome)";
    if (!byCamp.has(key)) byCamp.set(key, { CAMPANHA: key, "NOME DE EXIBIÇÃO NO DASHBOARD": r["NOME DE EXIBIÇÃO NO DASHBOARD"] || "", INVESTIMENTO: 0, COMPRAS: 0, RECEITA: 0 });
    const b = byCamp.get(key);
    b.INVESTIMENTO += parseNum(r["INVESTIMENTO"]);
    b.COMPRAS      += parseNum(r["COMPRAS"]);
    b.RECEITA      += parseNum(r["RECEITA"]);
  });
  renderTable(tableId, [
    { key: "CAMPANHA",     label: "Campanha",     fmt: (v, r) => displayName(r) },
    { key: "COMPRAS",      label: "Compras",      fmt: fmtNum },
    { key: "RECEITA",      label: "Receita",      fmt: fmtBRL },
    { key: "INVESTIMENTO", label: "Investimento", fmt: fmtBRL },
  ], [...byCamp.values()]);

  const insightPeriodField = ["Período", "PERÍODO"].find((f) => DATA.insights[0]?.[f] !== undefined) || "Período";
  const insightTypeField   = ["Tipo",    "TIPO"   ].find((f) => DATA.insights[0]?.[f] !== undefined) || "Tipo";
  const insights = (DATA.insights || []).filter(
    (i) => i[insightTypeField] === type && i[insightPeriodField] === period
  );
  renderInsights(insightsId, insights);
}

function renderAll() {
  renderGeral();
  renderMeta();
  renderGoogle();
  renderMarketplace();
  renderReport("semanal");
  renderReport("mensal");
}

function setupDateFilter() {
  const inputFrom  = document.getElementById("filter-from");
  const inputTo    = document.getElementById("filter-to");
  const btnApply   = document.getElementById("filter-apply");
  const btnClear   = document.getElementById("filter-clear");
  const statusEl   = document.getElementById("filter-status");

  btnApply.addEventListener("click", () => {
    const from = inputFrom.value ? new Date(inputFrom.value + "T00:00:00") : null;
    const to   = inputTo.value   ? new Date(inputTo.value   + "T23:59:59") : null;
    dateFilter = { from, to };
    if (from || to) {
      const f = from ? from.toLocaleDateString("pt-BR") : "início";
      const t = to   ? to.toLocaleDateString("pt-BR")   : "hoje";
      statusEl.textContent = `Filtrando: ${f} — ${t}`;
    } else {
      statusEl.textContent = "";
    }
    renderAll();
  });

  btnClear.addEventListener("click", () => {
    inputFrom.value = "";
    inputTo.value   = "";
    dateFilter = { from: null, to: null };
    statusEl.textContent = "";
    renderAll();
  });
}

/* ---------------- Boot ---------------- */
async function boot() {
  setupTabs();
  setupDateFilter();
  document.getElementById("print-semanal")?.addEventListener("click", () => window.print());
  document.getElementById("print-mensal")?.addEventListener("click",  () => window.print());

  try {
    DATA = await fetchData();
    if (!DATA) return;
  } catch (err) {
    document.querySelector("main").innerHTML =
      `<div class="empty-state">Erro ao carregar dados: ${err.message}</div>`;
    return;
  }

  renderAll();
}

document.addEventListener("DOMContentLoaded", boot);
