/* ============================================================
   CWB Kids — Dashboard de Tráfego
   Busca dados em /api/data (protegido por cookie de sessão) e
   renderiza as 6 abas. Sem framework — DOM + Chart.js puro.
   ============================================================ */

let DATA = null;
const sortState = {}; // { [tableId]: { col, dir } }

/* ---------------- Formatação ---------------- */
const parseNum = (v) => {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const fmtBRL = (v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v) => Math.round(v || 0).toLocaleString("pt-BR");
const fmtPct = (v) => ((v || 0) * 100).toFixed(2).replace(".", ",") + "%";
const fmtRatio = (v) => (v || 0).toFixed(2).replace(".", ",");

function parseDateBR(str) {
  const m = String(str ?? "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

/* ---------------- Carregamento de dados ---------------- */
async function fetchData() {
  const resp = await fetch("/api/data");
  if (resp.status === 401) {
    window.location.href = "/login.html";
    return null;
  }
  if (!resp.ok) {
    throw new Error(`Erro ao carregar dados (${resp.status})`);
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
    const d = parseDateBR(r["Data"]);
    if (!d) return;
    const key = isoDate(d);
    if (!map.has(key)) map.set(key, { date: d, ...Object.fromEntries(fields.map((f) => [f, 0])) });
    const bucket = map.get(key);
    fields.forEach((f) => (bucket[f] += parseNum(r[f])));
  });
  return [...map.values()].sort((a, b) => a.date - b.date);
}

function consolidatedKpis(rows) {
  const impressoes = sumBy(rows, "Impressões");
  const cliques = sumBy(rows, "Cliques");
  const compras = sumBy(rows, "Compras");
  const receita = sumBy(rows, "Receita");
  const investimento = sumBy(rows, "Investimento");
  return {
    impressoes,
    cliques,
    compras,
    receita,
    investimento,
    ctr: cliques ? cliques / impressoes : 0,
    cpc: cliques ? investimento / cliques : 0,
    cpa: compras ? investimento / compras : 0,
    roas: investimento ? receita / investimento : 0,
  };
}

/* ---------------- Render genérico: KPI bar ---------------- */
function renderKpiBar(containerId, items) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = items
    .map(
      (k) => `<div class="kpi">
        <div class="label">${k.label}</div>
        <div class="value">${k.value}</div>
        ${k.delta != null ? `<div class="delta ${k.delta >= 0 ? "up" : "down"}">${k.delta >= 0 ? "▲" : "▼"} ${Math.abs(k.delta * 100).toFixed(1)}% vs. período anterior</div>` : ""}
      </div>`
    )
    .join("");
}

/* ---------------- Render genérico: tabela sortável ---------------- */
function renderTable(tableId, columns, rows) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");

  if (!sortState[tableId]) sortState[tableId] = { col: columns[columns.length - 1].key, dir: "desc" };
  const { col: sortCol, dir: sortDir } = sortState[tableId];

  thead.innerHTML =
    "<tr>" +
    columns.map((c) => `<th data-col="${c.key}" class="${c.key === sortCol ? sortDir : ""}">${c.label}</th>`).join("") +
    "</tr>";

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${columns.length}" class="empty-state">Sem dados ainda — aguardando sincronização.</td></tr>`;
    return;
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortCol], bv = b[sortCol];
    if (typeof av === "string" && typeof bv === "string") {
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return sortDir === "asc" ? av - bv : bv - av;
  });

  tbody.innerHTML = sorted.map((row) => "<tr>" + columns.map((c) => `<td>${c.fmt(row[c.key], row)}</td>`).join("") + "</tr>").join("");

  thead.querySelectorAll("th").forEach((th) => {
    th.onclick = () => {
      const col = th.dataset.col;
      const state = sortState[tableId];
      if (col === state.col) state.dir = state.dir === "asc" ? "desc" : "asc";
      else { state.col = col; state.dir = "desc"; }
      renderTable(tableId, columns, rows);
    };
  });
}

function tableRowsFromSheet(rows, extraCalc) {
  return rows.map((r) => {
    const base = { ...r };
    Object.keys(base).forEach((k) => {
      if (!["ID", "Data", "Campanha", "Conjunto", "Anúncio", "Grupo de Anúncios", "Público", "Objetivo", "Tipo de Campanha", "Marketplace", "Observações"].includes(k)) {
        base[k] = parseNum(base[k]);
      }
    });
    return extraCalc ? extraCalc(base) : base;
  });
}

