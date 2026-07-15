import { verifySessionToken, COOKIE_NAME } from "../../lib/session.js";
import { getValues, rowsToObjects } from "../../lib/sheets.js";

const TABS = {
  metaCampanhas: "META ADS - CAMPANHAS",
  metaConjuntos: "META ADS - CONJUNTOS DE ANÚNCIO",
  metaAnuncios:  "META ADS - ANÚNCIOS",
  googleCampanhas: "GOOGLE ADS - CAMPANHAS",
  googleGrupos:    "GOOGLE ADS - GRUPOS DE ANÚNCIOS",
  googleTermos:    "GOOGLE ADS - TERMOS DE BUSCA",
  organico:    "NUVEMSHOP",
  marketplace: "MARKETPLACE",
  insights:    "INSIGHTS",
};

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

export async function onRequest(context) {
  const { request, env } = context;

  const cookies = parseCookies(request.headers.get("Cookie") || "");
  const valid = await verifySessionToken(cookies[COOKIE_NAME], env.DASHBOARD_PASSWORD);
  if (!valid) return json({ error: "Não autenticado." }, 401);

  const sheetId = env.SHEETS_ID_CWBKIDS_METRICAS;
  if (!sheetId) return json({ error: "SHEETS_ID_CWBKIDS_METRICAS não configurado." }, 500);

  try {
    const entries = await Promise.all(
      Object.entries(TABS).map(async ([key, tab]) => {
        try {
          const rows = await getValues(sheetId, `${tab}!A1:AA10000`, env);
          return [key, rowsToObjects(rows)];
        } catch (err) {
          return [key, { _error: String(err.message || err) }];
        }
      })
    );
    return json(Object.fromEntries(entries), 200, { "Cache-Control": "no-store" });
  } catch (err) {
    return json({ error: String(err.message || err) }, 502);
  }
}
