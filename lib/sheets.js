import { getAccessToken } from "./google-auth.js";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

let cache = { token: null, exp: 0 };

async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cache.token && cache.exp > now + 60) return cache.token;
  const email = process.env.SHEETS_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.SHEETS_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const token = await getAccessToken(email, privateKey, SCOPE);
  cache = { token, exp: now + 3600 };
  return token;
}

// Lê um intervalo (ex: "META ADS - CAMPANHAS!A1:Z10000") e devolve as linhas cruas.
export async function getValues(sheetId, range) {
  const token = await getToken();
  const params = new URLSearchParams({
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?${params}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    throw new Error(`Sheets API ${resp.status}: ${await resp.text()}`);
  }
  const json = await resp.json();
  return json.values || [];
}

// Converte linhas cruas (linha 1 = cabeçalho) em array de objetos { ColunaA: valor, ... }.
export function rowsToObjects(rows) {
  if (!rows.length) return [];
  const [header, ...rest] = rows;
  return rest
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => {
      const obj = {};
      header.forEach((key, i) => {
        obj[key] = row[i] ?? "";
      });
      return obj;
    });
}