/* ---------------- Charts ---------------- */
const PALETTE = ["#48b8c9", "#ed4c81", "#f59e0b", "#22c55e", "#a78bfa", "#06b6d4", "#f97316"];
const charts = {}; // cache de instâncias Chart.js por canvas id, p/ destruir antes de re-renderizar

function upsertChart(canvasId, config) {
  const el = document.getElementById(canvasId);
  if (!el) return;
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(el, config);
}

function renderTrendChart(canvasId, series, { investField = "Investimento", convField = "Compras" } = {}) {
  upsertChart(canvasId, {
    type: "line",
    data: {
      labels: series.map((s) => s.date.toLocaleDateString("pt-BR")),
      datasets: [
        { label: "Investimento (R$)", data: series.map((s) => s[investField]), yAxisID: "y", borderColor: PALETTE[0], backgroundColor: PALETTE[0] + "20", fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2 },
        { label: "Compras", data: series.map((s) => s[convField]), yAxisID: "y1", borderColor: PALETTE[1], backgroundColor: "transparent", borderDash: [5, 3], tension: 0.3, pointRadius: 2, borderWidth: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { usePointStyle: true, pointStyle: "circle" } } },
      scales: {
        x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 15 } },
        y: { position: "left", title: { display: true, text: "Investimento (R$)" }, ticks: { callback: (v) => fmtBRL(v) } },
        y1: { position: "right", grid: { drawOnChartArea: false }, title: { display: true, text: "Compras" } },
      },
    },
  });
}

function renderDoughnut(canvasId, labels, values) {
  upsertChart(canvasId, {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: PALETTE.slice(0, labels.length), borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "55%",
      plugins: { legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "circle" } } },
    },
  });
}

function renderFunnel(containerId, steps) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const max = steps[0]?.value || 1;
  el.innerHTML = steps
    .map((s, i) => {
      const pct = max ? (s.value / max) * 100 : 0;
      const rate = i > 0 && steps[i - 1].value ? ` (${fmtPct(s.value / steps[i - 1].value)})` : "";
      return `<div class="funnel-step">
        <div>${s.label}</div>
        <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
        <div class="rate">${fmtNum(s.value)}${rate}</div>
      </div>`;
    })
    .join("");
}

function renderInsights(containerId, insights) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!insights.length) {
    el.innerHTML = `<div class="empty-state">Nenhum insight cadastrado para este período (aba INSIGHTS da planilha).</div>`;
    return;
  }
  el.innerHTML = insights
    .map((i) => `<div class="insight-card ${i["Categoria"] || ""}"><h4>${i["Título"] || ""}</h4><p>${i["Texto"] || ""}</p></div>`)
    .join("");
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
    });
  });

  document.querySelectorAll(".detail-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById(btn.dataset.target).classList.toggle("open");
    });
  });

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login.html";
  });
}

/* ---------------- Render: Dados Gerais ---------------- */
// "Orgânico" não vem de UTM/atribuição — é o resíduo entre o total de pedidos
// pagos da loja (aba NUVEMSHOP, via API Nuvemshop) e o que já está contado em
// Meta+Google no mesmo dia. Sessões dessa aba são digitadas manualmente.
function computeOrganicoSeries(organicoRows, metaRows, googleRows) {
  const metaMap = new Map(dailySeries(metaRows, ["Compras", "Receita"]).map((d) => [isoDate(d.date), d]));
  const googleMap = new Map(dailySeries(googleRows, ["Compras", "Receita"]).map((d) => [isoDate(d.date), d]));
  return organicoRows
    .map((r) => {
      const d = parseDateBR(r["Data"]);
      if (!d) return null;
      const key = isoDate(d);
      const m = metaMap.get(key) || { Compras: 0, Receita: 0 };
      const g = googleMap.get(key) || { Compras: 0, Receita: 0 };
      return {
        date: d,
        compras: Math.max(0, parseNum(r["Pedidos Totais Loja"]) - m.Compras - g.Compras),
        receita: Math.max(0, parseNum(r["Receita Total Loja"]) - m.Receita - g.Receita),
        sessoes: parseNum(r["Sessões"]),
      };
    })
    .filter(Boolean);
}

