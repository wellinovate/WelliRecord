import { bridgeSign, bodyString } from "../../shared/utils/bridgeSignature.js";

export const mobileApiUrl = () => (process.env.MOBILE_API_URL || "https://wellirecordmobileapp.onrender.com").replace(/\/+$/, "");
export const bridgeConfigured = () => (process.env.BRIDGE_SECRET || "").length >= 24;

/** Call the mobile backend. Never throws; a network failure is status 0. */
export async function callMobile(method, path, body, fetchImpl = fetch) {
  if (!bridgeConfigured()) return { ok: false, status: 503, message: "The bridge is not switched on." };
  const headers = { ...bridgeSign({ secret: process.env.BRIDGE_SECRET, method, path, body }) };
  const text = bodyString(body);
  if (text) headers["content-type"] = "application/json";
  try {
    const r = await fetchImpl(`${mobileApiUrl()}${path}`, { method, headers, body: text || undefined, signal: AbortSignal.timeout(15000) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, status: r.status, data: j?.data ?? j } : { ok: false, status: r.status, message: j?.message, code: j?.code };
  } catch {
    return { ok: false, status: 0, message: "The mobile service could not be reached." };
  }
}
