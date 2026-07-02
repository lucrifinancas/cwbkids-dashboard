import { verifySessionToken, COOKIE_NAME } from "../lib/session.js";
import { getValues, rowsToObjects } from "../lib/sheets.js";

const TABS = {
  metaCampanhas: "META ADS - CAMPANHAS",
  metaConjuntos: "META ADS - CONJUNTOS DE ANÚNCIO",
  metaAnuncios: "META ADS - ANÚNCIOS",
  googleCampanhas: "GOOGLE ADS - CAMPANHAS",
  googleGrupos: "GOOGLE ADS - GRUPOS DE ANÚNCIOS",
  organico: "NUVEMSHOP",
  marketplace: "MARKETPLACE",
  insights: "INSIGHTS",
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

export default async function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const valid = await verifySessionToken(cookies[COOKIE_NAME], process.env.DASHBOARD_PASSWORD);
  if (!valid) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }

  const sheetId = process.env.SHEETS_ID_CWBKIDS_METRICAS;
  if (!sheetId) {
    res.status(500).json({ error: "SHEETS_ID_CWBKIDS_METRICAS não configurado." });
    return;
  }

  try {
    const entries = await Promise.all(
      Object.entries(TABS).map(async ([key, tab]) => {
        const rows = await getValues(sheetId, `${tab}!A1:Z10000`);
        return [key, rowsToObjects(rows)];
      })
    );
    const payload = Object.fromEntries(entries);
    res.setHeader("Cache-Control", "private, max-age=60");
    res.status(200).json(payload);
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
}