function renderGeral() {
  const metaRows = tableRowsFromSheet(DATA.metaCampanhas);
  const googleRows = tableRowsFromSheet(DATA.googleCampanhas);
  const marketplaceRows = tableRowsFromSheet(DATA.marketplace);
  const organicoRows = tableRowsFromSheet(DATA.organico);
  const organicoSeries = computeOrganicoSeries(organicoRows, metaRows, googleRows);

  const k = consolidatedKpis([...metaRows, ...googleRows]); // investimento só existe em canais pagos
  const organicoCompras = organicoSeries.reduce((a, s) => a + s.compras, 0);
  const organicoReceita = organicoSeries.reduce((a, s) => a + s.receita, 0);
  const organicoSessoes = organicoSeries.reduce((a, s) => a + s.sessoes, 0);
  const marketplacePedidos = sumBy(marketplaceRows, "Pedidos");
  const marketplaceReceita = sumBy(marketplaceRows, "Receita");

  const comprasTotais = k.compras + organicoCompras + marketplacePedidos;
  const receitaTotal = k.receita + organicoReceita + marketplaceReceita;

  renderKpiBar("kpi-geral", [
    { label: "Investimento Total (pago)", value: fmtBRL(k.investimento) },
    { label: "Compras — Todos os Canais", value: fmtNum(comprasTotais) },
    { label: "Receita — Todos os Canais", value: fmtBRL(receitaTotal) },
    { label: "Sessões Orgânico", value: fmtNum(organicoSessoes) },
    { label: "Tx. Conversão Orgânico", value: fmtPct(organicoSessoes ? organicoCompras / organicoSessoes : 0) },
    { label: "Pedidos Marketplace", value: fmtNum(marketplacePedidos) },
  ]);

  renderDoughnut("chart-geral-canal", ["Meta Ads", "Google Ads"], [sumBy(metaRows, "Investimento"), sumBy(googleRows, "Investimento")]);
  renderDoughnut(
    "chart-geral-compras",
    ["Meta Ads", "Google Ads", "Orgânico", "Marketplace"],
    [sumBy(metaRows, "Compras"), sumBy(googleRows, "Compras"), organicoCompras, marketplacePedidos]
  );

  const metaDaily = dailySeries(metaRows, ["Investimento", "Compras"]);
  const googleDaily = dailySeries(googleRows, ["Investimento", "Compras"]);
  const marketplaceDaily = dailySeries(marketplaceRows, ["Pedidos"]);
  const dateKeys = [...new Set([...metaDaily, ...googleDaily, ...organicoSeries, ...marketplaceDaily].map((d) => isoDate(d.date)))].sort();
  const combined = dateKeys.map((key) => {
    const m = metaDaily.find((d) => isoDate(d.date) === key);
    const g = googleDaily.find((d) => isoDate(d.date) === key);
    const o = organicoSeries.find((d) => isoDate(d.date) === key);
    const mk = marketplaceDaily.find((d) => isoDate(d.date) === key);
    return {
      date: new Date(key),
      Investimento: (m?.Investimento || 0) + (g?.Investimento || 0),
      Compras: (m?.Compras || 0) + (g?.Compras || 0) + (o?.compras || 0) + (mk?.Pedidos || 0),
    };
  });
  renderTrendChart("chart-geral-evolucao", combined);
}

/* ---------------- Render: Meta Ads ---------------- */
function renderMeta() {
  const campanhas = tableRowsFromSheet(DATA.metaCampanhas);
  const conjuntos = tableRowsFromSheet(DATA.metaConjuntos);
  const anuncios = tableRowsFromSheet(DATA.metaAnuncios);
  const k = consolidatedKpis(campanhas);

  renderKpiBar("kpi-meta", [
    { label: "Investimento", value: fmtBRL(k.investimento) },
    { label: "Compras", value: fmtNum(k.compras) },
    { label: "Receita", value: fmtBRL(k.receita) },
    { label: "ROAS", value: fmtRatio(k.roas) },
    { label: "CPA", value: fmtBRL(k.cpa) },
    { label: "CTR", value: fmtPct(k.ctr) },
  ]);

  renderTrendChart("chart-meta-tendencia", dailySeries(campanhas, ["Investimento", "Compras"]));

  renderFunnel("funnel-meta", [
    { label: "Impressões", value: sumBy(campanhas, "Impressões") },
    { label: "Cliques", value: sumBy(campanhas, "Cliques") },
    { label: "Page Views", value: sumBy(campanhas, "Page Views") },
    { label: "Compras", value: sumBy(campanhas, "Compras") },
  ]);

  renderTable("table-meta-campanhas", [
    { key: "Campanha", label: "Campanha", fmt: (v) => v },
    { key: "Impressões", label: "Impressões", fmt: fmtNum },
    { key: "Cliques", label: "Cliques", fmt: fmtNum },
    { key: "Compras", label: "Compras", fmt: fmtNum },
    { key: "CTR", label: "CTR", fmt: fmtPct },
    { key: "CPA", label: "CPA", fmt: fmtBRL },
    { key: "ROAS", label: "ROAS", fmt: fmtRatio },
    { key: "Investimento", label: "Investimento", fmt: fmtBRL },
  ], campanhas);

  renderTable("table-meta-conjuntos", [
    { key: "Campanha", label: "Campanha", fmt: (v) => v },
    { key: "Conjunto", label: "Conjunto", fmt: (v) => v },
    { key: "Impressões", label: "Impressões", fmt: fmtNum },
    { key: "Cliques", label: "Cliques", fmt: fmtNum },
    { key: "Compras", label: "Compras", fmt: fmtNum },
    { key: "CTR", label: "CTR", fmt: fmtPct },
    { key: "CPA", label: "CPA", fmt: fmtBRL },
    { key: "Investimento", label: "Investimento", fmt: fmtBRL },
  ], conjuntos);

  renderTable("table-meta-anuncios", [
    { key: "Anúncio", label: "Anúncio", fmt: (v) => v },
    { key: "Impressões", label: "Impressões", fmt: fmtNum },
    { key: "Cliques", label: "Cliques", fmt: fmtNum },
    { key: "CTR", label: "CTR", fmt: fmtPct },
    { key: "Compras", label: "Compras", fmt: fmtNum },
    { key: "Investimento", label: "Investimento", fmt: fmtBRL },
  ], anuncios);
}

