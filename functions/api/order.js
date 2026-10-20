// GET /api/order?session_id=cs_... — details for the thank-you page after Stripe Checkout.
import { json, requireEnv, stripe, supabase, decodeItems, shippingAddress } from "../../lib/shop.js";

export async function onRequestGet({ request, env }) {
  try {
    requireEnv(env, ["STRIPE_SECRET_KEY"]);
    const id = new URL(request.url).searchParams.get("session_id") || "";
    if (!/^cs_[A-Za-z0-9_]+$/.test(id)) return json({ error: "Not found" }, 404);

    const s = await stripe(env, `checkout/sessions/${id}?expand[]=line_items`);
    if (s.payment_status !== "paid") return json({ error: "Payment not completed" }, 402);

    const bag = decodeItems(s.metadata && s.metadata.items);
    const items = ((s.line_items && s.line_items.data) || []).map((l, i) => ({
      name: l.description,
      qty: l.quantity,
      price: l.price.unit_amount / 100,
      size: bag[i] ? bag[i].size : null
    }));

    // The webhook may not have arrived yet; the order number is shown when it has.
    let no = null;
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      const rows = await supabase(env, `orders?select=no&stripe_session_id=eq.${encodeURIComponent(id)}`).catch(() => []);
      no = rows && rows[0] ? rows[0].no : null;
    }
    const c = s.customer_details || {};
    return json({
      no,
      fname: (c.name || "").split(" ")[0],
      email: c.email,
      address: shippingAddress(s).text,
      items,
      totals: { sub: s.amount_subtotal / 100, ship: (s.amount_total - s.amount_subtotal) / 100, total: s.amount_total / 100 }
    });
  } catch (err) {
    console.error("order", err);
    return json({ error: "Could not load the order" }, err.status || 500);
  }
}
