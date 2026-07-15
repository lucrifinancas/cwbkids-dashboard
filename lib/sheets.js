import { getAccessToken } from "./google-auth.js";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

let cache = { token: null, exp: 0 };

async function getToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cache.token && cache.exp > now + 60) return cache.token;
  const email      = env.SHEETS_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (env.SHEETS_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const token = await getAccessToken(email, privateKey, SCOPE);
  cache = { token, exp: now + 3600 };
  return token;
}

export async function getValues(sheetId, range, env) {
  const token = await getToken(env);
  const params = new URLSearchParams({
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "SERIAL_NUMBER",
  });
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?${params}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`Sheets API ${resp.status}: ${await resp.text()}`);
  return (await resp.json()).values || [];
}

export function rowsToObjects(rows) {
  if (!rows.length) return [];
  const [header, ...rest] = rows;
  return rest
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => {
      const obj = {};
      header.forEach((key, i) => { obj[key] = row[i] ?? ""; });
      return obj;
    });
}