/* ---------------- Render: Google Ads ---------------- */
function renderGoogle() {
  const campanhas = tableRowsFromSheet(DATA.googleCampanhas);
  const grupos = tableRowsFromSheet(DATA.googleGrupos);
  const anuncios = tableRowsFromSheet(DATA.googleAnuncios);
  const k = consolidatedKpis(campanhas);

  renderKpiBar("kpi-google", [
    { label: "Investimento", value: fmtBRL(k.investimento) },
    { label: "Compras", value: fmtNum(k.compras) },
    { label: "Receita", value: fmtBRL(k.receita) },
    { label: "ROAS", value: fmtRatio(k.roas) },
    { label: "CPA", value: fmtBRL(k.cpa) },
    { label: "CTR", value: fmtPct(k.ctr) },
  ]);

  renderTrendChart("chart-google-tendencia", dailySeries(campanhas, ["Investimento", "Compras"]));

  renderTable("table-google-campanhas", [
    { key: "Campanha", label: "Campanha", fmt: (v) => v },
    { key: "Tipo de Campanha", label: "Tipo", fmt: (v) => v },
    { key: "Impressões", label: "Impressões", fmt: fmtNum },
    { key: "Cliques", label: "Cliques", fmt: fmtNum },
    { key: "Compras", label: "Compras", fmt: fmtNum },
    { key: "CTR", label: "CTR", fmt: fmtPct },
    { key: "CPA", label: "CPA", fmt: fmtBRL },
    { key: "ROAS", label: "ROAS", fmt: fmtRatio },
    { key: "Investimento", label: "Investimento", fmt: fmtBRL },
  ], campanhas);

  renderTable("table-google-grupos", [
    { key: "Campanha", label: "Campanha", fmt: (v) => v },
    { key: "Grupo de Anúncios", label: "Grupo", fmt: (v) => v },
    { key: "Impressões", label: "Impressões", fmt: fmtNum },
    { key: "Cliques", label: "Cliques", fmt: fmtNum },
    { key: "Compras", label: "Compras", fmt: fmtNum },
    { key: "Investimento", label: "Investimento", fmt: fmtBRL },
  ], grupos);

  renderTable("table-google-anuncios", [
    { key: "Anúncio", label: "Anúncio", fmt: (v) => v },
    { key: "Impressões", label: "Impressões", fmt: fmtNum },
    { key: "Cliques", label: "Cliques", fmt: fmtNum },
    { key: "Compras", label: "Compras", fmt: fmtNum },
    { key: "Investimento", label: "Investimento", fmt: fmtBRL },
  ], anuncios);
}

/* ---------------- Render: Marketplace ---------------- */
function renderMarketplace() {
  const rows = tableRowsFromSheet(DATA.marketplace);
  const pedidos = sumBy(rows, "Pedidos");
  const receita = sumBy(rows, "Receita");

  renderKpiBar("kpi-marketplace", [
    { label: "Pedidos", value: fmtNum(pedidos) },
    { label: "Receita", value: fmtBRL(receita) },
    { label: "Ticket Médio", value: fmtBRL(pedidos ? receita / pedidos : 0) },
  ]);

  renderTable("table-marketplace", [
    { key: "Data", label: "Data", fmt: (v) => v },
    { key: "Marketplace", label: "Marketplace", fmt: (v) => v },
    { key: "Pedidos", label: "Pedidos", fmt: fmtNum },
    { key: "Receita", label: "Receita", fmt: fmtBRL },
    { key: "Ticket Médio", label: "Ticket Médio", fmt: fmtBRL },
  ], rows);
}

