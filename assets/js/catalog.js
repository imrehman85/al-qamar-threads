/* Al Qamar Threads — shared catalogue and data layer (used by the shop and the admin).
   Live mode: products and sign-ups go to Supabase, payment goes through Stripe (/api/*).
   Demo mode (no Supabase settings in config.js): everything is kept in this browser. */
(function () {
  "use strict";

  var TM = "™";
  var TOWEL_SIZES = ["Hand towel 50 × 90 cm", "Bath towel 70 × 140 cm", "Bath sheet 90 × 160 cm"];
  var CFG = window.AQT_CONFIG || {};
  var LIVE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);

  // Fallback catalogue, also the demo data. In live mode the products table is the source of truth.
  var BASE = [
    { slug: "moon-bath-towel", collection: "moon", name: "Moon" + TM + " Bath Towel", colour: "White",
      sizes: TOWEL_SIZES, prices: [14, 24, 32], img: "1527986654082-0b5b3fef2632" },
    { slug: "moon-towel-set", collection: "moon", name: "Moon" + TM + " 3-Piece Towel Set", colour: "White",
      sizes: ["3-piece set"], prices: [42], img: "1760722974657-f64bce2f9cc5" },
    { slug: "dune-bath-towel", collection: "dune", name: "Dune" + TM + " Bath Towel", colour: "Apricot",
      sizes: TOWEL_SIZES, prices: [14, 24, 32], img: "1664227431098-1289c13695c1" },
    { slug: "dune-towel-set", collection: "dune", name: "Dune" + TM + " 3-Piece Towel Set", colour: "Apricot",
      sizes: ["3-piece set"], prices: [42], img: "1625479969471-c0a79753d2d3" }
  ];

  function get(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
  }
  function set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  function shape(p, e) {
    e = e || {};
    return {
      slug: p.slug, collection: p.collection, colour: p.colour, sizes: p.sizes, img: p.img,
      url: "product-" + p.slug + ".html",
      name: e.name || p.name,
      prices: ((e.prices && e.prices.length === p.prices.length) ? e.prices : p.prices).map(Number),
      hidden: !!(e.hidden != null ? e.hidden : p.hidden),
      soldOut: !!(e.soldOut != null ? e.soldOut : p.sold_out)
    };
  }

  // Demo mode: admin edits are stored per slug and laid over the base catalogue.
  function demoCatalog() {
    var edits = get("aqt-products", {});
    return BASE.map(function (p) { return shape(p, edits[p.slug]); });
  }

  function rest(path, opts) {
    opts = opts || {};
    var headers = { apikey: CFG.supabaseAnonKey, Authorization: "Bearer " + CFG.supabaseAnonKey };
    for (var k in (opts.headers || {})) headers[k] = opts.headers[k];
    return fetch(CFG.supabaseUrl.replace(/\/$/, "") + "/rest/v1/" + path, { method: opts.method || "GET", headers: headers, body: opts.body });
  }

  var cache = null;
  function loadCatalog() {
    if (!LIVE) return Promise.resolve(demoCatalog());
    if (cache) return cache;
    cache = rest("products?select=*&order=sort.asc")
      .then(function (r) { if (!r.ok) throw new Error("products " + r.status); return r.json(); })
      .then(function (rows) { return rows.map(function (p) { return shape(p); }); })
      .catch(function (err) {
        console.warn("Using built-in catalogue:", err);
        cache = null;
        return BASE.map(function (p) { return shape(p); });
      });
    return cache;
  }

  // Email sign-up. Duplicate emails count as success.
  function subscribe(email, source) {
    email = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return Promise.reject(new Error("invalid"));
    if (!LIVE) {
      var subs = get("aqt-subscribers", []);
      if (!subs.some(function (s) { return s.email.toLowerCase() === email; })) {
        subs.unshift({ email: email, date: new Date().toISOString(), source: source || "Website" });
        set("aqt-subscribers", subs);
      }
      return Promise.resolve();
    }
    // Plain insert: a duplicate email comes back as 409, which counts as already signed up.
    return rest("subscribers", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ email: email, source: source || "Website" })
    }).then(function (r) { if (!r.ok && r.status !== 409) throw new Error("subscribe " + r.status); });
  }

  // Live checkout: the server re-prices the bag from the database and returns a Stripe Checkout URL.
  function startCheckout(cart) {
    return fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart.map(function (l) { return { slug: l.id, size: l.sizeIndex, qty: l.qty }; }) })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok || !data.url) throw new Error(data.error || "Checkout is not available right now.");
        return data.url;
      });
    });
  }

  function imgUrl(id, w) { return "https://images.unsplash.com/photo-" + id + "?auto=format&fit=crop&w=" + w + "&q=72"; }
  function money(n) { return "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fromPrice(p) {
    var min = Math.min.apply(null, p.prices);
    return (p.prices.length > 1 ? "From " : "") + "£" + (min % 1 ? min.toFixed(2) : min);
  }

  window.AQT = {
    LIVE: LIVE, CONFIG: CFG, BASE: BASE,
    loadCatalog: loadCatalog, demoCatalog: demoCatalog, subscribe: subscribe, startCheckout: startCheckout,
    get: get, set: set, imgUrl: imgUrl, money: money, fromPrice: fromPrice,
    SHIPPING: 3.99, FREE_OVER: 50
  };
})();
