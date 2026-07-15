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
    if (!d) return true; // linha sem data legível sempre passa
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
  // Serial numérico do Google Sheets (SERIAL_NUMBER): dias desde 30/12/1899
  // Serial 25569 = 01/01/1970 (época Unix)
  const num = typeof str === "number" ? str : Number(str);
  if (Number.isFinite(num) && num > 1000) {
    const d = new Date((num - 25569) * 86400000);
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = String(str ?? "").trim();
  // DD/MM/YYYY ou D/M/YYYY
  let m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  // YYYY-MM-DD
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
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
  el.innerHTML = items.map((k) => {
    let deltaHtml = "";
    if (k.delta != null) {
      const isUp   = k.delta >= 0;
      const isGood = k.lowGood ? !isUp : isUp;
      deltaHtml = `<div class="delta ${isGood ? "up" : "down"}">${isUp ? "↑" : "↓"} ${Math.abs(k.delta * 100).toFixed(1)}%</div>`;
    }
    const iconStyle = k.iconBg ? `style="background:${k.iconBg}"` : "";
    const iconHtml  = k.icon ? `<div class="kpi-icon" ${iconStyle}>${k.icon}</div>` : "";
    return `<div class="kpi">
      ${iconHtml}
      <div class="label">${k.label}</div>
      <div class="value">${k.value}</div>
      ${deltaHtml}
    </div>`;
  }).join("");
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

function renderTrendChart(canvasId, series, investField = "INVESTIMENTO", receitaField = "RECEITA", opts = {}) {
  const label1   = opts.label1   || "Investimento (R$)";
  const label2   = opts.label2   || "Receita (R$)";
  const color1   = opts.color1   || "#e53e3e";
  const fmtTick1 = opts.fmtTick1 || fmtBRL;
  wrapCanvas(canvasId, 260);
  upsertChart(canvasId, {
    type: "line",
    data: {
      labels: series.map((s) => s.date.toLocaleDateString("pt-BR")),
      datasets: [
        { label: label1, data: series.map((s) => parseNum(s[investField])),
          yAxisID: "y", borderColor: color1, backgroundColor: color1 + "20",
          fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2 },
        { label: label2, data: series.map((s) => parseNum(s[receitaField]) || s.receita || 0),
          yAxisID: "y1", borderColor: "#22c55e", backgroundColor: "transparent",
          borderDash: [5, 3], tension: 0.3, pointRadius: 2, borderWidth: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { usePointStyle: true, pointStyle: "circle" } } },
      scales: {
        x: { ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 15 } },
        y:  { position: "left",  title: { display: true, text: label1 },
               ticks: { callback: (v) => fmtTick1(v) } },
        y1: { position: "right", grid: { drawOnChartArea: false },
               title: { display: true, text: label2 },
               ticks: { callback: (v) => fmtBRL(v) } },
      },
    },
  });
}

function renderDoughnut(canvasId, labels, values, colors) {
  upsertChart(canvasId, {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: colors || PALETTE.slice(0, labels.length), borderWidth: 0 }] },
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
const TAB_LABELS = {
  geral:        "Visão Geral",
  meta:         "Meta Ads",
  google:       "Google Ads",
  marketplace:  "Marketplace",
  "rel-semanal": "Relatório Semanal",
  "rel-mensal":  "Relatório Mensal",
};