/* ---------------- Render: Relatórios (semanal/mensal) ---------------- */
function mondayOf(d) {
  const day = (d.getDay() + 6) % 7;
  const m = new Date(d);
  m.setDate(d.getDate() - day);
  return m;
}
function weekLabel(monday) {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${isoDate(monday)} a ${isoDate(sunday)}`;
}
function monthLabel(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function buildPeriodOptions(allRows, type) {
  const labels = new Set();
  allRows.forEach((r) => {
    const d = parseDateBR(r["Data"]);
    if (!d) return;
    labels.add(type === "semanal" ? weekLabel(mondayOf(d)) : monthLabel(d));
  });
  return [...labels].sort().reverse();
}

function rowsInPeriod(rows, label, type) {
  return rows.filter((r) => {
    const d = parseDateBR(r["Data"]);
    if (!d) return false;
    return (type === "semanal" ? weekLabel(mondayOf(d)) : monthLabel(d)) === label;
  });
}

function renderReport(type) {
  const selectId = type === "semanal" ? "select-semana" : "select-mes";
  const kpiId = type === "semanal" ? "kpi-rel-semanal" : "kpi-rel-mensal";
  const chartId = type === "semanal" ? "chart-rel-semanal" : "chart-rel-mensal";
  const tableId = type === "semanal" ? "table-rel-semanal" : "table-rel-mensal";
  const insightsId = type === "semanal" ? "insights-rel-semanal" : "insights-rel-mensal";

  const metaRows = tableRowsFromSheet(DATA.metaCampanhas);
  const googleRows = tableRowsFromSheet(DATA.googleCampanhas);
  const allRows = [...metaRows, ...googleRows];

  const select = document.getElementById(selectId);
  const options = buildPeriodOptions(allRows, type);
  if (!select.dataset.populated) {
    select.innerHTML = options.length
      ? options.map((o) => `<option value="${o}">${o}</option>`).join("")
      : `<option value="">Sem dados ainda</option>`;
    select.dataset.populated = "1";
    select.onchange = () => renderReport(type);
  }

  const period = select.value || options[0] || "";
  const periodRows = period ? rowsInPeriod(allRows, period, type) : [];
  const k = consolidatedKpis(periodRows);

  renderKpiBar(kpiId, [
    { label: "Investimento", value: fmtBRL(k.investimento) },
    { label: "Compras", value: fmtNum(k.compras) },
    { label: "Receita", value: fmtBRL(k.receita) },
    { label: "ROAS", value: fmtRatio(k.roas) },
    { label: "CPA", value: fmtBRL(k.cpa) },
  ]);

  renderTrendChart(chartId, dailySeries(periodRows, ["Investimento", "Compras"]));

  const byCampanha = new Map();
  periodRows.forEach((r) => {
    const key = r["Campanha"] || "(sem nome)";
    if (!byCampanha.has(key)) byCampanha.set(key, { Campanha: key, Investimento: 0, Compras: 0, Receita: 0 });
    const b = byCampanha.get(key);
    b.Investimento += parseNum(r["Investimento"]);
    b.Compras += parseNum(r["Compras"]);
    b.Receita += parseNum(r["Receita"]);
  });
  renderTable(tableId, [
    { key: "Campanha", label: "Campanha", fmt: (v) => v },
    { key: "Compras", label: "Compras", fmt: fmtNum },
    { key: "Receita", label: "Receita", fmt: fmtBRL },
    { key: "Investimento", label: "Investimento", fmt: fmtBRL },
  ], [...byCampanha.values()]);

  const insights = (DATA.insights || []).filter((i) => i["Tipo"] === type && i["Período"] === period);
  renderInsights(insightsId, insights);
}

/* ---------------- Boot ---------------- */
async function boot() {
  setupTabs();
  document.getElementById("print-semanal")?.addEventListener("click", () => window.print());
  document.getElementById("print-mensal")?.addEventListener("click", () => window.print());

  try {
    DATA = await fetchData();
    if (!DATA) return; // redirecionado para login
  } catch (err) {
    document.querySelector("main").innerHTML = `<div class="empty-state">Erro ao carregar dados: ${err.message}</div>`;
    return;
  }

  renderGeral();
  renderMeta();
  renderGoogle();
  renderMarketplace();
  renderReport("semanal");
  renderReport("mensal");
}

document.addEventListener("DOMContentLoaded", boot);
