/* Al Qamar Threads — mock-up behaviour: nav, cart, gallery, forms */
(function () {
  "use strict";

  // Sample catalogue. Real names, sizes and prices come from WooCommerce on build.
  var PRODUCTS = {
    "moon-bath-towel": {
      name: "Moon™ Bath Towel", colour: "White", ph: "moon", url: "product-moon-bath-towel.html",
      sizes: [
        { label: "Hand towel 50 × 90 cm", price: 14 },
        { label: "Bath towel 70 × 140 cm", price: 24 },
        { label: "Bath sheet 90 × 160 cm", price: 32 }
      ]
    },
    "moon-towel-set": {
      name: "Moon™ 3-Piece Towel Set", colour: "White", ph: "moon", url: "product-moon-towel-set.html",
      sizes: [{ label: "3-piece set", price: 42 }]
    },
    "dune-bath-towel": {
      name: "Dune™ Bath Towel", colour: "Apricot", ph: "dune", url: "product-dune-bath-towel.html",
      sizes: [
        { label: "Hand towel 50 × 90 cm", price: 14 },
        { label: "Bath towel 70 × 140 cm", price: 24 },
        { label: "Bath sheet 90 × 160 cm", price: 32 }
      ]
    },
    "dune-towel-set": {
      name: "Dune™ 3-Piece Towel Set", colour: "Apricot", ph: "dune", url: "product-dune-towel-set.html",
      sizes: [{ label: "3-piece set", price: 42 }]
    }
  };
  var SHIPPING = 3.99, FREE_OVER = 50;
  var KEY = "aqt-cart";

  function money(n) { return "£" + n.toFixed(2); }
  function store(k, v) {
    try {
      if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null");
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) { return null; }
  }
  function getCart() { return store(KEY) || []; }
  function setCart(c) { store(KEY, c); updateCount(); }
  function cartTotals(cart) {
    var sub = cart.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
    var ship = sub === 0 || sub >= FREE_OVER ? 0 : SHIPPING;
    return { sub: sub, ship: ship, total: sub + ship };
  }
  function updateCount() {
    var n = getCart().reduce(function (s, i) { return s + i.qty; }, 0);
    document.querySelectorAll("[data-cart-count]").forEach(function (el) { el.textContent = n ? "(" + n + ")" : ""; });
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // Header
  var header = document.querySelector(".site-header");
  window.addEventListener("scroll", function () { header && header.classList.toggle("scrolled", window.scrollY > 8); }, { passive: true });
  var toggle = document.querySelector(".menu-toggle");
  if (toggle) toggle.addEventListener("click", function () {
    var open = document.body.classList.toggle("nav-open");
    toggle.setAttribute("aria-expanded", open);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { document.body.classList.remove("nav-open"); toggle && toggle.setAttribute("aria-expanded", "false"); closeLightbox(); }
  });

  // Reveal on scroll
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) { el.classList.add("in"); });
  }

  // Email sign-up (mock)
  document.querySelectorAll(".signup-form").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = f.parentNode.querySelector(".form-msg");
      if (msg) msg.textContent = "Thank you. We’ll be in touch, quietly.";
      f.reset();
    });
  });

  // Shop filter
  var filters = document.querySelectorAll(".filters button");
  filters.forEach(function (b) {
    b.addEventListener("click", function () {
      var f = b.getAttribute("data-filter");
      filters.forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
      document.querySelectorAll(".product-card").forEach(function (c) {
        c.hidden = f !== "all" && c.getAttribute("data-collection") !== f;
      });
    });
  });

  // Product page
  var pp = document.querySelector("[data-product]");
  if (pp) {
    var id = pp.getAttribute("data-product"), product = PRODUCTS[id], sizeIdx = product.sizes.length > 1 ? 1 : 0;
    var priceEl = document.querySelector("[data-price]"), sizeName = document.querySelector("[data-size-name]");
    function showPrice() {
      priceEl.textContent = money(product.sizes[sizeIdx].price);
      if (sizeName) sizeName.textContent = product.sizes[sizeIdx].label;
    }
    document.querySelectorAll(".size-btn").forEach(function (b, i) {
      b.addEventListener("click", function () {
        sizeIdx = i;
        document.querySelectorAll(".size-btn").forEach(function (x, j) { x.setAttribute("aria-checked", j === i); });
        showPrice();
      });
    });
    showPrice();

    var qtyInput = document.querySelector(".qty input");
    document.querySelectorAll("[data-qty]").forEach(function (b) {
      b.addEventListener("click", function () {
        var v = Math.max(1, Math.min(10, (parseInt(qtyInput.value, 10) || 1) + parseInt(b.getAttribute("data-qty"), 10)));
        qtyInput.value = v;
      });
    });

    document.querySelector("[data-add]").addEventListener("click", function () {
      var qty = Math.max(1, Math.min(10, parseInt(qtyInput.value, 10) || 1));
      var size = product.sizes[sizeIdx];
      var cart = getCart();
      var line = cart.filter(function (l) { return l.id === id && l.size === size.label; })[0];
      if (line) line.qty = Math.min(10, line.qty + qty);
      else cart.push({ id: id, name: product.name, colour: product.colour, size: size.label, price: size.price, qty: qty, ph: product.ph, url: product.url });
      setCart(cart);
      document.querySelector(".added-msg").innerHTML = "Added to your bag. <a class=\"text-link\" href=\"cart.html\">View bag</a>";
    });

    // Gallery
    var main = document.querySelector(".gallery-main .ph");
    document.querySelectorAll(".gallery-thumbs button").forEach(function (b) {
      b.addEventListener("click", function () {
        document.querySelectorAll(".gallery-thumbs button").forEach(function (x) { x.setAttribute("aria-current", x === b); });
        var src = b.querySelector(".ph");
        main.className = src.className.replace("ratio-11", "ratio-45");
        main.querySelector(".ph-note").innerHTML = src.querySelector(".ph-note").innerHTML;
      });
    });
  }

  // Lightbox (zoom)
  var lb = document.querySelector(".lightbox");
  function closeLightbox() { if (lb) lb.classList.remove("open"); }
  var gm = document.querySelector(".gallery-main");
  if (gm && lb) {
    function openLb() {
      var src = gm.querySelector(".ph");
      var target = lb.querySelector(".ph");
      target.className = src.className.replace("ratio-45", "");
      target.querySelector(".ph-note").innerHTML = src.querySelector(".ph-note").innerHTML;
      lb.classList.add("open");
      lb.querySelector(".lightbox-close").focus();
    }
    gm.addEventListener("click", openLb);
    gm.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLb(); } });
    lb.addEventListener("click", function (e) { if (e.target === lb || e.target.classList.contains("lightbox-close")) closeLightbox(); });
  }

  function phHTML(kind) { return '<div class="ph ph--' + kind + '"><span class="ph-note">Product photo</span></div>'; }

  // Cart page
  var cartRoot = document.querySelector("[data-cart]");
  function renderCart() {
    var cart = getCart();
    if (!cart.length) {
      cartRoot.innerHTML = '<div class="empty"><p class="lede" style="margin:0 auto 32px">Your bag is empty.</p><a class="btn" href="shop.html">Shop the collection</a></div>';
      return;
    }
    var t = cartTotals(cart);
    var left = Math.max(0, FREE_OVER - t.sub);
    var items = cart.map(function (l, i) {
      return '<div class="cart-item">' +
        '<a href="' + esc(l.url) + '" aria-hidden="true" tabindex="-1">' + phHTML(l.ph) + '</a>' +
        '<div><h3><a href="' + esc(l.url) + '">' + esc(l.name) + '</a></h3>' +
        '<p class="meta">' + esc(l.colour) + ' · ' + esc(l.size) + ' · ' + money(l.price) + '</p>' +
        '<div class="qty" role="group" aria-label="Quantity for ' + esc(l.name) + '"><button type="button" data-line="' + i + '" data-d="-1" aria-label="Decrease">−</button>' +
        '<input type="text" value="' + l.qty + '" readonly aria-label="Quantity"><button type="button" data-line="' + i + '" data-d="1" aria-label="Increase">+</button></div>' +
        '<button type="button" class="remove" data-remove="' + i + '">Remove</button></div>' +
        '<div class="line-total">' + money(l.price * l.qty) + '</div></div>';
    }).join("");
    cartRoot.innerHTML =
      '<div class="cart-layout"><div class="cart-items">' + items + '</div>' +
      '<aside class="summary" aria-label="Order summary"><h2>Summary</h2>' +
      '<div class="free-bar">' + (left > 0 ? "You are " + money(left) + " away from free UK delivery." : "Your order qualifies for free UK delivery.") +
      '<div class="track"><div class="fill" style="width:' + Math.min(100, t.sub / FREE_OVER * 100) + '%"></div></div></div>' +
      '<div class="sum-row"><span>Subtotal</span><span>' + money(t.sub) + '</span></div>' +
      '<div class="sum-row"><span>Delivery <small>(Royal Mail Tracked 48)</small></span><span>' + (t.ship ? money(t.ship) : "Free") + '</span></div>' +
      '<div class="sum-row total"><span>Total</span><span>' + money(t.total) + '</span></div>' +
      '<p class="sum-note">No VAT is charged. We are not VAT-registered.</p>' +
      '<a class="btn btn--block" href="checkout.html">Checkout</a>' +
      '<p class="legal-links">30-day returns and your 14-day right to cancel. <a href="shipping-returns.html">Shipping &amp; Returns</a></p></aside></div>';
  }
  if (cartRoot) {
    renderCart();
    cartRoot.addEventListener("click", function (e) {
      var cart = getCart(), b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-remove")) cart.splice(+b.getAttribute("data-remove"), 1);
      else if (b.hasAttribute("data-line")) {
        var l = cart[+b.getAttribute("data-line")];
        l.qty = Math.max(1, Math.min(10, l.qty + +b.getAttribute("data-d")));
      } else return;
      setCart(cart); renderCart();
    });
  }

  // Checkout summary — product name only
  var co = document.querySelector("[data-checkout-summary]");
  if (co) {
    var cart = getCart(), t = cartTotals(cart);
    if (!cart.length) {
      co.innerHTML = '<p class="sum-note">Your bag is empty. <a class="text-link" href="shop.html">Shop the collection</a></p>';
    } else {
      co.innerHTML = cart.map(function (l) {
        return '<div class="mini-item"><span>' + esc(l.name) + (l.qty > 1 ? " × " + l.qty : "") + '</span><span>' + money(l.price * l.qty) + '</span></div>';
      }).join("") +
        '<div class="sum-row" style="border-top:1px solid var(--line);margin-top:12px;padding-top:18px"><span>Subtotal</span><span>' + money(t.sub) + '</span></div>' +
        '<div class="sum-row"><span>Delivery</span><span>' + (t.ship ? money(t.ship) : "Free") + '</span></div>' +
        '<div class="sum-row total"><span>Total</span><span>' + money(t.total) + '</span></div>';
    }
    var form = document.querySelector(".checkout-form");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!getCart().length) { window.location.href = "shop.html"; return; }
      var order = {
        no: "AQT-" + String(Math.floor(10000 + Math.random() * 89999)),
        email: form.email.value, name: form.fname.value,
        address: [form.address1.value, form.city.value, form.postcode.value].filter(Boolean).join(", "),
        items: getCart(), totals: cartTotals(getCart())
      };
      try { sessionStorage.setItem("aqt-order", JSON.stringify(order)); } catch (err) {}
      setCart([]);
      window.location.href = "order-confirmation.html";
    });
    document.querySelectorAll(".pay-btn").forEach(function (b) {
      b.addEventListener("click", function () { form.requestSubmit ? form.requestSubmit() : form.submit(); });
    });
  }

  // Confirmation
  var conf = document.querySelector("[data-confirmation]");
  if (conf) {
    var o = null;
    try { o = JSON.parse(sessionStorage.getItem("aqt-order") || "null"); } catch (e) {}
    if (o) {
      conf.innerHTML =
        '<p class="eyebrow">Order ' + esc(o.no) + '</p>' +
        '<h1>Thank you, ' + esc(o.name || "") + '.</h1>' +
        '<p class="lede">Your order is confirmed. A receipt is on its way to ' + esc(o.email) + '.</p>' +
        '<div class="summary" style="text-align:left;margin:48px 0">' +
        o.items.map(function (l) { return '<div class="mini-item"><span>' + esc(l.name) + (l.qty > 1 ? " × " + l.qty : "") + '</span><span>' + money(l.price * l.qty) + '</span></div>'; }).join("") +
        '<div class="sum-row"><span>Delivery</span><span>' + (o.totals.ship ? money(o.totals.ship) : "Free") + '</span></div>' +
        '<div class="sum-row total"><span>Total paid</span><span>' + money(o.totals.total) + '</span></div>' +
        (o.address ? '<p class="sum-note" style="margin-bottom:0">Delivering to ' + esc(o.address) + '</p>' : "") + '</div>';
    }
  }

  updateCount();
})();
