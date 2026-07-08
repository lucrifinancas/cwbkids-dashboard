// Endpoint temporário de diagnóstico — remover após resolver o 502
import { getAccessToken } from "../lib/google-auth.js";

export default async function handler(req, res) {
  const steps = [];

  // 1. Variáveis de ambiente
  const email = process.env.SHEETS_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.SHEETS_PRIVATE_KEY || "";
  const sheetId = process.env.SHEETS_ID_CWBKIDS_METRICAS;

  steps.push({ step: "env", email: email || "(vazio)", keyLength: rawKey.length, sheetId: sheetId || "(vazio)" });

  // 2. Parse da chave
  const privateKey = rawKey.replace(/\\n/g, "\n");
  const keyPreview = privateKey.slice(0, 40) + "..." + privateKey.slice(-20);
  steps.push({ step: "key_parse", preview: keyPreview, newlines: (privateKey.match(/\n/g) || []).length });

  // 3. Tenta gerar token
  try {
    const token = await getAccessToken(email, privateKey, "https://www.googleapis.com/auth/spreadsheets.readonly");
    steps.push({ step: "token", ok: true, tokenPreview: token.slice(0, 20) + "..." });
  } catch (err) {
    steps.push({ step: "token", ok: false, error: String(err.message || err) });
    return res.status(200).json({ steps });
  }

  // 4. Lê cabeçalhos da aba NUVEMSHOP
  try {
    const token = await getAccessToken(email, privateKey, "https://www.googleapis.com/auth/spreadsheets.readonly");
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent("NUVEMSHOP!A1:Z3")}?valueRenderOption=UNFORMATTED_VALUE`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = await resp.json();
    steps.push({ step: "nuvemshop_headers", status: resp.status, rows: body.values || [] });
  } catch (err) {
    steps.push({ step: "nuvemshop_headers", ok: false, error: String(err.message || err) });
  }

  res.status(200).json({ steps });
}
