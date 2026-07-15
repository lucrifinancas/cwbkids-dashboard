import { createSessionToken, COOKIE_NAME, TTL_SECONDS } from "../../lib/session.js";

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json().catch(() => ({}));
  const { password } = body;
  const expected = env.DASHBOARD_PASSWORD;

  if (!expected || !password || password !== expected) {
    return new Response(JSON.stringify({ error: "Senha incorreta." }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const token = await createSessionToken(expected);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${TTL_SECONDS}`,
    },
  });
}
