// Sessão simples por cookie assinado (HMAC-SHA256), sem libs externas.
// Usa Web Crypto (disponível tanto no runtime Node quanto Edge da Vercel).

const COOKIE_NAME = "cwbkids_session";
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 dias

function toBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return toBase64Url(sig);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(secret) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  const sig = await hmac(secret, String(exp));
  return `${exp}.${sig}`;
}

export async function verifySessionToken(token, secret) {
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  if (!expStr || !sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmac(secret, expStr);
  return timingSafeEqual(sig, expected);
}

export { COOKIE_NAME, TTL_SECONDS };