function setupTabs() {
  const buttons     = document.querySelectorAll("#tabs button");
  const topbarTitle = document.getElementById("topbar-title");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
      if (topbarTitle) topbarTitle.textContent = TAB_LABELS[btn.dataset.tab] || "";
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

/* ---------------- Tabela comparativa por canal ---------------- */
function renderCanalTable({ meta, google, organico, marketplace }, containerId = "canal-table-wrap") {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  const safe       = (a, b) => (b ? a / b : 0);
  const ticketFmt  = (rec, ped) => (ped ? fmtBRL(rec / ped) : "—");
  const roasFmt    = (rec, inv) => (inv ? safe(rec, inv).toFixed(2) + "×" : "—");
  const cpaFmt     = (inv, ped) => (ped ? fmtBRL(inv / ped) : "—");

  const channels = [
    { name: "Meta Ads",    paid: true,  ...meta },
    { name: "Google Ads",  paid: true,  ...google },
    { name: "Orgânico",   paid: false, ...organico },
    { name: "Marketplace", paid: false, ...marketplace },
  ];

  const totalInvest  = meta.invest  + google.invest;
  const totalReceita = meta.receita + google.receita + organico.receita + marketplace.receita;
  const totalPedidos = meta.pedidos + google.pedidos + organico.pedidos + marketplace.pedidos;

  const pct = (v) => (totalReceita ? fmtPct(v / totalReceita) : "—");

  const thead = `<thead><tr>
    <th>Canal</th><th>Investimento</th><th>Receita</th>
    <th>Pedidos</th><th>Ticket Médio</th><th>ROAS</th><th>CPA</th><th>% Receita</th>
  </tr></thead>`;

  const bodyRows = channels.map((c) => `<tr>
    <td>${c.name}</td>
    <td>${c.invest !== null ? fmtBRL(c.invest) : "—"}</td>
    <td>${fmtBRL(c.receita)}</td>
    <td>${fmtNum(c.pedidos)}</td>
    <td>${ticketFmt(c.receita, c.pedidos)}</td>
    <td>${c.paid ? roasFmt(c.receita, c.invest) : "—"}</td>
    <td>${c.paid ? cpaFmt(c.invest, c.pedidos) : "—"}</td>
    <td>${pct(c.receita)}</td>
  </tr>`).join("");

  const tfoot = `<tfoot><tr>
    <td><strong>Total</strong></td>
    <td><strong>${fmtBRL(totalInvest)}</strong></td>
    <td><strong>${fmtBRL(totalReceita)}</strong></td>
    <td><strong>${fmtNum(totalPedidos)}</strong></td>
    <td><strong>${ticketFmt(totalReceita, totalPedidos)}</strong></td>
    <td><strong>${roasFmt(meta.receita + google.receita, totalInvest)}</strong></td>
    <td><strong>${cpaFmt(totalInvest, totalPedidos)}</strong></td>
    <td><strong>100%</strong></td>
  </tr></tfoot>`;

  wrap.innerHTML = `<table>${thead}<tbody>${bodyRows}</tbody>${tfoot}</table>`;
}

/* ---------------- Aba: Dados Gerais ---------------- */
function renderGeral() {
  const metaRows    = applyDateFilter(DATA.metaCampanhas);
  const googleRows  = applyDateFilter(DATA.googleCampanhas);
  const marketRows  = applyDateFilter(DATA.marketplace);
  // Normaliza colunas da aba NUVEMSHOP (preenchida manualmente — cabeçalhos em Title Case)
  const orgNorm     = DATA.organico.map((r) => ({
    DATA:                     r["DATA"]                ?? r["Data"]                ?? "",
    "PEDIDOS TOTAIS DA LOJA": r["Pedidos Totais Loja"] ?? r["PEDIDOS TOTAIS DA LOJA"] ?? "",
    "RECEITA TOTAL DA LOJA":  r["Receita Total Loja"]  ?? r["RECEITA TOTAL DA LOJA"]  ?? "",
    SESSÕES:                  r["Sessões"]              ?? r["SESSÕES"]              ?? "",
  }));
  const orgRows     = applyDateFilter(orgNorm);
  const orgSeries   = computeOrganicoSeries(orgRows, metaRows, googleRows);

  const k = consolidatedKpis([...metaRows, ...googleRows]);
  const orgCompras  = orgSeries.reduce((a, s) => a + s.compras, 0);
  const orgReceita  = orgSeries.reduce((a, s) => a + s.receita, 0);
  const orgSessoes  = orgSeries.reduce((a, s) => a + s.sessoes, 0);
  const mkPedidos   = sumBy(marketRows, "PEDIDOS");
  const mkReceita   = sumBy(marketRows, "RECEITA");
  // Usa Nuvemshop como fonte verdade para totais: evita que pedidos cancelados
  // registrados em plataformas de anúncio (mas removidos da loja) inflam os KPIs.
  const nvCompras   = sumBy(orgRows, "PEDIDOS TOTAIS DA LOJA");
  const nvReceita   = sumBy(orgRows, "RECEITA TOTAL DA LOJA");
  const comprasTot  = nvCompras + mkPedidos;
  const receitaTot  = nvReceita + mkReceita;
  const paidReceita = k.receita;
  const ticketMedio = comprasTot ? receitaTot / comprasTot : 0;

  renderKpiBar("kpi-geral", [
    { label: "Investimento (pago)",       value: fmtBRL(k.investimento),                                          icon: "💰", iconBg: "#fff8e1" },
    { label: "Compras — Todos os Canais", value: fmtNum(comprasTot),                                              icon: "🛍️", iconBg: "#e8f5e9" },
    { label: "ROAS (pago)",               value: k.investimento ? (paidReceita / k.investimento).toFixed(2) + "×" : "—", icon: "⚡", iconBg: "#e3f6f9" },
    { label: "CPA (pago)",                value: comprasTot ? fmtBRL(k.investimento / comprasTot) : "—",          icon: "🎯", iconBg: "#fce4ec" },
    { label: "Ticket Médio Geral",        value: comprasTot ? fmtBRL(ticketMedio) : "—",                          icon: "🏷️", iconBg: "#f3e5f5" },
    { label: "Taxa de Conversão da Loja", value: fmtPct(orgSessoes ? nvCompras / orgSessoes : 0),                 icon: "📊", iconBg: "#e8eaf6" },
  ]);

  renderCanalTable({
    meta:        { invest: sumBy(metaRows,   "INVESTIMENTO"), receita: sumBy(metaRows,   "RECEITA"), pedidos: sumBy(metaRows,   "COMPRAS") },
    google:      { invest: sumBy(googleRows, "INVESTIMENTO"), receita: sumBy(googleRows, "RECEITA"), pedidos: sumBy(googleRows, "COMPRAS") },
    organico:    { invest: null,                               receita: orgReceita,                   pedidos: orgCompras },
    marketplace: { invest: null,                               receita: mkReceita,                    pedidos: mkPedidos },
  });

  renderDoughnut("chart-geral-canal",
    ["Meta Ads", "Google Ads"],
    [sumBy(metaRows, "INVESTIMENTO"), sumBy(googleRows, "INVESTIMENTO")],
    ["#0575f1", "#f6bf1d"]);
  renderDoughnut("chart-geral-compras",
    ["Meta Ads", "Google Ads", "Orgânico", "Marketplace"],
    [sumBy(metaRows, "COMPRAS"), sumBy(googleRows, "COMPRAS"), orgCompras, mkPedidos],
    ["#0575f1", "#f6bf1d", "#22c55e", "#ff6300"]);

  // Vendas por campanha (Meta + Google)
  const vcMap = new Map();
  [...metaRows, ...googleRows].forEach((r) => {
    const name = displayName(r);
    if (!name) return;
    vcMap.set(name, (vcMap.get(name) || 0) + parseNum(r["COMPRAS"]));
  });
  const vcSorted = [...vcMap.entries()].sort((a, b) => b[1] - a[1]);
  wrapCanvas("chart-geral-vendas-camp", 260);
  upsertChart("chart-geral-vendas-camp", {
    type: "bar",
    data: {
      labels: vcSorted.map(([name]) => name),
      datasets: [{ label: "Compras", data: vcSorted.map(([, v]) => v),
        backgroundColor: PALETTE.slice(0, vcSorted.length), borderWidth: 0, borderRadius: 4 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        datalabels: { anchor: "end", align: "top", formatter: (v) => fmtNum(v), font: { size: 11 } } },
      scales: {
        x: { ticks: { maxRotation: 25 } },
        y: { ticks: { callback: (v) => fmtNum(v) } },
      },
    },
  });

  const metaD   = dailySeries(metaRows,   ["INVESTIMENTO", "RECEITA"]);
  const googleD = dailySeries(googleRows, ["INVESTIMENTO", "RECEITA"]);
  const mkD     = dailySeries(marketRows, ["RECEITA"]);
  const dateKeys = [...new Set([...metaD, ...googleD, ...orgSeries, ...mkD].map((d) => isoDate(d.date)))].sort();
  const combined = dateKeys.map((key) => {
    const m  = metaD.find((d) => isoDate(d.date) === key);
    const g  = googleD.find((d) => isoDate(d.date) === key);
    const o  = orgSeries.find((d) => isoDate(d.date) === key);
    const mk = mkD.find((d) => isoDate(d.date) === key);
    return {
      date:        new Date(key),
      INVESTIMENTO: (m?.INVESTIMENTO || 0) + (g?.INVESTIMENTO || 0),
      RECEITA:      (m?.RECEITA || 0) + (g?.RECEITA || 0) + (o?.receita || 0) + (mk?.RECEITA || 0),
    };
  });
  renderTrendChart("chart-geral-evolucao", combined);
}

/* ---------------- Top 3 criativos por CTR ---------------- */
function renderTopCreativos(containerId, anunRows) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const map = new Map();
  anunRows.forEach((r) => {
    const name = r["ANÚNCIO"] || "";
    if (!name) return;
    if (!map.has(name)) map.set(name, { name, imp: 0, cli: 0, plays: 0, invest: 0 });
    const b = map.get(name);
    b.imp    += parseNum(r["IMPRESSÕES"]);
    b.cli    += parseNum(r["CLIQUES"]);
    b.plays  += parseNum(r["REPRODUÇÕES DE 3 SEG"]);
    b.invest += parseNum(r["INVESTIMENTO"]);
  });

  const list = [...map.values()]
    .filter((c) => c.imp >= 10)
    .map((c) => ({ ...c, ctr: c.cli / c.imp, hookRate: c.plays / c.imp }))
    .sort((a, b) => b.ctr - a.ctr)
    .slice(0, 3);

  if (!list.length) {
    el.innerHTML = `<p class="empty-state">Sem dados de anúncios no período.</p>`;
    return;
  }

  const ranks = ["1º lugar", "2º lugar", "3º lugar"];
  el.innerHTML = list.map((c, i) => `
    <div class="criativo-card">
      <div class="criativo-rank">${ranks[i]}</div>
      <div class="criativo-name">${c.name}</div>
      <div class="criativo-ctr">${fmtPct(c.ctr)}</div>
      <div class="criativo-ctr-label">CTR</div>
      <div class="criativo-metrics">
        <div class="criativo-metric"><span class="m-label">Impressões</span><span class="m-value">${fmtNum(c.imp)}</span></div>
        <div class="criativo-metric"><span class="m-label">Cliques</span><span class="m-value">${fmtNum(c.cli)}</span></div>
        <div class="criativo-metric"><span class="m-label">Hook Rate</span><span class="m-value">${fmtPct(c.hookRate)}</span></div>
        <div class="criativo-metric"><span class="m-label">Investimento</span><span class="m-value">${fmtBRL(c.invest)}</span></div>
      </div>
    </div>
  `).join("");
}

/* ---------------- Aba: Meta Ads ---------------- */
function renderMeta() {
  const camp = applyDateFilter(DATA.metaCampanhas);
  const conj = applyDateFilter(DATA.metaConjuntos);
  const anun = applyDateFilter(DATA.metaAnuncios);
  const k = consolidatedKpis(camp);

  const pvTot  = sumBy(camp, "PAGE VIEW");
  const txConv = pvTot ? k.compras / pvTot : 0;
  const cpm    = k.impressoes ? (k.investimento / k.impressoes) * 1000 : 0;
  const ticket = k.compras ? k.receita / k.compras : 0;

  renderKpiBar("kpi-meta", [
    { label: "Investimento",  value: fmtBRL(k.investimento), icon: "💰", iconBg: "#fff8e1" },
    { label: "Compras",       value: fmtNum(k.compras),      icon: "🛍️", iconBg: "#e8f5e9" },
    { label: "Receita",       value: fmtBRL(k.receita),      icon: "📈", iconBg: "#e8f5e9" },
    { label: "ROAS",          value: fmtRatio(k.roas),       icon: "⚡", iconBg: "#e3f6f9" },
    { label: "CPA",           value: fmtBRL(k.cpa),          icon: "🎯", iconBg: "#fce4ec" },
    { label: "CTR",           value: fmtPct(k.ctr),          icon: "👆", iconBg: "#e3f2fd" },
    { label: "Tx. Conversão", value: fmtPct(txConv),         icon: "📊", iconBg: "#e8eaf6" },
    { label: "Ticket Médio",  value: ticket ? fmtBRL(ticket) : "—", icon: "🏷️", iconBg: "#f3e5f5" },
  ]);

  // Investimento por campanha
  const campInvestMap = new Map();
  camp.forEach((r) => {
    const name = displayName(r);
    campInvestMap.set(name, (campInvestMap.get(name) || 0) + parseNum(r["INVESTIMENTO"]));
  });
  renderDoughnut("chart-meta-invest-camp",
    [...campInvestMap.keys()],
    [...campInvestMap.values()]);

  renderTopCreativos("top-criativos-meta", anun);

  renderTrendChart("chart-meta-tendencia", dailySeries(camp, ["INVESTIMENTO", "RECEITA"]));

  renderFunnel("funnel-meta", [
    { label: "Impressões",        value: sumBy(camp, "IMPRESSÕES") },
    { label: "Cliques",           value: sumBy(camp, "CLIQUES") },
    { label: "Page View",         value: sumBy(camp, "PAGE VIEW") },
    { label: "Add to Cart",       value: sumBy(camp, "ADD TO CART") },
    { label: "Initiate Checkout", value: sumBy(camp, "INITIATE CHECKOUT") },
    { label: "Compras",           value: sumBy(camp, "COMPRAS") },
  ]);

  renderTable("table-meta-campanhas", [
    { key: "CAMPANHA",      label: "Campanha",     fmt: (v, r) => displayName(r) },
    { key: "IMPRESSÕES",    label: "Impressões",   fmt: fmtNum },
    { key: "CLIQUES",            label: "Cliques",           fmt: fmtNum },
    { key: "PAGE VIEW",          label: "Page View",         fmt: fmtNum },
    { key: "ADD TO CART",        label: "Add to Cart",       fmt: fmtNum },
    { key: "INITIATE CHECKOUT",  label: "Init. Checkout",    fmt: fmtNum },
    { key: "COMPRAS",            label: "Compras",           fmt: fmtNum },
    { key: "CTR",                label: "CTR",               fmt: fmtPct },
    { key: "CONNECT RATE",       label: "Connect Rate",      fmt: fmtPct },
    { key: "TAXA DE CONVERSÃO",  label: "Tx. Conv.",         fmt: fmtPct },
    { key: "ROAS",               label: "ROAS",              fmt: fmtRatio },
    { key: "CPA",                label: "CPA",               fmt: fmtBRL },
    { key: "INVESTIMENTO",       label: "Investimento",      fmt: fmtBRL },
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

  const pvTot  = sumBy(camp, "PAGE VIEW");
  const txConv = pvTot ? k.compras / pvTot : 0;
  const ticket = k.compras ? k.receita / k.compras : 0;

  renderKpiBar("kpi-google", [
    { label: "Investimento",  value: fmtBRL(k.investimento),        icon: "💰", iconBg: "#fff8e1" },
    { label: "Compras",       value: fmtNum(k.compras),             icon: "🛍️", iconBg: "#e8f5e9" },
    { label: "Receita",       value: fmtBRL(k.receita),             icon: "📈", iconBg: "#e8f5e9" },
    { label: "ROAS",          value: fmtRatio(k.roas),              icon: "⚡", iconBg: "#e3f6f9" },
    { label: "CPA",           value: fmtBRL(k.cpa),                 icon: "🎯", iconBg: "#fce4ec" },
    { label: "CTR",           value: fmtPct(k.ctr),                 icon: "👆", iconBg: "#e3f2fd" },
    { label: "Tx. Conversão", value: fmtPct(txConv),                icon: "📊", iconBg: "#e8eaf6" },
    { label: "Ticket Médio",  value: ticket ? fmtBRL(ticket) : "—", icon: "🏷️", iconBg: "#f3e5f5" },
  ]);

  // Investimento por campanha
  const gInvestMap = new Map();
  camp.forEach((r) => {
    const name = displayName(r);
    gInvestMap.set(name, (gInvestMap.get(name) || 0) + parseNum(r["INVESTIMENTO"]));
  });
  renderDoughnut("chart-google-invest-camp",
    [...gInvestMap.keys()],
    [...gInvestMap.values()],
    ["#f6bf1d", "#48b8c9", "#ed4c81", "#22c55e"]);

  // Parcela de impressões (média ponderada por impressões)
  const isRows = camp.filter((r) => parseNum(r["PARCELA DE IMPRESSÕES"]) > 0);
  const totalImpIS = isRows.reduce((a, r) => a + parseNum(r["IMPRESSÕES"]), 0);
  const wAvg = (field) => totalImpIS
    ? isRows.reduce((a, r) => a + parseNum(r["IMPRESSÕES"]) * parseNum(r[field]), 0) / totalImpIS
    : 0;
  const wIS  = wAvg("PARCELA DE IMPRESSÕES");
  const wISB = wAvg("PARC IMP PERDIDA POR ORÇAMENTO");
  const wISR = wAvg("PARC IMP PERDIDA POR CLASSIFICAÇÃO");
  const wISO = Math.max(0, 1 - wIS - wISB - wISR);
  wrapCanvas("chart-google-impshare", 240);
  renderDoughnut("chart-google-impshare",
    ["Impressões Recebidas", "Perdido por Orçamento", "Perdido por Classificação", "Outros"],
    [wIS, wISB, wISR, wISO],
    ["#48b8c9", "#f59e0b", "#e53e3e", "#d1d5db"]);

  renderTrendChart("chart-google-tendencia", dailySeries(camp, ["INVESTIMENTO", "RECEITA"]));

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
    { key: "CLIQUES",               label: "Cliques",        fmt: fmtNum },
    { key: "PAGE VIEW",             label: "Page View",      fmt: fmtNum },
    { key: "ADIÇÕES AO CARRINHO",   label: "Add to Cart",    fmt: fmtNum },
    { key: "CHECKOUT INICIADO",     label: "Init. Checkout", fmt: fmtNum },
    { key: "COMPRAS",               label: "Compras",        fmt: fmtNum },
    { key: "CTR",                   label: "CTR",            fmt: fmtPct },
    { key: "CONNECT RATE",          label: "Connect Rate",   fmt: fmtPct },
    { key: "TAXA DE CONVERSÃO",     label: "Tx. Conv.",      fmt: fmtPct },
    { key: "PARCELA DE IMPRESSÕES", label: "Imp. Share",     fmt: fmtPct },
    { key: "ROAS",                  label: "ROAS",           fmt: fmtRatio },
    { key: "CPA",                   label: "CPA",            fmt: fmtBRL },
    { key: "INVESTIMENTO",          label: "Investimento",   fmt: fmtBRL },
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

  // Top 10 termos de busca por cliques
  const termosRows = applyDateFilter(DATA.googleTermos || []);
  const termoMap = new Map();
  termosRows.forEach((r) => {
    const t = r["TERMO"] || "";
    if (!t) return;
    if (!termoMap.has(t)) termoMap.set(t, { TERMO: t, imp: 0, cli: 0 });
    termoMap.get(t).imp += parseNum(r["IMPRESSÕES"]);
    termoMap.get(t).cli += parseNum(r["CLIQUES"]);
  });
  const topTermos = [...termoMap.values()]
    .sort((a, b) => b.cli - a.cli)
    .slice(0, 10)
    .map((t) => ({ ...t, CTR: t.imp ? t.cli / t.imp : 0 }));
  renderTable("table-google-termos", [
    { key: "TERMO", label: "Termo de Busca", fmt: (v) => v },
    { key: "imp",   label: "Impressões",     fmt: fmtNum },
    { key: "CTR",   label: "CTR",            fmt: fmtPct },
    { key: "cli",   label: "Cliques",        fmt: fmtNum },
  ], topTermos);
}

/* ---------------- Aba: Marketplace ---------------- */
function renderMarketplace() {
  const rows = applyDateFilter(DATA.marketplace);
  const pedidos = sumBy(rows, "PEDIDOS");
  const receita = sumBy(rows, "RECEITA");

  const ticketMedio = pedidos > 0 ? receita / pedidos : 0;

  renderKpiBar("kpi-marketplace", [
    { label: "Pedidos",      value: fmtNum(pedidos),      icon: "📦", iconBg: "#fff3e0" },
    { label: "Receita",      value: fmtBRL(receita),      icon: "📈", iconBg: "#e8f5e9" },
    { label: "Ticket Médio", value: fmtBRL(ticketMedio),  icon: "🏷️", iconBg: "#f3e5f5" },
  ]);

  renderTrendChart(
    "chart-marketplace-evolucao",
    dailySeries(rows, ["PEDIDOS", "RECEITA"]),
    "PEDIDOS", "RECEITA",
    { label1: "Pedidos", color1: "#ff6300", fmtTick1: fmtNum }
  );

  // Agrega pedidos e receita por marketplace
  const MK_COLORS = { "Mercado Livre": "#f6bf1d", "Amazon": "#146eb4", "Shopee": "#ee4d2d" };
  const byChannel = new Map();
  rows.forEach((r) => {
    const name = String(r["MARKETPLACE"] || "").trim();
    if (!name) return;
    if (!byChannel.has(name)) byChannel.set(name, { pedidos: 0, receita: 0 });
    byChannel.get(name).pedidos += parseNum(r["PEDIDOS"]);
    byChannel.get(name).receita += parseNum(r["RECEITA"]);
  });
  const mkLabels  = [...byChannel.keys()];
  const mkColors  = mkLabels.map((n) => MK_COLORS[n] || "#aaa");
  renderDoughnut("chart-marketplace-pedidos", mkLabels, mkLabels.map((n) => byChannel.get(n).pedidos), mkColors);
  renderDoughnut("chart-marketplace-receita",  mkLabels, mkLabels.map((n) => byChannel.get(n).receita),  mkColors);

  renderTable("table-marketplace", [
    { key: "DATA",        label: "Data",         fmt: (v) => { const d = parseDateBR(v); return d ? d.toLocaleDateString("pt-BR") : v; } },
    { key: "MARKETPLACE", label: "Marketplace",  fmt: (v) => v },
    { key: "PEDIDOS",     label: "Pedidos",      fmt: fmtNum },
    { key: "RECEITA",     label: "Receita",      fmt: fmtBRL },
    { key: "_ticket",     label: "Ticket Médio", fmt: (_, r) => {
        const p = parseNum(r["PEDIDOS"]);
        return p > 0 ? fmtBRL(parseNum(r["RECEITA"]) / p) : "—";
      }
    },
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

function prevPeriodLabel(label, type) {
  if (type === "semanal") {
    const start = new Date(label.split(" a ")[0]);
    start.setDate(start.getDate() - 7);
    return weekLabel(start);
  } else {
    const [y, m] = label.split("-").map(Number);
    const d = new Date(y, m - 2, 1);
    return monthLabel(d);
  }
}

function renderReport(type) {
  const s          = type === "semanal" ? "semanal" : "mensal";
  const selectId   = type === "semanal" ? "select-semana" : "select-mes";

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

  const period = select.value || options[0] || "";
  const filter = (rows) => period ? rowsInPeriod(rows, period, type) : [];

  const metaCamp   = filter(DATA.metaCampanhas);
  const metaConj   = filter(DATA.metaConjuntos);
  const metaAnun   = filter(DATA.metaAnuncios);
  const googleCamp = filter(DATA.googleCampanhas);
  const marketRows = filter(DATA.marketplace);
  const orgNorm    = DATA.organico.map((r) => ({
    DATA:                     r["DATA"]                ?? r["Data"]                ?? "",
    "PEDIDOS TOTAIS DA LOJA": r["Pedidos Totais Loja"] ?? r["PEDIDOS TOTAIS DA LOJA"] ?? "",
    "RECEITA TOTAL DA LOJA":  r["Receita Total Loja"]  ?? r["RECEITA TOTAL DA LOJA"]  ?? "",
    SESSÕES:                  r["Sessões"]              ?? r["SESSÕES"]              ?? "",
  }));
  const orgRows    = filter(orgNorm);
  const orgSeries  = computeOrganicoSeries(orgRows, metaCamp, googleCamp);

  const prevLabel  = period ? prevPeriodLabel(period, type) : "";
  const prevMeta   = prevLabel ? rowsInPeriod(DATA.metaCampanhas,   prevLabel, type) : [];
  const prevGoogle = prevLabel ? rowsInPeriod(DATA.googleCampanhas, prevLabel, type) : [];
  const kp         = consolidatedKpis([...prevMeta, ...prevGoogle]);
  const delta      = (curr, prev) => prev > 0 ? (curr - prev) / prev : null;

  // ── Visão Geral ──────────────────────────────────────────────────────────────
  const kGeral     = consolidatedKpis([...metaCamp, ...googleCamp]);
  const orgCompras = orgSeries.reduce((a, s) => a + s.compras, 0);
  const orgReceita = orgSeries.reduce((a, s) => a + s.receita, 0);
  const orgSessoes = orgSeries.reduce((a, s) => a + s.sessoes, 0);
  const mkPedidos  = sumBy(marketRows, "PEDIDOS");
  const mkReceita  = sumBy(marketRows, "RECEITA");
  const nvCompras  = sumBy(orgRows, "PEDIDOS TOTAIS DA LOJA");
  const nvReceita  = sumBy(orgRows, "RECEITA TOTAL DA LOJA");
  const comprasTot = nvCompras + mkPedidos;
  const receitaTot = nvReceita + mkReceita;
  const paidReceita = kGeral.receita;
  const ticketGeral = comprasTot ? receitaTot / comprasTot : 0;

  renderKpiBar(`kpi-rel-${s}`, [
    { label: "Investimento (pago)",       value: fmtBRL(kGeral.investimento), delta: delta(kGeral.investimento, kp.investimento), lowGood: true, icon: "💰", iconBg: "#fff8e1" },
    { label: "Compras — Todos os Canais", value: fmtNum(comprasTot),                                                                               icon: "🛍️", iconBg: "#e8f5e9" },
    { label: "ROAS (pago)",               value: kGeral.investimento ? (paidReceita / kGeral.investimento).toFixed(2) + "×" : "—", delta: delta(kGeral.roas, kp.roas), icon: "⚡", iconBg: "#e3f6f9" },
    { label: "CPA (pago)",                value: comprasTot ? fmtBRL(kGeral.investimento / comprasTot) : "—", delta: delta(kGeral.cpa, kp.cpa), lowGood: true, icon: "🎯", iconBg: "#fce4ec" },
    { label: "Ticket Médio Geral",        value: comprasTot ? fmtBRL(ticketGeral) : "—",                                                           icon: "🏷️", iconBg: "#f3e5f5" },
    { label: "Taxa de Conversão da Loja", value: fmtPct(orgSessoes ? nvCompras / orgSessoes : 0),                                                   icon: "📊", iconBg: "#e8eaf6" },
  ]);

  renderCanalTable({
    meta:        { invest: sumBy(metaCamp,   "INVESTIMENTO"), receita: sumBy(metaCamp,   "RECEITA"), pedidos: sumBy(metaCamp,   "COMPRAS") },
    google:      { invest: sumBy(googleCamp, "INVESTIMENTO"), receita: sumBy(googleCamp, "RECEITA"), pedidos: sumBy(googleCamp, "COMPRAS") },
    organico:    { invest: null, receita: orgReceita, pedidos: orgCompras },
    marketplace: { invest: null, receita: mkReceita,  pedidos: mkPedidos  },
  }, `canal-table-rel-${s}`);

  // Evolução diária combinada
  const metaD   = dailySeries(metaCamp,   ["INVESTIMENTO", "RECEITA"]);
  const googleD = dailySeries(googleCamp, ["INVESTIMENTO", "RECEITA"]);
  const mkD     = dailySeries(marketRows, ["RECEITA"]);
  const dateKeys = [...new Set([...metaD, ...googleD, ...orgSeries, ...mkD].map((d) => isoDate(d.date)))].sort();
  const combined = dateKeys.map((key) => {
    const m  = metaD.find((d) => isoDate(d.date) === key);
    const g  = googleD.find((d) => isoDate(d.date) === key);
    const o  = orgSeries.find((d) => isoDate(d.date) === key);
    const mk = mkD.find((d) => isoDate(d.date) === key);
    return {
      date:         new Date(key),
      INVESTIMENTO: (m?.INVESTIMENTO || 0) + (g?.INVESTIMENTO || 0),
      RECEITA:      (m?.RECEITA || 0) + (g?.RECEITA || 0) + (o?.receita || 0) + (mk?.RECEITA || 0),
    };
  });
  renderTrendChart(`chart-rel-${s}-evolucao`, combined);

  // ── Meta Ads ─────────────────────────────────────────────────────────────────
  const kMeta      = consolidatedKpis(metaCamp);
  const pvMeta     = sumBy(metaCamp, "PAGE VIEW");
  const txConvMeta = pvMeta ? kMeta.compras / pvMeta : 0;
  const ticketMeta = kMeta.compras ? kMeta.receita / kMeta.compras : 0;

  renderKpiBar(`kpi-rel-${s}-meta`, [
    { label: "Investimento",  value: fmtBRL(kMeta.investimento),           icon: "💰", iconBg: "#fff8e1" },
    { label: "Compras",       value: fmtNum(kMeta.compras),                icon: "🛍️", iconBg: "#e8f5e9" },
    { label: "Receita",       value: fmtBRL(kMeta.receita),                icon: "📈", iconBg: "#e8f5e9" },
    { label: "ROAS",          value: fmtRatio(kMeta.roas),                 icon: "⚡", iconBg: "#e3f6f9" },
    { label: "CPA",           value: fmtBRL(kMeta.cpa),                    icon: "🎯", iconBg: "#fce4ec" },
    { label: "CTR",           value: fmtPct(kMeta.ctr),                    icon: "👆", iconBg: "#e3f2fd" },
    { label: "Tx. Conversão", value: fmtPct(txConvMeta),                   icon: "📊", iconBg: "#e8eaf6" },
    { label: "Ticket Médio",  value: ticketMeta ? fmtBRL(ticketMeta) : "—", icon: "🏷️", iconBg: "#f3e5f5" },
  ]);

  const campInvestMap = new Map();
  metaCamp.forEach((r) => {
    const name = displayName(r);
    campInvestMap.set(name, (campInvestMap.get(name) || 0) + parseNum(r["INVESTIMENTO"]));
  });
  renderDoughnut(`chart-rel-${s}-meta-invest`, [...campInvestMap.keys()], [...campInvestMap.values()]);

  renderFunnel(`funnel-rel-${s}-meta`, [
    { label: "Impressões",        value: sumBy(metaCamp, "IMPRESSÕES") },
    { label: "Cliques",           value: sumBy(metaCamp, "CLIQUES") },
    { label: "Page View",         value: sumBy(metaCamp, "PAGE VIEW") },
    { label: "Add to Cart",       value: sumBy(metaCamp, "ADD TO CART") },
    { label: "Initiate Checkout", value: sumBy(metaCamp, "INITIATE CHECKOUT") },
    { label: "Compras",           value: sumBy(metaCamp, "COMPRAS") },
  ]);

  renderTopCreativos(`criativos-rel-${s}`, metaAnun);

  // ── Google Ads ────────────────────────────────────────────────────────────────
  const kGoogle      = consolidatedKpis(googleCamp);
  const pvGoogle     = sumBy(googleCamp, "PAGE VIEW");
  const txConvGoogle = pvGoogle ? kGoogle.compras / pvGoogle : 0;
  const ticketGoogle = kGoogle.compras ? kGoogle.receita / kGoogle.compras : 0;

  renderKpiBar(`kpi-rel-${s}-google`, [
    { label: "Investimento",  value: fmtBRL(kGoogle.investimento),             icon: "💰", iconBg: "#fff8e1" },
    { label: "Compras",       value: fmtNum(kGoogle.compras),                  icon: "🛍️", iconBg: "#e8f5e9" },
    { label: "Receita",       value: fmtBRL(kGoogle.receita),                  icon: "📈", iconBg: "#e8f5e9" },
    { label: "ROAS",          value: fmtRatio(kGoogle.roas),                   icon: "⚡", iconBg: "#e3f6f9" },
    { label: "CPA",           value: fmtBRL(kGoogle.cpa),                      icon: "🎯", iconBg: "#fce4ec" },
    { label: "CTR",           value: fmtPct(kGoogle.ctr),                      icon: "👆", iconBg: "#e3f2fd" },
    { label: "Tx. Conversão", value: fmtPct(txConvGoogle),                     icon: "📊", iconBg: "#e8eaf6" },
    { label: "Ticket Médio",  value: ticketGoogle ? fmtBRL(ticketGoogle) : "—", icon: "🏷️", iconBg: "#f3e5f5" },
  ]);

  renderFunnel(`funnel-rel-${s}-google`, [
    { label: "Impressões",          value: sumBy(googleCamp, "IMPRESSÕES") },
    { label: "Cliques",             value: sumBy(googleCamp, "CLIQUES") },
    { label: "Page View",           value: sumBy(googleCamp, "PAGE VIEW") },
    { label: "Adições ao Carrinho", value: sumBy(googleCamp, "ADIÇÕES AO CARRINHO") },
    { label: "Checkout Iniciado",   value: sumBy(googleCamp, "CHECKOUT INICIADO") },
    { label: "Compras",             value: sumBy(googleCamp, "COMPRAS") },
  ]);

  const termosRows = filter(DATA.googleTermos || []);
  const termoMap = new Map();
  termosRows.forEach((r) => {
    const t = r["TERMO"] || "";
    if (!t) return;
    if (!termoMap.has(t)) termoMap.set(t, { TERMO: t, imp: 0, cli: 0 });
    termoMap.get(t).imp += parseNum(r["IMPRESSÕES"]);
    termoMap.get(t).cli += parseNum(r["CLIQUES"]);
  });
  const topTermos = [...termoMap.values()]
    .sort((a, b) => b.cli - a.cli).slice(0, 10)
    .map((t) => ({ ...t, CTR: t.imp ? t.cli / t.imp : 0 }));
  renderTable(`table-rel-${s}-termos`, [
    { key: "TERMO", label: "Termo de Busca", fmt: (v) => v },
    { key: "imp",   label: "Impressões",     fmt: fmtNum },
    { key: "CTR",   label: "CTR",            fmt: fmtPct },
    { key: "cli",   label: "Cliques",        fmt: fmtNum },
  ], topTermos);

  // ── Marketplace ───────────────────────────────────────────────────────────────
  const mkPed2   = sumBy(marketRows, "PEDIDOS");
  const mkRec2   = sumBy(marketRows, "RECEITA");
  const mkTicket = mkPed2 > 0 ? mkRec2 / mkPed2 : 0;

  renderKpiBar(`kpi-rel-${s}-marketplace`, [
    { label: "Pedidos",      value: fmtNum(mkPed2),   icon: "📦", iconBg: "#fff3e0" },
    { label: "Receita",      value: fmtBRL(mkRec2),   icon: "📈", iconBg: "#e8f5e9" },
    { label: "Ticket Médio", value: fmtBRL(mkTicket), icon: "🏷️", iconBg: "#f3e5f5" },
  ]);

  renderTrendChart(
    `chart-rel-${s}-marketplace`,
    dailySeries(marketRows, ["PEDIDOS", "RECEITA"]),
    "PEDIDOS", "RECEITA",
    { label1: "Pedidos", color1: "#ff6300", fmtTick1: fmtNum }
  );

  // ── Top Campanhas ─────────────────────────────────────────────────────────────
  const byCamp = new Map();
  [...metaCamp, ...googleCamp].forEach((r) => {
    const key = r["CAMPANHA"] || "(sem nome)";
    if (!byCamp.has(key)) byCamp.set(key, { CAMPANHA: key, "NOME DE EXIBIÇÃO NO DASHBOARD": r["NOME DE EXIBIÇÃO NO DASHBOARD"] || "", INVESTIMENTO: 0, COMPRAS: 0, RECEITA: 0 });
    const b = byCamp.get(key);
    b.INVESTIMENTO += parseNum(r["INVESTIMENTO"]);
    b.COMPRAS      += parseNum(r["COMPRAS"]);
    b.RECEITA      += parseNum(r["RECEITA"]);
  });
  renderTable(`table-rel-${s}`, [
    { key: "CAMPANHA",     label: "Campanha",     fmt: (v, r) => displayName(r) },
    { key: "COMPRAS",      label: "Compras",      fmt: fmtNum },
    { key: "RECEITA",      label: "Receita",      fmt: fmtBRL },
    { key: "INVESTIMENTO", label: "Investimento", fmt: fmtBRL },
  ], [...byCamp.values()]);

  // ── Insights ──────────────────────────────────────────────────────────────────
  const insightPeriodField = ["Período", "PERÍODO"].find((f) => DATA.insights[0]?.[f] !== undefined) || "Período";
  const insightTypeField   = ["Tipo",    "TIPO"   ].find((f) => DATA.insights[0]?.[f] !== undefined) || "Tipo";
  const insights = (DATA.insights || []).filter(
    (i) => i[insightTypeField] === type && i[insightPeriodField] === period
  );
  renderInsights(`insights-rel-${s}`, insights);
}

function renderAll() {
  renderGeral();
  renderMeta();
  renderGoogle();
  renderMarketplace();
  renderReport("semanal");
  renderReport("mensal");
}

function setupDatePicker() {
  const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const DAY_NAMES = ["seg","ter","qua","qui","sex","sáb","dom"];

  let dpFrom = null, dpTo = null, clickStep = 0;
  const now = new Date();
  let calLeft = { year: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(),
                   month: now.getMonth() === 0 ? 11 : now.getMonth() - 1 };

  const trigger    = document.getElementById("period-trigger");
  const popup      = document.getElementById("dp-popup");
  const labelEl    = document.getElementById("period-label");
  const calsEl     = document.getElementById("dp-calendars");
  const rangeEl    = document.getElementById("dp-range-label");
  const monthsList = document.getElementById("dp-months-list");

  function fmtShort(d) {
    return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
  }
  function isSameDay(a, b) {
    return a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
  }

  // Meses do ano atual até o mês corrente
  const monthItems = [];
  for (let m = 0; m <= now.getMonth(); m++) monthItems.push({ year: now.getFullYear(), month: m });
  monthsList.innerHTML = monthItems.map(({ year, month }) =>
    `<button class="dp-month-item" data-year="${year}" data-month="${month}">${MONTHS[month]}</button>`
  ).join("");

  monthsList.querySelectorAll(".dp-month-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const y = +btn.dataset.year, m = +btn.dataset.month;
      dpFrom = new Date(y, m, 1);
      dpTo   = new Date(y, m + 1, 0, 23, 59, 59);
      clickStep = 0;
      clearActivePresets();
      btn.classList.add("active");
      render();
    });
  });

  document.querySelectorAll(".dp-preset").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = btn.dataset.preset;
      if (p === "all") { dpFrom = null; dpTo = null; }
      else if (p === "yesterday") {
        const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        dpFrom = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0);
        dpTo   = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59);
      }
      else {
        const days = +p;
        dpTo   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
        dpFrom = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1, 0, 0, 0);
      }
      clickStep = 0;
      clearActivePresets();
      btn.classList.add("active");
      render();
    });
  });

  function clearActivePresets() {
    document.querySelectorAll(".dp-preset, .dp-month-item").forEach(b => b.classList.remove("active"));
  }

  function render() {
    const r = calLeft.month === 11
      ? { year: calLeft.year + 1, month: 0 }
      : { year: calLeft.year,     month: calLeft.month + 1 };
    calsEl.innerHTML = renderCal(calLeft) + renderCal(r);

    if (dpFrom && dpTo) rangeEl.textContent = `${fmtShort(dpFrom)} → ${fmtShort(dpTo)}`;
    else if (dpFrom)    rangeEl.textContent = `${fmtShort(dpFrom)} → ?`;
    else                rangeEl.textContent = "clique em dois dias para intervalo personalizado";

    calsEl.querySelectorAll(".dp-day[data-iso]").forEach(el => {
      el.addEventListener("click", () => {
        const d = new Date(el.dataset.iso + "T12:00:00");
        if (clickStep === 0) { dpFrom = d; dpTo = null; clickStep = 1; }
        else { if (d < dpFrom) { dpTo = dpFrom; dpFrom = d; } else dpTo = d; clickStep = 0; }
        clearActivePresets();
        render();
      });
    });
    calsEl.querySelectorAll("[data-nav]").forEach(btn => {
      btn.addEventListener("click", () => {
        calLeft.month += +btn.dataset.nav;
        if (calLeft.month < 0)  { calLeft.month = 11; calLeft.year--; }
        if (calLeft.month > 11) { calLeft.month = 0;  calLeft.year++; }
        render();
      });
    });
  }

  function renderCal({ year, month }) {
    const firstDow  = new Date(year, month, 1).getDay();
    const offset    = firstDow === 0 ? 6 : firstDow - 1;
    const daysCount = new Date(year, month + 1, 0).getDate();
    let cells = "";
    for (let i = 0; i < offset; i++) cells += `<span class="dp-day empty"></span>`;
    for (let d = 1; d <= daysCount; d++) {
      const date = new Date(year, month, d);
      const iso  = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      let cls = "dp-day";
      if (isSameDay(date, dpFrom) || isSameDay(date, dpTo)) cls += " selected";
      else if (dpFrom && dpTo && date > dpFrom && date < dpTo) cls += " in-range";
      if (isSameDay(date, now)) cls += " today";
      cells += `<span class="${cls}" data-iso="${iso}">${d}</span>`;
    }
    return `<div class="dp-cal">
      <div class="dp-cal-header">
        <button class="dp-nav" data-nav="-1">‹</button>
        <strong>${MONTHS[month]} ${year}</strong>
        <button class="dp-nav" data-nav="1">›</button>
      </div>
      <div class="dp-day-names">${DAY_NAMES.map(n => `<span>${n}</span>`).join("")}</div>
      <div class="dp-days">${cells}</div>
    </div>`;
  }

  // Abre/fecha popup
  // Impede que cliques dentro do popup propaguem e fechem o calendário
  popup.addEventListener("click", (e) => e.stopPropagation());

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    if (popup.style.display !== "none") { popup.style.display = "none"; return; }
    render();
    popup.style.display = "flex";
    const rect = trigger.getBoundingClientRect();
    popup.style.top  = Math.min(rect.top, window.innerHeight - 420) + "px";
    popup.style.left = (rect.right + 10) + "px";
  });

  document.getElementById("dp-cancel").addEventListener("click", () => {
    popup.style.display = "none";
  });

  document.getElementById("dp-apply").addEventListener("click", () => {
    dateFilter = {
      from: dpFrom ? new Date(dpFrom.getFullYear(), dpFrom.getMonth(), dpFrom.getDate(), 0, 0, 0) : null,
      to:   dpTo   ? new Date(dpTo.getFullYear(),   dpTo.getMonth(),   dpTo.getDate(),   23,59,59) : null,
    };
    if (!dpFrom && !dpTo)      labelEl.textContent = "Todos os dados";
    else if (dpFrom && dpTo)   labelEl.textContent = `${fmtShort(dpFrom)} → ${fmtShort(dpTo)}`;
    else if (dpFrom)           labelEl.textContent = `A partir de ${fmtShort(dpFrom)}`;
    popup.style.display = "none";
    renderAll();
  });

  document.addEventListener("click", (e) => {
    if (!popup.contains(e.target) && e.target !== trigger && !trigger.contains(e.target)) {
      popup.style.display = "none";
    }
  });

  // Marca "Todos os dados" como ativo por padrão
  document.querySelector(".dp-preset[data-preset='all']")?.classList.add("active");
}

/* ---------------- Filtros de seção nos relatórios ---------------- */
function setupReportSectionTabs(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  panel.querySelectorAll(".rst-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      panel.querySelectorAll(".rst-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const target = btn.dataset.section;
      panel.querySelectorAll(".report-section").forEach((s) => {
        s.style.display = s.id === target ? "" : "none";
      });
    });
  });
}

/* ---------------- Boot ---------------- */
async function boot() {
  setupTabs();
  setupDatePicker();
  setupReportSectionTabs("panel-rel-semanal");
  setupReportSectionTabs("panel-rel-mensal");

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
