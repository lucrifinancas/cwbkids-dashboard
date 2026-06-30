import { createSessionToken, COOKIE_NAME, TTL_SECONDS } from "../lib/session.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const { password } = req.body || {};
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected || !password || password !== expected) {
    res.status(401).json({ error: "Senha incorreta." });
    return;
  }

  const token = await createSessionToken(expected);
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_SECONDS}`
  );
  res.status(200).json({ ok: true });
}
