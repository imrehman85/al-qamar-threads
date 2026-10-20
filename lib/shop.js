// Shared server helpers for the Cloudflare Pages Functions in /functions.
// Secrets come from Cloudflare environment variables, never from this file.

export const SHIPPING = 3.99;
export const FREE_OVER = 50;
export const MAX_QTY = 10;
export const MAX_LINES = 20;

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });
}

export function requireEnv(env, names) {
  const missing = names.filter((n) => !env[n]);
  if (missing.length) throw new HttpError(500, "Server is missing settings: " + missing.join(", "));
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export const pence = (n) => Math.round(Number(n) * 100);
export const shippingFor = (subtotal) => (subtotal >= FREE_OVER ? 0 : SHIPPING);

// ---------- Supabase (service role: bypasses row level security, server only) ----------
export async function supabase(env, path, { method = "GET", body, prefer } = {}) {
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
    "Content-Type": "application/json"
  };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(env.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new HttpError(502, "Database error " + res.status + ": " + text.slice(0, 300));
  return text ? JSON.parse(text) : null;
}

export async function loadProducts(env) {
  const rows = await supabase(env, "products?select=slug,name,colour,sizes,prices,hidden,sold_out");
  const map = {};
  for (const p of rows) map[p.slug] = { ...p, prices: p.prices.map(Number) };
  return map;
}

// ---------- Stripe (REST API, form-encoded) ----------
export function formEncode(value, prefix, out = []) {
  if (value === undefined || value === null) return out;
  if (Array.isArray(value)) {
    value.forEach((v, i) => formEncode(v, `${prefix}[${i}]`, out));
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) formEncode(v, prefix ? `${prefix}[${k}]` : k, out);
  } else {
    out.push(encodeURIComponent(prefix) + "=" + encodeURIComponent(String(value)));
  }
  return out;
}

export async function stripe(env, path, { method = "GET", params } = {}) {
  const res = await fetch("https://api.stripe.com/v1/" + path, {
    method,
    headers: {
      Authorization: "Bearer " + env.STRIPE_SECRET_KEY,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params ? formEncode(params).join("&") : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new HttpError(502, "Payment error: " + (data.error && data.error.message || res.status));
  return data;
}

// Verifies the Stripe-Signature header (HMAC-SHA256 of "timestamp.payload").
export async function verifyStripeSignature(payload, header, secret, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!header || !secret) return false;
  const parts = {};
  for (const item of header.split(",")) {
    const [k, v] = item.split("=");
    (parts[k] = parts[k] || []).push(v);
  }
  const t = parts.t && parts.t[0];
  const sigs = parts.v1 || [];
  if (!t || !sigs.length || Math.abs(nowSec - Number(t)) > toleranceSec) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => timingSafeEqual(s, expected));
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Compact bag stored on the Stripe session: "slug:size:qty|slug:size:qty".
export const encodeItems = (items) => items.map((l) => `${l.slug}:${l.size}:${l.qty}`).join("|");
export const decodeItems = (s) =>
  (s || "").split("|").filter(Boolean).map((x) => {
    const [slug, size, qty] = x.split(":");
    return { slug, size: Number(size), qty: Number(qty) };
  });

export function shippingAddress(session) {
  const ship = (session.collected_information && session.collected_information.shipping_details) || session.shipping_details;
  const a = ship && ship.address;
  if (!a) return { name: ship && ship.name, text: "" };
  return {
    name: ship.name,
    text: [a.line1, a.line2, a.city, a.state, a.postal_code, a.country === "GB" ? "" : a.country].filter(Boolean).join(", ")
  };
}

// ---------- Email (optional, via Resend) ----------
export async function sendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY || !env.ORDER_EMAIL_FROM || !to) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.ORDER_EMAIL_FROM, to: [].concat(to), subject, html })
  });
  if (!res.ok) console.error("Email failed", res.status, await res.text());
  return res.ok;
}

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}
export const gbp = (n) => "£" + Number(n).toFixed(2);
