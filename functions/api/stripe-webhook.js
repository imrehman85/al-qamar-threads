// POST /api/stripe-webhook — Stripe calls this after a payment. It saves the order and sends emails.
// Stripe dashboard → Developers → Webhooks → add endpoint https://<your-site>/api/stripe-webhook
// with the event "checkout.session.completed", then copy its signing secret into STRIPE_WEBHOOK_SECRET.
import {
  json, requireEnv, verifyStripeSignature, stripe, supabase, loadProducts, decodeItems,
  shippingAddress, sendEmail, esc, gbp
} from "../../lib/shop.js";

export async function onRequestPost({ request, env }) {
  try {
    requireEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
  } catch (err) {
    return json({ error: err.message }, 500);
  }

  const payload = await request.text();
  const ok = await verifyStripeSignature(payload, request.headers.get("Stripe-Signature"), env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return json({ error: "Invalid signature" }, 400);

  const event = JSON.parse(payload);
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return json({ received: true });
  }

  try {
    // Re-read the session from Stripe so we only trust Stripe's own data.
    const session = await stripe(env, `checkout/sessions/${encodeURIComponent(event.data.object.id)}?expand[]=line_items`);
    if (session.payment_status !== "paid") return json({ received: true, pending: true });

    const products = await loadProducts(env);
    const bag = decodeItems(session.metadata && session.metadata.items);
    const stripeLines = (session.line_items && session.line_items.data) || [];
    const items = bag.map((l, i) => {
      const p = products[l.slug] || {};
      const sl = stripeLines[i];
      return {
        id: l.slug,
        name: p.name || (sl && sl.description) || l.slug,
        size: (p.sizes && p.sizes[l.size]) || "",
        qty: l.qty,
        price: sl ? sl.price.unit_amount / 100 : (p.prices ? p.prices[l.size] : 0)
      };
    });
    const ship = shippingAddress(session);
    const customer = session.customer_details || {};
    const subtotal = session.amount_subtotal / 100;
    const total = session.amount_total / 100;

    const rows = await supabase(env, "orders?on_conflict=stripe_session_id&select=no", {
      method: "POST",
      prefer: "resolution=ignore-duplicates,return=representation",
      body: {
        status: "Processing",
        name: customer.name || ship.name || "",
        email: customer.email || "",
        address: ship.text,
        items,
        subtotal,
        shipping: Math.round((total - subtotal) * 100) / 100,
        total,
        stripe_session_id: session.id,
        stripe_payment_intent: typeof session.payment_intent === "string" ? session.payment_intent : null
      }
    });

    // A repeat delivery of the same event inserts nothing, so emails go out once.
    if (rows && rows.length) {
      const no = rows[0].no;
      const list = items.map((l) => `<tr><td>${esc(l.name)}<br><small>${esc(l.size)} × ${l.qty}</small></td><td align="right">${gbp(l.price * l.qty)}</td></tr>`).join("");
      const table = `<table width="100%" cellpadding="6" style="border-collapse:collapse">${list}
        <tr><td>Delivery</td><td align="right">${total - subtotal ? gbp(total - subtotal) : "Free"}</td></tr>
        <tr><td><b>Total</b></td><td align="right"><b>${gbp(total)}</b></td></tr></table>`;
      const first = esc((customer.name || "").split(" ")[0]);
      await sendEmail(env, {
        to: customer.email,
        subject: `Your Al Qamar Threads order ${no}`,
        html: `<div style="font-family:Georgia,serif;color:#3F3A35;max-width:520px">
          <h2 style="font-weight:400">Thank you${first ? ", " + first : ""}.</h2>
          <p>Your order <b>${esc(no)}</b> is confirmed. We pack orders within one working day and will email your tracking link.</p>
          ${table}<p>Delivering to ${esc(ship.text)}</p>
          <p style="color:#6E665E;font-size:13px">30-day returns, plus your 14-day right to cancel. Questions? Reply to this email.</p></div>`
      });
      if (env.ADMIN_EMAIL) {
        await sendEmail(env, {
          to: env.ADMIN_EMAIL,
          subject: `New order ${no} — ${gbp(total)}`,
          html: `<p>New order <b>${esc(no)}</b> from ${esc(customer.name)} (${esc(customer.email)}).</p>${table}<p>${esc(ship.text)}</p>`
        });
      }
    }
    return json({ received: true });
  } catch (err) {
    console.error("webhook", err);
    // A 500 makes Stripe retry the delivery later.
    return json({ error: "Could not save the order" }, 500);
  }
}
