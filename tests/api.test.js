// Server tests with Stripe and Supabase mocked. Run: npm test
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { verifyStripeSignature, formEncode, encodeItems, decodeItems } from "../lib/shop.js";
import { onRequestPost as checkout } from "../functions/api/checkout.js";
import { onRequestPost as webhook } from "../functions/api/stripe-webhook.js";

const ENV = {
  SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service",
  STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_test"
};
const PRODUCTS = [
  { slug: "moon-bath-towel", name: "Moon™ Bath Towel", colour: "White", sizes: ["Hand", "Bath", "Sheet"], prices: ["14.00", "24.00", "32.00"], hidden: false, sold_out: false },
  { slug: "dune-towel-set", name: "Dune™ 3-Piece Towel Set", colour: "Apricot", sizes: ["3-piece set"], prices: ["42.00"], hidden: false, sold_out: true }
];

let calls;
beforeEach(() => { calls = []; });
function mockFetch(handler) {
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    const [status, body] = await handler(String(url), opts);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };
}
async function sign(payload, secret, t = Math.floor(Date.now() / 1000)) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  return `t=${t},v1=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}
const post = (body, headers = {}) => new Request("https://shop.test/api/x", { method: "POST", body, headers });

test("signature: accepts valid, rejects tampered, stale and missing", async () => {
  const body = '{"a":1}';
  assert.equal(await verifyStripeSignature(body, await sign(body, "s"), "s"), true);
  assert.equal(await verifyStripeSignature(body + " ", await sign(body, "s"), "s"), false);
  assert.equal(await verifyStripeSignature(body, await sign(body, "other"), "s"), false);
  assert.equal(await verifyStripeSignature(body, await sign(body, "s", 1000), "s"), false);
  assert.equal(await verifyStripeSignature(body, null, "s"), false);
});

test("formEncode nests objects and arrays like Stripe expects", () => {
  const out = formEncode({ a: 1, line_items: [{ price_data: { unit_amount: 2400 } }], shipping: { allowed: ["GB"] } }).join("&");
  assert.equal(decodeURIComponent(out), "a=1&line_items[0][price_data][unit_amount]=2400&shipping[allowed][0]=GB");
});

test("items round-trip through session metadata", () => {
  const items = [{ slug: "moon-bath-towel", size: 1, qty: 2 }];
  assert.deepEqual(decodeItems(encodeItems(items)), items);
});

test("checkout prices from the database, merges lines, ignores browser prices", async () => {
  let stripeBody = "";
  mockFetch(async (url, opts) => {
    if (url.startsWith("https://db.test/rest/v1/products")) return [200, PRODUCTS];
    if (url === "https://api.stripe.com/v1/checkout/sessions") { stripeBody = decodeURIComponent(opts.body); return [200, { url: "https://checkout.stripe.test/c/1" }]; }
    return [404, {}];
  });
  const res = await checkout({
    request: post(JSON.stringify({ items: [{ slug: "moon-bath-towel", size: 1, qty: 1, price: 0.01 }, { slug: "moon-bath-towel", size: 1, qty: 1 }] })),
    env: ENV
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).url, "https://checkout.stripe.test/c/1");
  assert.match(stripeBody, /line_items\[0\]\[quantity\]=2/);
  assert.match(stripeBody, /line_items\[0\]\[price_data\]\[unit_amount\]=2400/);
  assert.match(stripeBody, /fixed_amount\]\[amount\]=399/); // £48 < £50, so delivery is charged
  assert.match(stripeBody, /metadata\[items\]=moon-bath-towel:1:2/);
  assert.doesNotMatch(stripeBody, /line_items\[1\]/);
});

test("checkout: free delivery at £50 or more", async () => {
  let stripeBody = "";
  mockFetch(async (url, opts) => {
    if (url.includes("/products")) return [200, PRODUCTS];
    stripeBody = decodeURIComponent(opts.body); return [200, { url: "u" }];
  });
  await checkout({ request: post(JSON.stringify({ items: [{ slug: "moon-bath-towel", size: 2, qty: 2 }] })), env: ENV });
  assert.match(stripeBody, /fixed_amount\]\[amount\]=0/);
});

test("checkout rejects sold-out, unknown sizes, bad quantities and missing settings", async () => {
  mockFetch(async () => [200, PRODUCTS]);
  const run = async (items, env = ENV) => (await checkout({ request: post(JSON.stringify({ items })), env })).status;
  assert.equal(await run([{ slug: "dune-towel-set", size: 0, qty: 1 }]), 409);
  assert.equal(await run([{ slug: "moon-bath-towel", size: 7, qty: 1 }]), 400);
  assert.equal(await run([{ slug: "moon-bath-towel", size: 0, qty: 0 }]), 400);
  assert.equal(await run([{ slug: "nope", size: 0, qty: 1 }]), 400);
  assert.equal(await run([]), 400);
  assert.equal(await run([{ slug: "moon-bath-towel", size: 0, qty: 1 }], {}), 500);
});

test("webhook rejects a bad signature", async () => {
  mockFetch(async () => [500, {}]);
  const res = await webhook({ request: post("{}", { "Stripe-Signature": "t=1,v1=00" }), env: ENV });
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test("webhook saves a paid order from Stripe's own data", async () => {
  let inserted = null;
  mockFetch(async (url, opts) => {
    if (url.startsWith("https://api.stripe.com/v1/checkout/sessions/cs_test_1")) {
      return [200, {
        id: "cs_test_1", payment_status: "paid", payment_intent: "pi_1", amount_subtotal: 4800, amount_total: 5199,
        metadata: { items: "moon-bath-towel:1:2" },
        customer_details: { name: "Sam Tester", email: "sam@example.test" },
        collected_information: { shipping_details: { name: "Sam Tester", address: { line1: "1 Test St", city: "Leeds", postal_code: "LS1 1AA", country: "GB" } } },
        line_items: { data: [{ description: "Moon™ Bath Towel", quantity: 2, price: { unit_amount: 2400 } }] }
      }];
    }
    if (url.includes("/products")) return [200, PRODUCTS];
    if (url.includes("/rest/v1/orders")) { inserted = JSON.parse(opts.body); return [201, [{ no: "AQT-10001" }]]; }
    return [404, {}];
  });
  const payload = JSON.stringify({ type: "checkout.session.completed", data: { object: { id: "cs_test_1" } } });
  const res = await webhook({ request: post(payload, { "Stripe-Signature": await sign(payload, ENV.STRIPE_WEBHOOK_SECRET) }), env: ENV });
  assert.equal(res.status, 200);
  assert.equal(inserted.total, 51.99);
  assert.equal(inserted.shipping, 3.99);
  assert.equal(inserted.address, "1 Test St, Leeds, LS1 1AA");
  assert.deepEqual(inserted.items, [{ id: "moon-bath-towel", name: "Moon™ Bath Towel", size: "Bath", qty: 2, price: 24 }]);
  assert.equal(inserted.stripe_session_id, "cs_test_1");
  assert.ok(calls.some((c) => c.url.includes("on_conflict=stripe_session_id")), "insert is idempotent");
});
