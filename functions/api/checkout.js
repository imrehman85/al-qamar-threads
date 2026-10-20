// POST /api/checkout — prices the bag from the database and opens a Stripe Checkout session.
import {
  json, requireEnv, HttpError, pence, shippingFor, loadProducts, stripe, encodeItems, MAX_QTY, MAX_LINES
} from "../../lib/shop.js";

export async function onRequestPost({ request, env }) {
  try {
    requireEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "STRIPE_SECRET_KEY"]);
    let body;
    try { body = await request.json(); } catch { throw new HttpError(400, "Invalid request."); }
    const raw = Array.isArray(body && body.items) ? body.items : [];
    if (!raw.length) throw new HttpError(400, "Your bag is empty.");
    if (raw.length > MAX_LINES) throw new HttpError(400, "Too many items in the bag.");

    // Merge duplicate lines and validate against live product data. Browser prices are ignored.
    const products = await loadProducts(env);
    const merged = new Map();
    for (const it of raw) {
      const p = products[it && it.slug];
      const size = Number(it && it.size), qty = Number(it && it.qty);
      if (!p || !Number.isInteger(size) || size < 0 || size >= p.sizes.length) throw new HttpError(400, "An item in your bag is no longer available.");
      if (!Number.isInteger(qty) || qty < 1) throw new HttpError(400, "Please check the quantities in your bag.");
      if (p.hidden || p.sold_out) throw new HttpError(409, `${p.name} is sold out. Please remove it from your bag.`);
      const key = p.slug + ":" + size;
      const prev = merged.get(key);
      merged.set(key, { p, slug: p.slug, size, qty: Math.min(MAX_QTY, (prev ? prev.qty : 0) + qty) });
    }
    const lines = [...merged.values()];
    const subtotal = lines.reduce((s, l) => s + l.p.prices[l.size] * l.qty, 0);
    const ship = shippingFor(subtotal);
    const origin = new URL(request.url).origin;

    const session = await stripe(env, "checkout/sessions", {
      method: "POST",
      params: {
        mode: "payment",
        currency: "gbp",
        line_items: lines.map((l) => ({
          quantity: l.qty,
          price_data: {
            currency: "gbp",
            unit_amount: pence(l.p.prices[l.size]),
            product_data: { name: l.p.name, description: `${l.p.colour} · ${l.p.sizes[l.size]}` }
          }
        })),
        shipping_address_collection: { allowed_countries: ["GB"] },
        shipping_options: [{
          shipping_rate_data: {
            type: "fixed_amount",
            display_name: ship ? "Royal Mail Tracked 48" : "Free UK delivery (Royal Mail Tracked 48)",
            fixed_amount: { amount: pence(ship), currency: "gbp" },
            delivery_estimate: { minimum: { unit: "business_day", value: 2 }, maximum: { unit: "business_day", value: 4 } }
          }
        }],
        billing_address_collection: "auto",
        metadata: { items: encodeItems(lines) },
        success_url: `${origin}/order-confirmation.html?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/cart.html`
      }
    });
    return json({ url: session.url });
  } catch (err) {
    if (!(err instanceof HttpError) || err.status >= 500) console.error("checkout", err);
    return json({ error: err instanceof HttpError ? err.message : "Checkout is not available right now." }, err.status || 500);
  }
}
