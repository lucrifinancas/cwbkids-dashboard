import crypto from "node:crypto";

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

// Troca as credenciais de uma service account do Google por um access token
// (fluxo JWT-bearer), sem depender da lib googleapis — só `node:crypto` e `fetch`.
export async function getAccessToken(email, privateKeyPem, scope) {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(signingInput), privateKeyPem)
    .toString("base64url");
  const jwt = `${signingInput}.${signature}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!resp.ok) {
    throw new Error(`Falha ao obter access token do Google: ${resp.status} ${await resp.text()}`);
  }
  const json = await resp.json();
  return json.access_token;
}
