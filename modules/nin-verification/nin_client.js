// 2AM Connect NIN lookup: POST {base}/v1/verify/raw-nin with a Bearer key.
// The response carries the whole NIMC record (photo, address, next of kin and more). Only the four fields
// needed to compare identity are kept, everything else is dropped here and never leaves this function.

export class NinProviderError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "NinProviderError";
    this.code = code; // not_configured | provider_auth | provider_balance | not_found | rate_limited | provider_down | bad_response
    this.status = status || 0;
  }
}

export function ninConfig(env = process.env) {
  const key = (env.TWOAM_API_KEY || "").trim();
  // The reason must be one of the keys from GET /v1/verify/request-reasons and must describe our real purpose.
  const reason = (env.TWOAM_REQUEST_REASON || "").trim();
  const baseUrl = (env.TWOAM_API_URL || "https://nin-api.2am.ng").trim().replace(/\/+$/, "");
  return { key, reason, baseUrl, enabled: Boolean(key && reason) };
}

export async function lookupNin({ nin, idempotencyKey, env = process.env, fetchImpl = fetch, timeoutMs = 15000 }) {
  const cfg = ninConfig(env);
  if (!cfg.enabled) throw new NinProviderError("not_configured");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(`${cfg.baseUrl}/v1/verify/raw-nin`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({ nin, requestReason: cfg.reason }),
      signal: ctrl.signal,
    });
  } catch {
    throw new NinProviderError("provider_down");
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) throw new NinProviderError("provider_auth", res.status);
  if (res.status === 402) throw new NinProviderError("provider_balance", res.status);
  if (res.status === 404) throw new NinProviderError("not_found", res.status);
  if (res.status === 429) throw new NinProviderError("rate_limited", res.status);
  if (res.status >= 500) throw new NinProviderError("provider_down", res.status);
  if (!res.ok) throw new NinProviderError("bad_response", res.status);

  let body;
  try {
    body = await res.json();
  } catch {
    throw new NinProviderError("bad_response", res.status);
  }
  const s = (v) => (typeof v === "string" ? v : "");
  const record = {
    firstName: s(body?.firstName),
    lastName: s(body?.lastName),
    middleName: s(body?.middleName),
    dateOfBirth: s(body?.dateOfBirth),
    requestId: s(body?.requestId).slice(0, 64),
  };
  if (!record.firstName || !record.lastName || !record.dateOfBirth) throw new NinProviderError("bad_response", res.status);
  return record;
}
