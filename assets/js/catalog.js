/* Al Qamar Threads — shared catalogue and browser store (used by the shop and the admin). */
(function () {
  "use strict";

  var TM = "™";
  var TOWEL_SIZES = ["Hand towel 50 × 90 cm", "Bath towel 70 × 140 cm", "Bath sheet 90 × 160 cm"];

  // Sample catalogue. Real names, sizes and prices come from WooCommerce on build.
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

  // Admin edits (name, prices, hidden, soldOut) are stored per slug and laid over the base catalogue.
  function catalog() {
    var edits = get("aqt-products", {});
    return BASE.map(function (p) {
      var e = edits[p.slug] || {};
      return {
        slug: p.slug, collection: p.collection, colour: p.colour, sizes: p.sizes, img: p.img,
        url: "product-" + p.slug + ".html",
        name: e.name || p.name,
        prices: (e.prices && e.prices.length === p.prices.length) ? e.prices : p.prices,
        hidden: !!e.hidden,
        soldOut: !!e.soldOut
      };
    });
  }
  function bySlug(slug) { return catalog().filter(function (p) { return p.slug === slug; })[0]; }

  function imgUrl(id, w) { return "https://images.unsplash.com/photo-" + id + "?auto=format&fit=crop&w=" + w + "&q=72"; }
  function money(n) { return "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fromPrice(p) {
    var min = Math.min.apply(null, p.prices);
    return (p.prices.length > 1 ? "From " : "") + "£" + (min % 1 ? min.toFixed(2) : min);
  }

  window.AQT = {
    BASE: BASE, catalog: catalog, bySlug: bySlug, get: get, set: set,
    imgUrl: imgUrl, money: money, fromPrice: fromPrice,
    SHIPPING: 3.99, FREE_OVER: 50
  };
})();
