/* Al Qamar Threads — shared catalogue and data layer (used by the shop and the admin).
   Talks to the ASP.NET backend under /api. */
(function () {
  "use strict";

  var TM = "™";
  var TOWEL_SIZES = ["Hand towel 50 × 90 cm", "Bath towel 70 × 140 cm", "Bath sheet 90 × 160 cm"];

  // Fallback catalogue, used only if the server can't be reached. The database is the source of truth.
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

  function shape(p) {
    return {
      slug: p.slug, collection: p.collection, colour: p.colour, sizes: p.sizes, img: p.img,
      url: "product-" + p.slug + ".html", name: p.name, prices: p.prices.map(Number),
      hidden: !!p.hidden, soldOut: !!p.soldOut
    };
  }

  // JSON request helper: resolves with the body, rejects with the server's error message.
  function api(path, opts) {
    opts = opts || {};
    return fetch("/api/" + path, {
      method: opts.method || "GET",
      headers: opts.body !== undefined ? { "Content-Type": "application/json" } : {},
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin"
    }).then(function (r) {
      return r.text().then(function (t) {
        var data = null;
        try { data = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) {
          var err = new Error((data && data.error) || (r.status === 429 ? "Too many tries. Please wait a minute." : "Something went wrong. Please try again."));
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  var cache = null;
  function loadCatalog() {
    if (cache) return cache;
    cache = api("products").then(function (rows) { return rows.map(shape); }).catch(function (err) {
      console.warn("Using built-in catalogue:", err);
      cache = null;
      return BASE.map(function (p) { return shape(p); });
    });
    return cache;
  }

  function subscribe(email, source) {
    email = String(email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return Promise.reject(new Error("invalid"));
    return api("subscribe", { method: "POST", body: { email: email, source: source || "Website" } });
  }

  // The server re-prices the bag from the database and returns the saved order.
  function placeOrder(cart, customer) {
    return api("orders", {
      method: "POST",
      body: { items: cart.map(function (l) { return { slug: l.id, size: l.sizeIndex, qty: l.qty }; }), customer: customer }
    });
  }

  function imgUrl(id, w) { return "https://images.unsplash.com/photo-" + id + "?auto=format&fit=crop&w=" + w + "&q=72"; }
  function money(n) { return "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fromPrice(p) {
    var min = Math.min.apply(null, p.prices);
    return (p.prices.length > 1 ? "From " : "") + "£" + (min % 1 ? min.toFixed(2) : min);
  }

  window.AQT = {
    BASE: BASE, api: api, loadCatalog: loadCatalog, subscribe: subscribe, placeOrder: placeOrder,
    get: get, set: set, imgUrl: imgUrl, money: money, fromPrice: fromPrice,
    SHIPPING: 3.99, FREE_OVER: 50
  };
})();
